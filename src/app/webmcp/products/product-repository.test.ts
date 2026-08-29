import { afterEach, describe, expect, it, vi } from "vitest"
import { ProductRepository, ProductValidationError } from "./product-repository"
import type { Product, ProductWriteInput } from "./types"

const repositories: ProductRepository[] = []

const createInput = (sku = "TEST-001"): ProductWriteInput => ({
  sku,
  title: "Test product",
  brand: "Voltage",
  category: "test",
  price: { amount: 499, currency: "TWD" },
  stock: 8,
  description: "A complete product description.",
  shortAdCopy: "Short copy",
  longAdCopy: "Long advertising copy",
  images: [
    {
      id: "image-1",
      url: "https://example.com/product.webp",
      alt: "Test product",
      position: 0,
      isPrimary: true,
    },
  ],
  specifications: [
    {
      id: "spec-1",
      title: "Capacity",
      value: "500",
      unit: "ml",
      position: 0,
    },
  ],
})

const createSeedProduct = (): Product => ({
  ...createInput("SEED-001"),
  id: 1,
  status: "published",
  archivedFromStatus: null,
  reviews: [{ rating: 5, comment: "Excellent.", date: "2026-08-01" }],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
})

const createRepository = (name: string, seed: readonly Product[] = []) => {
  const repository = new ProductRepository({
    databaseName: name,
    seed,
    now: () => "2026-08-29T12:00:00.000Z",
  })
  repositories.push(repository)
  return repository
}

afterEach(async () => {
  await Promise.all(
    repositories
      .splice(0)
      .map((repository) => repository.deleteDatabaseForTests())
  )
})

describe("ProductRepository", () => {
  it("imports seed data exactly once and never overwrites user changes", async () => {
    const databaseName = `products-${crypto.randomUUID()}`
    const first = createRepository(databaseName, [createSeedProduct()])
    await first.initialize()
    await first.update(1, { ...createInput("SEED-001"), title: "User title" })
    first.close()

    const second = createRepository(databaseName, [createSeedProduct()])
    await second.initialize()

    expect(await second.get(1)).toMatchObject({ title: "User title" })
    expect(await second.list({ includeArchived: true })).toHaveLength(1)
  })

  it("creates the next numeric ID and preserves native currency", async () => {
    const repository = createRepository(`products-${crypto.randomUUID()}`, [
      createSeedProduct(),
    ])
    await repository.initialize()
    const mutation = vi.fn()
    repository.subscribe(mutation)

    const created = await repository.create(createInput(), "draft")

    expect(created).toMatchObject({
      id: 2,
      status: "draft",
      price: { amount: 499, currency: "TWD" },
    })
    expect(mutation).toHaveBeenCalledWith({
      type: "create",
      productId: 2,
      version: 2,
    })
  })

  it("rejects duplicate SKUs and incomplete publishing", async () => {
    const repository = createRepository(`products-${crypto.randomUUID()}`)
    await repository.initialize()
    await repository.create(createInput(), "draft")

    await expect(repository.create(createInput(), "draft")).rejects.toEqual(
      expect.objectContaining({ code: "DUPLICATE_SKU" })
    )
    const incomplete = await repository.create(
      {
        ...createInput("TEST-002"),
        description: "",
        shortAdCopy: "",
        longAdCopy: "",
        images: [],
      },
      "draft"
    )
    await expect(repository.publish(incomplete.id)).rejects.toBeInstanceOf(
      ProductValidationError
    )
  })

  it("normalizes SKU whitespace before storage and uniqueness checks", async () => {
    const repository = createRepository(`products-${crypto.randomUUID()}`)
    await repository.initialize()
    const created = await repository.create(
      createInput("  TEST-001  "),
      "draft"
    )

    expect(created.sku).toBe("TEST-001")
    expect(await repository.getBySku(" TEST-001 ")).toMatchObject({
      id: created.id,
    })
    await expect(
      repository.create(createInput("TEST-001"), "draft")
    ).rejects.toEqual(expect.objectContaining({ code: "DUPLICATE_SKU" }))
  })

  it("persists committed mutations even when a listener fails", async () => {
    const repository = createRepository(`products-${crypto.randomUUID()}`)
    await repository.initialize()
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined)
    repository.subscribe(() => {
      throw new Error("listener failed")
    })

    const created = await repository.create(createInput(), "draft")

    expect(await repository.get(created.id)).toMatchObject({ sku: "TEST-001" })
    expect(consoleError).toHaveBeenCalledWith(
      "Product repository listener failed.",
      expect.any(Error)
    )
    consoleError.mockRestore()
  })

  it("archives a selected batch atomically and emits one refresh event", async () => {
    const repository = createRepository(`products-${crypto.randomUUID()}`)
    await repository.initialize()
    const first = await repository.create(createInput("BATCH-001"), "draft")
    const second = await repository.create(createInput("BATCH-002"), "draft")
    const listener = vi.fn()
    repository.subscribe(listener)

    await repository.archiveMany([first.id, second.id])

    expect((await repository.get(first.id))?.status).toBe("archived")
    expect((await repository.get(second.id))?.status).toBe("archived")
    expect(listener).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ type: "archive" })
    )
  })

  it("rolls back a batch when any selected product is missing", async () => {
    const repository = createRepository(`products-${crypto.randomUUID()}`)
    await repository.initialize()
    const first = await repository.create(createInput("BATCH-001"), "draft")

    await expect(repository.archiveMany([first.id, 999_999])).rejects.toEqual(
      expect.objectContaining({ code: "PRODUCT_NOT_FOUND" })
    )
    expect((await repository.get(first.id))?.status).toBe("draft")
  })

  it("publishes, archives, restores, and hides archived products by default", async () => {
    const repository = createRepository(`products-${crypto.randomUUID()}`)
    await repository.initialize()
    const created = await repository.create(createInput(), "draft")

    expect((await repository.publish(created.id)).status).toBe("published")
    expect(await repository.archive(created.id)).toMatchObject({
      status: "archived",
      archivedFromStatus: "published",
    })
    expect(await repository.list()).toEqual([])
    expect(await repository.list({ includeArchived: true })).toHaveLength(1)
    expect(await repository.restore(created.id)).toMatchObject({
      status: "published",
      archivedFromStatus: null,
    })
  })

  it("does not expose reviewer identity in repository snapshots", async () => {
    const repository = createRepository(`products-${crypto.randomUUID()}`, [
      createSeedProduct(),
    ])
    await repository.initialize()

    const snapshot = JSON.stringify(await repository.list())
    expect(snapshot).not.toContain("reviewerName")
    expect(snapshot).not.toContain("reviewerEmail")
  })
})
