import { describe, expect, it } from "vitest"
import { createCommerceSeed } from "../commerce-data/commerce-seed"
import {
  buildCustomerRows,
  createCustomerListModel,
  parseSafeCustomerUrlFilters,
  serializeSafeCustomerUrlFilters,
  type CustomerListFilters,
} from "./customer-list-model"

const initialFilters: CustomerListFilters = {
  query: "",
  status: "all",
  segment: "all",
  region: "all",
  tag: "all",
  period: "all",
  currency: "USD",
  minimumSpend: null,
  maximumSpend: null,
  sort: "activity-desc",
}

describe("customer list model", () => {
  it("combines identity, lifecycle, safe tag, activity, and spend filters", () => {
    const seed = createCommerceSeed()
    const rows = buildCustomerRows(seed.customers, seed.orders, seed.activities)
    const target = rows.find(
      ({ customer, lifetimeSpend }) =>
        customer.segment === "vip" &&
        customer.region === "north" &&
        lifetimeSpend.USD > 0
    )
    if (!target) throw new Error("Expected filter fixture.")

    const model = createCustomerListModel(
      rows,
      {
        ...initialFilters,
        query: target.customer.contact.email.toUpperCase(),
        status: target.customer.status,
        segment: target.customer.segment,
        region: target.customer.region,
        tag: "high_value",
        minimumSpend: Math.max(0, target.lifetimeSpend.USD - 1),
        maximumSpend: target.lifetimeSpend.USD + 1,
      },
      1,
      15,
      new Date("2026-08-30T00:00:00.000Z")
    )

    expect(model.items.map(({ customer }) => customer.id)).toEqual([
      target.customer.id,
    ])
  })

  it("sorts and paginates customer summaries", () => {
    const seed = createCommerceSeed()
    const model = createCustomerListModel(
      buildCustomerRows(seed.customers, seed.orders, seed.activities),
      { ...initialFilters, sort: "id-asc" },
      2,
      10
    )
    expect(model.page).toBe(2)
    expect(model.pageCount).toBe(3)
    expect(model.items[0].customer.id).toBe("CUST-1011")
  })

  it("filters UI-only custom tags without serializing them to the URL", () => {
    const seed = createCommerceSeed()
    const customer = {
      ...seed.customers[0],
      tags: [
        ...seed.customers[0].tags,
        { kind: "custom" as const, value: "care" },
      ],
    }
    const model = createCustomerListModel(
      buildCustomerRows([customer], seed.orders, seed.activities),
      { ...initialFilters, tag: "care" },
      1
    )
    expect(model.items[0].customer.id).toBe(customer.id)
    expect(
      serializeSafeCustomerUrlFilters({
        ...initialFilters,
        tag: "care",
      }).toString()
    ).toBe("")
  })

  it("hydrates only allowlisted URL filters and strips sensitive keys", () => {
    const parsed = parseSafeCustomerUrlFilters(
      new URLSearchParams(
        "segment=vip&region=north&status=active&period=90d&email=secret%40example.test&customerId=CUST-1001&tag=private"
      )
    )
    expect(parsed).toEqual({
      segment: "vip",
      region: "north",
      status: "active",
      period: "90d",
    })
    expect(serializeSafeCustomerUrlFilters(parsed).toString()).toBe(
      "status=active&segment=vip&region=north&period=90d"
    )
  })
})
