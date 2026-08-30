import { Dexie, type EntityTable } from "dexie"
import type { CommerceDataSnapshot, OrderLine } from "../commerce-data/types"
import { assertValidInventoryMovement } from "../inventory/inventory-validation"
import type { InventoryMovement } from "../inventory/types"
import { calculateRefund, type SuccessfulRefund } from "./refund-calculation"
import {
  checkReturnEligibility,
  type ReturnEligibilityFacts,
} from "./return-policy"
import { createReturnSeed } from "./return-seed"
import {
  assertActor,
  assertApprovalIsCurrent,
  assertCalculationIsCurrent,
  assertRmaVersion,
  assertUserActor,
  ReturnWorkflowError,
} from "./return-state"
import {
  assertReturnQuantity,
  assertReturnSourceAndReason,
  normalizeReturnStatement,
  ReturnValidationError,
} from "./return-validation"
import type {
  RefundApproval,
  RefundCalculation,
  RefundExecutionAttempt,
  ReturnItem,
  ReturnReason,
  ReturnRepositorySnapshot,
  ReturnSource,
  ReturnTimelineEvent,
  Rma,
  WorkflowActor,
} from "./types"

type ReturnMetadata = {
  key: "returns"
  seedVersion: number
  dataVersion: number
  orderSnapshotVersion: number
  initializedAt: string
}

type ReturnDatabase = Dexie & {
  rmas: EntityTable<Rma, "id">
  items: EntityTable<ReturnItem, "id">
  calculations: EntityTable<RefundCalculation, "id">
  approvals: EntityTable<RefundApproval, "id">
  executionAttempts: EntityTable<RefundExecutionAttempt, "id">
  timeline: EntityTable<ReturnTimelineEvent, "id">
  metadata: EntityTable<ReturnMetadata, "key">
}

export const RETURN_DATABASE_SCHEMA = {
  rmas: "id, orderId, source, reason, status, approvalStatus, refundStatus, createdAt, updatedAt",
  items: "id, rmaId, orderLineId, productId, [rmaId+orderLineId]",
  calculations: "id, rmaId, orderId, version, createdAt, [rmaId+version]",
  approvals: "id, rmaId, calculationId, status, createdAt, [rmaId+status]",
  executionAttempts:
    "id, approvalId, result, sequence, executedAt, [approvalId+sequence]",
  timeline: "id, rmaId, action, occurredAt, [rmaId+occurredAt]",
  metadata: "key",
} as const

const RETURN_SEED_VERSION = 2
const ITEM_CONDITIONS = ["sealed", "opened", "used", "damaged"] as const
const PACKAGING_STATES = ["intact", "damaged", "missing"] as const
const REJECTION_REASONS = [
  "not_received",
  "outside_policy",
  "used_or_altered",
  "serial_mismatch",
] as const
const INVENTORY_DISPOSITIONS = [
  "restock",
  "defective",
  "discard",
  "return_to_customer",
] as const
const ELIGIBILITY_DECISIONS = [
  "authorized",
  "rejected",
  "needs_information",
] as const
const RECEIPT_RESULTS = ["complete", "partial", "damaged"] as const
const APPROVAL_DECISIONS = ["approved", "returned", "rejected"] as const
const REFUND_RESULTS = ["succeeded", "failed"] as const
const REFUND_RESULT_CODES = [
  "recorded_success",
  "provider_declined",
  "provider_unavailable",
  "manual_reconciliation_required",
] as const
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype ||
    Object.getPrototypeOf(value) === null)
const hasExactKeys = (
  value: Record<string, unknown>,
  keys: readonly string[]
) =>
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key))

type ReturnRepositoryOptions = {
  databaseName?: string
  commerceSnapshot: CommerceDataSnapshot
  orderSnapshotVersion?: number
  seed?: ReturnRepositorySnapshot
  now?: () => string
  createId?: (prefix: string) => string
}

export type ReturnDraftItemInput = {
  orderLineId: string
  requestedQuantity: number
}

export type ReturnDraftInput = {
  orderId: string
  source: ReturnSource
  reason: ReturnReason
  customerStatement: string
  items: readonly ReturnDraftItemInput[]
}

export type InspectionItemInput = {
  returnItemId: string
  receivedQuantity: number
  acceptedQuantity: number
  condition: NonNullable<ReturnItem["condition"]>
  packaging: NonNullable<ReturnItem["packaging"]>
  missingContents: boolean
  rejectionReason: ReturnItem["rejectionReason"]
  inventoryDisposition: NonNullable<ReturnItem["inventoryDisposition"]>
  inspectionNote: string
  inspectedBy: string
}

export type EligibilityDecisionInput = {
  facts: Omit<ReturnEligibilityFacts, "reason">
  decision: "authorized" | "rejected" | "needs_information"
  reason: string
}

export type ReturnMutation = {
  type: string
  rmaId?: string
  version: number
}

const createDatabase = (name: string) => {
  const database = new Dexie(name) as ReturnDatabase
  database.version(1).stores(RETURN_DATABASE_SCHEMA)
  database
    .version(2)
    .stores(RETURN_DATABASE_SCHEMA)
    .upgrade((transaction) =>
      transaction
        .table<ReturnItem, string>("items")
        .toCollection()
        .modify((item) => {
          item.inventoryDispositionStatus =
            item.inventoryDisposition === "restock"
              ? "pending"
              : "not_applicable"
          item.inventoryMovementId = null
        })
    )
  return database
}

const clone = <T>(value: T): T => structuredClone(value)

const sortByCreatedAt = <T extends { createdAt: string }>(items: T[]) =>
  items.sort((left, right) => right.createdAt.localeCompare(left.createdAt))

export class ReturnRepository {
  private readonly database: ReturnDatabase
  private readonly commerceSnapshot: CommerceDataSnapshot
  private readonly orderSnapshotVersion: number
  private readonly seed: ReturnRepositorySnapshot
  private readonly now: () => string
  private readonly createId: (prefix: string) => string
  private readonly listeners = new Set<
    (mutation: ReturnMutation) => void | Promise<void>
  >()

  constructor(options: ReturnRepositoryOptions) {
    this.database = createDatabase(
      options.databaseName ?? "webmcp-agent-returns-v1"
    )
    this.commerceSnapshot = clone(options.commerceSnapshot)
    this.orderSnapshotVersion = options.orderSnapshotVersion ?? 1
    this.seed =
      options.seed ??
      createReturnSeed(this.commerceSnapshot, this.orderSnapshotVersion)
    this.now = options.now ?? (() => new Date().toISOString())
    this.createId =
      options.createId ?? ((prefix) => `${prefix}-${crypto.randomUUID()}`)
  }

