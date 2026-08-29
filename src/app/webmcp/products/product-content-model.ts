import type { Product, ProductWriteInput } from "./types"

export const createProductContentModel = (
  product: ProductWriteInput | Product
) => {
  const images = [...product.images].sort(
    (left, right) => left.position - right.position
  )
  return {
    title: product.title,
    description: product.description,
    shortAdCopy: product.shortAdCopy,
    longAdCopy: product.longAdCopy,
    images,
    primaryImage: images.find((image) => image.isPrimary) ?? images[0] ?? null,
    specifications: [...product.specifications].sort(
      (left, right) => left.position - right.position
    ),
    reviews: "reviews" in product ? product.reviews : [],
  }
}
