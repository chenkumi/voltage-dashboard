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

const fillCustomerForm = async (
  user: ReturnType<typeof userEvent.setup>,
  values: { name: string; email: string }
) => {
  await user.clear(screen.getByLabelText("Full name"))
  await user.type(screen.getByLabelText("Full name"), values.name)
  await user.clear(screen.getByLabelText("Email"))
  await user.type(screen.getByLabelText("Email"), values.email)
  await user.type(screen.getByLabelText("Phone"), "0912345678")
  await user.type(screen.getByLabelText("Address"), "Test Road 1")
  await user.type(screen.getByLabelText("City"), "Taipei")
  await user.type(screen.getByLabelText("Postal code"), "100")
}

describe("customer management pages", () => {
  it("supports safe list filters and the complete manual customer lifecycle", async () => {
    const seed = createCommerceSeed()
    const target = seed.customers[0]
    const router = createMemoryRouter([{ path: "*", element: <App /> }], {
      initialEntries: [
        "/customers?segment=vip&email=secret%40example.test&customerId=CUST-1001&note=private",
      ],
    })
    const user = userEvent.setup()
    render(<RouterProvider router={router} />)

    expect(await screen.findByText("Total customers")).toBeTruthy()
    await waitFor(() =>
      expect(router.state.location.search).toBe("?segment=vip")
    )
    expect(screen.getByText("Active filters")).toBeTruthy()
    expect(document.body.textContent).not.toContain(target.contact.fullName)
    expect(document.body.textContent).not.toContain(target.contact.email)
    await user.click(screen.getByRole("button", { name: "Clear filters" }))
    await user.click(
      await screen.findByRole("button", { name: "Next page" })
    )
    expect(
      (
        screen.getByRole("button", {
          name: "Previous page",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false)
    await router.navigate(
      "/customers?status=active&region=north&period=365d&email=hidden%40example.test"
    )
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Customer status") as HTMLSelectElement).value
      ).toBe("active")
    )
    expect((screen.getByLabelText("Region") as HTMLSelectElement).value).toBe(
      "north"
    )
    expect(
      (screen.getByLabelText("Recent activity") as HTMLSelectElement).value
    ).toBe("365d")
    expect(
      (
        screen.getByRole("button", {
          name: "Previous page",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true)
    await waitFor(() =>
      expect(router.state.location.search).toBe(
        "?status=active&region=north&period=365d"
      )
    )
    await user.click(screen.getByRole("button", { name: "Clear filters" }))
    await user.selectOptions(screen.getByLabelText("Region"), ["north"])
    await waitFor(() =>
      expect(router.state.location.search).toBe("?region=north")
    )
    await user.click(screen.getByRole("button", { name: "Clear filters" }))
    await user.type(screen.getByLabelText("Minimum spend"), "500")
    await user.type(screen.getByLabelText("Maximum spend"), "100")
    expect(
      await screen.findByText("Customer filters are invalid.")
    ).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Clear filters" }))
    await user.click(screen.getByRole("button", { name: "Next page" }))
    expect(
      (
        screen.getByRole("button", {
          name: "Previous page",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false)
    await user.click(screen.getByRole("button", { name: "Previous page" }))
    const activeCard = screen
      .getByText("Active customers")
      .closest('[data-slot="card"]')
    if (!activeCard) throw new Error("Expected active customer KPI.")
    const activeBefore = Number(
      within(activeCard).getByRole("strong").textContent
    )

    const search = screen.getByRole("searchbox", { name: "Search customers" })
    await user.type(search, target.contact.email)
    const detailButton = (
      await screen.findAllByRole("button", { name: "Details" })
    )[0]
    const customerRow = detailButton.closest("tr")
    expect(customerRow).not.toBeNull()
    expect(within(customerRow as HTMLElement).getByText(target.id)).toBeTruthy()
    expect(document.body.textContent).not.toContain(target.contact.email)
    await user.click(detailButton)
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/customers/${target.id}`)
    )

    expect(await screen.findByText("Customer information")).toBeTruthy()
    expect(screen.getByText(target.contact.fullName)).toBeTruthy()
    expect(screen.getByText(target.contact.email)).toBeTruthy()
    expect(screen.getByText("Customer orders")).toBeTruthy()
    expect(
      screen.queryByRole("button", { name: /delete customer/i })
    ).toBeNull()

    await user.click(screen.getByRole("button", { name: "Edit customer" }))
    await screen.findByRole("heading", { name: "Edit customer" })
    const originalName = (
      screen.getByLabelText("Full name") as HTMLInputElement
    ).value
    await user.clear(screen.getByLabelText("Full name"))
    await user.type(screen.getByLabelText("Full name"), "Unsaved name")
    await user.click(screen.getByRole("button", { name: "Cancel" }))
    expect(await screen.findByText(originalName)).toBeTruthy()

    await user.click(screen.getByRole("button", { name: "Edit customer" }))
    const updatedName = `${originalName} Updated`
    await user.clear(screen.getByLabelText("Full name"))
    await user.type(screen.getByLabelText("Full name"), updatedName)
    await user.type(screen.getByLabelText("Custom tags"), "priority care")
    await user.click(screen.getByRole("button", { name: "Save customer" }))
    expect(await screen.findByText(updatedName)).toBeTruthy()
    expect(screen.getByText("priority care")).toBeTruthy()

    const newNote = screen.getByLabelText("New note")
    await user.type(newNote, "<b>unsafe</b>")
    await user.click(screen.getByRole("button", { name: "Add note" }))
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Notes must be plain text"
    )
    await user.clear(newNote)
    await user.type(newNote, "Follow up next week")
    await user.click(screen.getByRole("button", { name: "Add note" }))
    await waitFor(() => expect((newNote as HTMLTextAreaElement).value).toBe(""))
    expect(await screen.findByText("Follow up next week")).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Edit note" }))
    const editNote = screen.getByLabelText("Edit note")
    await user.clear(editNote)
    await user.type(editNote, "Follow up tomorrow")
    await user.click(screen.getByRole("button", { name: "Save note" }))
    expect(await screen.findByText("Follow up tomorrow")).toBeTruthy()

    await user.click(screen.getByRole("button", { name: "Suspend customer" }))
    const suspendDialog = screen.getByRole("dialog", {
      name: "Suspend customer",
    })
    await user.selectOptions(within(suspendDialog).getByLabelText("Reason"), [
      "manual_review",
    ])
    await user.click(
      within(suspendDialog).getByRole("button", { name: "Confirm suspension" })
    )
    expect(await screen.findByText("suspended")).toBeTruthy()

    await router.navigate("/customers")
    await screen.findByText("Total customers")
    const suspendedActiveCard = screen
      .getByText("Active customers")
      .closest('[data-slot="card"]')
    if (!suspendedActiveCard) throw new Error("Expected active customer KPI.")
    expect(
      Number(within(suspendedActiveCard).getByRole("strong").textContent)
    ).toBe(activeBefore - 1)
    await router.navigate(`/customers/${target.id}`)
    await screen.findByText(updatedName)

    await user.click(screen.getByRole("button", { name: "Restore customer" }))
    const restoreDialog = screen.getByRole("dialog", {
      name: "Restore customer",
    })
    await user.selectOptions(within(restoreDialog).getByLabelText("Reason"), [
      "review_completed",
    ])
    await user.click(
      within(restoreDialog).getByRole("button", {
        name: "Confirm restoration",
      })
    )
    expect(await screen.findByText("active")).toBeTruthy()

    const relatedOrder = screen.getAllByRole("button", { name: /^VM-/ })[0]
    const relatedOrderId = relatedOrder.textContent
    await user.click(relatedOrder)
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/orders/${relatedOrderId}`)
    )
    expect(await screen.findByText("Order timeline")).toBeTruthy()

    await router.navigate("/customers/add")
    await screen.findByRole("heading", { name: "Add customer" })
    const uniqueEmail = "new.customer@example.test"
    await fillCustomerForm(user, {
      name: "New Customer",
      email: uniqueEmail,
    })
    await user.type(screen.getByLabelText("Custom tags"), "manual-only")
    await user.click(screen.getByRole("button", { name: "Save customer" }))
    expect(await screen.findByText("New Customer")).toBeTruthy()
    expect(router.state.location.pathname).toMatch(/^\/customers\/CUST-\d+$/)
    expect(screen.getByText(uniqueEmail)).toBeTruthy()

    await router.navigate("/customers/add")
    await screen.findByRole("heading", { name: "Add customer" })
    await fillCustomerForm(user, {
      name: "Duplicate Customer",
      email: uniqueEmail,
    })
    await user.click(screen.getByRole("button", { name: "Save customer" }))
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Customer Email already exists."
    )
  }, 30_000)
})
