import type { WebMcpRegisteredTool } from "../types"
import {
  REPORTING_DATASET_STATUS,
  REPORTING_INVENTORY,
  REPORTING_PRODUCTS,
  REPORTING_SALES,
  REPORTING_SCHEMA_SQL,
} from "./reporting-data"
import {
  SqliteReportingRuntime,
  SqliteReportingRuntimeError,
} from "./sqlite-runtime"
import type { SqlQueryInput, SqlQueryResult, SqlScalar } from "./types"

export const EXECUTE_READONLY_SQL_TOOL_NAME = "execute_readonly_sql"

export const EXECUTE_READONLY_SQL_TOOL: WebMcpRegisteredTool = {
  name: EXECUTE_READONLY_SQL_TOOL_NAME,
  description:
    "Execute one read-only SQLite SELECT or WITH query against the curated agent_products, agent_sales_daily, agent_inventory, and agent_dataset_status datasets. Use parameters for values; string filters must come from the curated data or be ISO dates, date modifiers, or date formats. Results include columns, rows, rowCount, truncated, and executionTimeMs; output is limited to 100 rows and long strings are truncated. Use sqlite_schema to discover table definitions. Personal, account, and payment data, writes, PRAGMA, filesystem access, extensions, and unapproved schemas are rejected.",
  inputSchema: {
    type: "object",
    properties: {
      sql: {
        type: "string",
        description: "One SQLite SELECT or WITH query.",
        maxLength: 8_000,
      },
      parameters: {
        type: "array",
        description:
          "Optional positional values for ? placeholders. Strings must be curated dataset values, ISO dates, SQLite date modifiers, or date formats.",
        maxItems: 50,
        items: {
          anyOf: [
            { type: "string" },
            { type: "number" },
            { type: "boolean" },
            { type: "null" },
          ],
        },
      },
    },
    required: ["sql"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, untrustedContentHint: true },
}

export interface ReadonlySqlRuntime {
  execute(input: SqlQueryInput): Promise<SqlQueryResult>
}

export interface ManagedReadonlySqlRuntime extends ReadonlySqlRuntime {
  initialize(): Promise<void>
  dispose(): Promise<void>
}

type RuntimeFactory = () => ManagedReadonlySqlRuntime

const isSqlScalar = (value: unknown): value is SqlScalar =>
  value === null ||
  typeof value === "string" ||
  typeof value === "boolean" ||
  (typeof value === "number" && Number.isFinite(value))

const EMAIL_VALUE_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/
const PAYMENT_VALUE_PATTERN = /(?:\d[ -]?){13,19}/
const PHONE_VALUE_PATTERN = /^\+?[\d ()-]{8,}$/
const ISO_DATE_VALUE_PATTERN = /^\d{4}(?:-\d{2}(?:-\d{2})?)?(?:[T ][\d:.+-]+)?$/
const TIME_VALUE_PATTERN = /^\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/
const DATE_MODIFIER_PATTERN =
  /^[+-]\d{1,3} (?:days?|months?|years?|hours?|minutes?)$/i
const SUSPICIOUS_NUMERIC_IDENTIFIER_PATTERN = /(?:^|[^\d])\d{8,12}(?:[^\d]|$)/
const SAFE_DATE_MODIFIERS = new Set([
  "start of day",
  "start of month",
  "start of year",
  "unixepoch",
  "julianday",
  "auto",
  "localtime",
  "utc",
  "ceiling",
  "floor",
  "subsec",
  "subsecond",
])
const SAFE_DATE_FORMATS = new Set([
  "%Y",
  "%Y-%m",
  "%Y-%m-%d",
  "%H:%M",
  "%H:%M:%S",
  "%F",
  "%T",
  "%R",
  "%m",
  "%d",
  "%w",
  "%W",
  "%j",
  "%J",
  "%s",
  "%f",
])

const SAFE_REPORTING_STRINGS = new Set(
  [
    ...REPORTING_PRODUCTS,
    ...REPORTING_SALES,
    ...REPORTING_INVENTORY,
    ...REPORTING_DATASET_STATUS,
  ]
    .flat()
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.toLowerCase())
)
const SAFE_SCHEMA_DEFINITIONS = new Set(
  REPORTING_SCHEMA_SQL.split(";")
    .map((statement) => statement.trim())
    .filter(Boolean)
)

const normalizeFieldName = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]/g, "")

const isSensitiveFieldName = (name: string) => {
  const normalized = normalizeFieldName(name)
  return (
    normalized === "name" ||
    normalized === "customername" ||
    normalized === "firstname" ||
    normalized === "lastname" ||
    normalized === "fullname" ||
    normalized.includes("email") ||
    normalized.includes("address") ||
    normalized.includes("phone") ||
    normalized.includes("telephone") ||
    normalized.includes("account") ||
    normalized.includes("cardnumber") ||
    normalized.includes("payment")
  )
}

const containsStrongSensitiveFieldName = (sql: string) => {
  const normalized = normalizeFieldName(sql)
  return /(?:customername|firstname|lastname|fullname|email|address|phone|telephone|account|cardnumber|payment)/.test(
    normalized
  )
}

const containsSensitiveValue = (value: unknown) =>
  typeof value === "string" &&
  (EMAIL_VALUE_PATTERN.test(value) ||
    PAYMENT_VALUE_PATTERN.test(value) ||
    (PHONE_VALUE_PATTERN.test(value) && !ISO_DATE_VALUE_PATTERN.test(value)))

