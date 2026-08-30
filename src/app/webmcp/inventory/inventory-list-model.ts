import type { Product } from "../products/types"
import type { InventoryMovement, InventoryRisk } from "./types"

export type InventoryListRow = {
  product: Product
  movement: InventoryMovement | null
  periodDelta: number
  changeRate: number | null
  estimatedDaysOfSupply: number | null
  risks: readonly InventoryRisk[]
}

export type InventoryListFilters = {
  query: string
  category: string
  risk: InventoryRisk | "all"
  sort: "stock-asc" | "stock-desc" | "change-asc" | "days-asc" | "updated-desc"
}

export const createInventoryListModel = (
  rows: readonly InventoryListRow[],
  filters: InventoryListFilters,
  page: number,
  pageSize = 12
) => {
  const query = filters.query.trim().toLocaleLowerCase()
  const filtered = rows.filter(({ product, risks }) => {
    const matchesQuery =
      !query ||
      [product.title, product.sku, product.brand ?? "", product.category]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query)
    return (
      product.status !== "archived" &&
      matchesQuery &&
      (filters.category === "all" || product.category === filters.category) &&
      (filters.risk === "all" || risks.includes(filters.risk))
    )
  })
  const sorted = [...filtered].sort((left, right) => {
    if (filters.sort === "stock-asc") {
      return left.product.stock - right.product.stock
    }
    if (filters.sort === "stock-desc") {
      return right.product.stock - left.product.stock
    }
    if (filters.sort === "change-asc") {
      return left.periodDelta - right.periodDelta
    }
    if (filters.sort === "days-asc") {
      return (
        (left.estimatedDaysOfSupply ?? Number.POSITIVE_INFINITY) -
        (right.estimatedDaysOfSupply ?? Number.POSITIVE_INFINITY)
      )
    }
    return right.product.updatedAt.localeCompare(left.product.updatedAt)
  })
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))
  const currentPage = Math.min(Math.max(1, page), pageCount)
  return {
    items: sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    total: sorted.length,
    page: currentPage,
    pageCount,
  }
}
