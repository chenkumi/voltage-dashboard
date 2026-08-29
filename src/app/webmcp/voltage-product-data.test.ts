import { describe, expect, it } from "vitest"
import { calculateSalePrice, voltageProducts } from "./voltage-product-data"

describe("Voltage Dashboard embedded product catalog", () => {
  it("bundles the complete 194-product catalog", () => {
    expect(voltageProducts).toHaveLength(194)
  })

  it("rounds discounts to currency precision", () => {
    expect(calculateSalePrice(19.99, 10.48)).toBe(17.9)
  })
})
