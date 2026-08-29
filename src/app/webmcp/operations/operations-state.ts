import {
  assertSafeOperationsText,
  assertSafeShortText,
  assertSafeSpecifications,
  assertSafeTextList,
} from "./operations-content-safety"
import { catalogCandidates, operationsCases } from "./operations-data"
import type {
  AuditEntry,
  CaseDraft,
  CaseDraftInput,
  EligibilityResult,
  ProductDraft,
  ProductDraftInput,
  ReviewItem,
  WorkflowSnapshot,
} from "./types"

const productInputKeys = [
  "candidateId",
  "title",
  "category",
  "description",
  "specifications",
] as const

const caseInputKeys = [
  "caseId",
  "category",
  "priority",
  "evidence",
  "recommendation",
  "supportDraft",
  "eligibility",
] as const

const caseCategories = [
  "fulfillment_follow_up",
  "payment_review",
  "address_review",
  "return_review",
] as const

const priorities = ["low", "medium", "high"] as const
const eligibilityDecisions = [
  "eligible",
  "ineligible",
  "needs_human_review",
] as const

export class OperationsStateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "OperationsStateError"
  }
}

const assertRecord = (
  value: unknown,
  field: string
): asserts value is Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OperationsStateError(`${field} must be an object.`)
  }
}

const assertExactKeys = (
  value: Record<string, unknown>,
  allowed: readonly string[],
  field: string
) => {
  const extra = Object.keys(value).find((key) => !allowed.includes(key))
  if (extra) {
    throw new OperationsStateError(`${field} contains unknown field ${extra}.`)
  }
}

const assertEnum = <T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string
): asserts value is T => {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new OperationsStateError(`${field} is invalid.`)
  }
}

const assertUserActor = (actor: unknown): asserts actor is "user" => {
  if (actor !== "user") {
    throw new OperationsStateError(
      "Final review actions require an explicit user actor."
    )
  }
}

const validateEligibility = (value: unknown): EligibilityResult | undefined => {
  if (value === undefined) return undefined
  assertRecord(value, "eligibility")
  assertExactKeys(
    value,
    ["decision", "matchedRules", "missingEvidence"],
    "eligibility"
  )
  assertEnum(value.decision, eligibilityDecisions, "eligibility.decision")
  assertSafeTextList(value.matchedRules, "eligibility.matchedRules", {
    maxItems: 6,
  })
  assertSafeTextList(value.missingEvidence, "eligibility.missingEvidence", {
    maxItems: 6,
  })
  return {
    decision: value.decision,
    matchedRules: [...value.matchedRules],
    missingEvidence: [...value.missingEvidence],
  }
}

const copyInitialData = (): WorkflowSnapshot => ({
  version: 0,
  candidates: catalogCandidates.map((candidate) => ({
    ...candidate,
    specifications: { ...candidate.specifications },
    missingFields: [...candidate.missingFields],
  })),
  productDrafts: [],
  cases: operationsCases.map((opsCase) => ({
    ...opsCase,
    facts: [...opsCase.facts],
    returnFacts: opsCase.returnFacts ? { ...opsCase.returnFacts } : undefined,
  })),
  caseDrafts: [],
  reviews: [],
  audit: [],
})

export const createInitialOperationsState = copyInitialData

const addAudit = (
  state: WorkflowSnapshot,
  entry: Omit<AuditEntry, "id">
): WorkflowSnapshot => {
  const version = state.version + 1
  return {
    ...state,
    version,
    audit: [...state.audit, { ...entry, id: `AUD-${version}` }],
  }
}

