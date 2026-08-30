export const INVENTORY_MOVEMENT_TYPES = [
  "receipt",
  "issue",
  "reconciliation",
] as const

export const INVENTORY_REASON_CODES = [
  "purchase_receipt",
  "customer_order",
  "damaged_goods",
  "cycle_count",
  "initial_stock",
  "legacy_stock_set",
] as const

export type InventoryMovementType = (typeof INVENTORY_MOVEMENT_TYPES)[number]
export type InventoryReasonCode = (typeof INVENTORY_REASON_CODES)[number]
export type InventoryAdjustmentReasonCode = Exclude<
  InventoryReasonCode,
  "initial_stock" | "legacy_stock_set"
>

export type InventoryMovement = {
  id: string
  productId: number
  type: InventoryMovementType
  reasonCode: InventoryReasonCode
  previousStock: number
  nextStock: number
  delta: number
  occurredAt: string
  source: "seed" | "manual"
  note: string | null
}

export type InventoryAdjustmentInput =
  | {
      type: "receipt"
      quantity: number
      reasonCode: "purchase_receipt"
      note?: string | null
    }
  | {
      type: "issue"
      quantity: number
      reasonCode: "customer_order" | "damaged_goods"
      note?: string | null
    }
  | {
      type: "reconciliation"
      targetStock: number
      reasonCode: "cycle_count"
      note?: string | null
    }

export type InventoryPeriod = "week" | "month" | "year"

export type InventoryPeriodSummary = {
  productId: number
  period: InventoryPeriod
  startAt: string
  endAt: string
  openingStock: number
  closingStock: number
  received: number
  issued: number
  reconciled: number
  netChange: number
  changeRate: number | null
  previousClosingStock: number | null
  previousNetChange: number | null
  dataStatus: "ready" | "insufficient_history"
}

export type InventoryRisk =
  | "out_of_stock"
  | "low_stock"
  | "overstock"
  | "unusual_change"
  | "reorder_risk"
  | "healthy"

export type InventoryRiskSettings = {
  lowStockThreshold: number
  overstockThreshold: number
  unusualAbsoluteDelta: number
  reorderDaysThreshold: number
}