  async initialize() {
    await this.database.transaction(
      "rw",
      this.database.rmas,
      this.database.items,
      this.database.calculations,
      this.database.approvals,
      this.database.executionAttempts,
      this.database.timeline,
      this.database.metadata,
      async () => {
        const metadata = await this.database.metadata.get("returns")
        if (metadata) {
          this.assertMetadata(metadata)
          if (this.orderSnapshotVersion < metadata.orderSnapshotVersion) {
            throw new ReturnWorkflowError(
              "STALE_VERSION",
              "This return repository uses an older order snapshot."
            )
          }
          let changed = false
          let nextMetadata = metadata
          if (metadata.seedVersion < RETURN_SEED_VERSION) {
            const inserted = await Promise.all([
              this.insertMissing(this.database.rmas, this.seed.rmas),
              this.insertMissing(this.database.items, this.seed.items),
              this.insertMissing(
                this.database.calculations,
                this.seed.calculations
              ),
              this.insertMissing(this.database.approvals, this.seed.approvals),
              this.insertMissing(
                this.database.executionAttempts,
                this.seed.executionAttempts
              ),
              this.insertMissing(this.database.timeline, this.seed.timeline),
            ])
            changed ||= inserted.some((count) => count > 0)
            nextMetadata = {
              ...nextMetadata,
              seedVersion: RETURN_SEED_VERSION,
            }
          }
          if (metadata.orderSnapshotVersion !== this.orderSnapshotVersion) {
            await this.invalidateForOrderSnapshotChange()
            changed = true
            nextMetadata = {
              ...nextMetadata,
              orderSnapshotVersion: this.orderSnapshotVersion,
            }
          }
          if (changed) {
            nextMetadata = {
              ...nextMetadata,
              dataVersion: metadata.dataVersion + 1,
            }
          }
          await this.database.metadata.put(nextMetadata)
          return
        }
        const counts = await Promise.all([
          this.database.rmas.count(),
          this.database.items.count(),
          this.database.calculations.count(),
          this.database.approvals.count(),
          this.database.executionAttempts.count(),
          this.database.timeline.count(),
        ])
        if (counts.some((count) => count > 0)) {
          throw new ReturnValidationError(
            "INVALID_RETURN",
            "Return database is partially initialized."
          )
        }
        await Promise.all([
          this.database.rmas.bulkAdd(this.seed.rmas.map(clone)),
          this.database.items.bulkAdd(this.seed.items.map(clone)),
          this.database.calculations.bulkAdd(this.seed.calculations.map(clone)),
          this.database.approvals.bulkAdd(this.seed.approvals.map(clone)),
          this.database.executionAttempts.bulkAdd(
            this.seed.executionAttempts.map(clone)
          ),
          this.database.timeline.bulkAdd(this.seed.timeline.map(clone)),
        ])
        await this.database.metadata.add({
          key: "returns",
          seedVersion: RETURN_SEED_VERSION,
          dataVersion: this.seed.version,
          orderSnapshotVersion: this.orderSnapshotVersion,
          initializedAt: this.timestamp(),
        })
      }
    )
    await this.emit({ type: "initialize" })
  }

  async getSnapshot(): Promise<ReturnRepositorySnapshot> {
    return this.database.transaction(
      "r",
      this.database.rmas,
      this.database.items,
      this.database.calculations,
      this.database.approvals,
      this.database.executionAttempts,
      this.database.timeline,
      this.database.metadata,
      async () => {
        const metadata = await this.requireMetadata()
        await this.assertRepositoryCurrent(metadata)
        const [rmas, items, calculations, approvals, attempts, timeline] =
          await Promise.all([
            this.database.rmas.toArray(),
            this.database.items.toArray(),
            this.database.calculations.toArray(),
            this.database.approvals.toArray(),
            this.database.executionAttempts.toArray(),
            this.database.timeline.toArray(),
          ])
        return clone({
          version: metadata.dataVersion,
          orderSnapshotVersion: metadata.orderSnapshotVersion,
          rmas: sortByCreatedAt(rmas),
          items,
          calculations: sortByCreatedAt(calculations),
          approvals: sortByCreatedAt(approvals),
          executionAttempts: attempts.sort(
            (left, right) =>
              right.executedAt.localeCompare(left.executedAt) ||
              right.sequence - left.sequence
          ),
          timeline: timeline.sort((left, right) =>
            left.occurredAt.localeCompare(right.occurredAt)
          ),
        })
      }
    )
  }

  async createDraft(input: ReturnDraftInput, actor: WorkflowActor) {
    assertActor(actor, ["agent", "user"], "Create return draft")
    const normalized = this.normalizeDraft(input)
    const timestamp = this.timestamp()
    const rmaId = this.createId("RMA")
    const rma: Rma = {
      id: rmaId,
      orderId: normalized.orderId,
      source: normalized.source,
      reason: normalized.reason,
      customerStatement: normalized.customerStatement,
      assignee: null,
      slaDueAt: new Date(Date.parse(timestamp) + 2 * 86_400_000).toISOString(),
      status: "draft",
      eligibility: {
        status: "pending",
        policyVersion: "2026-08-rma-v1",
        systemResult: null,
        userDecision: null,
        decisionReason: "",
        assessedAt: null,
        version: 0,
      },
      logistics: {
        status: "not_started",
        authorizedAt: null,
        returnDueAt: null,
        receivedAt: null,
        receivedPackageCount: null,
        receiptResult: null,
        version: 0,
      },
      inspection: {
        status: "not_started",
        version: 0,
        startedAt: null,
        completedAt: null,
      },
      approvalStatus: "not_ready",
      refundStatus: "not_started",
      version: 1,
      createdAt: timestamp,
      submittedAt: null,
      completedAt: null,
      updatedAt: timestamp,
    }
    const items = normalized.items.map((inputItem, index) =>
      this.createReturnItem(
        rmaId,
        inputItem.line,
        inputItem.requestedQuantity,
        index
      )
    )

    const version = await this.database.transaction(
      "rw",
      this.database.rmas,
      this.database.items,
      this.database.calculations,
      this.database.approvals,
      this.database.executionAttempts,
      this.database.timeline,
      this.database.metadata,
      async () => {
        await this.assertRepositoryCurrent()
        await this.assertQuantitiesAvailable(items)
        await this.database.rmas.add(clone(rma))
        await this.database.items.bulkAdd(items.map(clone))
        await this.addTimeline(rma, actor, "return_draft_created", "draft")
        return this.bumpVersion()
      }
    )
    await this.emit({ type: "draft_create", rmaId, version })
    return clone({ rma, items })
  }

  async updateDraft(
    rmaId: string,
    expectedVersion: number,
    input: ReturnDraftInput,
    actor: WorkflowActor
  ) {
    assertActor(actor, ["agent", "user"], "Update return draft")
    const normalized = this.normalizeDraft(input)
    const timestamp = this.timestamp()
    const version = await this.database.transaction(
      "rw",
      this.database.rmas,
      this.database.items,
      this.database.calculations,
      this.database.approvals,
      this.database.executionAttempts,
      this.database.timeline,
      this.database.metadata,
      async () => {
        const rma = await this.requireRma(rmaId)
        assertRmaVersion(rma, expectedVersion)
        if (rma.status !== "draft" || rma.orderId !== normalized.orderId) {
          throw new ReturnWorkflowError(
            "INVALID_STATE",
            "Only an existing draft for the same order can be edited."
          )
        }
        const items = normalized.items.map((inputItem, index) =>
          this.createReturnItem(
            rmaId,
            inputItem.line,
            inputItem.requestedQuantity,
            index
          )
        )
        await this.database.items.where("rmaId").equals(rmaId).delete()
        await this.assertQuantitiesAvailable(items, rmaId)
        await this.database.items.bulkAdd(items.map(clone))
        const next = {
          ...rma,
          source: normalized.source,
          reason: normalized.reason,
          customerStatement: normalized.customerStatement,
          version: rma.version + 1,
          updatedAt: timestamp,
        }
        await this.database.rmas.put(next)
        await this.addTimeline(next, actor, "return_draft_updated", "saved")
        return this.bumpVersion()
      }
    )
    await this.emit({ type: "draft_update", rmaId, version })
  }

