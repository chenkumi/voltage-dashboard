// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import i18n from "../../../i18n"
import { createCommerceSeed } from "../commerce-data/commerce-seed"
import type { CommerceDataSnapshot } from "../commerce-data/types"
import type { OpsCase } from "../operations/types"
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
  workflow: { cases: OpsCase[] }
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
  workflow: { cases: [] },
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
      workflow: { cases: [] },
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
    expect(screen.getByText("No related operations case.")).toBeTruthy()
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
      workflow: { cases: [] },
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
})
