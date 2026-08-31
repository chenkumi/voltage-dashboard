import type { CommerceDataSnapshot, OrderLine } from "../commerce-data/types"
import { calculateRefund } from "./refund-calculation"
import type {
  RefundApproval,
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
  inventoryDispositionStatus: "not_applicable",
  inventoryMovementId: null,
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
    authorizedAt: eligibility.status === "authorized" ? createdAt : null,
    returnDueAt:
      eligibility.status === "authorized" ? "2026-09-27T08:00:00.000Z" : null,
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

type RefundFixtureStatus = "pending" | "returned" | "approved"

const createRefundFixtureRma = (
  id: string,
  orderId: string,
  reason: Rma["reason"],
  createdAt: string,
  approvalStatus: RefundFixtureStatus
): Rma => {
  const returned = approvalStatus === "returned"
  const approved = approvalStatus === "approved"
  return {
    ...createSeedRma(id, orderId, reason, createdAt, {
      status: "authorized",
      policyVersion: "2026-08-rma-v1",
      systemResult: {
        decision: "eligible",
        matchedRules: ["within_30_days", "not_final_sale"],
        missingEvidence: [],
        shippingRefundEligible: [
          "defective",
          "damaged",
          "wrong_item",
          "missing_parts",
        ].includes(reason),
      },
      userDecision: "authorized",
      decisionReason: "Seeded return is eligible for workflow testing.",
      assessedAt: createdAt,
      version: 1,
    }),
    logistics: {
      status: "received",
      authorizedAt: createdAt,
      returnDueAt: "2026-09-27T08:00:00.000Z",
      receivedAt: createdAt,
      receivedPackageCount: 1,
      receiptResult: "complete",
      version: 2,
    },
    inspection: {
      status: "completed",
      version: 1,
      startedAt: createdAt,
      completedAt: createdAt,
    },
    approvalStatus,
    refundStatus: approved ? "pending_execution" : "not_started",
    version: returned ? 6 : 5,
    updatedAt: createdAt,
  }
}

const completedItemFromLine = (
  rmaId: string,
  line: OrderLine,
  inspectedAt: string
): ReturnItem => ({
  ...itemFromLine(rmaId, line),
  receivedQuantity: 1,
  acceptedQuantity: 1,
  condition: "opened",
  packaging: "intact",
  missingContents: false,
  inspectionResult: "accepted",
  inventoryDisposition: "restock",
  inventoryDispositionStatus: "pending",
  inspectionNote: "Seeded completed inspection.",
  inspectedBy: "seed-operator",
  inspectedAt,
  inspectionVersion: 1,
})

export const createReturnSeed = (
  commerce: CommerceDataSnapshot,
  orderSnapshotVersion = 1
): ReturnRepositorySnapshot => {
  const deliveredOrders = commerce.orders.filter(
    (order) => order.status === "delivered" && order.paymentStatus === "paid"
  )
  if (deliveredOrders.length < 5) {
    throw new Error("Return seed requires five delivered paid orders.")
  }
  const [firstOrder, secondOrder, ...refundOrders] = deliveredOrders
  const firstLine = commerce.orderLines.find(
    (line) => line.orderId === firstOrder.id
  )
  const secondLine = commerce.orderLines.find(
    (line) => line.orderId === secondOrder.id
  )
  if (!firstLine || !secondLine) {
    throw new Error("Return seed orders require order lines.")
  }

  const refundFixtures = refundOrders.slice(0, 3).map((order, index) => {
    const line = commerce.orderLines.find((item) => item.orderId === order.id)
    if (!line) throw new Error("Refund fixture order requires an order line.")
    const statuses: readonly RefundFixtureStatus[] = [
      "pending",
      "returned",
      "approved",
    ]
    const status = statuses[index]!
    const rmaId = `RMA-200${index + 6}`
    const createdAt = `2026-08-2${index + 5}T09:0${index}:00.000Z`
    const rma = createRefundFixtureRma(
      rmaId,
      order.id,
      index === 0 ? "defective" : "not_as_described",
      createdAt,
      status
    )
    const item = completedItemFromLine(rmaId, line, createdAt)
    const calculation = calculateRefund({
      calculationId: `CAL-200${index + 6}`,
      rmaId,
      orderId: order.id,
      reason: rma.reason,
      rmaVersion: 5,
      inspectionVersion: 1,
      orderSnapshotVersion,
      calculationVersion: 1,
      orderTotal: order.amounts.total,
      orderShipping: order.amounts.shipping,
      orderLines: commerce.orderLines.filter((item) => item.orderId === order.id),
      items: [
        {
          returnItemId: item.id,
          orderLineId: item.orderLineId,
          acceptedQuantity: 1,
        },
      ],
      successfulRefunds: [],
      createdAt,
    })
    const approval: RefundApproval = {
      id: `APR-200${index + 6}`,
      rmaId,
      calculationId: calculation.id,
      calculationVersion: calculation.version,
      status,
      decidedBy: status === "pending" ? null : "seed-approver",
      reason: status === "returned" ? "Additional evidence requested." : "",
      createdAt,
      decidedAt: status === "pending" ? null : createdAt,
      version: status === "pending" ? 1 : 2,
    }
    return { rma, item, calculation, approval }
  })

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
  const allRmas = [...rmas, ...refundFixtures.map((fixture) => fixture.rma)]
  const items = [
    itemFromLine(rmas[0].id, firstLine),
    itemFromLine(rmas[1].id, secondLine),
    ...refundFixtures.map((fixture) => fixture.item),
  ]
  const timeline = allRmas.flatMap((rma) => [
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
    operationalVersion: 1,
    orderSnapshotVersion,
    rmas: allRmas,
    items,
    calculations: refundFixtures.map((fixture) => fixture.calculation),
    approvals: refundFixtures.map((fixture) => fixture.approval),
    executionAttempts: [],
    timeline,
    notes: [],
  }
}
