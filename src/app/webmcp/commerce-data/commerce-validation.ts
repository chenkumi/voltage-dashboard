import { PRODUCT_CURRENCIES, type ProductCurrency } from "../products/types"
import {
  CUSTOMER_REGIONS,
  CUSTOMER_ACTIVITY_TYPES,
  CUSTOMER_SAFE_TAGS,
  CUSTOMER_SEGMENTS,
  CUSTOMER_STATUSES,
  FULFILLMENT_STATUSES,
  ORDER_STATUSES,
  PAYMENT_METHOD_CATEGORIES,
  PAYMENT_STATUSES,
  type Customer,
  type CustomerActivity,
  type CustomerNote,
  type CustomerWriteInput,
  type Money,
  type Order,
  type OrderLine,
} from "./types"
import { allocateOrderLinePaidAmounts } from "./order-paid-allocation"

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const HTML_PATTERN = /<\/?[a-z][^>]*>/i
export const CUSTOMER_ID_PATTERN = /^CUST-([1-9]\d{0,14})$/

export class CommerceValidationError extends Error {
  readonly code:
    | "INVALID_CUSTOMER"
    | "DUPLICATE_EMAIL"
    | "INVALID_NOTE"
    | "INVALID_STATUS"
    | "INVALID_SEED"

  constructor(code: CommerceValidationError["code"], message: string) {
    super(message)
    this.name = "CommerceValidationError"
    this.code = code
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && Boolean(value.trim())

const hasExactKeys = (
  value: Record<string, unknown>,
  keys: readonly string[]
) =>
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key))

const CUSTOMER_INPUT_KEYS = ["segment", "region", "contact", "tags"] as const
const CUSTOMER_KEYS = [
  "id",
  "status",
  ...CUSTOMER_INPUT_KEYS,
  "createdAt",
  "updatedAt",
  "suspendedAt",
] as const
const CONTACT_KEYS = [
  "fullName",
  "email",
  "phone",
  "addressLine",
  "city",
  "postalCode",
  "countryCode",
] as const
const MONEY_KEYS = ["amount", "currency"] as const
const ORDER_LINE_KEYS = [
  "id",
  "orderId",
  "productId",
  "sku",
  "title",
  "unitPrice",
  "quantity",
  "discount",
  "subtotal",
  "paidAmount",
  "paidUnitAmounts",
] as const
const ORDER_KEYS = [
  "id",
  "customerId",
  "customerSnapshot",
  "status",
  "paymentStatus",
  "paymentMethodCategory",
  "fulfillmentStatus",
  "amounts",
  "timeline",
  "createdAt",
  "updatedAt",
] as const

const isProductCurrency = (value: unknown): value is ProductCurrency =>
  typeof value === "string" &&
  PRODUCT_CURRENCIES.includes(value as ProductCurrency)

const isMoney = (value: unknown): value is Money =>
  isRecord(value) &&
  hasExactKeys(value, MONEY_KEYS) &&
  typeof value.amount === "number" &&
  Number.isFinite(value.amount) &&
  isProductCurrency(value.currency)

const isCentAmount = (amount: number) =>
  Number.isFinite(amount) && Number(amount.toFixed(2)) === amount

const isIsoTimestamp = (value: unknown): value is string => {
  if (typeof value !== "string") return false
  const timestamp = Date.parse(value)
  return (
    Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
  )
}

const sameCentAmount = (left: number, right: number) =>
  isCentAmount(left) &&
  isCentAmount(right) &&
  Math.round(left * 100) === Math.round(right * 100)

const roundMoney = (amount: number) => Math.round(amount * 100) / 100

const isOrderLine = (line: unknown): line is OrderLine =>
  isRecord(line) &&
  hasExactKeys(line, ORDER_LINE_KEYS) &&
  typeof line.id === "string" &&
  /^VM-\d+-L\d+$/.test(line.id) &&
  typeof line.orderId === "string" &&
  /^VM-\d+$/.test(line.orderId) &&
  Number.isInteger(line.productId) &&
  Number(line.productId) > 0 &&
  isNonEmptyString(line.sku) &&
  isNonEmptyString(line.title) &&
  isMoney(line.unitPrice) &&
  typeof line.quantity === "number" &&
  isMoney(line.discount) &&
  isMoney(line.subtotal) &&
  isMoney(line.paidAmount) &&
  Array.isArray(line.paidUnitAmounts) &&
  line.paidUnitAmounts.every(isMoney)

export function assertValidOrderLines(
  lines: readonly unknown[]
): asserts lines is readonly OrderLine[] {
  if (!Array.isArray(lines) || !lines.every(isOrderLine)) {
    throw new CommerceValidationError(
      "INVALID_SEED",
      "Commerce seed contains an invalid order line."
    )
  }
}

