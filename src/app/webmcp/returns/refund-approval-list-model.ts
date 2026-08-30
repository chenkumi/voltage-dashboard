import type {
  ApprovalStatus,
  RefundApproval,
  RefundCalculation,
  RefundStatus,
  Rma,
} from "./types"

export type RefundApprovalListRow = {
  approval: RefundApproval
  calculation: RefundCalculation
  rma: Rma
}

export type RefundApprovalListFilters = {
  query: string
  status: ApprovalStatus | "all"
  refundStatus: RefundStatus | "all"
  currency: string | "all"
  waiting: "all" | "under-24h" | "24-48h" | "over-48h"
  sort: "newest" | "oldest" | "amount-desc" | "amount-asc"
}

export const approvalWaitingHours = (approval: RefundApproval, now: string) =>
  Math.max(
    0,
    (Date.parse(approval.decidedAt ?? now) - Date.parse(approval.createdAt)) /
      3_600_000
  )

export const createRefundApprovalRows = (
  approvals: readonly RefundApproval[],
  rmas: readonly Rma[],
  calculations: readonly RefundCalculation[]
) => {
  const rmaById = new Map(rmas.map((rma) => [rma.id, rma]))
  const calculationById = new Map(
    calculations.map((calculation) => [calculation.id, calculation])
  )
  return approvals.flatMap((approval): RefundApprovalListRow[] => {
    const rma = rmaById.get(approval.rmaId)
    const calculation = calculationById.get(approval.calculationId)
    return rma && calculation ? [{ approval, rma, calculation }] : []
  })
}

export const createRefundApprovalListModel = (
  rows: readonly RefundApprovalListRow[],
  filters: RefundApprovalListFilters,
  requestedPage: number,
  pageSize: number,
  now = new Date().toISOString()
) => {
  const query = filters.query.trim().toLocaleLowerCase()
  const filtered = rows.filter(({ approval, calculation, rma }) => {
    const matchesQuery =
      !query ||
      [approval.id, rma.id, rma.orderId].some((value) =>
        value.toLocaleLowerCase().includes(query)
      )
    return (
      matchesQuery &&
      (filters.status === "all" || approval.status === filters.status) &&
      (filters.refundStatus === "all" ||
        rma.refundStatus === filters.refundStatus) &&
      (filters.currency === "all" ||
        calculation.total.currency === filters.currency) &&
      (filters.waiting === "all" ||
        (filters.waiting === "under-24h" &&
          approvalWaitingHours(approval, now) < 24) ||
        (filters.waiting === "24-48h" &&
          approvalWaitingHours(approval, now) >= 24 &&
          approvalWaitingHours(approval, now) < 48) ||
        (filters.waiting === "over-48h" &&
          approvalWaitingHours(approval, now) >= 48))
    )
  })
  const sorted = [...filtered].sort((left, right) => {
    if (filters.sort === "oldest")
      return left.approval.createdAt.localeCompare(right.approval.createdAt)
    if (filters.sort === "amount-desc")
      return right.calculation.total.amount - left.calculation.total.amount
    if (filters.sort === "amount-asc")
      return left.calculation.total.amount - right.calculation.total.amount
    return right.approval.createdAt.localeCompare(left.approval.createdAt)
  })
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))
  const page = Math.min(Math.max(1, requestedPage), pageCount)
  return {
    items: sorted.slice((page - 1) * pageSize, page * pageSize),
    page,
    pageCount,
    total: sorted.length,
  }
}
