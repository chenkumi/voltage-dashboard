import { describe, expect, it, vi } from "vitest"
import { ProductStore } from "./product-store"
import type { ProductRepository } from "./product-repository"
import type { Product } from "./types"

const product = {
  id: 1,
  sku: "TEST-001",
  title: "Test product",
  brand: null,
  category: "test",
  price: { amount: 10, currency: "USD" },
  stock: 1,
  status: "published",
  archivedFromStatus: null,
  description: "Description",
  shortAdCopy: "Short",
  longAdCopy: "Long",
  images: [],
  specifications: [],
  reviews: [],
  createdAt: "2026-08-29T00:00:00.000Z",
  updatedAt: "2026-08-29T00:00:00.000Z",
} satisfies Product

describe("ProductStore", () => {
  it("publishes one stable snapshot for repository mutations", async () => {
    let repositoryListener: (() => void) | undefined
    const repository = {
      initialize: vi.fn(async () => undefined),
      list: vi.fn(async () => [product]),
      subscribe: vi.fn((listener: () => void) => {
        repositoryListener = listener
        return vi.fn()
      }),
    } as unknown as ProductRepository
    const store = new ProductStore(repository)
    const listener = vi.fn()
    store.subscribe(listener)

    await store.initialize()
    expect(store.getSnapshot()).toMatchObject({
      state: "ready",
      products: [product],
      version: 1,
    })

    repositoryListener?.()
    await vi.waitFor(() => expect(store.getSnapshot().version).toBe(2))
    expect(listener).toHaveBeenCalled()
  })
})