export const normalizeEmail = (email: string) =>
  email.trim().toLocaleLowerCase()

export function assertValidCustomerInput(
  input: unknown
): asserts input is CustomerWriteInput {
  if (
    !isRecord(input) ||
    !hasExactKeys(input, CUSTOMER_INPUT_KEYS) ||
    !isRecord(input.contact) ||
    !hasExactKeys(input.contact, CONTACT_KEYS) ||
    !Array.isArray(input.tags)
  ) {
    throw new CommerceValidationError(
      "INVALID_CUSTOMER",
      "Customer fields are incomplete or invalid."
    )
  }
  const contact = input.contact
  const tagsAreValid = input.tags.every(
    (tag) =>
      isRecord(tag) &&
      hasExactKeys(tag, ["kind", "value"]) &&
      ((tag.kind === "safe" &&
        typeof tag.value === "string" &&
        CUSTOMER_SAFE_TAGS.includes(
          tag.value as (typeof CUSTOMER_SAFE_TAGS)[number]
        )) ||
        (tag.kind === "custom" &&
          isNonEmptyString(tag.value) &&
          tag.value.trim().length <= 50 &&
          !HTML_PATTERN.test(tag.value)))
  )
  if (
    !CUSTOMER_SEGMENTS.includes(
      input.segment as (typeof CUSTOMER_SEGMENTS)[number]
    ) ||
    !CUSTOMER_REGIONS.includes(
      input.region as (typeof CUSTOMER_REGIONS)[number]
    ) ||
    !isNonEmptyString(contact.fullName) ||
    typeof contact.email !== "string" ||
    !EMAIL_PATTERN.test(normalizeEmail(contact.email)) ||
    !isNonEmptyString(contact.phone) ||
    !isNonEmptyString(contact.addressLine) ||
    !isNonEmptyString(contact.city) ||
    !isNonEmptyString(contact.postalCode) ||
    contact.countryCode !== "TW" ||
    !tagsAreValid
  ) {
    throw new CommerceValidationError(
      "INVALID_CUSTOMER",
      "Customer fields are incomplete or invalid."
    )
  }
}

export const normalizeCustomerInput = (input: unknown): CustomerWriteInput => {
  assertValidCustomerInput(input)
  const tags = input.tags.reduce<CustomerWriteInput["tags"][number][]>(
    (normalizedTags, tag) => {
      const normalized =
        tag.kind === "custom"
          ? { kind: "custom" as const, value: tag.value.trim() }
          : { kind: "safe" as const, value: tag.value }
      if (
        !normalizedTags.some(
          (existing) =>
            existing.kind === normalized.kind &&
            existing.value === normalized.value
        )
      ) {
        normalizedTags.push(normalized)
      }
      return normalizedTags
    },
    []
  )
  return {
    segment: input.segment,
    region: input.region,
    contact: {
      fullName: input.contact.fullName.trim(),
      email: normalizeEmail(input.contact.email),
      phone: input.contact.phone.trim(),
      addressLine: input.contact.addressLine.trim(),
      city: input.contact.city.trim(),
      postalCode: input.contact.postalCode.trim(),
      countryCode: "TW",
    },
    tags,
  }
}

export const assertPlainTextNote = (text: unknown) => {
  if (typeof text !== "string") {
    throw new CommerceValidationError(
      "INVALID_NOTE",
      "Notes must be plain text between 1 and 2,000 characters."
    )
  }
  const normalized = text.trim()
  if (
    !normalized ||
    normalized.length > 2_000 ||
    HTML_PATTERN.test(normalized)
  ) {
    throw new CommerceValidationError(
      "INVALID_NOTE",
      "Notes must be plain text between 1 and 2,000 characters."
    )
  }
  return normalized
}

