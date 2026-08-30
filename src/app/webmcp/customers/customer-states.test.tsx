// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import i18n from "../../../i18n"
import type { CommerceDataSnapshot } from "../commerce-data/types"
import { CustomerEditorPage } from "./customer-editor-page"
import { CustomerDetailPage, CustomersPage } from "./customer-pages"

type TestContext = {
  commerce: CommerceDataSnapshot & {
    state: "idle" | "loading" | "ready" | "error"
    version: number
    error: string | null
  }
  commerceRepository: {
    addNote: ReturnType<typeof vi.fn>
    updateNote: ReturnType<typeof vi.fn>
    suspendCustomer: ReturnType<typeof vi.fn>
    restoreCustomer: ReturnType<typeof vi.fn>
    createCustomer: ReturnType<typeof vi.fn>
    updateCustomer: ReturnType<typeof vi.fn>
  }
}

const createContext = (): TestContext => ({
  commerce: {
    state: "loading",
    version: 0,
    customers: [],
    orders: [],
    orderLines: [],
    notes: [],
    activities: [],
    error: null,
  },
  commerceRepository: {
    addNote: vi.fn(),
    updateNote: vi.fn(),
    suspendCustomer: vi.fn(),
    restoreCustomer: vi.fn(),
    createCustomer: vi.fn(),
    updateCustomer: vi.fn(),
  },
})

let context = createContext()

vi.mock("../voltage-admin", () => ({
  useVoltageAdmin: () => context,
}))

beforeEach(async () => {
  context = createContext()
  await i18n.changeLanguage("en")
})

afterEach(() => cleanup())

describe("customer data states", () => {
  it("renders loading and repository error states", () => {
    const { rerender } = render(
      <MemoryRouter>
        <CustomersPage />
      </MemoryRouter>
    )
    expect(screen.getByText("Loading customers…")).toBeTruthy()
    expect(screen.getByLabelText("Total customers loading")).toBeTruthy()
    expect(
      screen.getByRole("heading", { name: "Customers" }).parentElement
        ?.textContent
    ).toContain("Loading…")

    context = {
      ...context,
      commerce: {
        ...context.commerce,
        state: "error",
        error: "read failed",
      },
    }
    rerender(
      <MemoryRouter>
        <CustomersPage />
      </MemoryRouter>
    )
    expect(screen.getByText("Customer data is unavailable.")).toBeTruthy()
    expect(screen.queryByText("Loading customers…")).toBeNull()
    const totalCard = screen
      .getByText("Total customers")
      .closest("[data-slot='card']")
    expect(totalCard?.querySelector("strong")?.textContent).toBe("—")
    expect(
      screen.getByRole("heading", { name: "Customers" }).parentElement
        ?.textContent
    ).not.toContain("0 customers")
  })

  it("renders safe not-found states for detail and edit routes", () => {
    context = {
      ...context,
      commerce: { ...context.commerce, state: "ready" },
    }
    const { unmount } = render(
      <MemoryRouter initialEntries={["/customers/CUST-9999"]}>
        <Routes>
          <Route
            path="/customers/:customerId"
            element={<CustomerDetailPage />}
          />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByText("Customer was not found.")).toBeTruthy()
    unmount()

    render(
      <MemoryRouter initialEntries={["/customers/edit/CUST-9999"]}>
        <Routes>
          <Route
            path="/customers/edit/:customerId"
            element={<CustomerEditorPage mode="edit" />}
          />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByText("Customer was not found.")).toBeTruthy()
  })
})
