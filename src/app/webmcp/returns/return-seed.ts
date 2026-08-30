import type { CommerceDataSnapshot, OrderLine } from "../commerce-data/types"
import type {
  ReturnItem,
  ReturnRepositorySnapshot,
  Rma,
} from "./types"

const itemFromLine = (
  rmaId: string,
  line: OrderLine,
  requestedQuantity = 1
): ReturnItem => ({
  id: `${rmaId}-I1`,
  rmaId,
  orderLineId: line.id,
  productId: line.productId,
  sku: line.sku,
  title: line.title,
  purchasedQuantity: line.quantity,
  previouslyRefundedQuantity: 0,
  requestedQuantity: Math.min(requestedQuantity, line.quantity),
  receivedQuantity: null,
  acceptedQuantity: null,
  paidAmount: structuredClone(line.paidAmount),
  paidUnitAmounts: structuredClone(line.paidUnitAmounts),
  condition: null,
  packaging: null,
  missingContents: null,
  inspectionResult: null,
  rejectionReason: null,
  inventoryDisposition: null,
  inspectionNote: "",
  inspectedBy: null,
  inspectedAt: null,
  inspectionVersion: 0,
})

const createSeedRma = (
  id: string,
  orderId: string,
  reason: Rma["reason"],
  createdAt: string,
  eligibility: Rma["eligibility"]
): Rma => ({
  id,
  orderId,
  source: "external",
  reason,
  customerStatement:
    reason === "changed_mind"
      ? "Customer reports the item is unopened and no longer needed."
      : "Return reason requires additional structured evidence.",
  assignee: null,
  slaDueAt: "2026-09-02T08:00:00.000Z",
  status: "active",
  eligibility,
  logistics: {
    status:
      eligibility.status === "authorized" ? "awaiting_return" : "not_started",
    authorizedAt:
      eligibility.status === "authorized" ? createdAt : null,
    returnDueAt:
      eligibility.status === "authorized"
        ? "2026-09-27T08:00:00.000Z"
        : null,
    receivedAt: null,
    receivedPackageCount: null,
    receiptResult: null,
    version: eligibility.status === "authorized" ? 1 : 0,
  },
  inspection: {
    status: "not_started",
    version: 0,
    startedAt: null,
    completedAt: null,
  },
  approvalStatus: "not_ready",
  refundStatus: "not_started",
  version: 1,
  createdAt,
  submittedAt: createdAt,
  completedAt: null,
  updatedAt: createdAt,
})

export const createReturnSeed = (
  commerce: CommerceDataSnapshot,
  orderSnapshotVersion = 1
): ReturnRepositorySnapshot => {
  const deliveredOrders = commerce.orders.filter(
    (order) => order.status === "delivered" && order.paymentStatus === "paid"
  )
  if (deliveredOrders.length < 2) {
    throw new Error("Return seed requires two delivered paid orders.")
  }
  const [firstOrder, secondOrder] = deliveredOrders
  const firstLine = commerce.orderLines.find(
    (line) => line.orderId === firstOrder.id
  )
  const secondLine = commerce.orderLines.find(
    (line) => line.orderId === secondOrder.id
  )
  if (!firstLine || !secondLine) {
    throw new Error("Return seed orders require order lines.")
  }

  const rmas = [
    createSeedRma(
      "RMA-2004",
      firstOrder.id,
      "changed_mind",
      "2026-08-28T07:05:00.000Z",
      {
        status: "authorized",
        policyVersion: "2026-08-rma-v1",
        systemResult: {
          decision: "eligible",
          matchedRules: ["within_30_days", "not_final_sale"],
          missingEvidence: [],
          shippingRefundEligible: false,
        },
        userDecision: "authorized",
        decisionReason: "Eligible unopened return within policy window.",
        assessedAt: "2026-08-28T07:05:00.000Z",
        version: 1,
      }
    ),
    createSeedRma(
      "RMA-2005",
      secondOrder.id,
      "not_as_described",
      "2026-08-28T08:10:00.000Z",
      {
        status: "needs_information",
        policyVersion: "2026-08-rma-v1",
        systemResult: {
          decision: "needs_information",
          matchedRules: ["policy_evidence_incomplete"],
          missingEvidence: [
            "package_opened",
            "item_condition",
            "final_sale_status",
          ],
          shippingRefundEligible: false,
        },
        userDecision: "needs_information",
        decisionReason: "Additional condition evidence is required.",
        assessedAt: "2026-08-28T08:10:00.000Z",
        version: 1,
      }
    ),
  ]
  const items = [
    itemFromLine(rmas[0].id, firstLine),
    itemFromLine(rmas[1].id, secondLine),
  ]
  const timeline = rmas.flatMap((rma) => [
    {
      id: `${rma.id}-T1`,
      rmaId: rma.id,
      actor: "system" as const,
      action: "external_return_imported",
      entityId: rma.id,
      occurredAt: rma.createdAt,
      result: "active",
      version: 1,
    },
  ])

  return {
    version: 1,
    orderSnapshotVersion,
    rmas,
    items,
    calculations: [],
    approvals: [],
    executionAttempts: [],
    timeline,
  }
}
