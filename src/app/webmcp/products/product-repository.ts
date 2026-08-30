import { Dexie, type EntityTable } from "dexie"
import { createInventoryMovementSeed } from "../inventory/inventory-seed"
import {
  assertValidInventoryMovement,
  InventoryValidationError,
  normalizeInventoryAdjustment,
} from "../inventory/inventory-validation"
import type {
  InventoryAdjustmentInput,
  CustomerReturnReceiptInput,
  InventoryMovement,
} from "../inventory/types"
import { createDummyJsonProductSeed } from "./product-seed"
import {
  assertValidProductInput,
  ProductValidationError,
  validateStoredProduct,
} from "./product-validation"
import type {
  ActiveProductStatus,
  Product,
  ProductMutation,
  ProductStatus,
  ProductWriteInput,
} from "./types"

type ProductMetadata = {
  key: "seed" | "inventory-seed"
  version: number
  initializedAt: string
}

type ProductDatabase = Dexie & {
  products: EntityTable<Product, "id">
  metadata: EntityTable<ProductMetadata, "key">
  inventoryMovements: EntityTable<InventoryMovement, "id">
}

type ProductRepositoryOptions = {
  databaseName?: string
  seed?: readonly Product[]
  now?: () => string
  createId?: () => string
}

type InventoryCommitAdjustment =
  | {
      type: "receipt" | "issue"
      quantity: number
      reasonCode: InventoryMovement["reasonCode"]
      note?: string | null
    }
  | {
      type: "reconciliation"
      targetStock: number
      reasonCode: InventoryMovement["reasonCode"]
      note?: string | null
    }

export class ProductRepositoryError extends Error {
  readonly code:
    "PRODUCT_NOT_FOUND" | "DUPLICATE_SKU" | "INVALID_STATUS" | "INVALID_SEED"

  constructor(code: ProductRepositoryError["code"], message: string) {
    super(message)
    this.name = "ProductRepositoryError"
    this.code = code
  }
}

const createDatabase = (name: string) => {
  const database = new Dexie(name) as ProductDatabase
  database.version(1).stores({
    products: "id, &sku, status, category, updatedAt",
    metadata: "key",
  })
  database.version(2).stores({
    products: "id, &sku, status, category, updatedAt",
    metadata: "key",
    inventoryMovements:
      "id, productId, type, reasonCode, occurredAt, [productId+occurredAt]",
  })
  database
    .version(3)
    .stores({
      products: "id, &sku, status, category, updatedAt",
      metadata: "key",
      inventoryMovements:
        "id, productId, type, reasonCode, occurredAt, &sourceReference, [productId+occurredAt]",
    })
    .upgrade((transaction) =>
      transaction
        .table<InventoryMovement, string>("inventoryMovements")
        .toCollection()
        .modify({ sourceReference: null })
    )
  return database
}

const cloneProduct = (product: Product): Product => structuredClone(product)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

const normalizeInput = (input: ProductWriteInput): ProductWriteInput => ({
  ...structuredClone(input),
  sku: input.sku.trim(),
})

export class ProductRepository {
  private readonly database: ProductDatabase
  private readonly seed: readonly Product[]
  private readonly now: () => string
  private readonly createId: () => string
  private readonly listeners = new Set<
    (mutation: ProductMutation) => void | Promise<void>
  >()
  private mutationVersion = 0

  constructor(options: ProductRepositoryOptions = {}) {
    this.database = createDatabase(
      options.databaseName ?? "webmcp-agent-products-v1"
    )
    this.seed = options.seed ?? createDummyJsonProductSeed()
    this.now = options.now ?? (() => new Date().toISOString())
    this.createId = options.createId ?? (() => crypto.randomUUID())
  }

  async initialize() {
    let inserted = false
    await this.database.transaction(
      "rw",
      this.database.products,
      this.database.metadata,
      async () => {
        if (await this.database.metadata.get("seed")) return
        if ((await this.database.products.count()) === 0) {
          for (const product of this.seed) {
            const issues = validateStoredProduct(product)
            if (issues.length > 0) {
              throw new ProductRepositoryError(
                "INVALID_SEED",
                `Seed product ${product.id} is invalid: ${issues[0]?.message}`
              )
            }
          }
          await this.database.products.bulkAdd(this.seed.map(cloneProduct))
          inserted = this.seed.length > 0
        }
        await this.database.metadata.put({
          key: "seed",
          version: 1,
          initializedAt: this.getCurrentTimestamp(),
        })
      }
    )
    if (inserted) await this.emit({ type: "initialize" })
    await this.initializeInventoryHistory()
  }

