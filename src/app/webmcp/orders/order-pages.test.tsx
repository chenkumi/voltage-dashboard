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

beforeEach(async () => {
  await i18n.changeLanguage("en")
})

afterEach(() => cleanup())

describe("order pages", () => {
  it("filters, paginates, expands, and opens a consistent read-only detail", async () => {
    const router = createMemoryRouter([{ path: "*", element: <App /> }], {
      initialEntries: ["/orders"],
    })
    const user = userEvent.setup()
    render(<RouterProvider router={router} />)

    expect(await screen.findByText("Total orders")).toBeTruthy()
    const search = screen.getByRole("searchbox", { name: "Search orders" })
    await user.type(search, "missing-order")
    expect(await screen.findByText("Active filters")).toBeTruthy()
    expect(
      await screen.findByText("No orders match the current filters.")
    ).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Clear filters" }))

    const next = await screen.findByRole(
      "button",
      { name: "Next page" },
      { timeout: 5_000 }
    )
    await user.click(next)
    expect(
      (
        screen.getByRole("button", {
          name: "Previous page",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false)
    await user.click(screen.getByRole("button", { name: "Previous page" }))
    await user.type(search, "VM-25065")
    expect(await screen.findByText("VM-25065")).toBeTruthy()

    const quickButton = (
      await screen.findAllByRole(
        "button",
        { name: "Quick view" },
        { timeout: 5_000 }
      )
    )[0]
    const orderRow = quickButton.closest("tr")
    expect(orderRow).not.toBeNull()
    expect(quickButton.getAttribute("aria-expanded")).toBe("false")
    const totalText = within(orderRow as HTMLElement).getAllByRole("cell")[6]
      .textContent
    await user.click(quickButton)
    expect(quickButton.getAttribute("aria-expanded")).toBe("true")
    expect(await screen.findByText("Historical items")).toBeTruthy()
    expect(screen.getByText("Amount breakdown")).toBeTruthy()
    expect(screen.getByText("Exception signals")).toBeTruthy()
    expect(screen.getByRole("button", { name: "CASE-2002" })).toBeTruthy()
    await user.click(
      within(orderRow as HTMLElement).getByRole("button", { name: "Details" })
    )
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/orders/VM-25065")
    )

    expect(await screen.findByText("Order timeline")).toBeTruthy()
    expect(screen.getByText("Masked customer")).toBeTruthy()
    expect(screen.getByText("Payment and fulfillment")).toBeTruthy()
    expect(screen.getAllByText(totalText ?? "").length).toBeGreaterThan(0)
    const seed = createCommerceSeed()
    const selectedOrder = seed.orders.find(({ id }) => id === "VM-25065")
    const selectedCustomer = seed.customers.find(
      ({ id }) => id === selectedOrder?.customerId
    )
    if (!selectedCustomer) throw new Error("Expected seeded customer.")
    const customerCard = screen
      .getByText("Masked customer")
      .closest('[data-slot="card"]')
    if (!customerCard) throw new Error("Expected masked customer card.")
    for (const sensitiveValue of [
      selectedCustomer.contact.fullName,
      selectedCustomer.contact.email,
      selectedCustomer.contact.phone,
      selectedCustomer.contact.addressLine,
      selectedCustomer.contact.postalCode,
    ]) {
      expect(customerCard.textContent).not.toContain(sensitiveValue)
    }
    expect(screen.queryByRole("button", { name: /cancel order/i })).toBeNull()
    expect(screen.queryByRole("button", { name: /refund/i })).toBeNull()
    expect(screen.queryByRole("button", { name: /retry payment/i })).toBeNull()

    await user.click(screen.getByRole("button", { name: "Open customer" }))
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        `/customers/${selectedCustomer.id}`
      )
    )
    expect(await screen.findByText("Customer information")).toBeTruthy()
    expect(screen.getByText("Customer orders")).toBeTruthy()
    expect(screen.getByText(selectedCustomer.contact.fullName)).toBeTruthy()

    await router.navigate("/orders/VM-25065")

    await user.click(await screen.findByRole("button", { name: /CASE-2002/ }))
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/operations-cases")
    )
    expect(router.state.location.search).toBe("?caseId=CASE-2002")
  })

  it("shows not-found and invalid-filter states", async () => {
    const missingRouter = createMemoryRouter(
      [{ path: "*", element: <App /> }],
      { initialEntries: ["/orders/VM-99999"] }
    )
    const { unmount } = render(<RouterProvider router={missingRouter} />)
    expect(await screen.findByText("Order was not found.")).toBeTruthy()
    unmount()

    const invalidRouter = createMemoryRouter(
      [{ path: "*", element: <App /> }],
      { initialEntries: ["/orders"] }
    )
    const user = userEvent.setup()
    render(<RouterProvider router={invalidRouter} />)
    await screen.findByText("Total orders")
    await user.type(screen.getByLabelText("Minimum amount"), "500")
    await user.type(screen.getByLabelText("Maximum amount"), "100")
    expect(await screen.findByText("Order filters are invalid.")).toBeTruthy()
  })
})
