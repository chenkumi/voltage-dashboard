import { describe, expect, it } from "vitest"
import { operationsCases } from "./operations-data"
import { checkReturnEligibility } from "./return-policy"
import type { OpsCase } from "./types"

const returnCase = operationsCases.find(({ id }) => id === "CASE-2004")!

describe("return policy", () => {
  it("marks the complete seeded return case eligible", () => {
    expect(checkReturnEligibility(returnCase)).toEqual({
      decision: "eligible",
      matchedRules: ["within_30_days", "unused_unopened", "not_final_sale"],
      missingEvidence: [],
    })
  })

  it("requires human review when evidence is incomplete", () => {
    const incomplete = operationsCases.find(({ id }) => id === "CASE-2005")!

    expect(checkReturnEligibility(incomplete)).toEqual({
      decision: "needs_human_review",
      matchedRules: ["policy_evidence_incomplete"],
      missingEvidence: [
        "package_opened",
        "item_condition",
        "final_sale_status",
      ],
    })
  })

  it.each([
    [{ ...returnCase.returnFacts, finalSale: true }, "final_sale_excluded"],
    [
      { ...returnCase.returnFacts, daysSinceDelivery: 31 },
      "return_window_exceeded",
    ],
    [{ ...returnCase.returnFacts, condition: "used" }, "used_item_excluded"],
  ])("marks a policy exclusion ineligible", (returnFacts, rule) => {
    expect(
      checkReturnEligibility({ ...returnCase, returnFacts } as OpsCase)
    ).toMatchObject({ decision: "ineligible", matchedRules: [rule] })
  })

  it("rejects negative timelines as missing valid evidence", () => {
    expect(
      checkReturnEligibility({
        ...returnCase,
        returnFacts: { ...returnCase.returnFacts, daysSinceDelivery: -1 },
      })
    ).toMatchObject({
      decision: "needs_human_review",
      missingEvidence: ["valid_delivery_timeline"],
    })
  })
})
