import { describe, expect, it, vi } from "vitest"
import { OperationsController } from "./operations-controller"

const productDraft = {
  candidateId: "CAT-1001",
  title: "AeroPress Clear Coffee Maker",
  category: "Kitchen > Coffee",
  description: "A compact manual brewer for a clear and consistent cup.",
  specifications: { material: "Tritan" },
}

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
})
