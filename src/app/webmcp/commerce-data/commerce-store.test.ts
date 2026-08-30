import { describe, expect, it, vi } from "vitest"
import type { CommerceRepository } from "./commerce-repository"
import { CommerceStore } from "./commerce-store"
import type { CommerceDataSnapshot } from "./types"

const data: CommerceDataSnapshot = {
  customers: [],
  orders: [],
  orderLines: [],
  notes: [],
  activities: [],
}

describe("CommerceStore", () => {
  it("publishes loading, ready, and repository mutation snapshots", async () => {
    let repositoryListener: (() => void) | undefined
    const repository = {
      initialize: vi.fn(async () => undefined),
      getSnapshot: vi.fn(async () => data),
      subscribe: vi.fn((listener: () => void) => {
        repositoryListener = listener
        return vi.fn()
      }),
    } as unknown as CommerceRepository
    const store = new CommerceStore(repository)

    await store.initialize()
    expect(store.getSnapshot()).toMatchObject({ state: "ready", version: 1 })

    repositoryListener?.()
    await vi.waitFor(() => expect(store.getSnapshot().version).toBe(2))
  })

  it("reconnects after Strict Mode style cleanup", async () => {
    const unsubscribe = vi.fn()
    const repository = {
      initialize: vi.fn(async () => undefined),
      getSnapshot: vi.fn(async () => data),
      subscribe: vi.fn(() => unsubscribe),
    } as unknown as CommerceRepository
    const store = new CommerceStore(repository)

    await store.initialize()
    store.dispose()
    await store.initialize()

    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(repository.subscribe).toHaveBeenCalledTimes(2)
  })

  it("reports repository errors and retries initialization", async () => {
    const repository = {
      initialize: vi
        .fn()
        .mockRejectedValueOnce(new Error("offline"))
        .mockResolvedValueOnce(undefined),
      getSnapshot: vi.fn(async () => data),
      subscribe: vi.fn(() => vi.fn()),
    } as unknown as CommerceRepository
    const store = new CommerceStore(repository)

    await store.initialize()
    expect(store.getSnapshot()).toMatchObject({
      state: "error",
      error: "Commerce data is unavailable.",
    })

    await store.initialize()
    expect(store.getSnapshot()).toMatchObject({
      state: "ready",
      version: 1,
      error: null,
    })
  })
})
