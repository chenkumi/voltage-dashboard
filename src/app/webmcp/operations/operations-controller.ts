import {
  approveReview,
  completeReview,
  createInitialOperationsState,
  openCaseReview,
  resolveCase,
  returnReview,
  saveCaseDraft,
} from "./operations-state"
import type { CaseDraftInput, WorkflowSnapshot } from "./types"

type Listener = () => void

const freezeSnapshot = (snapshot: WorkflowSnapshot): WorkflowSnapshot => {
  const freeze = (value: unknown) => {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  freeze(snapshot)
  return snapshot
}

export class OperationsController {
  private snapshot: WorkflowSnapshot
  private readonly listeners = new Set<Listener>()
  private readonly now: () => string

  constructor(options: { now?: () => string } = {}) {
    this.snapshot = freezeSnapshot(createInitialOperationsState())
    this.now = options.now ?? (() => new Date().toISOString())
  }

  getSnapshot = () => this.snapshot

  subscribe = (listener: Listener) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private update(next: WorkflowSnapshot) {
    if (next === this.snapshot) return this.snapshot
    this.snapshot = freezeSnapshot(next)
    this.listeners.forEach((listener) => {
      try {
        listener()
      } catch {
        // A broken subscriber must not roll back or mask a committed transition.
      }
    })
    return this.snapshot
  }

  saveCaseDraft(input: CaseDraftInput, actor: "agent" | "user" = "agent") {
    return this.update(saveCaseDraft(this.snapshot, input, actor, this.now()))
  }

  openCaseReview(caseId: string, actor: "agent" | "user" = "agent") {
    return this.update(openCaseReview(this.snapshot, caseId, actor, this.now()))
  }

  approveReview(reviewId: string, actor: unknown) {
    return this.update(
      approveReview(this.snapshot, reviewId, actor, this.now())
    )
  }

  resolveCase(input: CaseDraftInput, actor: unknown) {
    return this.update(resolveCase(this.snapshot, input, actor, this.now()))
  }

  returnReview(reviewId: string, actor: unknown) {
    return this.update(returnReview(this.snapshot, reviewId, actor, this.now()))
  }

  completeReview(reviewId: string, actor: unknown) {
    return this.update(
      completeReview(this.snapshot, reviewId, actor, this.now())
    )
  }

  dispose() {
    this.listeners.clear()
  }
}
