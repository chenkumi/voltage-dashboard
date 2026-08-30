// @vitest-environment jsdom

import { act } from "react"
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import i18n from "../../../i18n"
import { ProductDetailContent } from "./product-detail-page"
import { ProductListContent } from "./product-list-page"
import type { ProductStoreSnapshot } from "./product-store"
import type { Product } from "./types"

const product = (id: number, overrides: Partial<Product> = {}): Product => ({
  id,
  sku: `SKU-${id}`,
  title: `Product ${id}`,
  brand: "Voltage",
  category: id % 2 === 0 ? "electronics" : "groceries",
  price: { amount: 99.5, currency: "USD" },
  stock: 20,
  status: "published",
  archivedFromStatus: null,
  description: "Plain product description",
  shortAdCopy: "Short campaign copy",
  longAdCopy: "Long campaign copy",
  images: [
    {
      id: `image-${id}`,
      url: `https://example.com/${id}.webp`,
      alt: `Product ${id}`,
      position: 0,
      isPrimary: true,
    },
  ],
  specifications: [
    {
      id: `spec-${id}`,
      title: "Capacity",
      value: "500",
      unit: "ml",
      position: 0,
    },
  ],
  reviews: [
    {
      rating: 4,
      comment: "<b>Useful</b> without reviewer identity",
      date: "2026-08-01",
    },
  ],
  createdAt: "2026-08-29T00:00:00.000Z",
  updatedAt: "2026-08-29T00:00:00.000Z",
  ...overrides,
})

const snapshot = (products: readonly Product[]): ProductStoreSnapshot => ({
  state: "ready",
  products,
  version: 1,
  error: null,
})

const renderList = (
  products: readonly Product[],
  archiveMany = vi.fn(async () => [])
) => {
  render(
    <MemoryRouter>
      <ProductListContent
        snapshot={snapshot(products)}
        repository={{ archiveMany } as never}
      />
    </MemoryRouter>
  )
  return { archiveMany }
}

beforeEach(async () => {
  await i18n.changeLanguage("en")
})

afterEach(() => cleanup())