  async submit(rmaId: string, expectedVersion: number, actor: WorkflowActor) {
    assertUserActor(actor, "Submit return")
    await this.mutateRma(
      rmaId,
      "return_submitted",
      actor,
      async (rma, timestamp) => {
        assertRmaVersion(rma, expectedVersion)
        if (rma.status !== "draft") {
          throw new ReturnWorkflowError(
            "INVALID_STATE",
            "Only a draft return can be submitted."
          )
        }
        if (
          (await this.database.items.where("rmaId").equals(rmaId).count()) < 1
        ) {
          throw new ReturnWorkflowError(
            "INVALID_STATE",
            "A return requires at least one item."
          )
        }
        return {
          ...rma,
          status: "active" as const,
          submittedAt: timestamp,
          updatedAt: timestamp,
        }
      }
    )
  }

  async decideEligibility(
    rmaId: string,
    expectedVersion: number,
    input: EligibilityDecisionInput,
    actor: WorkflowActor
  ) {
    assertUserActor(actor, "Decide return eligibility")
    this.assertEligibilityInput(input)
    const reason = this.requireReason(input.reason)
    await this.mutateRma(
      rmaId,
      "eligibility_decided",
      actor,
      (rma, timestamp) => {
        assertRmaVersion(rma, expectedVersion)
        if (
          rma.status !== "active" ||
          !["pending", "needs_information"].includes(rma.eligibility.status) ||
          rma.logistics.status !== "not_started" ||
          rma.inspection.status !== "not_started"
        ) {
          throw new ReturnWorkflowError(
            "INVALID_STATE",
            "Eligibility can be decided only before return logistics begin."
          )
        }
        const systemResult = checkReturnEligibility({
          ...input.facts,
          reason: rma.reason,
        })
        if (
          (input.decision === "authorized" &&
            systemResult.decision !== "eligible") ||
          (input.decision === "needs_information" &&
            systemResult.decision !== "needs_information")
        ) {
          throw new ReturnWorkflowError(
            "INVALID_STATE",
            "The user decision is not compatible with the fixed return policy."
          )
        }
        const authorized = input.decision === "authorized"
        const rejected = input.decision === "rejected"
        return {
          ...rma,
          status: rejected ? ("rejected" as const) : rma.status,
          eligibility: {
            ...rma.eligibility,
            status: input.decision,
            systemResult: clone(systemResult),
            userDecision: input.decision,
            decisionReason: reason,
            assessedAt: timestamp,
            version: rma.eligibility.version + 1,
          },
          logistics: authorized
            ? {
                ...rma.logistics,
                status: "awaiting_return" as const,
                authorizedAt: timestamp,
                returnDueAt: new Date(
                  Date.parse(timestamp) + 30 * 86_400_000
                ).toISOString(),
                version: rma.logistics.version + 1,
              }
            : rma.logistics,
          version: rma.version + 1,
          updatedAt: timestamp,
        }
      }
    )
  }

  async recordReceipt(
    rmaId: string,
    input: { packageCount: number; result: "complete" | "partial" | "damaged" },
    actor: WorkflowActor
  ) {
    assertUserActor(actor, "Record return receipt")
    if (
      !isRecord(input) ||
      !hasExactKeys(input, ["packageCount", "result"]) ||
      !Number.isInteger(input.packageCount) ||
      input.packageCount <= 0 ||
      !RECEIPT_RESULTS.includes(input.result)
    ) {
      throw new ReturnValidationError(
        "INVALID_RETURN",
        "Received package count and result must be valid."
      )
    }
    await this.mutateRma(rmaId, "return_received", actor, (rma, timestamp) => {
      if (
        rma.status !== "active" ||
        rma.eligibility.status !== "authorized" ||
        rma.logistics.status !== "awaiting_return"
      ) {
        throw new ReturnWorkflowError(
          "INVALID_STATE",
          "Only an authorized return awaiting shipment can be received."
        )
      }
      return {
        ...rma,
        logistics: {
          ...rma.logistics,
          status: "received" as const,
          receivedAt: timestamp,
          receivedPackageCount: input.packageCount,
          receiptResult: input.result,
          version: rma.logistics.version + 1,
        },
        updatedAt: timestamp,
      }
    })
  }

  async startInspection(rmaId: string, actor: WorkflowActor) {
    assertUserActor(actor, "Start return inspection")
    await this.mutateRma(
      rmaId,
      "inspection_started",
      actor,
      (rma, timestamp) => {
        if (
          rma.status !== "active" ||
          rma.logistics.status !== "received" ||
          rma.inspection.status !== "not_started"
        ) {
          throw new ReturnWorkflowError(
            "INVALID_STATE",
            "Inspection requires a received return."
          )
        }
        return {
          ...rma,
          inspection: {
            ...rma.inspection,
            status: "in_progress" as const,
            startedAt: timestamp,
          },
          updatedAt: timestamp,
        }
      }
    )
  }

