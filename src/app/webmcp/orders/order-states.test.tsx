// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import i18n from "../../../i18n"
import { createCommerceSeed } from "../commerce-data/commerce-seed"
import type { CommerceDataSnapshot } from "../commerce-data/types"
import { createDummyJsonProductSeed } from "../products/product-seed"
import type { Product } from "../products/types"
import { OrderDetailPage, OrdersPage } from "./order-pages"

type TestContext = {
  commerce: CommerceDataSnapshot & {
    state: "idle" | "loading" | "ready" | "error"
    version: number
    error: string | null
  }
  products: { products: Product[] }
  returns: {
    rmas: []
    state: "idle" | "loading" | "ready" | "error"
  }
}

const createContext = (): TestContext => ({
  commerce: {
    state: "loading",
    version: 0,
    orders: [],
    orderLines: [],
    customers: [],
    notes: [],
    activities: [],
    error: null as string | null,
  },
  products: { products: [] },
  returns: { rmas: [], state: "loading" },
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

describe("order data states", () => {
  it("renders loading while the commerce store initializes", () => {
    render(
      <MemoryRouter>
        <OrdersPage />
      </MemoryRouter>
    )
    expect(screen.getByText("Loading orders…")).toBeTruthy()
    expect(screen.getByLabelText("Total orders loading")).toBeTruthy()
    expect(
      screen.getByRole("heading", { name: "Orders" }).parentElement?.textContent
    ).toContain("Loading…")
  })

  it("renders repository error without a loading state", () => {
    context = {
      ...context,
      commerce: {
        ...context.commerce,
        state: "error",
        error: "read failed",
      },
    }
    render(
      <MemoryRouter>
        <OrdersPage />
      </MemoryRouter>
    )
    expect(screen.getByText("Order data is unavailable.")).toBeTruthy()
    expect(screen.queryByText("Loading orders…")).toBeNull()
    const totalCard = screen
      .getByText("Total orders")
      .closest("[data-slot='card']")
    expect(totalCard?.querySelector("strong")?.textContent).toBe("—")
    expect(
      screen.getByRole("heading", { name: "Orders" }).parentElement?.textContent
    ).not.toContain("0 orders")
  })

  it("retains historical lines when current customer and product are missing", () => {
    const seed = createCommerceSeed()
    const selectedOrder = seed.orders[0]
    const selectedLines = seed.orderLines.filter(
      ({ orderId }) => orderId === selectedOrder.id
    )
    context = {
      commerce: {
        ...seed,
        state: "ready",
        version: 1,
        error: null,
        customers: seed.customers.filter(
          ({ id }) => id !== selectedOrder.customerId
        ),
        orders: [selectedOrder],
        orderLines: selectedLines,
      },
      products: { products: [] },
      returns: { rmas: [], state: "ready" },
    }

    render(
      <MemoryRouter initialEntries={[`/orders/${selectedOrder.id}`]}>
        <Routes>
          <Route path="/orders/:orderId" element={<OrderDetailPage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByText("Customer record is unavailable.")).toBeTruthy()
    expect(
      screen.getByText("Current product unavailable; snapshot retained.")
    ).toBeTruthy()
    expect(screen.getByText("No related return.")).toBeTruthy()
    expect(screen.getByText(selectedLines[0].title)).toBeTruthy()
  })

  it("renders immutable order-line values after the current product changes", () => {
    const products = createDummyJsonProductSeed()
    const seed = createCommerceSeed(products)
    const selectedOrder = seed.orders[0]
    const selectedLines = seed.orderLines.filter(
      ({ orderId }) => orderId === selectedOrder.id
    )
    const historicalLine = selectedLines[0]
    const currentProduct = products.find(
      ({ id }) => id === historicalLine.productId
    )
    if (!currentProduct) throw new Error("Expected current product reference.")
    const changedTitle = "Current product title changed after purchase"
    context = {
      commerce: {
        ...seed,
        state: "ready",
        version: 1,
        error: null,
        orders: [selectedOrder],
        orderLines: selectedLines,
      },
      products: {
        products: [
          {
            ...currentProduct,
            title: changedTitle,
            sku: "CURRENT-SKU",
            price: {
              amount: currentProduct.price.amount + 999,
              currency: currentProduct.price.currency,
            },
          },
        ],
      },
      returns: { rmas: [], state: "ready" },
    }

    render(
      <MemoryRouter initialEntries={[`/orders/${selectedOrder.id}`]}>
        <Routes>
          <Route path="/orders/:orderId" element={<OrderDetailPage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByText(historicalLine.title)).toBeTruthy()
    expect(screen.getByText(historicalLine.sku)).toBeTruthy()
    expect(
      screen.getByText(
        new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: historicalLine.unitPrice.currency,
        }).format(historicalLine.unitPrice.amount)
      )
    ).toBeTruthy()
    expect(screen.queryByText(changedTitle)).toBeNull()
    expect(screen.queryByText("CURRENT-SKU")).toBeNull()
  })

  it("shows return relationship errors without reporting zero related RMAs", () => {
    const seed = createCommerceSeed()
    const selectedOrder = seed.orders[0]
    context = {
      commerce: {
        ...seed,
        state: "ready",
        version: 1,
        error: null,
      },
      products: { products: [] },
      returns: { rmas: [], state: "error" },
    }

    render(
      <MemoryRouter initialEntries={[`/orders/${selectedOrder.id}`]}>
        <Routes>
          <Route path="/orders/:orderId" element={<OrderDetailPage />} />
        </Routes>
      </MemoryRouter>
    )

    const relatedCard = screen
      .getAllByText("Related returns")[0]
      .closest("[data-slot='card']")
    expect(relatedCard?.querySelector("strong")?.textContent).toBe("—")
    expect(
      screen.getAllByText("Returns data is unavailable.").length
    ).toBeGreaterThanOrEqual(2)
    expect(screen.queryByText("No related return.")).toBeNull()
  })

  it.each([
    ["loading", "Loading returns…"],
    ["error", "Returns data is unavailable."],
  ] as const)(
    "shows %s ReturnStore state in an expanded order row",
    async (state, expected) => {
      const seed = createCommerceSeed()
      context = {
        commerce: {
          ...seed,
          state: "ready",
          version: 1,
          error: null,
        },
        products: { products: [] },
        returns: { rmas: [], state },
      }
      const user = userEvent.setup()
      render(
        <MemoryRouter>
          <OrdersPage />
        </MemoryRouter>
      )

      await user.click(
        (await screen.findAllByRole("button", { name: "Quick view" }))[0]
      )
      expect(screen.getByText(expected)).toBeTruthy()
      expect(screen.queryByText("No related return.")).toBeNull()
    }
  )
})
