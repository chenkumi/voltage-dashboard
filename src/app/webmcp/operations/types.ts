export type SourceTrust = "verified" | "review_required"

export const PRODUCT_CATEGORIES = [
  "Kitchen > Coffee",
  "Home > Lighting",
  "Home > Storage",
  "Electronics > Accessories",
] as const

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number]

export type CatalogCandidate = {
  id: string
  sourceLabel: string
  sourceUpdatedAt: string
  sourceTrust: SourceTrust
  sourceTitle: string
  sourceSummary: string
  suggestedCategory: ProductCategory
  specifications: Record<string, string>
  missingFields: Array<"title" | "category" | "description" | "specifications">
}

export type ProductDraft = {
  candidateId: string
  title: string
  category: ProductCategory
  description: string
  specifications: Record<string, string>
  status: "draft" | "pending_review" | "published"
  lastEditedBy: "agent" | "user"
  version: number
}

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
  workflowType: "product" | "case"
  workflowId: string
  draftVersion: number
  state: "pending" | "approved" | "returned" | "completed"
  requiredAction: "publish_product" | "resolve_case"
  createdAt: string
}

export type AuditEntry = {
  id: string
  actor: "agent" | "user"
  action:
    | "product_draft_saved"
    | "case_draft_saved"
    | "review_opened"
    | "review_approved"
    | "review_returned"
    | "product_published"
    | "case_resolved"
  workflowId: string
  occurredAt: string
  result: "saved" | "queued" | "approved" | "returned" | "completed"
}

export type WorkflowSnapshot = {
  version: number
  candidates: CatalogCandidate[]
  productDrafts: ProductDraft[]
  cases: OpsCase[]
  caseDrafts: CaseDraft[]
  reviews: ReviewItem[]
  audit: AuditEntry[]
}

export type ProductDraftInput = Pick<
  ProductDraft,
  "candidateId" | "title" | "category" | "description" | "specifications"
>

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