  async completeInspection(
    rmaId: string,
    input: readonly InspectionItemInput[],
    actor: WorkflowActor
  ) {
    assertUserActor(actor, "Complete return inspection")
    if (!Array.isArray(input)) {
      throw new ReturnValidationError(
        "INVALID_RETURN",
        "Inspection items must be an array."
      )
    }
    input.forEach((item) => this.assertInspectionInputShape(item))
    const timestamp = this.timestamp()
    const version = await this.database.transaction(
      "rw",
      this.database.rmas,
      this.database.items,
      this.database.timeline,
      this.database.metadata,
      async () => {
        const rma = await this.requireRma(rmaId)
        if (
          rma.status !== "active" ||
          rma.inspection.status !== "in_progress"
        ) {
          throw new ReturnWorkflowError(
            "INVALID_STATE",
            "Only an in-progress inspection can be completed."
          )
        }
        const items = await this.database.items
          .where("rmaId")
          .equals(rmaId)
          .toArray()
        if (
          input.length !== items.length ||
          new Set(input.map((item) => item.returnItemId)).size !== items.length
        ) {
          throw new ReturnValidationError(
            "INVALID_RETURN",
            "Inspection must include every return item exactly once."
          )
        }
        const byId = new Map(input.map((item) => [item.returnItemId, item]))
        const inspectionVersion = rma.inspection.version + 1
        const nextItems = items.map((item) => {
          const result = byId.get(item.id)
          if (!result) {
            throw new ReturnValidationError(
              "INVALID_RETURN",
              `Inspection result for ${item.id} is missing.`
            )
          }
          assertReturnQuantity(
            result.receivedQuantity,
            item.requestedQuantity,
            "Received quantity"
          )
          assertReturnQuantity(
            result.acceptedQuantity,
            result.receivedQuantity,
            "Accepted quantity"
          )
          if (
            !ITEM_CONDITIONS.includes(result.condition) ||
            !PACKAGING_STATES.includes(result.packaging) ||
            typeof result.missingContents !== "boolean" ||
            !INVENTORY_DISPOSITIONS.includes(result.inventoryDisposition) ||
            (result.rejectionReason !== null &&
              !REJECTION_REASONS.includes(result.rejectionReason))
          ) {
            throw new ReturnValidationError(
              "INVALID_RETURN",
              "Inspection contains an invalid structured value."
            )
          }
          const inspectedBy = this.requireReason(result.inspectedBy)
          const inspectionNote = normalizeReturnStatement(result.inspectionNote)
          if (
            result.acceptedQuantity < item.requestedQuantity &&
            !result.rejectionReason
          ) {
            throw new ReturnValidationError(
              "INVALID_RETURN",
              "Rejected inspection quantity requires a fixed reason."
            )
          }
          if (
            result.acceptedQuantity === item.requestedQuantity &&
            result.rejectionReason !== null
          ) {
            throw new ReturnValidationError(
              "INVALID_RETURN",
              "Fully accepted inspection cannot include a rejection reason."
            )
          }
          if (
            result.inventoryDisposition === "restock" &&
            (result.acceptedQuantity === 0 || result.condition === "damaged")
          ) {
            throw new ReturnValidationError(
              "INVALID_RETURN",
              "Only accepted non-damaged items can be marked for restock."
            )
          }
          const inspectionResult =
            result.acceptedQuantity === 0
              ? ("rejected" as const)
              : result.acceptedQuantity === item.requestedQuantity
                ? ("accepted" as const)
                : ("partial" as const)
          return {
            ...item,
            receivedQuantity: result.receivedQuantity,
            acceptedQuantity: result.acceptedQuantity,
            condition: result.condition,
            packaging: result.packaging,
            missingContents: result.missingContents,
            rejectionReason: result.rejectionReason,
            inventoryDisposition: result.inventoryDisposition,
            inventoryDispositionStatus:
              result.inventoryDisposition === "restock"
                ? ("pending" as const)
                : ("not_applicable" as const),
            inventoryMovementId: null,
            inspectionResult,
            inspectionNote,
            inspectedBy,
            inspectedAt: timestamp,
            inspectionVersion,
          }
        })
        await this.database.items.bulkPut(nextItems)
        const hasRefund = nextItems.some(
          (item) => Number(item.acceptedQuantity) > 0
        )
        const nextRma: Rma = {
          ...rma,
          status: hasRefund ? "active" : "completed",
          inspection: {
            status: "completed",
            version: inspectionVersion,
            startedAt: rma.inspection.startedAt,
            completedAt: timestamp,
          },
          approvalStatus: hasRefund ? "not_ready" : "rejected",
          completedAt: hasRefund ? null : timestamp,
          version: rma.version + 1,
          updatedAt: timestamp,
        }
        await this.database.rmas.put(nextRma)
        await this.addTimeline(
          nextRma,
          actor,
          "inspection_completed",
          hasRefund ? "refund_ready" : "no_refund"
        )
        return this.bumpVersion()
      }
    )
    await this.emit({ type: "inspection_complete", rmaId, version })
  }

  async reopenInspection(rmaId: string, actor: WorkflowActor) {
    assertUserActor(actor, "Reopen return inspection")
    const timestamp = this.timestamp()
    const version = await this.database.transaction(
      "rw",
      this.database.rmas,
      this.database.items,
      this.database.approvals,
      this.database.timeline,
      this.database.metadata,
      async () => {
        const rma = await this.requireRma(rmaId)
        if (
          rma.status !== "active" ||
          rma.inspection.status !== "completed" ||
          rma.refundStatus === "succeeded"
        ) {
          throw new ReturnWorkflowError(
            "INVALID_STATE",
            "Completed refundable inspection is required before reopening."
          )
        }
        const items = await this.database.items
          .where("rmaId")
          .equals(rmaId)
          .toArray()
        if (
          items.some((item) => item.inventoryDispositionStatus === "completed")
        ) {
          throw new ReturnWorkflowError(
            "INVALID_STATE",
            "Inspection cannot be reopened after inventory disposition."
          )
        }
        const approvals = await this.database.approvals
          .where("rmaId")
          .equals(rmaId)
          .toArray()
        await this.database.approvals.bulkPut(
          approvals
            .filter((approval) =>
              ["pending", "approved", "returned"].includes(approval.status)
            )
            .map((approval) => ({
              ...approval,
              status: "invalidated" as const,
              decidedAt: timestamp,
              version: approval.version + 1,
            }))
        )
        const next: Rma = {
          ...rma,
          inspection: {
            ...rma.inspection,
            status: "in_progress",
            version: rma.inspection.version + 1,
            completedAt: null,
          },
          approvalStatus: "invalidated",
          refundStatus: "not_started",
          version: rma.version + 1,
          updatedAt: timestamp,
        }
        await this.database.rmas.put(next)
        await this.addTimeline(
          next,
          actor,
          "inspection_reopened",
          "invalidated"
        )
        return this.bumpVersion()
      }
    )
    await this.emit({ type: "inspection_reopen", rmaId, version })
  }

  async generateRefundCalculation(rmaId: string, actor: WorkflowActor) {
    assertActor(actor, ["system", "user"], "Generate refund calculation")
    const timestamp = this.timestamp()
    let calculation: RefundCalculation | null = null
    const version = await this.database.transaction(
      "rw",
      this.database.rmas,
      this.database.items,
      this.database.calculations,
      this.database.approvals,
      this.database.executionAttempts,
      this.database.timeline,
      this.database.metadata,
      async () => {
        const rma = await this.requireRma(rmaId)
        if (
          rma.status !== "active" ||
          rma.inspection.status !== "completed" ||
          !["not_ready", "returned", "invalidated"].includes(
            rma.approvalStatus
          ) ||
          rma.refundStatus !== "not_started"
        ) {
          throw new ReturnWorkflowError(
            "INVALID_STATE",
            "Refund calculation requires completed inspection without a current approval."
          )
        }
        const order = this.commerceSnapshot.orders.find(
          (candidate) => candidate.id === rma.orderId
        )
        if (!order) {
          throw new ReturnWorkflowError(
            "NOT_FOUND",
            "Return order was not found."
          )
        }
        const [items, previousCalculations, approvals, attempts] =
          await Promise.all([
            this.database.items.where("rmaId").equals(rmaId).toArray(),
            this.database.calculations.where("rmaId").equals(rmaId).toArray(),
            this.database.approvals.toArray(),
            this.database.executionAttempts
              .where("result")
              .equals("succeeded")
              .toArray(),
          ])
        const successfulRefunds = this.buildSuccessfulRefunds(
          attempts,
          approvals,
          await this.database.calculations.toArray()
        )
        calculation = calculateRefund({
          calculationId: this.createId("CALC"),
          rmaId,
          orderId: rma.orderId,
          reason: rma.reason,
          rmaVersion: rma.version,
          inspectionVersion: rma.inspection.version,
          orderSnapshotVersion: this.orderSnapshotVersion,
          calculationVersion:
            Math.max(0, ...previousCalculations.map((entry) => entry.version)) +
            1,
          orderTotal: order.amounts.total,
          orderShipping: order.amounts.shipping,
          orderLines: this.commerceSnapshot.orderLines.filter(
            (line) => line.orderId === order.id
          ),
          items: items.map((item) => ({
            returnItemId: item.id,
            orderLineId: item.orderLineId,
            acceptedQuantity: item.acceptedQuantity ?? 0,
          })),
          successfulRefunds,
          createdAt: timestamp,
        })
        await this.database.calculations.add(clone(calculation))
        await this.addTimeline(
          rma,
          actor,
          "refund_calculation_generated",
          calculation.id
        )
        return this.bumpVersion()
      }
    )
    await this.emit({ type: "calculation_generate", rmaId, version })
    return clone(calculation!)
  }