export const saveProductDraft = (
  state: WorkflowSnapshot,
  input: unknown,
  actor: "agent" | "user",
  now: string
): WorkflowSnapshot => {
  assertRecord(input, "product draft")
  assertExactKeys(input, productInputKeys, "product draft")
  assertSafeShortText(input.candidateId, "candidateId")
  assertSafeShortText(input.title, "title")
  assertSafeShortText(input.category, "category")
  assertSafeOperationsText(input.description, "description")
  assertSafeSpecifications(input.specifications)

  if (!state.candidates.some(({ id }) => id === input.candidateId)) {
    throw new OperationsStateError("Catalog candidate not found.")
  }

  const current = state.productDrafts.find(
    ({ candidateId }) => candidateId === input.candidateId
  )
  if (current?.status === "published") {
    throw new OperationsStateError(
      "Published product drafts cannot be changed."
    )
  }

  const draft: ProductDraft = {
    ...(input as ProductDraftInput),
    specifications: { ...(input.specifications as Record<string, string>) },
    status: "draft",
    lastEditedBy: actor,
    version: (current?.version ?? 0) + 1,
  }
  const productDrafts = current
    ? state.productDrafts.map((item) =>
        item.candidateId === draft.candidateId ? draft : item
      )
    : [...state.productDrafts, draft]

  return addAudit(
    { ...state, productDrafts },
    {
      actor,
      action: "product_draft_saved",
      workflowId: draft.candidateId,
      occurredAt: now,
      result: "saved",
    }
  )
}

export const saveCaseDraft = (
  state: WorkflowSnapshot,
  input: unknown,
  actor: "agent" | "user",
  now: string
): WorkflowSnapshot => {
  assertRecord(input, "case draft")
  assertExactKeys(input, caseInputKeys, "case draft")
  assertSafeShortText(input.caseId, "caseId")
  assertEnum(input.category, caseCategories, "category")
  assertEnum(input.priority, priorities, "priority")
  assertSafeTextList(input.evidence, "evidence")
  assertSafeOperationsText(input.recommendation, "recommendation")
  assertSafeOperationsText(input.supportDraft, "supportDraft")
  const eligibility = validateEligibility(input.eligibility)

  const opsCase = state.cases.find(({ id }) => id === input.caseId)
  if (!opsCase) throw new OperationsStateError("Operations case not found.")
  if (opsCase.status === "resolved") {
    throw new OperationsStateError("Resolved cases cannot be changed.")
  }

  const current = state.caseDrafts.find(({ caseId }) => caseId === input.caseId)
  const draft: CaseDraft = {
    ...(input as CaseDraftInput),
    evidence: [...(input.evidence as string[])],
    eligibility,
    status: "draft",
    lastEditedBy: actor,
    version: (current?.version ?? 0) + 1,
  }
  const caseDrafts = current
    ? state.caseDrafts.map((item) =>
        item.caseId === draft.caseId ? draft : item
      )
    : [...state.caseDrafts, draft]
  const cases = state.cases.map((item) =>
    item.id === draft.caseId ? { ...item, status: "drafted" as const } : item
  )

  return addAudit(
    { ...state, caseDrafts, cases },
    {
      actor,
      action: "case_draft_saved",
      workflowId: draft.caseId,
      occurredAt: now,
      result: "saved",
    }
  )
}

const openReview = (
  state: WorkflowSnapshot,
  workflowType: ReviewItem["workflowType"],
  workflowId: string,
  actor: "agent" | "user",
  now: string
): WorkflowSnapshot => {
  const existing = state.reviews.find(
    (review) =>
      review.workflowType === workflowType &&
      review.workflowId === workflowId &&
      review.state !== "completed"
  )
  if (existing?.state === "pending") return state

  const review: ReviewItem = existing
    ? { ...existing, state: "pending" }
    : {
        id: `REV-${workflowId}`,
        workflowType,
        workflowId,
        state: "pending",
        requiredAction:
          workflowType === "product" ? "publish_product" : "resolve_case",
        createdAt: now,
      }
  const reviews = existing
    ? state.reviews.map((item) => (item.id === review.id ? review : item))
    : [...state.reviews, review]

  return addAudit(
    { ...state, reviews },
    {
      actor,
      action: "review_opened",
      workflowId,
      occurredAt: now,
      result: "queued",
    }
  )
}

