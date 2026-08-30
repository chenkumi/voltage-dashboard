import type { Order } from "../commerce-data/types"
import type { ReturnItem, ReturnReason, Rma, ReturnSource } from "./types"

export type ReturnListRow = {
  rma: Rma
  order: Order | null
  items: readonly ReturnItem[]
  stage: ReturnStage
}

export type ReturnStage =
  | "draft"
  | "eligibility"
  | "logistics"
  | "inspection"
  | "approval"
  | "refund"
  | "complete"

export type ReturnListFilters = {
  query: string
  status: Rma["status"] | "all"
  source: ReturnSource | "all"
  reason: ReturnReason | "all"
  stage: ReturnStage | "all"
  approvalStatus: Rma["approvalStatus"] | "all"
  sort: "updated-desc" | "created-desc" | "sla-asc"
}

export const returnStageFor = (rma: Rma): ReturnStage => {
  if (rma.status === "draft") return "draft"
  if (["completed", "rejected", "cancelled"].includes(rma.status)) {
    return "complete"
  }
  if (!["authorized"].includes(rma.eligibility.status)) return "eligibility"
  if (rma.logistics.status !== "received") return "logistics"
  if (rma.inspection.status !== "completed") return "inspection"
  if (!["approved"].includes(rma.approvalStatus)) return "approval"
  return "refund"
}

export const createReturnListRows = (
  rmas: readonly Rma[],
  items: readonly ReturnItem[],
  orders: readonly Order[]
): ReturnListRow[] => {
  const ordersById = new Map(orders.map((order) => [order.id, order]))
  const itemsByRma = new Map<string, ReturnItem[]>()
  for (const item of items) {
    const current = itemsByRma.get(item.rmaId) ?? []
    current.push(item)
    itemsByRma.set(item.rmaId, current)
  }
  return rmas.map((rma) => ({
    rma,
    order: ordersById.get(rma.orderId) ?? null,
    items: itemsByRma.get(rma.id) ?? [],
    stage: returnStageFor(rma),
  }))
}

export const createReturnListModel = (
  rows: readonly ReturnListRow[],
  filters: ReturnListFilters,
  page: number,
  pageSize = 15
) => {
  const query = filters.query.trim().toLocaleLowerCase()
  const filtered = rows.filter(({ rma, stage }) => {
    return (
      (!query ||
        rma.id.toLocaleLowerCase().includes(query) ||
        rma.orderId.toLocaleLowerCase().includes(query)) &&
      (filters.status === "all" || rma.status === filters.status) &&
      (filters.source === "all" || rma.source === filters.source) &&
      (filters.reason === "all" || rma.reason === filters.reason) &&
      (filters.stage === "all" || stage === filters.stage) &&
      (filters.approvalStatus === "all" ||
        rma.approvalStatus === filters.approvalStatus)
    )
  })
  const sorted = [...filtered].sort((left, right) => {
    if (filters.sort === "created-desc") {
      return right.rma.createdAt.localeCompare(left.rma.createdAt)
    }
    if (filters.sort === "sla-asc") {
      return left.rma.slaDueAt.localeCompare(right.rma.slaDueAt)
    }
    return right.rma.updatedAt.localeCompare(left.rma.updatedAt)
  })
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))
  const currentPage = Math.min(Math.max(1, page), pageCount)
  return {
    items: sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    total: sorted.length,
    page: currentPage,
    pageCount,
  }
}
