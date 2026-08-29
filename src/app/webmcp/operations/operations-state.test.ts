import { describe, expect, it } from "vitest"
import {
  completeReview,
  createInitialOperationsState,
  openProductReview,
  returnReview,
  saveCaseDraft,
  saveProductDraft,
} from "./operations-state"

const now = "2026-08-29T00:00:00.000Z"

const productDraft = {
  candidateId: "CAT-1001",
  title: "AeroPress Clear Coffee Maker",
  category: "Kitchen > Coffee",
  description: "A compact manual brewer for a clear and consistent cup.",
  specifications: { material: "Tritan", capacity: "300 ml" },
}

describe("operations state", () => {
  it("keeps drafts reversible and reserves final completion for a user", () => {
    const initial = createInitialOperationsState()
    const saved = saveProductDraft(initial, productDraft, "agent", now)
    const revised = saveProductDraft(
      saved,
      { ...productDraft, description: "A revised safe product description." },
      "user",
      now
    )
    const pending = openProductReview(revised, "CAT-1001", "agent", now)
    const completed = completeReview(pending, "REV-CAT-1001", "user", now)

    expect(revised.productDrafts[0]).toMatchObject({
      version: 2,
      lastEditedBy: "user",
      status: "draft",
    })
    expect(pending.productDrafts[0]?.status).toBe("pending_review")
    expect(completed.productDrafts[0]?.status).toBe("published")
    expect(completed.reviews[0]?.state).toBe("completed")
    expect(completed.audit.at(-1)).toEqual(
      expect.objectContaining({ actor: "user", result: "completed" })
    )
  })

  it.each([
    [{ ...productDraft, category: "invalid", unexpected: true }],
    [{ ...productDraft, description: "x".repeat(601) }],
    [{ ...productDraft, title: "Contact demo@example.com" }],
  ])("rejects invalid product draft input %#", (input) => {
    expect(() =>
      saveProductDraft(createInitialOperationsState(), input, "agent", now)
    ).toThrow()
  })

  it("validates case enums, arrays, extra fields, and sensitive content", () => {
    const base = {
      caseId: "CASE-2001",
      category: "fulfillment_follow_up",
      priority: "high",
      evidence: ["dispatch_sla_exceeded"],
      recommendation: "Escalate to the fulfillment review queue.",
      supportDraft: "The dispatch status is under review.",
    }

    expect(() =>
      saveCaseDraft(createInitialOperationsState(), base, "agent", now)
    ).not.toThrow()
    expect(() =>
      saveCaseDraft(
        createInitialOperationsState(),
        { ...base, priority: "urgent" },
        "agent",
        now
      )
    ).toThrow(/priority/)
    expect(() =>
      saveCaseDraft(
        createInitialOperationsState(),
        { ...base, evidence: Array.from({ length: 9 }, () => "status_code") },
        "agent",
        now
      )
    ).toThrow(/at most 8/)
    expect(() =>
      saveCaseDraft(
        createInitialOperationsState(),
        { ...base, supportDraft: "Call +1 555 123 4567", debug: true },
        "agent",
        now
      )
    ).toThrow()
  })

  it("keeps audit entries structural and free of draft text", () => {
    const next = saveProductDraft(
      createInitialOperationsState(),
      productDraft,
      "agent",
      now
    )

    expect(next.audit).toEqual([
      {
        id: "AUD-1",
        actor: "agent",
        action: "product_draft_saved",
        workflowId: "CAT-1001",
        occurredAt: now,
        result: "saved",
      },
    ])
    expect(JSON.stringify(next.audit)).not.toContain(productDraft.description)
  })

  it("rejects non-user final actions at runtime", () => {
    const pending = openProductReview(
      saveProductDraft(
        createInitialOperationsState(),
        productDraft,
        "agent",
        now
      ),
      "CAT-1001",
      "agent",
      now
    )

    expect(() => completeReview(pending, "REV-CAT-1001", "agent", now)).toThrow(
      /explicit user actor/
    )
  })

  it("restores draft status when a user returns a review", () => {
    const pending = openProductReview(
      saveProductDraft(
        createInitialOperationsState(),
        productDraft,
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
  })
})
