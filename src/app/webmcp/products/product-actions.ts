import type { ProductRepository } from "./product-repository"

export const archiveProducts = async ({
  productIds,
  repository,
  onComplete,
  onError,
}: {
  productIds: readonly number[]
  repository: Pick<ProductRepository, "archiveMany">
  onComplete: () => void
  onError: (error: unknown) => void
}) => {
  try {
    await repository.archiveMany(productIds)
    onComplete()
  } catch (error) {
    onError(error)
  }
}

export const restoreProduct = async ({
  productId,
  repository,
  onComplete,
  onError,
}: {
  productId: number
  repository: Pick<ProductRepository, "restore">
  onComplete: () => void
  onError: (error: unknown) => void
}) => {
  try {
    await repository.restore(productId)
    onComplete()
  } catch (error) {
    onError(error)
  }
}
