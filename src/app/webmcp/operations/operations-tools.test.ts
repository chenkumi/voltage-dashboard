import { describe, expect, it, vi } from "vitest"
import { createCompletionVerifierMap } from "../completion-policy"
import type { WebMcpRegisteredTool } from "../types"
import { OperationsController } from "./operations-controller"
import {
  executeOperationsTool,
  OPERATIONS_TOOL_NAMES,
  OPERATIONS_TOOLS,
} from "./operations-tools"

const productDraft = {
  candidateId: "CAT-1001",
  title: "AeroPress Clear Coffee Maker",
  category: "Kitchen > Coffee",
  description: "A compact manual brewer for a clear and consistent cup.",
  specifications: { material: "Tritan", capacity: "300 ml" },
}

const assertClosedObjects = (schema: unknown) => {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return
  const record = schema as Record<string, unknown>
  if (record.type === "object") {
    expect(record.additionalProperties).toBe(false)
  }
  Object.values(record).forEach(assertClosedObjects)
}

const descriptionValues = (schema: unknown): string[] => {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return []
  const record = schema as Record<string, unknown>
  return [
    ...(typeof record.description === "string" ? [record.description] : []),
    ...Object.values(record).flatMap(descriptionValues),
  ]
}

describe("operations WebMCP tools", () => {
  it("defines the exact safe cross-module tool set", () => {
    expect(OPERATIONS_TOOLS.map(({ name }) => name)).toEqual(
      OPERATIONS_TOOL_NAMES
    )
    expect(OPERATIONS_TOOL_NAMES).not.toEqual(
      expect.arrayContaining([
        "approve_review",
        "complete_review",
        "publish_product",
        "resolve_case",
        "refund_order",
        "cancel_order",
      ])
    )
  })

  it("keeps names, descriptions, parameters, and schemas within contract", () => {
    for (const tool of OPERATIONS_TOOLS) {
      expect(tool.name.length).toBeLessThanOrEqual(30)
      expect(tool.description?.length ?? 0).toBeLessThanOrEqual(500)
      expect(tool.description).toMatch(/Purpose:/)
      expect(tool.description).toMatch(/Examples:/)
      expect(tool.description).toMatch(/Do not|do not/)
      assertClosedObjects(tool.inputSchema)
      expect(
        descriptionValues(tool.inputSchema).every(
          (description) => description.length <= 150
        )
      ).toBe(true)
      const properties = (
        tool.inputSchema as { properties?: Record<string, unknown> }
      ).properties
      expect(
        Object.keys(properties ?? {}).every((name) => name.length <= 30)
      ).toBe(true)
    }
  })

  it("maps both draft mutations to the synchronous state verifier", () => {
    expect(createCompletionVerifierMap(OPERATIONS_TOOLS)).toMatchObject({
      save_product_draft: "get_workflow_state",
      save_case_draft: "get_workflow_state",
    })

    const nativeRoundTrip = OPERATIONS_TOOLS.map((tool) => ({
      ...tool,
      inputSchema: JSON.stringify(tool.inputSchema),
      annotations:
        tool.name === "save_product_draft" || tool.name === "save_case_draft"
          ? { readOnlyHint: false }
          : tool.annotations,
    })) satisfies WebMcpRegisteredTool[]
    expect(createCompletionVerifierMap(nativeRoundTrip)).toMatchObject({
      save_product_draft: "get_workflow_state",
      save_case_draft: "get_workflow_state",
    })
  })

  it("saves and verifies product drafts in the same turn", () => {
    const controller = new OperationsController()

    expect(
      executeOperationsTool(controller, "save_product_draft", productDraft)
    ).toMatchObject({
      status: "OK",
      draft: { candidateId: "CAT-1001", status: "draft", version: 1 },
      verifier: "get_workflow_state",
    })
    expect(
      executeOperationsTool(controller, "get_workflow_state", {})
    ).toMatchObject({
      status: "OK",
      version: 1,
      productDrafts: [{ candidateId: "CAT-1001", version: 1 }],
    })
  })

  it("triages a return case without exposing final actions", () => {
    const controller = new OperationsController()
    const navigate = vi.fn()
    const eligibility = executeOperationsTool(
      controller,
      "check_return_eligibility",
      { caseId: "CASE-2004" }
    ) as { eligibility: unknown }

    expect(eligibility).toMatchObject({
      eligibility: { decision: "eligible" },
    })
    expect(
      executeOperationsTool(controller, "save_case_draft", {
        caseId: "CASE-2004",
        category: "return_review",
        priority: "low",
        evidence: ["delivered", "return_reason_changed_mind"],
        recommendation: "Apply the deterministic return policy.",
        supportDraft: "The return request is ready for a human decision.",
        eligibility: eligibility.eligibility,
      })
    ).toMatchObject({ status: "OK", verifier: "get_workflow_state" })
    expect(
      executeOperationsTool(
        controller,
        "open_case_review",
        { caseId: "CASE-2004" },
        navigate
      )
    ).toMatchObject({ status: "OK", reviewState: "pending" })
    expect(navigate).toHaveBeenCalledWith("approvals")
    expect(controller.getSnapshot().cases[3]?.status).toBe("pending_review")
  })

  it("rejects extra, invented, and sensitive draft input", () => {
    const controller = new OperationsController()

    expect(
      executeOperationsTool(controller, "save_product_draft", {
        ...productDraft,
        debug: true,
      })
    ).toMatchObject({ status: "ARGUMENT_ERROR" })
    expect(
      executeOperationsTool(controller, "save_product_draft", {
        ...productDraft,
        description: "Contact demo@example.com",
      })
    ).toMatchObject({ status: "ARGUMENT_ERROR" })
    expect(
      executeOperationsTool(controller, "save_case_draft", {
        caseId: "CASE-2001",
        category: "fulfillment_follow_up",
        priority: "high",
        evidence: ["invented_status"],
        recommendation: "Review this case.",
        supportDraft: "The dispatch status is under review.",
      })
    ).toMatchObject({ status: "ARGUMENT_ERROR" })
  })

  it("keeps every successful output within about 1.5K characters", () => {
    const controller = new OperationsController()
    const calls: Array<
      [Parameters<typeof executeOperationsTool>[1], Record<string, unknown>]
    > = [
      ["list_catalog_candidates", {}],
      ["get_catalog_candidate", { candidateId: "CAT-1001" }],
      ["list_ops_cases", {}],
      ["get_ops_case", { caseId: "CASE-2004" }],
      ["check_return_eligibility", { caseId: "CASE-2004" }],
      ["list_pending_reviews", {}],
      ["get_workflow_state", {}],
    ]

    for (const [name, args] of calls) {
      const result = executeOperationsTool(controller, name, args)
      expect(JSON.stringify(result).length).toBeLessThanOrEqual(1500)
      expect(result).not.toMatchObject({ status: "OUTPUT_LIMIT" })
    }
  })

  it("marks every external candidate and case reader as untrusted", () => {
    for (const name of [
      "list_catalog_candidates",
      "get_catalog_candidate",
      "list_ops_cases",
      "get_ops_case",
      "check_return_eligibility",
    ]) {
      expect(
        OPERATIONS_TOOLS.find((tool) => tool.name === name)?.annotations
      ).toMatchObject({ readOnlyHint: true, untrustedContentHint: true })
    }
  })
})