describe("product list page", () => {
  it("shows a loading state while the repository initializes", () => {
    render(
      <MemoryRouter>
        <ProductListContent
          snapshot={{ state: "loading", products: [], version: 0, error: null }}
          repository={{ archiveMany: vi.fn() } as never}
        />
      </MemoryRouter>
    )

    expect(screen.getByRole("status").textContent).toContain("Loading products")
  })

  it("distinguishes an empty catalog from filtered no-results", () => {
    renderList([])

    expect(screen.getByText("No products yet")).toBeTruthy()
  })

  it("shows repository failures as an alert", () => {
    render(
      <MemoryRouter>
        <ProductListContent
          snapshot={{
            state: "error",
            products: [],
            version: 0,
            error: "Product data is unavailable.",
          }}
          repository={{ archiveMany: vi.fn() } as never}
        />
      </MemoryRouter>
    )

    expect(screen.getByRole("alert").textContent).toContain(
      "Product data is unavailable"
    )
  })

  it("links every product name to its detail page and exposes row actions", () => {
    renderList([product(12, { title: "Ceramic Travel Mug" })])

    expect(
      screen
        .getByRole("link", { name: "Ceramic Travel Mug" })
        .getAttribute("href")
    ).toBe("/products/12")
    expect(
      screen.getByRole("button", { name: "Edit Ceramic Travel Mug" })
    ).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "Duplicate Ceramic Travel Mug" })
    ).toBeTruthy()
  })

  it("filters products and shows a specific no-results state", async () => {
    const user = userEvent.setup()
    renderList([product(1), product(2)])

    await user.type(
      screen.getByRole("searchbox", { name: "Search products" }),
      "missing"
    )

    expect(screen.getByText("No matching products")).toBeTruthy()
  })

  it("moves to the next page without losing accessible product links", async () => {
    const user = userEvent.setup()
    renderList(Array.from({ length: 16 }, (_, index) => product(index + 1)))

    expect(screen.queryByRole("link", { name: "Product 16" })).toBeNull()
    await user.click(screen.getByRole("button", { name: "Next page" }))

    expect(screen.getByRole("link", { name: "Product 16" })).toBeTruthy()
  })

  it("requires confirmation before archiving a product", async () => {
    const user = userEvent.setup()
    const { archiveMany } = renderList([product(12)])

    await user.click(screen.getByRole("button", { name: "Archive Product 12" }))
    const dialog = screen.getByRole("alertdialog", { name: "Archive product?" })
    expect(archiveMany).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole("button", { name: "Archive" }))

    await waitFor(() => expect(archiveMany).toHaveBeenCalledWith([12]))
  })

  it("archives selected products as one confirmed batch", async () => {
    const user = userEvent.setup()
    const { archiveMany } = renderList([product(12), product(13)])

    await user.click(
      screen.getByRole("checkbox", { name: "Select Product 12" })
    )
    await user.click(
      screen.getByRole("checkbox", { name: "Select Product 13" })
    )
    await user.click(
      screen.getByRole("button", { name: "Archive selected (2)" })
    )
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Archive",
      })
    )

    await waitFor(() => expect(archiveMany).toHaveBeenCalledWith([12, 13]))
  })

  it("clears selected products when filters change", async () => {
    const user = userEvent.setup()
    renderList([product(1), product(2)])

    await user.click(screen.getByRole("checkbox", { name: "Select Product 1" }))
    expect(
      screen.getByRole("button", { name: "Archive selected (1)" })
    ).toBeTruthy()
    await user.click(screen.getByRole("combobox", { name: "Category" }))
    await user.click(screen.getByRole("option", { name: "electronics" }))

    expect(
      screen.queryByRole("button", { name: "Archive selected (1)" })
    ).toBeNull()
  })

  it("applies product sorting from More and resets pagination", async () => {
    const user = userEvent.setup()
    const products = Array.from({ length: 16 }, (_, index) =>
      product(index + 1, {
        price: { amount: index + 1, currency: "USD" },
        updatedAt: new Date(Date.UTC(2026, 7, index + 1)).toISOString(),
      })
    )
    renderList(products)

    await user.click(screen.getByRole("button", { name: "Next page" }))
    expect(screen.getByText("Showing 16–16 / 16")).toBeTruthy()

    await user.click(screen.getByRole("button", { name: "More filters" }))
    await user.click(screen.getByRole("combobox", { name: "Sort" }))
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{Enter}")
    await user.click(screen.getByRole("button", { name: "Apply" }))

    expect(screen.getByText("Showing 1–15 / 16")).toBeTruthy()
    expect(screen.getByRole("link", { name: "Product 16" })).toBeTruthy()
    expect(
      screen.getByRole("button", {
        name: "Sort: Price high–low by currency remove",
      })
    ).toBeTruthy()
  })

  it("applies every mobile filter and clears the active set", async () => {
    const user = userEvent.setup()
    renderList([
      product(1, { status: "draft", stock: 4 }),
      product(2, { status: "published", stock: 20 }),
    ])

    await user.click(screen.getByRole("button", { name: "Filter products" }))
    const popover = document.querySelector<HTMLElement>(
      '[data-slot="popover-content"]'
    )
    expect(popover).toBeTruthy()

    await user.click(
      within(popover!).getByRole("combobox", { name: "Category" })
    )
    await user.keyboard("e{Enter}")
    await user.click(within(popover!).getByRole("combobox", { name: "Status" }))
    await user.keyboard("{ArrowDown}{Enter}")
    await user.click(within(popover!).getByRole("combobox", { name: "Stock" }))
    await user.keyboard("{ArrowDown}{Enter}")
    await user.click(within(popover!).getByRole("combobox", { name: "Sort" }))
    await user.keyboard("{ArrowDown}{Enter}")
    await user.click(within(popover!).getByRole("button", { name: "Apply" }))

    expect(screen.getByRole("link", { name: "Product 2" })).toBeTruthy()
    expect(screen.queryByRole("link", { name: "Product 1" })).toBeNull()
    for (const name of [
      "Category: electronics remove",
      "Status: Published remove",
      "Stock: In stock remove",
      "Sort: Name A–Z remove",
    ]) {
      expect(screen.getByRole("button", { name })).toBeTruthy()
    }

    await user.click(screen.getByRole("button", { name: "Clear all" }))
    expect(screen.getByRole("link", { name: "Product 1" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "Product 2" })).toBeTruthy()
    expect(
      screen.queryByRole("button", { name: "Category: electronics remove" })
    ).toBeNull()
  })

  it("removes active filter chips and restores the default result set", async () => {
    const user = userEvent.setup()
    renderList([product(1), product(2)])

    await user.type(
      screen.getByRole("searchbox", { name: "Search products" }),
      "Product 1"
    )
    expect(screen.getByText("Search: Product 1")).toBeTruthy()
    await user.click(
      screen.getByRole("button", { name: "Search: Product 1 remove" })
    )

    expect(screen.getByRole("link", { name: "Product 2" })).toBeTruthy()
    expect(screen.queryByText("Search: Product 1")).toBeNull()
  })

  it("announces archive failures inside the open confirmation dialog", async () => {
    const user = userEvent.setup()
    renderList(
      [product(12)],
      vi.fn(async () => Promise.reject(new Error("database unavailable")))
    )

    await user.click(screen.getByRole("button", { name: "Archive Product 12" }))
    const dialog = screen.getByRole("alertdialog")
    await user.click(within(dialog).getByRole("button", { name: "Archive" }))

    await waitFor(() =>
      expect(within(dialog).getByRole("alert").textContent).toContain(
        "Products could not be archived"
      )
    )
  })

  it("moves focus to an in-dialog status while archiving", async () => {
    const user = userEvent.setup()
    let completeArchive: ((value: never[]) => void) | undefined
    renderList(
      [product(12)],
      vi.fn(
        () =>
          new Promise<never[]>((resolve) => {
            completeArchive = resolve
          })
      )
    )

    await user.click(screen.getByRole("button", { name: "Archive Product 12" }))
    const dialog = screen.getByRole("alertdialog")
    await user.click(within(dialog).getByRole("button", { name: "Archive" }))
    const status = within(dialog).getByRole("status")

    expect(document.activeElement).toBe(status)
    await act(async () => completeArchive?.([]))
  })
})

