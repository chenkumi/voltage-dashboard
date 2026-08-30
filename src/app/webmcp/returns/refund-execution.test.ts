import { describe, expect, it } from "vitest"
import { createCommerceSeed } from "../commerce-data/commerce-seed"
import { ProductRepository } from "../products/product-repository"
import { ReturnRepository } from "./return-repository"

describe("refund and inventory execution boundaries", () => {
  it("recovers safely when inventory succeeds before RMA completion is recorded", async () => {
    const commerce = createCommerceSeed()
    const productDatabase = `refund-products-${crypto.randomUUID()}`
    const returnDatabase = `refund-returns-${crypto.randomUUID()}`
    const products = new ProductRepository({ databaseName: productDatabase })
    const returns = new ReturnRepository({
      databaseName: returnDatabase,
      commerceSnapshot: commerce,
      orderSnapshotVersion: 3,
    })
    await products.initialize()
    await returns.initialize()
    try {
      const seededRma = (await returns.getSnapshot()).rmas.find(
        (rma) => rma.eligibility.status === "authorized"
      )!
      const seededItem = (await returns.getSnapshot()).items.find(
        (item) => item.rmaId === seededRma.id
      )!
      await returns.recordReceipt(
        seededRma.id,
        { packageCount: 1, result: "complete" },
        "user"
      )
      await returns.startInspection(seededRma.id, "user")
      await returns.completeInspection(
        seededRma.id,
        [
          {
            returnItemId: seededItem.id,
            receivedQuantity: 1,
            acceptedQuantity: 1,
            condition: "opened",
            packaging: "intact",
            missingContents: false,
            rejectionReason: null,
            inventoryDisposition: "restock",
            inspectionNote: "Verified return item.",
            inspectedBy: "ops-user",
          },
        ],
        "user"
      )
      const before = await products.get(seededItem.productId)
      const first = await products.receiveCustomerReturn(seededItem.productId, {
        quantity: 1,
        returnItemId: seededItem.id,
      })
      const retry = await products.receiveCustomerReturn(seededItem.productId, {
        quantity: 1,
        returnItemId: seededItem.id,
      })
      await returns.recordRestockCompletion(
        seededItem.id,
        retry.movement,
        "user"
      )

      expect(first.created).toBe(true)
      expect(retry.created).toBe(false)
      expect((await products.get(seededItem.productId))?.stock).toBe(
        (before?.stock ?? 0) + 1
      )
      expect(
        (await returns.getSnapshot()).items.find(
          (item) => item.id === seededItem.id
        )
      ).toMatchObject({
        inventoryDispositionStatus: "completed",
        inventoryMovementId: first.movement.id,
      })
    } finally {
      await returns.deleteDatabaseForTests()
      await products.deleteDatabaseForTests()
    }
  })
})
