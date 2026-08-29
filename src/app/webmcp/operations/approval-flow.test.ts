import { describe, expect, it } from "vitest"
import {
  approveReview,
  completeReview,
  createInitialOperationsState,
  openCaseReview,
  openProductReview,
  returnReview,
  saveCaseDraft,
  saveProductDraft,
} from "./operations-state"

const now = "2026-08-29T00:00:00.000Z"

const productInput = {
  candidateId: "CAT-1001",
  title: "AeroPress Clear Coffee Maker",
  category: "Kitchen > Coffee",
  description: "A safe and complete product draft.",
  specifications: { material: "Tritan" },
}

const caseInput = {
  caseId: "CASE-2001",
  category: "fulfillment_follow_up",
  priority: "high",
  evidence: ["dispatch_sla_exceeded"],
  recommendation: "Route to the fulfillment review queue.",
  supportDraft: "The dispatch status is under review.",
}

describe("approval flow", () => {
  it("combines product and case drafts in one review queue", () => {
    let state = createInitialOperationsState()
    state = saveProductDraft(state, productInput, "agent", now)
    state = openProductReview(state, "CAT-1001", "agent", now)
    state = saveCaseDraft(state, caseInput, "agent", now)
    state = openCaseReview(state, "CASE-2001", "agent", now)

    expect(state.reviews).toEqual([
      expect.objectContaining({ workflowType: "product", state: "pending" }),
      expect.objectContaining({ workflowType: "case", state: "pending" }),
    ])
  })

  it("returns work without performing the final action", () => {
    const pending = openProductReview(
      saveProductDraft(
        createInitialOperationsState(),
        productInput,
        "agent",
        now
      ),
      "CAT-1001",
      "agent",
      now
    )
    const returned = returnReview(pending, "REV-CAT-1001", "user", now)

    expect(returned.reviews[0]?.state).toBe("returned")
    expect(returned.productDrafts[0]?.status).toBe("draft")
    expect(returned.audit.at(-1)).toMatchObject({
      actor: "user",
      action: "review_returned",
      result: "returned",
    })
  })

  it("requires a user approval before a user can complete final handling", () => {
    const pending = openProductReview(
      saveProductDraft(
        createInitialOperationsState(),
        productInput,
        "agent",
        now
      ),
      "CAT-1001",
      "agent",
      now
    )

    expect(() => approveReview(pending, "REV-CAT-1001", "agent", now)).toThrow(
      /explicit user actor/
    )
    expect(() => completeReview(pending, "REV-CAT-1001", "user", now)).toThrow(
      /Approved review/
    )

    const approved = approveReview(pending, "REV-CAT-1001", "user", now)
    const completed = completeReview(approved, "REV-CAT-1001", "user", now)
    expect(completed.reviews[0]?.state).toBe("completed")
    expect(completed.productDrafts[0]?.status).toBe("published")
  })

  it("keeps audit entries structural and excludes draft content", () => {
    const pending = openProductReview(
      saveProductDraft(
        createInitialOperationsState(),
        productInput,
        "agent",
        now
      ),
      "CAT-1001",
      "agent",
      now
    )

    const serialized = JSON.stringify(pending.audit)
    expect(serialized).not.toContain(productInput.description)
    expect(serialized).not.toContain(productInput.title)
    for (const entry of pending.audit) {
      expect(Object.keys(entry).sort()).toEqual([
        "action",
        "actor",
        "id",
        "occurredAt",
        "result",
        "workflowId",
      ])
    }
  })

  it("invalidates approval when an agent changes the reviewed draft", () => {
    const pending = openProductReview(
      saveProductDraft(
        createInitialOperationsState(),
        productInput,
        "agent",
        now
      ),
      "CAT-1001",
      "agent",
      now
    )
    const approved = approveReview(pending, "REV-CAT-1001", "user", now)
    const revised = saveProductDraft(
      approved,
      { ...productInput, description: "A revised safe product draft." },
      "agent",
      now
    )

    expect(revised.reviews[0]).toMatchObject({
      draftVersion: 1,
      state: "returned",
    })
    expect(revised.productDrafts[0]?.version).toBe(2)
    expect(() => completeReview(revised, "REV-CAT-1001", "user", now)).toThrow(
      /Approved review/
    )

    const reopened = openProductReview(revised, "CAT-1001", "agent", now)
    expect(reopened.reviews[0]).toMatchObject({
      draftVersion: 2,
      state: "pending",
    })
  })
})
