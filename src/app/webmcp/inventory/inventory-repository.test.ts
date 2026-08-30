import Dexie from "dexie"
import { afterEach, describe, expect, it } from "vitest"
import { ProductRepository } from "../products/product-repository"
import { ProductStore } from "../products/product-store"
import type { Product } from "../products/types"
import { createInventoryMovementSeed } from "./inventory-seed"
import { InventoryValidationError } from "./inventory-validation"

const names: string[] = []

const product = (stock = 20): Product => ({
  id: 1,
  sku: "INV-TEST-1",
  title: "Inventory test product",
  brand: "Voltage",
  category: "test",
  price: { amount: 100, currency: "TWD" },
  stock,
  description: "Inventory test product description.",
  shortAdCopy: "Inventory test",
  longAdCopy: "Inventory test advertising copy.",
  images: [
    {
      id: "image-1",
      url: "https://example.com/inventory.webp",
      alt: "Inventory test",
      position: 0,
      isPrimary: true,
    },
  ],
  specifications: [],
  reviews: [],
  status: "published",
  archivedFromStatus: null,
  createdAt: "2025-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
})

const repository = (options: { createId?: () => string } = {}) => {
  const databaseName = `inventory-${crypto.randomUUID()}`
  names.push(databaseName)
  return new ProductRepository({
    databaseName,
    seed: [product()],
    now: () => "2026-08-30T08:00:00.000Z",
    ...options,
  })
}

afterEach(async () => {
  await Promise.all(names.splice(0).map((name) => Dexie.delete(name)))
})

