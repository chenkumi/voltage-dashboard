import catalog from "./data/dummyjson-products.json"

type RawProduct = {
  id: number
  title: string
  description: string
  category: string
  price: number
  discountPercentage: number
  rating: number
  stock: number
  tags?: string[]
  brand?: string
  sku?: string
  thumbnail?: string
  images?: string[]
}

type RawCatalog = { products?: unknown[] }

export type VoltageProduct = {
  id: number
  title: string
  description: string
  category: string
  price: number
  salePrice: number
  discountPercentage: number
  rating: number
  stock: number
  tags: string[]
  brand: string | null
  sku: string | null
  image: string | null
}

const isRawProduct = (value: unknown): value is RawProduct => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const product = value as Partial<RawProduct>
  return (
    typeof product.id === "number" &&
    typeof product.title === "string" &&
    typeof product.description === "string" &&
    typeof product.category === "string" &&
    typeof product.price === "number" &&
    typeof product.discountPercentage === "number" &&
    typeof product.rating === "number" &&
    typeof product.stock === "number"
  )
}

export const calculateSalePrice = (
  price: number,
  discountPercentage: number
) => {
  return Math.round(price * (1 - discountPercentage / 100) * 100) / 100
}

const normalizeProduct = (product: RawProduct): VoltageProduct => ({
  id: product.id,
  title: product.title.trim(),
  description: product.description.trim(),
  category: product.category,
  price: product.price,
  salePrice: calculateSalePrice(product.price, product.discountPercentage),
  discountPercentage: product.discountPercentage,
  rating: product.rating,
  stock: product.stock,
  tags: Array.isArray(product.tags)
    ? product.tags.filter((tag): tag is string => typeof tag === "string")
    : [],
  brand: typeof product.brand === "string" ? product.brand : null,
  sku: typeof product.sku === "string" ? product.sku : null,
  image:
    typeof product.thumbnail === "string"
      ? product.thumbnail
      : (product.images?.find(
          (image): image is string => typeof image === "string"
        ) ?? null),
})

const rawCatalog = catalog as RawCatalog

export const voltageProducts = (rawCatalog.products ?? [])
  .filter(isRawProduct)
  .map(normalizeProduct)

export const voltageProductById = new Map(
  voltageProducts.map((product) => [product.id, product])
)

export const formatVoltageCategory = (category: string) => {
  return category
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}
