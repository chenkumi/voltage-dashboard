import type {
  RefundApproval,
  RefundCalculation,
  Rma,
  WorkflowActor,
} from "./types"

export class ReturnWorkflowError extends Error {
  readonly code:
    | "NOT_FOUND"
    | "INVALID_ACTOR"
    | "INVALID_STATE"
    | "STALE_VERSION"
    | "ALREADY_COMPLETED"

  constructor(code: ReturnWorkflowError["code"], message: string) {
    super(message)
    this.name = "ReturnWorkflowError"
    this.code = code
  }
}

export const assertUserActor = (actor: WorkflowActor, action: string) => {
  if (actor !== "user") {
    throw new ReturnWorkflowError(
      "INVALID_ACTOR",
      `${action} requires a user actor.`
    )
  }
}

export const assertActor = (
  actor: WorkflowActor,
  allowed: readonly WorkflowActor[],
  action: string
) => {
  if (!allowed.includes(actor)) {
    throw new ReturnWorkflowError(
      "INVALID_ACTOR",
      `${action} is not available to ${actor}.`
    )
  }
}

export const assertRmaVersion = (rma: Rma, expectedVersion: number) => {
  if (rma.version !== expectedVersion) {
    throw new ReturnWorkflowError(
      "STALE_VERSION",
      `RMA ${rma.id} changed from version ${expectedVersion} to ${rma.version}.`
    )
  }
}

export const assertCalculationIsCurrent = (
  rma: Rma,
  calculation: RefundCalculation,
  orderSnapshotVersion: number
) => {
  if (
    calculation.rmaVersion !== rma.version ||
    calculation.inspectionVersion !== rma.inspection.version ||
    calculation.orderSnapshotVersion !== orderSnapshotVersion
  ) {
    throw new ReturnWorkflowError(
      "STALE_VERSION",
      `Refund calculation ${calculation.id} is no longer current.`
    )
  }
}

export const assertApprovalIsCurrent = (
  rma: Rma,
  calculation: RefundCalculation,
  approval: RefundApproval,
  orderSnapshotVersion: number
) => {
  assertCalculationIsCurrent(rma, calculation, orderSnapshotVersion)
  if (
    approval.calculationId !== calculation.id ||
    approval.calculationVersion !== calculation.version ||
    approval.status === "invalidated"
  ) {
    throw new ReturnWorkflowError(
      "STALE_VERSION",
      `Refund approval ${approval.id} is no longer current.`
    )
  }
}

export const deriveReturnStage = (rma: Rma) => {
  if (rma.status === "draft") return "draft"
  if (rma.status === "rejected") return "rejected"
  if (rma.status === "cancelled") return "cancelled"
  if (rma.status === "completed") return "completed"
  if (rma.eligibility.status === "pending") return "eligibility_review"
  if (rma.eligibility.status === "needs_information") {
    return "needs_information"
  }
  if (rma.eligibility.status === "rejected") return "rejected"
  if (rma.logistics.status === "awaiting_return") return "awaiting_return"
  if (rma.logistics.status === "received") {
    if (rma.inspection.status === "not_started") return "ready_for_inspection"
    if (rma.inspection.status === "in_progress") return "inspection"
  }
  if (rma.inspection.status === "completed") {
    if (rma.approvalStatus === "not_ready") return "refund_calculation"
    if (rma.approvalStatus === "pending") return "refund_approval"
    if (rma.approvalStatus === "returned") return "approval_returned"
    if (rma.approvalStatus === "rejected") return "refund_rejected"
    if (rma.refundStatus === "pending_execution") return "refund_execution"
    if (rma.refundStatus === "failed") return "refund_retry"
  }
  return "active"
}
