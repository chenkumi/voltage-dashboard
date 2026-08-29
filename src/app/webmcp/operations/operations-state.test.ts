import { describe, expect, it } from "vitest"
import {
  approveReview,
  completeReview,
  createInitialOperationsState,
  openCaseReview,
  resolveCase,
  returnReview,
  saveCaseDraft,
} from "./operations-state"

const now = "2026-08-29T00:00:00.000Z"
const caseDraft = {
  caseId: "CASE-2001",
  category: "fulfillment_follow_up",
  priority: "high",
  evidence: ["dispatch_sla_exceeded"],
  recommendation: "Escalate to the fulfillment review queue.",
  supportDraft: "The dispatch status is under review.",
}

describe("operations state", () => {
  it("keeps case drafts reversible and reserves final completion for a user", () => {
    const saved = saveCaseDraft(
      createInitialOperationsState(),
      caseDraft,
      "agent",
      now
    )
    const revised = saveCaseDraft(
      saved,
      { ...caseDraft, recommendation: "A revised safe recommendation." },
      "user",
      now
    )
    const pending = openCaseReview(revised, caseDraft.caseId, "agent", now)
    const approved = approveReview(
      pending,
      `REV-${caseDraft.caseId}`,
      "user",
      now
    )
    const completed = completeReview(
      approved,
      `REV-${caseDraft.caseId}`,
      "user",
      now
    )

    expect(revised.caseDrafts[0]).toMatchObject({
      version: 2,
      lastEditedBy: "user",
      status: "draft",
    })
    expect(pending.caseDrafts[0]?.status).toBe("pending_review")
    expect(approved.reviews[0]?.state).toBe("approved")
    expect(completed.caseDrafts[0]?.status).toBe("completed")
    expect(completed.reviews[0]?.state).toBe("completed")
  })

  it("validates case enums, arrays, extra fields, and sensitive content", () => {
    expect(() =>
      saveCaseDraft(createInitialOperationsState(), caseDraft, "agent", now)
    ).not.toThrow()
    expect(() =>
      saveCaseDraft(
        createInitialOperationsState(),
        { ...caseDraft, priority: "urgent" },
        "agent",
        now
      )
    ).toThrow(/priority/)
    expect(() =>
      saveCaseDraft(
        createInitialOperationsState(),
        { ...caseDraft, evidence: Array.from({ length: 9 }, () => "status") },
        "agent",
        now
      )
    ).toThrow(/at most 8/)
    expect(() =>
      saveCaseDraft(
        createInitialOperationsState(),
        { ...caseDraft, supportDraft: "Call +1 555 123 4567", debug: true },
        "agent",
        now
      )
    ).toThrow()
  })

  it("keeps audit entries structural and free of draft text", () => {
    const next = saveCaseDraft(
      createInitialOperationsState(),
      caseDraft,
      "agent",
      now
    )

    expect(next.audit).toEqual([
      {
        id: "AUD-1",
        actor: "agent",
        action: "case_draft_saved",
        workflowId: "CASE-2001",
        occurredAt: now,
        result: "saved",
      },
    ])
    expect(JSON.stringify(next.audit)).not.toContain(caseDraft.recommendation)
  })

  it("rejects non-user final actions at runtime", () => {
    const pending = openCaseReview(
      saveCaseDraft(createInitialOperationsState(), caseDraft, "agent", now),
      caseDraft.caseId,
      "agent",
      now
    )

    expect(() =>
      completeReview(pending, `REV-${caseDraft.caseId}`, "agent", now)
    ).toThrow(/explicit user actor/)
  })

  it("restores case draft status when a user returns a review", () => {
    const pending = openCaseReview(
      saveCaseDraft(createInitialOperationsState(), caseDraft, "agent", now),
      caseDraft.caseId,
      "agent",
      now
    )
    const returned = returnReview(
      pending,
      `REV-${caseDraft.caseId}`,
      "user",
      now
    )

    expect(returned.reviews[0]?.state).toBe("returned")
    expect(returned.caseDrafts[0]?.status).toBe("draft")
    expect(returned.cases[0]?.status).toBe("drafted")
  })

  it("keeps return preparation separate from user-only final handling", () => {
    const input = {
      caseId: "CASE-2004",
      category: "return_review",
      priority: "low",
      evidence: ["delivered", "return_reason_changed_mind"],
      recommendation: "Apply the deterministic return policy.",
      supportDraft: "The return request is ready for a human decision.",
      eligibility: {
        decision: "eligible",
        matchedRules: ["within_30_days", "unused_unopened", "not_final_sale"],
        missingEvidence: [],
      },
    }
    const saved = saveCaseDraft(
      createInitialOperationsState(),
      input,
      "agent",
      now
    )

    expect(() => resolveCase(saved, input, "agent", now)).toThrow(
      /explicit user actor/
    )
    expect(
      resolveCase(saved, input, "user", now).cases.find(
        ({ id }) => id === input.caseId
      )?.status
    ).toBe("resolved")
  })

  it("rejects mismatched categories and invented eligibility results", () => {
    const base = {
      caseId: "CASE-2004",
      category: "return_review",
      priority: "low",
      evidence: ["delivered"],
      recommendation: "Review the return policy.",
      supportDraft: "The return request remains under review.",
    }
    expect(() =>
      saveCaseDraft(
        createInitialOperationsState(),
        { ...base, category: "payment_review" },
        "agent",
        now
      )
    ).toThrow(/does not match/)
    expect(() =>
      saveCaseDraft(
        createInitialOperationsState(),
        {
          ...base,
          eligibility: {
            decision: "ineligible",
            matchedRules: ["invented_rule"],
            missingEvidence: [],
          },
        },
        "agent",
        now
      )
    ).toThrow(/deterministic return policy/)
  })

  it("requires evidence to be a unique subset of immutable case facts", () => {
    expect(() =>
      saveCaseDraft(
        createInitialOperationsState(),
        { ...caseDraft, evidence: ["invented_status"] },
        "agent",
        now
      )
    ).toThrow(/unique subset/)
    expect(() =>
      saveCaseDraft(
        createInitialOperationsState(),
        {
          ...caseDraft,
          evidence: ["dispatch_sla_exceeded", "dispatch_sla_exceeded"],
        },
        "agent",
        now
      )
    ).toThrow(/unique subset/)
  })
})