  async submitForApproval(
    rmaId: string,
    calculationId: string,
    actor: WorkflowActor
  ) {
    assertUserActor(actor, "Submit refund approval")
    const timestamp = this.timestamp()
    let approval: RefundApproval | null = null
    const version = await this.database.transaction(
      "rw",
      this.database.rmas,
      this.database.items,
      this.database.calculations,
      this.database.approvals,
      this.database.timeline,
      this.database.metadata,
      async () => {
        const rma = await this.requireRma(rmaId)
        const calculation = await this.database.calculations.get(calculationId)
        if (!calculation || calculation.rmaId !== rmaId) {
          throw new ReturnWorkflowError(
            "NOT_FOUND",
            "Refund calculation was not found."
          )
        }
        assertCalculationIsCurrent(rma, calculation, this.orderSnapshotVersion)
        if (
          rma.status !== "active" ||
          rma.inspection.status !== "completed" ||
          !["not_ready", "returned", "invalidated"].includes(
            rma.approvalStatus
          ) ||
          rma.refundStatus !== "not_started"
        ) {
          throw new ReturnWorkflowError(
            "INVALID_STATE",
            "Refund calculation cannot be submitted in the current RMA state."
          )
        }
        const calculations = await this.database.calculations
          .where("rmaId")
          .equals(rmaId)
          .toArray()
        const latestCalculation = calculations.sort(
          (left, right) => right.version - left.version
        )[0]
        if (latestCalculation?.id !== calculation.id) {
          throw new ReturnWorkflowError(
            "STALE_VERSION",
            "Only the latest refund calculation can be submitted."
          )
        }
        const pending = await this.database.approvals
          .where("rmaId")
          .equals(rmaId)
          .filter((entry) => entry.status === "pending")
          .first()
        if (pending) {
          throw new ReturnWorkflowError(
            "INVALID_STATE",
            "A refund approval is already pending."
          )
        }
        approval = {
          id: this.createId("APR"),
          rmaId,
          calculationId,
          calculationVersion: calculation.version,
          status: "pending",
          decidedBy: null,
          reason: "",
          createdAt: timestamp,
          decidedAt: null,
          version: 1,
        }
        await this.database.approvals.add(clone(approval))
        await this.database.rmas.put({
          ...rma,
          approvalStatus: "pending",
          updatedAt: timestamp,
        })
        await this.addTimeline(rma, actor, "refund_submitted", approval.id)
        return this.bumpVersion()
      }
    )
    await this.emit({ type: "approval_submit", rmaId, version })
    return clone(approval!)
  }

  async decideApproval(
    approvalId: string,
    decision: "approved" | "returned" | "rejected",
    reason: string,
    decidedBy: string,
    actor: WorkflowActor
  ) {
    assertUserActor(actor, "Decide refund approval")
    if (!APPROVAL_DECISIONS.includes(decision)) {
      throw new ReturnValidationError(
        "INVALID_RETURN",
        "Refund approval decision is invalid."
      )
    }
    const normalizedReason =
      decision === "approved"
        ? normalizeReturnStatement(reason)
        : this.requireReason(reason)
    const timestamp = this.timestamp()
    let rmaId = ""
    const version = await this.database.transaction(
      "rw",
      this.database.rmas,
      this.database.calculations,
      this.database.approvals,
      this.database.timeline,
      this.database.metadata,
      async () => {
        const approval = await this.database.approvals.get(approvalId)
        if (!approval) {
          throw new ReturnWorkflowError(
            "NOT_FOUND",
            "Refund approval was not found."
          )
        }
        rmaId = approval.rmaId
        const rma = await this.requireRma(rmaId)
        const calculation = await this.database.calculations.get(
          approval.calculationId
        )
        if (!calculation) {
          throw new ReturnWorkflowError(
            "NOT_FOUND",
            "Refund calculation was not found."
          )
        }
        if (approval.status !== "pending") {
          throw new ReturnWorkflowError(
            "INVALID_STATE",
            "Only a pending approval can be decided."
          )
        }
        if (
          rma.status !== "active" ||
          rma.approvalStatus !== "pending" ||
          rma.refundStatus !== "not_started"
        ) {
          throw new ReturnWorkflowError(
            "INVALID_STATE",
            "Refund approval cannot be decided in the current RMA state."
          )
        }
        assertApprovalIsCurrent(
          rma,
          calculation,
          approval,
          this.orderSnapshotVersion
        )
        await this.assertLatestCalculation(rma.id, calculation.id)
        await this.database.approvals.put({
          ...approval,
          status: decision,
          decidedBy: this.requireReason(decidedBy),
          reason: normalizedReason,
          decidedAt: timestamp,
          version: approval.version + 1,
        })
        const closesOrInvalidates =
          decision === "rejected" || decision === "returned"
        const nextRma: Rma = {
          ...rma,
          status: decision === "rejected" ? "completed" : rma.status,
          approvalStatus: decision,
          refundStatus:
            decision === "approved" ? "pending_execution" : "not_started",
          completedAt: decision === "rejected" ? timestamp : null,
          version: closesOrInvalidates ? rma.version + 1 : rma.version,
          updatedAt: timestamp,
        }
        await this.database.rmas.put(nextRma)
        await this.addTimeline(
          nextRma,
          actor,
          "refund_approval_decided",
          decision
        )
        return this.bumpVersion()
      }
    )
    await this.emit({ type: "approval_decide", rmaId, version })
  }

  async recordRefundResult(
    approvalId: string,
    input: {
      result: "succeeded" | "failed"
      resultCode: RefundExecutionAttempt["resultCode"]
      note: string
      executedBy: string
    },
    actor: WorkflowActor
  ) {
    assertUserActor(actor, "Record refund result")
    if (
      !isRecord(input) ||
      !hasExactKeys(input, ["result", "resultCode", "note", "executedBy"]) ||
      !REFUND_RESULTS.includes(input.result) ||
      !REFUND_RESULT_CODES.includes(input.resultCode)
    ) {
      throw new ReturnValidationError(
        "INVALID_RETURN",
        "Refund result or fixed result code is invalid."
      )
    }
    if (
      (input.result === "succeeded" &&
        input.resultCode !== "recorded_success") ||
      (input.result === "failed" && input.resultCode === "recorded_success")
    ) {
      throw new ReturnValidationError(
        "INVALID_RETURN",
        "Refund result and fixed result code are inconsistent."
      )
    }
    const timestamp = this.timestamp()
    let rmaId = ""
    let attempt: RefundExecutionAttempt | null = null
    const version = await this.database.transaction(
      "rw",
      this.database.rmas,
      this.database.items,
      this.database.calculations,
      this.database.approvals,
      this.database.executionAttempts,
      this.database.timeline,
      this.database.metadata,
      async () => {
        const approval = await this.database.approvals.get(approvalId)
        if (!approval) {
          throw new ReturnWorkflowError(
            "NOT_FOUND",
            "Refund approval was not found."
          )
        }
        rmaId = approval.rmaId
        const rma = await this.requireRma(rmaId)
        const calculation = await this.database.calculations.get(
          approval.calculationId
        )
        if (!calculation) {
          throw new ReturnWorkflowError(
            "NOT_FOUND",
            "Refund calculation was not found."
          )
        }
        assertApprovalIsCurrent(
          rma,
          calculation,
          approval,
          this.orderSnapshotVersion
        )
        await this.assertLatestCalculation(rma.id, calculation.id)
        if (
          approval.status !== "approved" ||
          rma.status !== "active" ||
          rma.approvalStatus !== "approved" ||
          rma.refundStatus === "succeeded" ||
          !["pending_execution", "failed"].includes(rma.refundStatus)
        ) {
          throw new ReturnWorkflowError(
            rma.refundStatus === "succeeded"
              ? "ALREADY_COMPLETED"
              : "INVALID_STATE",
            "Refund result cannot be recorded in the current state."
          )
        }
        if (input.result === "succeeded") {
          await this.assertRefundCalculationMatchesHistory(rma, calculation)
        }
        const sequence =
          (await this.database.executionAttempts
            .where("approvalId")
            .equals(approvalId)
            .count()) + 1
        attempt = {
          id: this.createId("EXEC"),
          approvalId,
          calculationVersion: calculation.version,
          sequence,
          result: input.result,
          resultCode: input.resultCode,
          note: normalizeReturnStatement(input.note),
          executedBy: this.requireReason(input.executedBy),
          executedAt: timestamp,
        }
        await this.database.executionAttempts.add(clone(attempt))
        await this.database.rmas.put({
          ...rma,
          status: input.result === "succeeded" ? "completed" : rma.status,
          refundStatus: input.result,
          completedAt: input.result === "succeeded" ? timestamp : null,
          updatedAt: timestamp,
        })
        await this.addTimeline(
          rma,
          actor,
          "refund_result_recorded",
          input.result
        )
        return this.bumpVersion()
      }
    )
    await this.emit({ type: "refund_result", rmaId, version })
    return clone(attempt!)
  }

