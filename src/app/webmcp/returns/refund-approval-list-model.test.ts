import { describe, expect, it } from "vitest"
import type { ProductCurrency } from "../products/types"
import {
  createRefundApprovalListModel,
  type RefundApprovalListRow,
} from "./refund-approval-list-model"

const row = (
  id: string,
  status: RefundApprovalListRow["approval"]["status"],
  refundStatus: RefundApprovalListRow["rma"]["refundStatus"],
  amount: number,
  currency: ProductCurrency,
  createdAt: string
): RefundApprovalListRow => ({
  approval: {
    id,
    rmaId: `RMA-${id}`,
    calculationId: `CAL-${id}`,
    calculationVersion: 1,
    status,
    decidedBy: null,
    reason: "",
    createdAt,
    decidedAt: null,
    version: 1,
  },
  calculation: {
    id: `CAL-${id}`,
    rmaId: `RMA-${id}`,
    orderId: `VM-${id}`,
    rmaVersion: 1,
    inspectionVersion: 1,
    orderSnapshotVersion: 1,
    version: 1,
    items: [],
    shippingAmount: { amount: 0, currency },
    total: { amount, currency },
    createdAt,
  },
  rma: {
    id: `RMA-${id}`,
    orderId: `VM-${id}`,
    source: "internal",
    reason: "defective",
    customerStatement: "Safe statement.",
    assignee: null,
    slaDueAt: createdAt,
    status: "active",
    eligibility: {
      status: "authorized",
      policyVersion: "v1",
      systemResult: null,
      userDecision: "authorized",
      decisionReason: "Eligible",
      assessedAt: createdAt,
      version: 1,
    },
    logistics: {
      status: "received",
      authorizedAt: createdAt,
      returnDueAt: createdAt,
      receivedAt: createdAt,
      receivedPackageCount: 1,
      receiptResult: "complete",
      version: 1,
    },
    inspection: {
      status: "completed",
      version: 1,
      startedAt: createdAt,
      completedAt: createdAt,
    },
    approvalStatus: status,
    refundStatus,
    version: 1,
    createdAt,
    submittedAt: createdAt,
    completedAt: null,
    updatedAt: createdAt,
  },
})

describe("refund approval list model", () => {
  const rows = [
    row("A", "pending", "not_started", 100, "TWD", "2026-08-31T02:00:00.000Z"),
    row("B", "approved", "failed", 25, "USD", "2026-08-30T02:00:00.000Z"),
    row("C", "returned", "not_started", 400, "TWD", "2026-08-29T02:00:00.000Z"),
  ]

  it("searches safe identifiers and filters status, refund state, and currency", () => {
    expect(
      createRefundApprovalListModel(
        rows,
        {
          query: "VM-B",
          status: "approved",
          refundStatus: "failed",
          currency: "USD",
          waiting: "24-48h",
          sort: "newest",
        },
        1,
        15,
        "2026-08-31T08:00:00.000Z"
      ).items.map(({ approval }) => approval.id)
    ).toEqual(["B"])
  })

  it("sorts amounts and clamps pagination", () => {
    const model = createRefundApprovalListModel(
      rows,
      {
        query: "",
        status: "all",
        refundStatus: "all",
        currency: "all",
        waiting: "all",
        sort: "amount-desc",
      },
      99,
      2
    )
    expect(model.page).toBe(2)
    expect(model.items.map(({ approval }) => approval.id)).toEqual(["B"])
  })

  it("filters the queue by elapsed approval waiting time", () => {
    const model = createRefundApprovalListModel(
      rows,
      {
        query: "",
        status: "all",
        refundStatus: "all",
        currency: "all",
        waiting: "over-48h",
        sort: "newest",
      },
      1,
      15,
      "2026-09-01T08:00:00.000Z"
    )
    expect(model.items.map(({ approval }) => approval.id)).toEqual(["B", "C"])
  })
})
