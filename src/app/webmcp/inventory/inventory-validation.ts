import {
  INVENTORY_REASON_CODES,
  type InventoryAdjustmentInput,
  type InventoryMovement,
} from "./types"

const HTML_PATTERN = /<\/?[a-z][^>]*>/i
const MOVEMENT_KEYS = [
  "id",
  "productId",
  "type",
  "reasonCode",
  "previousStock",
  "nextStock",
  "delta",
  "occurredAt",
  "source",
  "note",
] as const

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

const hasExactKeys = (value: Record<string, unknown>) =>
  Object.keys(value).length === MOVEMENT_KEYS.length &&
  MOVEMENT_KEYS.every((key) => Object.hasOwn(value, key))

export class InventoryValidationError extends Error {
  readonly code:
    "INVALID_ADJUSTMENT" | "INSUFFICIENT_STOCK" | "INVALID_MOVEMENT"

  constructor(code: InventoryValidationError["code"], message: string) {
    super(message)
    this.name = "InventoryValidationError"
    this.code = code
  }
}

const validReason = (value: unknown) =>
  typeof value === "string" &&
  INVENTORY_REASON_CODES.includes(
    value as (typeof INVENTORY_REASON_CODES)[number]
  )

const validNote = (value: unknown) =>
  value === undefined ||
  value === null ||
  (typeof value === "string" &&
    value.trim().length <= 500 &&
    !HTML_PATTERN.test(value))

export const normalizeInventoryAdjustment = (
  value: InventoryAdjustmentInput
): InventoryAdjustmentInput => {
  if (
    !value ||
    typeof value !== "object" ||
    !validReason(value.reasonCode) ||
    !validNote(value.note)
  ) {
    throw new InventoryValidationError(
      "INVALID_ADJUSTMENT",
      "Inventory adjustment is invalid."
    )
  }
  if (
    value.type === "reconciliation" &&
    value.reasonCode === "cycle_count" &&
    Number.isInteger(value.targetStock) &&
    value.targetStock >= 0
  ) {
    return { ...value, note: value.note?.trim() || null }
  }
  if (
    (value.type === "receipt" || value.type === "issue") &&
    ((value.type === "receipt" && value.reasonCode === "purchase_receipt") ||
      (value.type === "issue" &&
        ["customer_order", "damaged_goods"].includes(value.reasonCode))) &&
    Number.isInteger(value.quantity) &&
    value.quantity > 0
  ) {
    return { ...value, note: value.note?.trim() || null }
  }
  throw new InventoryValidationError(
    "INVALID_ADJUSTMENT",
    "Inventory adjustment is invalid."
  )
}

export function assertValidInventoryMovement(
  value: unknown
): asserts value is InventoryMovement {
  if (!isRecord(value) || !hasExactKeys(value)) {
    throw new InventoryValidationError("INVALID_MOVEMENT", "Invalid movement.")
  }
  const movement = value as InventoryMovement
  const timestamp = Date.parse(movement.occurredAt)
  const reasonMatchesType =
    (movement.type === "receipt" &&
      ["purchase_receipt", "initial_stock"].includes(movement.reasonCode)) ||
    (movement.type === "issue" &&
      ["customer_order", "damaged_goods"].includes(movement.reasonCode)) ||
    (movement.type === "reconciliation" &&
      ["cycle_count", "initial_stock", "legacy_stock_set"].includes(
        movement.reasonCode
      ))
  const deltaMatchesType =
    (movement.type === "receipt" && movement.delta > 0) ||
    (movement.type === "issue" && movement.delta < 0) ||
    movement.type === "reconciliation"
  if (
    !/^INV-[A-Za-z0-9-]+$/.test(movement.id) ||
    !Number.isInteger(movement.productId) ||
    movement.productId <= 0 ||
    !["receipt", "issue", "reconciliation"].includes(movement.type) ||
    !validReason(movement.reasonCode) ||
    !reasonMatchesType ||
    !Number.isInteger(movement.previousStock) ||
    movement.previousStock < 0 ||
    !Number.isInteger(movement.nextStock) ||
    movement.nextStock < 0 ||
    movement.delta !== movement.nextStock - movement.previousStock ||
    !deltaMatchesType ||
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString() !== movement.occurredAt ||
    !["seed", "manual"].includes(movement.source) ||
    !validNote(movement.note)
  ) {
    throw new InventoryValidationError("INVALID_MOVEMENT", "Invalid movement.")
  }
}