  async list(options: { includeArchived?: boolean } = {}) {
    const products = options.includeArchived
      ? await this.database.products.toArray()
      : await this.database.products
          .where("status")
          .notEqual("archived")
          .toArray()
    return products
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map(cloneProduct)
  }

  async get(productId: number) {
    const product = await this.database.products.get(productId)
    return product ? cloneProduct(product) : null
  }

  async getBySku(sku: string) {
    const product = await this.database.products.get({ sku: sku.trim() })
    return product ? cloneProduct(product) : null
  }

  async create(
    input: ProductWriteInput,
    status: ActiveProductStatus = "draft"
  ) {
    const normalizedInput = normalizeInput(input)
    assertValidProductInput(
      normalizedInput,
      status === "published" ? "publish" : "draft"
    )
    const product = await this.database.transaction(
      "rw",
      this.database.products,
      this.database.inventoryMovements,
      async () => {
        await this.assertSkuAvailable(normalizedInput.sku)
        const lastProduct = await this.database.products.orderBy("id").last()
        const timestamp = this.now()
        const createdProduct: Product = {
          ...normalizedInput,
          id: (lastProduct?.id ?? 0) + 1,
          status,
          archivedFromStatus: null,
          reviews: [],
          createdAt: timestamp,
          updatedAt: timestamp,
        }
        await this.database.products.add(createdProduct)
        await this.database.inventoryMovements.add(
          this.createMovement(
            createdProduct.id,
            0,
            createdProduct.stock,
            "reconciliation",
            "initial_stock",
            null,
            timestamp
          )
        )
        return createdProduct
      }
    )
    await this.emit({ type: "create", productId: product.id })
    return cloneProduct(product)
  }

  async update(productId: number, input: ProductWriteInput) {
    const normalizedInput = normalizeInput(input)
    const product = await this.database.transaction(
      "rw",
      this.database.products,
      this.database.inventoryMovements,
      async () => {
        const existing = await this.requireProduct(productId)
        this.assertInventoryHistory(
          [existing],
          await this.database.inventoryMovements
            .where("productId")
            .equals(productId)
            .toArray()
        )
        if (existing.status === "archived") {
          throw new ProductRepositoryError(
            "INVALID_STATUS",
            "Archived products must be restored before editing."
          )
        }
        assertValidProductInput(
          normalizedInput,
          existing.status === "published" ? "publish" : "draft"
        )
        await this.assertSkuAvailable(normalizedInput.sku, productId)
        const timestamp = await this.getInventoryTimestamp(
          productId,
          existing.updatedAt
        )
        const updatedProduct: Product = {
          ...existing,
          ...normalizedInput,
          updatedAt: timestamp,
        }
        await this.database.products.put(updatedProduct)
        if (updatedProduct.stock !== existing.stock) {
          await this.database.inventoryMovements.add(
            this.createMovement(
              productId,
              existing.stock,
              updatedProduct.stock,
              "reconciliation",
              "legacy_stock_set",
              null,
              updatedProduct.updatedAt
            )
          )
        }
        return updatedProduct
      }
    )
    await this.emit({ type: "update", productId })
    return cloneProduct(product)
  }

  async setStock(productId: number, stock: number) {
    if (!Number.isInteger(stock) || stock < 0) {
      throw new ProductValidationError([
        {
          field: "stock",
          code: "INVALID_NUMBER",
          message: "stock must be a non-negative integer.",
        },
      ])
    }
    const result = await this.commitInventoryAdjustment(productId, {
      type: "reconciliation",
      targetStock: stock,
      reasonCode: "legacy_stock_set",
    })
    return result.product
  }

  async adjustInventory(productId: number, input: InventoryAdjustmentInput) {
    const adjustment = normalizeInventoryAdjustment(input)
    return this.commitInventoryAdjustment(productId, adjustment)
  }