describe("inventory repository", () => {
  it("creates deterministic 13-month history ending at current stock", () => {
    const movements = createInventoryMovementSeed([product(37)])

    expect(movements).toHaveLength(13)
    expect(
      new Set(movements.map((movement) => movement.occurredAt.slice(0, 7))).size
    ).toBe(13)
    expect(movements[0].occurredAt).toBe("2025-08-06T03:00:00.000Z")
    expect(movements.at(-1)?.nextStock).toBe(37)
    expect(movements.every((movement) => movement.nextStock >= 0)).toBe(true)
  })

  it("migrates a version-one database without losing product changes", async () => {
    const databaseName = `inventory-${crypto.randomUUID()}`
    names.push(databaseName)
    const legacy = new Dexie(databaseName)
    legacy.version(1).stores({
      products: "id, &sku, status, category, updatedAt",
      metadata: "key",
    })
    await legacy.table("products").add({ ...product(41), title: "User title" })
    await legacy.table("metadata").add({
      key: "seed",
      version: 1,
      initializedAt: "2026-08-01T00:00:00.000Z",
    })
    legacy.close()

    const migrated = new ProductRepository({
      databaseName,
      seed: [product()],
      now: () => "2026-08-30T08:00:00.000Z",
    })
    await migrated.initialize()

    expect(await migrated.get(1)).toMatchObject({
      title: "User title",
      stock: 41,
    })
    const movements = await migrated.listInventoryMovements(1)
    expect(movements).toHaveLength(13)
    expect(movements[0].nextStock).toBe(41)
    migrated.close()
  })

  it("commits stock and one immutable movement in the same transaction", async () => {
    let id = 0
    const repo = repository({ createId: () => `manual-${++id}` })
    await repo.initialize()
    const before = await repo.listInventoryMovements(1)

    const result = await repo.adjustInventory(1, {
      type: "issue",
      quantity: 4,
      reasonCode: "customer_order",
      note: " manual adjustment ",
    })

    expect(result.product.stock).toBe(16)
    expect(result.movement).toMatchObject({
      previousStock: 20,
      nextStock: 16,
      delta: -4,
      note: "manual adjustment",
    })
    expect(await repo.listInventoryMovements(1)).toHaveLength(before.length + 1)
  })

  it("rolls back the product update when movement persistence fails", async () => {
    const repo = repository({ createId: () => "collision" })
    await repo.initialize()
    await repo.adjustInventory(1, {
      type: "receipt",
      quantity: 2,
      reasonCode: "purchase_receipt",
    })

    await expect(
      repo.adjustInventory(1, {
        type: "receipt",
        quantity: 3,
        reasonCode: "purchase_receipt",
      })
    ).rejects.toBeTruthy()
    expect(await repo.get(1)).toMatchObject({ stock: 22 })
  })

  it("rejects invalid and excessive adjustments without partial writes", async () => {
    const repo = repository()
    await repo.initialize()
    const count = (await repo.listInventoryMovements(1)).length

    await expect(
      repo.adjustInventory(1, {
        type: "issue",
        quantity: 21,
        reasonCode: "customer_order",
      })
    ).rejects.toBeInstanceOf(InventoryValidationError)
    await expect(
      repo.adjustInventory(1, {
        type: "receipt",
        quantity: 0,
        reasonCode: "purchase_receipt",
      })
    ).rejects.toBeInstanceOf(InventoryValidationError)
    expect(await repo.get(1)).toMatchObject({ stock: 20 })
    expect(await repo.listInventoryMovements(1)).toHaveLength(count)
  })

  it("rejects internal reason codes on the public adjustment boundary", async () => {
    const repo = repository()
    await repo.initialize()

    await expect(
      repo.adjustInventory(1, {
        type: "reconciliation",
        targetStock: 25,
        reasonCode: "legacy_stock_set",
      } as never)
    ).rejects.toBeInstanceOf(InventoryValidationError)
    await expect(
      repo.adjustInventory(1, {
        type: "receipt",
        quantity: 1,
        reasonCode: "initial_stock",
      } as never)
    ).rejects.toBeInstanceOf(InventoryValidationError)
  })

  it("records create, product update, and setStock without stock bypasses", async () => {
    let id = 0
    const repo = repository({ createId: () => `path-${++id}` })
    const store = new ProductStore(repo)
    await store.initialize()
    const source = product(5)
    const {
      id: _id,
      status: _status,
      archivedFromStatus: _archivedFromStatus,
      reviews: _reviews,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      ...input
    } = source
    void [_id, _status, _archivedFromStatus, _reviews, _createdAt, _updatedAt]
    const before = (await repo.listInventoryMovements()).length
    const created = await repo.create(
      { ...input, sku: "CREATED-STOCK" },
      "draft"
    )
    expect(await repo.listInventoryMovements(created.id)).toHaveLength(1)

    await repo.update(created.id, { ...input, sku: "CREATED-STOCK", stock: 8 })
    await repo.setStock(created.id, 3)

    expect(await repo.listInventoryMovements(created.id)).toHaveLength(3)
    expect((await repo.listInventoryMovements()).length).toBe(before + 3)
    expect(
      store.getSnapshot().products.find((item) => item.id === created.id)
    ).toMatchObject({ stock: 3 })
    store.dispose()
  })

  it("rejects a corrupted movement chain during normal readback", async () => {
    const databaseName = `inventory-${crypto.randomUUID()}`
    names.push(databaseName)
    const repo = new ProductRepository({
      databaseName,
      seed: [product()],
      now: () => "2026-08-30T08:00:00.000Z",
    })
    await repo.initialize()
    const movement = (await repo.listInventoryMovements(1))[5]
    const raw = new Dexie(databaseName)
    raw.version(2).stores({
      products: "id, &sku, status, category, updatedAt",
      metadata: "key",
      inventoryMovements:
        "id, productId, type, reasonCode, occurredAt, [productId+occurredAt]",
    })
    await raw.table("inventoryMovements").update(movement.id, {
      previousStock: movement.previousStock + 1,
      delta: movement.delta - 1,
    })
    raw.close()

    await expect(repo.listInventoryMovements(1)).rejects.toEqual(
      expect.objectContaining({ code: "INVALID_SEED" })
    )
    repo.close()
  })

  it("validates the existing chain before appending an adjustment", async () => {
    const databaseName = `inventory-${crypto.randomUUID()}`
    names.push(databaseName)
    const repo = new ProductRepository({
      databaseName,
      seed: [product()],
      now: () => "2026-08-30T08:00:00.000Z",
    })
    await repo.initialize()
    const movement = (await repo.listInventoryMovements(1))[5]
    const raw = new Dexie(databaseName)
    raw.version(2).stores({
      products: "id, &sku, status, category, updatedAt",
      metadata: "key",
      inventoryMovements:
        "id, productId, type, reasonCode, occurredAt, [productId+occurredAt]",
    })
    await raw.table("inventoryMovements").update(movement.id, {
      previousStock: movement.previousStock + 1,
      delta: movement.delta - 1,
    })
    raw.close()

    await expect(
      repo.adjustInventory(1, {
        type: "receipt",
        quantity: 1,
        reasonCode: "purchase_receipt",
      })
    ).rejects.toEqual(expect.objectContaining({ code: "INVALID_SEED" }))
    expect(await repo.get(1)).toMatchObject({ stock: 20 })
    repo.close()
  })

  it("uses the later of product and movement timestamps", async () => {
    const databaseName = `inventory-${crypto.randomUUID()}`
    names.push(databaseName)
    const repo = new ProductRepository({
      databaseName,
      seed: [product()],
      now: () => "2026-09-15T00:00:00.000Z",
      createId: () => "later-bound",
    })
    await repo.initialize()
    const raw = new Dexie(databaseName)
    raw.version(2).stores({
      products: "id, &sku, status, category, updatedAt",
      metadata: "key",
      inventoryMovements:
        "id, productId, type, reasonCode, occurredAt, [productId+occurredAt]",
    })
    await raw.table("products").update(1, {
      updatedAt: "2026-09-20T00:00:00.000Z",
    })
    raw.close()

    const result = await repo.adjustInventory(1, {
      type: "receipt",
      quantity: 1,
      reasonCode: "purchase_receipt",
    })

    expect(result.product.updatedAt).toBe("2026-09-20T00:00:00.001Z")
    expect(result.movement.occurredAt).toBe("2026-09-20T00:00:00.001Z")
    repo.close()
  })

  it("rejects invalid movement filters and invalid migration clocks", async () => {
    const repo = repository()
    await repo.initialize()
    await expect(repo.listInventoryMovements(0)).rejects.toEqual(
      expect.objectContaining({ code: "PRODUCT_NOT_FOUND" })
    )
    await expect(repo.listInventoryMovements(Number.NaN)).rejects.toEqual(
      expect.objectContaining({ code: "PRODUCT_NOT_FOUND" })
    )

    const databaseName = `inventory-${crypto.randomUUID()}`
    names.push(databaseName)
    const invalidClock = new ProductRepository({
      databaseName,
      seed: [product()],
      now: () => "invalid",
    })
    await expect(invalidClock.initialize()).rejects.toEqual(
      expect.objectContaining({ code: "INVALID_SEED" })
    )
    invalidClock.close()
  })
})