  async recordRestockCompletion(
    returnItemId: string,
    movement: InventoryMovement,
    actor: WorkflowActor
  ) {
    assertUserActor(actor, "Confirm return inventory receipt")
    assertValidInventoryMovement(movement)
    if (
      !/^RMA-[A-Za-z0-9-]+-I\d+$/.test(returnItemId) ||
      movement.source !== "customer_return" ||
      movement.reasonCode !== "customer_return" ||
      movement.sourceReference !== returnItemId ||
      movement.type !== "receipt"
    ) {
      throw new ReturnValidationError(
        "INVALID_RETURN",
        "Return inventory reference is invalid."
      )
    }
    let rmaId = ""
    let changed = false
    const version = await this.database.transaction(
      "rw",
      this.database.rmas,
      this.database.items,
      this.database.timeline,
      this.database.metadata,
      async () => {
        const item = await this.database.items.get(returnItemId)
        if (!item) {
          throw new ReturnWorkflowError(
            "NOT_FOUND",
            "Return item was not found."
          )
        }
        rmaId = item.rmaId
        const rma = await this.requireRma(rmaId)
        if (
          !item.acceptedQuantity ||
          movement.productId !== item.productId ||
          movement.delta !== item.acceptedQuantity
        ) {
          throw new ReturnValidationError(
            "INVALID_RETURN",
            "Inventory receipt does not match the return item."
          )
        }
        if (
          item.inventoryDispositionStatus === "completed" &&
          item.inventoryMovementId === movement.id
        ) {
          return (await this.database.metadata.get("returns"))?.dataVersion ?? 0
        }
        if (
          rma.inspection.status !== "completed" ||
          item.inventoryDisposition !== "restock" ||
          !["pending", "failed"].includes(item.inventoryDispositionStatus)
        ) {
          throw new ReturnWorkflowError(
            "INVALID_STATE",
            "Only a pending accepted return item can be restocked."
          )
        }
        await this.database.items.put({
          ...item,
          inventoryDispositionStatus: "completed",
          inventoryMovementId: movement.id,
        })
        await this.addTimeline(
          rma,
          actor,
          "inventory_disposition_completed",
          movement.id
        )
        changed = true
        return this.bumpVersion()
      }
    )
    if (changed) await this.emit({ type: "restock_complete", rmaId, version })
  }

  async recordRestockFailure(returnItemId: string, actor: WorkflowActor) {
    assertUserActor(actor, "Record return inventory receipt failure")
    if (!/^RMA-[A-Za-z0-9-]+-I\d+$/.test(returnItemId)) {
      throw new ReturnValidationError(
        "INVALID_RETURN",
        "Return item reference is invalid."
      )
    }
    let rmaId = ""
    const version = await this.database.transaction(
      "rw",
      this.database.rmas,
      this.database.items,
      this.database.timeline,
      this.database.metadata,
      async () => {
        const item = await this.database.items.get(returnItemId)
        if (!item) {
          throw new ReturnWorkflowError(
            "NOT_FOUND",
            "Return item was not found."
          )
        }
        rmaId = item.rmaId
        const rma = await this.requireRma(rmaId)
        if (
          rma.inspection.status !== "completed" ||
          item.inventoryDisposition !== "restock" ||
          !["pending", "failed"].includes(item.inventoryDispositionStatus)
        ) {
          throw new ReturnWorkflowError(
            "INVALID_STATE",
            "Only a pending return inventory receipt can fail."
          )
        }
        await this.database.items.put({
          ...item,
          inventoryDispositionStatus: "failed",
          inventoryMovementId: null,
        })
        await this.addTimeline(
          rma,
          actor,
          "inventory_disposition_failed",
          "inventory_receipt_failed"
        )
        return this.bumpVersion()
      }
    )
    await this.emit({ type: "restock_failed", rmaId, version })
  }

  subscribe(listener: (mutation: ReturnMutation) => void | Promise<void>) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  close() {
    this.listeners.clear()
    this.database.close()
  }

  async deleteDatabaseForTests() {
    this.close()
    await this.database.delete()
  }

  private normalizeDraft(input: ReturnDraftInput) {
    if (
      !isRecord(input) ||
      !hasExactKeys(input, [
        "orderId",
        "source",
        "reason",
        "customerStatement",
        "items",
      ]) ||
      !Array.isArray(input.items) ||
      input.items.some(
        (item) =>
          !isRecord(item) ||
          !hasExactKeys(item, ["orderLineId", "requestedQuantity"])
      )
    ) {
      throw new ReturnValidationError(
        "INVALID_RETURN",
        "Return draft fields must use the closed schema."
      )
    }
    assertReturnSourceAndReason(input.source, input.reason)
    const customerStatement = normalizeReturnStatement(input.customerStatement)
    const order = this.commerceSnapshot.orders.find(
      (candidate) => candidate.id === input.orderId
    )
    if (
      !order ||
      order.status !== "delivered" ||
      order.paymentStatus !== "paid"
    ) {
      throw new ReturnValidationError(
        "INVALID_RETURN",
        "Returns require a delivered and paid order."
      )
    }
    if (
      input.items.length === 0 ||
      new Set(input.items.map((item) => item.orderLineId)).size !==
        input.items.length
    ) {
      throw new ReturnValidationError(
        "INVALID_RETURN",
        "Return draft must include unique order lines."
      )
    }
    const lines = new Map(
      this.commerceSnapshot.orderLines
        .filter((line) => line.orderId === input.orderId)
        .map((line) => [line.id, line])
    )
    return {
      orderId: order.id,
      source: input.source,
      reason: input.reason,
      customerStatement,
      items: input.items.map((item) => {
        const line = lines.get(item.orderLineId)
        if (!line) {
          throw new ReturnValidationError(
            "INVALID_RETURN",
            "Return item must belong to the selected order."
          )
        }
        assertReturnQuantity(
          item.requestedQuantity,
          line.quantity,
          "Requested quantity"
        )
        if (item.requestedQuantity === 0) {
          throw new ReturnValidationError(
            "INVALID_QUANTITY",
            "Requested quantity must be positive."
          )
        }
        return { line, requestedQuantity: item.requestedQuantity }
      }),
    }
  }

