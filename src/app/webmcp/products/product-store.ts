import { useSyncExternalStore } from "react"
import type { ProductRepository } from "./product-repository"
import type { Product } from "./types"

export type ProductStoreSnapshot = {
  state: "idle" | "loading" | "ready" | "error"
  products: readonly Product[]
  version: number
  error: string | null
}

const initialSnapshot: ProductStoreSnapshot = {
  state: "idle",
  products: [],
  version: 0,
  error: null,
}

export class ProductStore {
  private readonly repository: ProductRepository
  private snapshot = initialSnapshot
  private readonly listeners = new Set<() => void>()
  private readonly unsubscribeRepository: () => void
  private loadPromise: Promise<void> | null = null

  constructor(repository: ProductRepository) {
    this.repository = repository
    this.unsubscribeRepository = repository.subscribe(() => {
      void this.refresh()
    })
  }

  initialize() {
    if (this.loadPromise) return this.loadPromise
    this.loadPromise = this.load()
    return this.loadPromise
  }

  getSnapshot = () => this.snapshot

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async refresh() {
    try {
      const products = await this.repository.list({ includeArchived: true })
      this.setSnapshot({
        state: "ready",
        products,
        version: this.snapshot.version + 1,
        error: null,
      })
    } catch {
      this.setSnapshot({
        ...this.snapshot,
        state: "error",
        error: "Product data is unavailable.",
      })
    }
  }

  dispose() {
    this.unsubscribeRepository()
    this.listeners.clear()
  }

  private async load() {
    this.setSnapshot({ ...this.snapshot, state: "loading", error: null })
    try {
      await this.repository.initialize()
      await this.refresh()
    } catch {
      this.setSnapshot({
        ...this.snapshot,
        state: "error",
        error: "Product data is unavailable.",
      })
    }
  }

  private setSnapshot(snapshot: ProductStoreSnapshot) {
    this.snapshot = snapshot
    for (const listener of this.listeners) listener()
  }
}

export const useProductStore = (store: ProductStore) =>
  useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
