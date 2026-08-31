// @vitest-environment jsdom

import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
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

describe("refund approval pages", () => {
  it("separates approval, refund execution, retries, and idempotent restock", async () => {
    const commerce = createCommerceSeed()
    const seeded = new Set(
      commerce.orders
        .filter(
          (order) =>
            order.status === "delivered" && order.paymentStatus === "paid"
        )
        .slice(0, 2)
        .map((order) => order.id)
    )
    const order = commerce.orders.find(
      (candidate) =>
        candidate.status === "delivered" &&
        candidate.paymentStatus === "paid" &&
        !seeded.has(candidate.id)
    )!
    const line = commerce.orderLines.find(
      (candidate) => candidate.orderId === order.id
    )!
    const router = createMemoryRouter([{ path: "*", element: <App /> }], {
      initialEntries: [`/returns/add?orderId=${order.id}`],
    })
    const user = userEvent.setup()
    render(<RouterProvider router={router} />)

    const quantity = await screen.findByRole("spinbutton", {
      name: `Return quantity for ${line.title}`,
    })
    await user.clear(quantity)
    await user.type(quantity, "1")
    await user.click(screen.getByRole("button", { name: "Submit return" }))
    await user.click(
      await screen.findByRole("button", { name: "Authorize return" })
    )
    await user.click(
      await screen.findByRole("button", { name: "Record receipt" })
    )
    await user.click(
      await screen.findByRole("button", { name: "Start inspection" })
    )
    await user.click(
      await screen.findByRole("button", { name: "Complete inspection" })
    )
    expect(
      await screen.findByText(
        "Reopening inspection invalidates the current refund calculation and approval."
      )
    ).toBeTruthy()

    const restock = await screen.findByRole("button", {
      name: "Confirm restock",
    })
    await user.click(restock)
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Confirm restock" })
      ).toBeNull()
    )
    const dispositionCard = screen
      .getAllByText("Inventory disposition")
      .map((element) => element.closest("[data-slot='card']"))
      .find(Boolean)
    expect(dispositionCard?.textContent).toContain("completed")

    await user.click(
      screen.getByRole("button", { name: "Generate refund calculation" })
    )
    await user.click(
      await screen.findByRole("button", { name: "Submit for refund approval" })
    )
    await waitFor(() =>
      expect(router.state.location.pathname).toMatch(
        /^\/refund-approvals\/APR-/
      )
    )
    expect(
      await screen.findByText(
        "Amounts are immutable and cannot be edited during approval."
      )
    ).toBeTruthy()
    expect(screen.getByText("Original order paid summary")).toBeTruthy()
    expect(screen.getByText(/Requested quantity: 1/)).toBeTruthy()
    expect(screen.getByText(/Received quantity: 1/)).toBeTruthy()
    expect(screen.getByText(/Accepted quantity: 1/)).toBeTruthy()
    expect(screen.getByText(/Original paid unit amounts:/)).toBeTruthy()
    expect(screen.getByText(/Shipping refund eligibility:/)).toBeTruthy()
    expect(screen.getByText("Refund workflow")).toBeTruthy()
    expect(screen.getByText("Current task")).toBeTruthy()
    const headerContext = screen.getByTestId("approval-header-context")
    expect(headerContext.textContent).toMatch(/RMA-/)
    expect(headerContext.textContent).toContain(order.id)
    expect(headerContext.textContent).toContain("Submitted by user")
    expect(headerContext.textContent).toContain("Waiting time")
    expect(document.querySelectorAll("[data-stage]")).toHaveLength(7)
    expect(screen.queryByText("Agent safe summary")).toBeNull()
    expect(screen.queryByRole("spinbutton")).toBeNull()

    expect(screen.getByText("Approval summary")).toBeTruthy()
    expect(screen.getByText("Decision outcome")).toBeTruthy()
    expect(screen.getByRole("region", { name: "Review notes" })).toBeTruthy()
    expect(screen.queryByText("Refund execution history")).toBeNull()
    await user.click(screen.getByRole("radio", { name: "Approve refund" }))
    await user.click(
      screen.getByRole("button", { name: "Confirm selected decision" })
    )
    expect(
      await screen.findByText(
        "Record the execution result from the RMA detail page."
      )
    ).toBeTruthy()
    const approvalWorkflow = Array.from(
      document.querySelectorAll<HTMLElement>("[data-stage]")
    ).map((stage) => [stage.dataset.stage, stage.dataset.state])
    await user.click(
      screen.getByRole("button", {
        name: "Open RMA and record refund result",
      })
    )
    await screen.findByRole("heading", { name: /^RMA-/ })
    const rmaWorkflow = Array.from(
      document.querySelectorAll<HTMLElement>("[data-stage]")
    ).map((stage) => [stage.dataset.stage, stage.dataset.state])
    expect(rmaWorkflow).toEqual(approvalWorkflow)
    expect(
      await screen.findByRole("button", { name: "Record refund result" })
    ).toBeTruthy()
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Execution result" }),
      "failed"
    )
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Result code" }),
      "provider_unavailable"
    )
    await user.click(
      screen.getByRole("button", { name: "Record refund result" })
    )
    expect(
      await screen.findByRole("button", { name: "Record retry result" })
    ).toBeTruthy()
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Execution result" }),
      "succeeded"
    )
    await user.click(
      screen.getByRole("button", { name: "Record retry result" })
    )

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Record retry result" })
      ).toBeNull()
    )
    const executionCard = screen
      .getAllByText("Refund execution")
      .map((element) => element.closest("[data-slot='card']"))
      .find(Boolean)
    expect(
      within(executionCard as HTMLElement).getByText(/Attempt 1: failed/)
    ).toBeTruthy()
    expect(
      within(executionCard as HTMLElement).getByText(/Attempt 2: succeeded/)
    ).toBeTruthy()

    await router.navigate("/refund-approvals")
    expect(await screen.findByText("Pending approval")).toBeTruthy()
    expect(screen.getAllByText(/APR-/).length).toBeGreaterThan(0)
    expect(
      screen.getByRole("columnheader", { name: "RMA / Order" })
    ).toBeTruthy()
    expect(
      screen.getByRole("columnheader", { name: "Accepted items" })
    ).toBeTruthy()
    expect(
      screen.getByRole("columnheader", { name: "Waiting time" })
    ).toBeTruthy()
    expect(screen.getByRole("combobox", { name: "Waiting time" })).toBeTruthy()
  }, 20_000)

  it("shows returned and approved approvals as read-only decision snapshots", async () => {
    const router = createMemoryRouter([{ path: "*", element: <App /> }], {
      initialEntries: ["/refund-approvals/APR-2007"],
    })
    render(<RouterProvider router={router} />)

    expect(
      await screen.findByRole("button", { name: "Open RMA and recalculate" })
    ).toBeTruthy()
    expect(screen.queryByRole("radio")).toBeNull()
    expect(screen.getByText(/Additional evidence requested/)).toBeTruthy()

    await router.navigate("/refund-approvals/APR-2008")
    expect(
      await screen.findByRole("button", {
        name: "Open RMA and record refund result",
      })
    ).toBeTruthy()
    expect(screen.queryByRole("radio")).toBeNull()
  })

  it("requires a reason to reject and marks refund execution not applicable", async () => {
    const router = createMemoryRouter([{ path: "*", element: <App /> }], {
      initialEntries: ["/refund-approvals/APR-2006"],
    })
    const user = userEvent.setup()
    render(<RouterProvider router={router} />)

    await user.click(
      await screen.findByRole("radio", { name: "Reject refund" })
    )
    const confirm = screen.getByRole("button", {
      name: "Confirm selected decision",
    })
    expect((confirm as HTMLButtonElement).disabled).toBe(true)
    await user.type(
      screen.getByRole("textbox", { name: "Decision reason" }),
      "Policy decision declined."
    )
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Confirm selected decision",
          }) as HTMLButtonElement
        ).disabled
      ).toBe(false)
    )
    await user.click(
      screen.getByRole("button", { name: "Confirm selected decision" })
    )
    await waitFor(() => {
      const alert = screen.queryByRole("alert")
      if (alert) throw new Error(alert.textContent ?? "Decision failed")
      expect(screen.queryByRole("radio")).toBeNull()
    })

    expect(await screen.findByRole("button", { name: "Open RMA" })).toBeTruthy()
    expect(
      document.querySelector<HTMLElement>('[data-stage="refund_execution"]')
        ?.dataset.state
    ).toBe("not_applicable")
    expect(screen.queryByRole("radio")).toBeNull()
  }, 15_000)

  it("keeps an approval invalidated by reopened inspection read-only", async () => {
    const router = createMemoryRouter([{ path: "*", element: <App /> }], {
      initialEntries: ["/returns/RMA-2006"],
    })
    const user = userEvent.setup()
    render(<RouterProvider router={router} />)

    await user.click(
      await screen.findByRole("button", { name: "Reopen inspection" })
    )
    await router.navigate("/refund-approvals/APR-2006")

    expect(
      await screen.findByRole("button", { name: "Open RMA current task" })
    ).toBeTruthy()
    expect(screen.queryByRole("radio")).toBeNull()
    expect(
      document.querySelector<HTMLElement>('[data-stage="inspection"]')?.dataset
        .state
    ).toBe("current")
  })
})
