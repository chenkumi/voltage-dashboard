import { describe, expect, it } from "vitest"
import {
  assertApprovalIsCurrent,
  assertRmaVersion,
  assertUserActor,
  deriveReturnStage,
  ReturnWorkflowError,
} from "./return-state"
import type { RefundApproval, RefundCalculation, Rma } from "./types"

const rma = (): Rma => ({
  id: "RMA-1",
  orderId: "VM-1",
  source: "internal",
  reason: "defective",
  customerStatement: "Defective item.",
  assignee: null,
  slaDueAt: "2026-09-01T00:00:00.000Z",
  status: "active",
  eligibility: {
    status: "authorized",
    policyVersion: "v1",
    systemResult: null,
    userDecision: "authorized",
    decisionReason: "Eligible",
    assessedAt: "2026-08-31T00:00:00.000Z",
    version: 1,
  },
  logistics: {
    status: "received",
    authorizedAt: "2026-08-31T00:00:00.000Z",
    returnDueAt: "2026-09-30T00:00:00.000Z",
    receivedAt: "2026-08-31T00:00:00.000Z",
    receivedPackageCount: 1,
    receiptResult: "complete",
    version: 2,
  },
  inspection: {
    status: "completed",
    version: 2,
    startedAt: "2026-08-31T00:00:00.000Z",
    completedAt: "2026-08-31T00:00:00.000Z",
  },
  approvalStatus: "pending",
  refundStatus: "not_started",
  version: 4,
  createdAt: "2026-08-31T00:00:00.000Z",
  submittedAt: "2026-08-31T00:00:00.000Z",
  completedAt: null,
  updatedAt: "2026-08-31T00:00:00.000Z",
})

const calculation = (): RefundCalculation => ({
  id: "CALC-1",
  rmaId: "RMA-1",
  orderId: "VM-1",
  rmaVersion: 4,
  inspectionVersion: 2,
  orderSnapshotVersion: 1,
  version: 1,
  items: [],
  shippingAmount: { amount: 0, currency: "USD" },
  total: { amount: 0, currency: "USD" },
  createdAt: "2026-08-31T00:00:00.000Z",
})

const approval = (): RefundApproval => ({
  id: "APR-1",
  rmaId: "RMA-1",
  calculationId: "CALC-1",
  calculationVersion: 1,
  status: "pending",
  decidedBy: null,
  reason: "",
  createdAt: "2026-08-31T00:00:00.000Z",
  decidedAt: null,
  version: 1,
})

describe("return state invariants", () => {
  it("restricts final transitions to a user actor", () => {
    expect(() => assertUserActor("agent", "Approve refund")).toThrowError(
      ReturnWorkflowError
    )
    expect(() => assertUserActor("user", "Approve refund")).not.toThrow()
  })

  it("rejects stale RMA, calculation, and approval versions", () => {
    expect(() => assertRmaVersion(rma(), 3)).toThrowError(/changed from version/)

    const staleRma = { ...rma(), version: 5 }
    expect(() =>
      assertApprovalIsCurrent(staleRma, calculation(), approval(), 1)
    ).toThrowError(/no longer current/)

    const invalidated = { ...approval(), status: "invalidated" as const }
    expect(() =>
      assertApprovalIsCurrent(rma(), calculation(), invalidated, 1)
    ).toThrowError(/no longer current/)
  })

  it("derives the operational stage from independent status dimensions", () => {
    expect(deriveReturnStage(rma())).toBe("refund_approval")
    expect(
      deriveReturnStage({
        ...rma(),
        approvalStatus: "approved",
        refundStatus: "failed",
      })
    ).toBe("refund_retry")
  })
})
