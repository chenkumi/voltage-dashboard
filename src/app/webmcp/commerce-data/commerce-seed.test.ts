import { describe, expect, it } from "vitest"
import { createDummyJsonProductSeed } from "../products/product-seed"
import { createCommerceSeed } from "./commerce-seed"

describe("createCommerceSeed", () => {
  it("creates deterministic, relational data spanning at least 13 months", () => {
    const first = createCommerceSeed()
    const second = createCommerceSeed()
    const orderMonths = new Set(
      first.orders.map((order) => order.createdAt.slice(0, 7))
    )
    const customerIds = new Set(first.customers.map((customer) => customer.id))
    const productIds = new Set(
      createDummyJsonProductSeed().map((product) => product.id)
    )

    expect(first).toEqual(second)
    expect(orderMonths.size).toBeGreaterThanOrEqual(13)
    expect(first.customers.length).toBeGreaterThanOrEqual(20)
    expect(
      first.orders.every((order) => customerIds.has(order.customerId))
    ).toBe(true)
    expect(
      first.orderLines.every((line) => productIds.has(line.productId))
    ).toBe(true)
    expect(
      new Set(first.orders.map((order) => order.amounts.total.currency))
    ).toEqual(new Set(["USD"]))
  })

  it("keeps line snapshots and amount breakdowns internally consistent", () => {
    const snapshot = createCommerceSeed()
    for (const order of snapshot.orders) {
      const lines = snapshot.orderLines.filter(
        (line) => line.orderId === order.id
      )
      const subtotal = lines.reduce(
        (total, line) => total + line.subtotal.amount,
        0
      )
      const expectedTotal =
        order.amounts.subtotal.amount -
        order.amounts.discount.amount +
        order.amounts.shipping.amount +
        order.amounts.tax.amount

      expect(order.amounts.subtotal.amount).toBeCloseTo(subtotal, 2)
      expect(order.amounts.total.amount).toBeCloseTo(expectedTotal, 2)
      for (const line of lines) {
        expect(line.subtotal.amount).toBeCloseTo(
          line.unitPrice.amount * line.quantity - line.discount.amount,
          2
        )
        expect(line.subtotal.currency).toBe(order.amounts.total.currency)
      }
    }
  })

  it("preserves source product currencies without exchange-rate conversion", () => {
    const products = createDummyJsonProductSeed()
    const usdProduct = {
      ...products[0],
      price: { amount: 1.005, currency: "USD" as const },
    }
    const twdProduct = {
      ...products[1],
      id: 9_001,
      sku: "TWD-SEED-001",
      price: { amount: 1_280, currency: "TWD" as const },
    }
    const snapshot = createCommerceSeed([usdProduct, twdProduct])
    const productsById = new Map(
      [usdProduct, twdProduct].map((product) => [product.id, product])
    )

    expect(
      new Set(snapshot.orders.map((order) => order.amounts.total.currency))
    ).toEqual(new Set(["USD", "TWD"]))
    for (const line of snapshot.orderLines) {
      expect(line.unitPrice).toEqual(productsById.get(line.productId)?.price)
    }
  })

  it("keeps suspended customer timestamps and audit activity consistent", () => {
    const snapshot = createCommerceSeed()
    const suspended = snapshot.customers.find(
      (customer) => customer.status === "suspended"
    )!

    expect(suspended.updatedAt).toBe(suspended.suspendedAt)
    expect(snapshot.activities).toContainEqual(
      expect.objectContaining({
        customerId: suspended.id,
        type: "customer_suspended",
        occurredAt: suspended.suspendedAt,
      })
    )
  })

  it("keeps every order customer snapshot consistent with its customer", () => {
    const snapshot = createCommerceSeed()
    const customers = new Map(
      snapshot.customers.map((customer) => [customer.id, customer])
    )

    for (const order of snapshot.orders) {
      const customer = customers.get(order.customerId)
      expect(order.customerSnapshot).toEqual({
        region: customer?.region,
        segment: customer?.segment,
      })
    }
  })
})
