import { describe, expect, it } from "vitest"
import {
  createProductEditorState,
  markProductEditorSaved,
  patchProductDraft,
  setProductImages,
  setProductSpecifications,
} from "./product-editor-state"
import type { Product } from "./types"

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
  specifications: [],
  status: "draft",
  archivedFromStatus: null,
  reviews: [],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
}

describe("product editor state", () => {
  it("creates an incomplete clean create draft", () => {
    const state = createProductEditorState("create")
    expect(state.dirty).toBe(false)
    expect(state.valid).toBe(false)
    expect(state.missingFields).toContain("sku")
    expect(state.version).toBe(0)
  })

  it("keeps a copied create draft detached from the source product ID", () => {
    const state = createProductEditorState("create", product)
    expect(state.productId).toBeNull()
    expect(state.mode).toBe("create")
  })

  it("tracks edits, validation, and version without persisting", () => {
    const initial = createProductEditorState("edit", product)
    const edited = patchProductDraft(initial, { title: "Updated kettle" })
    expect(edited.dirty).toBe(true)
    expect(edited.valid).toBe(true)
    expect(edited.version).toBe(1)
    expect(initial.draft.title).toBe("Travel kettle")
  })

  it("normalizes specification order", () => {
    const state = setProductSpecifications(createProductEditorState("create"), [
      { id: "b", title: "Power", value: "1000", unit: "W", position: 7 },
      { id: "a", title: "Weight", value: "0.8", unit: "kg", position: 3 },
    ])
    expect(state.draft.specifications.map(({ position }) => position)).toEqual([
      0, 1,
    ])
  })

  it("normalizes image order and assigns a primary image", () => {
    const state = setProductImages(createProductEditorState("create"), [
      {
        id: "image-2",
        url: "https://example.com/2.jpg",
        alt: "Second",
        position: 8,
        isPrimary: false,
      },
    ])
    expect(state.draft.images[0]).toMatchObject({
      position: 0,
      isPrimary: true,
    })
  })

  it("resets dirty state after a repository save", () => {
    const edited = patchProductDraft(
      createProductEditorState("edit", product),
      {
        title: "Updated kettle",
      }
    )
    const saved = markProductEditorSaved(edited, {
      ...product,
      title: "Updated kettle",
    })
    expect(saved.dirty).toBe(false)
    expect(saved.productId).toBe(9)
    expect(saved.version).toBe(2)
  })
})
