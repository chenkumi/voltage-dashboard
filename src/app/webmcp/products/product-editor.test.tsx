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
import i18n from "../../../i18n"
import { ProductEditor } from "./product-editor"
import { ProductRepository } from "./product-repository"
import type { Product, ProductWriteInput } from "./types"

const product: Product = {
  id: 9,
  sku: "SKU-9",
  title: "Travel kettle",
  brand: "Northwind",
  category: "Kitchen",
  price: { amount: 49, currency: "USD" },
  stock: 8,
  description: "Compact kettle.",
  shortAdCopy: "Hot water anywhere.",
  longAdCopy: "A compact kettle designed for travel.",
  images: [
    {
      id: "image-1",
      url: "https://example.com/kettle.jpg",
      alt: "Travel kettle",
      position: 0,
      isPrimary: true,
    },
  ],
  specifications: [
    {
      id: "spec-1",
      title: "Power",
      value: "1000",
      unit: "W",
      position: 0,
    },
  ],
  status: "draft",
  archivedFromStatus: null,
  reviews: [],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
}

const renderEditor = (
  props:
    | { mode: "create"; sourceProduct?: Product }
    | { mode: "edit"; product: Product }
) => {
  const create = vi.fn(
    async (input: ProductWriteInput, status: "draft" | "published") => {
      void input
      void status
      return { ...product, id: 10 }
    }
  )
  const update = vi.fn(async () => product)
  const publish = vi.fn(async () => ({
    ...product,
    status: "published" as const,
  }))
  const archiveMany = vi.fn(async () => [
    { ...product, status: "archived" as const },
  ])
  const restore = vi.fn(async () => ({ ...product, status: "draft" as const }))
  const router = createMemoryRouter(
    [
      {
        path: "*",
        element: (
          <ProductEditor
            {...props}
            repository={{ create, update, publish, archiveMany, restore }}
          />
        ),
      },
    ],
    {
      initialEntries: [
        props.mode === "edit"
          ? `/products/edit/${product.id}`
          : "/products/add",
      ],
    }
  )
  render(<RouterProvider router={router} />)
  return { archiveMany, create, publish, restore, router, update }
}

