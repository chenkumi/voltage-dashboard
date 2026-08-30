import type { Money } from "../commerce-data/types"
import { RETURN_REASONS, RETURN_SOURCES } from "./types"

export class ReturnValidationError extends Error {
  readonly code:
    | "INVALID_IDENTIFIER"
    | "INVALID_QUANTITY"
    | "INVALID_MONEY"
    | "INVALID_RETURN"

  constructor(code: ReturnValidationError["code"], message: string) {
    super(message)
    this.name = "ReturnValidationError"
    this.code = code
  }
}

const PLAIN_TEXT_HTML = /<\/?[a-z][^>]*>/i

export const assertReturnIdentifier = (
  value: unknown,
  pattern: RegExp,
  label: string
) => {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new ReturnValidationError(
      "INVALID_IDENTIFIER",
      `${label} identifier is invalid.`
    )
  }
  return value
}

export const assertReturnQuantity = (
  value: unknown,
  maximum: number,
  label = "Return quantity"
) => {
  if (
    !Number.isInteger(value) ||
    Number(value) < 0 ||
    Number(value) > maximum
  ) {
    throw new ReturnValidationError(
      "INVALID_QUANTITY",
      `${label} must be a whole number between 0 and ${maximum}.`
    )
  }
  return Number(value)
}

export const assertReturnMoney = (
  value: Money,
  expectedCurrency?: Money["currency"]
) => {
  if (
    !value ||
    !Number.isFinite(value.amount) ||
    value.amount < 0 ||
    Math.abs(Math.round(value.amount * 100) - value.amount * 100) > 1e-8 ||
    (expectedCurrency !== undefined && value.currency !== expectedCurrency)
  ) {
    throw new ReturnValidationError(
      "INVALID_MONEY",
      "Return money must use one currency and at most two decimal places."
    )
  }
  return value
}

export const normalizeReturnStatement = (value: unknown) => {
  if (typeof value !== "string") {
    throw new ReturnValidationError(
      "INVALID_RETURN",
      "Customer statement must be plain text."
    )
  }
  const normalized = value.trim()
  if (normalized.length > 1_000 || PLAIN_TEXT_HTML.test(normalized)) {
    throw new ReturnValidationError(
      "INVALID_RETURN",
      "Customer statement must be plain text up to 1,000 characters."
    )
  }
  return normalized
}

export const assertReturnSourceAndReason = (
  source: unknown,
  reason: unknown
) => {
  if (
    !RETURN_SOURCES.includes(source as (typeof RETURN_SOURCES)[number]) ||
    !RETURN_REASONS.includes(reason as (typeof RETURN_REASONS)[number])
  ) {
    throw new ReturnValidationError(
      "INVALID_RETURN",
      "Return source or reason is invalid."
    )
  }
}
