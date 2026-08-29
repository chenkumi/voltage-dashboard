import { COMPLETION_VERIFIER_SCHEMA_KEY } from "../completion-policy"
import type { VoltageAdminView } from "../voltage-admin"
import type { WebMcpRegisteredTool } from "../types"
import { OperationsController } from "./operations-controller"
import { checkReturnEligibility } from "./return-policy"
import { PRODUCT_CATEGORIES } from "./types"
import type {
  CaseDraft,
  CaseDraftInput,
  EligibilityResult,
  OpsCase,
  OpsCaseType,
  ProductDraftInput,
} from "./types"

const schema = (
  properties: Record<string, unknown>,
  required: string[] = [],
  extensions: Record<string, unknown> = {}
) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
  ...extensions,
})

const shortText = (description: string) => ({
  type: "string",
  minLength: 1,
  maxLength: 120,
  description,
})

const eligibilitySchema = schema(
  {
    decision: {
      type: "string",
      enum: ["eligible", "ineligible", "needs_human_review"],
      description: "Deterministic policy decision.",
    },
    matchedRules: {
      type: "array",
      maxItems: 6,
      items: shortText("Matched policy rule code."),
      description: "Policy rule codes returned by the eligibility tool.",
    },
    missingEvidence: {
      type: "array",
      maxItems: 6,
      items: shortText("Missing evidence code."),
      description: "Evidence codes still requiring human review.",
    },
  },
  ["decision", "matchedRules", "missingEvidence"]
)

const productDraftProperties = {
  candidateId: shortText("Catalog candidate ID returned by a catalog tool."),
  title: shortText("Safe product title, at most 120 characters."),
  category: {
    type: "string",
    enum: [...PRODUCT_CATEGORIES],
    description: "One supported catalog category.",
  },
  description: {
    type: "string",
    minLength: 1,
    maxLength: 600,
    description: "Safe plain-text product description.",
  },
  specifications: schema({
    material: shortText("Material specification."),
    capacity: shortText("Capacity specification."),
    origin: shortText("Origin specification without an address."),
    power: shortText("Power specification."),
    runtime: shortText("Runtime specification."),
    warranty: shortText("Warranty specification."),
  }),
}

const caseCategories: CaseDraft["category"][] = [
  "fulfillment_follow_up",
  "payment_review",
  "address_review",
  "return_review",
]

const caseDraftProperties = {
  caseId: shortText("Safe case ID returned by an operations case tool."),
  category: {
    type: "string",
    enum: caseCategories,
    description: "Classification matching the selected case type.",
  },
  priority: {
    type: "string",
    enum: ["low", "medium", "high"],
    description: "Operational priority for the draft.",
  },
  evidence: {
    type: "array",
    maxItems: 8,
    uniqueItems: true,
    items: shortText("Status code listed in the selected case facts."),
    description: "Unique subset of immutable case fact codes.",
  },
  recommendation: {
    type: "string",
    minLength: 1,
    maxLength: 600,
    description: "Safe plain-text operational recommendation.",
  },
  supportDraft: {
    type: "string",
    minLength: 1,
    maxLength: 600,
    description: "Safe plain-text support response draft.",
  },
  eligibility: {
    ...eligibilitySchema,
    description: "Exact deterministic result from check_return_eligibility.",
  },
}

export const OPERATIONS_TOOL_NAMES = [
  "list_catalog_candidates",
  "get_catalog_candidate",
  "save_product_draft",
  "open_product_review",
  "list_ops_cases",
  "get_ops_case",
  "save_case_draft",
  "check_return_eligibility",
  "open_case_review",
  "list_pending_reviews",
  "get_workflow_state",
] as const

export type OperationsToolName = (typeof OPERATIONS_TOOL_NAMES)[number]

