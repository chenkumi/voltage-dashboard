import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createCompletionVerifierMap } from "../completion-policy"
import { createCommerceSeed } from "../commerce-data/commerce-seed"
import {
  ReturnEditorController,
  createReturnFormEditorState,
} from "./return-editor-controller"
import {
  ReturnRepository,
  type ReturnReviewNoteSession,
} from "./return-repository"
import {
  executeReturnTool,
  REFUND_APPROVAL_DETAIL_TOOLS,
  RETURN_DETAIL_TOOLS,
  RETURN_FORM_TOOLS,
  RETURN_GLOBAL_TOOLS,
  RETURN_NOTE_TOOLS,
  RETURN_TOOLS,
} from "./return-tools"

describe("return WebMCP tools", () => {
  const commerce = createCommerceSeed()
  let repository: ReturnRepository
  let editor: ReturnEditorController
  let reviewNotes: ReturnReviewNoteSession
  let routePath: string

  beforeEach(async () => {
    repository = new ReturnRepository({
      databaseName: `return-tools-${crypto.randomUUID()}`,
      commerceSnapshot: commerce,
    })
    editor = new ReturnEditorController()
    await repository.initialize()
    reviewNotes = repository.reviewNotesForUser("guest")
    routePath = "/returns/RMA-2006"
  })

  afterEach(async () => {
    await repository.deleteDatabaseForTests()
  })

  const execute = (name: string, args: Record<string, unknown>) =>
    executeReturnTool({
      name,
      args,
      repository,
      commerce,
      editor,
      reviewNotes,
      routePath,
      navigate: () => undefined,
    })

  it("exposes only safe query, navigation, and reversible draft tools", () => {
    const names = RETURN_TOOLS.map(({ name }) => name)
    expect(names).toEqual(
      expect.arrayContaining([
        "search_returns",
        "get_return_detail",
        "open_return_create",
        "open_return_detail",
        "list_refund_approvals",
        "open_refund_approval",
        "apply_return_form_draft",
        "get_return_form_state",
        "check_return_eligibility",
        "apply_my_return_note_draft",
        "get_my_return_note_draft",
        "get_refund_calculation",
        "get_refund_approval",
      ])
    )
    expect(names.join(" ")).not.toMatch(
      /submit_return|receive_return|complete_inspection|approve|reject|execute_refund|record_refund|complete_rma/
    )
    expect(names).not.toEqual(
      expect.arrayContaining([
        "list_ops_cases",
        "get_ops_case",
        "save_case_draft",
        "open_case_review",
        "list_pending_reviews",
        "get_workflow_state",
      ])
    )
    expect(RETURN_GLOBAL_TOOLS).toHaveLength(6)
    expect(RETURN_FORM_TOOLS).toHaveLength(2)
    expect(names).not.toContain("apply_return_review_draft")
    expect(names).not.toContain("get_return_review_state")
    expect(RETURN_DETAIL_TOOLS).toHaveLength(2)
    expect(RETURN_NOTE_TOOLS).toHaveLength(2)
    expect(REFUND_APPROVAL_DETAIL_TOOLS).toHaveLength(1)
  })

  it("declares completion verifiers for both reversible draft mutations", () => {
    expect(createCompletionVerifierMap(RETURN_TOOLS)).toMatchObject({
      apply_return_form_draft: "get_return_form_state",
      apply_my_return_note_draft: "get_my_return_note_draft",
    })
  })

  it("projects RMA and approval data without private text or actor identity", async () => {
    const snapshot = await repository.getSnapshot()
    const rma = snapshot.rmas.find(
      (item) => item.eligibility.status === "authorized"
    )!
    const detail = await execute("get_return_detail", { rmaId: rma.id })
    const serialized = JSON.stringify(detail)
    expect(serialized).toContain(rma.id)
    expect(serialized).not.toContain(rma.customerStatement)
    expect(serialized).not.toMatch(/decisionReason|assignee|inspectedBy/)

    await repository.recordReceipt(
      rma.id,
      { packageCount: 1, result: "complete" },
      "user"
    )
    await repository.startInspection(rma.id, "user")
    const returnItem = snapshot.items.find((item) => item.rmaId === rma.id)!
    await repository.completeInspection(
      rma.id,
      [
        {
          returnItemId: returnItem.id,
          receivedQuantity: returnItem.requestedQuantity,
          acceptedQuantity: returnItem.requestedQuantity,
          condition: "sealed",
          packaging: "intact",
          missingContents: false,
          rejectionReason: null,
          inventoryDisposition: "restock",
          inspectionNote: "Item received verified.",
          inspectedBy: "ops-user",
        },
      ],
      "user"
    )
    const calculation = await repository.generateRefundCalculation(
      rma.id,
      "user"
    )
    const approval = await repository.submitForApproval(
      rma.id,
      calculation.id,
      "user"
    )
    const approvalResult = await execute("get_refund_approval", {
      approvalId: approval.id,
    })
    const approvalText = JSON.stringify(approvalResult)
    expect(approvalText).toContain(approval.id)
    expect(approvalText).not.toMatch(/decidedBy|decisionReason/)
    expect(approvalResult).toMatchObject({
      approval: expect.not.objectContaining({ reason: expect.anything() }),
    })

    expect(approvalResult).not.toHaveProperty("agentSafeSummary")
  })

  it("returns a direct rmaId handoff from search to detail and navigation", async () => {
    let navigatedTo = ""
    const executeWithNavigation = (
      name: string,
      args: Record<string, unknown>
    ) =>
      executeReturnTool({
        name,
        args,
        repository,
        commerce,
        editor,
        reviewNotes,
        routePath,
        navigate: (path) => {
          navigatedTo = path
        },
      })
    const search = (await execute("search_returns", {
      status: "active",
    })) as {
      items: Array<{ id: string; rmaId: string }>
    }
    const result = search.items[0]

    expect(result).toMatchObject({ rmaId: result.id })
    expect(
      await execute("get_return_detail", { rmaId: result.rmaId })
    ).toMatchObject({
      status: "OK",
      rma: { id: result.rmaId },
    })
    expect(
      await executeWithNavigation("open_return_detail", { rmaId: result.rmaId })
    ).toMatchObject({ status: "OK", rmaId: result.rmaId })
    expect(navigatedTo).toBe(`/returns/${result.rmaId}`)
  })

  it("reads seeded calculations and each approval queue state without private fields", async () => {
    const before = await repository.getSnapshot()
    const snapshot = await repository.getSnapshot()
    const pending = snapshot.approvals.find(
      (approval) => approval.status === "pending"
    )!
    const returned = snapshot.approvals.find(
      (approval) => approval.status === "returned"
    )!
    const approved = snapshot.approvals.find(
      (approval) => approval.status === "approved"
    )!

    expect(
      await execute("get_refund_calculation", { rmaId: pending.rmaId })
    ).toMatchObject({
      status: "OK",
      rmaId: pending.rmaId,
      valid: true,
      calculation: { id: pending.calculationId },
    })
    expect(
      await execute("list_refund_approvals", { status: "pending" })
    ).toMatchObject({
      status: "OK",
      items: [
        expect.objectContaining({ id: pending.id, rmaId: pending.rmaId }),
      ],
    })
    expect(
      await execute("list_refund_approvals", { status: "returned" })
    ).toMatchObject({
      status: "OK",
      items: [
        expect.objectContaining({ id: returned.id, rmaId: returned.rmaId }),
      ],
    })
    expect(
      await execute("list_refund_approvals", {
        status: "approved",
        refundStatus: "pending_execution",
      })
    ).toMatchObject({
      status: "OK",
      items: [
        expect.objectContaining({ id: approved.id, rmaId: approved.rmaId }),
      ],
    })
    const detail = await execute("get_refund_approval", {
      approvalId: approved.id,
    })
    expect(detail).toMatchObject({
      status: "OK",
      approval: { id: approved.id, status: "approved" },
      rma: { refundStatus: "pending_execution" },
    })
    expect(JSON.stringify(detail)).not.toMatch(
      /"decidedBy"|"decisionReason"|"inspectedBy"/
    )
    expect(await repository.getSnapshot()).toEqual(before)
  })

  it("fills the open return form, verifies it, and rejects stale versions", async () => {
    const order = commerce.orders.find(
      (item) => item.status === "delivered" && item.paymentStatus === "paid"
    )!
    const line = commerce.orderLines.find((item) => item.orderId === order.id)!
    let state = createReturnFormEditorState({
      orderId: order.id,
      source: "internal",
      reason: "defective",
      customerStatement: "",
      items: [],
    })
    editor.attachForm(state, (next) => {
      state = next
    })

    const result = await execute("apply_return_form_draft", {
      orderId: order.id,
      editorVersion: state.version,
      customerStatement: "Product stopped working after delivery.",
      items: [{ orderLineId: line.id, requestedQuantity: 1 }],
    })
    expect(result).toMatchObject({
      status: "OK",
      valid: true,
      dirty: true,
      version: 2,
      selectedItems: [{ orderLineId: line.id, requestedQuantity: 1 }],
    })
    expect(await execute("get_return_form_state", {})).toMatchObject({
      status: "OK",
      version: 2,
      availableItems: [
        {
          orderLineId: line.id,
          sku: line.sku,
          availableQuantity: expect.any(Number),
        },
      ],
    })
    expect(
      await execute("apply_return_form_draft", {
        orderId: order.id,
        editorVersion: 1,
        reason: "damaged",
      })
    ).toMatchObject({
      status: "ARGUMENT_ERROR",
      message: expect.stringMatching(/stale/),
    })
  })

  it("binds note drafts to the signed-in user, current route stage, and expected version", async () => {
    const snapshot = await repository.getSnapshot()
    const approval = snapshot.approvals.find(
      (item) => item.status === "pending"
    )!
    routePath = `/refund-approvals/${approval.id}`
    expect(await execute("get_my_return_note_draft", {})).toMatchObject({
      status: "NOT_FOUND",
      rmaId: approval.rmaId,
      stage: "refund_approval",
    })
    const result = await execute("apply_my_return_note_draft", {
      rmaId: approval.rmaId,
      stage: "refund_approval",
      expectedVersion: 0,
      category: "review_recommendation",
      recommendation: "approve",
      evidenceCodes: ["INSPECTION_ACCEPTED"],
      content: "Inspection quantities match the fixed refund calculation.",
    })
    expect(result).toMatchObject({
      status: "OK",
      draftVersion: 1,
      saved: true,
      published: false,
    })
    expect(await execute("get_my_return_note_draft", {})).toMatchObject({
      status: "OK",
      draft: {
        category: "review_recommendation",
        recommendation: "approve",
        version: 1,
      },
      permissions: {
        canPublishInWebMcp: false,
        canDiscardInWebMcp: false,
      },
    })
    expect(
      await execute("apply_my_return_note_draft", {
        rmaId: approval.rmaId,
        stage: "refund_approval",
        expectedVersion: 0,
        category: "review_recommendation",
        recommendation: "approve",
        evidenceCodes: [],
        content: "A stale edit must not overwrite the saved draft.",
      })
    ).toMatchObject({
      status: "VERSION_CONFLICT",
      nextStep: expect.stringMatching(/get_my_return_note_draft/),
    })
    expect(
      await execute("apply_my_return_note_draft", {
        rmaId: approval.rmaId,
        stage: "eligibility",
        expectedVersion: 0,
        category: "internal_note",
        recommendation: null,
        evidenceCodes: [],
        content: "A different stage must not be writable from this page.",
      })
    ).toMatchObject({ status: "RE_DISCOVER_REQUIRED" })
    expect(await reviewNotes.getDraft(approval.rmaId, "eligibility")).toBeNull()
    routePath = "/returns/RMA-2007"
    expect(
      await execute("apply_my_return_note_draft", {
        rmaId: approval.rmaId,
        stage: "refund_approval",
        expectedVersion: 1,
        category: "internal_note",
        recommendation: null,
        evidenceCodes: [],
        content: "This route no longer matches the draft.",
      })
    ).toMatchObject({ status: "RE_DISCOVER_REQUIRED" })
    const otherUser = repository.reviewNotesForUser("operator-2")
    expect(
      await otherUser.getDraft(approval.rmaId, "refund_approval")
    ).toBeNull()
  })

  it("marks RMA-2005 eligibility as a non-persisted simulation", async () => {
    const before = await repository.getSnapshot()
    const beforeRma = before.rmas.find((item) => item.id === "RMA-2005")!
    const beforeDetail = await execute("get_return_detail", {
      rmaId: beforeRma.id,
    })

    const simulation = (await execute("check_return_eligibility", {
      rmaId: beforeRma.id,
      rmaVersion: beforeRma.version,
      facts: {
        daysSinceDelivery: 5,
        packageOpened: false,
        condition: "unused",
        finalSale: false,
      },
    })) as {
      eligibility: { matchedRules: string[] }
    }

    expect(simulation).toMatchObject({
      status: "OK",
      scope: "SIMULATION",
      persisted: false,
      uiStateChanged: false,
      rmaId: "RMA-2005",
      rmaVersion: beforeRma.version,
      nextStep: expect.stringMatching(/user.*UI/i),
    })

    const after = await repository.getSnapshot()
    const afterRma = after.rmas.find((item) => item.id === "RMA-2005")!
    const afterDetail = await execute("get_return_detail", {
      rmaId: beforeRma.id,
    })
    expect(afterRma).toEqual(beforeRma)
    expect(after.version).toBe(before.version)
    expect(afterDetail).toEqual(beforeDetail)
    expect(
      editor.getPolicyResult(
        beforeRma.id,
        beforeRma.version,
        beforeRma.eligibility.policyVersion
      )
    ).toEqual(simulation.eligibility)

    await expect(
      execute("check_return_eligibility", {
        rmaId: beforeRma.id,
        rmaVersion: beforeRma.version + 1,
        facts: {
          daysSinceDelivery: 5,
          packageOpened: false,
          condition: "unused",
          finalSale: false,
        },
      })
    ).resolves.toMatchObject({
      status: "ARGUMENT_ERROR",
      message: expect.stringMatching(/stale/),
    })
  })

  it("rejects extra fields and sensitive or invalid content", async () => {
    expect(
      await execute("search_returns", { query: "RMA", email: "x@example.com" })
    ).toMatchObject({
      status: "ARGUMENT_ERROR",
    })
    const order = commerce.orders.find(
      (item) => item.status === "delivered" && item.paymentStatus === "paid"
    )!
    let state = createReturnFormEditorState({
      orderId: order.id,
      source: "internal",
      reason: "defective",
      customerStatement: "",
      items: [],
    })
    editor.attachForm(state, (next) => {
      state = next
    })
    expect(
      await execute("apply_return_form_draft", {
        orderId: order.id,
        editorVersion: state.version,
        customerStatement: "email x@example.com",
      })
    ).toMatchObject({ status: "ARGUMENT_ERROR" })
    expect(
      await execute(
        "get_return_form_state",
        [] as unknown as Record<string, unknown>
      )
    ).toMatchObject({ status: "ARGUMENT_ERROR" })
    const target = (await execute("get_my_return_note_draft", {})) as {
      rmaId: string
      stage: string
    }
    expect(
      await execute("apply_my_return_note_draft", {
        rmaId: target.rmaId,
        stage: target.stage,
        expectedVersion: 0,
        category: "internal_note",
        recommendation: null,
        evidenceCodes: [],
        content: "Contact x@example.com before reviewing this note.",
      })
    ).toMatchObject({ status: "ARGUMENT_ERROR" })
    expect(
      await execute("apply_my_return_note_draft", {
        rmaId: target.rmaId,
        stage: target.stage,
        expectedVersion: 0,
        category: "internal_note",
        recommendation: null,
        evidenceCodes: [],
        content: "Operational note.",
        authorUserId: "operator-2",
      })
    ).toMatchObject({ status: "ARGUMENT_ERROR" })
  })

  it("keeps the maximum form verifier output within budget", async () => {
    const order = commerce.orders.find(
      (item) => item.status === "delivered" && item.paymentStatus === "paid"
    )!
    const state = createReturnFormEditorState(
      {
        orderId: order.id,
        source: "internal",
        reason: "defective",
        customerStatement: "Product stopped working after delivery.",
        items: Array.from({ length: 20 }, (_, index) => ({
          orderLineId: `LINE-${String(index).padStart(3, "0")}-${"X".repeat(100)}`,
          requestedQuantity: 1,
        })),
      },
      2,
      true
    )
    editor.attachForm(state, () => undefined)
    const result = await execute("get_return_form_state", {})
    expect(JSON.stringify(result).length).toBeLessThanOrEqual(1500)
    expect(result).toMatchObject({
      status: "OK",
      selectedItemCount: 20,
      truncated: true,
    })
  })
})
