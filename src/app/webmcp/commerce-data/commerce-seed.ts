import { createDummyJsonProductSeed } from "../products/product-seed"
import type { Product, ProductCurrency } from "../products/types"
import type {
  CommerceDataSnapshot,
  Customer,
  CustomerActivity,
  CustomerRegion,
  CustomerSegment,
  Order,
  OrderLine,
  OrderStatus,
  PaymentStatus,
} from "./types"

const SEGMENTS: readonly CustomerSegment[] = ["new", "returning", "vip"]
const REGIONS: readonly CustomerRegion[] = ["north", "central", "south", "east"]
const ORDER_STATUSES: readonly OrderStatus[] = [
  "delivered",
  "delivered",
  "shipped",
  "processing",
  "action_needed",
]
const PAYMENT_STATUSES: readonly PaymentStatus[] = [
  "paid",
  "paid",
  "paid",
  "pending",
  "failed",
]

const roundMoney = (amount: number) => Math.round(amount * 100) / 100

const money = (amount: number, currency: ProductCurrency) => ({
  amount: roundMoney(amount),
  currency,
})

const createCustomers = (): Customer[] =>
  Array.from({ length: 28 }, (_, index) => {
    const customerNumber = 1001 + index
    const segment = SEGMENTS[index % SEGMENTS.length]
    const region = REGIONS[index % REGIONS.length]
    const createdAt = new Date(
      Date.UTC(2024, index % 12, 3 + (index % 20), 8)
    ).toISOString()
    return {
      id: `CUST-${customerNumber}`,
      status: index === 25 ? "suspended" : "active",
      segment,
      region,
      contact: {
        fullName: `測試客戶 ${customerNumber}`,
        email: `customer${customerNumber}@example.test`,
        phone: `09${String(10000000 + index).padStart(8, "0")}`,
        addressLine: `測試路 ${index + 1} 號`,
        city: ["台北市", "台中市", "高雄市", "花蓮縣"][index % 4],
        postalCode: String(100 + (index % 4) * 100),
        countryCode: "TW",
      },
      tags:
        segment === "vip"
          ? [
              { kind: "safe", value: "high_value" },
              { kind: "safe", value: "repeat_buyer" },
            ]
          : segment === "returning"
            ? [{ kind: "safe", value: "repeat_buyer" }]
            : [{ kind: "safe", value: "new_customer" }],
      createdAt,
      updatedAt: index === 25 ? "2026-08-15T09:00:00.000Z" : createdAt,
      suspendedAt: index === 25 ? "2026-08-15T09:00:00.000Z" : null,
    }
  })

const orderDate = (index: number) => {
  const monthOffset = index % 13
  const day = 3 + ((index * 7) % 24)
  return new Date(Date.UTC(2025, 7 + monthOffset, day, 2 + (index % 16), 0, 0))
}

const createOrderLine = (
  orderId: string,
  lineIndex: number,
  product: Product
): OrderLine => {
  const quantity = 1 + ((lineIndex + product.id) % 3)
  const { amount: nativeUnitAmount, currency } = product.price
  const gross = nativeUnitAmount * quantity
  const discountAmount = lineIndex % 3 === 0 ? roundMoney(gross * 0.05) : 0
  return {
    id: `${orderId}-L${lineIndex + 1}`,
    orderId,
    productId: product.id,
    sku: product.sku,
    title: product.title,
    unitPrice: { amount: nativeUnitAmount, currency },
    quantity,
    discount: money(discountAmount, currency),
    subtotal: money(gross - discountAmount, currency),
  }
}

export const createCommerceSeed = (
  products: readonly Product[] = createDummyJsonProductSeed()
): CommerceDataSnapshot => {
  if (products.length === 0) {
    throw new Error("Commerce seed requires at least one product.")
  }
  const customers = createCustomers()
  const orders: Order[] = []
  const orderLines: OrderLine[] = []
  const activities: CustomerActivity[] = customers.flatMap(
    (customer, index) => [
      {
        id: `ACT-CREATE-${index + 1}`,
        customerId: customer.id,
        type: "customer_created",
        occurredAt: customer.createdAt,
        reasonCode: null,
      },
      ...(customer.suspendedAt
        ? [
            {
              id: `ACT-SUSPEND-${index + 1}`,
              customerId: customer.id,
              type: "customer_suspended" as const,
              occurredAt: customer.suspendedAt,
              reasonCode: "manual_review",
            },
          ]
        : []),
    ]
  )

  for (let index = 0; index < 65; index += 1) {
    const customer =
      customers[
        (index * 5 + Math.floor(index / customers.length)) % customers.length
      ]
    const createdAt = orderDate(index)
    const orderId = `VM-${25001 + index}`
    const preferredCurrency: ProductCurrency = index % 4 === 0 ? "TWD" : "USD"
    const preferredProducts = products.filter(
      (product) => product.price.currency === preferredCurrency
    )
    const currencyProducts =
      preferredProducts.length > 0
        ? preferredProducts
        : products.filter(
            (product) => product.price.currency === products[0].price.currency
          )
    const currency = currencyProducts[0].price.currency
    const lineCount = 1 + (index % 3)
    const lines = Array.from({ length: lineCount }, (_, lineIndex) => {
      const product =
        currencyProducts[(index * 3 + lineIndex * 7) % currencyProducts.length]
      return createOrderLine(orderId, lineIndex, product)
    })
    const subtotal = roundMoney(
      lines.reduce((total, line) => total + line.subtotal.amount, 0)
    )
    const orderDiscount = index % 6 === 0 ? roundMoney(subtotal * 0.08) : 0
    const shippingThreshold = currency === "USD" ? 120 : 3_600
    const shipping =
      subtotal >= shippingThreshold ? 0 : currency === "USD" ? 6 : 180
    const tax = roundMoney((subtotal - orderDiscount) * 0.05)
    const total = roundMoney(subtotal - orderDiscount + shipping + tax)
    const status = ORDER_STATUSES[index % ORDER_STATUSES.length]
    const paymentStatus = PAYMENT_STATUSES[index % PAYMENT_STATUSES.length]
    const updatedAt = new Date(createdAt.getTime() + 86_400_000).toISOString()

    orderLines.push(...lines)
    orders.push({
      id: orderId,
      customerId: customer.id,
      customerSnapshot: {
        segment: customer.segment,
        region: customer.region,
      },
      status,
      paymentStatus,
      paymentMethodCategory: ["card", "bank_transfer", "cash_on_delivery"][
        index % 3
      ] as Order["paymentMethodCategory"],
      fulfillmentStatus:
        status === "delivered"
          ? "fulfilled"
          : status === "shipped"
            ? "in_transit"
            : status === "action_needed"
              ? "exception"
              : "picking",
      amounts: {
        subtotal: money(subtotal, currency),
        discount: money(orderDiscount, currency),
        shipping: money(shipping, currency),
        tax: money(tax, currency),
        total: money(total, currency),
      },
      timeline: [
        {
          id: `${orderId}-T1`,
          status: "order_created",
          occurredAt: createdAt.toISOString(),
        },
        {
          id: `${orderId}-T2`,
          status: paymentStatus,
          occurredAt: updatedAt,
        },
      ],
      createdAt: createdAt.toISOString(),
      updatedAt,
    })
    activities.push({
      id: `ACT-ORDER-${index + 1}`,
      customerId: customer.id,
      type: "order_placed",
      occurredAt: createdAt.toISOString(),
      reasonCode: null,
    })
  }

  return {
    customers,
    orders,
    orderLines,
    notes: [],
    activities,
  }
}
