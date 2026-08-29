export const PRODUCT_CURRENCIES = ["USD", "TWD"] as const

export type ProductCurrency = (typeof PRODUCT_CURRENCIES)[number]

export const PRODUCT_STATUSES = ["draft", "published", "archived"] as const

export type ProductStatus = (typeof PRODUCT_STATUSES)[number]
export type ActiveProductStatus = Exclude<ProductStatus, "archived">

export type ProductPrice = {
  amount: number
  currency: ProductCurrency
}

export type ProductImage = {
  id: string
  url: string
  alt: string
  position: number
  isPrimary: boolean
}

export type ProductSpecification = {
  id: string
  title: string
  value: string
  unit: string
  position: number
}

export type ProductReview = {
  rating: number
  comment: string
  date: string
}

export type ProductWriteInput = {
  sku: string
  title: string
  brand: string | null
  category: string
  price: ProductPrice
  stock: number
  description: string
  shortAdCopy: string
  longAdCopy: string
  images: readonly ProductImage[]
  specifications: readonly ProductSpecification[]
}

export type Product = ProductWriteInput & {
  id: number
  status: ProductStatus
  archivedFromStatus: ActiveProductStatus | null
  reviews: readonly ProductReview[]
  createdAt: string
  updatedAt: string
}

export type ProductValidationMode = "draft" | "publish"

export type ProductValidationIssue = {
  field: string
  code: string
  message: string
}

export type ProductMutation = {
  type: "initialize" | "create" | "update" | "publish" | "archive" | "restore"
  productId?: number
  version: number
}
