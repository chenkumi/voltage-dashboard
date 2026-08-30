import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createCompletionVerifierMap } from "../completion-policy"
import { createCommerceSeed } from "../commerce-data/commerce-seed"
import {
  ReturnEditorController,
  createReturnFormEditorState,
  createReturnReviewEditorState,
} from "./return-editor-controller"
import { ReturnRepository } from "./return-repository"
import {
  executeReturnTool,
  REFUND_APPROVAL_DETAIL_TOOLS,
  RETURN_DETAIL_TOOLS,
  RETURN_FORM_TOOLS,
  RETURN_GLOBAL_TOOLS,
  RETURN_TOOLS,
} from "./return-tools"

describe("return WebMCP tools", () => {
  const commerce = createCommerceSeed()
  let repository: ReturnRepository
  let editor: ReturnEditorController

  beforeEach(async () => {
    repository = new ReturnRepository({
      databaseName: `return-tools-${crypto.randomUUID()}`,
      commerceSnapshot: commerce,
    })
    editor = new ReturnEditorController()
    await repository.initialize()
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
        "apply_return_review_draft",
        "get_return_review_state",
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
    expect(RETURN_DETAIL_TOOLS).toHaveLength(4)
    expect(REFUND_APPROVAL_DETAIL_TOOLS).toHaveLength(1)
  })

  it("declares completion verifiers for both reversible draft mutations", () => {
    expect(createCompletionVerifierMap(RETURN_TOOLS)).toMatchObject({
      apply_return_form_draft: "get_return_form_state",
      apply_return_review_draft: "get_return_review_state",
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

    const currentRma = (await repository.getSnapshot()).rmas.find(
      (item) => item.id === rma.id
    )!
    editor.attachReview(
      createReturnReviewEditorState(
        {
          rmaId: currentRma.id,
          rmaVersion: currentRma.version,
          policyVersion: currentRma.eligibility.policyVersion,
        },
        {
          evidenceCodes: ["within_30_days"],
          operationalSummary: "Contact x@example.com for private details.",
          nextStep: "User reviews the eligibility decision.",
          supportDraft: "Return review is ready for user decision.",
        },
        2,
        true
      ),
      () => undefined
    )
    const restricted = await execute("get_refund_approval", {
      approvalId: approval.id,
    })
    expect(restricted).toMatchObject({ status: "ARGUMENT_ERROR" })
    expect(JSON.stringify(restricted)).not.toContain("x@example.com")
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

  it("binds review drafts to current RMA, policy, evidence, and editor versions", async () => {
    const snapshot = await repository.getSnapshot()
    const rma = snapshot.rmas.find((item) => item.status === "active")!
    let state = createReturnReviewEditorState({
      rmaId: rma.id,
      rmaVersion: rma.version,
      policyVersion: rma.eligibility.policyVersion,
    })
    editor.attachReview(state, (next) => {
      state = next
    })
    const policy = (await execute("check_return_eligibility", {
      rmaId: rma.id,
      rmaVersion: rma.version,
      facts: {
        daysSinceDelivery: 5,
        packageOpened: false,
        condition: "unused",
        finalSale: false,
      },
    })) as { eligibility: { matchedRules: string[] } }
    const result = await execute("apply_return_review_draft", {
      rmaId: rma.id,
      rmaVersion: rma.version,
      policyVersion: rma.eligibility.policyVersion,
      editorVersion: state.version,
      evidenceCodes: policy.eligibility.matchedRules,
      operationalSummary: "Return policy evidence verified.",
      nextStep: "User reviews the eligibility decision.",
      supportDraft: "Return review is ready for user decision.",
    })
    expect(result).toMatchObject({ status: "OK", valid: true, version: 2 })
    expect(
      await execute("apply_return_review_draft", {
        rmaId: rma.id,
        rmaVersion: rma.version,
        policyVersion: rma.eligibility.policyVersion,
        editorVersion: 1,
        evidenceCodes: policy.eligibility.matchedRules,
        operationalSummary: "Return policy evidence verified.",
        nextStep: "User reviews the eligibility decision.",
        supportDraft: "Return review is ready for user decision.",
      })
    ).toMatchObject({
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