beforeEach(async () => {
  await i18n.changeLanguage("en")
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("ProductEditor", () => {
  it("keeps field edits local until the user presses save draft", async () => {
    const user = userEvent.setup()
    const repository = renderEditor({ mode: "create" })

    await user.type(screen.getByRole("textbox", { name: /SKU/ }), "NEW-1")
    await user.type(screen.getByRole("textbox", { name: /Title/ }), "New mug")
    await user.type(
      screen.getByRole("textbox", { name: /Category/ }),
      "Kitchen"
    )

    expect(repository.create).not.toHaveBeenCalled()
    expect(screen.getByText("Unsaved changes")).toBeTruthy()

    await user.click(screen.getByRole("button", { name: "Save draft" }))
    await waitFor(() => expect(repository.create).toHaveBeenCalledTimes(1))
    expect(repository.create.mock.calls[0]?.[1]).toBe("draft")
  })

  it("requires publish fields and supports dynamic specifications and images", async () => {
    const user = userEvent.setup()
    renderEditor({ mode: "create" })
    const publish = screen.getByRole("button", { name: "Publish product" })
    expect((publish as HTMLButtonElement).disabled).toBe(true)

    await user.type(screen.getByRole("textbox", { name: /SKU/ }), "NEW-2")
    await user.type(
      screen.getByRole("textbox", { name: /Title/ }),
      "Travel cup"
    )
    await user.type(
      screen.getByRole("textbox", { name: /Category/ }),
      "Kitchen"
    )
    await user.type(
      screen.getByRole("textbox", { name: /Description/ }),
      "A durable cup."
    )
    await user.type(
      screen.getByRole("textbox", { name: /Short advertising copy/ }),
      "Travel light."
    )
    await user.type(
      screen.getByRole("textbox", { name: /Long advertising copy/ }),
      "A durable travel cup for everyday use."
    )
    await user.click(screen.getByRole("button", { name: "Add image" }))
    await user.type(
      screen.getByRole("textbox", { name: "Image URL 1" }),
      "https://example.com/cup.jpg"
    )
    await user.click(screen.getByRole("button", { name: "Add specification" }))
    await user.type(
      screen.getByRole("textbox", { name: "Specification title 1" }),
      "Capacity"
    )
    const specificationRow = screen
      .getByRole("textbox", { name: "Specification title 1" })
      .closest<HTMLElement>(".product-editor-spec-row")!
    await user.type(within(specificationRow).getByLabelText("Value"), "500")
    await user.type(within(specificationRow).getByLabelText("Unit"), "ml")

    expect((publish as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByText("Ready to publish")).toBeTruthy()
    expect(screen.getByText("500 ml")).toBeTruthy()
  })

  it("reorders and removes flexible specification rows", async () => {
    const user = userEvent.setup()
    renderEditor({ mode: "edit", product })
    await user.click(screen.getByRole("button", { name: "Add specification" }))
    await user.type(
      screen.getByRole("textbox", { name: "Specification title 2" }),
      "Weight"
    )
    await user.click(
      screen.getAllByRole("button", { name: "Move specification up" })[1]!
    )
    expect(
      (
        screen.getByRole("textbox", {
          name: "Specification title 1",
        }) as HTMLInputElement
      ).value
    ).toBe("Weight")
    await user.click(
      screen.getAllByRole("button", { name: "Remove specification" })[0]!
    )
    expect(screen.queryByDisplayValue("Weight")).toBeNull()
  })

  it("warns only when cancelling with unsaved changes", async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false)
    renderEditor({ mode: "edit", product })

    await user.click(screen.getByRole("button", { name: "Cancel" }))
    expect(confirm).not.toHaveBeenCalled()

    await user.clear(screen.getByRole("textbox", { name: /Title/ }))
    await user.type(screen.getByRole("textbox", { name: /Title/ }), "Changed")
    await user.click(screen.getByRole("button", { name: "Cancel" }))
    expect(confirm).toHaveBeenCalledWith("Discard unsaved changes?")
  })

  it("blocks breadcrumb navigation while changes are unsaved", async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false)
    const { router } = renderEditor({ mode: "create" })
    await user.type(screen.getByRole("textbox", { name: /SKU/ }), "DIRTY")

    await user.click(screen.getByRole("link", { name: "Products" }))

    expect(confirm).toHaveBeenCalledWith("Discard unsaved changes?")
    expect(router.state.location.pathname).toBe("/products/add")
  })

  it("offers archive and restore as direct edit-page actions", async () => {
    const user = userEvent.setup()
    const active = renderEditor({ mode: "edit", product })
    await user.click(screen.getByRole("button", { name: "Archive" }))
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Archive",
      })
    )
    await waitFor(() => expect(active.archiveMany).toHaveBeenCalledWith([9]))
    cleanup()

    const archivedProduct = { ...product, status: "archived" as const }
    const archived = renderEditor({ mode: "edit", product: archivedProduct })
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull()
    await user.click(screen.getByRole("button", { name: "Restore" }))
    await waitFor(() => expect(archived.restore).toHaveBeenCalledWith(9))
  })

  it("prevents archive from discarding unsaved edits", async () => {
    const user = userEvent.setup()
    const repository = renderEditor({ mode: "edit", product })
    const archive = screen.getByRole("button", { name: "Archive" })
    await user.clear(screen.getByRole("textbox", { name: /Title/ }))
    await user.type(screen.getByRole("textbox", { name: /Title/ }), "Unsaved")

    expect((archive as HTMLButtonElement).disabled).toBe(true)
    expect(archive.getAttribute("title")).toBe("Save changes before archiving.")
    await user.click(archive)
    expect(repository.archiveMany).not.toHaveBeenCalled()
  })

  it("retries an image preview after its URL is corrected", async () => {
    const user = userEvent.setup()
    renderEditor({ mode: "edit", product })
    const url = screen.getByRole("textbox", { name: "Image URL 1" })
    const row = url.closest<HTMLElement>(".product-editor-image-row")!
    const image = row.querySelector("img")!
    image.dispatchEvent(new Event("error"))
    await waitFor(() => expect(row.querySelector("img")).toBeNull())

    await user.clear(url)
    await user.type(url, "https://example.com/fixed.jpg")
    await waitFor(() =>
      expect(row.querySelector("img")?.getAttribute("src")).toBe(
        "https://example.com/fixed.jpg"
      )
    )
  })

  it("updates and publishes an existing draft only from page buttons", async () => {
    const user = userEvent.setup()
    const repository = renderEditor({ mode: "edit", product })
    await user.clear(screen.getByRole("textbox", { name: /Title/ }))
    await user.type(
      screen.getByRole("textbox", { name: /Title/ }),
      "Updated kettle"
    )
    expect(repository.update).not.toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: "Publish product" }))
    await waitFor(() => expect(repository.update).toHaveBeenCalledTimes(1))
    expect(repository.publish).toHaveBeenCalledWith(9)
  })

  it("persists a submitted editor draft across repository reload", async () => {
    const databaseName = `product-editor-integration-${crypto.randomUUID()}`
    const repository = new ProductRepository({ databaseName, seed: [] })
    const router = createMemoryRouter(
      [
        {
          path: "*",
          element: <ProductEditor mode="create" repository={repository} />,
        },
      ],
      { initialEntries: ["/products/add"] }
    )
    render(<RouterProvider router={router} />)
    const user = userEvent.setup()
    await user.type(screen.getByRole("textbox", { name: /SKU/ }), "RELOAD-1")
    await user.type(
      screen.getByRole("textbox", { name: /Title/ }),
      "Reload-safe product"
    )
    await user.type(
      screen.getByRole("textbox", { name: /Category/ }),
      "Integration"
    )
    await user.click(screen.getByRole("button", { name: "Save draft" }))
    await waitFor(async () =>
      expect((await repository.getBySku("RELOAD-1"))?.title).toBe(
        "Reload-safe product"
      )
    )
    repository.close()

    const reloaded = new ProductRepository({ databaseName, seed: [] })
    await reloaded.initialize()
    expect((await reloaded.getBySku("RELOAD-1"))?.title).toBe(
      "Reload-safe product"
    )
    await reloaded.deleteDatabaseForTests()
  })
})
