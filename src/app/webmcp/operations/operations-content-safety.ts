const MAX_TEXT_LENGTH = 600
const MAX_SHORT_TEXT_LENGTH = 120

export const ALLOWED_SPECIFICATION_KEYS = [
  "material",
  "capacity",
  "origin",
  "power",
  "runtime",
  "warranty",
] as const

const unsafePatterns: Array<{ label: string; pattern: RegExp }> = [
  {
    label: "personal name",
    pattern:
      /(?:\b(?:recipient|contact person|customer name|full name|named)\b|姓名|收件人|聯絡人)\s*[:：]?\s*(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+|[\u3400-\u9fff]{2,4})/i,
  },
  { label: "email", pattern: /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/i },
  {
    label: "phone number",
    pattern: /(?:\+?\d[\s().-]*){7,}/,
  },
  {
    label: "address",
    pattern:
      /\b(?:street|st\.|road|rd\.|avenue|ave\.|boulevard|blvd|lane|ln\.|postal|zip)\b|(?:台北市|新北市|桃園市|台中市|臺中市|台南市|臺南市|高雄市|[\u3400-\u9fff]{2,3}(?:縣|市)[\u3400-\u9fff]{1,4}(?:區|鄉|鎮|市).{0,30}(?:路|街|巷|弄|號))/i,
  },
  {
    label: "account or payment identifier",
    pattern:
      /\b(?:customer\s*id|account\s*(?:id|number)|card\s*(?:number|no)|cvv|iban|swift|wallet\s*id|payment\s*(?:id|token))\b/i,
  },
  {
    label: "credential",
    pattern:
      /\b(?:password|passwd|secret|api[_ -]?key|access[_ -]?token|bearer\s+[a-z0-9._-]+)\b/i,
  },
  {
    label: "link",
    pattern: /(?:https?:\/\/|www\.|mailto:|javascript:)/i,
  },
  {
    label: "markup or script",
    pattern:
      /<\/?[a-z][^>]*>|\bon\w+\s*=|\b(?:eval|alert|confirm|prompt|fetch|setTimeout|setInterval)\s*\(|\b(?:window|document|location)\s*[.[]|\bfunction\s*\w*\s*\(|=>|\bnew\s+Function\b/i,
  },
]

export class OperationsContentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "OperationsContentError"
  }
}

export const assertSafeOperationsText = (
  value: unknown,
  field: string,
  options: { maxLength?: number; allowEmpty?: boolean } = {}
): asserts value is string => {
  if (typeof value !== "string") {
    throw new OperationsContentError(`${field} must be a string.`)
  }

  const normalized = value.trim()
  if (!options.allowEmpty && normalized.length === 0) {
    throw new OperationsContentError(`${field} cannot be empty.`)
  }

  const maxLength = options.maxLength ?? MAX_TEXT_LENGTH
  if (normalized.length > maxLength) {
    throw new OperationsContentError(
      `${field} must be ${maxLength} characters or fewer.`
    )
  }

  const unsafe = unsafePatterns.find(({ pattern }) => pattern.test(normalized))
  if (unsafe) {
    throw new OperationsContentError(`${field} contains ${unsafe.label}.`)
  }
}

export const assertSafeShortText = (
  value: unknown,
  field: string,
  allowEmpty = false
): asserts value is string =>
  assertSafeOperationsText(value, field, {
    maxLength: MAX_SHORT_TEXT_LENGTH,
    allowEmpty,
  })

export const assertSafeTextList = (
  value: unknown,
  field: string,
  options: { maxItems?: number; itemLength?: number } = {}
): asserts value is string[] => {
  const maxItems = options.maxItems ?? 8
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new OperationsContentError(
      `${field} must contain at most ${maxItems} items.`
    )
  }
  value.forEach((item, index) =>
    assertSafeOperationsText(item, `${field}[${index}]`, {
      maxLength: options.itemLength ?? MAX_SHORT_TEXT_LENGTH,
    })
  )
}

export const assertSafeSpecifications = (
  value: unknown
): asserts value is Record<string, string> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OperationsContentError("specifications must be an object.")
  }

  const entries = Object.entries(value)
  if (entries.length > 12) {
    throw new OperationsContentError(
      "specifications must contain at most 12 fields."
    )
  }
  for (const [key, specification] of entries) {
    if (!(ALLOWED_SPECIFICATION_KEYS as readonly string[]).includes(key)) {
      throw new OperationsContentError(
        `specifications contains unsupported field ${key}.`
      )
    }
    assertSafeShortText(key, "specification key")
    assertSafeShortText(specification, `specifications.${key}`)
    assertSafeShortText(`${key}: ${specification}`, `specifications.${key}`)
  }
}
