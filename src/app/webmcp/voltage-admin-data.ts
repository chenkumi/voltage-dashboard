import {
  formatVoltageCategory,
  voltageProducts,
  type VoltageProduct,
} from "./voltage-product-data"

export type VoltageAdminCustomer = {
  id: string
  segment: "New" | "Returning" | "VIP"
  orders: number
  lifetimeValue: number
  lastActive: string
}

export type VoltageAdminOrder = {
  id: string
  status: "Processing" | "Shipped" | "Delivered" | "Action needed"
  itemCount: number
  total: number
  createdAt: string
  customerId: string
}

export type VoltageAdminInventory = Record<number, number>

export const voltageAdminCustomers: VoltageAdminCustomer[] = [
  {
    id: "CUST-1042",
    segment: "VIP",
    orders: 12,
    lifetimeValue: 1840,
    lastActive: "Today",
  },
  {
    id: "CUST-1187",
    segment: "Returning",
    orders: 6,
    lifetimeValue: 612,
    lastActive: "Today",
  },
  {
    id: "CUST-1219",
    segment: "New",
    orders: 1,
    lifetimeValue: 74,
    lastActive: "Yesterday",
  },
  {
    id: "CUST-1236",
    segment: "Returning",
    orders: 4,
    lifetimeValue: 428,
    lastActive: "Yesterday",
  },
  {
    id: "CUST-1284",
    segment: "VIP",
    orders: 9,
    lifetimeValue: 1320,
    lastActive: "2 days ago",
  },
  {
    id: "CUST-1311",
    segment: "New",
    orders: 1,
    lifetimeValue: 49,
    lastActive: "2 days ago",
  },
]

export const voltageAdminOrders: VoltageAdminOrder[] = [
  {
    id: "VM-24081",
    status: "Processing",
    itemCount: 3,
    total: 184,
    createdAt: "Today, 10:32",
    customerId: "CUST-1042",
  },
  {
    id: "VM-24080",
    status: "Shipped",
    itemCount: 1,
    total: 74,
    createdAt: "Today, 09:14",
    customerId: "CUST-1219",
  },
  {
    id: "VM-24079",
    status: "Action needed",
    itemCount: 2,
    total: 129,
    createdAt: "Yesterday, 16:45",
    customerId: "CUST-1187",
  },
  {
    id: "VM-24078",
    status: "Delivered",
    itemCount: 4,
    total: 246,
    createdAt: "Yesterday, 11:20",
    customerId: "CUST-1236",
  },
  {
    id: "VM-24077",
    status: "Delivered",
    itemCount: 2,
    total: 98,
    createdAt: "Mon, 14:10",
    customerId: "CUST-1284",
  },
]

export const createVoltageAdminInventory = (): VoltageAdminInventory =>
  Object.fromEntries(
    voltageProducts.map((product) => [product.id, product.stock])
  )

export const getVoltageAdminDashboard = (inventory: VoltageAdminInventory) => {
  const availableProducts = voltageProducts.filter(
    (product) => (inventory[product.id] ?? 0) > 0
  )
  const lowStockProducts = voltageProducts.filter((product) => {
    const stock = inventory[product.id] ?? 0
    return stock > 0 && stock <= 12
  })
  const revenue = voltageAdminOrders.reduce(
    (total, order) => total + order.total,
    0
  )

  return {
    revenue,
    orderCount: voltageAdminOrders.length,
    customerCount: voltageAdminCustomers.length,
    availableProductCount: availableProducts.length,
    lowStockCount: lowStockProducts.length,
    lowStockProducts: lowStockProducts.slice(0, 5).map((product) => ({
      id: product.id,
      title: product.title,
      category: formatVoltageCategory(product.category),
      stock: inventory[product.id] ?? 0,
    })),
  }
}

export const searchVoltageAdminProducts = (
  query: string,
  inventory: VoltageAdminInventory,
  limit = 12
) => {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  return voltageProducts
    .filter(
      (product) =>
        !normalizedQuery ||
        [product.title, product.category, product.brand, ...product.tags]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase()
          .includes(normalizedQuery)
    )
    .slice(0, limit)
    .map((product) => toAdminProduct(product, inventory))
}

export const toAdminProduct = (
  product: VoltageProduct,
  inventory: VoltageAdminInventory
) => ({
  id: product.id,
  title: product.title,
  category: formatVoltageCategory(product.category),
  price: product.salePrice,
  stock: inventory[product.id] ?? 0,
  rating: product.rating,
})

export const setVoltageAdminInventory = (
  inventory: VoltageAdminInventory,
  productId: number,
  stock: number
) => {
  if (
    !Number.isInteger(stock) ||
    stock < 0 ||
    !voltageProducts.some((product) => product.id === productId)
  ) {
    return null
  }

  return { ...inventory, [productId]: stock }
}
