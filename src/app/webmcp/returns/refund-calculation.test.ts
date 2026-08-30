import { describe, expect, it } from "vitest"
import type { CalculateRefundInput } from "./refund-calculation"
import { calculateRefund } from "./refund-calculation"
import { ReturnValidationError } from "./return-validation"

const baseInput = (): CalculateRefundInput => ({
  calculationId: "CALC-1001",
  rmaId: "RMA-1001",
  orderId: "VM-25001",
  reason: "defective",
  rmaVersion: 2,
  inspectionVersion: 1,
  orderSnapshotVersion: 3,
  calculationVersion: 1,
  orderTotal: { amount: 30.04, currency: "USD" },
  orderShipping: { amount: 6, currency: "USD" },
  orderLines: [
    {
      id: "VM-25001-L1",
      orderId: "VM-25001",
      productId: 1,
      sku: "SKU-1",
      title: "Test product",
      unitPrice: { amount: 8.02, currency: "USD" },
      quantity: 3,
      discount: { amount: 0, currency: "USD" },
      subtotal: { amount: 24.06, currency: "USD" },
      paidAmount: { amount: 24.04, currency: "USD" },
      paidUnitAmounts: [
        { amount: 8.02, currency: "USD" },
        { amount: 8.01, currency: "USD" },
        { amount: 8.01, currency: "USD" },
      ],
    },
  ],
  items: [
    {
      returnItemId: "RMI-1001",
      orderLineId: "VM-25001-L1",
      acceptedQuantity: 2,
    },
  ],
  successfulRefunds: [],
  createdAt: "2026-08-31T00:00:00.000Z",
})

describe("calculateRefund", () => {
  it("refunds accepted units at their deterministic original paid amounts", () => {
    const result = calculateRefund(baseInput())

    expect(result.items[0]).toMatchObject({
      acceptedQuantity: 2,
      refundedUnitIndexes: [0, 1],
      amount: { amount: 16.03, currency: "USD" },
    })
    expect(result.shippingAmount.amount).toBe(6)
    expect(result.total.amount).toBe(22.03)
  })

  it("uses only inspection-accepted quantity and preserves unaccepted units", () => {
    const input = baseInput()
    input.items[0].acceptedQuantity = 1

    expect(calculateRefund(input).items[0]).toMatchObject({
      refundedUnitIndexes: [0],
      amount: { amount: 8.02, currency: "USD" },
    })
  })

  it("continues from units refunded by another RMA and never repeats shipping", () => {
    const input = baseInput()
    input.items[0].acceptedQuantity = 1
    input.successfulRefunds = [
      {
        rmaId: "RMA-0999",
        orderId: input.orderId,
        currency: "USD",
        items: [
          {
            orderLineId: "VM-25001-L1",
            refundedUnitIndexes: [0],
            amount: { amount: 8.02, currency: "USD" },
          },
        ],
        shippingAmount: { amount: 6, currency: "USD" },
      },
    ]

    const result = calculateRefund(input)
    expect(result.items[0]).toMatchObject({
      refundedUnitIndexes: [1],
      amount: { amount: 8.01, currency: "USD" },
    })
    expect(result.shippingAmount.amount).toBe(0)
  })

  it("rejects quantities above the remaining refundable units", () => {
    const input = baseInput()
    input.successfulRefunds = [
      {
        rmaId: "RMA-0999",
        orderId: input.orderId,
        currency: "USD",
        items: [
          {
            orderLineId: "VM-25001-L1",
            refundedUnitIndexes: [0, 1],
            amount: { amount: 16.03, currency: "USD" },
          },
        ],
        shippingAmount: { amount: 0, currency: "USD" },
      },
    ]

    expect(() => calculateRefund(input)).toThrowError(ReturnValidationError)
  })

  it("rejects cross-currency and order-overpayment attempts", () => {
    const crossCurrency = baseInput()
    crossCurrency.orderLines[0].paidUnitAmounts = [
      { amount: 8.02, currency: "TWD" },
      ...crossCurrency.orderLines[0].paidUnitAmounts.slice(1),
    ]
    expect(() => calculateRefund(crossCurrency)).toThrowError(
      ReturnValidationError
    )

    const aboveOrderTotal = baseInput()
    aboveOrderTotal.orderTotal.amount = 20
    expect(() => calculateRefund(aboveOrderTotal)).toThrowError(
      /do not reconcile to the order total/
    )
  })

  it("rejects forged historical unit, amount, and shipping facts", () => {
    const variants = [
      {
        refundedUnitIndexes: [3],
        amount: { amount: 8.01, currency: "USD" as const },
        shippingAmount: { amount: 0, currency: "USD" as const },
      },
      {
        refundedUnitIndexes: [0],
        amount: { amount: 8.01, currency: "USD" as const },
        shippingAmount: { amount: 0, currency: "USD" as const },
      },
      {
        refundedUnitIndexes: [0],
        amount: { amount: 8.02, currency: "USD" as const },
        shippingAmount: { amount: 3, currency: "USD" as const },
      },
    ]

    for (const variant of variants) {
      const input = baseInput()
      input.successfulRefunds = [
        {
          rmaId: "RMA-0999",
          orderId: input.orderId,
          currency: "USD",
          items: [
            {
              orderLineId: "VM-25001-L1",
              refundedUnitIndexes: variant.refundedUnitIndexes,
              amount: variant.amount,
            },
          ],
          shippingAmount: variant.shippingAmount,
        },
      ]
      expect(() => calculateRefund(input)).toThrowError(ReturnValidationError)
    }
  })

  it("rejects histories that refunded original shipping more than once", () => {
    const input = baseInput()
    input.items[0].acceptedQuantity = 0
    input.successfulRefunds = ["RMA-0998", "RMA-0999"].map((rmaId) => ({
      rmaId,
      orderId: input.orderId,
      currency: "USD" as const,
      items: [],
      shippingAmount: { amount: 6, currency: "USD" as const },
    }))

    expect(() => calculateRefund(input)).toThrowError(
      /shipping can be refunded successfully only once/
    )
  })

  it("derives current refund amounts only from the order snapshot", () => {
    const input = baseInput()
    input.orderLines[0].paidUnitAmounts = [
      { amount: 24.04, currency: "USD" },
      { amount: 0, currency: "USD" },
      { amount: 0, currency: "USD" },
    ]

    expect(() => calculateRefund(input)).toThrowError(
      /paid allocation is not deterministic/
    )
  })
})