const assertValidOrderShape = (
  value: unknown,
  lines: readonly unknown[],
  customer: unknown
): { order: Order; orderLines: readonly OrderLine[]; customer: Customer } => {
  assertValidOrderLines(lines)
  if (
    !isRecord(value) ||
    !isRecord(customer) ||
    !isRecord(value.customerSnapshot) ||
    !hasExactKeys(value, ORDER_KEYS) ||
    !hasExactKeys(value.customerSnapshot, ["segment", "region"]) ||
    !isRecord(value.amounts) ||
    !hasExactKeys(value.amounts, [
      "subtotal",
      "discount",
      "shipping",
      "tax",
      "total",
    ]) ||
    !isMoney(value.amounts.subtotal) ||
    !isMoney(value.amounts.discount) ||
    !isMoney(value.amounts.shipping) ||
    !isMoney(value.amounts.tax) ||
    !isMoney(value.amounts.total) ||
    !Array.isArray(value.timeline) ||
    typeof value.id !== "string" ||
    !/^VM-\d+$/.test(value.id) ||
    typeof value.customerId !== "string" ||
    !CUSTOMER_ID_PATTERN.test(value.customerId) ||
    !isIsoTimestamp(value.createdAt) ||
    !isIsoTimestamp(value.updatedAt) ||
    value.createdAt > value.updatedAt ||
    !value.timeline.every(
      (entry) =>
        isRecord(entry) &&
        hasExactKeys(entry, ["id", "status", "occurredAt"]) &&
        typeof entry.id === "string" &&
        /^VM-\d+-T\d+$/.test(entry.id) &&
        entry.id.startsWith(`${String(value.id)}-T`) &&
        isNonEmptyString(entry.status) &&
        isIsoTimestamp(entry.occurredAt) &&
        entry.occurredAt >= String(value.createdAt) &&
        entry.occurredAt <= String(value.updatedAt)
    ) ||
    new Set(value.timeline.filter(isRecord).map((entry) => String(entry.id)))
      .size !== value.timeline.length
  ) {
    throw new CommerceValidationError(
      "INVALID_SEED",
      "Commerce seed contains an invalid order shape."
    )
  }
  const order = value as unknown as Order
  return {
    order,
    orderLines: lines.filter(
      (line): line is OrderLine => isRecord(line) && line.orderId === order.id
    ),
    customer: customer as unknown as Customer,
  }
}

export const assertValidOrder = (
  value: unknown,
  lines: readonly unknown[],
  customerValue: unknown
) => {
  const { order, orderLines, customer } = assertValidOrderShape(
    value,
    lines,
    customerValue
  )
  const currency = order.amounts.total.currency
  const amounts = [
    order.amounts.subtotal,
    order.amounts.discount,
    order.amounts.shipping,
    order.amounts.tax,
    order.amounts.total,
  ]
  const subtotal = roundMoney(
    orderLines.reduce((total, line) => total + line.subtotal.amount, 0)
  )
  const expectedTotal = roundMoney(
    order.amounts.subtotal.amount -
      order.amounts.discount.amount +
      order.amounts.shipping.amount +
      order.amounts.tax.amount
  )
  const paidLineTotal = roundMoney(
    orderLines.reduce((total, line) => total + line.paidAmount.amount, 0)
  )
  let expectedPaidAllocations:
    | ReturnType<typeof allocateOrderLinePaidAmounts>
    | null = null
  try {
    expectedPaidAllocations = allocateOrderLinePaidAmounts(orderLines, {
      amount: roundMoney(
        order.amounts.total.amount - order.amounts.shipping.amount
      ),
      currency,
    })
  } catch {
    expectedPaidAllocations = null
  }
  if (
    typeof order.id !== "string" ||
    order.customerId !== customer.id ||
    !CUSTOMER_SEGMENTS.includes(order.customerSnapshot.segment) ||
    !CUSTOMER_REGIONS.includes(order.customerSnapshot.region) ||
    !ORDER_STATUSES.includes(order.status) ||
    !PAYMENT_STATUSES.includes(order.paymentStatus) ||
    !PAYMENT_METHOD_CATEGORIES.includes(order.paymentMethodCategory) ||
    !FULFILLMENT_STATUSES.includes(order.fulfillmentStatus) ||
    !isProductCurrency(currency) ||
    orderLines.length === 0 ||
    orderLines.some((line) => {
      const gross = line.unitPrice.amount * line.quantity
      const expectedPaid = expectedPaidAllocations?.get(line.id)
      return (
        !Number.isInteger(line.quantity) ||
        line.quantity <= 0 ||
        line.unitPrice.amount < 0 ||
        !Number.isFinite(line.unitPrice.amount) ||
        line.discount.amount < 0 ||
        !isCentAmount(line.discount.amount) ||
        line.discount.amount > gross ||
        line.subtotal.amount < 0 ||
        !sameCentAmount(
          line.subtotal.amount,
          roundMoney(gross - line.discount.amount)
        ) ||
        line.unitPrice.currency !== currency ||
        line.discount.currency !== currency ||
        line.subtotal.currency !== currency ||
        line.paidAmount.currency !== currency ||
        line.paidAmount.amount < 0 ||
        !isCentAmount(line.paidAmount.amount) ||
        line.paidUnitAmounts.length !== line.quantity ||
        line.paidUnitAmounts.some(
          (amount) =>
            amount.currency !== currency ||
            amount.amount < 0 ||
            !isCentAmount(amount.amount)
        ) ||
        !sameCentAmount(
          line.paidAmount.amount,
          roundMoney(
            line.paidUnitAmounts.reduce(
              (total, amount) => total + amount.amount,
              0
            )
          )
        ) ||
        !expectedPaid ||
        !sameCentAmount(
          line.paidAmount.amount,
          expectedPaid.paidAmount.amount
        ) ||
        line.paidUnitAmounts.some(
          (amount, index) =>
            !sameCentAmount(
              amount.amount,
              expectedPaid.paidUnitAmounts[index]?.amount ?? Number.NaN
            )
        ) ||
        !line.id.startsWith(`${order.id}-L`)
      )
    }) ||
    amounts.some(
      (amount) =>
        amount.currency !== currency ||
        amount.amount < 0 ||
        !isCentAmount(amount.amount)
    ) ||
    !sameCentAmount(order.amounts.subtotal.amount, subtotal) ||
    order.amounts.discount.amount > order.amounts.subtotal.amount ||
    expectedPaidAllocations === null ||
    !sameCentAmount(
      roundMoney(paidLineTotal + order.amounts.shipping.amount),
      order.amounts.total.amount
    ) ||
    !sameCentAmount(order.amounts.total.amount, expectedTotal)
  ) {
    throw new CommerceValidationError(
      "INVALID_SEED",
      `Order ${order.id} has an invalid relationship or amount breakdown.`
    )
  }
}

