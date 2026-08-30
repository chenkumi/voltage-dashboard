// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react"
import { createMemoryRouter, RouterProvider } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import App from "../../../App"
import i18n from "../../../i18n"
import { createCommerceSeed } from "../commerce-data/commerce-seed"

vi.mock("../reporting/reporting-tools", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../reporting/reporting-tools")>()
  class NoopReportingRuntimeController {
    async prepare() {}
    async dispose() {}
    async execute() {
      return { rows: [] }
    }
    executeReportTool() {
      throw new Error("Reporting is outside this test.")
    }
  }
  return {
    ...actual,
    ReportingRuntimeController: NoopReportingRuntimeController,
  }
})

type Provider = {
  getTools: () => Array<{ name: string }>
  executeTool: (
    tool: { name: string },
    args: Record<string, unknown>
  ) => Promise<unknown>
}

const fallback = () =>
  window as typeof window & {
    __webmcpReady?: Promise<void>
    __webmcpTestProvider?: Provider
  }

const provider = async () => {
  await waitFor(() => expect(fallback().__webmcpReady).toBeDefined())
  await fallback().__webmcpReady
  return fallback().__webmcpTestProvider!
}

const execute = async (
  current: Provider,
  name: string,
  args: Record<string, unknown> = {}
) => {
  const tool = current.getTools().find((item) => item.name === name)
  expect(tool).toBeDefined()
  return current.executeTool(tool!, args)
}

const deleteDatabase = (name: string) =>
  new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
    request.onblocked = () => resolve()
  })

beforeEach(async () => {
  await i18n.changeLanguage("en")
})

afterEach(async () => {
  cleanup()
  await Promise.all([
    deleteDatabase("webmcp-agent-returns-v1"),
    deleteDatabase("webmcp-agent-products-v1"),
  ])
})

describe("fallback return workflow", () => {
  it("rediscovers route tools and stops every workflow before user-only actions", async () => {
    const commerce = createCommerceSeed()
    const order = commerce.orders.find(
      (item) => item.status === "delivered" && item.paymentStatus === "paid"
    )!
    const line = commerce.orderLines.find((item) => item.orderId === order.id)!
    const router = createMemoryRouter([{ path: "*", element: <App /> }], {
      initialEntries: [`/returns/add?orderId=${order.id}`],
    })
    render(<RouterProvider router={router} />)

    let current = await provider()
    const formNames = current.getTools().map(({ name }) => name)
    expect(formNames).toEqual(
      expect.arrayContaining([
        "search_returns",
        "apply_return_form_draft",
        "get_return_form_state",
      ])
    )
    expect(formNames).not.toContain("apply_return_review_draft")
    expect(formNames.join(" ")).not.toMatch(
      /submit_return|approve_refund|record_refund/
    )
    const initial = (await waitFor(async () => {
      const value = await execute(current, "get_return_form_state")
      expect(value).toMatchObject({ status: "OK", orderId: order.id })
      return value
    })) as { version: number }
    expect(
      await execute(current, "apply_return_form_draft", {
        orderId: order.id,
        editorVersion: initial.version,
        reason: "defective",
        customerStatement: "Product stopped working after delivery.",
        items: [{ orderLineId: line.id, requestedQuantity: 1 }],
      })
    ).toMatchObject({ status: "OK", dirty: true, valid: true })

    const search = (await execute(current, "search_returns", {
      status: "active",
    })) as { items: Array<{ id: string; version: number }> }
    const rma = search.items[0]
    await execute(current, "open_return_detail", { rmaId: rma.id })
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/returns/${rma.id}`)
    )
    await waitFor(() =>
      expect(
        fallback()
          .__webmcpTestProvider?.getTools()
          .map(({ name }) => name)
      ).toContain("apply_return_review_draft")
    )
    current = await provider()
    const detailNames = current.getTools().map(({ name }) => name)
    expect(detailNames).toEqual(
      expect.arrayContaining([
        "check_return_eligibility",
        "apply_return_review_draft",
        "get_return_review_state",
        "get_refund_calculation",
      ])
    )
    expect(detailNames).not.toContain("apply_return_form_draft")
    const reviewState = (await waitFor(async () => {
      const value = await execute(current, "get_return_review_state")
      expect(value).toMatchObject({ status: "OK", rmaId: rma.id })
      return value
    })) as { rmaVersion: number; policyVersion: string; version: number }
    const policy = (await execute(current, "check_return_eligibility", {
      rmaId: rma.id,
      rmaVersion: reviewState.rmaVersion,
      facts: {
        daysSinceDelivery: 4,
        packageOpened: false,
        condition: "unused",
        finalSale: false,
      },
    })) as { eligibility: { matchedRules: string[] } }
    expect(
      await execute(current, "apply_return_review_draft", {
        rmaId: rma.id,
        rmaVersion: reviewState.rmaVersion,
        policyVersion: reviewState.policyVersion,
        editorVersion: reviewState.version,
        evidenceCodes: policy.eligibility.matchedRules,
        operationalSummary: "Return policy evidence verified.",
        nextStep: "User reviews the eligibility decision.",
        supportDraft: "Return review is ready for user decision.",
      })
    ).toMatchObject({ status: "OK", valid: true })

    const approvalId = "APR-route-check"
    await router.navigate(`/refund-approvals/${approvalId}`)
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        `/refund-approvals/${approvalId}`
      )
    )
    await waitFor(() =>
      expect(
        fallback()
          .__webmcpTestProvider?.getTools()
          .map(({ name }) => name)
      ).toContain("get_refund_approval")
    )
    current = await provider()
    const approvalNames = current.getTools().map(({ name }) => name)
    expect(approvalNames).toContain("get_refund_approval")
    expect(approvalNames).not.toEqual(
      expect.arrayContaining([
        "apply_return_form_draft",
        "apply_return_review_draft",
        "approve_refund",
        "reject_refund",
        "record_refund_result",
      ])
    )
  }, 20_000)
})
