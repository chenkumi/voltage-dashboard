// @vitest-environment jsdom

import { act } from "react"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import App from "../../../App"
import i18n, { LANGUAGE_STORAGE_KEY } from "../../../i18n"
import { OperationsController } from "./operations-controller"
import { executeOperationsTool } from "./operations-tools"

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

vi.mock("../reporting/reporting-tools", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../reporting/reporting-tools")>()

  class NoopReportingRuntimeController {
    async prepare() {}
    async dispose() {}
    async execute() {
      throw new Error("Reporting is outside this workflow integration test.")
    }
    executeReportTool() {
      throw new Error("Reporting is outside this workflow integration test.")
    }
  }

  return {
    ...actual,
    ReportingRuntimeController: NoopReportingRuntimeController,
  }
})

type FallbackProvider = {
  getTools: () => Array<{ name: string }>
  executeTool: (
    tool: { name: string },
    args: Record<string, unknown>
  ) => Promise<unknown>
}

const fallbackWindow = () =>
  window as typeof window & {
    __webmcpReady?: Promise<void>
    __webmcpTestProvider?: FallbackProvider
  }

const getFallbackProvider = async () => {
  await waitFor(() =>
    expect(fallbackWindow().__webmcpTestProvider).toBeDefined()
  )
  await fallbackWindow().__webmcpReady
  return fallbackWindow().__webmcpTestProvider!
}

const executeFallbackTool = async (
  provider: FallbackProvider,
  name: string,
  args: Record<string, unknown> = {}
) => {
  const tool = provider.getTools().find((item) => item.name === name)
  expect(tool).toBeDefined()
  return provider.executeTool(tool!, args)
}

const renderRoute = (route: string) =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <App />
    </MemoryRouter>
  )

beforeEach(async () => {
  window.localStorage.clear()
  await i18n.changeLanguage("en")
})

afterEach(() => cleanup())

describe("fallback operations workflows", () => {
  it("runs catalog candidate to Agent draft to human publication", () => {
    const controller = new OperationsController()
    const navigated: string[] = []

    expect(
      executeOperationsTool(controller, "list_catalog_candidates", {})
    ).toMatchObject({
      status: "OK",
      items: expect.arrayContaining([
        expect.objectContaining({ id: "CAT-1001" }),
      ]),
    })
    expect(
      executeOperationsTool(controller, "get_catalog_candidate", {
        candidateId: "CAT-1001",
      })
    ).toMatchObject({ status: "OK", candidate: { sourceTrust: "verified" } })
    expect(
      executeOperationsTool(controller, "save_product_draft", {
        candidateId: "CAT-1001",
        title: "AeroPress Clear Coffee Maker",
        category: "Kitchen > Coffee",
        description: "A compact manual brewer ready for human review.",
        specifications: { material: "Tritan", capacity: "300 ml" },
      })
    ).toMatchObject({ status: "OK", verifier: "get_workflow_state" })
    expect(
      executeOperationsTool(controller, "get_workflow_state", {})
    ).toMatchObject({
      productDrafts: [
        { candidateId: "CAT-1001", status: "draft", lastEditedBy: "agent" },
      ],
    })
    executeOperationsTool(
      controller,
      "open_product_review",
      { candidateId: "CAT-1001" },
      (view) => navigated.push(view)
    )
    expect(navigated).toEqual(["approvals"])

    controller.approveReview("REV-CAT-1001", "user")
    controller.completeReview("REV-CAT-1001", "user")

    expect(controller.getSnapshot()).toMatchObject({
      productDrafts: [{ candidateId: "CAT-1001", status: "published" }],
      reviews: [{ workflowId: "CAT-1001", state: "completed" }],
    })
    expect(controller.getSnapshot().audit.at(-1)).toMatchObject({
      actor: "user",
      action: "product_published",
      result: "completed",
    })
  })

  it("runs exception triage through return advice and human completion", () => {
    const controller = new OperationsController()
    const eligibility = executeOperationsTool(
      controller,
      "check_return_eligibility",
      { caseId: "CASE-2004" }
    ) as { eligibility: unknown }

    expect(
      executeOperationsTool(controller, "list_ops_cases", {
        type: "return_request",
        status: "open",
      })
    ).toMatchObject({
      status: "OK",
      items: [
        { id: "CASE-2004", reasonCode: "return_requested" },
        { id: "CASE-2005", reasonCode: "return_requested" },
      ],
    })
    expect(eligibility).toMatchObject({
      eligibility: { decision: "eligible", missingEvidence: [] },
    })
    executeOperationsTool(controller, "save_case_draft", {
      caseId: "CASE-2004",
      category: "return_review",
      priority: "low",
      evidence: ["delivered", "return_reason_changed_mind"],
      recommendation: "Apply the deterministic return policy.",
      supportDraft: "The return request is ready for a human decision.",
      eligibility: eligibility.eligibility,
    })
    expect(
      executeOperationsTool(controller, "get_workflow_state", {})
    ).toMatchObject({
      caseDrafts: [
        { caseId: "CASE-2004", status: "draft", lastEditedBy: "agent" },
      ],
    })
    executeOperationsTool(controller, "open_case_review", {
      caseId: "CASE-2004",
    })

    controller.approveReview("REV-CASE-2004", "user")
    controller.completeReview("REV-CASE-2004", "user")

    expect(
      controller.getSnapshot().cases.find(({ id }) => id === "CASE-2004")
    ).toMatchObject({ status: "resolved" })
    expect(controller.getSnapshot().audit.at(-1)).toMatchObject({
      actor: "user",
      action: "case_resolved",
    })
  })

  it("reflects UI edits to tools and isolates a reloaded workspace", () => {
    const current = new OperationsController()
    current.saveProductDraft(
      {
        candidateId: "CAT-1002",
        title: "Portable LED Task Light",
        category: "Home > Lighting",
        description: "A user-edited product draft.",
        specifications: { power: "5 W", runtime: "8 hours" },
      },
      "user"
    )

    expect(
      executeOperationsTool(current, "get_workflow_state", {})
    ).toMatchObject({
      version: 1,
      productDrafts: [{ candidateId: "CAT-1002", lastEditedBy: "user" }],
    })

    const reloaded = new OperationsController()
    expect(executeOperationsTool(reloaded, "get_workflow_state", {})).toEqual({
      status: "OK",
      version: 0,
      productDrafts: [],
      caseDrafts: [],
      reviews: [],
    })
  })
})

