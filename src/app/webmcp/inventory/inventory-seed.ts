import type { Product } from "../products/types"
import type { InventoryMovement } from "./types"

const monthTimestamp = (monthOffset: number, productId: number) =>
  new Date(
    Date.UTC(2025, 7 + monthOffset, 5 + (productId % 20), 3, 0, 0)
  ).toISOString()

export const createInventoryMovementSeed = (
  products: readonly Product[]
): InventoryMovement[] =>
  products.flatMap((product) => {
    let stock = product.stock + 20 + (product.id % 10)
    const movements: InventoryMovement[] = []
    for (let month = 0; month < 12; month += 1) {
      const isReceipt = (month + product.id) % 3 === 0
      const quantity = 1 + ((month + product.id) % 4)
      const delta = isReceipt ? quantity : -Math.min(quantity, stock)
      const nextStock = stock + delta
      movements.push({
        id: `INV-SEED-${product.id}-${String(month + 1).padStart(2, "0")}`,
        productId: product.id,
        type: isReceipt ? "receipt" : "issue",
        reasonCode: isReceipt ? "purchase_receipt" : "customer_order",
        previousStock: stock,
        nextStock,
        delta,
        occurredAt: monthTimestamp(month, product.id),
        source: "seed",
        note: null,
      })
      stock = nextStock
    }
    movements.push({
      id: `INV-SEED-${product.id}-13`,
      productId: product.id,
      type: "reconciliation",
      reasonCode: "cycle_count",
      previousStock: stock,
      nextStock: product.stock,
      delta: product.stock - stock,
      occurredAt: monthTimestamp(12, product.id),
      source: "seed",
      note: null,
    })
    return movements
  })