export const openProductReview = (
  state: WorkflowSnapshot,
  candidateId: string,
  actor: "agent" | "user",
  now: string
) => {
  const draft = state.productDrafts.find(
    (item) => item.candidateId === candidateId
  )
  if (!draft || draft.status === "published") {
    throw new OperationsStateError("An editable product draft is required.")
  }
  const next = openReview(state, "product", candidateId, actor, now)
  return {
    ...next,
    productDrafts: next.productDrafts.map((item) =>
      item.candidateId === candidateId
        ? { ...item, status: "pending_review" as const }
        : item
    ),
  }
}

export const openCaseReview = (
  state: WorkflowSnapshot,
  caseId: string,
  actor: "agent" | "user",
  now: string
) => {
  const draft = state.caseDrafts.find((item) => item.caseId === caseId)
  if (!draft || draft.status === "completed") {
    throw new OperationsStateError("An editable case draft is required.")
  }
  const next = openReview(state, "case", caseId, actor, now)
  return {
    ...next,
    caseDrafts: next.caseDrafts.map((item) =>
      item.caseId === caseId
        ? { ...item, status: "pending_review" as const }
        : item
    ),
    cases: next.cases.map((item) =>
      item.id === caseId ? { ...item, status: "pending_review" as const } : item
    ),
  }
}

export const returnReview = (
  state: WorkflowSnapshot,
  reviewId: string,
  actor: unknown,
  now: string
): WorkflowSnapshot => {
  assertUserActor(actor)
  const review = state.reviews.find(({ id }) => id === reviewId)
  if (!review || review.state !== "pending") {
    throw new OperationsStateError("Pending review not found.")
  }
  return addAudit(
    {
      ...state,
      reviews: state.reviews.map((item) =>
        item.id === reviewId ? { ...item, state: "returned" as const } : item
      ),
      productDrafts: state.productDrafts.map((draft) =>
        review.workflowType === "product" &&
        draft.candidateId === review.workflowId
          ? { ...draft, status: "draft" as const }
          : draft
      ),
      caseDrafts: state.caseDrafts.map((draft) =>
        review.workflowType === "case" && draft.caseId === review.workflowId
          ? { ...draft, status: "draft" as const }
          : draft
      ),
      cases: state.cases.map((opsCase) =>
        review.workflowType === "case" && opsCase.id === review.workflowId
          ? { ...opsCase, status: "drafted" as const }
          : opsCase
      ),
    },
    {
      actor,
      action: "review_returned",
      workflowId: review.workflowId,
      occurredAt: now,
      result: "returned",
    }
  )
}

export const completeReview = (
  state: WorkflowSnapshot,
  reviewId: string,
  actor: unknown,
  now: string
): WorkflowSnapshot => {
  assertUserActor(actor)
  const review = state.reviews.find(({ id }) => id === reviewId)
  if (!review || review.state !== "pending") {
    throw new OperationsStateError("Pending review not found.")
  }

  const next: WorkflowSnapshot = {
    ...state,
    reviews: state.reviews.map((item) =>
      item.id === reviewId ? { ...item, state: "completed" as const } : item
    ),
    productDrafts: state.productDrafts.map((draft) =>
      review.workflowType === "product" &&
      draft.candidateId === review.workflowId
        ? { ...draft, status: "published" as const }
        : draft
    ),
    caseDrafts: state.caseDrafts.map((draft) =>
      review.workflowType === "case" && draft.caseId === review.workflowId
        ? { ...draft, status: "completed" as const }
        : draft
    ),
    cases: state.cases.map((opsCase) =>
      review.workflowType === "case" && opsCase.id === review.workflowId
        ? { ...opsCase, status: "resolved" as const }
        : opsCase
    ),
  }

  return addAudit(next, {
    actor,
    action:
      review.workflowType === "product" ? "product_published" : "case_resolved",
    workflowId: review.workflowId,
    occurredAt: now,
    result: "completed",
  })
}