  private createReturnItem(
    rmaId: string,
    line: OrderLine,
    requestedQuantity: number,
    index: number
  ): ReturnItem {
    return {
      id: `${rmaId}-I${index + 1}`,
      rmaId,
      orderLineId: line.id,
      productId: line.productId,
      sku: line.sku,
      title: line.title,
      purchasedQuantity: line.quantity,
      previouslyRefundedQuantity: 0,
      requestedQuantity,
      receivedQuantity: null,
      acceptedQuantity: null,
      paidAmount: clone(line.paidAmount),
      paidUnitAmounts: clone(line.paidUnitAmounts),
      condition: null,
      packaging: null,
      missingContents: null,
      inspectionResult: null,
      rejectionReason: null,
      inventoryDisposition: null,
      inventoryDispositionStatus: "not_applicable",
      inventoryMovementId: null,
      inspectionNote: "",
      inspectedBy: null,
      inspectedAt: null,
      inspectionVersion: 0,
    }
  }

  private async assertQuantitiesAvailable(
    items: readonly ReturnItem[],
    excludedRmaId?: string
  ) {
    for (const item of items) {
      const existingItems = await this.database.items
        .where("orderLineId")
        .equals(item.orderLineId)
        .toArray()
      const rmas = await this.database.rmas.bulkGet(
        existingItems.map((existing) => existing.rmaId)
      )
      const reserved = existingItems.reduce((total, existing, index) => {
        const rma = rmas[index]
        return !rma ||
          rma.id === excludedRmaId ||
          !["draft", "active"].includes(rma.status)
          ? total
          : total + existing.requestedQuantity
      }, 0)
      const refunded = await this.getSuccessfulRefundedUnitIndexes(
        item.orderLineId
      )
      item.previouslyRefundedQuantity = refunded.size
      if (
        refunded.size + reserved + item.requestedQuantity >
        item.purchasedQuantity
      ) {
        throw new ReturnValidationError(
          "INVALID_QUANTITY",
          `Return quantity for ${item.orderLineId} exceeds purchased quantity.`
        )
      }
    }
  }

  private async getSuccessfulRefundedUnitIndexes(orderLineId: string) {
    const attempts = await this.database.executionAttempts
      .where("result")
      .equals("succeeded")
      .toArray()
    const approvals = await this.database.approvals.bulkGet(
      attempts.map((attempt) => attempt.approvalId)
    )
    const calculations = await this.database.calculations.bulkGet(
      approvals
        .filter((approval): approval is RefundApproval => Boolean(approval))
        .map((approval) => approval.calculationId)
    )
    const indexes = new Set<number>()
    for (const calculation of calculations) {
      const item = calculation?.items.find(
        (candidate) => candidate.orderLineId === orderLineId
      )
      item?.refundedUnitIndexes.forEach((index) => indexes.add(index))
    }
    return indexes
  }

  private buildSuccessfulRefunds(
    attempts: readonly RefundExecutionAttempt[],
    approvals: readonly RefundApproval[],
    calculations: readonly RefundCalculation[]
  ): SuccessfulRefund[] {
    const approvalMap = new Map(approvals.map((entry) => [entry.id, entry]))
    const calculationMap = new Map(
      calculations.map((entry) => [entry.id, entry])
    )
    return attempts.map((attempt) => {
      const approval = approvalMap.get(attempt.approvalId)
      const calculation = approval
        ? calculationMap.get(approval.calculationId)
        : undefined
      if (!approval || !calculation) {
        throw new ReturnValidationError(
          "INVALID_RETURN",
          "Successful refund history is incomplete."
        )
      }
      return {
        rmaId: calculation.rmaId,
        orderId: calculation.orderId,
        currency: calculation.total.currency,
        items: calculation.items.map((item) => ({
          orderLineId: item.orderLineId,
          refundedUnitIndexes: item.refundedUnitIndexes,
          amount: item.amount,
        })),
        shippingAmount: calculation.shippingAmount,
      }
    })
  }

  private async assertRefundCalculationMatchesHistory(
    rma: Rma,
    calculation: RefundCalculation
  ) {
    const order = this.commerceSnapshot.orders.find(
      (candidate) => candidate.id === rma.orderId
    )
    if (!order) {
      throw new ReturnWorkflowError("NOT_FOUND", "Return order was not found.")
    }
    const [items, attempts, approvals, calculations] = await Promise.all([
      this.database.items.where("rmaId").equals(rma.id).toArray(),
      this.database.executionAttempts
        .where("result")
        .equals("succeeded")
        .toArray(),
      this.database.approvals.toArray(),
      this.database.calculations.toArray(),
    ])
    try {
      const current = calculateRefund({
        calculationId: calculation.id,
        rmaId: rma.id,
        orderId: rma.orderId,
        reason: rma.reason,
        rmaVersion: rma.version,
        inspectionVersion: rma.inspection.version,
        orderSnapshotVersion: this.orderSnapshotVersion,
        calculationVersion: calculation.version,
        orderTotal: order.amounts.total,
        orderShipping: order.amounts.shipping,
        orderLines: this.commerceSnapshot.orderLines.filter(
          (line) => line.orderId === order.id
        ),
        items: items
          .sort((left, right) => left.id.localeCompare(right.id))
          .map((item) => ({
            returnItemId: item.id,
            orderLineId: item.orderLineId,
            acceptedQuantity: item.acceptedQuantity ?? 0,
          })),
        successfulRefunds: this.buildSuccessfulRefunds(
          attempts,
          approvals,
          calculations
        ),
        createdAt: calculation.createdAt,
      })
      const refundableFacts = (value: RefundCalculation) => ({
        items: value.items,
        shippingAmount: value.shippingAmount,
        total: value.total,
      })
      if (
        JSON.stringify(refundableFacts(current)) !==
        JSON.stringify(refundableFacts(calculation))
      ) {
        throw new Error("Refund history changed.")
      }
    } catch {
      throw new ReturnWorkflowError(
        "STALE_VERSION",
        "Refund history changed after this calculation was approved."
      )
    }
  }

  private async assertLatestCalculation(rmaId: string, calculationId: string) {
    const calculations = await this.database.calculations
      .where("rmaId")
      .equals(rmaId)
      .toArray()
    const latest = calculations.sort(
      (left, right) => right.version - left.version
    )[0]
    if (!latest || latest.id !== calculationId) {
      throw new ReturnWorkflowError(
        "STALE_VERSION",
        "The refund approval does not reference the latest calculation."
      )
    }
  }

  private async insertMissing<T extends { id: string }>(
    table: EntityTable<T, "id">,
    records: readonly T[]
  ) {
    const existingIds = new Set(await table.toCollection().primaryKeys())
    const missing = records.filter((record) => !existingIds.has(record.id))
    if (missing.length > 0) await table.bulkAdd(missing.map(clone))
    return missing.length
  }

