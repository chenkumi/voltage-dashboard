import { useSyncExternalStore } from "react"
import type { CommerceRepository } from "./commerce-repository"
import type { CommerceDataSnapshot } from "./types"

export type CommerceStoreSnapshot = CommerceDataSnapshot & {
  state: "idle" | "loading" | "ready" | "error"
  version: number
  error: string | null
}

const emptyData: CommerceDataSnapshot = {
  customers: [],
  orders: [],
  orderLines: [],
  notes: [],
  activities: [],
}

const initialSnapshot: CommerceStoreSnapshot = {
  ...emptyData,
  state: "idle",
  version: 0,
  error: null,
}

export class CommerceStore {
  private readonly repository: CommerceRepository
  private snapshot = initialSnapshot
  private readonly listeners = new Set<() => void>()
  private unsubscribeRepository: (() => void) | null = null
  private loadPromise: Promise<void> | null = null

  constructor(repository: CommerceRepository) {
    this.repository = repository
    this.connect()
  }

  initialize() {
    this.connect()
    if (this.snapshot.state === "ready") return Promise.resolve()
    if (this.loadPromise) return this.loadPromise
    this.loadPromise = this.load().finally(() => {
      this.loadPromise = null
    })
    return this.loadPromise
  }

  getSnapshot = () => this.snapshot

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async refresh() {
    try {
      const data = await this.repository.getSnapshot()
      this.setSnapshot({
        ...data,
        state: "ready",
        version: this.snapshot.version + 1,
        error: null,
      })
    } catch {
      this.setSnapshot({
        ...this.snapshot,
        state: "error",
        error: "Commerce data is unavailable.",
      })
    }
  }

  dispose() {
    this.unsubscribeRepository?.()
    this.unsubscribeRepository = null
    this.listeners.clear()
  }

  private connect() {
    if (this.unsubscribeRepository) return
    this.unsubscribeRepository = this.repository.subscribe(() => this.refresh())
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
        error: "Commerce data is unavailable.",
      })
    }
  }

  private setSnapshot(snapshot: CommerceStoreSnapshot) {
    this.snapshot = snapshot
    for (const listener of this.listeners) listener()
  }
}

export const useCommerceStore = (store: CommerceStore) =>
  useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
