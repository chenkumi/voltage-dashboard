import type { EligibilityResult, ReturnReason, ReturnSource } from "./types"

export type ReturnFormDraft = {
  orderId: string
  source: ReturnSource
  reason: ReturnReason
  customerStatement: string
  items: readonly {
    orderLineId: string
    requestedQuantity: number
  }[]
}

export type ReturnFormEditorState = {
  route: "return-create"
  draft: ReturnFormDraft
  dirty: boolean
  valid: boolean
  missingFields: readonly string[]
  version: number
}

export type ReturnReviewDraft = {
  evidenceCodes: readonly string[]
  operationalSummary: string
  nextStep: string
  supportDraft: string
}

export type ReturnReviewEditorState = {
  route: "return-detail"
  rmaId: string
  rmaVersion: number
  policyVersion: string
  draft: ReturnReviewDraft
  dirty: boolean
  valid: boolean
  missingFields: readonly string[]
  version: number
}

type Session<T> = {
  state: T
  apply: (state: T) => void
}

const formMissingFields = (draft: ReturnFormDraft) => [
  ...(draft.orderId ? [] : ["orderId"]),
  ...(draft.customerStatement.trim() ? [] : ["customerStatement"]),
  ...(draft.items.length > 0 ? [] : ["items"]),
]

export const createReturnFormEditorState = (
  draft: ReturnFormDraft,
  version = 1,
  dirty = false
): ReturnFormEditorState => {
  const missingFields = formMissingFields(draft)
  return {
    route: "return-create",
    draft,
    dirty,
    valid: missingFields.length === 0,
    missingFields,
    version,
  }
}

const reviewMissingFields = (draft: ReturnReviewDraft) => [
  ...(draft.evidenceCodes.length > 0 ? [] : ["evidenceCodes"]),
  ...(draft.operationalSummary.trim() ? [] : ["operationalSummary"]),
  ...(draft.nextStep.trim() ? [] : ["nextStep"]),
  ...(draft.supportDraft.trim() ? [] : ["supportDraft"]),
]

export const createReturnReviewEditorState = (
  identity: Pick<
    ReturnReviewEditorState,
    "rmaId" | "rmaVersion" | "policyVersion"
  >,
  draft: ReturnReviewDraft = {
    evidenceCodes: [],
    operationalSummary: "",
    nextStep: "",
    supportDraft: "",
  },
  version = 1,
  dirty = false
): ReturnReviewEditorState => {
  const missingFields = reviewMissingFields(draft)
  return {
    route: "return-detail",
    ...identity,
    draft,
    dirty,
    valid: missingFields.length === 0,
    missingFields,
    version,
  }
}

export class ReturnEditorController {
  private formSession: Session<ReturnFormEditorState> | null = null
  private reviewSession: Session<ReturnReviewEditorState> | null = null
  private readonly reviewStates = new Map<string, ReturnReviewEditorState>()
  private readonly policyResults = new Map<
    string,
    { rmaVersion: number; policyVersion: string; result: EligibilityResult }
  >()

  attachForm(
    state: ReturnFormEditorState,
    apply: Session<ReturnFormEditorState>["apply"]
  ) {
    this.formSession = { state, apply }
    return () => {
      this.formSession = null
    }
  }

  updateForm(state: ReturnFormEditorState) {
    if (this.formSession) this.formSession.state = state
  }

  getFormState() {
    return this.formSession?.state ?? null
  }

  applyFormDraft(
    expectedVersion: number,
    patch: Partial<Omit<ReturnFormDraft, "orderId">>
  ) {
    const current = this.formSession?.state
    if (!current) throw new Error("Return form is not open.")
    if (current.version !== expectedVersion)
      throw new Error("Return form version is stale.")
    const next = createReturnFormEditorState(
      { ...current.draft, ...patch },
      current.version + 1,
      true
    )
    this.formSession = { ...this.formSession, state: next }
    this.formSession.apply(next)
    return next
  }

  attachReview(
    state: ReturnReviewEditorState,
    apply: Session<ReturnReviewEditorState>["apply"]
  ) {
    this.reviewSession = { state, apply }
    this.reviewStates.set(state.rmaId, state)
    return () => {
      this.reviewSession = null
    }
  }

  updateReview(state: ReturnReviewEditorState) {
    if (this.reviewSession) this.reviewSession.state = state
    this.reviewStates.set(state.rmaId, state)
  }

  getReviewState(rmaId?: string) {
    if (!rmaId) return this.reviewSession?.state ?? null
    return this.reviewStates.get(rmaId) ?? null
  }

  recordPolicyResult(
    rmaId: string,
    rmaVersion: number,
    policyVersion: string,
    result: EligibilityResult
  ) {
    this.policyResults.set(rmaId, { rmaVersion, policyVersion, result })
  }

  getPolicyResult(rmaId: string, rmaVersion: number, policyVersion: string) {
    const entry = this.policyResults.get(rmaId)
    return entry?.rmaVersion === rmaVersion &&
      entry.policyVersion === policyVersion
      ? entry.result
      : null
  }

  applyReviewDraft(
    expected: {
      rmaId: string
      rmaVersion: number
      policyVersion: string
      editorVersion: number
    },
    draft: ReturnReviewDraft
  ) {
    const current = this.reviewSession?.state
    if (!current) throw new Error("Return review is not open.")
    if (
      current.rmaId !== expected.rmaId ||
      current.rmaVersion !== expected.rmaVersion ||
      current.policyVersion !== expected.policyVersion ||
      current.version !== expected.editorVersion
    )
      throw new Error("Return review version is stale.")
    const next = createReturnReviewEditorState(
      current,
      draft,
      current.version + 1,
      true
    )
    this.reviewSession = { ...this.reviewSession, state: next }
    this.reviewStates.set(next.rmaId, next)
    this.reviewSession.apply(next)
    return next
  }
}
