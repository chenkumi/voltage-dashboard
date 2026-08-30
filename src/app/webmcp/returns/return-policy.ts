import type { EligibilityResult, ReturnReason } from "./types"

export const RETURN_POLICY_VERSION = "2026-08-rma-v1"

export type ReturnEligibilityFacts = {
  reason: ReturnReason
  daysSinceDelivery?: number
  packageOpened?: boolean
  condition?: "unused" | "used" | "damaged"
  finalSale?: boolean
}

const shippingRefundReasons = new Set<ReturnReason>([
  "defective",
  "damaged",
  "wrong_item",
  "missing_parts",
])

const needsInformation = (
  missingEvidence: readonly string[],
  reason: ReturnReason
): EligibilityResult => ({
  decision: "needs_information",
  matchedRules: ["policy_evidence_incomplete"],
  missingEvidence,
  shippingRefundEligible: shippingRefundReasons.has(reason),
})

export const checkReturnEligibility = (
  facts: ReturnEligibilityFacts
): EligibilityResult => {
  const missingEvidence = [
    facts.daysSinceDelivery === undefined ? "days_since_delivery" : null,
    facts.packageOpened === undefined ? "package_opened" : null,
    facts.condition === undefined ? "item_condition" : null,
    facts.finalSale === undefined ? "final_sale_status" : null,
  ].filter((value): value is string => value !== null)
  if (missingEvidence.length > 0) {
    return needsInformation(missingEvidence, facts.reason)
  }
  if (
    !Number.isInteger(facts.daysSinceDelivery) ||
    Number(facts.daysSinceDelivery) < 0
  ) {
    return needsInformation(["valid_delivery_timeline"], facts.reason)
  }
  if (facts.finalSale) {
    return {
      decision: "ineligible",
      matchedRules: ["final_sale_excluded"],
      missingEvidence: [],
      shippingRefundEligible: false,
    }
  }
  if (Number(facts.daysSinceDelivery) > 30) {
    return {
      decision: "ineligible",
      matchedRules: ["return_window_exceeded"],
      missingEvidence: [],
      shippingRefundEligible: false,
    }
  }
  if (facts.reason === "changed_mind" && facts.condition !== "unused") {
    return {
      decision: "ineligible",
      matchedRules: ["changed_mind_item_must_be_unused"],
      missingEvidence: [],
      shippingRefundEligible: false,
    }
  }
  return {
    decision: "eligible",
    matchedRules: ["within_30_days", "not_final_sale"],
    missingEvidence: [],
    shippingRefundEligible: shippingRefundReasons.has(facts.reason),
  }
}
