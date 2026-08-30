import type { Order, OrderLine } from "../commerce-data/types"
import type {
  InventoryMovement,
  InventoryPeriod,
  InventoryPeriodSummary,
  InventoryRisk,
  InventoryRiskSettings,
} from "./types"

const addUtc = (date: Date, period: InventoryPeriod, amount: number) => {
  const result = new Date(date)
  if (period === "week") result.setUTCDate(result.getUTCDate() + amount * 7)
  if (period === "month") result.setUTCMonth(result.getUTCMonth() + amount)
  if (period === "year") result.setUTCFullYear(result.getUTCFullYear() + amount)
  return result
}

const periodStart = (at: Date, period: InventoryPeriod) => {
  const start = new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate())
  )
  if (period === "week") {
    const mondayOffset = (start.getUTCDay() + 6) % 7
    start.setUTCDate(start.getUTCDate() - mondayOffset)
  }
  if (period === "month") start.setUTCDate(1)
  if (period === "year") {
    start.setUTCMonth(0)
    start.setUTCDate(1)
  }
  return start
}

const summarizeRange = (
  productId: number,
  period: InventoryPeriod,
  movements: readonly InventoryMovement[],
  start: Date,
  end: Date
) => {
  const startAt = start.toISOString()
  const endAt = end.toISOString()
  const before = movements
    .filter(
      (movement) =>
        movement.productId === productId && movement.occurredAt < startAt
    )
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
  const within = movements
    .filter(
      (movement) =>
        movement.productId === productId &&
        movement.occurredAt >= startAt &&
        movement.occurredAt < endAt
    )
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
  const openingStock = within[0]?.previousStock ?? before.at(-1)?.nextStock ?? 0
  const closingStock = within.at(-1)?.nextStock ?? openingStock
  return {
    productId,
    period,
    startAt,
    endAt,
    openingStock,
    closingStock,
    received: within
      .filter((movement) => movement.type === "receipt")
      .reduce((sum, movement) => sum + movement.delta, 0),
    issued: within
      .filter((movement) => movement.type === "issue")
      .reduce((sum, movement) => sum + Math.abs(movement.delta), 0),
    reconciled: within
      .filter((movement) => movement.type === "reconciliation")
      .reduce((sum, movement) => sum + movement.delta, 0),
    netChange: closingStock - openingStock,
    dataStatus:
      within.length > 0 || before.length > 0 ? "ready" : "insufficient_history",
  } as const
}

export const selectInventoryPeriodSummary = (
  productId: number,
  movements: readonly InventoryMovement[],
  period: InventoryPeriod,
  at: Date
): InventoryPeriodSummary => {
  const start = periodStart(at, period)
  const end = addUtc(start, period, 1)
  const previousStart = addUtc(start, period, -1)
  const current = summarizeRange(productId, period, movements, start, end)
  const previous = summarizeRange(
    productId,
    period,
    movements,
    previousStart,
    start
  )
  return {
    ...current,
    changeRate:
      current.openingStock === 0
        ? null
        : current.netChange / current.openingStock,
    previousClosingStock:
      previous.dataStatus === "ready" ? previous.closingStock : null,
    previousNetChange:
      previous.dataStatus === "ready" ? previous.netChange : null,
  }
}

export const selectAverageDailySales = (
  productId: number,
  orders: readonly Order[],
  lines: readonly OrderLine[],
  endAt: Date,
  days = 90
) => {
  const startAt = new Date(endAt.getTime() - days * 86_400_000).toISOString()
  const end = endAt.toISOString()
  const hasFullCoverage = orders.some((order) => order.createdAt <= startAt)
  const eligibleOrderIds = new Set(
    orders
      .filter(
        (order) =>
          order.createdAt >= startAt &&
          order.createdAt < end &&
          order.status !== "action_needed"
      )
      .map((order) => order.id)
  )
  const units = lines
    .filter(
      (line) =>
        line.productId === productId && eligibleOrderIds.has(line.orderId)
    )
    .reduce((sum, line) => sum + line.quantity, 0)
  return hasFullCoverage
    ? { status: "ready" as const, unitsPerDay: units / days }
    : { status: "insufficient_history" as const, unitsPerDay: null }
}

export const selectInventoryRisks = (
  stock: number,
  periodDelta: number,
  averageDailySales: number | null,
  settings: InventoryRiskSettings
): {
  risks: readonly InventoryRisk[]
  estimatedDaysOfSupply: number | null
} => {
  const days =
    averageDailySales && averageDailySales > 0
      ? stock / averageDailySales
      : null
  const risks: InventoryRisk[] = []
  if (stock === 0) risks.push("out_of_stock")
  else if (stock <= settings.lowStockThreshold) risks.push("low_stock")
  if (stock >= settings.overstockThreshold) risks.push("overstock")
  if (Math.abs(periodDelta) >= settings.unusualAbsoluteDelta) {
    risks.push("unusual_change")
  }
  if (days !== null && days <= settings.reorderDaysThreshold) {
    risks.push("reorder_risk")
  }
  if (risks.length === 0) risks.push("healthy")
  return { risks, estimatedDaysOfSupply: days }
}
