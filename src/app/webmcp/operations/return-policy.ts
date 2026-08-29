import type { EligibilityResult, OpsCase } from "./types"

const needsReview = (missingEvidence: string[]): EligibilityResult => ({
  decision: "needs_human_review",
  matchedRules: ["policy_evidence_incomplete"],
  missingEvidence,
})

export const checkReturnEligibility = (opsCase: OpsCase): EligibilityResult => {
  if (opsCase.type !== "return_request" || !opsCase.returnFacts) {
    return needsReview(["return_request_facts"])
  }

  const { daysSinceDelivery, packageOpened, condition, finalSale } =
    opsCase.returnFacts
  const missingEvidence = [
    daysSinceDelivery === undefined ? "days_since_delivery" : null,
    packageOpened === undefined ? "package_opened" : null,
    condition === undefined ? "item_condition" : null,
    finalSale === undefined ? "final_sale_status" : null,
  ].filter((value): value is string => value !== null)

  if (missingEvidence.length > 0) return needsReview(missingEvidence)
  if (daysSinceDelivery === undefined) {
    return needsReview(["days_since_delivery"])
  }
  if (!Number.isInteger(daysSinceDelivery) || daysSinceDelivery < 0) {
    return needsReview(["valid_delivery_timeline"])
  }
  if (finalSale) {
    return {
      decision: "ineligible",
      matchedRules: ["final_sale_excluded"],
      missingEvidence: [],
    }
  }
  if (daysSinceDelivery > 30) {
    return {
      decision: "ineligible",
      matchedRules: ["return_window_exceeded"],
      missingEvidence: [],
    }
  }
  if (condition === "used") {
    return {
      decision: "ineligible",
      matchedRules: ["used_item_excluded"],
      missingEvidence: [],
    }
  }
  if (condition === "damaged" || packageOpened) {
    return {
      decision: "needs_human_review",
      matchedRules: ["condition_inspection_required"],
      missingEvidence: [],
    }
  }

  return {
    decision: "eligible",
    matchedRules: ["within_30_days", "unused_unopened", "not_final_sale"],
    missingEvidence: [],
  }
}
