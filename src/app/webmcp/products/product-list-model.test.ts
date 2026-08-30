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
  sort: "recent" as const,
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
        sort: "recent",
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

  it("groups price sorting by currency before comparing amounts", () => {
    const products = [
      product(1, { price: { amount: 100, currency: "USD" } }),
      product(2, { price: { amount: 500, currency: "TWD" } }),
      product(3, { price: { amount: 300, currency: "TWD" } }),
    ]

    expect(
      createProductListModel(
        products,
        { ...filters, sort: "price" },
        1
      ).items.map(({ id }) => id)
    ).toEqual([2, 3, 1])
  })

  it("sorts by recent update, name, price, and stock without mutating input", () => {
    const products = [
      product(1, {
        title: "Zulu",
        price: { amount: 20, currency: "USD" },
        stock: 8,
        updatedAt: "2026-08-01T00:00:00.000Z",
      }),
      product(2, {
        title: "Alpha",
        price: { amount: 40, currency: "USD" },
        stock: 3,
        updatedAt: "2026-08-03T00:00:00.000Z",
      }),
      product(3, {
        title: "Mike",
        price: { amount: 10, currency: "USD" },
        stock: 12,
        updatedAt: "2026-08-02T00:00:00.000Z",
      }),
    ]

    expect(
      createProductListModel(products, filters, 1).items.map(({ id }) => id)
    ).toEqual([2, 3, 1])
    expect(
      createProductListModel(
        products,
        { ...filters, sort: "name" },
        1
      ).items.map(({ id }) => id)
    ).toEqual([2, 3, 1])
    expect(
      createProductListModel(
        products,
        { ...filters, sort: "price" },
        1
      ).items.map(({ id }) => id)
    ).toEqual([2, 1, 3])
    expect(
      createProductListModel(
        products,
        { ...filters, sort: "stock" },
        1
      ).items.map(({ id }) => id)
    ).toEqual([2, 1, 3])
    expect(products.map(({ id }) => id)).toEqual([1, 2, 3])
  })
})
