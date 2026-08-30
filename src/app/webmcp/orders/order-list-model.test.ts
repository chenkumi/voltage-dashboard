import { describe, expect, it } from "vitest"
import type { Order } from "../commerce-data/types"
import {
  createOrderListModel,
  type OrderListFilters,
  type OrderListRow,
} from "./order-list-model"

const order = (index: number): Order => ({
  id: `VM-${25000 + index}`,
  customerId: `C-${index}`,
  customerSnapshot: {
    segment: index % 2 ? "vip" : "returning",
    region: index % 2 ? "north" : "south",
  },
  status: index % 2 ? "action_needed" : "delivered",
  paymentStatus: index % 2 ? "failed" : "paid",
  paymentMethodCategory: "card",
  fulfillmentStatus: index % 2 ? "exception" : "fulfilled",
  amounts: {
    subtotal: { amount: index * 100, currency: "TWD" },
    discount: { amount: 0, currency: "TWD" },
    shipping: { amount: 0, currency: "TWD" },
    tax: { amount: 0, currency: "TWD" },
    total: { amount: index * 100, currency: "TWD" },
  },
  timeline: [],
  createdAt: `2026-08-${String(index).padStart(2, "0")}T00:00:00.000Z`,
  updatedAt: `2026-08-${String(index).padStart(2, "0")}T01:00:00.000Z`,
})

const filters: OrderListFilters = {
  query: "",
  dateFrom: "",
  dateTo: "",
  status: "all",
  paymentStatus: "all",
  fulfillmentStatus: "all",
  segment: "all",
  region: "all",
  currency: "all",
  minimumAmount: null,
  maximumAmount: null,
  sort: "updated-desc",
}

const row = (index: number): OrderListRow => ({
  order: order(index),
  customer: null,
  lines: [],
  relatedCaseIds: [],
})

describe("order list model", () => {
  it("combines order, date, status, customer, and amount filters", () => {
    const model = createOrderListModel(
      [row(1), row(2), row(3)],
      {
        ...filters,
        query: "25003",
        dateFrom: "2026-08-02",
        dateTo: "2026-08-03",
        status: "action_needed",
        paymentStatus: "failed",
        fulfillmentStatus: "exception",
        segment: "vip",
        region: "north",
        currency: "TWD",
        minimumAmount: 250,
        maximumAmount: 350,
      },
      1
    )

    expect(model.items.map(({ order }) => order.id)).toEqual(["VM-25003"])
  })

  it("sorts amounts and clamps pagination", () => {
    const model = createOrderListModel(
      [row(1), row(2), row(3)],
      { ...filters, sort: "amount-asc" },
      99,
      2
    )

    expect(model.page).toBe(2)
    expect(model.pageCount).toBe(2)
    expect(model.items[0].order.id).toBe("VM-25003")
  })

  it("applies amount ranges within the selected native currency", () => {
    const usdRow = row(2)
    usdRow.order.amounts.total.currency = "USD"

    const model = createOrderListModel(
      [row(1), usdRow, row(3)],
      {
        ...filters,
        currency: "USD",
        minimumAmount: 150,
        maximumAmount: 250,
      },
      1
    )

    expect(model.items.map(({ order }) => order.id)).toEqual(["VM-25002"])
  })

  it("groups mixed currencies before sorting their native amounts", () => {
    const twdRow = row(9)
    const usdLow = row(2)
    const usdHigh = row(3)
    usdLow.order.amounts.total.currency = "USD"
    usdHigh.order.amounts.total.currency = "USD"

    const model = createOrderListModel(
      [usdHigh, twdRow, usdLow],
      { ...filters, sort: "amount-asc" },
      1
    )

    expect(model.items.map(({ order }) => order.id)).toEqual([
      "VM-25009",
      "VM-25002",
      "VM-25003",
    ])
  })
})
