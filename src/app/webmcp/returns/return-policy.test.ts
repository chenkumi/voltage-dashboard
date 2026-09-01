import { describe, expect, it } from "vitest"
import { checkReturnEligibility } from "./return-policy"

describe("return policy", () => {
  it("authorizes an in-window defect and refunds original shipping", () => {
    expect(
      checkReturnEligibility({
        reason: "defective",
        daysSinceDelivery: 8,
        packageOpened: true,
        condition: "damaged",
        finalSale: false,
      })
    ).toEqual({
      decision: "eligible",
      matchedRules: ["within_30_days", "not_final_sale"],
      missingEvidence: [],
      shippingRefundEligible: true,
    })
  })

  it("does not refund shipping for changed mind", () => {
    expect(
      checkReturnEligibility({
        reason: "changed_mind",
        daysSinceDelivery: 5,
        packageOpened: false,
        condition: "unused",
        finalSale: false,
      }).shippingRefundEligible
    ).toBe(false)
  })

  it("requires complete evidence and rejects final sale or expired returns", () => {
    expect(checkReturnEligibility({ reason: "wrong_item" }).decision).toBe(
      "needs_information"
    )
    expect(
      checkReturnEligibility({
        reason: "wrong_item",
        daysSinceDelivery: 2,
        packageOpened: true,
        condition: "unused",
        finalSale: true,
      }).decision
    ).toBe("ineligible")
    expect(
      checkReturnEligibility({
        reason: "defective",
        daysSinceDelivery: 31,
        packageOpened: true,
        condition: "damaged",
        finalSale: false,
      }).matchedRules
    ).toEqual(["return_window_exceeded"])
  })
})