export function assertValidStoredCustomer(
  value: unknown
): asserts value is Customer {
  if (
    !isRecord(value) ||
    (!hasExactKeys(value, CUSTOMER_KEYS) &&
      !hasExactKeys(value, [...CUSTOMER_KEYS, "normalizedEmail"])) ||
    !isRecord(value.contact) ||
    !hasExactKeys(value.contact, CONTACT_KEYS) ||
    !Array.isArray(value.tags) ||
    !value.tags.every(
      (tag) => isRecord(tag) && hasExactKeys(tag, ["kind", "value"])
    )
  ) {
    throw new CommerceValidationError(
      "INVALID_SEED",
      "Commerce seed contains an invalid customer shape."
    )
  }
  assertValidCustomerInput({
    segment: value.segment,
    region: value.region,
    contact: value.contact,
    tags: value.tags,
  })
  const record = value as CustomerWriteInput & Record<string, unknown>
  if (
    typeof record.id !== "string" ||
    !CUSTOMER_ID_PATTERN.test(record.id) ||
    !CUSTOMER_STATUSES.includes(
      record.status as (typeof CUSTOMER_STATUSES)[number]
    ) ||
    !isIsoTimestamp(record.createdAt) ||
    !isIsoTimestamp(record.updatedAt) ||
    record.createdAt > record.updatedAt
  ) {
    throw new CommerceValidationError(
      "INVALID_SEED",
      "Commerce seed contains an invalid customer shape."
    )
  }
  const hasValidSuspensionState =
    record.status === "active"
      ? record.suspendedAt === null
      : typeof record.suspendedAt === "string" &&
        isIsoTimestamp(record.suspendedAt) &&
        (record.createdAt as string) <= record.suspendedAt &&
        record.suspendedAt <= (record.updatedAt as string)
  if (!hasValidSuspensionState) {
    throw new CommerceValidationError(
      "INVALID_SEED",
      `Customer ${record.id} has an invalid status.`
    )
  }
}

export function assertValidCustomerNote(
  value: unknown
): asserts value is CustomerNote {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "id",
      "customerId",
      "text",
      "createdAt",
      "updatedAt",
    ]) ||
    typeof value.id !== "string" ||
    !/^NOTE-[A-Za-z0-9-]+$/.test(value.id) ||
    typeof value.customerId !== "string" ||
    !CUSTOMER_ID_PATTERN.test(value.customerId) ||
    !isIsoTimestamp(value.createdAt) ||
    !isIsoTimestamp(value.updatedAt) ||
    value.createdAt > value.updatedAt
  ) {
    throw new CommerceValidationError(
      "INVALID_SEED",
      "Commerce seed contains an invalid customer note."
    )
  }
  assertPlainTextNote(value.text)
}

export function assertValidCustomerActivity(
  value: unknown
): asserts value is CustomerActivity {
  const requiresReason =
    isRecord(value) &&
    (value.type === "customer_suspended" || value.type === "customer_restored")
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "id",
      "customerId",
      "type",
      "occurredAt",
      "reasonCode",
    ]) ||
    typeof value.id !== "string" ||
    !/^ACT-[A-Za-z0-9-]+$/.test(value.id) ||
    typeof value.customerId !== "string" ||
    !CUSTOMER_ID_PATTERN.test(value.customerId) ||
    !CUSTOMER_ACTIVITY_TYPES.includes(
      value.type as (typeof CUSTOMER_ACTIVITY_TYPES)[number]
    ) ||
    !isIsoTimestamp(value.occurredAt) ||
    !(requiresReason
      ? isNonEmptyString(value.reasonCode) &&
        /^[a-z0-9_]+$/.test(value.reasonCode)
      : value.reasonCode === null)
  ) {
    throw new CommerceValidationError(
      "INVALID_SEED",
      "Commerce seed contains an invalid customer activity."
    )
  }
}
