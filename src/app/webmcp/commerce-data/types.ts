import type { ProductCurrency } from "../products/types"

export const CUSTOMER_STATUSES = ["active", "suspended"] as const
export const CUSTOMER_SEGMENTS = ["new", "returning", "vip"] as const
export const CUSTOMER_REGIONS = ["north", "central", "south", "east"] as const
export const CUSTOMER_SAFE_TAGS = [
  "new_customer",
  "repeat_buyer",
  "high_value",
  "at_risk",
] as const

export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number]
export type CustomerSegment = (typeof CUSTOMER_SEGMENTS)[number]
export type CustomerRegion = (typeof CUSTOMER_REGIONS)[number]
export type CustomerSafeTag = (typeof CUSTOMER_SAFE_TAGS)[number]

export type CustomerTag =
  { kind: "safe"; value: CustomerSafeTag } | { kind: "custom"; value: string }

export type Money = {
  amount: number
  currency: ProductCurrency
}

export type CustomerContact = {
  fullName: string
  email: string
  phone: string
  addressLine: string
  city: string
  postalCode: string
  countryCode: "TW"
}

export type Customer = {
  id: string
  status: CustomerStatus
  segment: CustomerSegment
  region: CustomerRegion
  contact: CustomerContact
  tags: readonly CustomerTag[]
  createdAt: string
  updatedAt: string
  suspendedAt: string | null
}

export type CustomerWriteInput = Pick<
  Customer,
  "segment" | "region" | "contact" | "tags"
>

export type CustomerNote = {
  id: string
  customerId: string
  text: string
  createdAt: string
  updatedAt: string
}

export const CUSTOMER_ACTIVITY_TYPES = [
  "customer_created",
  "customer_updated",
  "customer_suspended",
  "customer_restored",
  "note_added",
  "order_placed",
] as const

export type CustomerActivityType = (typeof CUSTOMER_ACTIVITY_TYPES)[number]

export type CustomerActivity = {
  id: string
  customerId: string
  type: CustomerActivityType
  occurredAt: string
  reasonCode: string | null
}

export const ORDER_STATUSES = [
  "processing",
  "shipped",
  "delivered",
  "action_needed",
] as const
export const PAYMENT_STATUSES = [
  "paid",
  "pending",
  "failed",
  "refunded",
] as const
export const PAYMENT_METHOD_CATEGORIES = [
  "card",
  "bank_transfer",
  "cash_on_delivery",
] as const
export const FULFILLMENT_STATUSES = [
  "unfulfilled",
  "picking",
  "in_transit",
  "fulfilled",
  "exception",
] as const

export type OrderStatus = (typeof ORDER_STATUSES)[number]
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]
export type PaymentMethodCategory = (typeof PAYMENT_METHOD_CATEGORIES)[number]
export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number]

export type OrderCustomerSnapshot = {
  segment: CustomerSegment
  region: CustomerRegion
}

export type OrderTimelineEntry = {
  id: string
  status: string
  occurredAt: string
}

export type OrderTimeline = readonly OrderTimelineEntry[]

export type OrderAmountBreakdown = {
  subtotal: Money
  discount: Money
  shipping: Money
  tax: Money
  total: Money
}

export type Order = {
  id: string
  customerId: string
  customerSnapshot: OrderCustomerSnapshot
  status: OrderStatus
  paymentStatus: PaymentStatus
  paymentMethodCategory: PaymentMethodCategory
  fulfillmentStatus: FulfillmentStatus
  amounts: OrderAmountBreakdown
  timeline: OrderTimeline
  createdAt: string
  updatedAt: string
}

export type OrderLine = {
  id: string
  orderId: string
  productId: number
  sku: string
  title: string
  unitPrice: Money
  quantity: number
  discount: Money
  subtotal: Money
}

export type CommerceDataSnapshot = {
  customers: readonly Customer[]
  orders: readonly Order[]
  orderLines: readonly OrderLine[]
  notes: readonly CustomerNote[]
  activities: readonly CustomerActivity[]
}

export type CommerceMutation = {
  type:
    | "initialize"
    | "customer_create"
    | "customer_update"
    | "customer_suspend"
    | "customer_restore"
    | "note_add"
    | "note_update"
  customerId?: string
  version: number
}
