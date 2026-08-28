import { normalizeWebMcpToolError } from "./tool-error"

type WebMcpDebugLogger = (message: string, detail: unknown) => void

type ExecuteWebMcpToolOptions<T> = {
  site: string
  toolName: string
  args: Record<string, unknown>
  execute: () => Promise<T>
  enabled?: boolean
  logger?: WebMcpDebugLogger
}

const EMAIL_VALUE_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/
const PAYMENT_CARD_VALUE_PATTERN = /(?:\d[ -]?){13,19}/
const PHONE_VALUE_PATTERN = /\+?(?:\d[\s().-]*){8,15}/g
const ISO_DATE_IN_TEXT_PATTERN = /\b\d{4}-\d{2}-\d{2}\b/g
const SENSITIVE_KEY_PATTERN =
  /^(?:customername|firstname|lastname|fullname|email|address|phone|telephone|account|accountid|accountnumber|card|cardnumber|payment|paymentdata|authkey|authtoken|apikey|secret|token)$/i

let nextCallId = 0

const isSensitiveKey = (key: string) =>
  SENSITIVE_KEY_PATTERN.test(key.replace(/[^a-z0-9]/gi, ""))

const containsRestrictedValue = (value: string) => {
  if (EMAIL_VALUE_PATTERN.test(value)) return true
  const valueWithoutDates = value.replaceAll(ISO_DATE_IN_TEXT_PATTERN, "")
  return (
    PAYMENT_CARD_VALUE_PATTERN.test(valueWithoutDates) ||
    [...valueWithoutDates.matchAll(PHONE_VALUE_PATTERN)].length > 0
  )
}

export const sanitizeDebugValue = (
  value: unknown,
  seen = new WeakSet<object>()
): unknown => {
  if (typeof value === "string")
    return containsRestrictedValue(value) ? "[REDACTED]" : value
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "undefined"
  )
    return value
  if (typeof value === "bigint") return value.toString()
  if (typeof value !== "object") return String(value)
  if (seen.has(value)) return "[Circular]"
  seen.add(value)
  if (Array.isArray(value))
    return value.map((item) => sanitizeDebugValue(item, seen))
  if (value instanceof Error)
    return {
      name: value.name,
      message: sanitizeDebugValue(value.message, seen),
      category:
        "category" in value
          ? sanitizeDebugValue((value as { category: unknown }).category, seen)
          : undefined,
    }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      isSensitiveKey(key) ? "[REDACTED]" : sanitizeDebugValue(item, seen),
    ])
  )
}

const sanitizeDebugError = (toolName: string, error: unknown) => {
  const normalized = normalizeWebMcpToolError(toolName, error)
  return {
    name: normalized.name,
    message: normalized.message,
    category: normalized.category,
    retryable: normalized.retryable,
  }
}

export const writeStructuredDebugLog: WebMcpDebugLogger = (message, detail) =>
  console.debug(message, JSON.stringify(detail))

const defaultLogger = writeStructuredDebugLog

const emitDebugLog = (
  logger: WebMcpDebugLogger,
  message: string,
  detail: unknown
) => {
  try {
    logger(message, detail)
  } catch {
    // Debug instrumentation must never change tool execution behavior.
  }
}

export const executeWebMcpToolWithDebugLog = async <T>({
  site,
  toolName,
  args,
  execute,
  enabled = import.meta.env.DEV,
  logger = defaultLogger,
}: ExecuteWebMcpToolOptions<T>): Promise<T> => {
  if (!enabled) return execute()

  nextCallId += 1
  const callId = `${site}:${nextCallId}`
  const startedAt = performance.now()
  emitDebugLog(logger, "[WebMCP tool] input", {
    callId,
    site,
    toolName,
    arguments: sanitizeDebugValue(args),
  })

  try {
    const response = await execute()
    emitDebugLog(logger, "[WebMCP tool] response", {
      callId,
      site,
      toolName,
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      response: sanitizeDebugValue(response),
    })
    return response
  } catch (error) {
    emitDebugLog(logger, "[WebMCP tool] error", {
      callId,
      site,
      toolName,
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      error: sanitizeDebugError(toolName, error),
    })
    throw error
  }
}
