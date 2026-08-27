import { describe, expect, it } from "vitest"
import {
  calculateSalePrice,
  getVoltageCartItems,
  getVoltageCartSummary,
  productMatchesVoltageFilters,
  voltageProducts,
} from "./voltage-market-data"

describe("Voltage Market embedded DummyJSON catalog", () => {
  it("bundles the complete 194-product catalog", () => {
    expect(voltageProducts).toHaveLength(194)
  })

  it("uses the discounted price for cart totals", () => {
    const items = getVoltageCartItems([{ productId: 1, quantity: 2 }])

    expect(items[0]?.lineTotal).toBe(17.88)
    expect(getVoltageCartSummary(items)).toEqual({
      itemCount: 2,
      subtotal: 17.88,
      shipping: 9.9,
      total: 27.78,
    })
  })

  it("filters the catalog by a category and discounted-price ceiling", () => {
    const filters = {
      query: "",
      category: "beauty",
      maxPrice: "10",
      sort: "featured" as const,
    }

    expect(
      voltageProducts
        .filter((product) => productMatchesVoltageFilters(product, filters))
        .map((product) => product.id)
    ).toEqual([1, 5])
  })

  it("rounds discounts to currency precision", () => {
    expect(calculateSalePrice(19.99, 10.48)).toBe(17.9)
  })
})
