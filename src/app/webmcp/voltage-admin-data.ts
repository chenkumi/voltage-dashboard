import type { CommerceDataSnapshot, OrderStatus } from "./commerce-data/types"
import type { Product } from "./products/types"
import { formatVoltageCategory } from "./voltage-product-data"

export type VoltageAdminOrderSummary = {
  id: string
  status: OrderStatus
  itemCount: number
  total: { amount: number; currency: "USD" | "TWD" }
  createdAt: string
}

export const getVoltageAdminDashboard = (
  products: readonly Product[],
  commerce: CommerceDataSnapshot
) => {
  const activeProducts = products.filter(
    (product) => product.status !== "archived"
  )
  const availableProducts = activeProducts.filter(
    (product) => product.stock > 0
  )
  const lowStockProducts = activeProducts.filter(
    (product) => product.stock > 0 && product.stock <= 12
  )
  const revenueByCurrency = (["USD", "TWD"] as const)
    .map((currency) => ({
      currency,
      amount: Number(
        commerce.orders
          .filter(
            (order) =>
              order.paymentStatus === "paid" &&
              order.amounts.total.currency === currency
          )
          .reduce((total, order) => total + order.amounts.total.amount, 0)
          .toFixed(2)
      ),
    }))
    .filter(({ amount }) => amount > 0)
  const lineCountByOrder = new Map<string, number>()
  for (const line of commerce.orderLines) {
    lineCountByOrder.set(
      line.orderId,
      (lineCountByOrder.get(line.orderId) ?? 0) + line.quantity
    )
  }
  const latestOrders: VoltageAdminOrderSummary[] = [...commerce.orders]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 4)
    .map((order) => ({
      id: order.id,
      status: order.status,
      itemCount: lineCountByOrder.get(order.id) ?? 0,
      total: order.amounts.total,
      createdAt: order.createdAt,
    }))

  return {
    revenueByCurrency,
    orderCount: commerce.orders.length,
    attentionOrderCount: commerce.orders.filter(
      (order) =>
        order.status === "action_needed" ||
        order.paymentStatus === "failed" ||
        order.fulfillmentStatus === "exception"
    ).length,
    customerCount: commerce.customers.length,
    activeCustomerCount: commerce.customers.filter(
      (customer) => customer.status === "active"
    ).length,
    availableProductCount: availableProducts.length,
    lowStockCount: lowStockProducts.length,
    latestOrders,
    lowStockProducts: lowStockProducts.slice(0, 5).map((product) => ({
      id: product.id,
      title: product.title,
      category: formatVoltageCategory(product.category),
      stock: product.stock,
    })),
  }
}

export const searchVoltageAdminProducts = (
  query: string,
  products: readonly Product[],
  limit = 12
) => {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  return products
    .filter(
      (product) =>
        !normalizedQuery ||
        [product.title, product.category, product.brand, product.sku]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase()
          .includes(normalizedQuery)
    )
    .slice(0, limit)
    .map(toAdminProduct)
}

export const toAdminProduct = (product: Product) => ({
  id: product.id,
  sku: product.sku,
  title: product.title,
  category: formatVoltageCategory(product.category),
  price: product.price,
  stock: product.stock,
  status: product.status,
  rating:
    product.reviews.length > 0
      ? product.reviews.reduce((total, review) => total + review.rating, 0) /
        product.reviews.length
      : null,
})
