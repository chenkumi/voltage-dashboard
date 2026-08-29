import catalog from "../data/dummyjson-products.json"
import type {
  Product,
  ProductImage,
  ProductReview,
  ProductSpecification,
} from "./types"

type RawReview = {
  rating: number
  comment: string
  date: string
}

type RawProduct = {
  id: number
  title: string
  description: string
  category: string
  price: number
  stock: number
  brand?: string
  sku?: string
  weight?: number
  dimensions?: { width?: number; height?: number; depth?: number }
  warrantyInformation?: string
  shippingInformation?: string
  returnPolicy?: string
  thumbnail?: string
  images?: string[]
  reviews?: RawReview[]
}

type RawCatalog = { products?: unknown[] }
type SeedRawProduct = RawProduct & { id: number; sku: string }

export const DUMMYJSON_PRODUCTS_SOURCE = "https://dummyjson.com/products"
const SEED_TIMESTAMP = "2026-08-29T00:00:00.000Z"

const isRawProduct = (value: unknown): value is SeedRawProduct => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const product = value as Partial<RawProduct>
  return (
    Number.isInteger(product.id) &&
    typeof product.title === "string" &&
    typeof product.description === "string" &&
    typeof product.category === "string" &&
    typeof product.price === "number" &&
    Number.isInteger(product.stock) &&
    typeof product.sku === "string"
  )
}

const createImages = (product: RawProduct): ProductImage[] => {
  const urls = (product.images ?? []).filter(
    (url): url is string =>
      typeof url === "string" && url.startsWith("https://")
  )
  if (
    urls.length === 0 &&
    typeof product.thumbnail === "string" &&
    product.thumbnail.startsWith("https://")
  ) {
    urls.push(product.thumbnail)
  }
  return urls.map((url, position) => ({
    id: `seed-${product.id}-image-${position + 1}`,
    url,
    alt: product.title.trim(),
    position,
    isPrimary: position === 0,
  }))
}

const createSpecifications = (product: RawProduct) => {
  const values: Array<[string, string, string]> = []
  if (typeof product.weight === "number") {
    values.push(["Weight", String(product.weight), ""])
  }
  for (const [key, title] of [
    ["width", "Width"],
    ["height", "Height"],
    ["depth", "Depth"],
  ] as const) {
    const value = product.dimensions?.[key]
    if (typeof value === "number") values.push([title, String(value), ""])
  }
  for (const [title, value] of [
    ["Warranty", product.warrantyInformation],
    ["Shipping", product.shippingInformation],
    ["Return policy", product.returnPolicy],
  ] as const) {
    if (typeof value === "string" && value.trim()) {
      values.push([title, value.trim(), ""])
    }
  }
  return values.map<ProductSpecification>(([title, value, unit], position) => ({
    id: `seed-${product.id}-spec-${position + 1}`,
    title,
    value,
    unit,
    position,
  }))
}

const createReviews = (product: RawProduct): ProductReview[] =>
  (product.reviews ?? []).flatMap((review) => {
    if (
      typeof review.rating !== "number" ||
      typeof review.comment !== "string" ||
      typeof review.date !== "string"
    ) {
      return []
    }
    return [
      {
        rating: review.rating,
        comment: review.comment.trim(),
        date: review.date,
      },
    ]
  })

const createShortCopy = (description: string) => {
  const normalized = description.trim()
  if (normalized.length <= 120) return normalized
  return `${normalized.slice(0, 117).trimEnd()}...`
}

export const createDummyJsonProductSeed = (): readonly Product[] => {
  const rawCatalog = catalog as RawCatalog
  return (rawCatalog.products ?? []).filter(isRawProduct).map((product) => ({
    id: product.id,
    sku: product.sku.trim(),
    title: product.title.trim(),
    brand:
      typeof product.brand === "string" && product.brand.trim()
        ? product.brand.trim()
        : null,
    category: product.category.trim(),
    price: { amount: product.price, currency: "USD" },
    stock: product.stock,
    status: "published",
    archivedFromStatus: null,
    description: product.description.trim(),
    shortAdCopy: createShortCopy(product.description),
    longAdCopy: product.description.trim(),
    images: createImages(product),
    specifications: createSpecifications(product),
    reviews: createReviews(product),
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  }))
}
