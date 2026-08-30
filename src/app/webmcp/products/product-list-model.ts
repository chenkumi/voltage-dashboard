import type { Product, ProductStatus } from "./types"

export const PRODUCT_LIST_PAGE_SIZE = 15

export type ProductStockFilter =
  "all" | "in-stock" | "low-stock" | "out-of-stock"
export type ProductStatusFilter = "active" | ProductStatus
export type ProductSort = "recent" | "name" | "price" | "stock"

export type ProductListFilters = {
  query: string
  category: string
  status: ProductStatusFilter
  stock: ProductStockFilter
  sort: ProductSort
}

export type ProductListModel = {
  items: readonly Product[]
  filteredCount: number
  totalCount: number
  page: number
  pageCount: number
}

const matchesQuery = (product: Product, query: string) => {
  const normalized = query.trim().toLocaleLowerCase()
  if (!normalized) return true
  return [product.title, product.sku, product.brand ?? "", product.category]
    .join(" ")
    .toLocaleLowerCase()
    .includes(normalized)
}

const matchesStock = (product: Product, stock: ProductStockFilter) => {
  if (stock === "in-stock") return product.stock > 12
  if (stock === "low-stock") return product.stock > 0 && product.stock <= 12
  if (stock === "out-of-stock") return product.stock === 0
  return true
}

export const createProductListModel = (
  products: readonly Product[],
  filters: ProductListFilters,
  requestedPage: number,
  pageSize = PRODUCT_LIST_PAGE_SIZE
): ProductListModel => {
  const filtered = products
    .filter(
      (product) =>
        matchesQuery(product, filters.query) &&
        (filters.category === "all" || product.category === filters.category) &&
        (filters.status === "active"
          ? product.status !== "archived"
          : product.status === filters.status) &&
        matchesStock(product, filters.stock)
    )
    .sort((left, right) => {
      if (filters.sort === "name") return left.title.localeCompare(right.title)
      if (filters.sort === "price") {
        const currency = left.price.currency.localeCompare(right.price.currency)
        return currency || right.price.amount - left.price.amount
      }
      if (filters.sort === "stock") return left.stock - right.stock
      return Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
    })
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const page = Math.min(Math.max(1, requestedPage), pageCount)
  const start = (page - 1) * pageSize

  return {
    items: filtered.slice(start, start + pageSize),
    filteredCount: filtered.length,
    totalCount: products.length,
    page,
    pageCount,
  }
}

export const listProductCategories = (products: readonly Product[]) =>
  [...new Set(products.map(({ category }) => category))].sort((left, right) =>
    left.localeCompare(right)
  )
