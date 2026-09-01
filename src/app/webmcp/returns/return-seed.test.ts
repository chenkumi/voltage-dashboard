import { describe, expect, it } from "vitest"
import { createCommerceSeed } from "../commerce-data/commerce-seed"
import { createReturnSeed } from "./return-seed"

describe("return seed", () => {
  it("provides deterministic calculation and approval fixtures on distinct order lines", () => {
    const seed = createReturnSeed(createCommerceSeed(), 3)
    const approvalStatuses = seed.approvals.map((approval) => approval.status)

    expect(approvalStatuses).toEqual(
      expect.arrayContaining([
        "pending",
        "returned",
        "approved",
        "rejected",
        "invalidated",
      ])
    )
    expect(seed.calculations).toHaveLength(5)
    expect(new Set(seed.items.map((item) => item.orderLineId)).size).toBe(
      seed.items.length
    )

    const pendingApproval = seed.approvals.find(
      (approval) => approval.status === "pending"
    )!
    const pendingCalculation = seed.calculations.find(
      (calculation) => calculation.id === pendingApproval.calculationId
    )!
    const pendingRma = seed.rmas.find(
      (rma) => rma.id === pendingApproval.rmaId
    )!
    expect(pendingCalculation).toMatchObject({
      rmaId: pendingRma.id,
      rmaVersion: pendingRma.version,
      inspectionVersion: pendingRma.inspection.version,
      orderSnapshotVersion: 3,
    })

    const approvedRma = seed.rmas.find(
      (rma) => rma.approvalStatus === "approved"
    )!
    const approvedCalculation = seed.calculations.find(
      (calculation) => calculation.rmaId === approvedRma.id
    )!
    expect(approvedRma).toMatchObject({ refundStatus: "pending_execution" })
    expect(approvedCalculation).toMatchObject({
      rmaVersion: approvedRma.version,
      inspectionVersion: approvedRma.inspection.version,
      orderSnapshotVersion: 3,
    })

    const returnedRma = seed.rmas.find(
      (rma) => rma.approvalStatus === "returned"
    )!
    const returnedCalculation = seed.calculations.find(
      (calculation) => calculation.rmaId === returnedRma.id
    )!
    expect(returnedCalculation).toMatchObject({
      rmaVersion: returnedRma.version - 1,
      inspectionVersion: returnedRma.inspection.version,
      orderSnapshotVersion: 3,
    })

    expect(seed.rmas.find((rma) => rma.id === "RMA-2011")).toMatchObject({
      logistics: { status: "received" },
      inspection: { status: "in_progress" },
      approvalStatus: "not_ready",
      refundStatus: "not_started",
    })
  })
})
