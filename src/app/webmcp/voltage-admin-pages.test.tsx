// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import i18n from "../../i18n"
import { Dashboard } from "./voltage-admin-pages"

type StoreState = "idle" | "loading" | "ready" | "error"

const createContext = (state: StoreState = "ready") => ({
  commerce: { state },
  dashboard: {
    revenueByCurrency: [{ amount: 1250, currency: "USD" as const }],
    orderCount: 24,
    attentionOrderCount: 3,
    customerCount: 18,
    activeCustomerCount: 16,
    availableProductCount: 12,
    lowStockCount: 2,
    latestOrders: [],
    lowStockProducts: [],
  },
  products: {
    state,
    products: [{ status: "draft" }, { status: "active" }],
  },
  workflow: {
    cases: [{ status: "open" }],
    reviews: [{ state: "pending" }],
  },
})

let context = createContext()

vi.mock("./voltage-admin", () => ({
  useVoltageAdmin: () => context,
  voltageAdminPath: (section: string) => `/${section}`,
}))

const metricCard = (label: string) => {
  const card = [
    ...document.querySelectorAll<HTMLElement>("[data-slot='card']"),
  ].find((item) => item.querySelector("span")?.textContent === label)
  if (!card) throw new Error(`Expected ${label} metric card.`)
  return card
}

beforeEach(async () => {
  context = createContext()
  await i18n.changeLanguage("en")
})

afterEach(() => cleanup())

describe("Dashboard metrics", () => {
  it("uses the shared metric contract for ready, loading, and error states", () => {
    const { rerender } = render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    )

    expect(
      document.querySelectorAll<HTMLElement>("[data-slot='card']")
    ).toHaveLength(9)
    expect(document.querySelector(".voltage-admin-metric")).toBeNull()
    expect(document.querySelector(".voltage-admin-panel")).toBeNull()

    const latestActivity = metricCard("Latest activity")
    expect(latestActivity.textContent).toContain("Order queue")
    expect(latestActivity.className).toContain("bg-[rgb(245,246,241)]")

    const inventorySignal = metricCard("Inventory signal")
    expect(inventorySignal.textContent).toContain("Low stock")
    expect(inventorySignal.className).toContain("bg-[#edf0ea]")
    expect(inventorySignal.className).not.toContain("bg-[rgb(245,246,241)]")

    const revenue = metricCard("Revenue")
    expect(revenue.parentElement?.className).toContain("md:col-span-6")
    expect(revenue.parentElement?.className).toContain("lg:col-span-3")
    expect(revenue.querySelector("strong")?.className).toContain("tabular-nums")

    const workflow = metricCard("Draft products")
    expect(workflow.parentElement?.className).toContain("md:col-span-6")
    expect(workflow.parentElement?.className).toContain("lg:col-span-4")

    context = createContext("loading")
    rerender(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    )
    for (const label of [
      "Revenue",
      "Orders",
      "Customers",
      "Available SKUs",
      "Draft products",
    ]) {
      expect(screen.getByLabelText(`${label} loading`)).toBeTruthy()
    }

    context = createContext("error")
    rerender(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    )
    for (const label of [
      "Revenue",
      "Orders",
      "Customers",
      "Available SKUs",
      "Draft products",
    ]) {
      const card = metricCard(label)
      expect(card.querySelector("strong")?.textContent).toBe("—")
      expect(card.textContent).toContain("Data unavailable")
    }
  })
})
