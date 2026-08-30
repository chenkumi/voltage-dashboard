import type { Money, OrderLine } from "../commerce-data/types"
import {
  allocateOrderLinePaidAmounts,
  fromMinorUnits,
  toMinorUnits,
} from "../commerce-data/order-paid-allocation"
import { assertReturnMoney, ReturnValidationError } from "./return-validation"
import type {
  RefundCalculation,
  RefundCalculationItem,
  ReturnReason,
} from "./types"

export type RefundableInspectionItem = {
  returnItemId: string
  orderLineId: string
  acceptedQuantity: number
}

export type SuccessfulRefund = {
  rmaId: string
  orderId: string
  currency: Money["currency"]
  items: readonly {
    orderLineId: string
    refundedUnitIndexes: readonly number[]
    amount: Money
  }[]
  shippingAmount: Money
}

export type CalculateRefundInput = {
  calculationId: string
  rmaId: string
  orderId: string
  reason: ReturnReason
  rmaVersion: number
  inspectionVersion: number
  orderSnapshotVersion: number
  calculationVersion: number
  orderTotal: Money
  orderShipping: Money
  orderLines: readonly OrderLine[]
  items: readonly RefundableInspectionItem[]
  successfulRefunds: readonly SuccessfulRefund[]
  createdAt: string
}

const shippingRefundReasons = new Set<ReturnReason>([
  "defective",
  "damaged",
  "wrong_item",
  "missing_parts",
])

const money = (minorUnits: number, currency: Money["currency"]): Money => ({
  amount: fromMinorUnits(minorUnits),
  currency,
})

const uniqueUnitIndexes = (indexes: readonly number[]) =>
  new Set(indexes).size === indexes.length

