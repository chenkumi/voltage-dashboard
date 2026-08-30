// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import i18n from "../../../i18n"
import { InventoryDetailPage, InventoryPage } from "./inventory-pages"

let context: ReturnType<typeof createContext>

const createContext = () => ({
  commerce: {
    state: "loading" as "loading" | "ready" | "error",
    version: 0,
    orders: [],
    orderLines: [],
    customers: [],
    notes: [],
    activities: [],
    error: null as string | null,
  },
  products: {
    state: "loading" as "loading" | "ready" | "error",
    version: 0,
    products: [],
    error: null as string | null,
  },
  productRepository: {
    listInventoryMovements: vi.fn(() => new Promise(() => undefined)),
  },
})

vi.mock("../voltage-admin", () => ({
  useVoltageAdmin: () => context,
}))

beforeEach(async () => {
  context = createContext()
  await i18n.changeLanguage("en")
})

afterEach(() => cleanup())

describe("inventory data states", () => {
  it("renders one loading state while repositories initialize", () => {
    render(
      <MemoryRouter>
        <InventoryPage />
      </MemoryRouter>
    )

    expect(screen.getByText("Loading inventory…")).toBeTruthy()
    expect(screen.queryByText("Inventory data is unavailable.")).toBeNull()
  })

  it("gives a known error precedence over another loading store", () => {
    context = {
      ...context,
      products: {
        ...context.products,
        state: "error",
        error: "read failed",
      },
    }
    render(
      <MemoryRouter initialEntries={["/inventory/1"]}>
        <InventoryPage />
        <InventoryDetailPage />
      </MemoryRouter>
    )

    expect(screen.getAllByText("Inventory data is unavailable.")).toHaveLength(
      2
    )
    expect(screen.queryByText("Loading inventory…")).toBeNull()
  })
})