describe("product detail page", () => {
  it("preserves a product title instead of translating catalog data", async () => {
    await i18n.changeLanguage("zh-TW")
    render(
      <MemoryRouter>
        <ProductDetailContent
          product={product(12, { title: "Product" })}
          repository={{ archiveMany: vi.fn(), restore: vi.fn() } as never}
        />
      </MemoryRouter>
    )

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Product"
    )
  })

  it("renders content, specifications, advertising copy, and anonymous reviews", () => {
    const current = product(12, { title: "Ceramic Travel Mug" })
    render(
      <MemoryRouter>
        <ProductDetailContent
          product={current}
          repository={{ archiveMany: vi.fn(), restore: vi.fn() } as never}
        />
      </MemoryRouter>
    )

    expect(
      screen.getByRole("heading", { name: "Product content" })
    ).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Specifications" })).toBeTruthy()
    expect(
      screen.getByRole("heading", { name: "Short advertising copy" })
    ).toBeTruthy()
    expect(
      screen.getByRole("heading", { name: "Long advertising copy" })
    ).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Reviews" })).toBeTruthy()
    expect(
      screen.getByText("<b>Useful</b> without reviewer identity")
    ).toBeTruthy()
    expect(document.querySelector(".product-review-list b")).toBeNull()
    expect(document.body.textContent).not.toContain("reviewer@example.com")
  })

  it("offers restore instead of archive for an archived product", () => {
    render(
      <MemoryRouter>
        <ProductDetailContent
          product={product(12, {
            status: "archived",
            archivedFromStatus: "published",
          })}
          repository={{ archiveMany: vi.fn(), restore: vi.fn() } as never}
        />
      </MemoryRouter>
    )

    expect(screen.getByRole("button", { name: "Restore" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Archive" })).toBeNull()
  })
})