export const calculateRefund = (
  input: CalculateRefundInput
): RefundCalculation => {
  const currency = input.orderTotal.currency
  assertReturnMoney(input.orderTotal)
  assertReturnMoney(input.orderShipping, currency)
  if (
    input.orderShipping.amount > input.orderTotal.amount ||
    !Number.isInteger(input.rmaVersion) ||
    input.rmaVersion <= 0 ||
    !Number.isInteger(input.inspectionVersion) ||
    input.inspectionVersion <= 0 ||
    !Number.isInteger(input.orderSnapshotVersion) ||
    input.orderSnapshotVersion <= 0 ||
    !Number.isInteger(input.calculationVersion) ||
    input.calculationVersion <= 0
  ) {
    throw new ReturnValidationError(
      "INVALID_RETURN",
      "Refund calculation versions or order totals are invalid."
    )
  }

  const orderLines = new Map<string, OrderLine>()
  let merchandisePaidMinor = 0
  for (const line of input.orderLines) {
    if (line.orderId !== input.orderId || orderLines.has(line.id)) {
      throw new ReturnValidationError(
        "INVALID_RETURN",
        "Refund calculation order lines must uniquely belong to the order."
      )
    }
    if (
      !Number.isInteger(line.quantity) ||
      line.quantity <= 0 ||
      !Number.isFinite(line.unitPrice.amount) ||
      line.unitPrice.amount < 0 ||
      line.unitPrice.currency !== currency
    ) {
      throw new ReturnValidationError(
        "INVALID_RETURN",
        "Order line price or quantity is invalid."
      )
    }
    assertReturnMoney(line.discount, currency)
    assertReturnMoney(line.subtotal, currency)
    if (
      toMinorUnits(line.subtotal.amount) !==
      Math.round(
        (line.unitPrice.amount * line.quantity - line.discount.amount) * 100
      )
    ) {
      throw new ReturnValidationError(
        "INVALID_MONEY",
        "Order line subtotal does not match price, quantity, and discount."
      )
    }
    assertReturnMoney(line.paidAmount, currency)
    if (line.paidUnitAmounts.length !== line.quantity) {
      throw new ReturnValidationError(
        "INVALID_RETURN",
        "Order line unit allocation does not match its quantity."
      )
    }
    const unitTotalMinor = line.paidUnitAmounts.reduce((sum, amount) => {
      assertReturnMoney(amount, currency)
      return sum + toMinorUnits(amount.amount)
    }, 0)
    if (unitTotalMinor !== toMinorUnits(line.paidAmount.amount)) {
      throw new ReturnValidationError(
        "INVALID_MONEY",
        "Order line unit allocation does not match its paid amount."
      )
    }
    merchandisePaidMinor += unitTotalMinor
    orderLines.set(line.id, line)
  }
  if (
    orderLines.size === 0 ||
    merchandisePaidMinor + toMinorUnits(input.orderShipping.amount) !==
      toMinorUnits(input.orderTotal.amount)
  ) {
    throw new ReturnValidationError(
      "INVALID_MONEY",
      "Order line allocations do not reconcile to the order total."
    )
  }
  const expectedAllocations = allocateOrderLinePaidAmounts(input.orderLines, {
    amount: fromMinorUnits(merchandisePaidMinor),
    currency,
  })
  for (const line of input.orderLines) {
    const expected = expectedAllocations.get(line.id)
    if (
      !expected ||
      toMinorUnits(expected.paidAmount.amount) !==
        toMinorUnits(line.paidAmount.amount) ||
      expected.paidUnitAmounts.some(
        (amount, index) =>
          toMinorUnits(amount.amount) !==
          toMinorUnits(line.paidUnitAmounts[index]?.amount ?? Number.NaN)
      )
    ) {
      throw new ReturnValidationError(
        "INVALID_MONEY",
        "Order line paid allocation is not deterministic."
      )
    }
  }

  const refundedUnits = new Map<string, Set<number>>()
  const refundedRmas = new Set<string>()
  let alreadyRefundedMinor = 0
  let shippingAlreadyRefunded = false
  for (const refund of input.successfulRefunds) {
    if (refund.orderId !== input.orderId) continue
    if (refund.rmaId === input.rmaId || refundedRmas.has(refund.rmaId)) {
      throw new ReturnValidationError(
        "INVALID_RETURN",
        "Successful refund records must be unique prior RMAs."
      )
    }
    refundedRmas.add(refund.rmaId)
    if (refund.currency !== currency) {
      throw new ReturnValidationError(
        "INVALID_MONEY",
        "Successful refunds must use the original order currency."
      )
    }
    assertReturnMoney(refund.shippingAmount, currency)
    if (
      refund.shippingAmount.amount !== 0 &&
      toMinorUnits(refund.shippingAmount.amount) !==
        toMinorUnits(input.orderShipping.amount)
    ) {
      throw new ReturnValidationError(
        "INVALID_MONEY",
        "Successful shipping refunds must be zero or the original shipping amount."
      )
    }
    if (refund.shippingAmount.amount > 0 && shippingAlreadyRefunded) {
      throw new ReturnValidationError(
        "INVALID_MONEY",
        "Original shipping can be refunded successfully only once."
      )
    }
    shippingAlreadyRefunded ||= refund.shippingAmount.amount > 0
    alreadyRefundedMinor += toMinorUnits(refund.shippingAmount.amount)
    const refundLines = new Set<string>()
    for (const item of refund.items) {
      assertReturnMoney(item.amount, currency)
      const orderLine = orderLines.get(item.orderLineId)
      if (
        !orderLine ||
        refundLines.has(item.orderLineId) ||
        !uniqueUnitIndexes(item.refundedUnitIndexes)
      ) {
        throw new ReturnValidationError(
          "INVALID_RETURN",
          "Successful refund lines and unit indexes must be valid and unique."
        )
      }
      refundLines.add(item.orderLineId)
      const indexes = refundedUnits.get(item.orderLineId) ?? new Set<number>()
      let expectedAmountMinor = 0
      for (const index of item.refundedUnitIndexes) {
        if (
          !Number.isInteger(index) ||
          index < 0 ||
          index >= orderLine.paidUnitAmounts.length ||
          indexes.has(index)
        ) {
          throw new ReturnValidationError(
            "INVALID_RETURN",
            "A paid order unit cannot be refunded more than once."
          )
        }
        indexes.add(index)
        expectedAmountMinor += toMinorUnits(
          orderLine.paidUnitAmounts[index].amount
        )
      }
      if (toMinorUnits(item.amount.amount) !== expectedAmountMinor) {
        throw new ReturnValidationError(
          "INVALID_MONEY",
          "Successful refund amount does not match the original paid units."
        )
      }
      refundedUnits.set(item.orderLineId, indexes)
      alreadyRefundedMinor += toMinorUnits(item.amount.amount)
    }
  }

  const seenLines = new Set<string>()
  const calculationItems: RefundCalculationItem[] = []
  let itemRefundMinor = 0
  for (const item of input.items) {
    if (seenLines.has(item.orderLineId)) {
      throw new ReturnValidationError(
        "INVALID_RETURN",
        "A return calculation may include each order line once."
      )
    }
    seenLines.add(item.orderLineId)
    const orderLine = orderLines.get(item.orderLineId)
    if (!orderLine) {
      throw new ReturnValidationError(
        "INVALID_RETURN",
        "Return item does not belong to the order snapshot."
      )
    }
    if (
      !Number.isInteger(item.acceptedQuantity) ||
      item.acceptedQuantity < 0
    ) {
      throw new ReturnValidationError(
        "INVALID_QUANTITY",
        "Accepted quantity must be a non-negative whole number."
      )
    }
    const previouslyRefunded = refundedUnits.get(item.orderLineId) ?? new Set()
    const availableUnitIndexes = orderLine.paidUnitAmounts
      .map((_, index) => index)
      .filter((index) => !previouslyRefunded.has(index))
    if (item.acceptedQuantity > availableUnitIndexes.length) {
      throw new ReturnValidationError(
        "INVALID_QUANTITY",
        "Accepted quantity exceeds the remaining refundable quantity."
      )
    }
    const refundedUnitIndexes = availableUnitIndexes.slice(
      0,
      item.acceptedQuantity
    )
    const amountMinor = refundedUnitIndexes.reduce(
      (sum, index) =>
        sum + toMinorUnits(orderLine.paidUnitAmounts[index].amount),
      0
    )
    itemRefundMinor += amountMinor
    calculationItems.push({
      returnItemId: item.returnItemId,
      orderLineId: item.orderLineId,
      acceptedQuantity: item.acceptedQuantity,
      refundedUnitIndexes,
      amount: money(amountMinor, currency),
    })
  }

  const shippingMinor =
    shippingRefundReasons.has(input.reason) && !shippingAlreadyRefunded
      ? toMinorUnits(input.orderShipping.amount)
      : 0
  const totalMinor = itemRefundMinor + shippingMinor
  const orderTotalMinor = toMinorUnits(input.orderTotal.amount)
  if (
    totalMinor < 0 ||
    alreadyRefundedMinor + totalMinor > orderTotalMinor
  ) {
    throw new ReturnValidationError(
      "INVALID_MONEY",
      "Refund exceeds the order's remaining paid amount."
    )
  }

  return {
    id: input.calculationId,
    rmaId: input.rmaId,
    orderId: input.orderId,
    rmaVersion: input.rmaVersion,
    inspectionVersion: input.inspectionVersion,
    orderSnapshotVersion: input.orderSnapshotVersion,
    version: input.calculationVersion,
    items: calculationItems,
    shippingAmount: money(shippingMinor, currency),
    total: money(totalMinor, currency),
    createdAt: input.createdAt,
  }
}
