import { useSyncExternalStore } from "react"
import type { ReturnRepository } from "./return-repository"
import type { ReturnRepositorySnapshot } from "./types"

export type ReturnStoreSnapshot = ReturnRepositorySnapshot & {
  state: "idle" | "loading" | "ready" | "error"
  error: string | null
}

const emptySnapshot: ReturnRepositorySnapshot = {
  version: 0,
  orderSnapshotVersion: 0,
  rmas: [],
  items: [],
  calculations: [],
  approvals: [],
  executionAttempts: [],
  timeline: [],
}

const initialSnapshot: ReturnStoreSnapshot = {
  ...emptySnapshot,
  state: "idle",
  error: null,
}

export class ReturnStore {
  private readonly repository: ReturnRepository
  private snapshot = initialSnapshot
  private readonly listeners = new Set<() => void>()
  private unsubscribeRepository: (() => void) | null = null
  private loadPromise: Promise<void> | null = null

  constructor(repository: ReturnRepository) {
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
      const snapshot = await this.repository.getSnapshot()
      this.setSnapshot({ ...snapshot, state: "ready", error: null })
    } catch (error) {
      console.error(
        "Returns refresh failed.",
        error instanceof Error ? `${error.name}: ${error.message}` : error
      )
      this.setSnapshot({
        ...this.snapshot,
        state: "error",
        error: "Returns data is unavailable.",
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
    } catch (error) {
      console.error(
        "Returns initialization failed.",
        error instanceof Error ? `${error.name}: ${error.message}` : error
      )
      this.setSnapshot({
        ...this.snapshot,
        state: "error",
        error: "Returns data is unavailable.",
      })
    }
  }

  private setSnapshot(snapshot: ReturnStoreSnapshot) {
    this.snapshot = snapshot
    for (const listener of this.listeners) listener()
  }
}

export const useReturnStore = (store: ReturnStore) =>
  useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