  private async invalidateForOrderSnapshotChange() {
    const calculations = await this.database.calculations.toArray()
    const staleCalculationIds = new Set(
      calculations
        .filter(
          (calculation) =>
            calculation.orderSnapshotVersion !== this.orderSnapshotVersion
        )
        .map((calculation) => calculation.id)
    )
    if (staleCalculationIds.size === 0) return
    const affectedRmaIds = new Set(
      calculations
        .filter((calculation) => staleCalculationIds.has(calculation.id))
        .map((calculation) => calculation.rmaId)
    )
    const affectedRmas = (
      await this.database.rmas.bulkGet([...affectedRmaIds])
    ).filter(
      (rma): rma is Rma => Boolean(rma) && rma.refundStatus !== "succeeded"
    )
    const mutableRmaIds = new Set(affectedRmas.map((rma) => rma.id))
    const approvals = await this.database.approvals.toArray()
    const affectedApprovals = approvals.filter(
      (approval) =>
        mutableRmaIds.has(approval.rmaId) &&
        staleCalculationIds.has(approval.calculationId) &&
        ["pending", "approved", "returned"].includes(approval.status)
    )
    const timestamp = this.timestamp()
    if (affectedApprovals.length > 0) {
      await this.database.approvals.bulkPut(
        affectedApprovals.map((approval) => ({
          ...approval,
          status: "invalidated" as const,
          decidedAt: timestamp,
          version: approval.version + 1,
        }))
      )
    }
    for (const rma of affectedRmas) {
      const rmaId = rma.id
      const next: Rma = {
        ...rma,
        approvalStatus: affectedApprovals.some(
          (approval) => approval.rmaId === rmaId
        )
          ? "invalidated"
          : "not_ready",
        refundStatus: "not_started",
        version: rma.version + 1,
        updatedAt: timestamp,
      }
      await this.database.rmas.put(next)
      await this.addTimeline(
        next,
        "system",
        "order_snapshot_changed",
        "invalidated"
      )
    }
  }

  private assertEligibilityInput(input: EligibilityDecisionInput) {
    const facts = input?.facts
    if (
      !isRecord(input) ||
      !hasExactKeys(input, ["facts", "decision", "reason"]) ||
      !isRecord(facts) ||
      !hasExactKeys(facts, [
        "daysSinceDelivery",
        "packageOpened",
        "condition",
        "finalSale",
      ]) ||
      !ELIGIBILITY_DECISIONS.includes(input?.decision) ||
      (facts.daysSinceDelivery !== undefined &&
        (!Number.isInteger(facts.daysSinceDelivery) ||
          Number(facts.daysSinceDelivery) < 0)) ||
      (facts.packageOpened !== undefined &&
        typeof facts.packageOpened !== "boolean") ||
      (facts.condition !== undefined &&
        !["unused", "used", "damaged"].includes(String(facts.condition))) ||
      (facts.finalSale !== undefined && typeof facts.finalSale !== "boolean")
    ) {
      throw new ReturnValidationError(
        "INVALID_RETURN",
        "Eligibility decision input is invalid."
      )
    }
  }

  private assertInspectionInputShape(
    value: unknown
  ): asserts value is InspectionItemInput {
    if (
      !isRecord(value) ||
      !hasExactKeys(value, [
        "returnItemId",
        "receivedQuantity",
        "acceptedQuantity",
        "condition",
        "packaging",
        "missingContents",
        "rejectionReason",
        "inventoryDisposition",
        "inspectionNote",
        "inspectedBy",
      ])
    ) {
      throw new ReturnValidationError(
        "INVALID_RETURN",
        "Inspection item fields must use the closed schema."
      )
    }
  }

  private async mutateRma(
    rmaId: string,
    action: string,
    actor: WorkflowActor,
    transition: (rma: Rma, timestamp: string) => Promise<Rma> | Rma
  ) {
    const timestamp = this.timestamp()
    const version = await this.database.transaction(
      "rw",
      this.database.rmas,
      this.database.items,
      this.database.timeline,
      this.database.metadata,
      async () => {
        const rma = await this.requireRma(rmaId)
        const next = await transition(rma, timestamp)
        await this.database.rmas.put(next)
        await this.addTimeline(next, actor, action, next.status)
        return this.bumpVersion()
      }
    )
    await this.emit({ type: action, rmaId, version })
  }

  private async requireRma(rmaId: string) {
    await this.assertRepositoryCurrent()
    const rma = await this.database.rmas.get(rmaId)
    if (!rma) {
      throw new ReturnWorkflowError("NOT_FOUND", `RMA ${rmaId} was not found.`)
    }
    return rma
  }

  private async addTimeline(
    rma: Rma,
    actor: WorkflowActor,
    action: string,
    result: string
  ) {
    const event: ReturnTimelineEvent = {
      id: this.createId("EVT"),
      rmaId: rma.id,
      actor,
      action,
      entityId: rma.id,
      occurredAt: this.timestamp(),
      result,
      version: rma.version,
    }
    await this.database.timeline.add(event)
  }

  private async requireMetadata() {
    const metadata = await this.database.metadata.get("returns")
    if (!metadata) {
      throw new ReturnValidationError(
        "INVALID_RETURN",
        "Return repository is not initialized."
      )
    }
    this.assertMetadata(metadata)
    return metadata
  }

  private async assertRepositoryCurrent(metadata?: ReturnMetadata) {
    const current = metadata ?? (await this.requireMetadata())
    if (current.orderSnapshotVersion !== this.orderSnapshotVersion) {
      throw new ReturnWorkflowError(
        "STALE_VERSION",
        "This return repository no longer matches the current order snapshot."
      )
    }
  }

  private async bumpVersion() {
    const metadata = await this.requireMetadata()
    const next = { ...metadata, dataVersion: metadata.dataVersion + 1 }
    await this.database.metadata.put(next)
    return next.dataVersion
  }

  private assertMetadata(metadata: ReturnMetadata) {
    if (
      metadata.key !== "returns" ||
      metadata.seedVersion < 1 ||
      metadata.seedVersion > RETURN_SEED_VERSION ||
      !Number.isInteger(metadata.dataVersion) ||
      metadata.dataVersion < 1 ||
      !Number.isInteger(metadata.orderSnapshotVersion) ||
      metadata.orderSnapshotVersion < 1 ||
      !Number.isFinite(Date.parse(metadata.initializedAt))
    ) {
      throw new ReturnValidationError(
        "INVALID_RETURN",
        "Return repository metadata is invalid."
      )
    }
  }

  private timestamp() {
    const value = this.now()
    if (new Date(Date.parse(value)).toISOString() !== value) {
      throw new ReturnValidationError(
        "INVALID_RETURN",
        "Return repository timestamp is invalid."
      )
    }
    return value
  }

  private requireReason(value: string) {
    const reason = normalizeReturnStatement(value)
    if (!reason) {
      throw new ReturnValidationError("INVALID_RETURN", "A reason is required.")
    }
    return reason
  }

  private async emit(
    mutation: Omit<ReturnMutation, "version"> & { version?: number }
  ) {
    const version =
      mutation.version ?? (await this.requireMetadata()).dataVersion
    for (const listener of this.listeners) {
      try {
        await listener({ ...mutation, version })
      } catch {
        // A broken listener must not roll back a committed transaction.
      }
    }
  }
}
