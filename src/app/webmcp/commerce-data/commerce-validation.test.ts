import { describe, expect, it } from "vitest"
import { createCommerceSeed } from "./commerce-seed"
import {
  assertValidOrder,
  CommerceValidationError,
} from "./commerce-validation"

describe("commerce paid amount validation", () => {
  it("accepts seeded line and unit allocations", () => {
    const snapshot = createCommerceSeed()
    const order = snapshot.orders[0]
    const customer = snapshot.customers.find(
      (candidate) => candidate.id === order.customerId
    )

    expect(() =>
      assertValidOrder(order, snapshot.orderLines, customer)
    ).not.toThrow()
  })

  it("rejects an allocation that no longer reconciles to the order total", () => {
    const snapshot = createCommerceSeed()
    const order = snapshot.orders[0]
    const customer = snapshot.customers.find(
      (candidate) => candidate.id === order.customerId
    )
    const lines = structuredClone(snapshot.orderLines)
    const line = lines.find((candidate) => candidate.orderId === order.id)!
    line.paidAmount.amount += 0.01

    expect(() => assertValidOrder(order, lines, customer)).toThrowError(
      CommerceValidationError
    )
  })

  it("rejects a unit allocation that differs from its line paid amount", () => {
    const snapshot = createCommerceSeed()
    const order = snapshot.orders.find((candidate) =>
      snapshot.orderLines.some(
        (line) => line.orderId === candidate.id && line.quantity > 1
      )
    )!
    const customer = snapshot.customers.find(
      (candidate) => candidate.id === order.customerId
    )
    const lines = structuredClone(snapshot.orderLines)
    const line = lines.find(
      (candidate) => candidate.orderId === order.id && candidate.quantity > 1
    )!
    line.paidUnitAmounts[0].amount += 0.01

    expect(() => assertValidOrder(order, lines, customer)).toThrowError(
      CommerceValidationError
    )
  })

  it("rejects line allocations that reconcile only at the order total", () => {
    const snapshot = createCommerceSeed()
    const order = snapshot.orders.find(
      (candidate) =>
        snapshot.orderLines.filter((line) => line.orderId === candidate.id)
          .length > 1
    )!
    const customer = snapshot.customers.find(
      (candidate) => candidate.id === order.customerId
    )
    const lines = structuredClone(snapshot.orderLines)
    const orderLines = lines.filter((line) => line.orderId === order.id)
    const [first, second] = orderLines
    first.paidAmount.amount += 0.01
    first.paidUnitAmounts[0].amount += 0.01
    second.paidAmount.amount -= 0.01
    second.paidUnitAmounts[0].amount -= 0.01

    expect(() => assertValidOrder(order, lines, customer)).toThrowError(
      CommerceValidationError
    )
  })
})
