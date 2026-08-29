import rawCatalog from "../data/dummyjson-products.json"
import { describe, expect, it } from "vitest"
import {
  createDummyJsonProductSeed,
  DUMMYJSON_PRODUCTS_SOURCE,
} from "./product-seed"
import { validateStoredProduct } from "./product-validation"

describe("DummyJSON product seed", () => {
  it("converts the complete local catalog into valid published products", () => {
    const seed = createDummyJsonProductSeed()
    expect(seed).toHaveLength(194)
    expect(seed.every((product) => product.status === "published")).toBe(true)
    expect(seed.every((product) => product.price.currency === "USD")).toBe(true)
    expect(seed.flatMap(validateStoredProduct)).toEqual([])
  })

  it("stores only anonymous review fields", () => {
    const serialized = JSON.stringify(rawCatalog)
    expect(serialized).not.toContain("reviewerName")
    expect(serialized).not.toContain("reviewerEmail")
    expect(createDummyJsonProductSeed()[0]?.reviews[0]).toEqual({
      rating: expect.any(Number),
      comment: expect.any(String),
      date: expect.any(String),
    })
  })

  it("keeps an explicit attribution URL", () => {
    expect(DUMMYJSON_PRODUCTS_SOURCE).toBe("https://dummyjson.com/products")
  })
})
