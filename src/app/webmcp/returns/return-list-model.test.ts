import { describe, expect, it } from "vitest"
import { createCommerceSeed } from "../commerce-data/commerce-seed"
import { createReturnSeed } from "./return-seed"
import {
  createReturnListModel,
  createReturnListRows,
  type ReturnListFilters,
} from "./return-list-model"

const initial: ReturnListFilters = {
  query: "",
  status: "all",
  source: "all",
  reason: "all",
  stage: "all",
  approvalStatus: "all",
  sort: "updated-desc",
}

describe("return list model", () => {
  it("searches only operational identifiers and applies filters", () => {
    const commerce = createCommerceSeed()
    const snapshot = createReturnSeed(commerce, 3)
    const rows = createReturnListRows(
      snapshot.rmas,
      snapshot.items,
      commerce.orders
    )
    const target = rows[0]

    expect(
      createReturnListModel(
        rows,
        { ...initial, query: target.rma.orderId },
        1
      ).items.map(({ rma }) => rma.id)
    ).toContain(target.rma.id)
    expect(
      createReturnListModel(
        rows,
        { ...initial, query: target.rma.customerStatement },
        1
      ).total
    ).toBe(0)
    expect(
      createReturnListModel(
        rows,
        {
          ...initial,
          source: target.rma.source,
          reason: target.rma.reason,
          stage: target.stage,
        },
        1
      ).items.every(
        ({ rma, stage }) =>
          rma.source === target.rma.source &&
          rma.reason === target.rma.reason &&
          stage === target.stage
      )
    ).toBe(true)
  })

  it("sorts deterministically and clamps pagination", () => {
    const commerce = createCommerceSeed()
    const snapshot = createReturnSeed(commerce, 3)
    const rows = createReturnListRows(
      snapshot.rmas,
      snapshot.items,
      commerce.orders
    )
    const model = createReturnListModel(
      rows,
      { ...initial, sort: "created-desc" },
      99,
      1
    )

    expect(model.page).toBe(model.pageCount)
    expect(model.items).toHaveLength(1)
    expect(model.total).toBe(rows.length)
  })
})