  async receiveCustomerReturn(
    productId: number,
    input: CustomerReturnReceiptInput
  ) {
    if (
      !isRecord(input) ||
      Object.keys(input).length !== 2 ||
      !Object.hasOwn(input, "quantity") ||
      !Object.hasOwn(input, "returnItemId") ||
      !Number.isInteger(input.quantity) ||
      input.quantity <= 0 ||
      typeof input.returnItemId !== "string" ||
      !/^RMA-[A-Za-z0-9-]+-I\d+$/.test(input.returnItemId)
    ) {
      throw new InventoryValidationError(
        "INVALID_ADJUSTMENT",
        "Customer return receipt is invalid."
      )
    }
    const existing = await this.database.inventoryMovements
      .where("sourceReference")
      .equals(input.returnItemId)
      .first()
    if (existing) {
      if (
        existing.productId !== productId ||
        existing.delta !== input.quantity ||
        existing.source !== "customer_return"
      ) {
        throw new InventoryValidationError(
          "INVALID_ADJUSTMENT",
          "Customer return reference conflicts with an existing receipt."
        )
      }
      return { movement: structuredClone(existing), created: false }
    }
    try {
      const result = await this.commitInventoryAdjustment(
        productId,
        {
          type: "receipt",
          quantity: input.quantity,
          reasonCode: "customer_return",
        },
        "customer_return",
        input.returnItemId
      )
      return { movement: result.movement, created: true }
    } catch (cause) {
      if (!(cause instanceof Dexie.ConstraintError)) throw cause
      const concurrent = await this.database.inventoryMovements
        .where("sourceReference")
        .equals(input.returnItemId)
        .first()
      if (
        !concurrent ||
        concurrent.productId !== productId ||
        concurrent.delta !== input.quantity ||
        concurrent.source !== "customer_return"
      ) {
        throw new InventoryValidationError(
          "INVALID_ADJUSTMENT",
          "Customer return reference conflicts with an existing receipt."
        )
      }
      return { movement: structuredClone(concurrent), created: false }
    }
  }

  private async commitInventoryAdjustment(
    productId: number,
    adjustment: InventoryCommitAdjustment,
    source: InventoryMovement["source"] = "manual",
    sourceReference: string | null = null
  ) {
    const result = await this.database.transaction(
      "rw",
      this.database.products,
      this.database.inventoryMovements,
      async () => {
        const existing = await this.requireProduct(productId)
        this.assertInventoryHistory(
          [existing],
          await this.database.inventoryMovements
            .where("productId")
            .equals(productId)
            .toArray()
        )
        const nextStock =
          adjustment.type === "reconciliation"
            ? adjustment.targetStock
            : existing.stock +
              (adjustment.type === "receipt"
                ? adjustment.quantity
                : -adjustment.quantity)
        if (nextStock < 0) {
          throw new InventoryValidationError(
            "INSUFFICIENT_STOCK",
            "Inventory issue exceeds current stock."
          )
        }
        const timestamp = await this.getInventoryTimestamp(
          productId,
          existing.updatedAt
        )
        const movement = this.createMovement(
          productId,
          existing.stock,
          nextStock,
          adjustment.type,
          adjustment.reasonCode,
          adjustment.note ?? null,
          timestamp,
          source,
          sourceReference
        )
        const product = { ...existing, stock: nextStock, updatedAt: timestamp }
        await this.database.products.put(product)
        await this.database.inventoryMovements.add(movement)
        return { product, movement }
      }
    )
    await this.emit({ type: "update", productId })
    return {
      product: cloneProduct(result.product),
      movement: structuredClone(result.movement),
    }
  }

  async listInventoryMovements(productId?: number) {
    if (
      productId !== undefined &&
      (!Number.isInteger(productId) || productId <= 0)
    ) {
      throw new ProductRepositoryError(
        "PRODUCT_NOT_FOUND",
        "Product was not found."
      )
    }
    const movements =
      productId !== undefined
        ? await this.database.inventoryMovements
            .where("productId")
            .equals(productId)
            .toArray()
        : await this.database.inventoryMovements.toArray()
    const products = productId
      ? [await this.requireProduct(productId)]
      : await this.database.products.toArray()
    this.assertInventoryHistory(products, movements)
    return movements
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
      .map((movement) => structuredClone(movement))
  }