export const OPERATIONS_TOOLS: WebMcpRegisteredTool[] = [
  {
    name: "list_catalog_candidates",
    description:
      "Purpose: list safe catalog candidate summaries. Call before drafting a product. Examples: ‘Find products to onboard’, ‘Catalog queue’, ‘Missing product fields’. Do not call for published catalog search or final publication.",
    inputSchema: schema({}),
    annotations: { readOnlyHint: true, untrustedContentHint: true },
  },
  {
    name: "get_catalog_candidate",
    description:
      "Purpose: read one catalog candidate and its untrusted source text. Call after listing candidates. Examples: ‘Inspect CAT-1001’, ‘Read source specs’, ‘What fields are missing?’. Do not call to save or publish a product.",
    inputSchema: schema(
      {
        candidateId: shortText("Catalog candidate ID from the candidate list."),
      },
      ["candidateId"]
    ),
    annotations: { readOnlyHint: true, untrustedContentHint: true },
  },
  {
    name: "save_product_draft",
    description:
      "Purpose: save a reversible product draft from a catalog candidate. Call after checking source data. Examples: ‘Draft CAT-1001’, ‘Fill product fields’, ‘Revise description’. Do not call to publish, approve, or bypass human review.",
    inputSchema: schema(
      productDraftProperties,
      ["candidateId", "title", "category", "description", "specifications"],
      { [COMPLETION_VERIFIER_SCHEMA_KEY]: "get_workflow_state" }
    ),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
      completionVerifier: "get_workflow_state",
    },
  },
  {
    name: "open_product_review",
    description:
      "Purpose: queue an existing product draft and open Approval Inbox. Call after the draft verifier confirms it. Examples: ‘Send CAT-1001 to review’, ‘Open product approval’, ‘Let a human publish’. Do not call to approve or publish.",
    inputSchema: schema(
      { candidateId: shortText("Candidate ID with a saved product draft.") },
      ["candidateId"]
    ),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "list_ops_cases",
    description:
      "Purpose: list safe operations case summaries by type, status, or priority. Examples: ‘Unshipped cases’, ‘Failed checks’, ‘Return queue’. Call for triage; do not call for names, address content, payment details, or order changes.",
    inputSchema: schema({
      type: {
        type: "string",
        enum: [
          "fulfillment",
          "payment_check",
          "address_validation",
          "return_request",
        ],
        description: "Optional safe operations case type.",
      },
      status: {
        type: "string",
        enum: ["open", "drafted", "pending_review", "resolved"],
        description: "Optional workflow status.",
      },
      priority: {
        type: "string",
        enum: ["low", "medium", "high"],
        description: "Optional operational priority.",
      },
    }),
    annotations: { readOnlyHint: true, untrustedContentHint: true },
  },
  {
    name: "get_ops_case",
    description:
      "Purpose: read one safe case with status-code facts. Call after listing cases. Examples: ‘Inspect CASE-2001’, ‘Read return facts’, ‘Why is dispatch blocked?’. Do not call for actual address, payment data, customer identity, or order changes.",
    inputSchema: schema(
      { caseId: shortText("Safe case ID returned by list_ops_cases.") },
      ["caseId"]
    ),
    annotations: { readOnlyHint: true, untrustedContentHint: true },
  },
  {
    name: "save_case_draft",
    description:
      "Purpose: save reversible case classification and support drafts. Call after reading immutable facts. Examples: ‘Classify CASE-2001’, ‘Draft next step’, ‘Prepare support reply’. Do not call to refund, cancel, pay, modify, approve, or complete an order.",
    inputSchema: schema(
      caseDraftProperties,
      [
        "caseId",
        "category",
        "priority",
        "evidence",
        "recommendation",
        "supportDraft",
      ],
      { [COMPLETION_VERIFIER_SCHEMA_KEY]: "get_workflow_state" }
    ),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
      completionVerifier: "get_workflow_state",
    },
  },
  {
    name: "check_return_eligibility",
    description:
      "Purpose: apply deterministic demo return policy to one return case. Examples: ‘Can CASE-2004 return?’, ‘Check return window’, ‘What evidence is missing?’. Call before saving return advice; do not issue refunds or make a final decision.",
    inputSchema: schema(
      { caseId: shortText("Return-request case ID from list_ops_cases.") },
      ["caseId"]
    ),
    annotations: { readOnlyHint: true, untrustedContentHint: true },
  },
  {
    name: "open_case_review",
    description:
      "Purpose: queue an existing case draft and open Approval Inbox. Call after the draft verifier confirms it. Examples: ‘Send CASE-2001 to review’, ‘Open case approval’, ‘Ask a human to decide’. Do not call to approve, refund, cancel, or complete.",
    inputSchema: schema(
      { caseId: shortText("Case ID with a saved classification draft.") },
      ["caseId"]
    ),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "list_pending_reviews",
    description:
      "Purpose: list safe product and case reviews awaiting human work. Examples: ‘What needs approval?’, ‘Pending product reviews’, ‘Cases ready for a decision’. Call for queue status; do not approve, complete, publish, refund, or change orders.",
    inputSchema: schema({}),
    annotations: { readOnlyHint: true },
  },
  {
    name: "get_workflow_state",
    description:
      "Purpose: verify same-turn product and case draft mutations. Call after save_product_draft or save_case_draft. Examples: ‘Verify saved draft’, ‘Read workflow version’, ‘Confirm draft status’. Do not use as approval or final-action confirmation.",
    inputSchema: schema({}),
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

const hasExactKeys = (
  value: Record<string, unknown>,
  allowed: readonly string[]
) => Object.keys(value).every((key) => allowed.includes(key))

const readString = (
  value: unknown,
  allowed?: readonly string[]
): string | undefined =>
  typeof value === "string" && (!allowed || allowed.includes(value))
    ? value
    : undefined

const errorResult = () => ({
  status: "ARGUMENT_ERROR",
  message: "Arguments did not satisfy the operations workflow contract.",
})

const bounded = (result: unknown) => {
  const serialized = JSON.stringify(result)
  return serialized.length <= 1500
    ? result
    : {
        status: "OUTPUT_LIMIT",
        message: "Result exceeded the operations output budget.",
      }
}

const workflowState = (controller: OperationsController) => {
  const snapshot = controller.getSnapshot()
  return {
    status: "OK",
    version: snapshot.version,
    productDrafts: snapshot.productDrafts.slice(0, 20).map((draft) => ({
      candidateId: draft.candidateId,
      status: draft.status,
      version: draft.version,
      lastEditedBy: draft.lastEditedBy,
    })),
    caseDrafts: snapshot.caseDrafts.slice(0, 20).map((draft) => ({
      caseId: draft.caseId,
      status: draft.status,
      version: draft.version,
      lastEditedBy: draft.lastEditedBy,
    })),
    reviews: snapshot.reviews.slice(0, 20).map((review) => ({
      id: review.id,
      workflowType: review.workflowType,
      workflowId: review.workflowId,
      state: review.state,
      draftVersion: review.draftVersion,
      requiredAction: review.requiredAction,
    })),
  }
}

export const isOperationsTool = (name: string): name is OperationsToolName =>
  (OPERATIONS_TOOL_NAMES as readonly string[]).includes(name)

export const executeOperationsTool = (
  controller: OperationsController,
  name: OperationsToolName,
  args: Record<string, unknown>,
  navigate: (view: VoltageAdminView) => void = () => undefined
) => {
  try {
    const snapshot = controller.getSnapshot()
    if (name === "list_catalog_candidates") {
      if (!hasExactKeys(args, [])) return errorResult()
      return bounded({
        status: "OK",
        items: snapshot.candidates.map((candidate) => ({
          id: candidate.id,
          sourceLabel: candidate.sourceLabel,
          sourceUpdatedAt: candidate.sourceUpdatedAt,
          sourceTrust: candidate.sourceTrust,
          sourceTitle: candidate.sourceTitle,
          suggestedCategory: candidate.suggestedCategory,
          missingFields: candidate.missingFields,
        })),
      })
    }
    if (name === "get_catalog_candidate") {
      if (!hasExactKeys(args, ["candidateId"])) return errorResult()
      const candidateId = readString(args.candidateId)
      const candidate = snapshot.candidates.find(({ id }) => id === candidateId)
      return bounded(candidate ? { status: "OK", candidate } : errorResult())
    }
    if (name === "save_product_draft") {
      const next = controller.saveProductDraft(
        args as unknown as ProductDraftInput,
        "agent"
      )
      const draft = next.productDrafts.find(
        ({ candidateId }) => candidateId === args.candidateId
      )
      return bounded({
        status: "OK",
        draft: draft && {
          candidateId: draft.candidateId,
          status: draft.status,
          version: draft.version,
        },
        verifier: "get_workflow_state",
      })
    }
    if (name === "open_product_review") {
      if (!hasExactKeys(args, ["candidateId"])) return errorResult()
      const candidateId = readString(args.candidateId)
      if (!candidateId) return errorResult()
      controller.openProductReview(candidateId, "agent")
      navigate("approvals")
      return bounded({
        status: "OK",
        candidateId,
        reviewState: "pending",
        next: "Human review is required in Approval Inbox.",
      })
    }
    if (name === "list_ops_cases") {
      if (!hasExactKeys(args, ["type", "status", "priority"])) {
        return errorResult()
      }
      const type = readString(args.type, [
        "fulfillment",
        "payment_check",
        "address_validation",
        "return_request",
      ]) as OpsCaseType | undefined
      const status = readString(args.status, [
        "open",
        "drafted",
        "pending_review",
        "resolved",
      ]) as OpsCase["status"] | undefined
      const priority = readString(args.priority, ["low", "medium", "high"]) as
        OpsCase["priority"] | undefined
      if (
        (args.type !== undefined && !type) ||
        (args.status !== undefined && !status) ||
        (args.priority !== undefined && !priority)
      ) {
        return errorResult()
      }
      return bounded({
        status: "OK",
        items: snapshot.cases
          .filter(
            (opsCase) =>
              (!type || opsCase.type === type) &&
              (!status || opsCase.status === status) &&
              (!priority || opsCase.priority === priority)
          )
          .map(
            ({
              id,
              type: caseType,
              reasonCode,
              status: caseStatus,
              priority,
            }) => ({
              id,
              type: caseType,
              reasonCode,
              status: caseStatus,
              priority,
            })
          ),
      })
    }
    if (name === "get_ops_case") {
      if (!hasExactKeys(args, ["caseId"])) return errorResult()
      const caseId = readString(args.caseId)
      const opsCase = snapshot.cases.find(({ id }) => id === caseId)
      return bounded(opsCase ? { status: "OK", case: opsCase } : errorResult())
    }
    if (name === "save_case_draft") {
      const next = controller.saveCaseDraft(
        args as unknown as CaseDraftInput,
        "agent"
      )
      const draft = next.caseDrafts.find(({ caseId }) => caseId === args.caseId)
      return bounded({
        status: "OK",
        draft: draft && {
          caseId: draft.caseId,
          status: draft.status,
          version: draft.version,
        },
        verifier: "get_workflow_state",
      })
    }
    if (name === "check_return_eligibility") {
      if (!hasExactKeys(args, ["caseId"])) return errorResult()
      const caseId = readString(args.caseId)
      const opsCase = snapshot.cases.find(({ id }) => id === caseId)
      if (!opsCase || opsCase.type !== "return_request") return errorResult()
      return bounded({
        status: "OK",
        caseId,
        eligibility: checkReturnEligibility(opsCase),
      })
    }
    if (name === "open_case_review") {
      if (!hasExactKeys(args, ["caseId"])) return errorResult()
      const caseId = readString(args.caseId)
      if (!caseId) return errorResult()
      controller.openCaseReview(caseId, "agent")
      navigate("approvals")
      return bounded({
        status: "OK",
        caseId,
        reviewState: "pending",
        next: "Human review is required in Approval Inbox.",
      })
    }
    if (name === "list_pending_reviews") {
      if (!hasExactKeys(args, [])) return errorResult()
      return bounded({
        status: "OK",
        items: snapshot.reviews
          .filter(({ state }) => state === "pending" || state === "approved")
          .map(
            ({
              id,
              workflowType,
              workflowId,
              state,
              draftVersion,
              requiredAction,
            }) => ({
              id,
              workflowType,
              workflowId,
              state,
              draftVersion,
              requiredAction,
            })
          ),
      })
    }
    if (name === "get_workflow_state") {
      if (!hasExactKeys(args, [])) return errorResult()
      return bounded(workflowState(controller))
    }
    return errorResult()
  } catch {
    return errorResult()
  }
}

export const expectedCategoryForCase = (
  type: OpsCaseType
): CaseDraft["category"] =>
  ({
    fulfillment: "fulfillment_follow_up",
    payment_check: "payment_review",
    address_validation: "address_review",
    return_request: "return_review",
  })[type]

export const isEligibilityResult = (
  value: unknown
): value is EligibilityResult =>
  isRecord(value) &&
  readString(value.decision, [
    "eligible",
    "ineligible",
    "needs_human_review",
  ]) !== undefined
