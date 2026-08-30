import { describe, expect, it } from "vitest"
import { createCommerceSeed } from "../commerce-data/commerce-seed"
import { createInventoryMovementSeed } from "./inventory-seed"
import {
  selectAverageDailySales,
  selectInventoryPeriodSummary,
  selectInventoryRisks,
} from "./inventory-selectors"

describe("inventory selectors", () => {
  it("summarizes week, month, year and previous periods", () => {
    const movements = [
      {
        id: "INV-A",
        productId: 1,
        type: "receipt" as const,
        reasonCode: "purchase_receipt" as const,
        previousStock: 10,
        nextStock: 15,
        delta: 5,
        occurredAt: "2026-07-10T00:00:00.000Z",
        source: "seed" as const,
        note: null,
      },
      {
        id: "INV-B",
        productId: 1,
        type: "issue" as const,
        reasonCode: "customer_order" as const,
        previousStock: 15,
        nextStock: 12,
        delta: -3,
        occurredAt: "2026-08-10T00:00:00.000Z",
        source: "seed" as const,
        note: null,
      },
    ]
    const summary = selectInventoryPeriodSummary(
      1,
      movements,
      "month",
      new Date("2026-08-15T00:00:00.000Z")
    )

    expect(summary).toMatchObject({
      openingStock: 15,
      closingStock: 12,
      issued: 3,
      netChange: -3,
      previousClosingStock: 15,
      previousNetChange: 5,
      dataStatus: "ready",
    })
  })

  it("reports insufficient period and sales history explicitly", () => {
    const summary = selectInventoryPeriodSummary(
      1,
      [],
      "week",
      new Date("2026-08-30T00:00:00.000Z")
    )
    const sales = selectAverageDailySales(
      999,
      [],
      [],
      new Date("2026-08-30T00:00:00.000Z")
    )

    expect(summary.dataStatus).toBe("insufficient_history")
    expect(summary.changeRate).toBeNull()
    expect(sales).toEqual({
      status: "insufficient_history",
      unitsPerDay: null,
    })
  })

  it("treats a quiet period with a known prior closing balance as ready", () => {
    const summary = selectInventoryPeriodSummary(
      1,
      [
        {
          id: "INV-QUIET",
          productId: 1,
          type: "receipt",
          reasonCode: "purchase_receipt",
          previousStock: 4,
          nextStock: 10,
          delta: 6,
          occurredAt: "2026-06-15T00:00:00.000Z",
          source: "seed",
          note: null,
        },
      ],
      "month",
      new Date("2026-07-15T00:00:00.000Z")
    )

    expect(summary).toMatchObject({
      dataStatus: "ready",
      openingStock: 10,
      closingStock: 10,
      netChange: 0,
    })
  })

  it("calculates sales velocity, supply days, and explicit risk thresholds", () => {
    const commerce = createCommerceSeed()
    const latestOrderId = commerce.orders
      .filter((order) => order.status !== "action_needed")
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .at(-1)!.id
    const target = commerce.orderLines.find(
      (line) => line.orderId === latestOrderId
    )!.productId
    const sales = selectAverageDailySales(
      target,
      commerce.orders,
      commerce.orderLines,
      new Date("2026-09-01T00:00:00.000Z"),
      365
    )
    const result = selectInventoryRisks(3, -20, sales.unitsPerDay, {
      lowStockThreshold: 5,
      overstockThreshold: 100,
      unusualAbsoluteDelta: 10,
      reorderDaysThreshold: 30,
    })

    expect(sales.status).toBe("ready")
    expect(result.risks).toEqual(
      expect.arrayContaining(["low_stock", "unusual_change"])
    )
    expect(result.estimatedDaysOfSupply).not.toBeNull()
  })

  it("distinguishes full-period zero sales from short history", () => {
    const commerce = createCommerceSeed()
    const endAt = new Date("2026-09-01T00:00:00.000Z")
    const zeroSales = selectAverageDailySales(
      999_999,
      commerce.orders,
      commerce.orderLines,
      endAt,
      90
    )
    const recentOrder = commerce.orders.at(-1)!
    const shortHistory = selectAverageDailySales(
      commerce.orderLines.find((line) => line.orderId === recentOrder.id)!
        .productId,
      [recentOrder],
      commerce.orderLines,
      endAt,
      90
    )

    expect(zeroSales).toEqual({ status: "ready", unitsPerDay: 0 })
    expect(shortHistory).toEqual({
      status: "insufficient_history",
      unitsPerDay: null,
    })
  })

  it("keeps generated movement history aligned to product closing stock", () => {
    const commerce = createCommerceSeed()
    const products = commerce.orderLines.slice(0, 2).map((line, index) => ({
      id: line.productId,
      stock: 10 + index,
    }))
    const minimalProducts = products.map((item) => ({
      ...item,
    })) as never
    const movements = createInventoryMovementSeed(minimalProducts)

    for (const product of products) {
      const latest = movements
        .filter((movement) => movement.productId === product.id)
        .at(-1)
      expect(latest?.nextStock).toBe(product.stock)
    }
  })
})
