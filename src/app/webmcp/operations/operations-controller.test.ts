import { describe, expect, it, vi } from "vitest"
import { OperationsController } from "./operations-controller"
import type { ProductDraftInput } from "./types"

const productDraft = {
  candidateId: "CAT-1001",
  title: "AeroPress Clear Coffee Maker",
  category: "Kitchen > Coffee",
  description: "A compact manual brewer for a clear and consistent cup.",
  specifications: { material: "Tritan" },
} satisfies ProductDraftInput

describe("OperationsController", () => {
  it("updates the stable snapshot and notifies subscribers synchronously", async () => {
    const controller = new OperationsController({
      now: () => "2026-08-29T00:00:00.000Z",
    })
    const listener = vi.fn()
    const unsubscribe = controller.subscribe(listener)
    const initial = controller.getSnapshot()

    const returned = controller.saveProductDraft(productDraft)
    const snapshotBeforePromiseResolution = controller.getSnapshot()
    await Promise.resolve(returned)

    expect(initial.version).toBe(0)
    expect(snapshotBeforePromiseResolution.version).toBe(1)
    expect(snapshotBeforePromiseResolution).toBe(returned)
    expect(controller.getSnapshot()).toBe(snapshotBeforePromiseResolution)
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    controller.saveProductDraft({
      ...productDraft,
      description: "A second safe description.",
    })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("allows only the user-facing controller API to complete reviews", () => {
    const controller = new OperationsController()
    controller.saveProductDraft(productDraft)
    controller.openProductReview("CAT-1001")
    controller.approveReview("REV-CAT-1001", "user")

    controller.completeReview("REV-CAT-1001", "user")

    expect(controller.getSnapshot().productDrafts[0]?.status).toBe("published")
    expect(controller.getSnapshot().audit.at(-1)?.actor).toBe("user")
  })

  it("rejects non-user completion and freezes exposed snapshots", () => {
    const controller = new OperationsController()
    controller.saveProductDraft(productDraft)
    controller.openProductReview("CAT-1001")

    expect(() => controller.completeReview("REV-CAT-1001", "agent")).toThrow(
      /explicit user actor/
    )
    expect(() => controller.getSnapshot().reviews.push()).toThrow()
    expect(controller.getSnapshot().reviews[0]?.state).toBe("pending")
  })

  it("publishes atomically and never exposes intermediate review state", () => {
    const controller = new OperationsController()
    const observedStatuses: string[] = []
    controller.subscribe(() => {
      observedStatuses.push(
        controller.getSnapshot().productDrafts[0]?.status ?? "missing"
      )
    })

    controller.publishProduct(productDraft, "user")

    expect(observedStatuses).toEqual(["published"])
    expect(controller.getSnapshot()).toMatchObject({
      productDrafts: [{ status: "published" }],
      reviews: [{ state: "completed" }],
    })
    expect(controller.getSnapshot().audit.map(({ action }) => action)).toEqual([
      "product_draft_saved",
      "review_opened",
      "review_approved",
      "product_published",
    ])
  })

  it("leaves the snapshot unchanged when atomic publication is rejected", () => {
    const controller = new OperationsController()
    const initial = controller.getSnapshot()
    const listener = vi.fn()
    controller.subscribe(listener)

    expect(() =>
      controller.publishProduct(
        { ...productDraft, specifications: { recipient: "John Smith" } },
        "user"
      )
    ).toThrow()
    expect(controller.getSnapshot()).toBe(initial)
    expect(listener).not.toHaveBeenCalled()
  })

  it("resolves a case atomically for an explicit user actor", () => {
    const controller = new OperationsController()
    const listener = vi.fn()
    controller.subscribe(listener)
    const input = {
      caseId: "CASE-2001",
      category: "fulfillment_follow_up" as const,
      priority: "high" as const,
      evidence: ["dispatch_sla_exceeded"],
      recommendation: "Route to the fulfillment review queue.",
      supportDraft: "The dispatch status is under review.",
    }

    controller.resolveCase(input, "user")

    expect(listener).toHaveBeenCalledTimes(1)
    const snapshot = controller.getSnapshot()
    expect(snapshot.cases.find(({ id }) => id === "CASE-2001")).toMatchObject({
      status: "resolved",
    })
    expect(snapshot.caseDrafts[0]).toMatchObject({
      caseId: "CASE-2001",
      status: "completed",
    })
    expect(snapshot.reviews[0]).toMatchObject({
      workflowId: "CASE-2001",
      state: "completed",
    })
  })
})
