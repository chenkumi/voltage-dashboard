import { Dexie, type EntityTable } from "dexie"
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
  key: "seed"
  version: number
  initializedAt: string
}

type ProductDatabase = Dexie & {
  products: EntityTable<Product, "id">
  metadata: EntityTable<ProductMetadata, "key">
}

type ProductRepositoryOptions = {
  databaseName?: string
  seed?: readonly Product[]
  now?: () => string
}

export class ProductRepositoryError extends Error {
  constructor(
    readonly code:
      "PRODUCT_NOT_FOUND" | "DUPLICATE_SKU" | "INVALID_STATUS" | "INVALID_SEED",
    message: string
  ) {
    super(message)
    this.name = "ProductRepositoryError"
  }
}

const createDatabase = (name: string) => {
  const database = new Dexie(name) as ProductDatabase
  database.version(1).stores({
    products: "id, &sku, status, category, updatedAt",
    metadata: "key",
  })
  return database
}

const cloneProduct = (product: Product): Product => structuredClone(product)

const normalizeInput = (input: ProductWriteInput): ProductWriteInput => ({
  ...structuredClone(input),
  sku: input.sku.trim(),
})

export class ProductRepository {
  private readonly database: ProductDatabase
  private readonly seed: readonly Product[]
  private readonly now: () => string
  private readonly listeners = new Set<(mutation: ProductMutation) => void>()
  private mutationVersion = 0

  constructor(options: ProductRepositoryOptions = {}) {
    this.database = createDatabase(
      options.databaseName ?? "webmcp-agent-products-v1"
    )
    this.seed = options.seed ?? createDummyJsonProductSeed()
    this.now = options.now ?? (() => new Date().toISOString())
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
          initializedAt: this.now(),
        })
      }
    )
    if (inserted) this.emit({ type: "initialize" })
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
        return createdProduct
      }
    )
    this.emit({ type: "create", productId: product.id })
    return cloneProduct(product)
  }

  async update(productId: number, input: ProductWriteInput) {
    const normalizedInput = normalizeInput(input)
    const product = await this.database.transaction(
      "rw",
      this.database.products,
      async () => {
        const existing = await this.requireProduct(productId)
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
        const updatedProduct: Product = {
          ...existing,
          ...normalizedInput,
          updatedAt: this.now(),
        }
        await this.database.products.put(updatedProduct)
        return updatedProduct
      }
    )
    this.emit({ type: "update", productId })
    return cloneProduct(product)
  }

  async publish(productId: number) {
    return this.changeStatus(productId, "published", "publish")
  }

  async archive(productId: number) {
    const result = await this.database.transaction(
      "rw",
      this.database.products,
      async () => {
        const existing = await this.requireProduct(productId)
        if (existing.status === "archived") {
          return { changed: false, product: existing }
        }
        const product: Product = {
          ...existing,
          status: "archived",
          archivedFromStatus: existing.status,
          updatedAt: this.now(),
        }
        await this.database.products.put(product)
        return { changed: true, product }
      }
    )
    if (result.changed) this.emit({ type: "archive", productId })
    return cloneProduct(result.product)
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
    if (result.changed) this.emit({ type: "restore", productId })
    return cloneProduct(result.product)
  }

  subscribe(listener: (mutation: ProductMutation) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  close() {
    this.database.close()
    this.listeners.clear()
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
    this.emit({ type: mutationType, productId })
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

  private emit(mutation: Omit<ProductMutation, "version">) {
    this.mutationVersion += 1
    const event = { ...mutation, version: this.mutationVersion }
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (error) {
        console.error("Product repository listener failed.", error)
      }
    }
  }
}

export { ProductValidationError }
