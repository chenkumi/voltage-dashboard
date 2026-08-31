import type { SqlQueryResultWithId } from "./types"

export type ReportingToolErrorCode =
  | "SQL_PARAMETER_ERROR"
  | "SQL_POLICY_REJECTED"
  | "SQL_RUNTIME_ERROR"
  | "SQL_SCHEMA_MISMATCH"

export type ReportingToolErrorResult = {
  status: ReportingToolErrorCode
  reasonCode: string
  retryable: boolean
  nextStep: string
  message: string
}

export type ReportingToolResult =
  | SqlQueryResultWithId
  | ReportingToolErrorResult

type CategorizedError = { category: string }

const POLICY_CATEGORIES = new Set([
  "SQL_IDENTIFIER_ERROR",
  "SQL_LITERAL_ERROR",
  "SQL_OUTPUT_PRIVACY_ERROR",
  "SQL_POLICY_ERROR",
  "SQL_PRIVACY_ERROR",
  "SQL_RESULT_LIMIT",
  "SQL_SENSITIVE_FIELD_ERROR",
  "SQL_SENSITIVE_VALUE_ERROR",
])

const RUNTIME_CATEGORIES = new Set([
  "QUERY_CACHE_DISPOSED",
  "QUERY_CACHE_ENTRY_TOO_LARGE",
  "QUERY_CACHE_LIMIT_EXCEEDED",
  "SQLITE_ERROR",
  "SQLITE_NOT_READY",
  "SQLITE_WORKER_ERROR",
])

const isCategorizedError = (error: unknown): error is CategorizedError =>
  error !== null &&
  typeof error === "object" &&
  typeof (error as { category?: unknown }).category === "string"

export function projectReportingToolError(
  error: unknown
): ReportingToolErrorResult | null {
  if (!isCategorizedError(error)) return null
  const reasonCode = error.category

  if (reasonCode === "SQL_ARGUMENT_ERROR") {
    return {
      status: "SQL_PARAMETER_ERROR",
      reasonCode,
      retryable: true,
      nextStep: "Inspect the tool input schema and retry with valid sql and parameters.",
      message: "The SQL tool input is invalid.",
    }
  }

  if (reasonCode === "SQL_EXECUTION_ERROR") {
    return {
      status: "SQL_SCHEMA_MISMATCH",
      reasonCode,
      retryable: true,
      nextStep: "Query sqlite_schema, then revise table and column names.",
      message: "The query does not match the available reporting schema.",
    }
  }

  if (POLICY_CATEGORIES.has(reasonCode)) {
    const retryable = ![
      "SQL_OUTPUT_PRIVACY_ERROR",
      "SQL_PRIVACY_ERROR",
    ].includes(reasonCode)
    return {
      status: "SQL_POLICY_REJECTED",
      reasonCode,
      retryable,
      nextStep:
        "Load voltage-report-authoring and revise the query to use only allowed aggregate reporting data.",
      message: "The query was rejected by the read-only reporting policy.",
    }
  }

  if (RUNTIME_CATEGORIES.has(reasonCode)) {
    return {
      status: "SQL_RUNTIME_ERROR",
      reasonCode,
      retryable: reasonCode !== "SQLITE_WORKER_ERROR",
      nextStep:
        reasonCode === "SQLITE_NOT_READY"
          ? "Wait for reporting data to become ready, then retry once."
          : "Reduce or retry the query once; report the failure if it persists.",
      message: "The reporting runtime could not complete the query.",
    }
  }

  return null
}

export async function executeReadonlySqlToolResult(
  execute: () => Promise<SqlQueryResultWithId>
): Promise<ReportingToolResult> {
  try {
    return await execute()
  } catch (error) {
    const projected = projectReportingToolError(error)
    if (projected) return projected
    throw error
  }
}
