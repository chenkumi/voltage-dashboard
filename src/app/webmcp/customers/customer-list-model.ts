import type {
  Customer,
  CustomerActivity,
  CustomerRegion,
  CustomerSafeTag,
  CustomerSegment,
  CustomerStatus,
  Order,
} from "../commerce-data/types"
import type { ProductCurrency } from "../products/types"

export type CustomerListRow = {
  customer: Customer
  orders: readonly Order[]
  orderCount: number
  lifetimeSpend: Readonly<Record<ProductCurrency, number>>
  lastPurchaseAt: string | null
  lastActivityAt: string
}

export type CustomerListFilters = {
  query: string
  status: CustomerStatus | "all"
  segment: CustomerSegment | "all"
  region: CustomerRegion | "all"
  tag: CustomerSafeTag | string | "all"
  period: "all" | "30d" | "90d" | "365d"
  currency: ProductCurrency
  minimumSpend: number | null
  maximumSpend: number | null
  sort:
    "activity-desc" | "created-desc" | "spend-desc" | "orders-desc" | "id-asc"
}

export type SafeCustomerUrlFilters = Pick<
  CustomerListFilters,
  "status" | "segment" | "region" | "period"
>

const safeStatuses = new Set(["all", "active", "suspended"])
const safeSegments = new Set(["all", "new", "returning", "vip"])
const safeRegions = new Set(["all", "north", "central", "south", "east"])
const safePeriods = new Set(["all", "30d", "90d", "365d"])

const readSafeValue = <T extends string>(
  params: URLSearchParams,
  key: string,
  values: ReadonlySet<string>,
  fallback: T
) => {
  const value = params.get(key)
  return (value && values.has(value) ? value : fallback) as T
}

export const parseSafeCustomerUrlFilters = (
  params: URLSearchParams
): SafeCustomerUrlFilters => ({
  status: readSafeValue(params, "status", safeStatuses, "all"),
  segment: readSafeValue(params, "segment", safeSegments, "all"),
  region: readSafeValue(params, "region", safeRegions, "all"),
  period: readSafeValue(params, "period", safePeriods, "all"),
})

export const serializeSafeCustomerUrlFilters = (
  filters: SafeCustomerUrlFilters
) => {
  const params = new URLSearchParams()
  for (const key of ["status", "segment", "region", "period"] as const) {
    if (filters[key] !== "all") params.set(key, filters[key])
  }
  return params
}

export const buildCustomerRows = (
  customers: readonly Customer[],
  orders: readonly Order[],
  activities: readonly CustomerActivity[]
): CustomerListRow[] => {
  const ordersByCustomer = new Map<string, Order[]>()
  for (const order of orders) {
    ordersByCustomer.set(order.customerId, [
      ...(ordersByCustomer.get(order.customerId) ?? []),
      order,
    ])
  }
  const latestActivity = new Map<string, string>()
  for (const activity of activities) {
    const current = latestActivity.get(activity.customerId)
    if (!current || activity.occurredAt > current) {
      latestActivity.set(activity.customerId, activity.occurredAt)
    }
  }
  return customers.map((customer) => {
    const customerOrders = ordersByCustomer.get(customer.id) ?? []
    const lifetimeSpend = customerOrders.reduce(
      (totals, order) => ({
        ...totals,
        [order.amounts.total.currency]:
          totals[order.amounts.total.currency] + order.amounts.total.amount,
      }),
      { USD: 0, TWD: 0 }
    )
    const lastPurchaseAt = customerOrders.reduce<string | null>(
      (latest, order) =>
        latest === null || order.createdAt > latest ? order.createdAt : latest,
      null
    )
    return {
      customer,
      orders: customerOrders,
      orderCount: customerOrders.length,
      lifetimeSpend,
      lastPurchaseAt,
      lastActivityAt:
        latestActivity.get(customer.id) ??
        customer.updatedAt ??
        customer.createdAt,
    }
  })
}

const periodDays: Record<
  Exclude<CustomerListFilters["period"], "all">,
  number
> = {
  "30d": 30,
  "90d": 90,
  "365d": 365,
}

export const createCustomerListModel = (
  rows: readonly CustomerListRow[],
  filters: CustomerListFilters,
  page: number,
  pageSize = 15,
  now = new Date()
) => {
  const query = filters.query.trim().toLocaleLowerCase()
  const periodStart =
    filters.period === "all"
      ? null
      : new Date(
          now.getTime() - periodDays[filters.period] * 86_400_000
        ).toISOString()
  const filtered = rows.filter((row) => {
    const { customer } = row
    const spend = row.lifetimeSpend[filters.currency]
    return (
      (!query ||
        customer.id.toLocaleLowerCase().includes(query) ||
        customer.contact.fullName.toLocaleLowerCase().includes(query) ||
        customer.contact.email.toLocaleLowerCase().includes(query)) &&
      (filters.status === "all" || customer.status === filters.status) &&
      (filters.segment === "all" || customer.segment === filters.segment) &&
      (filters.region === "all" || customer.region === filters.region) &&
      (filters.tag === "all" ||
        customer.tags.some((tag) => tag.value === filters.tag)) &&
      (periodStart === null || row.lastActivityAt >= periodStart) &&
      (filters.minimumSpend === null || spend >= filters.minimumSpend) &&
      (filters.maximumSpend === null || spend <= filters.maximumSpend)
    )
  })
  const sorted = [...filtered].sort((left, right) => {
    if (filters.sort === "created-desc") {
      return right.customer.createdAt.localeCompare(left.customer.createdAt)
    }
    if (filters.sort === "spend-desc") {
      return (
        right.lifetimeSpend[filters.currency] -
        left.lifetimeSpend[filters.currency]
      )
    }
    if (filters.sort === "orders-desc") {
      return right.orderCount - left.orderCount
    }
    if (filters.sort === "id-asc") {
      return left.customer.id.localeCompare(right.customer.id)
    }
    return right.lastActivityAt.localeCompare(left.lastActivityAt)
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
