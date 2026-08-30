import { describe, expect, it } from "vitest"
import { createCommerceSeed } from "../commerce-data/commerce-seed"
import { operationsCases } from "../operations/operations-data"
import { CASE_ORDER_LINKS, relatedCasesFor } from "./order-relations"

describe("order operations-case relations", () => {
  it("only links existing demonstration orders and cases", () => {
    const orderIds = new Set(
      createCommerceSeed().orders.map((order) => order.id)
    )
    const caseIds = new Set(operationsCases.map((item) => item.id))

    expect(Object.keys(CASE_ORDER_LINKS).every((id) => caseIds.has(id))).toBe(
      true
    )
    expect(
      Object.values(CASE_ORDER_LINKS).every((id) => orderIds.has(id))
    ).toBe(true)
    expect(
      relatedCasesFor("VM-25065", operationsCases).map(({ id }) => id)
    ).toEqual(["CASE-2002", "CASE-2003"])
  })
})
