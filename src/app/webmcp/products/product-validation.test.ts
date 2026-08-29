import { describe, expect, it } from "vitest"
import {
  validateProductInput,
  validateStoredProduct,
} from "./product-validation"
import type { Product, ProductWriteInput } from "./types"

const createInput = (): ProductWriteInput => ({
  sku: "TEST-001",
  title: "Test product",
  brand: "Voltage",
  category: "test",
  price: { amount: 99, currency: "TWD" },
  stock: 3,
  description: "A complete product description.",
  shortAdCopy: "Short copy",
  longAdCopy: "Long advertising copy",
  images: [
    {
      id: "image-1",
      url: "https://example.com/product.webp",
      alt: "Test product",
      position: 0,
      isPrimary: true,
    },
  ],
  specifications: [
    {
      id: "spec-1",
      title: "Capacity",
      value: "500",
      unit: "ml",
      position: 0,
    },
  ],
})

describe("product validation", () => {
  it("accepts native TWD and USD prices without conversion", () => {
    expect(validateProductInput(createInput(), "publish")).toEqual([])
    expect(
      validateProductInput(
        { ...createInput(), price: { amount: 9.99, currency: "USD" } },
        "publish"
      )
    ).toEqual([])
  })

  it("allows an incomplete content draft but requires publish content", () => {
    const draft = {
      ...createInput(),
      description: "",
      shortAdCopy: "",
      longAdCopy: "",
      images: [],
    }
    expect(validateProductInput(draft, "draft")).toEqual([])
    expect(
      validateProductInput(draft, "publish").map((issue) => issue.field)
    ).toEqual(
      expect.arrayContaining([
        "description",
        "shortAdCopy",
        "longAdCopy",
        "images",
      ])
    )
  })

  it("rejects unsafe images, duplicate ordering, and incomplete specs", () => {
    const issues = validateProductInput(
      {
        ...createInput(),
        images: [
          {
            id: "image-1",
            url: "http://example.com/product.webp",
            alt: "",
            position: 0,
            isPrimary: false,
          },
          {
            id: "image-2",
            url: "https://example.com/product-2.webp",
            alt: "",
            position: 0,
            isPrimary: false,
          },
        ],
        specifications: [
          { id: "spec-1", title: "", value: "500", unit: "ml", position: 0 },
        ],
      },
      "publish"
    )
    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "PRIMARY_IMAGE",
        "INVALID_IMAGE",
        "INVALID_ORDER",
        "INVALID_SPECIFICATION",
      ])
    )
  })

  it("validates that stored reviews contain only usable anonymous content", () => {
    const product: Product = {
      ...createInput(),
      id: 1,
      status: "published",
      archivedFromStatus: null,
      reviews: [{ rating: 6, comment: "", date: "invalid" }],
      createdAt: "2026-08-29T00:00:00.000Z",
      updatedAt: "2026-08-29T00:00:00.000Z",
    }
    expect(validateStoredProduct(product)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "reviews", code: "INVALID_REVIEW" }),
      ])
    )
  })
})