const isSafeReportingOutputString = (value: string) => {
  const normalized = value.toLowerCase()
  if (SAFE_REPORTING_STRINGS.has(normalized)) return true
  return (
    ISO_DATE_VALUE_PATTERN.test(value) ||
    TIME_VALUE_PATTERN.test(value) ||
    DATE_MODIFIER_PATTERN.test(value) ||
    SAFE_DATE_MODIFIERS.has(normalized) ||
    /^weekday [0-6]$/.test(normalized) ||
    SAFE_DATE_FORMATS.has(value) ||
    SAFE_SCHEMA_DEFINITIONS.has(value.trim())
  )
}

const isSafeReportingInputString = (value: string) => {
  if (isSafeReportingOutputString(value)) return true

  const searchValue = value
    .toLowerCase()
    .replaceAll("%", "")
    .replaceAll("_", "")
  return (
    searchValue.length >= 2 &&
    [...SAFE_REPORTING_STRINGS].some((safeValue) =>
      safeValue.includes(searchValue)
    )
  )
}

const extractSqlStringLiterals = (sql: string) =>
  [...sql.matchAll(/'(?:''|[^'])*'/g)].map((match) =>
    match[0].slice(1, -1).replaceAll("''", "'")
  )

const assertSafeReportingInput = (
  sql: string,
  parameters: SqlScalar[] | undefined
) => {
  const stringValues = [
    ...extractSqlStringLiterals(sql),
    ...(parameters?.filter(
      (value): value is string => typeof value === "string"
    ) ?? []),
  ]
  if (
    containsStrongSensitiveFieldName(sql) ||
    containsSensitiveValue(sql) ||
    SUSPICIOUS_NUMERIC_IDENTIFIER_PATTERN.test(sql) ||
    parameters?.some(
      (value) =>
        containsSensitiveValue(value) ||
        (typeof value === "number" &&
          Number.isInteger(value) &&
          Math.abs(value) >= 10_000_000)
    ) ||
    stringValues.some((value) => !isSafeReportingInputString(value))
  ) {
    throw new SqliteReportingRuntimeError(
      "SQL_PRIVACY_ERROR",
      "Personal, account, or payment data is not allowed in reporting queries."
    )
  }
}

const assertSafeReportingResult = (result: SqlQueryResult) => {
  const schemaNames = new Set([
    "agent_dataset_status",
    "agent_inventory",
    "agent_products",
    "agent_sales_daily",
  ])
  const hasSensitiveColumn = result.columns.some((column) => {
    if (!isSensitiveFieldName(column.name)) return false
    if (normalizeFieldName(column.name) !== "name") return true
    return !result.rows.every(
      (row) =>
        typeof row[column.name] === "string" &&
        schemaNames.has(row[column.name] as string)
    )
  })
  const hasSensitiveRow = result.rows.some((row) =>
    Object.entries(row).some(
      ([name, value]) =>
        (isSensitiveFieldName(name) &&
          !(
            normalizeFieldName(name) === "name" &&
            typeof value === "string" &&
            schemaNames.has(value)
          )) ||
        containsSensitiveValue(value) ||
        (typeof value === "number" &&
          Number.isInteger(value) &&
          Math.abs(value) >= 10_000_000) ||
        (typeof value === "string" && !isSafeReportingOutputString(value))
    )
  )
  if (hasSensitiveColumn || hasSensitiveRow) {
    throw new SqliteReportingRuntimeError(
      "SQL_PRIVACY_ERROR",
      "The reporting query result contains restricted data."
    )
  }
}

export const executeReadonlySqlTool = async (
  runtime: ReadonlySqlRuntime,
  args: unknown
) => {
  if (args === null || typeof args !== "object" || Array.isArray(args)) {
    throw new SqliteReportingRuntimeError(
      "SQL_ARGUMENT_ERROR",
      "SQL tool input must be an object."
    )
  }
  const input = args as Record<string, unknown>
  const unknownKeys = Object.keys(input).filter(
    (key) => key !== "sql" && key !== "parameters"
  )
  if (unknownKeys.length > 0) {
    throw new SqliteReportingRuntimeError(
      "SQL_ARGUMENT_ERROR",
      "Only sql and parameters are accepted."
    )
  }
  if (typeof input.sql !== "string") {
    throw new SqliteReportingRuntimeError(
      "SQL_ARGUMENT_ERROR",
      "A SQL query string is required."
    )
  }
  if (
    input.parameters !== undefined &&
    (!Array.isArray(input.parameters) || !input.parameters.every(isSqlScalar))
  ) {
    throw new SqliteReportingRuntimeError(
      "SQL_ARGUMENT_ERROR",
      "SQL parameters must be an array of finite JSON scalar values."
    )
  }

  const parameters = input.parameters as SqlScalar[] | undefined
  assertSafeReportingInput(input.sql, parameters)
  const result = await runtime.execute({
    sql: input.sql,
    parameters,
  })
  assertSafeReportingResult(result)
  return result
}

export class ReportingRuntimeController {
  private runtime: ManagedReadonlySqlRuntime | null = null

  constructor(
    private readonly createRuntime: RuntimeFactory = () =>
      new SqliteReportingRuntime()
  ) {}

  async prepare() {
    const runtime = this.runtime ?? this.createRuntime()
    this.runtime = runtime
    try {
      await runtime.initialize()
    } catch (error) {
      if (this.runtime === runtime) this.runtime = null
      await runtime.dispose()
      throw error
    }
  }

  async execute(args: unknown) {
    if (!this.runtime) {
      throw new SqliteReportingRuntimeError(
        "SQLITE_NOT_READY",
        "SQLite reporting runtime is not ready."
      )
    }
    return executeReadonlySqlTool(this.runtime, args)
  }

  async dispose() {
    const runtime = this.runtime
    this.runtime = null
    await runtime?.dispose()
  }
}