  async publish(productId: number) {
    return this.changeStatus(productId, "published", "publish")
  }

  async archive(productId: number) {
    const [product] = await this.archiveMany([productId])
    if (!product) {
      throw new ProductRepositoryError(
        "PRODUCT_NOT_FOUND",
        "Product was not found."
      )
    }
    return product
  }

  async archiveMany(productIds: readonly number[]) {
    const uniqueProductIds = [...new Set(productIds)]
    const result = await this.database.transaction(
      "rw",
      this.database.products,
      async () => {
        const products: Product[] = []
        const changedProducts: Product[] = []
        for (const productId of uniqueProductIds) {
          const existing = await this.requireProduct(productId)
          if (existing.status === "archived") {
            products.push(existing)
            continue
          }
          const product: Product = {
            ...existing,
            status: "archived",
            archivedFromStatus: existing.status,
            updatedAt: this.now(),
          }
          products.push(product)
          changedProducts.push(product)
        }
        if (changedProducts.length > 0) {
          await this.database.products.bulkPut(changedProducts)
        }
        return { changed: changedProducts.length > 0, products }
      }
    )
    if (result.changed) await this.emit({ type: "archive" })
    return result.products.map(cloneProduct)
  }

  async restore(productId: number) {
    const result = await this.database.transaction(
      "rw",
      this.database.products,
      async () => {
        const existing = await this.requireProduct(productId)
        if (existing.status !== "archived") {
          return { changed: false, product: existing }
        }
        const status = existing.archivedFromStatus ?? "draft"
        const product: Product = {
          ...existing,
          status,
          archivedFromStatus: null,
          updatedAt: this.now(),
        }
        await this.database.products.put(product)
        return { changed: true, product }
      }
    )
    if (result.changed) await this.emit({ type: "restore", productId })
    return cloneProduct(result.product)
  }

  subscribe(listener: (mutation: ProductMutation) => void | Promise<void>) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  close() {
    this.database.close()
    this.listeners.clear()
  }

  getVersion() {
    return this.mutationVersion
  }

  async deleteDatabaseForTests() {
    this.close()
    await Dexie.delete(this.database.name)
  }

  private async changeStatus(
    productId: number,
    status: ProductStatus,
    mutationType: ProductMutation["type"]
  ) {
    const product = await this.database.transaction(
      "rw",
      this.database.products,
      async () => {
        const existing = await this.requireProduct(productId)
        if (existing.status === "archived") {
          throw new ProductRepositoryError(
            "INVALID_STATUS",
            "Archived products must be restored before publishing."
          )
        }
        assertValidProductInput(existing, "publish")
        const updatedProduct: Product = {
          ...existing,
          status,
          archivedFromStatus: null,
          updatedAt: this.now(),
        }
        await this.database.products.put(updatedProduct)
        return updatedProduct
      }
    )
    await this.emit({ type: mutationType, productId })
    return cloneProduct(product)
  }

  private async requireProduct(productId: number) {
    const product = await this.database.products.get(productId)
    if (!product) {
      throw new ProductRepositoryError(
        "PRODUCT_NOT_FOUND",
        "Product was not found."
      )
    }
    return product
  }

  private async assertSkuAvailable(sku: string, exceptProductId?: number) {
    const existing = await this.database.products.get({ sku: sku.trim() })
    if (existing && existing.id !== exceptProductId) {
      throw new ProductRepositoryError(
        "DUPLICATE_SKU",
        "SKU is already in use."
      )
    }
  }

  private async initializeInventoryHistory() {
    await this.database.transaction(
      "rw",
      this.database.products,
      this.database.metadata,
      this.database.inventoryMovements,
      async () => {
        const metadata = await this.database.metadata.get("inventory-seed")
        const products = await this.database.products.toArray()
        if (metadata) {
          this.assertInventoryMetadata(metadata)
          this.assertInventoryHistory(
            products,
            await this.database.inventoryMovements.toArray()
          )
          return
        }
        if ((await this.database.inventoryMovements.count()) !== 0) {
          throw new ProductRepositoryError(
            "INVALID_SEED",
            "Inventory history exists without migration metadata."
          )
        }
        const movements = createInventoryMovementSeed(products)
        this.assertInventoryHistory(products, movements)
        await this.database.inventoryMovements.bulkAdd(movements)
        await this.database.metadata.put({
          key: "inventory-seed",
          version: 1,
          initializedAt: this.getCurrentTimestamp(),
        })
      }
    )
  }

