/* eslint-disable react-refresh/only-export-components */
import type {
  RefundApproval,
  RefundCalculation,
  ReturnItem,
  ReturnReviewStage,
  Rma,
} from "./types"
import { useTranslation } from "react-i18next"
import { RETURN_REVIEW_STAGES } from "./types"

export type ReturnWorkflowStageState =
  | "completed"
  | "current"
  | "attention"
  | "upcoming"
  | "terminal"
  | "not_applicable"

export type ReturnWorkflowDetail =
  | "calculation_invalidated"
  | "approval_invalidated"

export type ReturnWorkflowStage = {
  id: ReturnReviewStage
  number: number
  state: ReturnWorkflowStageState
  detail: ReturnWorkflowDetail | null
}

export type ReturnWorkflowInput = {
  rma: Rma
  items?: readonly ReturnItem[]
  calculations?: readonly RefundCalculation[]
  approvals?: readonly RefundApproval[]
}

const stagesWith = (
  states: readonly ReturnWorkflowStageState[]
): ReturnWorkflowStage[] =>
  RETURN_REVIEW_STAGES.map((id, index) => ({
    id,
    number: index + 1,
    state: states[index] ?? "upcoming",
    detail: null,
  }))

const stoppedAt = (
  index: number,
  state: "attention" | "terminal"
): ReturnWorkflowStage[] =>
  stagesWith(
    RETURN_REVIEW_STAGES.map((_, candidate) =>
      candidate < index
        ? "completed"
        : candidate === index
          ? state
          : "not_applicable"
    )
  )

export const createReturnWorkflow = ({
  rma,
  items = [],
  calculations = [],
  approvals = [],
}: ReturnWorkflowInput): ReturnWorkflowStage[] => {
  if (rma.status === "cancelled") return stoppedAt(0, "terminal")
  if (rma.status === "draft")
    return stagesWith(["current", ...Array(6).fill("upcoming")])

  if (rma.eligibility.status === "pending")
    return stagesWith(["completed", "current"])
  if (rma.eligibility.status === "needs_information")
    return stagesWith(["completed", "attention"])
  if (rma.eligibility.status === "rejected") return stoppedAt(1, "terminal")

  if (["not_started", "awaiting_return"].includes(rma.logistics.status))
    return stagesWith(["completed", "completed", "current"])
  if (rma.logistics.status === "expired") return stoppedAt(2, "terminal")

  if (
    rma.inspection.status === "not_started" ||
    rma.inspection.status === "in_progress"
  ) {
    const workflow = stagesWith([
      "completed",
      "completed",
      "completed",
      "current",
    ])
    if (calculations.some((calculation) => calculation.rmaId === rma.id)) {
      workflow[4] = {
        ...workflow[4],
        state: "attention",
        detail: "calculation_invalidated",
      }
    }
    if (
      rma.approvalStatus === "invalidated" &&
      approvals.some((approval) => approval.rmaId === rma.id)
    ) {
      workflow[5] = {
        ...workflow[5],
        state: "attention",
        detail: "approval_invalidated",
      }
    }
    return workflow
  }

  const acceptedQuantity = items.reduce(
    (total, item) => total + (item.acceptedQuantity ?? 0),
    0
  )
  if (items.length > 0 && acceptedQuantity === 0) return stoppedAt(3, "terminal")

  const currentCalculation = calculations
    .filter(
      (calculation) =>
        calculation.rmaId === rma.id &&
        calculation.rmaVersion === rma.version &&
        calculation.inspectionVersion === rma.inspection.version
    )
    .sort((left, right) => right.version - left.version)[0]
  const currentApproval = currentCalculation
    ? approvals
        .filter(
          (approval) =>
            approval.rmaId === rma.id &&
            approval.calculationId === currentCalculation.id &&
            approval.calculationVersion === currentCalculation.version &&
            approval.status !== "invalidated"
        )
        .sort(
          (left, right) =>
            right.createdAt.localeCompare(left.createdAt) ||
            right.version - left.version
        )[0]
    : undefined

  if (["not_ready", "returned", "invalidated"].includes(rma.approvalStatus)) {
    const workflow = stagesWith([
      "completed",
      "completed",
      "completed",
      "completed",
      "current",
      "upcoming",
      "upcoming",
    ])
    if (rma.approvalStatus === "returned") workflow[5].state = "attention"
    return workflow
  }
  if (rma.approvalStatus === "pending")
    return stagesWith([
      "completed",
      "completed",
      "completed",
      "completed",
      "completed",
      "current",
      "upcoming",
    ])
  if (rma.approvalStatus === "rejected") return stoppedAt(5, "terminal")

  if (rma.approvalStatus === "approved" || currentApproval?.status === "approved") {
    if (rma.refundStatus === "succeeded" || rma.status === "completed")
      return stagesWith(Array(7).fill("completed"))
    return stagesWith([
      "completed",
      "completed",
      "completed",
      "completed",
      "completed",
      "completed",
      rma.refundStatus === "failed" ? "attention" : "current",
    ])
  }

  return stagesWith([
    "completed",
    "completed",
    "completed",
    "completed",
    "current",
  ])
}

export const currentReturnWorkflowStage = (
  workflow: readonly ReturnWorkflowStage[]
) =>
  workflow.find((stage) =>
    ["current", "attention", "terminal"].includes(stage.state)
  ) ?? workflow.at(-1)!

export const ReturnWorkflowProgress = ({
  workflow,
  labelFor = (stage) => stage,
}: {
  workflow: readonly ReturnWorkflowStage[]
  labelFor?: (label: ReturnReviewStage | ReturnWorkflowDetail) => string
}) => {
  const { t } = useTranslation()
  const active = currentReturnWorkflowStage(workflow)
  const tone: Record<ReturnWorkflowStageState, string> = {
    completed: "border-emerald-300 bg-emerald-50 text-emerald-900",
    current: "border-primary bg-primary/10 text-primary",
    attention: "border-amber-300 bg-amber-50 text-amber-950",
    upcoming: "border-border bg-muted/30 text-muted-foreground",
    terminal: "border-destructive/40 bg-destructive/10 text-destructive",
    not_applicable: "border-dashed border-border text-muted-foreground",
  }
  return (
    <ol className="grid gap-2 sm:grid-cols-4 xl:grid-cols-7">
      {workflow.map((stage) => (
      <li
        key={stage.id}
        data-stage={stage.id}
        data-state={stage.state}
        aria-current={active.id === stage.id ? "step" : undefined}
        className={`rounded-md border p-2 text-sm ${tone[stage.state]}`}
      >
        <span className="block text-xs">
          {stage.state === "completed"
            ? "✓"
            : active.id === stage.id
              ? "●"
              : stage.number}{" "}
          {active.id === stage.id ? t("Current") : t(stage.state)}
        </span>
        <strong>{labelFor(stage.id)}</strong>
        {stage.detail ? (
          <small className="block text-xs text-muted-foreground">
            {labelFor(stage.detail)}
          </small>
        ) : null}
        {stage.state === "upcoming" ? (
          <small className="block text-xs">
            {t("Complete prior stages to unlock.")}
          </small>
        ) : null}
      </li>
      ))}
    </ol>
  )
}
