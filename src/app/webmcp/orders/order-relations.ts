import type { Rma } from "../returns/types"

export const relatedReturnsFor = (orderId: string, rmas: readonly Rma[]) =>
  rmas.filter((rma) => rma.orderId === orderId)
