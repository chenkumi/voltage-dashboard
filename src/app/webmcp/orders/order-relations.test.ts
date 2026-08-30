import { describe, expect, it } from "vitest"
import { createCommerceSeed } from "../commerce-data/commerce-seed"
import { createReturnSeed } from "../returns/return-seed"
import { relatedReturnsFor } from "./order-relations"

describe("order return relations", () => {
  it("links RMAs directly through the authoritative order ID", () => {
    const commerce = createCommerceSeed()
    const snapshot = createReturnSeed(commerce, 3)
    const target = snapshot.rmas[0]

    expect(
      relatedReturnsFor(target.orderId, snapshot.rmas).map(({ id }) => id)
    ).toEqual([target.id])
    expect(relatedReturnsFor("VM-99999", snapshot.rmas)).toEqual([])
  })
})
