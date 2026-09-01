// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { createCommerceSeed } from "../commerce-data/commerce-seed"
import { createReturnSeed } from "./return-seed"
import {
  createReturnWorkflow,
  currentReturnWorkflowStage,
  ReturnWorkflowProgress,
} from "./return-workflow"
import type { ReturnItem, Rma } from "./types"
import { RETURN_REVIEW_STAGES } from "./types"

const fixture = () => {
  const snapshot = createReturnSeed(createCommerceSeed(), 3)
  const rma = (id: string) =>
    structuredClone(snapshot.rmas.find((item) => item.id === id)!)
  return { snapshot, rma }
}

const stageState = (rma: Rma, items: readonly ReturnItem[] = []) => {
  const { snapshot } = fixture()
  return createReturnWorkflow({
    rma,
    items,
    calculations: snapshot.calculations,
    approvals: snapshot.approvals,
  })
}

describe("shared return workflow", () => {
  it("uses the same seven stages for RMA and refund approval contexts", () => {
    const { snapshot, rma } = fixture()
    const approvalRma = rma("RMA-2006")
    const workflow = createReturnWorkflow({
      rma: approvalRma,
      items: snapshot.items.filter((item) => item.rmaId === approvalRma.id),
      calculations: snapshot.calculations,
      approvals: snapshot.approvals,
    })

    expect(workflow.map((stage) => stage.id)).toEqual(RETURN_REVIEW_STAGES)
    expect(currentReturnWorkflowStage(workflow)).toMatchObject({
      id: "refund_approval",
      state: "current",
    })

    render(
      <ReturnWorkflowProgress
        workflow={workflow}
        labelFor={(stage) => `stage:${stage}`}
      />
    )
    expect(screen.getAllByRole("listitem")).toHaveLength(7)
    expect(
      screen
        .getByText("stage:refund_approval")
        .closest("li")
        ?.getAttribute("aria-current")
    ).toBe("step")
  })

  it("projects normal, returned, retry, and successful paths", () => {
    const { snapshot, rma } = fixture()
    const returned = rma("RMA-2007")
    const returnedWorkflow = createReturnWorkflow({
      rma: returned,
      items: snapshot.items.filter((item) => item.rmaId === returned.id),
      calculations: snapshot.calculations,
      approvals: snapshot.approvals,
    })
    expect(currentReturnWorkflowStage(returnedWorkflow).id).toBe(
      "refund_calculation"
    )
    expect(returnedWorkflow[5].state).toBe("attention")

    const approved = rma("RMA-2008")
    const failed = {
      ...approved,
      refundStatus: "failed" as const,
    }
    expect(currentReturnWorkflowStage(stageState(failed)).id).toBe(
      "refund_execution"
    )
    expect(currentReturnWorkflowStage(stageState(failed)).state).toBe(
      "attention"
    )

    const completed = {
      ...approved,
      status: "completed" as const,
      refundStatus: "succeeded" as const,
    }
    expect(
      stageState(completed).every((stage) => stage.state === "completed")
    ).toBe(true)
  })

  it("projects supplementation, expiry, rejection, and no-refund terminals", () => {
    const { snapshot, rma } = fixture()
    const draft = rma("RMA-2004")
    draft.status = "draft"
    expect(currentReturnWorkflowStage(stageState(draft))).toMatchObject({
      id: "return_request",
      state: "current",
    })

    const needsInformation = rma("RMA-2005")
    expect(
      currentReturnWorkflowStage(stageState(needsInformation))
    ).toMatchObject({
      id: "eligibility",
      state: "attention",
    })

    const expired = rma("RMA-2004")
    expired.logistics = { ...expired.logistics, status: "expired" }
    expect(currentReturnWorkflowStage(stageState(expired))).toMatchObject({
      id: "receipt",
      state: "terminal",
    })

    const eligibilityRejected = rma("RMA-2005")
    eligibilityRejected.status = "rejected"
    eligibilityRejected.eligibility = {
      ...eligibilityRejected.eligibility,
      status: "rejected",
    }
    expect(
      currentReturnWorkflowStage(stageState(eligibilityRejected))
    ).toMatchObject({ id: "eligibility", state: "terminal" })

    const approvalRejected = rma("RMA-2006")
    approvalRejected.status = "rejected"
    approvalRejected.approvalStatus = "rejected"
    expect(
      currentReturnWorkflowStage(stageState(approvalRejected))
    ).toMatchObject({
      id: "refund_approval",
      state: "terminal",
    })

    const inspected = rma("RMA-2008")
    inspected.status = "completed"
    inspected.approvalStatus = "not_ready"
    inspected.refundStatus = "not_started"
    const rejectedItems = snapshot.items
      .filter((item) => item.rmaId === inspected.id)
      .map((item) => ({
        ...item,
        acceptedQuantity: 0,
        inspectionResult: "rejected" as const,
      }))
    expect(
      currentReturnWorkflowStage(stageState(inspected, rejectedItems))
    ).toMatchObject({ id: "inspection", state: "terminal" })
  })

  it("returns to inspection after reopening and marks future stages upcoming", () => {
    const { rma } = fixture()
    const reopened = rma("RMA-2008")
    reopened.inspection = {
      ...reopened.inspection,
      status: "in_progress",
      completedAt: null,
      version: reopened.inspection.version + 1,
    }
    reopened.approvalStatus = "invalidated"
    reopened.refundStatus = "not_started"
    const workflow = stageState(reopened)

    expect(currentReturnWorkflowStage(workflow)).toMatchObject({
      id: "inspection",
      state: "current",
    })
    expect(workflow[4]).toMatchObject({
      state: "attention",
      detail: "calculation_invalidated",
    })
    expect(workflow[5]).toMatchObject({
      state: "attention",
      detail: "approval_invalidated",
    })
    expect(workflow[6].state).toBe("upcoming")
  })
})
