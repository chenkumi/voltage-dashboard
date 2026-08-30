import Dexie from "dexie"
import { afterEach, describe, expect, it } from "vitest"
import { createCommerceSeed } from "../commerce-data/commerce-seed"
import type { CommerceDataSnapshot } from "../commerce-data/types"
import {
  ReturnRepository,
  RETURN_DATABASE_SCHEMA,
  type ReturnDraftInput,
} from "./return-repository"
import { ReturnWorkflowError } from "./return-state"

const repositories: ReturnRepository[] = []

const createRepository = (
  databaseName = `returns-${crypto.randomUUID()}`,
  commerceSnapshot = createCommerceSeed(),
  orderSnapshotVersion = 3
) => {
  const repository = new ReturnRepository({
    databaseName,
    commerceSnapshot,
    orderSnapshotVersion,
    now: () => "2026-08-31T08:00:00.000Z",
    createId: (prefix) => `${prefix}-TEST-${crypto.randomUUID()}`,
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

const returnableOrder = (commerce: CommerceDataSnapshot) => {
  const seededOrderIds = new Set(
    commerce.orders
      .filter(
        (order) =>
          order.status === "delivered" && order.paymentStatus === "paid"
      )
      .slice(0, 2)
      .map((order) => order.id)
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
  return { order, line }
}

const draftInput = (commerce: CommerceDataSnapshot): ReturnDraftInput => {
  const { order, line } = returnableOrder(commerce)
  return {
    orderId: order.id,
    source: "internal",
    reason: "defective",
    customerStatement: "Item does not power on after delivery.",
    items: [{ orderLineId: line.id, requestedQuantity: 1 }],
  }
}

const eligibilityFacts = () => ({
  daysSinceDelivery: 4,
  packageOpened: true,
  condition: "damaged" as const,
  finalSale: false,
})

const completeToInspection = async (
  repository: ReturnRepository,
  commerce: CommerceDataSnapshot,
  input = draftInput(commerce)
) => {
  const created = await repository.createDraft(input, "agent")
  await repository.submit(created.rma.id, created.rma.version, "user")
  await repository.decideEligibility(
    created.rma.id,
    created.rma.version,
    { facts: eligibilityFacts(), decision: "authorized", reason: "Eligible" },
    "user"
  )
  await repository.recordReceipt(
    created.rma.id,
    { packageCount: 1, result: "complete" },
    "user"
  )
  await repository.startInspection(created.rma.id, "user")
  await repository.completeInspection(
    created.rma.id,
    [
      {
        returnItemId: created.items[0].id,
        receivedQuantity: 1,
        acceptedQuantity: 1,
        condition: "opened",
        packaging: "intact",
        missingContents: false,
        rejectionReason: null,
        inventoryDisposition: "restock",
        inspectionNote: "Verified against the order line.",
        inspectedBy: "ops-user",
      },
    ],
    "user"
  )
  return created.rma.id
}

describe("ReturnRepository", () => {
  it("reopens the same repository after lifecycle cleanup", async () => {
    const repository = createRepository()
    await repository.initialize()
    repository.close()

    await expect(repository.initialize()).resolves.toBeUndefined()
    await expect(repository.getSnapshot()).resolves.toMatchObject({
      rmas: expect.any(Array),
    })
  })

  it("tracks pending, failed, and completed restock disposition idempotently", async () => {
    const commerce = createCommerceSeed()
    const repository = createRepository(undefined, commerce)
    await repository.initialize()
    const rmaId = await completeToInspection(repository, commerce)
    let snapshot = await repository.getSnapshot()
    const item = snapshot.items.find((candidate) => candidate.rmaId === rmaId)!
    expect(item.inventoryDispositionStatus).toBe("pending")

    await repository.recordRestockFailure(item.id, "user")
    snapshot = await repository.getSnapshot()
    expect(
      snapshot.items.find((candidate) => candidate.id === item.id)
        ?.inventoryDispositionStatus
    ).toBe("failed")

    const movement = {
      id: "INV-RETURN-TEST",
      productId: item.productId,
      type: "receipt" as const,
      reasonCode: "customer_return" as const,
      previousStock: 10,
      nextStock: 11,
      delta: 1,
      occurredAt: "2026-08-31T08:00:01.000Z",
      source: "customer_return" as const,
      sourceReference: item.id,
      note: null,
    }
    await expect(
      repository.recordRestockCompletion(
        item.id,
        { ...movement, sourceReference: "RMA-OTHER-I1" },
        "user"
      )
    ).rejects.toMatchObject({ code: "INVALID_RETURN" })
    await repository.recordRestockCompletion(item.id, movement, "user")
    await repository.recordRestockCompletion(item.id, movement, "user")
    snapshot = await repository.getSnapshot()
    expect(
      snapshot.items.find((candidate) => candidate.id === item.id)
    ).toMatchObject({
      inventoryDispositionStatus: "completed",
      inventoryMovementId: "INV-RETURN-TEST",
    })
    expect(
      snapshot.timeline.filter(
        (event) => event.action === "inventory_disposition_completed"
      )
    ).toHaveLength(1)
    await expect(
      repository.reopenInspection(rmaId, "user")
    ).rejects.toMatchObject({ code: "INVALID_STATE" })

    await expect(
      repository.recordRestockFailure(item.id, "agent")
    ).rejects.toMatchObject({ code: "INVALID_ACTOR" })
  })

  it("persists a complete RMA, failed retry, success, and immutable timeline", async () => {
    const commerce = createCommerceSeed()
    const databaseName = `returns-${crypto.randomUUID()}`
    const repository = createRepository(databaseName, commerce)
    await repository.initialize()
    const rmaId = await completeToInspection(repository, commerce)
    const calculation = await repository.generateRefundCalculation(
      rmaId,
      "system"
    )
    const approval = await repository.submitForApproval(
      rmaId,
      calculation.id,
      "user"
    )

    await expect(
      repository.decideApproval(
        approval.id,
        "approved",
        "",
        "agent-user",
        "agent"
      )
    ).rejects.toMatchObject({ code: "INVALID_ACTOR" })
    await repository.decideApproval(
      approval.id,
      "approved",
      "",
      "finance-user",
      "user"
    )
    await repository.recordRefundResult(
      approval.id,
      {
        result: "failed",
        resultCode: "provider_unavailable",
        note: "Provider unavailable.",
        executedBy: "finance-user",
      },
      "user"
    )
    await repository.recordRefundResult(
      approval.id,
      {
        result: "succeeded",
        resultCode: "recorded_success",
        note: "Reconciled successfully.",
        executedBy: "finance-user",
      },
      "user"
    )
    await expect(
      repository.recordRefundResult(
        approval.id,
        {
          result: "succeeded",
          resultCode: "recorded_success",
          note: "Duplicate.",
          executedBy: "finance-user",
        },
        "user"
      )
    ).rejects.toMatchObject({ code: "ALREADY_COMPLETED" })

    const beforeReload = await repository.getSnapshot()
    const eventIds = beforeReload.timeline.map((event) => event.id)
    expect(new Set(eventIds).size).toBe(eventIds.length)
    expect(
      beforeReload.rmas.find((candidate) => candidate.id === rmaId)
    ).toMatchObject({ status: "completed", refundStatus: "succeeded" })
    expect(
      beforeReload.executionAttempts.filter(
        (attempt) => attempt.approvalId === approval.id
      )
    ).toHaveLength(2)
    repository.close()

    const reloaded = createRepository(databaseName, commerce)
    await reloaded.initialize()
    const afterReload = await reloaded.getSnapshot()
    expect(afterReload.timeline).toEqual(beforeReload.timeline)
    expect(
      afterReload.rmas.find((candidate) => candidate.id === rmaId)
    ).toMatchObject({ status: "completed", refundStatus: "succeeded" })
  })

  it("rejects illegal stage jumps, agent final actions, and stale versions", async () => {
    const commerce = createCommerceSeed()
    const repository = createRepository(undefined, commerce)
    await repository.initialize()
    const created = await repository.createDraft(draftInput(commerce), "agent")

    await expect(
      repository.submit(created.rma.id, created.rma.version, "agent")
    ).rejects.toMatchObject({ code: "INVALID_ACTOR" })
    await expect(
      repository.recordReceipt(
        created.rma.id,
        { packageCount: 1, result: "complete" },
        "user"
      )
    ).rejects.toMatchObject({ code: "INVALID_STATE" })
    await repository.updateDraft(
      created.rma.id,
      created.rma.version,
      { ...draftInput(commerce), customerStatement: "Updated evidence." },
      "agent"
    )
    await expect(
      repository.submit(created.rma.id, created.rma.version, "user")
    ).rejects.toMatchObject({ code: "STALE_VERSION" })
  })

  it("invalidates an approval when inspection evidence is reopened", async () => {
    const commerce = createCommerceSeed()
    const repository = createRepository(undefined, commerce)
    await repository.initialize()
    const rmaId = await completeToInspection(repository, commerce)
    const calculation = await repository.generateRefundCalculation(
      rmaId,
      "system"
    )
    const approval = await repository.submitForApproval(
      rmaId,
      calculation.id,
      "user"
    )
    await expect(
      repository.decideApproval(
        approval.id,
        "fabricated" as never,
        "Invalid",
        "finance-user",
        "user"
      )
    ).rejects.toMatchObject({ code: "INVALID_RETURN" })
    await repository.decideApproval(
      approval.id,
      "approved",
      "",
      "finance-user",
      "user"
    )
    await expect(
      repository.recordRefundResult(
        approval.id,
        {
          result: "fabricated",
          resultCode: "provider_unavailable",
          note: "Invalid result.",
          executedBy: "finance-user",
        } as never,
        "user"
      )
    ).rejects.toMatchObject({ code: "INVALID_RETURN" })

    await repository.reopenInspection(rmaId, "user")
    const snapshot = await repository.getSnapshot()
    expect(
      snapshot.approvals.find((candidate) => candidate.id === approval.id)
    ).toMatchObject({ status: "invalidated" })
    expect(
      snapshot.rmas.find((candidate) => candidate.id === rmaId)
    ).toMatchObject({
      inspection: { status: "in_progress" },
      approvalStatus: "invalidated",
      refundStatus: "not_started",
    })
    await expect(
      repository.recordRefundResult(
        approval.id,
        {
          result: "succeeded",
          resultCode: "recorded_success",
          note: "Stale approval.",
          executedBy: "finance-user",
        },
        "user"
      )
    ).rejects.toBeInstanceOf(ReturnWorkflowError)
  })

  it("seeds the two external RMAs once without overlapping order units", async () => {
    const commerce = createCommerceSeed()
    const repository = createRepository(undefined, commerce)
    await repository.initialize()
    const first = await repository.getSnapshot()
    await repository.initialize()
    const second = await repository.getSnapshot()

    expect(first.rmas.filter((rma) => rma.source === "external")).toHaveLength(
      2
    )
    expect(new Set(first.items.map((item) => item.orderLineId)).size).toBe(
      first.items.length
    )
    expect(second.rmas).toEqual(first.rmas)
  })

  it("migrates only missing seed rows without overwriting user changes", async () => {
    const commerce = createCommerceSeed()
    const databaseName = `returns-${crypto.randomUUID()}`
    const first = createRepository(databaseName, commerce)
    await first.initialize()
    first.close()

    const legacy = new Dexie(databaseName)
    legacy.version(1).stores(RETURN_DATABASE_SCHEMA)
    await legacy.table("rmas").update("RMA-2004", {
      customerStatement: "User-maintained statement.",
    })
    await Promise.all([
      legacy.table("rmas").delete("RMA-2005"),
      legacy.table("items").delete("RMA-2005-I1"),
      legacy.table("timeline").delete("RMA-2005-T1"),
      legacy.table("metadata").update("returns", { seedVersion: 1 }),
    ])
    legacy.close()

    const migrated = createRepository(databaseName, commerce)
    await migrated.initialize()
    const snapshot = await migrated.getSnapshot()
    expect(
      snapshot.rmas.find((candidate) => candidate.id === "RMA-2004")
        ?.customerStatement
    ).toBe("User-maintained statement.")
    expect(snapshot.rmas.some((candidate) => candidate.id === "RMA-2005")).toBe(
      true
    )
    expect(snapshot.version).toBe(2)

    migrated.close()
    const inspected = new Dexie(databaseName)
    inspected.version(1).stores(RETURN_DATABASE_SCHEMA)
    await expect(
      inspected.table("metadata").get("returns")
    ).resolves.toMatchObject({
      seedVersion: 2,
    })
    inspected.close()
  })

  it("rejects inconsistent refund execution result codes", async () => {
    const commerce = createCommerceSeed()
    const repository = createRepository(undefined, commerce)
    await repository.initialize()
    const rmaId = await completeToInspection(repository, commerce)
    const calculation = await repository.generateRefundCalculation(
      rmaId,
      "system"
    )
    const approval = await repository.submitForApproval(
      rmaId,
      calculation.id,
      "user"
    )
    await repository.decideApproval(
      approval.id,
      "approved",
      "",
      "finance-user",
      "user"
    )

    await expect(
      repository.recordRefundResult(
        approval.id,
        {
          result: "failed",
          resultCode: "provider_declined",
          note: "Declined.",
          executedBy: "finance-user",
          customerEmail: "john@example.com",
        } as never,
        "user"
      )
    ).rejects.toMatchObject({ code: "INVALID_RETURN" })
    await expect(
      repository.recordRefundResult(
        approval.id,
        {
          result: "succeeded",
          resultCode: "provider_declined",
          note: "Contradictory result.",
          executedBy: "finance-user",
        },
        "user"
      )
    ).rejects.toMatchObject({ code: "INVALID_RETURN" })
  })

  it("invalidates current approvals when the order snapshot version changes", async () => {
    const commerce = createCommerceSeed()
    const databaseName = `returns-${crypto.randomUUID()}`
    const first = createRepository(databaseName, commerce, 3)
    await first.initialize()
    const rmaId = await completeToInspection(first, commerce)
    const calculation = await first.generateRefundCalculation(rmaId, "system")
    const approval = await first.submitForApproval(
      rmaId,
      calculation.id,
      "user"
    )
    await first.decideApproval(
      approval.id,
      "approved",
      "",
      "finance-user",
      "user"
    )
    const previousVersion = (await first.getSnapshot()).version
    first.close()

    const changed = createRepository(databaseName, commerce, 4)
    await changed.initialize()
    const snapshot = await changed.getSnapshot()
    expect(snapshot.version).toBe(previousVersion + 1)
    expect(snapshot.orderSnapshotVersion).toBe(4)
    expect(
      snapshot.approvals.find((candidate) => candidate.id === approval.id)
    ).toMatchObject({ status: "invalidated" })
    expect(
      snapshot.rmas.find((candidate) => candidate.id === rmaId)
    ).toMatchObject({
      approvalStatus: "invalidated",
      refundStatus: "not_started",
    })
    await expect(
      changed.recordRefundResult(
        approval.id,
        {
          result: "succeeded",
          resultCode: "recorded_success",
          note: "Stale order snapshot.",
          executedBy: "finance-user",
        },
        "user"
      )
    ).rejects.toMatchObject({ code: "STALE_VERSION" })
  })

  it("releases quantity after a no-refund completion", async () => {
    const commerce = createCommerceSeed()
    const repository = createRepository(undefined, commerce)
    await repository.initialize()
    const input = draftInput(commerce)
    const first = await repository.createDraft(input, "agent")
    await repository.submit(first.rma.id, first.rma.version, "user")
    await repository.decideEligibility(
      first.rma.id,
      first.rma.version,
      { facts: eligibilityFacts(), decision: "authorized", reason: "Eligible" },
      "user"
    )
    await repository.recordReceipt(
      first.rma.id,
      { packageCount: 1, result: "partial" },
      "user"
    )
    await repository.startInspection(first.rma.id, "user")
    await repository.completeInspection(
      first.rma.id,
      [
        {
          returnItemId: first.items[0].id,
          receivedQuantity: 0,
          acceptedQuantity: 0,
          condition: "opened",
          packaging: "missing",
          missingContents: true,
          rejectionReason: "not_received",
          inventoryDisposition: "return_to_customer",
          inspectionNote: "No product was present in the package.",
          inspectedBy: "ops-user",
        },
      ],
      "user"
    )

    const second = await repository.createDraft(input, "agent")
    expect(second.items[0].previouslyRefundedQuantity).toBe(0)
  })

  it("rejects personal identifiers before persisting return text", async () => {
    const commerce = createCommerceSeed()
    const repository = createRepository(undefined, commerce)
    await repository.initialize()

    await expect(
      repository.createDraft(
        {
          ...draftInput(commerce),
          customerStatement:
            "Please contact john@example.com or phone 0912345678.",
        },
        "agent"
      )
    ).rejects.toMatchObject({ code: "INVALID_RETURN" })
    for (const customerStatement of [
      "王小明",
      "請聯絡王小明",
      "電話0912345678",
      "電話0912345678請協助",
      "台北市信義區松仁路",
      "退款交易識別碼ABC",
      "０９１２３４５６７８",
      "１２３４ ５６７８ ９０１２ ３４５６",
      "أحمد محمد",
      "john smith",
      "alice jones",
      "Payment token abc-123",
    ]) {
      await expect(
        repository.createDraft(
          { ...draftInput(commerce), customerStatement },
          "agent"
        )
      ).rejects.toMatchObject({ code: "INVALID_RETURN" })
    }
    const classDraft = Object.assign(
      new (class DraftPayload {})(),
      draftInput(commerce)
    )
    await expect(
      repository.createDraft(classDraft as never, "agent")
    ).rejects.toMatchObject({ code: "INVALID_RETURN" })
    await expect(
      repository.createDraft(
        {
          ...draftInput(commerce),
          customerStatement: "John Smith says the product is defective.",
        },
        "agent"
      )
    ).rejects.toMatchObject({ code: "INVALID_RETURN" })
    await expect(
      repository.createDraft(
        {
          ...draftInput(commerce),
          customerEmail: "john@example.com",
        } as never,
        "agent"
      )
    ).rejects.toMatchObject({ code: "INVALID_RETURN" })
    const withExtraItem = draftInput(commerce)
    await expect(
      repository.createDraft(
        {
          ...withExtraItem,
          items: [
            {
              ...withExtraItem.items[0],
              customerEmail: "john@example.com",
            },
          ],
        } as never,
        "agent"
      )
    ).rejects.toMatchObject({ code: "INVALID_RETURN" })
    expect((await repository.getSnapshot()).rmas).toHaveLength(2)
  })

  it("runtime-validates structured inspection fields and rejection reasons", async () => {
    const commerce = createCommerceSeed()
    const repository = createRepository(undefined, commerce)
    await repository.initialize()
    const created = await repository.createDraft(draftInput(commerce), "agent")
    await repository.submit(created.rma.id, created.rma.version, "user")
    await repository.decideEligibility(
      created.rma.id,
      created.rma.version,
      { facts: eligibilityFacts(), decision: "authorized", reason: "Eligible" },
      "user"
    )
    await repository.recordReceipt(
      created.rma.id,
      { packageCount: 1, result: "complete" },
      "user"
    )
    await repository.startInspection(created.rma.id, "user")
    const base = {
      returnItemId: created.items[0].id,
      receivedQuantity: 0,
      acceptedQuantity: 0,
      condition: "opened" as const,
      packaging: "intact" as const,
      missingContents: false,
      rejectionReason: null,
      inventoryDisposition: "return_to_customer" as const,
      inspectionNote: "No item received.",
      inspectedBy: "ops-user",
    }

    await expect(
      repository.completeInspection(created.rma.id, [null] as never, "user")
    ).rejects.toMatchObject({ code: "INVALID_RETURN" })
    await expect(
      repository.completeInspection(created.rma.id, [base], "user")
    ).rejects.toMatchObject({ code: "INVALID_RETURN" })
    await expect(
      repository.completeInspection(
        created.rma.id,
        [{ ...base, condition: "unknown" } as never],
        "user"
      )
    ).rejects.toMatchObject({ code: "INVALID_RETURN" })
    await expect(
      repository.completeInspection(
        created.rma.id,
        [
          {
            ...base,
            rejectionReason: "not_received",
            customerEmail: "john@example.com",
          } as never,
        ],
        "user"
      )
    ).rejects.toMatchObject({ code: "INVALID_RETURN" })
  })

  it("preserves successful refund history across order snapshot changes", async () => {
    const commerce = createCommerceSeed()
    const databaseName = `returns-${crypto.randomUUID()}`
    const first = createRepository(databaseName, commerce, 3)
    await first.initialize()
    const rmaId = await completeToInspection(first, commerce)
    const calculation = await first.generateRefundCalculation(rmaId, "system")
    const approval = await first.submitForApproval(
      rmaId,
      calculation.id,
      "user"
    )
    await first.decideApproval(
      approval.id,
      "approved",
      "",
      "finance-user",
      "user"
    )
    await first.recordRefundResult(
      approval.id,
      {
        result: "succeeded",
        resultCode: "recorded_success",
        note: "Completed refund.",
        executedBy: "finance-user",
      },
      "user"
    )
    first.close()

    const changed = createRepository(databaseName, commerce, 4)
    await changed.initialize()
    const snapshot = await changed.getSnapshot()
    expect(
      snapshot.approvals.find((candidate) => candidate.id === approval.id)
    ).toMatchObject({ status: "approved" })
    expect(
      snapshot.rmas.find((candidate) => candidate.id === rmaId)
    ).toMatchObject({
      status: "completed",
      refundStatus: "succeeded",
    })
    expect(
      snapshot.timeline.some(
        (event) =>
          event.rmaId === rmaId && event.action === "order_snapshot_changed"
      )
    ).toBe(false)
  })

  it("rejects unknown runtime transition enum values", async () => {
    const commerce = createCommerceSeed()
    const repository = createRepository(undefined, commerce)
    await repository.initialize()
    const created = await repository.createDraft(draftInput(commerce), "agent")
    await repository.submit(created.rma.id, created.rma.version, "user")

    await expect(
      repository.decideEligibility(
        created.rma.id,
        created.rma.version,
        {
          facts: eligibilityFacts(),
          decision: "fabricated",
          reason: "Eligible",
        } as never,
        "user"
      )
    ).rejects.toMatchObject({ code: "INVALID_RETURN" })
    await expect(
      repository.decideEligibility(
        created.rma.id,
        created.rma.version,
        {
          facts: {
            ...eligibilityFacts(),
            customerEmail: "john@example.com",
          },
          decision: "authorized",
          reason: "Eligible",
        } as never,
        "user"
      )
    ).rejects.toMatchObject({ code: "INVALID_RETURN" })
    await repository.decideEligibility(
      created.rma.id,
      created.rma.version,
      { facts: eligibilityFacts(), decision: "authorized", reason: "Eligible" },
      "user"
    )
    const authorized = (await repository.getSnapshot()).rmas.find(
      (candidate) => candidate.id === created.rma.id
    )!
    await expect(
      repository.decideEligibility(
        created.rma.id,
        authorized.version,
        {
          facts: eligibilityFacts(),
          decision: "rejected",
          reason: "Second decision must fail.",
        },
        "user"
      )
    ).rejects.toMatchObject({ code: "INVALID_STATE" })
    await expect(
      repository.recordReceipt(
        created.rma.id,
        { packageCount: 1, result: "fabricated" } as never,
        "user"
      )
    ).rejects.toMatchObject({ code: "INVALID_RETURN" })
    const classReceipt = Object.assign(new (class ReceiptPayload {})(), {
      packageCount: 1,
      result: "complete",
    })
    await expect(
      repository.recordReceipt(created.rma.id, classReceipt as never, "user")
    ).rejects.toMatchObject({ code: "INVALID_RETURN" })
    await expect(
      repository.recordReceipt(
        created.rma.id,
        {
          packageCount: 1,
          result: "complete",
          customerEmail: "john@example.com",
        } as never,
        "user"
      )
    ).rejects.toMatchObject({ code: "INVALID_RETURN" })
  })

  it("revalidates successful refund history when parallel RMAs execute", async () => {
    const commerce = createCommerceSeed()
    const seededOrderIds = new Set(
      commerce.orders
        .filter(
          (order) =>
            order.status === "delivered" && order.paymentStatus === "paid"
        )
        .slice(0, 2)
        .map((order) => order.id)
    )
    const line = commerce.orderLines.find((candidate) => {
      const order = commerce.orders.find(
        (entry) => entry.id === candidate.orderId
      )
      return (
        candidate.quantity >= 2 &&
        order?.status === "delivered" &&
        order.paymentStatus === "paid" &&
        !seededOrderIds.has(order.id)
      )
    })!
    const input: ReturnDraftInput = {
      orderId: line.orderId,
      source: "internal",
      reason: "defective",
      customerStatement: "Item stopped working after delivery.",
      items: [{ orderLineId: line.id, requestedQuantity: 1 }],
    }
    const repository = createRepository(undefined, commerce)
    await repository.initialize()
    const firstRmaId = await completeToInspection(repository, commerce, input)
    const secondRmaId = await completeToInspection(repository, commerce, input)
    const firstCalculation = await repository.generateRefundCalculation(
      firstRmaId,
      "system"
    )
    const secondCalculation = await repository.generateRefundCalculation(
      secondRmaId,
      "system"
    )
    const firstApproval = await repository.submitForApproval(
      firstRmaId,
      firstCalculation.id,
      "user"
    )
    const secondApproval = await repository.submitForApproval(
      secondRmaId,
      secondCalculation.id,
      "user"
    )
    await repository.decideApproval(
      firstApproval.id,
      "approved",
      "",
      "finance-user",
      "user"
    )
    await repository.decideApproval(
      secondApproval.id,
      "approved",
      "",
      "finance-user",
      "user"
    )
    await repository.recordRefundResult(
      firstApproval.id,
      {
        result: "succeeded",
        resultCode: "recorded_success",
        note: "Completed refund.",
        executedBy: "finance-user",
      },
      "user"
    )

    await expect(
      repository.recordRefundResult(
        secondApproval.id,
        {
          result: "succeeded",
          resultCode: "recorded_success",
          note: "Completed refund.",
          executedBy: "finance-user",
        },
        "user"
      )
    ).rejects.toMatchObject({ code: "STALE_VERSION" })
  })

  it("requires a fresh calculation after returned or rejected approval", async () => {
    const commerce = createCommerceSeed()
    const repository = createRepository(undefined, commerce)
    await repository.initialize()
    const rmaId = await completeToInspection(repository, commerce)
    const firstCalculation = await repository.generateRefundCalculation(
      rmaId,
      "system"
    )
    const firstApproval = await repository.submitForApproval(
      rmaId,
      firstCalculation.id,
      "user"
    )
    await repository.decideApproval(
      firstApproval.id,
      "returned",
      "Additional evidence requested.",
      "finance-user",
      "user"
    )
    await expect(
      repository.submitForApproval(rmaId, firstCalculation.id, "user")
    ).rejects.toMatchObject({ code: "STALE_VERSION" })

    const secondCalculation = await repository.generateRefundCalculation(
      rmaId,
      "system"
    )
    const secondApproval = await repository.submitForApproval(
      rmaId,
      secondCalculation.id,
      "user"
    )
    await repository.decideApproval(
      secondApproval.id,
      "rejected",
      "Policy decision declined.",
      "finance-user",
      "user"
    )
    await expect(
      repository.submitForApproval(rmaId, secondCalculation.id, "user")
    ).rejects.toMatchObject({ code: "STALE_VERSION" })
  })

  it("blocks recalculation while an approval is pending or approved", async () => {
    const commerce = createCommerceSeed()
    const repository = createRepository(undefined, commerce)
    await repository.initialize()
    const rmaId = await completeToInspection(repository, commerce)
    const calculation = await repository.generateRefundCalculation(
      rmaId,
      "system"
    )
    const approval = await repository.submitForApproval(
      rmaId,
      calculation.id,
      "user"
    )
    await expect(
      repository.generateRefundCalculation(rmaId, "system")
    ).rejects.toMatchObject({ code: "INVALID_STATE" })
    await repository.decideApproval(
      approval.id,
      "approved",
      "",
      "finance-user",
      "user"
    )
    await expect(
      repository.generateRefundCalculation(rmaId, "system")
    ).rejects.toMatchObject({ code: "INVALID_STATE" })
  })

  it("computes immutable eligibility policy results inside the repository", async () => {
    const commerce = createCommerceSeed()
    const repository = createRepository(undefined, commerce)
    await repository.initialize()
    const input = { ...draftInput(commerce), reason: "changed_mind" as const }
    const created = await repository.createDraft(input, "agent")
    await repository.submit(created.rma.id, created.rma.version, "user")
    const facts = {
      daysSinceDelivery: 4,
      packageOpened: true,
      condition: "used" as const,
      finalSale: false,
    }

    await expect(
      repository.decideEligibility(
        created.rma.id,
        created.rma.version,
        {
          facts,
          decision: "authorized",
          reason: "Eligible",
          systemResult: {
            decision: "eligible",
            matchedRules: ["fabricated"],
            missingEvidence: [],
            shippingRefundEligible: true,
          },
        } as never,
        "user"
      )
    ).rejects.toMatchObject({ code: "INVALID_RETURN" })
    await expect(
      repository.decideEligibility(
        created.rma.id,
        created.rma.version,
        { facts, decision: "authorized", reason: "Eligible" },
        "user"
      )
    ).rejects.toMatchObject({ code: "INVALID_STATE" })
    await repository.decideEligibility(
      created.rma.id,
      created.rma.version,
      { facts, decision: "rejected", reason: "Policy decision declined." },
      "user"
    )
    const rejected = (await repository.getSnapshot()).rmas.find(
      (candidate) => candidate.id === created.rma.id
    )!
    expect(rejected.eligibility.systemResult).toEqual({
      decision: "ineligible",
      matchedRules: ["changed_mind_item_must_be_unused"],
      missingEvidence: [],
      shippingRefundEligible: false,
    })
  })

  it("prevents an older repository from downgrading snapshot metadata", async () => {
    const commerce = createCommerceSeed()
    const databaseName = `returns-${crypto.randomUUID()}`
    const older = createRepository(databaseName, commerce, 3)
    await older.initialize()
    const current = createRepository(databaseName, commerce, 4)
    await current.initialize()

    await expect(older.getSnapshot()).rejects.toMatchObject({
      code: "STALE_VERSION",
    })
    await expect(
      older.createDraft(draftInput(commerce), "agent")
    ).rejects.toMatchObject({ code: "STALE_VERSION" })
    await expect(older.initialize()).rejects.toMatchObject({
      code: "STALE_VERSION",
    })
    await expect(current.getSnapshot()).resolves.toMatchObject({
      orderSnapshotVersion: 4,
    })
  })
})
