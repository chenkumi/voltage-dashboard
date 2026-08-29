import { describe, expect, it } from "vitest"
import { createDummyJsonProductSeed } from "../products/product-seed"
import {
  createReportingDataSnapshot,
  DEFAULT_REPORTING_DATA,
} from "./reporting-data"

describe("reporting product projection", () => {
  it("resolves historical sales by stable SKU instead of coincidental IDs", () => {
    const salesProductIds = new Set(
      DEFAULT_REPORTING_DATA.sales.map(([, productId]) => productId)
    )

    expect(salesProductIds).toEqual(
      new Set([1, 2, 11, 12, 16, 17, 88, 93, 99, 137, 154, 159])
    )
    expect(salesProductIds.has(3)).toBe(false)
  })

  it("keeps native currency, all statuses, and no invented sales for new products", () => {
    const [seed] = createDummyJsonProductSeed()
    const twdProduct = {
      ...seed!,
      id: 999,
      sku: "NEW-TWD-999",
      title: "New TWD product",
      price: { amount: 2500, currency: "TWD" as const },
      status: "archived" as const,
    }
    const snapshot = createReportingDataSnapshot([seed!, twdProduct])

    expect(snapshot.products).toContainEqual([
      999,
      "New TWD product",
      twdProduct.category,
      null,
      2500,
      "TWD",
      "archived",
    ])
    expect(
      snapshot.sales.some(([, productId]) => productId === twdProduct.id)
    ).toBe(false)
    expect(snapshot.inventory).toContainEqual([
      999,
      twdProduct.stock,
      twdProduct.updatedAt,
    ])
  })

  it("does not let a new product hijack sales by reusing a seed SKU", () => {
    const seed = createDummyJsonProductSeed()
    const original = seed.find(({ id }) => id === 1)!
    const changedSeed = seed.map((product) =>
      product.id === original.id
        ? { ...product, sku: "CHANGED-SEED-SKU" }
        : product
    )
    const hijacker = {
      ...original,
      id: 999,
      createdAt: "2026-08-30T00:00:00.000Z",
      updatedAt: "2026-08-30T00:00:00.000Z",
    }
    const snapshot = createReportingDataSnapshot([...changedSeed, hijacker])

    expect(
      snapshot.sales.some(
        ([, productId]) =>
          productId === original.id || productId === hijacker.id
      )
    ).toBe(false)
  })

  it("keeps other historical rows stable when an earlier fixture is missing", () => {
    const seed = createDummyJsonProductSeed()
    const withoutFirstFixture = createReportingDataSnapshot(
      seed.filter(({ id }) => id !== 1)
    )
    const rowsForSecondFixture = (snapshot: typeof DEFAULT_REPORTING_DATA) =>
      snapshot.sales.filter(([, productId]) => productId === 2)

    expect(rowsForSecondFixture(withoutFirstFixture)).toEqual(
      rowsForSecondFixture(DEFAULT_REPORTING_DATA)
    )
  })
})
