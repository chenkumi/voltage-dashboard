import type {
  Customer,
  CustomerRegion,
  CustomerSegment,
  FulfillmentStatus,
  Order,
  OrderLine,
  OrderStatus,
  PaymentStatus,
} from "../commerce-data/types"
import type { ProductCurrency } from "../products/types"

export type OrderListRow = {
  order: Order
  customer: Customer | null
  lines: readonly OrderLine[]
  relatedReturnIds: readonly string[]
}

export type OrderListFilters = {
  query: string
  dateFrom: string
  dateTo: string
  status: OrderStatus | "all"
  paymentStatus: PaymentStatus | "all"
  fulfillmentStatus: FulfillmentStatus | "all"
  segment: CustomerSegment | "all"
  region: CustomerRegion | "all"
  currency: ProductCurrency | "all"
  minimumAmount: number | null
  maximumAmount: number | null
  sort: "updated-desc" | "created-desc" | "amount-asc" | "amount-desc"
}

export const createOrderListModel = (
  rows: readonly OrderListRow[],
  filters: OrderListFilters,
  page: number,
  pageSize = 15
) => {
  const query = filters.query.trim().toLocaleLowerCase()
  const filtered = rows.filter(({ order }) => {
    const amount = order.amounts.total.amount
    return (
      (!query || order.id.toLocaleLowerCase().includes(query)) &&
      (!filters.dateFrom ||
        order.createdAt >= `${filters.dateFrom}T00:00:00`) &&
      (!filters.dateTo ||
        order.createdAt <= `${filters.dateTo}T23:59:59.999`) &&
      (filters.status === "all" || order.status === filters.status) &&
      (filters.paymentStatus === "all" ||
        order.paymentStatus === filters.paymentStatus) &&
      (filters.fulfillmentStatus === "all" ||
        order.fulfillmentStatus === filters.fulfillmentStatus) &&
      (filters.segment === "all" ||
        order.customerSnapshot.segment === filters.segment) &&
      (filters.region === "all" ||
        order.customerSnapshot.region === filters.region) &&
      (filters.currency === "all" ||
        order.amounts.total.currency === filters.currency) &&
      (filters.minimumAmount === null || amount >= filters.minimumAmount) &&
      (filters.maximumAmount === null || amount <= filters.maximumAmount)
    )
  })
  const sorted = [...filtered].sort((left, right) => {
    if (filters.sort === "created-desc") {
      return right.order.createdAt.localeCompare(left.order.createdAt)
    }
    if (filters.sort === "amount-asc") {
      const currencyOrder = left.order.amounts.total.currency.localeCompare(
        right.order.amounts.total.currency
      )
      if (currencyOrder !== 0) return currencyOrder
      return left.order.amounts.total.amount - right.order.amounts.total.amount
    }
    if (filters.sort === "amount-desc") {
      const currencyOrder = left.order.amounts.total.currency.localeCompare(
        right.order.amounts.total.currency
      )
      if (currencyOrder !== 0) return currencyOrder
      return right.order.amounts.total.amount - left.order.amounts.total.amount
    }
    return right.order.updatedAt.localeCompare(left.order.updatedAt)
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
