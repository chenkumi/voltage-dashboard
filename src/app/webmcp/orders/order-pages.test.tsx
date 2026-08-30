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
    await screen.findByRole("button", { name: "Next page" }, { timeout: 5_000 })
    const orderSeed = createCommerceSeed()
    for (const [label, expected] of [
      ["Total orders", orderSeed.orders.length],
      [
        "Processing orders",
        orderSeed.orders.filter(({ status }) => status === "processing").length,
      ],
      [
        "Action needed",
        orderSeed.orders.filter(({ status }) => status === "action_needed")
          .length,
      ],
      [
        "Failed payments",
        orderSeed.orders.filter(
          ({ paymentStatus }) => paymentStatus === "failed"
        ).length,
      ],
    ] as const) {
      const card = [
        ...document.querySelectorAll<HTMLElement>("[data-slot='card']"),
      ].find((item) => item.querySelector("span")?.textContent === label)
      expect(card?.querySelector("strong")?.textContent).toBe(String(expected))
    }
    const search = screen.getByRole("searchbox", { name: "Search orders" })
    await user.type(search, "missing-order")
    expect(await screen.findByText("Search: missing-order")).toBeTruthy()
    expect(
      await screen.findByText("No orders match the current filters.")
    ).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Clear all" }))

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

  it("applies primary filters and keeps advanced drafts until Apply", async () => {
    const router = createMemoryRouter([{ path: "*", element: <App /> }], {
      initialEntries: ["/orders"],
    })
    const user = userEvent.setup()
    render(<RouterProvider router={router} />)
    await screen.findByRole("button", { name: "Next page" }, { timeout: 5_000 })

    await user.click(screen.getByRole("combobox", { name: "Payment status" }))
    await user.click(await screen.findByRole("option", { name: "Failed" }))
    expect(
      screen.getAllByText("Payment status: Failed").length
    ).toBeGreaterThan(0)
    await user.click(
      screen.getByRole("button", { name: "Payment status: Failed remove" })
    )
    expect(screen.queryByText("Payment status: Failed")).toBeNull()

    await user.click(screen.getByRole("button", { name: "More filters" }))
    let popover = document.querySelector<HTMLElement>(
      '[data-slot="popover-content"]'
    )
    await user.click(within(popover!).getByRole("combobox", { name: "Region" }))
    await user.click(await screen.findByRole("option", { name: "south" }))
    await user.click(within(popover!).getByRole("button", { name: "Cancel" }))
    expect(screen.queryByText("Region: south")).toBeNull()

    await user.click(screen.getByRole("button", { name: "More filters" }))
    popover = document.querySelector<HTMLElement>(
      '[data-slot="popover-content"]'
    )
    await user.click(within(popover!).getByRole("combobox", { name: "Region" }))
    await user.click(await screen.findByRole("option", { name: "south" }))
    await user.click(within(popover!).getByRole("button", { name: "Apply" }))
    expect(screen.getByText("Region: south")).toBeTruthy()
    await user.click(
      screen.getByRole("button", { name: "Region: south remove" })
    )
    expect(screen.queryByText("Region: south")).toBeNull()

    await user.click(screen.getByRole("button", { name: "More filters" }))
    popover = document.querySelector<HTMLElement>(
      '[data-slot="popover-content"]'
    )
    await user.type(within(popover!).getByLabelText("From date"), "2026-08-01")
    await user.type(within(popover!).getByLabelText("To date"), "2026-08-20")
    await user.click(
      within(popover!).getByRole("combobox", { name: "Currency" })
    )
    await user.click(await screen.findByRole("option", { name: "TWD" }))
    await user.type(
      within(popover!).getByRole("spinbutton", { name: "Minimum amount" }),
      "100"
    )
    await user.type(
      within(popover!).getByRole("spinbutton", { name: "Maximum amount" }),
      "5000"
    )
    await user.click(within(popover!).getByRole("button", { name: "Apply" }))

    await user.click(
      screen.getByRole("button", { name: /^Date range: .+ remove$/ })
    )
    await user.click(
      screen.getByRole("button", { name: /^Amount range: .+ remove$/ })
    )
    await user.click(screen.getByRole("button", { name: "More filters" }))
    popover = document.querySelector<HTMLElement>(
      '[data-slot="popover-content"]'
    )
    expect(
      (within(popover!).getByLabelText("From date") as HTMLInputElement).value
    ).toBe("")
    expect(
      (within(popover!).getByLabelText("To date") as HTMLInputElement).value
    ).toBe("")
    expect(
      (
        within(popover!).getByRole("spinbutton", {
          name: "Minimum amount",
        }) as HTMLInputElement
      ).value
    ).toBe("")
    expect(
      (
        within(popover!).getByRole("spinbutton", {
          name: "Maximum amount",
        }) as HTMLInputElement
      ).value
    ).toBe("")
    await user.click(within(popover!).getByRole("button", { name: "Cancel" }))

    await user.click(screen.getByRole("button", { name: "More filters" }))
    popover = document.querySelector<HTMLElement>(
      '[data-slot="popover-content"]'
    )
    await user.type(
      within(popover!).getByRole("spinbutton", { name: "Minimum amount" }),
      "100"
    )
    await user.type(
      within(popover!).getByRole("spinbutton", { name: "Maximum amount" }),
      "500"
    )
    await user.click(within(popover!).getByRole("button", { name: "Apply" }))
    expect(screen.getByText("Currency: TWD")).toBeTruthy()
    expect(screen.getByText(/^Amount range:/)).toBeTruthy()
    await user.click(
      screen.getByRole("button", { name: "Currency: TWD remove" })
    )
    expect(screen.queryByText("Currency: TWD")).toBeNull()
    expect(screen.queryByText(/^Amount range:/)).toBeNull()

    await user.click(screen.getByRole("button", { name: "Filter orders" }))
    popover = document.querySelector<HTMLElement>(
      '[data-slot="popover-content"]'
    )
    for (const name of [
      "Order status",
      "Payment status",
      "Fulfillment status",
      "Customer segment",
      "Region",
      "Currency",
      "Sort",
    ]) {
      expect(within(popover!).getByRole("combobox", { name })).toBeTruthy()
    }
    const mobileFields = within(popover!)
      .getByRole("combobox", { name: "Order status" })
      .closest(".grid-cols-1")
    expect(mobileFields?.className).toContain("grid-cols-1")
    expect(mobileFields?.className).not.toContain("sm:grid-cols-2")
    await user.click(within(popover!).getByRole("button", { name: "Cancel" }))
  })

  it("shows not-found and blocks invalid advanced ranges", async () => {
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
    await screen.findByRole("button", { name: "Next page" }, { timeout: 5_000 })
    await user.click(screen.getByRole("button", { name: "More filters" }))
    const popover = document.querySelector<HTMLElement>(
      '[data-slot="popover-content"]'
    )
    expect(popover).toBeTruthy()
    await user.click(
      within(popover!).getByRole("combobox", { name: "Currency" })
    )
    await user.click(await screen.findByRole("option", { name: "TWD" }))
    await user.type(
      within(popover!).getByRole("spinbutton", { name: "Minimum amount" }),
      "500"
    )
    await user.type(
      within(popover!).getByRole("spinbutton", { name: "Maximum amount" }),
      "100"
    )
    await user.click(within(popover!).getByRole("button", { name: "Apply" }))
    expect(
      await within(popover!).findByText(
        "Minimum amount must not exceed maximum amount."
      )
    ).toBeTruthy()
    expect(
      (
        within(popover!).getByRole("spinbutton", {
          name: "Minimum amount",
        }) as HTMLInputElement
      ).value
    ).toBe("500")
    expect(screen.queryByText(/^Amount range:/)).toBeNull()

    await user.clear(
      within(popover!).getByRole("spinbutton", { name: "Minimum amount" })
    )
    await user.clear(
      within(popover!).getByRole("spinbutton", { name: "Maximum amount" })
    )
    await user.type(within(popover!).getByLabelText("From date"), "2026-08-20")
    await user.type(within(popover!).getByLabelText("To date"), "2026-08-10")
    await user.click(within(popover!).getByRole("button", { name: "Apply" }))
    expect(
      await within(popover!).findByText(
        "Start date must not be after end date."
      )
    ).toBeTruthy()
    expect(screen.queryByText(/^Date range:/)).toBeNull()
  })
})
