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
import type { Product } from "../products/types"
import { InventoryAdjustmentDialog } from "./inventory-pages"

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

const product: Product = {
  id: 501,
  sku: "ADJUST-501",
  title: "Adjustment product",
  brand: "Voltage",
  category: "test",
  price: { amount: 100, currency: "TWD" },
  stock: 10,
  description: "Description",
  shortAdCopy: "Short",
  longAdCopy: "Long",
  images: [],
  specifications: [],
  reviews: [],
  status: "published",
  archivedFromStatus: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
}

beforeEach(async () => {
  await i18n.changeLanguage("en")
})

afterEach(() => cleanup())

describe("inventory pages", () => {
  it("renders filters, expands a quick view, and opens the detail route", async () => {
    const router = createMemoryRouter([{ path: "*", element: <App /> }], {
      initialEntries: ["/inventory"],
    })
    const user = userEvent.setup()
    render(<RouterProvider router={router} />)

    expect(await screen.findByText("Total units")).toBeTruthy()
    expect(
      screen.getByRole("searchbox", { name: "Search inventory" })
    ).toBeTruthy()
    await user.type(
      screen.getByRole("searchbox", { name: "Search inventory" }),
      "no-such-inventory-item"
    )
    expect(await screen.findByText("Active filters")).toBeTruthy()
    expect(
      await screen.findByText("No inventory matches the current filters.")
    ).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Clear filters" }))
    await user.click(
      await screen.findByRole(
        "button",
        { name: "Next page" },
        { timeout: 5_000 }
      )
    )
    expect(
      (
        screen.getByRole("button", {
          name: "Previous page",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false)
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Period" }),
      "year"
    )
    expect(
      (screen.getByRole("combobox", { name: "Period" }) as HTMLSelectElement)
        .value
    ).toBe("year")
    const quickViewButtons = await screen.findAllByRole(
      "button",
      { name: /Quick view/ },
      { timeout: 5_000 }
    )
    await user.click(quickViewButtons[0])
    expect(await screen.findByText("Period summary")).toBeTruthy()
    expect(screen.getByText("Previous closing")).toBeTruthy()
    await user.click(screen.getAllByRole("button", { name: "Details" })[0])
    await waitFor(() =>
      expect(router.state.location.pathname).toMatch(/^\/inventory\/\d+$/)
    )
    expect(router.state.location.search).toBe("?period=year")
    expect(await screen.findByText("Movement history")).toBeTruthy()
    expect(
      (screen.getByRole("combobox", { name: "Period" }) as HTMLSelectElement)
        .value
    ).toBe("year")
    const yearTrendPointCount = screen.getByRole("img", {
      name: "Inventory trend",
    }).children.length
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Period" }),
      "week"
    )
    expect(router.state.location.search).toBe("?period=week")
    expect(
      screen.getByRole("img", { name: "Inventory trend" }).children.length
    ).not.toBe(yearTrendPointCount)

    const currentStockLabel = screen.getByText("Current stock")
    const currentStockCard = currentStockLabel.closest("[data-slot='card']")
    expect(currentStockCard).not.toBeNull()
    await user.click(screen.getByRole("button", { name: "Adjust inventory" }))
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Adjustment type" }),
      "reconciliation"
    )
    await user.clear(screen.getByRole("spinbutton", { name: "Target stock" }))
    await user.type(
      screen.getByRole("spinbutton", { name: "Target stock" }),
      "77"
    )
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Reason" }),
      "cycle_count"
    )
    await user.click(screen.getByRole("button", { name: "Confirm adjustment" }))
    await waitFor(() =>
      expect(
        within(currentStockCard as HTMLElement).getByText("77")
      ).toBeTruthy()
    )
    expect(await screen.findByText("Cycle count")).toBeTruthy()
  })

  it("shows a safe not-found state for an unknown inventory route", async () => {
    const router = createMemoryRouter([{ path: "*", element: <App /> }], {
      initialEntries: ["/inventory/999999"],
    })
    render(<RouterProvider router={router} />)

    expect(
      await screen.findByText("Inventory product was not found.")
    ).toBeTruthy()
  })

  it("previews and confirms an explicit adjustment", async () => {
    const user = userEvent.setup()
    const adjustInventory = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    render(
      <InventoryAdjustmentDialog
        product={product}
        repository={{ adjustInventory } as never}
        onClose={onClose}
      />
    )

    expect(
      (
        screen.getByRole("button", {
          name: "Confirm adjustment",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true)
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Adjustment type" }),
      "issue"
    )
    await user.clear(screen.getByRole("spinbutton", { name: "Quantity" }))
    await user.type(screen.getByRole("spinbutton", { name: "Quantity" }), "2")
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Reason" }),
      "damaged_goods"
    )
    expect(screen.getByText("-2")).toBeTruthy()
    expect(screen.getByText("8")).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Confirm adjustment" }))

    await waitFor(() => expect(adjustInventory).toHaveBeenCalledOnce())
    expect(adjustInventory).toHaveBeenCalledWith(501, {
      type: "issue",
      quantity: 2,
      reasonCode: "damaged_goods",
      note: "",
    })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it("cancels without writing", async () => {
    const user = userEvent.setup()
    const adjustInventory = vi.fn()
    const onClose = vi.fn()
    render(
      <InventoryAdjustmentDialog
        product={product}
        repository={{ adjustInventory } as never}
        onClose={onClose}
      />
    )

    await user.click(screen.getByRole("button", { name: "Cancel" }))
    expect(adjustInventory).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it("keeps the dialog open and reports repository failures", async () => {
    const user = userEvent.setup()
    const adjustInventory = vi.fn().mockRejectedValue(new Error("write failed"))
    const onClose = vi.fn()
    render(
      <InventoryAdjustmentDialog
        product={product}
        repository={{ adjustInventory } as never}
        onClose={onClose}
      />
    )

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Reason" }),
      "purchase_receipt"
    )
    await user.click(screen.getByRole("button", { name: "Confirm adjustment" }))

    expect(
      await screen.findByText("Inventory adjustment could not be saved.")
    ).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
  })
})
