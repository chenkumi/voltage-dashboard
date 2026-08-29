import {
  assertSafeOperationsText,
  assertSafeShortText,
  assertSafeTextList,
} from "./operations-content-safety"
import { operationsCases } from "./operations-data"
import { checkReturnEligibility } from "./return-policy"
import type {
  AuditEntry,
  CaseDraft,
  CaseDraftInput,
  EligibilityResult,
  ReviewItem,
  WorkflowSnapshot,
} from "./types"

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

const assertRecord: (
  value: unknown,
  field: string
) => asserts value is Record<string, unknown> = (value, field) => {
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

function assertEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string
): asserts value is T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new OperationsStateError(`${field} is invalid.`)
  }
}

const assertUserActor: (actor: unknown) => asserts actor is "user" = (
  actor
) => {
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
  const expectedCategory = {
    fulfillment: "fulfillment_follow_up",
    payment_check: "payment_review",
    address_validation: "address_review",
    return_request: "return_review",
  }[opsCase.type]
  if (input.category !== expectedCategory) {
    throw new OperationsStateError("Category does not match the case type.")
  }
  if (
    input.evidence.some((item) => !opsCase.facts.includes(item)) ||
    new Set(input.evidence).size !== input.evidence.length
  ) {
    throw new OperationsStateError(
      "Evidence must be a unique subset of the case facts."
    )
  }
  if (opsCase.type !== "return_request" && eligibility) {
    throw new OperationsStateError(
      "Eligibility applies only to return request cases."
    )
  }
  if (
    eligibility &&
    JSON.stringify(eligibility) !==
      JSON.stringify(checkReturnEligibility(opsCase))
  ) {
    throw new OperationsStateError(
      "Eligibility must match the deterministic return policy."
    )
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
  const reviews = state.reviews.map((review) =>
    review.workflowId === draft.caseId &&
    (review.state === "pending" || review.state === "approved")
      ? { ...review, state: "returned" as const }
      : review
  )

  return addAudit(
    { ...state, caseDrafts, cases, reviews },
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
  workflowId: string,
  draftVersion: number,
  actor: "agent" | "user",
  now: string
): WorkflowSnapshot => {
  const existing = state.reviews.find(
    (review) =>
      review.workflowId === workflowId &&
      review.state !== "completed"
  )
  if (existing?.state === "pending" || existing?.state === "approved") {
    return state
  }

  const review: ReviewItem = existing
    ? { ...existing, draftVersion, state: "pending" }
    : {
        id: `REV-${workflowId}`,
        workflowId,
        draftVersion,
        state: "pending",
        requiredAction: "resolve_case",
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
  const opsCase = state.cases.find((item) => item.id === caseId)
  if (opsCase?.type === "return_request" && !draft.eligibility) {
    throw new OperationsStateError(
      "Return eligibility is required before human review."
    )
  }
  const next = openReview(state, caseId, draft.version, actor, now)
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

export const resolveCase = (
  state: WorkflowSnapshot,
  input: unknown,
  actor: unknown,
  now: string
): WorkflowSnapshot => {
  assertUserActor(actor)
  assertRecord(input, "case draft")
  const caseId = input.caseId
  assertSafeShortText(caseId, "caseId")
  const opsCase = state.cases.find((item) => item.id === caseId)
  if (opsCase?.type === "return_request" && !input.eligibility) {
    throw new OperationsStateError(
      "Return eligibility is required before final handling."
    )
  }

  const saved = saveCaseDraft(state, input, actor, now)
  const pending = openCaseReview(saved, caseId, actor, now)
  const approved = approveReview(pending, `REV-${caseId}`, actor, now)
  return completeReview(approved, `REV-${caseId}`, actor, now)
}

export const approveReview = (
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
        item.id === reviewId ? { ...item, state: "approved" as const } : item
      ),
    },
    {
      actor,
      action: "review_approved",
      workflowId: review.workflowId,
      occurredAt: now,
      result: "approved",
    }
  )
}

export const returnReview = (
  state: WorkflowSnapshot,
  reviewId: string,
  actor: unknown,
  now: string
): WorkflowSnapshot => {
  assertUserActor(actor)
  const review = state.reviews.find(({ id }) => id === reviewId)
  if (!review || (review.state !== "pending" && review.state !== "approved")) {
    throw new OperationsStateError("Actionable review not found.")
  }
  return addAudit(
    {
      ...state,
      reviews: state.reviews.map((item) =>
        item.id === reviewId ? { ...item, state: "returned" as const } : item
      ),
      caseDrafts: state.caseDrafts.map((draft) =>
        draft.caseId === review.workflowId
          ? { ...draft, status: "draft" as const }
          : draft
      ),
      cases: state.cases.map((opsCase) =>
        opsCase.id === review.workflowId
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
  if (!review || review.state !== "approved") {
    throw new OperationsStateError("Approved review not found.")
  }
  const currentDraftVersion = state.caseDrafts.find(
    ({ caseId }) => caseId === review.workflowId
  )?.version
  if (currentDraftVersion !== review.draftVersion) {
    throw new OperationsStateError(
      "The approved draft version no longer matches the current draft."
    )
  }

  const next: WorkflowSnapshot = {
    ...state,
    reviews: state.reviews.map((item) =>
      item.id === reviewId ? { ...item, state: "completed" as const } : item
    ),
    caseDrafts: state.caseDrafts.map((draft) =>
      draft.caseId === review.workflowId
        ? { ...draft, status: "completed" as const }
        : draft
    ),
    cases: state.cases.map((opsCase) =>
      opsCase.id === review.workflowId
        ? { ...opsCase, status: "resolved" as const }
        : opsCase
    ),
  }

  return addAudit(next, {
    actor,
    action: "case_resolved",
    workflowId: review.workflowId,
    occurredAt: now,
    result: "completed",
  })
}
