import { describe, expect, it } from "vitest"
import {
  createInventoryListModel,
  type InventoryListRow,
} from "./inventory-list-model"

const row = (
  id: number,
  options: Partial<InventoryListRow> = {}
): InventoryListRow => ({
  product: {
    id,
    sku: `SKU-${id}`,
    title: `Product ${id}`,
    brand: "Voltage",
    category: id % 2 ? "beauty" : "electronics",
    price: { amount: 10, currency: "USD" },
    stock: id,
    description: "Description",
    shortAdCopy: "Short",
    longAdCopy: "Long",
    images: [],
    specifications: [],
    reviews: [],
    status: "published",
    archivedFromStatus: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: `2026-08-${String(id).padStart(2, "0")}T00:00:00.000Z`,
  },
  movement: null,
  periodDelta: -id,
  changeRate: -id / 100,
  estimatedDaysOfSupply: id * 2,
  risks: id < 4 ? ["low_stock"] : ["healthy"],
  ...options,
})

describe("inventory list model", () => {
  it("combines search, category, risk, sorting, and pagination", () => {
    const rows = Array.from({ length: 14 }, (_, index) => row(index + 1))
    const model = createInventoryListModel(
      rows,
      {
        query: "Product",
        category: "beauty",
        risk: "low_stock",
        sort: "stock-desc",
      },
      1,
      1
    )

    expect(model.total).toBe(2)
    expect(model.pageCount).toBe(2)
    expect(model.items[0].product.id).toBe(3)
  })

  it("excludes archived products and clamps invalid pages", () => {
    const model = createInventoryListModel(
      [row(1), row(2, { product: { ...row(2).product, status: "archived" } })],
      {
        query: "",
        category: "all",
        risk: "all",
        sort: "updated-desc",
      },
      99
    )

    expect(model.total).toBe(1)
    expect(model.page).toBe(1)
  })
})
