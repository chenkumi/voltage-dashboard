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

export type VoltageCartLine = { productId: number; quantity: number }

export type VoltageCartItem = {
  product: VoltageProduct
  quantity: number
  lineTotal: number
}

export type VoltageCartSummary = {
  itemCount: number
  subtotal: number
  shipping: number
  total: number
}

export type VoltageFilters = {
  query: string
  category: string
  maxPrice: string
  sort: "featured" | "price-asc" | "price-desc" | "rating"
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

export const voltageCategories = Array.from(
  new Set(voltageProducts.map((product) => product.category))
).sort((left, right) => left.localeCompare(right))

export const formatVoltageCategory = (category: string) => {
  return category
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export const productMatchesVoltageFilters = (
  product: VoltageProduct,
  filters: VoltageFilters
) => {
  const query = filters.query.trim().toLocaleLowerCase()
  const searchText = [
    product.title,
    product.description,
    product.category,
    product.brand,
    ...product.tags,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase()
  const maxPrice = Number(filters.maxPrice)

  return (
    (!query || searchText.includes(query)) &&
    (filters.category === "all" || product.category === filters.category) &&
    (!filters.maxPrice ||
      (Number.isFinite(maxPrice) && product.salePrice <= maxPrice))
  )
}

export const sortVoltageProducts = (
  products: VoltageProduct[],
  sort: VoltageFilters["sort"]
) => {
  return [...products].sort((left, right) => {
    if (sort === "price-asc") return left.salePrice - right.salePrice
    if (sort === "price-desc") return right.salePrice - left.salePrice
    if (sort === "rating") return right.rating - left.rating
    return (
      right.discountPercentage - left.discountPercentage ||
      right.rating - left.rating
    )
  })
}

export const getVoltageCartItems = (lines: VoltageCartLine[]) => {
  return lines.flatMap((line): VoltageCartItem[] => {
    const product = voltageProductById.get(line.productId)
    const quantity = Math.floor(line.quantity)
    if (!product || !Number.isFinite(quantity) || quantity < 1) return []

    return [
      {
        product,
        quantity,
        lineTotal: Math.round(product.salePrice * quantity * 100) / 100,
      },
    ]
  })
}

export const getVoltageCartSummary = (
  cartItems: VoltageCartItem[]
): VoltageCartSummary => {
  const itemCount = cartItems.reduce((count, item) => count + item.quantity, 0)
  const subtotal =
    Math.round(
      cartItems.reduce((total, item) => total + item.lineTotal, 0) * 100
    ) / 100
  const shipping = subtotal === 0 || subtotal >= 75 ? 0 : 9.9

  return {
    itemCount,
    subtotal,
    shipping,
    total: Math.round((subtotal + shipping) * 100) / 100,
  }
}
