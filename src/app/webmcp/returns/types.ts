import type { Money } from "../commerce-data/types"

export const RETURN_SOURCES = ["internal", "external"] as const
export const RETURN_REASONS = [
  "defective",
  "damaged",
  "wrong_item",
  "missing_parts",
  "not_as_described",
  "changed_mind",
] as const
export const RMA_STATUSES = [
  "draft",
  "active",
  "completed",
  "rejected",
  "cancelled",
] as const
export const ELIGIBILITY_STATUSES = [
  "pending",
  "authorized",
  "rejected",
  "needs_information",
] as const
export const LOGISTICS_STATUSES = [
  "not_started",
  "awaiting_return",
  "received",
  "expired",
] as const
export const INSPECTION_STATUSES = [
  "not_started",
  "in_progress",
  "completed",
] as const
export const APPROVAL_STATUSES = [
  "not_ready",
  "pending",
  "approved",
  "returned",
  "rejected",
  "invalidated",
] as const
export const REFUND_STATUSES = [
  "not_started",
  "pending_execution",
  "succeeded",
  "failed",
] as const

export type ReturnSource = (typeof RETURN_SOURCES)[number]
export type ReturnReason = (typeof RETURN_REASONS)[number]
export type RmaStatus = (typeof RMA_STATUSES)[number]
export type EligibilityStatus = (typeof ELIGIBILITY_STATUSES)[number]
export type LogisticsStatus = (typeof LOGISTICS_STATUSES)[number]
export type InspectionStatus = (typeof INSPECTION_STATUSES)[number]
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number]
export type RefundStatus = (typeof REFUND_STATUSES)[number]
export type WorkflowActor = "agent" | "user" | "system"

export type ReturnItem = {
  id: string
  rmaId: string
  orderLineId: string
  productId: number
  sku: string
  title: string
  purchasedQuantity: number
  previouslyRefundedQuantity: number
  requestedQuantity: number
  receivedQuantity: number | null
  acceptedQuantity: number | null
  paidAmount: Money
  paidUnitAmounts: readonly Money[]
  condition: "sealed" | "opened" | "used" | "damaged" | null
  packaging: "intact" | "damaged" | "missing" | null
  missingContents: boolean | null
  inspectionResult: "accepted" | "rejected" | "partial" | null
  rejectionReason:
    | "not_received"
    | "outside_policy"
    | "used_or_altered"
    | "serial_mismatch"
    | null
  inventoryDisposition:
    | "restock"
    | "defective"
    | "discard"
    | "return_to_customer"
    | null
  inspectionNote: string
  inspectedBy: string | null
  inspectedAt: string | null
  inspectionVersion: number
}

export type EligibilityResult = {
  decision: "eligible" | "ineligible" | "needs_information"
  matchedRules: readonly string[]
  missingEvidence: readonly string[]
  shippingRefundEligible: boolean
}

export type EligibilityAssessment = {
  status: EligibilityStatus
  policyVersion: string
  systemResult: EligibilityResult | null
  userDecision: "authorized" | "rejected" | "needs_information" | null
  decisionReason: string
  assessedAt: string | null
  version: number
}

export type ReturnLogistics = {
  status: LogisticsStatus
  authorizedAt: string | null
  returnDueAt: string | null
  receivedAt: string | null
  receivedPackageCount: number | null
  receiptResult: "complete" | "partial" | "damaged" | null
  version: number
}

export type ReturnInspection = {
  status: InspectionStatus
  version: number
  startedAt: string | null
  completedAt: string | null
}

export type RefundCalculationItem = {
  returnItemId: string
  orderLineId: string
  acceptedQuantity: number
  refundedUnitIndexes: readonly number[]
  amount: Money
}

export type RefundCalculation = {
  id: string
  rmaId: string
  orderId: string
  rmaVersion: number
  inspectionVersion: number
  orderSnapshotVersion: number
  version: number
  items: readonly RefundCalculationItem[]
  shippingAmount: Money
  total: Money
  createdAt: string
}

export type RefundApproval = {
  id: string
  rmaId: string
  calculationId: string
  calculationVersion: number
  status: ApprovalStatus
  decidedBy: string | null
  reason: string
  createdAt: string
  decidedAt: string | null
  version: number
}

export type RefundExecutionAttempt = {
  id: string
  approvalId: string
  calculationVersion: number
  sequence: number
  result: "succeeded" | "failed"
  resultCode:
    | "recorded_success"
    | "provider_declined"
    | "provider_unavailable"
    | "manual_reconciliation_required"
  note: string
  executedBy: string
  executedAt: string
}

export type ReturnTimelineEvent = {
  id: string
  rmaId: string
  actor: WorkflowActor
  action: string
  entityId: string
  occurredAt: string
  result: string
  version: number
}

export type Rma = {
  id: string
  orderId: string
  source: ReturnSource
  reason: ReturnReason
  customerStatement: string
  assignee: string | null
  slaDueAt: string
  status: RmaStatus
  eligibility: EligibilityAssessment
  logistics: ReturnLogistics
  inspection: ReturnInspection
  approvalStatus: ApprovalStatus
  refundStatus: RefundStatus
  version: number
  createdAt: string
  submittedAt: string | null
  completedAt: string | null
  updatedAt: string
}

export type ReturnRepositorySnapshot = {
  version: number
  orderSnapshotVersion: number
  rmas: readonly Rma[]
  items: readonly ReturnItem[]
  calculations: readonly RefundCalculation[]
  approvals: readonly RefundApproval[]
  executionAttempts: readonly RefundExecutionAttempt[]
  timeline: readonly ReturnTimelineEvent[]
}
