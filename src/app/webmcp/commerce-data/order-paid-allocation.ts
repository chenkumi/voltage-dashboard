import type { Money, OrderLine } from "./types"

const MINOR_UNIT_FACTOR = 100

export const toMinorUnits = (amount: number) => {
  const minorUnits = Math.round(amount * MINOR_UNIT_FACTOR)
  if (
    !Number.isFinite(amount) ||
    amount < 0 ||
    !Number.isSafeInteger(minorUnits)
  ) {
    throw new Error("Money exceeds the safe minor-unit range.")
  }
  return minorUnits
}

export const fromMinorUnits = (amount: number) => amount / MINOR_UNIT_FACTOR

const allocateMinorUnits = (
  total: number,
  weightedIds: readonly { id: string; weight: number }[]
) => {
  if (!Number.isInteger(total) || total < 0) {
    throw new Error("Allocation total must be a non-negative minor-unit value.")
  }
  if (
    weightedIds.length === 0 ||
    weightedIds.some(({ weight }) => !Number.isInteger(weight) || weight < 0)
  ) {
    throw new Error(
      "Allocation weights must be non-negative minor-unit values."
    )
  }
  const weightTotal = weightedIds.reduce(
    (sum, weightedId) => sum + BigInt(weightedId.weight),
    0n
  )
  if (weightTotal === 0n) {
    if (total === 0) return new Map(weightedIds.map(({ id }) => [id, 0]))
    throw new Error("A positive allocation requires a positive weight.")
  }

  const allocations = weightedIds.map(({ id, weight }) => {
    const numerator = BigInt(total) * BigInt(weight)
    return {
      id,
      amount: Number(numerator / weightTotal),
      remainder: numerator % weightTotal,
    }
  })
  let undistributed =
    total - allocations.reduce((sum, allocation) => sum + allocation.amount, 0)
  const remainderOrder = [...allocations].sort(
    (left, right) =>
      (left.remainder === right.remainder
        ? 0
        : left.remainder > right.remainder
          ? -1
          : 1) || left.id.localeCompare(right.id)
  )
  for (let index = 0; undistributed > 0; index += 1) {
    remainderOrder[index % remainderOrder.length].amount += 1
    undistributed -= 1
  }
  return new Map(allocations.map(({ id, amount }) => [id, amount]))
}

export const allocateOrderLinePaidAmounts = (
  lines: readonly Pick<OrderLine, "id" | "quantity" | "subtotal">[],
  merchandisePaidAmount: Money
) => {
  const currency = merchandisePaidAmount.currency
  if (
    lines.some(
      (line) =>
        line.subtotal.currency !== currency ||
        !Number.isInteger(line.quantity) ||
        line.quantity <= 0
    )
  ) {
    throw new Error(
      "Order lines must use one currency and positive quantities."
    )
  }

  const paidByLine = allocateMinorUnits(
    toMinorUnits(merchandisePaidAmount.amount),
    lines.map((line) => ({
      id: line.id,
      weight: toMinorUnits(line.subtotal.amount),
    }))
  )

  return new Map(
    lines.map((line) => {
      const linePaid = paidByLine.get(line.id) ?? 0
      const unitWeights = Array.from({ length: line.quantity }, (_, index) => ({
        id: `${line.id}-U${String(index + 1).padStart(4, "0")}`,
        weight: 1,
      }))
      const unitAllocation = allocateMinorUnits(linePaid, unitWeights)
      const paidUnitAmounts = unitWeights.map(({ id }) => ({
        amount: fromMinorUnits(unitAllocation.get(id) ?? 0),
        currency,
      }))
      return [
        line.id,
        {
          paidAmount: {
            amount: fromMinorUnits(linePaid),
            currency,
          },
          paidUnitAmounts,
        },
      ] as const
    })
  )
}
