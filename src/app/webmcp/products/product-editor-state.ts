import { validateProductInput } from "./product-validation"
import type {
  Product,
  ProductImage,
  ProductSpecification,
  ProductValidationMode,
  ProductWriteInput,
} from "./types"

export type ProductEditorMode = "create" | "edit"

export type ProductEditorState = {
  mode: ProductEditorMode
  productId: number | null
  draft: ProductWriteInput
  baseline: ProductWriteInput
  dirty: boolean
  valid: boolean
  missingFields: readonly string[]
  version: number
}

const emptyProductInput = (): ProductWriteInput => ({
  sku: "",
  title: "",
  brand: null,
  category: "",
  price: { amount: 0, currency: "USD" },
  stock: 0,
  description: "",
  shortAdCopy: "",
  longAdCopy: "",
  images: [],
  specifications: [],
})

const toWriteInput = (product: Product): ProductWriteInput => ({
  sku: product.sku,
  title: product.title,
  brand: product.brand,
  category: product.category,
  price: structuredClone(product.price),
  stock: product.stock,
  description: product.description,
  shortAdCopy: product.shortAdCopy,
  longAdCopy: product.longAdCopy,
  images: structuredClone(product.images),
  specifications: structuredClone(product.specifications),
})

const normalizePositions = <T extends { position: number }>(
  items: readonly T[]
) => items.map((item, position) => ({ ...item, position }))

const assess = (
  state: Omit<ProductEditorState, "dirty" | "valid" | "missingFields">,
  validationMode: ProductValidationMode = "publish"
): ProductEditorState => {
  const issues = validateProductInput(state.draft, validationMode)
  return {
    ...state,
    dirty: JSON.stringify(state.draft) !== JSON.stringify(state.baseline),
    valid: issues.length === 0,
    missingFields: [...new Set(issues.map((issue) => issue.field))],
  }
}

export const createProductEditorState = (
  mode: ProductEditorMode,
  product?: Product
) => {
  const draft = product ? toWriteInput(product) : emptyProductInput()
  return assess({
    mode,
    productId: mode === "edit" ? (product?.id ?? null) : null,
    draft,
    baseline: structuredClone(draft),
    version: 0,
  })
}

export const replaceProductDraft = (
  state: ProductEditorState,
  draft: ProductWriteInput
) =>
  assess({
    ...state,
    draft: structuredClone(draft),
    version: state.version + 1,
  })

export const patchProductDraft = (
  state: ProductEditorState,
  patch: Partial<ProductWriteInput>
) => replaceProductDraft(state, { ...state.draft, ...patch })

export const setProductImages = (
  state: ProductEditorState,
  images: readonly ProductImage[]
) =>
  patchProductDraft(state, {
    images: normalizePositions(images).map((image, index, all) => ({
      ...image,
      isPrimary: all.some((item) => item.isPrimary)
        ? image.isPrimary
        : index === 0,
    })),
  })

export const setProductSpecifications = (
  state: ProductEditorState,
  specifications: readonly ProductSpecification[]
) =>
  patchProductDraft(state, {
    specifications: normalizePositions(specifications),
  })

export const markProductEditorSaved = (
  state: ProductEditorState,
  product: Product
) => {
  const draft = toWriteInput(product)
  return assess({
    ...state,
    mode: "edit",
    productId: product.id,
    draft,
    baseline: structuredClone(draft),
    version: state.version + 1,
  })
}
