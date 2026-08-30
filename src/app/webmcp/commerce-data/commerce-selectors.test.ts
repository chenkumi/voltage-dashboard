import { describe, expect, it } from "vitest"
import { createDummyJsonProductSeed } from "../products/product-seed"
import { createCommerceSeed } from "./commerce-seed"
import {
  selectActiveCustomers,
  selectCustomerMetrics,
  selectOrderLines,
} from "./commerce-selectors"

describe("commerce selectors", () => {
  it("keeps native currencies separate in customer totals", () => {
    const products = createDummyJsonProductSeed()
    const snapshot = createCommerceSeed([
      products[0],
      {
        ...products[1],
        id: 9_001,
        sku: "TWD-SEED-001",
        price: { amount: 1_280, currency: "TWD" },
      },
    ])
    const customer = snapshot.customers.find((item) => {
      const currencies = new Set(
        snapshot.orders
          .filter((order) => order.customerId === item.id)
          .map((order) => order.amounts.total.currency)
      )
      return currencies.size > 1
    })!
    const metrics = selectCustomerMetrics(snapshot, customer.id)

    expect(metrics?.orderCount).toBeGreaterThan(1)
    expect(metrics?.lifetimeValueByCurrency.USD).toBeGreaterThan(0)
    expect(metrics?.lifetimeValueByCurrency.TWD).toBeGreaterThan(0)
    for (const amount of Object.values(
      metrics?.lifetimeValueByCurrency ?? {}
    )) {
      expect(Number(amount?.toFixed(2))).toBe(amount)
    }
  })

  it("selects active customers and order lines without mutating the snapshot", () => {
    const snapshot = createCommerceSeed()
    const order = snapshot.orders[0]

    expect(selectActiveCustomers(snapshot)).not.toContainEqual(
      expect.objectContaining({ status: "suspended" })
    )
    expect(selectOrderLines(snapshot, order.id)).toHaveLength(
      snapshot.orderLines.filter((line) => line.orderId === order.id).length
    )
  })
})
