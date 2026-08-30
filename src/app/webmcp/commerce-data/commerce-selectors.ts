import type { CommerceDataSnapshot, Customer, Money, Order } from "./types"

export const selectActiveCustomers = (snapshot: CommerceDataSnapshot) =>
  snapshot.customers.filter((customer) => customer.status === "active")

export const selectOrderLines = (
  snapshot: CommerceDataSnapshot,
  orderId: string
) => snapshot.orderLines.filter((line) => line.orderId === orderId)

export const selectCustomerOrders = (
  snapshot: CommerceDataSnapshot,
  customerId: string
) => snapshot.orders.filter((order) => order.customerId === customerId)

export type CustomerMetrics = {
  customer: Customer
  orders: readonly Order[]
  orderCount: number
  lifetimeValueByCurrency: Partial<Record<Money["currency"], number>>
  lastOrderAt: string | null
}

export const selectCustomerMetrics = (
  snapshot: CommerceDataSnapshot,
  customerId: string
): CustomerMetrics | null => {
  const customer = snapshot.customers.find((item) => item.id === customerId)
  if (!customer) return null
  const orders = selectCustomerOrders(snapshot, customerId)
  const lifetimeValueByCurrency: CustomerMetrics["lifetimeValueByCurrency"] = {}
  for (const order of orders) {
    const { currency, amount } = order.amounts.total
    const currentCents = Math.round(
      (lifetimeValueByCurrency[currency] ?? 0) * 100
    )
    lifetimeValueByCurrency[currency] =
      (currentCents + Math.round(amount * 100)) / 100
  }
  return {
    customer,
    orders,
    orderCount: orders.length,
    lifetimeValueByCurrency,
    lastOrderAt: orders.reduce<string | null>(
      (latest, order) =>
        latest === null || order.createdAt > latest ? order.createdAt : latest,
      null
    ),
  }
}
