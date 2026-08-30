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
const NON_PRINTABLE_ASCII_PATTERN = /[^\x20-\x7e]/
const EMAIL_PATTERN = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/i
const PHONE_PATTERN =
  /(?:電話|手機|phone|tel)?\s*(?:\+?\d(?:[\d\s()-]*\d){7,})/i
const ADDRESS_PATTERN = /(?:\baddress\b|地址|住址|收件人|[路街巷]\s*\d+|\d+\s*號)/i
const PAYMENT_IDENTIFIER_PATTERN =
  /(?:card\s*(?:number|token)|credit\s*card|payment\s*token|authorization\s*code|卡號|付款識別|授權碼|帳戶)/i
const NAME_FIELD_PATTERN = /(?:full\s*name|customer\s*name|\bname\s*:|姓名)/i
const ENGLISH_PERSON_NAME_PATTERN = /\b[A-Z][a-z]{1,30}\s+[A-Z][a-z]{1,30}\b/
const CHINESE_PERSON_NAME_PATTERN =
  /[陳林黃張李王吳劉蔡楊許鄭謝郭洪曾邱廖賴徐周葉蘇莊呂江何蕭羅高潘簡朱鍾游彭詹胡施沈余盧梁趙顏柯翁魏孫戴范方宋鄧杜傅侯曹薛丁卓阮馬董唐溫藍蔣石古紀姚連馮歐程湯][\u3400-\u9fff]{1,2}(?:說|表示|先生|小姐|女士)/
const BARE_CHINESE_PERSON_NAME_PATTERN =
  /^[陳林黃張李王吳劉蔡楊許鄭謝郭洪曾邱廖賴徐周葉蘇莊呂江何蕭羅高潘簡朱鍾游彭詹胡施沈余盧梁趙顏柯翁魏孫戴范方宋鄧杜傅侯曹薛丁卓阮馬董唐溫藍蔣石古紀姚連馮歐程湯][\u3400-\u9fff]{1,2}$/
const COMMON_ENGLISH_PERSON_NAME_PATTERN =
  /\b(?:john|jane|james|mary|michael|david|robert|jennifer|william|linda|richard|elizabeth|joseph|susan|thomas|jessica|charles|sarah|daniel|karen|matthew|nancy|anthony|lisa|mark|betty|donald|sandra|steven|ashley|paul|kimberly|andrew|emily|joshua|donna|kenneth|michelle|kevin|carol|brian|amanda|george|melissa|edward|deborah|ronald|stephanie|timothy|rebecca|jason|laura|jeffrey|sharon|ryan|cynthia|jacob|kathleen|gary|amy|nicholas|angela|eric|shirley|jonathan|anna|stephen|brenda|larry|pamela|justin|emma|scott|nicole|brandon|helen|benjamin|samantha|samuel|katherine|gregory|christine|alexander|debra|patrick|rachel|frank|carolyn|raymond|janet|jack|catherine|dennis|maria|jerry|heather|tyler|diane|aaron|ruth|jose|julie|adam|olivia|nathan|joyce|henry|virginia)\s+[a-z][a-z'-]{1,30}\b/i

const SAFE_OPERATIONAL_WORDS = new Set(
  "a accepted additional after against agent approval authorized before broken changed completed condition contradictory customer damaged decision declined defective delivered delivery description does duplicate eligible evidence fail failed failure finance flickers in inspection invalid item line missing must no not on opened ops order package packaging parts policy power present product provider received reconciled refund requested result return screen second serial snapshot stale stopped successfully system the to unavailable updated user verified was within working wrong".split(
    " "
  )
)

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
  if (
    NON_PRINTABLE_ASCII_PATTERN.test(normalized) ||
    EMAIL_PATTERN.test(normalized) ||
    PHONE_PATTERN.test(normalized) ||
    ADDRESS_PATTERN.test(normalized) ||
    PAYMENT_IDENTIFIER_PATTERN.test(normalized) ||
    NAME_FIELD_PATTERN.test(normalized) ||
    ENGLISH_PERSON_NAME_PATTERN.test(normalized) ||
    CHINESE_PERSON_NAME_PATTERN.test(normalized) ||
    BARE_CHINESE_PERSON_NAME_PATTERN.test(normalized) ||
    COMMON_ENGLISH_PERSON_NAME_PATTERN.test(normalized)
  ) {
    throw new ReturnValidationError(
      "INVALID_RETURN",
      "Return text must not contain personal or payment identifiers."
    )
  }
  const latinWords = normalized.toLowerCase().match(/[a-z]+/g) ?? []
  if (latinWords.some((word) => !SAFE_OPERATIONAL_WORDS.has(word))) {
    throw new ReturnValidationError(
      "INVALID_RETURN",
      "Return text contains a non-operational term that may identify a person."
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
