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
    await waitFor(
      () => {
        const totalCard = screen
          .getByText("Total units")
          .closest("[data-slot='card']")
        expect(totalCard?.querySelector("strong")?.textContent).toBe("9779")
      },
      { timeout: 5_000 }
    )
    for (const [label, value, detail, tone] of [
      [
        "Total units",
        "9779",
        "Across active products",
        "before:bg-muted-foreground/45",
      ],
      ["Out of stock", "4", "Needs immediate review", "before:bg-destructive"],
      ["Low stock", "29", "At or below 12 units", "before:bg-amber-500"],
      ["Reorder risk", "0", "21 days of supply or less", "before:bg-amber-500"],
    ] as const) {
      const card = [
        ...document.querySelectorAll<HTMLElement>("[data-slot='card']"),
      ].find((item) => item.querySelector("span")?.textContent === label)
      expect(card).not.toBeNull()
      expect(card?.className).toContain(tone)
      expect(within(card as HTMLElement).getByText(detail)).toBeTruthy()
      expect(card?.querySelector("strong")?.textContent).toBe(value)
    }
    expect(
      screen.getByRole("searchbox", { name: "Search inventory" })
    ).toBeTruthy()
    await user.type(
      screen.getByRole("searchbox", { name: "Search inventory" }),
      "no-such-inventory-item"
    )
    expect(
      await screen.findByText("Search: no-such-inventory-item")
    ).toBeTruthy()
    expect(
      await screen.findByText(
        "No inventory matches the current filters.",
        {},
        { timeout: 5_000 }
      )
    ).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Clear all" }))
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
    await user.click(screen.getByRole("combobox", { name: "Period" }))
    await user.click(screen.getByRole("option", { name: "Year" }))
    expect(screen.getAllByText("Period: Year").length).toBeGreaterThan(0)
    expect(
      (
        screen.getByRole("button", {
          name: "Previous page",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true)
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
  }, 20_000)

  it("applies sort from More and all mobile inventory filters", async () => {
    const router = createMemoryRouter([{ path: "*", element: <App /> }], {
      initialEntries: ["/inventory"],
    })
    const user = userEvent.setup()
    render(<RouterProvider router={router} />)

    expect(await screen.findByText("Total units")).toBeTruthy()
    await screen.findByRole("button", { name: "Next page" }, { timeout: 5_000 })
    await user.click(screen.getByRole("button", { name: "More filters" }))
    let popover = document.querySelector<HTMLElement>(
      '[data-slot="popover-content"]'
    )
    expect(popover).toBeTruthy()
    await user.click(within(popover!).getByRole("combobox", { name: "Sort" }))
    await user.click(
      await screen.findByRole("option", { name: "Stock low to high" })
    )
    await user.click(within(popover!).getByRole("button", { name: "Apply" }))
    expect(screen.getByText("Sort: Stock low to high")).toBeTruthy()

    await user.click(screen.getByRole("button", { name: "Filter inventory" }))
    popover = document.querySelector<HTMLElement>(
      '[data-slot="popover-content"]'
    )
    expect(popover).toBeTruthy()
    await user.click(
      within(popover!).getByRole("combobox", { name: "Category" })
    )
    await user.keyboard("b{Enter}")
    await user.click(within(popover!).getByRole("combobox", { name: "Risk" }))
    await user.keyboard("{ArrowDown}{Enter}")
    await user.click(within(popover!).getByRole("combobox", { name: "Period" }))
    await user.click(screen.getByRole("option", { name: "Year" }))
    await user.click(within(popover!).getByRole("button", { name: "Apply" }))

    expect(
      screen.getByRole("button", { name: /^Category: .+ remove$/ })
    ).toBeTruthy()
    expect(
      screen.getByRole("button", { name: /^Risk: .+ remove$/ })
    ).toBeTruthy()
    expect(screen.getAllByText("Period: Year").length).toBeGreaterThan(0)
    expect(
      screen.getAllByText("Sort: Stock low to high").length
    ).toBeGreaterThan(0)
    await user.click(screen.getByRole("button", { name: "Clear all" }))
    expect(screen.queryByText("Period: Year")).toBeNull()
    expect(screen.queryByText("Sort: Stock low to high")).toBeNull()
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