describe("fallback Provider and UI workflow integration", () => {
  it("switches between English and Traditional Chinese and persists the choice", async () => {
    const user = userEvent.setup()
    renderRoute("/dashboard")

    expect(screen.getByRole("button", { name: "Dashboard" })).toBeTruthy()
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Switch language" }),
      "zh-TW"
    )

    expect(screen.getByRole("button", { name: "儀表板" })).toBeTruthy()
    expect(screen.getByRole("heading", { name: "儀表板" })).toBeTruthy()
    expect(document.documentElement.lang).toBe("zh-TW")
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("zh-TW")

    await user.selectOptions(
      screen.getByRole("combobox", { name: "切換語言" }),
      "en"
    )
    expect(screen.getByRole("button", { name: "Dashboard" })).toBeTruthy()
    expect(document.documentElement.lang).toBe("en")
  })

  it("reflects an Agent product draft and requires page buttons to publish", async () => {
    const user = userEvent.setup()
    renderRoute("/catalog-intake")
    const provider = await getFallbackProvider()

    await act(async () => {
      await executeFallbackTool(provider, "save_product_draft", {
        candidateId: "CAT-1001",
        title: "AeroPress Clear Coffee Maker",
        category: "Kitchen > Coffee",
        description: "A compact manual brewer ready for human review.",
        specifications: { material: "Tritan", capacity: "300 ml" },
      })
    })
    expect(await screen.findByText("v1 · agent")).toBeTruthy()

    await act(async () => {
      await executeFallbackTool(provider, "open_product_review", {
        candidateId: "CAT-1001",
      })
    })
    expect(
      await screen.findByRole("heading", { name: "CAT-1001" })
    ).toBeTruthy()

    await user.click(
      screen.getByRole("button", { name: "Approve recommendation" })
    )
    await user.click(screen.getByRole("button", { name: "Publish product" }))

    await expect(
      executeFallbackTool(provider, "get_workflow_state")
    ).resolves.toMatchObject({
      productDrafts: [{ candidateId: "CAT-1001", status: "published" }],
      reviews: [{ workflowId: "CAT-1001", state: "completed" }],
    })
  })

  it("reflects an Agent return draft and requires page buttons to complete", async () => {
    const user = userEvent.setup()
    renderRoute("/operations-cases")
    const provider = await getFallbackProvider()
    const eligibility = (await executeFallbackTool(
      provider,
      "check_return_eligibility",
      { caseId: "CASE-2004" }
    )) as { eligibility: unknown }

    await act(async () => {
      await executeFallbackTool(provider, "save_case_draft", {
        caseId: "CASE-2004",
        category: "return_review",
        priority: "low",
        evidence: ["delivered", "return_reason_changed_mind"],
        recommendation: "Apply the deterministic return policy.",
        supportDraft: "The return request is ready for a human decision.",
        eligibility: eligibility.eligibility,
      })
    })
    expect(
      await screen.findByRole("button", {
        name: /CASE-2004.*Return request.*drafted/,
      })
    ).toBeTruthy()

    await act(async () => {
      await executeFallbackTool(provider, "open_case_review", {
        caseId: "CASE-2004",
      })
    })
    await user.click(
      await screen.findByRole("button", { name: "Approve recommendation" })
    )
    await user.click(screen.getByRole("button", { name: "Complete case" }))

    await expect(
      executeFallbackTool(provider, "get_workflow_state")
    ).resolves.toMatchObject({
      caseDrafts: [{ caseId: "CASE-2004", status: "completed" }],
      reviews: [{ workflowId: "CASE-2004", state: "completed" }],
    })
  })

  it("exposes user edits to tools and resets state after Provider remount", async () => {
    const user = userEvent.setup()
    const first = renderRoute("/catalog-intake")
    const initialProvider = await getFallbackProvider()

    await user.clear(screen.getByRole("textbox", { name: /^Description/ }))
    await user.type(
      screen.getByRole("textbox", { name: /^Description/ }),
      "A page-authored draft visible to the verifier."
    )
    await user.click(screen.getByRole("button", { name: "Save draft" }))

    await expect(
      executeFallbackTool(initialProvider, "get_workflow_state")
    ).resolves.toMatchObject({
      version: 1,
      productDrafts: [{ candidateId: "CAT-1001", lastEditedBy: "user" }],
    })

    first.unmount()
    expect(fallbackWindow().__webmcpTestProvider).toBeUndefined()
    renderRoute("/catalog-intake")
    const reloadedProvider = await getFallbackProvider()

    await expect(
      executeFallbackTool(reloadedProvider, "get_workflow_state")
    ).resolves.toEqual({
      status: "OK",
      version: 0,
      productDrafts: [],
      caseDrafts: [],
      reviews: [],
    })
  })
})