  private assertInventoryMetadata(value: unknown) {
    const parsed =
      isRecord(value) && typeof value.initializedAt === "string"
        ? Date.parse(value.initializedAt)
        : NaN
    if (
      !isRecord(value) ||
      Object.keys(value).length !== 3 ||
      value.key !== "inventory-seed" ||
      value.version !== 1 ||
      !Number.isFinite(parsed) ||
      new Date(parsed).toISOString() !== value.initializedAt
    ) {
      throw new ProductRepositoryError(
        "INVALID_SEED",
        "Inventory migration metadata is invalid."
      )
    }
  }

  private assertInventoryHistory(
    products: readonly Product[],
    movements: readonly InventoryMovement[]
  ) {
    const productIds = new Set(products.map((product) => product.id))
    const movementIds = new Set<string>()
    for (const movement of movements) {
      assertValidInventoryMovement(movement)
      if (!productIds.has(movement.productId) || movementIds.has(movement.id)) {
        throw new ProductRepositoryError(
          "INVALID_SEED",
          "Inventory history has an invalid relationship or duplicate ID."
        )
      }
      movementIds.add(movement.id)
    }
    for (const product of products) {
      const history = movements
        .filter((movement) => movement.productId === product.id)
        .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
      if (
        history.length === 0 ||
        history.some(
          (movement, index) =>
            (index > 0 &&
              movement.occurredAt <= history[index - 1].occurredAt) ||
            (index > 0 &&
              movement.previousStock !== history[index - 1].nextStock)
        ) ||
        history.at(-1)?.nextStock !== product.stock
      ) {
        throw new ProductRepositoryError(
          "INVALID_SEED",
          `Inventory history for product ${product.id} is inconsistent.`
        )
      }
    }
  }

  private async getInventoryTimestamp(productId: number, minimum: string) {
    const history = await this.database.inventoryMovements
      .where("productId")
      .equals(productId)
      .sortBy("occurredAt")
    const latestMovement = history.at(-1)?.occurredAt
    const lowerBound =
      latestMovement && latestMovement > minimum ? latestMovement : minimum
    const timestamp = this.getCurrentTimestamp()
    return timestamp <= lowerBound
      ? new Date(Date.parse(lowerBound) + 1).toISOString()
      : timestamp
  }

  private getCurrentTimestamp() {
    const timestamp = this.now()
    const parsed = Date.parse(timestamp)
    if (
      !Number.isFinite(parsed) ||
      new Date(parsed).toISOString() !== timestamp
    ) {
      throw new ProductRepositoryError(
        "INVALID_SEED",
        "Repository clock returned an invalid timestamp."
      )
    }
    return timestamp
  }

  private createMovement(
    productId: number,
    previousStock: number,
    nextStock: number,
    type: InventoryMovement["type"],
    reasonCode: InventoryMovement["reasonCode"],
    note: string | null,
    occurredAt: string,
    source: InventoryMovement["source"] = "manual",
    sourceReference: string | null = null
  ) {
    const movement: InventoryMovement = {
      id: `INV-${this.createId()}`,
      productId,
      type,
      reasonCode,
      previousStock,
      nextStock,
      delta: nextStock - previousStock,
      occurredAt,
      source,
      sourceReference,
      note,
    }
    assertValidInventoryMovement(movement)
    return movement
  }

  private async emit(mutation: Omit<ProductMutation, "version">) {
    this.mutationVersion += 1
    const event = { ...mutation, version: this.mutationVersion }
    await Promise.all(
      [...this.listeners].map(async (listener) => {
        try {
          await listener(event)
        } catch (error) {
          console.error("Product repository listener failed.", error)
        }
      })
    )
  }
}

export { InventoryValidationError, ProductValidationError }
