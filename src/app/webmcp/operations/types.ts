export type OpsCaseType =
  "fulfillment" | "payment_check" | "address_validation" | "return_request"

export type OpsCase = {
  id: string
  type: OpsCaseType
  reasonCode:
    | "dispatch_overdue"
    | "authorization_failed"
    | "address_unverified"
    | "return_requested"
  status: "open" | "drafted" | "pending_review" | "resolved"
  priority: "low" | "medium" | "high"
  createdAt: string
  facts: string[]
  returnFacts?: {
    daysSinceDelivery?: number
    packageOpened?: boolean
    condition?: "unused" | "used" | "damaged"
    finalSale?: boolean
  }
}

export type EligibilityResult = {
  decision: "eligible" | "ineligible" | "needs_human_review"
  matchedRules: string[]
  missingEvidence: string[]
}

export type CaseDraft = {
  caseId: string
  category:
    | "fulfillment_follow_up"
    | "payment_review"
    | "address_review"
    | "return_review"
  priority: "low" | "medium" | "high"
  evidence: string[]
  recommendation: string
  supportDraft: string
  eligibility?: EligibilityResult
  status: "draft" | "pending_review" | "completed"
  lastEditedBy: "agent" | "user"
  version: number
}

export type ReviewItem = {
  id: string
  workflowId: string
  draftVersion: number
  state: "pending" | "approved" | "returned" | "completed"
  requiredAction: "resolve_case"
  createdAt: string
}

export type AuditEntry = {
  id: string
  actor: "agent" | "user"
  action:
    | "case_draft_saved"
    | "review_opened"
    | "review_approved"
    | "review_returned"
    | "case_resolved"
  workflowId: string
  occurredAt: string
  result: "saved" | "queued" | "approved" | "returned" | "completed"
}

export type WorkflowSnapshot = {
  version: number
  cases: OpsCase[]
  caseDrafts: CaseDraft[]
  reviews: ReviewItem[]
  audit: AuditEntry[]
}

export type CaseDraftInput = Pick<
  CaseDraft,
  | "caseId"
  | "category"
  | "priority"
  | "evidence"
  | "recommendation"
  | "supportDraft"
  | "eligibility"
>
