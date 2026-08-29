import { describe, expect, it } from "vitest"
import {
  createProductListModel,
  listProductCategories,
} from "./product-list-model"
import type { Product } from "./types"

const product = (id: number, overrides: Partial<Product> = {}): Product => ({
  id,
  sku: `SKU-${id}`,
  title: `Product ${id}`,
  brand: "Voltage",
  category: id % 2 === 0 ? "electronics" : "groceries",
  price: { amount: id * 10, currency: "USD" },
  stock: 20,
  status: "published",
  archivedFromStatus: null,
  description: "Description",
  shortAdCopy: "Short copy",
  longAdCopy: "Long copy",
  images: [],
  specifications: [],
  reviews: [],
  createdAt: "2026-08-29T00:00:00.000Z",
  updatedAt: "2026-08-29T00:00:00.000Z",
  ...overrides,
})

const filters = {
  query: "",
  category: "all",
  status: "active" as const,
  stock: "all" as const,
}

describe("product list model", () => {
  it("searches title, SKU, brand, and category without case sensitivity", () => {
    const products = [
      product(1, { title: "Ceramic Mug", sku: "KITCHEN-1" }),
      product(2, { brand: "Northwind" }),
    ]

    expect(
      createProductListModel(products, { ...filters, query: "kitchen-1" }, 1)
        .items
    ).toHaveLength(1)
    expect(
      createProductListModel(products, { ...filters, query: "NORTHWIND" }, 1)
        .items[0]?.id
    ).toBe(2)
  })

  it("combines category, status, and stock filters", () => {
    const products = [
      product(1, { stock: 5, status: "draft" }),
      product(2, { stock: 0 }),
      product(3, {
        stock: 4,
        status: "archived",
        archivedFromStatus: "published",
      }),
    ]

    const actual = createProductListModel(
      products,
      {
        query: "",
        category: "groceries",
        status: "draft",
        stock: "low-stock",
      },
      1
    )

    expect(actual.items.map(({ id }) => id)).toEqual([1])
  })

  it("hides archived products from the active list and exposes them explicitly", () => {
    const products = [
      product(1),
      product(2, {
        status: "archived",
        archivedFromStatus: "published",
      }),
    ]

    expect(createProductListModel(products, filters, 1).items).toHaveLength(1)
    expect(
      createProductListModel(products, { ...filters, status: "archived" }, 1)
        .items[0]?.id
    ).toBe(2)
  })

  it("clamps pages and returns the requested page slice", () => {
    const products = Array.from({ length: 16 }, (_, index) =>
      product(index + 1)
    )

    const actual = createProductListModel(products, filters, 9)

    expect(actual.page).toBe(2)
    expect(actual.pageCount).toBe(2)
    expect(actual.items.map(({ id }) => id)).toEqual([16])
  })

  it("lists unique sorted categories", () => {
    expect(listProductCategories([product(1), product(2), product(3)])).toEqual(
      ["electronics", "groceries"]
    )
  })
})
