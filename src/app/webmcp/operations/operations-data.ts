import type { OpsCase } from "./types"

export const operationsCases: OpsCase[] = [
  {
    id: "CASE-2001",
    type: "fulfillment",
    reasonCode: "dispatch_overdue",
    status: "open",
    priority: "high",
    createdAt: "2026-08-28T02:15:00.000Z",
    facts: ["dispatch_sla_exceeded", "inventory_reserved"],
  },
  {
    id: "CASE-2002",
    type: "payment_check",
    reasonCode: "authorization_failed",
    status: "open",
    priority: "medium",
    createdAt: "2026-08-28T03:20:00.000Z",
    facts: ["authorization_failed", "retry_not_started"],
  },
  {
    id: "CASE-2003",
    type: "address_validation",
    reasonCode: "address_unverified",
    status: "open",
    priority: "medium",
    createdAt: "2026-08-28T05:40:00.000Z",
    facts: ["validation_failed", "dispatch_blocked"],
  },
  {
    id: "CASE-2004",
    type: "return_request",
    reasonCode: "return_requested",
    status: "open",
    priority: "low",
    createdAt: "2026-08-28T07:05:00.000Z",
    facts: ["delivered", "return_reason_changed_mind"],
    returnFacts: {
      daysSinceDelivery: 8,
      packageOpened: false,
      condition: "unused",
      finalSale: false,
    },
  },
  {
    id: "CASE-2005",
    type: "return_request",
    reasonCode: "return_requested",
    status: "open",
    priority: "medium",
    createdAt: "2026-08-28T08:10:00.000Z",
    facts: ["delivered", "return_reason_unspecified"],
    returnFacts: {
      daysSinceDelivery: 11,
    },
  },
]
