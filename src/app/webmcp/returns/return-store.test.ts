import { afterEach, describe, expect, it, vi } from "vitest"
import { createCommerceSeed } from "../commerce-data/commerce-seed"
import { ReturnRepository } from "./return-repository"
import { projectReturnStoreSnapshotForUser, ReturnStore } from "./return-store"

const repositories: ReturnRepository[] = []

afterEach(async () => {
  await Promise.all(
    repositories
      .splice(0)
      .map((repository) => repository.deleteDatabaseForTests())
  )
})

describe("ReturnStore", () => {
  it("initializes, subscribes to repository mutations, and preserves errors", async () => {
    const commerce = createCommerceSeed()
    let id = 0
    const repository = new ReturnRepository({
      databaseName: `return-store-${crypto.randomUUID()}`,
      commerceSnapshot: commerce,
      now: () => "2026-08-31T08:00:00.000Z",
      createId: (prefix) => `${prefix}-${++id}`,
    })
    repositories.push(repository)
    const store = new ReturnStore(repository)
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)

    await store.initialize()
    expect(store.getSnapshot()).toMatchObject({
      state: "ready",
      version: 1,
      operationalVersion: 1,
      notes: [],
    })
    const seededOrderIds = new Set(
      store.getSnapshot().rmas.map((rma) => rma.orderId)
    )
    const order = commerce.orders.find(
      (candidate) =>
        candidate.status === "delivered" &&
        candidate.paymentStatus === "paid" &&
        !seededOrderIds.has(candidate.id)
    )!
    const line = commerce.orderLines.find(
      (candidate) => candidate.orderId === order.id
    )!
    await repository.createDraft(
      {
        orderId: order.id,
        source: "internal",
        reason: "defective",
        customerStatement: "Defective item.",
        items: [{ orderLineId: line.id, requestedQuantity: 1 }],
      },
      "agent"
    )

    expect(store.getSnapshot()).toMatchObject({ state: "ready", version: 2 })
    const operationalVersion = store.getSnapshot().operationalVersion
    const rmaId = store.getSnapshot().rmas[0].id
    await repository.reviewNotesForUser("guest").saveDraft(
      {
        rmaId,
        stage: "eligibility",
        category: "internal_note",
        content: "Store reload note.",
      },
      0,
      "ui"
    )
    expect(store.getSnapshot()).toMatchObject({
      state: "ready",
      notes: [expect.objectContaining({ authorUserId: "guest" })],
      operationalVersion,
    })
    const warehouseNotes = repository.reviewNotesForUser("warehouse-user")
    const warehouseDraft = await warehouseNotes.saveDraft(
      {
        rmaId,
        stage: "eligibility",
        category: "internal_note",
        content: "Other user's private draft.",
      },
      0,
      "ui"
    )
    expect(
      projectReturnStoreSnapshotForUser(store.getSnapshot(), "guest").notes
    ).toEqual([
      expect.objectContaining({ authorUserId: "guest", status: "draft" }),
    ])
    await warehouseNotes.publishDraft(
      rmaId,
      "eligibility",
      warehouseDraft.version
    )
    expect(
      projectReturnStoreSnapshotForUser(store.getSnapshot(), "guest").notes
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ authorUserId: "guest", status: "draft" }),
        expect.objectContaining({
          authorUserId: "warehouse-user",
          status: "published",
        }),
      ])
    )
    expect(listener).toHaveBeenCalled()
    unsubscribe()
    store.dispose()
  })

  it("surfaces initialization failures without throwing from the store", async () => {
    const repository = {
      subscribe: () => () => undefined,
      initialize: vi.fn().mockRejectedValue(new Error("offline")),
      getSnapshot: vi.fn(),
    } as unknown as ReturnRepository
    const store = new ReturnStore(repository)

    await expect(store.initialize()).resolves.toBeUndefined()
    expect(store.getSnapshot()).toMatchObject({
      state: "error",
      error: "Returns data is unavailable.",
    })
  })
})
