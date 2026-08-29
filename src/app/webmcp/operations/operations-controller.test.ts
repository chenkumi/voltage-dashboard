import { describe, expect, it, vi } from "vitest"
import { OperationsController } from "./operations-controller"
import type { CaseDraftInput } from "./types"

const caseDraft = {
  caseId: "CASE-2001",
  category: "fulfillment_follow_up",
  priority: "high",
  evidence: ["dispatch_sla_exceeded"],
  recommendation: "Route to the fulfillment review queue.",
  supportDraft: "The dispatch status is under review.",
} satisfies CaseDraftInput

describe("OperationsController", () => {
  it("updates the stable snapshot and notifies subscribers synchronously", async () => {
    const controller = new OperationsController({
      now: () => "2026-08-29T00:00:00.000Z",
    })
    const listener = vi.fn()
    const unsubscribe = controller.subscribe(listener)
    const initial = controller.getSnapshot()

    const returned = controller.saveCaseDraft(caseDraft)
    const snapshotBeforePromiseResolution = controller.getSnapshot()
    await Promise.resolve(returned)

    expect(initial.version).toBe(0)
    expect(snapshotBeforePromiseResolution.version).toBe(1)
    expect(snapshotBeforePromiseResolution).toBe(returned)
    expect(controller.getSnapshot()).toBe(snapshotBeforePromiseResolution)
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    controller.saveCaseDraft({
      ...caseDraft,
      recommendation: "A second safe recommendation.",
    })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("allows only the user-facing controller API to complete reviews", () => {
    const controller = new OperationsController()
    controller.saveCaseDraft(caseDraft)
    controller.openCaseReview(caseDraft.caseId)
    controller.approveReview(`REV-${caseDraft.caseId}`, "user")

    controller.completeReview(`REV-${caseDraft.caseId}`, "user")

    expect(controller.getSnapshot().caseDrafts[0]?.status).toBe("completed")
    expect(controller.getSnapshot().audit.at(-1)?.actor).toBe("user")
  })

  it("rejects non-user completion and freezes exposed snapshots", () => {
    const controller = new OperationsController()
    controller.saveCaseDraft(caseDraft)
    controller.openCaseReview(caseDraft.caseId)

    expect(() =>
      controller.completeReview(`REV-${caseDraft.caseId}`, "agent")
    ).toThrow(/explicit user actor/)
    expect(() => controller.getSnapshot().reviews.push()).toThrow()
    expect(controller.getSnapshot().reviews[0]?.state).toBe("pending")
  })

  it("resolves a case atomically and never exposes intermediate review state", () => {
    const controller = new OperationsController()
    const observedStatuses: string[] = []
    controller.subscribe(() => {
      observedStatuses.push(
        controller.getSnapshot().caseDrafts[0]?.status ?? "missing"
      )
    })

    controller.resolveCase(caseDraft, "user")

    expect(observedStatuses).toEqual(["completed"])
    expect(controller.getSnapshot()).toMatchObject({
      caseDrafts: [{ status: "completed" }],
      reviews: [{ state: "completed" }],
    })
    expect(controller.getSnapshot().audit.map(({ action }) => action)).toEqual([
      "case_draft_saved",
      "review_opened",
      "review_approved",
      "case_resolved",
    ])
  })

  it("leaves the snapshot unchanged when atomic resolution is rejected", () => {
    const controller = new OperationsController()
    const initial = controller.getSnapshot()
    const listener = vi.fn()
    controller.subscribe(listener)

    expect(() =>
      controller.resolveCase(
        { ...caseDraft, supportDraft: "Contact demo@example.com" },
        "user"
      )
    ).toThrow()
    expect(controller.getSnapshot()).toBe(initial)
    expect(listener).not.toHaveBeenCalled()
  })
})
