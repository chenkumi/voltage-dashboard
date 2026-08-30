import type { OpsCase } from "../operations/types"

export const CASE_ORDER_LINKS: Readonly<Record<string, string>> = {
  "CASE-2001": "VM-25064",
  "CASE-2002": "VM-25065",
  "CASE-2003": "VM-25065",
  "CASE-2004": "VM-25062",
  "CASE-2005": "VM-25062",
}

export const relatedCasesFor = (orderId: string, cases: readonly OpsCase[]) =>
  cases.filter((item) => CASE_ORDER_LINKS[item.id] === orderId)
