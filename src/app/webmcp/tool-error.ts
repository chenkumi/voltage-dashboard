const GENERIC_CATEGORY = "WEBMCP_TOOL_ERROR"
const GENERIC_MESSAGE = "WebMCP tool execution failed."
const ERROR_CONTRACTS = {
  QUERY_CACHE_DISPOSED: ["The query cache is no longer available.", false],
  QUERY_CACHE_ENTRY_TOO_LARGE: [
    "The query result is too large to cache. Reduce the selected data and retry.",
    true,
  ],
  QUERY_CACHE_LIMIT_EXCEEDED: [
    "The query cache limit was reached. Reuse or reduce query results.",
    true,
  ],
  QUERY_CACHE_NOT_FOUND: [
    "The referenced query result is unavailable. Execute the query again.",
    true,
  ],
  REPORT_ARGUMENT_ERROR: [
    "Report tool arguments are invalid. Inspect the tool schema and retry with only supported fields.",
    true,
  ],
  REPORT_CREATE_ARGUMENT_ERROR: [
    "create_report accepts only title, audience, and period at the root. Inspect the schema and retry.",
    true,
  ],
  REPORT_STATE_ARGUMENT_ERROR: [
    "get_report_state accepts no input fields. Retry with an empty object.",
    true,
  ],
  REPORT_ADD_WIDGET_ARGUMENT_ERROR: [
    "add_report_widget accepts only widget at the root. Nest all widget fields inside widget and do not include reportId.",
    true,
  ],
  REPORT_UPDATE_WIDGET_ARGUMENT_ERROR: [
    "update_report_widget accepts only widgetId and widget at the root.",
    true,
  ],
  REPORT_MOVE_WIDGET_ARGUMENT_ERROR: [
    "move_report_widget accepts only widgetId and toIndex at the root.",
    true,
  ],
  REPORT_REMOVE_WIDGET_ARGUMENT_ERROR: [
    "remove_report_widget accepts only widgetId at the root.",
    true,
  ],
  REPORT_NOT_FOUND: [
    "No active report exists. Create a report and retry.",
    true,
  ],
  REPORT_STATE_DISPOSED: ["The report state is no longer available.", false],
  REPORT_WIDGET_NOT_FOUND: [
    "The requested report widget does not exist. Read report state and retry.",
    true,
  ],
  SQL_ARGUMENT_ERROR: [
    "SQL tool arguments are invalid. Inspect the tool schema and retry.",
    true,
  ],
  SQL_EXECUTION_ERROR: [
    "The read-only SQL query could not be executed. Load voltage-report-authoring, query agent_dataset_status or sqlite_schema, then revise the query.",
    true,
  ],
  SQL_IDENTIFIER_ERROR: [
    "The SQL query contains a suspicious numeric identifier. Remove it and use aggregate or curated reporting values.",
    true,
  ],
  SQL_LITERAL_ERROR: [
    "A SQL string value is not in curated reporting data or supported date formats. Use a curated value, a supported date, or remove the filter.",
    true,
  ],
  SQL_OUTPUT_PRIVACY_ERROR: [
    "The SQL result contains restricted data and cannot be returned.",
    false,
  ],
  SQL_POLICY_ERROR: [
    "The SQL query violates the read-only reporting policy. Revise the query and retry.",
    true,
  ],
  SQL_PRIVACY_ERROR: [
    "The SQL query requests restricted data and cannot be executed.",
    false,
  ],
  SQL_RESULT_LIMIT: [
    "The SQL result exceeds a reporting limit. Select fewer rows or columns and retry.",
    true,
  ],
  SQL_SENSITIVE_FIELD_ERROR: [
    "The SQL query references a restricted field. Remove it and use only aggregate or curated reporting fields.",
    true,
  ],
  SQL_SENSITIVE_VALUE_ERROR: [
    "The SQL query contains a restricted value. Remove personal, account, or payment values and retry with curated reporting data.",
    true,
  ],
  SQLITE_ERROR: [
    "SQLite could not execute the read-only query. Inspect sqlite_schema and revise the query.",
    true,
  ],
  SQLITE_NOT_READY: ["The reporting database is not ready. Retry later.", true],
  SQLITE_WORKER_ERROR: ["The reporting database worker failed.", false],
  WEBMCP_PROVIDER_UNAVAILABLE: [
    "WebMCP provider is no longer available.",
    true,
  ],
} as const satisfies Record<
  string,
  readonly [message: string, retryable: boolean]
>

type ErrorLike = {
  category?: unknown
  message?: unknown
  name?: unknown
  retryable?: unknown
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

const readErrorLike = (error: unknown): ErrorLike | null => {
  if (!isRecord(error)) return null
  return error
}

export class WebMcpToolExecutionError extends Error {
  readonly toolName: string
  readonly category: string
  readonly retryable: boolean
  readonly safeMessage: string

  constructor(options: {
    toolName: string
    category: string
    message: string
    retryable: boolean
  }) {
    super(`[${options.category}] ${options.message}`)
    this.name = "WebMcpToolExecutionError"
    this.toolName = options.toolName
    this.category = options.category
    this.retryable = options.retryable
    this.safeMessage = options.message
  }
}

export const isAbortError = (error: unknown) =>
  isRecord(error) && error.name === "AbortError"

export const normalizeWebMcpToolError = (
  toolName: string,
  error: unknown
): WebMcpToolExecutionError => {
  if (error instanceof WebMcpToolExecutionError) {
    if (error.toolName === toolName) return error
    return new WebMcpToolExecutionError({
      toolName,
      category: error.category,
      message: error.safeMessage,
      retryable: error.retryable,
    })
  }

  const errorLike = readErrorLike(error)
  const requestedCategory = errorLike?.category
  const contract =
    typeof requestedCategory === "string" &&
    /^[A-Z][A-Z0-9_]{0,63}$/.test(requestedCategory) &&
    Object.hasOwn(ERROR_CONTRACTS, requestedCategory)
      ? ERROR_CONTRACTS[requestedCategory as keyof typeof ERROR_CONTRACTS]
      : null
  const category = contract ? (requestedCategory as string) : GENERIC_CATEGORY
  const [message, retryable] = contract ?? [GENERIC_MESSAGE, false]

  return new WebMcpToolExecutionError({
    toolName,
    category,
    message,
    retryable,
  })
}

export const createWebMcpProviderUnavailableError = (toolName: string) =>
  new WebMcpToolExecutionError({
    toolName,
    category: "WEBMCP_PROVIDER_UNAVAILABLE",
    message: "WebMCP provider is no longer available.",
    retryable: true,
  })
