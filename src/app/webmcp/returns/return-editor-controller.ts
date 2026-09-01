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

export class ReturnEditorController {
  private formSession: Session<ReturnFormEditorState> | null = null
  private readonly policyResults = new Map<
    string,
    { rmaVersion: number; policyVersion: string; result: EligibilityResult }
  >()

  attachForm(
    state: ReturnFormEditorState,
    apply: Session<ReturnFormEditorState>["apply"]
  ) {
    const session = { state, apply }
    this.formSession = session
    return () => {
      if (this.formSession === session) this.formSession = null
    }
  }

  detachForm() {
    this.formSession = null
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
    const session = this.formSession
    if (!session) throw new Error("Return form is not open.")
    const current = session.state
    if (current.version !== expectedVersion)
      throw new Error("Return form version is stale.")
    const next = createReturnFormEditorState(
      { ...current.draft, ...patch },
      current.version + 1,
      true
    )
    this.formSession = { ...session, state: next }
    session.apply(next)
    return next
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
}
