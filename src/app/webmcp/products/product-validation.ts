import {
  PRODUCT_CURRENCIES,
  type Product,
  type ProductImage,
  type ProductSpecification,
  type ProductValidationIssue,
  type ProductValidationMode,
  type ProductWriteInput,
} from "./types"

export const MAX_PRODUCT_IMAGES = 12
export const MAX_PRODUCT_SPECIFICATIONS = 50

const hasText = (value: string) => value.trim().length > 0

const isHttpsUrl = (value: string) => {
  try {
    return new URL(value).protocol === "https:"
  } catch {
    return false
  }
}

const validatePositions = (
  items: readonly { position: number }[],
  field: string,
  issues: ProductValidationIssue[]
) => {
  const positions = items.map((item) => item.position)
  if (
    positions.some((position) => !Number.isInteger(position) || position < 0) ||
    new Set(positions).size !== positions.length
  ) {
    issues.push({
      field,
      code: "INVALID_ORDER",
      message: `${field} must use unique non-negative positions.`,
    })
  }
}

const validateImages = (
  images: readonly ProductImage[],
  mode: ProductValidationMode,
  issues: ProductValidationIssue[]
) => {
  if (images.length > MAX_PRODUCT_IMAGES) {
    issues.push({
      field: "images",
      code: "TOO_MANY_ITEMS",
      message: `images cannot contain more than ${MAX_PRODUCT_IMAGES} items.`,
    })
  }
  if (mode === "publish" && images.length === 0) {
    issues.push({
      field: "images",
      code: "REQUIRED",
      message: "At least one image is required before publishing.",
    })
  }
  if (
    images.length > 0 &&
    images.filter((image) => image.isPrimary).length !== 1
  ) {
    issues.push({
      field: "images",
      code: "PRIMARY_IMAGE",
      message: "Exactly one image must be primary.",
    })
  }
  for (const image of images) {
    if (!hasText(image.id) || !isHttpsUrl(image.url)) {
      issues.push({
        field: "images",
        code: "INVALID_IMAGE",
        message: "Every image needs an ID and an HTTPS URL.",
      })
      break
    }
  }
  validatePositions(images, "images", issues)
}

const validateSpecifications = (
  specifications: readonly ProductSpecification[],
  issues: ProductValidationIssue[]
) => {
  if (specifications.length > MAX_PRODUCT_SPECIFICATIONS) {
    issues.push({
      field: "specifications",
      code: "TOO_MANY_ITEMS",
      message: `specifications cannot contain more than ${MAX_PRODUCT_SPECIFICATIONS} items.`,
    })
  }
  for (const specification of specifications) {
    if (
      !hasText(specification.id) ||
      !hasText(specification.title) ||
      !hasText(specification.value)
    ) {
      issues.push({
        field: "specifications",
        code: "INVALID_SPECIFICATION",
        message: "Every specification needs an ID, title, and value.",
      })
      break
    }
  }
  validatePositions(specifications, "specifications", issues)
}

export const validateProductInput = (
  input: ProductWriteInput,
  mode: ProductValidationMode
): readonly ProductValidationIssue[] => {
  const issues: ProductValidationIssue[] = []
  const requiredText = [
    ["sku", input.sku],
    ["title", input.title],
    ["category", input.category],
  ] as const

  for (const [field, value] of requiredText) {
    if (!hasText(value)) {
      issues.push({ field, code: "REQUIRED", message: `${field} is required.` })
    }
  }

  if (!Number.isFinite(input.price.amount) || input.price.amount < 0) {
    issues.push({
      field: "price.amount",
      code: "INVALID_NUMBER",
      message: "price.amount must be a non-negative number.",
    })
  }
  if (!PRODUCT_CURRENCIES.includes(input.price.currency)) {
    issues.push({
      field: "price.currency",
      code: "INVALID_CURRENCY",
      message: "price.currency must be USD or TWD.",
    })
  }
  if (!Number.isInteger(input.stock) || input.stock < 0) {
    issues.push({
      field: "stock",
      code: "INVALID_NUMBER",
      message: "stock must be a non-negative integer.",
    })
  }

  if (mode === "publish") {
    for (const [field, value] of [
      ["description", input.description],
      ["shortAdCopy", input.shortAdCopy],
      ["longAdCopy", input.longAdCopy],
    ] as const) {
      if (!hasText(value)) {
        issues.push({
          field,
          code: "REQUIRED",
          message: `${field} is required.`,
        })
      }
    }
  }

  validateImages(input.images, mode, issues)
  validateSpecifications(input.specifications, issues)
  return issues
}

export class ProductValidationError extends Error {
  readonly code = "PRODUCT_VALIDATION_ERROR"
  readonly issues: readonly ProductValidationIssue[]

  constructor(issues: readonly ProductValidationIssue[]) {
    super(issues[0]?.message ?? "Product validation failed.")
    this.name = "ProductValidationError"
    this.issues = issues
  }
}

export const assertValidProductInput = (
  input: ProductWriteInput,
  mode: ProductValidationMode
) => {
  const issues = validateProductInput(input, mode)
  if (issues.length > 0) throw new ProductValidationError(issues)
}

export const validateStoredProduct = (product: Product) => {
  const mode = product.status === "published" ? "publish" : "draft"
  const issues = [...validateProductInput(product, mode)]
  for (const review of product.reviews) {
    if (
      !Number.isFinite(review.rating) ||
      review.rating < 1 ||
      review.rating > 5 ||
      !hasText(review.comment) ||
      Number.isNaN(Date.parse(review.date))
    ) {
      issues.push({
        field: "reviews",
        code: "INVALID_REVIEW",
        message: "Reviews must contain only a rating, comment, and valid date.",
      })
      break
    }
  }
  return issues
}
