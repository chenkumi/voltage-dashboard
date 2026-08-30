import type { WebMcpRegisteredTool } from "../types"
import {
  collectReportingStrings,
  DEFAULT_REPORTING_DATA,
  REPORTING_SCHEMA_SQL,
  type ReportingDataSnapshot,
} from "./reporting-data"
import {
  SqliteReportingRuntime,
  SqliteReportingRuntimeError,
} from "./sqlite-runtime"
import { QueryResultCache } from "./query-cache"
import { hasPositionalSqlPlaceholder } from "./sql-policy"
import {
  executeReportAuthoringTool,
  isReportAuthoringTool,
  validateReportTitle,
  validateReportWidgetTitle,
} from "./report-tools"
import { ReportStateStore } from "./report-state"
import type {
  QueryCacheStatus,
  QueryId,
  ReportingWorkspaceSnapshot,
  SavedReport,
  SqlQueryInput,
  SqlQueryResult,
  SqlQueryResultWithId,
  SqlScalar,
} from "./types"

export const EXECUTE_READONLY_SQL_TOOL_NAME = "execute_readonly_sql"

export const EXECUTE_READONLY_SQL_TOOL: WebMcpRegisteredTool = {
  name: EXECUTE_READONLY_SQL_TOOL_NAME,
  description:
    "SQLite read-only SELECT/WITH; 100 rows max. Tables: agent_products, agent_sales_daily, agent_inventory, agent_inventory_daily, agent_order_daily, agent_order_product_daily, agent_customer_monthly, agent_dataset_status. Fields: price_amount, price_usd, currency_code, product_status, net_revenue_usd, payment_status_code; join agent_inventory to agent_products by product_id. price_usd is NULL for non-USD. Keep currencies separate. Customer groups >=5; no personal/payment IDs. queryIds expire.",
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
          "Optional positional values for ? placeholders. Safe surplus values are ignored when SQL contains no ? placeholder. Strings must be curated dataset values, ISO dates, short numeric values, SQLite date modifiers, or date formats.",
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
  initialize(snapshot?: ReportingDataSnapshot): Promise<void>
  dispose(): Promise<void>
}

type RuntimeFactory = () => ManagedReadonlySqlRuntime
type QueryCacheFactory = () => QueryResultCache
type ReportStateFactory = () => ReportStateStore
type ReportingRuntimeContext = {
  runtime: ManagedReadonlySqlRuntime
  queryCache: QueryResultCache
  reportState: ReportStateStore
  dataVersion: number
  safeStrings: ReadonlySet<string>
  contextId: string
}

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
const SAFE_NUMERIC_STRING_PATTERN = /^[+-]?\d{1,3}(?:\.\d{1,2})?$/
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

const DEFAULT_SAFE_REPORTING_STRINGS = collectReportingStrings(
  DEFAULT_REPORTING_DATA
)
const SAFE_PAYMENT_STATUS_VALUES = new Set([
  "paid",
  "pending",
  "failed",
  "refunded",
])
const SAFE_SCHEMA_DEFINITIONS = new Set(
  REPORTING_SCHEMA_SQL.split(";")
    .map((statement) => statement.trim())
    .filter(Boolean)
)

const normalizeFieldName = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]/g, "")

const isSensitiveFieldName = (name: string) => {
  if (name === "payment_status_code") return false
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
    normalized.includes("token") ||
    normalized === "auth" ||
    normalized.includes("authentication") ||
    normalized.includes("authorization") ||
    normalized.includes("authcode") ||
    normalized.includes("cvv") ||
    normalized.includes("cvc") ||
    normalized.includes("iban") ||
    normalized.includes("routing") ||
    normalized.includes("swift") ||
    normalized.includes("card") ||
    normalized.includes("payment")
  )
}

const containsStrongSensitiveFieldName = (sql: string) => {
  const identifiers = sql
    .replace(/'(?:''|[^'])*'/g, " ")
    .replace(/--.*$/gm, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .match(/[a-z_][a-z0-9_]*/gi)
  return (identifiers ?? []).some(
    (identifier) =>
      normalizeFieldName(identifier) !== "name" &&
      isSensitiveFieldName(identifier)
  )
}

const containsSensitiveValue = (value: unknown) =>
  typeof value === "string" &&
  (EMAIL_VALUE_PATTERN.test(value) ||
    PAYMENT_VALUE_PATTERN.test(value) ||
    (PHONE_VALUE_PATTERN.test(value) && !ISO_DATE_VALUE_PATTERN.test(value)))

const isSafeReportingOutputString = (
  value: string,
  safeStrings: ReadonlySet<string>
) => {
  const normalized = value.toLowerCase()
  if (safeStrings.has(normalized)) return true
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

const isSafeReportingInputString = (
  value: string,
  safeStrings: ReadonlySet<string>
) => {
  if (SAFE_PAYMENT_STATUS_VALUES.has(value)) return true
  if (isSafeReportingOutputString(value, safeStrings)) return true
  if (SAFE_NUMERIC_STRING_PATTERN.test(value)) return true

  const searchValue = value
    .toLowerCase()
    .replaceAll("%", "")
    .replaceAll("_", "")
  return (
    searchValue.length >= 2 &&
    [...safeStrings].some((safeValue) => safeValue.includes(searchValue))
  )
}

const extractSqlStringLiterals = (sql: string) =>
  [...sql.matchAll(/'(?:''|[^'])*'/g)].map((match) =>
    match[0].slice(1, -1).replaceAll("''", "'")
  )

type PaymentSqlToken = {
  raw: string
  lower: string
  parameterIndex: number | null
}

const tokenizePaymentSql = (sql: string): PaymentSqlToken[] => {
  const withoutComments = sql
    .replace(/--.*$/gm, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
  const rawTokens =
    withoutComments.match(
      /'(?:''|[^'])*'|\?\d+|\?|!=|<>|=|\.|\(|\)|,|[a-z_][a-z0-9_]*|[+-]?\d+(?:\.\d+)?/gi
    ) ?? []
  let parameterIndex = 0
  return rawTokens.map((raw) => ({
    raw,
    lower: raw.toLowerCase(),
    parameterIndex: raw === "?" ? parameterIndex++ : null,
  }))
}

const paymentFilterError = () =>
  new SqliteReportingRuntimeError(
    "SQL_LITERAL_ERROR",
    "payment_status_code filters accept only paid, pending, failed, or refunded."
  )

const isSafePaymentValueToken = (
  token: PaymentSqlToken | undefined,
  parameters: SqlScalar[] | undefined
) => {
  if (!token) return false
  if (token.parameterIndex !== null) {
    const value = parameters?.[token.parameterIndex]
    return typeof value === "string" && SAFE_PAYMENT_STATUS_VALUES.has(value)
  }
  if (!token.raw.startsWith("'")) return false
  const value = token.raw.slice(1, -1).replaceAll("''", "'")
  return SAFE_PAYMENT_STATUS_VALUES.has(value)
}

const assertSafePaymentStatusFilters = (
  sql: string,
  parameters: SqlScalar[] | undefined
) => {
  const tokens = tokenizePaymentSql(sql)
  if (
    tokens.some((token) => token.raw === "payment_status_code") &&
    tokens.some((token) => /^\?\d+$/.test(token.raw))
  )
    throw paymentFilterError()
  if (
    tokens[0]?.lower === "with" &&
    tokens.some((token) => token.raw === "payment_status_code")
  )
    throw paymentFilterError()
  const terminalTokens = new Set([
    ",",
    ")",
    "from",
    "group",
    "order",
    "having",
    "limit",
    "offset",
    "asc",
    "desc",
  ])
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index]!.raw !== "payment_status_code") continue
    const previous = tokens[index - 1]
    const next = tokens[index + 1]

    if (
      previous?.lower === "as" ||
      next?.lower === "as"
    )
      throw paymentFilterError()

    if (["=", "!=", "<>"].includes(next?.lower ?? "")) {
      if (!isSafePaymentValueToken(tokens[index + 2], parameters))
        throw paymentFilterError()
      continue
    }
    if (next?.lower === "is") {
      const valueIndex = tokens[index + 2]?.lower === "not" ? index + 3 : index + 2
      if (!isSafePaymentValueToken(tokens[valueIndex], parameters))
        throw paymentFilterError()
      continue
    }
    const isNotIn = next?.lower === "not" && tokens[index + 2]?.lower === "in"
    if (next?.lower === "in" || isNotIn) {
      const openIndex = isNotIn ? index + 3 : index + 2
      if (tokens[openIndex]?.lower !== "(") throw paymentFilterError()
      let valueIndex = openIndex + 1
      let expectsValue = true
      let valueCount = 0
      while (tokens[valueIndex] && tokens[valueIndex]!.lower !== ")") {
        if (expectsValue) {
          if (!isSafePaymentValueToken(tokens[valueIndex], parameters))
            throw paymentFilterError()
          valueCount += 1
        } else if (tokens[valueIndex]!.lower !== ",") {
          throw paymentFilterError()
        }
        expectsValue = !expectsValue
        valueIndex += 1
      }
      if (
        valueCount === 0 ||
        expectsValue ||
        tokens[valueIndex]?.lower !== ")"
      )
        throw paymentFilterError()
      continue
    }

    if (["=", "!=", "<>"].includes(previous?.lower ?? "")) {
      if (!isSafePaymentValueToken(tokens[index - 2], parameters))
        throw paymentFilterError()
      continue
    }
    if (previous?.lower === "is") {
      if (!isSafePaymentValueToken(tokens[index - 2], parameters))
        throw paymentFilterError()
      continue
    }
    if (
      previous?.lower === "not" &&
      tokens[index - 2]?.lower === "is"
    ) {
      if (!isSafePaymentValueToken(tokens[index - 3], parameters))
        throw paymentFilterError()
      continue
    }

    if (
      previous?.lower === "(" ||
      ["where", "and", "or", "on", "when", "not"].includes(
        previous?.lower ?? ""
      )
    )
      throw paymentFilterError()
    if (!next || terminalTokens.has(next.lower)) {
      if (
        ["select", "distinct", ",", ".", "by"].includes(
          previous?.lower ?? ""
        )
      )
        continue
      throw paymentFilterError()
    }
    throw paymentFilterError()
  }
}

const assertSafeReportingInput = (
  sql: string,
  parameters: SqlScalar[] | undefined,
  safeStrings: ReadonlySet<string>
) => {
  const stringValues = [
    ...extractSqlStringLiterals(sql),
    ...(parameters?.filter(
      (value): value is string => typeof value === "string"
    ) ?? []),
  ]
  if (containsStrongSensitiveFieldName(sql)) {
    throw new SqliteReportingRuntimeError(
      "SQL_SENSITIVE_FIELD_ERROR",
      "The query references a restricted field. Use only curated reporting fields."
    )
  }
  assertSafePaymentStatusFilters(sql, parameters)
  if (
    containsSensitiveValue(sql) ||
    parameters?.some((value) => containsSensitiveValue(value))
  )
    throw new SqliteReportingRuntimeError(
      "SQL_SENSITIVE_VALUE_ERROR",
      "The query contains a restricted value. Remove personal, account, or payment values."
    )
  if (
    SUSPICIOUS_NUMERIC_IDENTIFIER_PATTERN.test(sql) ||
    parameters?.some(
      (value) =>
        typeof value === "number" &&
        Number.isInteger(value) &&
        Math.abs(value) >= 10_000_000
    )
  )
    throw new SqliteReportingRuntimeError(
      "SQL_IDENTIFIER_ERROR",
      "The query contains a suspicious numeric identifier. Use aggregate or curated reporting values only."
    )
  if (
    stringValues.some(
      (value) => !isSafeReportingInputString(value, safeStrings)
    )
  )
    throw new SqliteReportingRuntimeError(
      "SQL_LITERAL_ERROR",
      "The query contains an unapproved string value. Use parameters with curated dataset values or supported dates."
    )
}

const assertSafeReportingResult = (
  result: SqlQueryResult,
  safeStrings: ReadonlySet<string>
) => {
  const schemaNames = new Set([
    "agent_customer_monthly",
    "agent_dataset_status",
    "agent_inventory",
    "agent_inventory_daily",
    "agent_order_daily",
    "agent_order_product_daily",
    "agent_products",
    "agent_sales_daily",
  ])
  const hasSensitiveColumn = result.columns.some((column) => {
    if (
      column.name === "payment_status_code" &&
      !result.rows.every((row) => {
        const value = row[column.name]
        return (
          typeof value === "string" && SAFE_PAYMENT_STATUS_VALUES.has(value)
        )
      })
    )
      return true
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
        (name === "payment_status_code" &&
          (typeof value !== "string" ||
            !SAFE_PAYMENT_STATUS_VALUES.has(value))) ||
        containsSensitiveValue(value) ||
        (typeof value === "number" &&
          Number.isInteger(value) &&
          Math.abs(value) >= 10_000_000) ||
        (typeof value === "string" &&
          !isSafeReportingOutputString(value, safeStrings))
    )
  )
  if (hasSensitiveColumn || hasSensitiveRow) {
    throw new SqliteReportingRuntimeError(
      "SQL_OUTPUT_PRIVACY_ERROR",
      "The reporting query result contains restricted data."
    )
  }
}

export const executeReadonlySqlTool = async (
  runtime: ReadonlySqlRuntime,
  args: unknown,
  safeStrings: ReadonlySet<string> = DEFAULT_SAFE_REPORTING_STRINGS
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
  assertSafeReportingInput(input.sql, parameters, safeStrings)
  let hasPlaceholder = true
  try {
    hasPlaceholder = hasPositionalSqlPlaceholder(input.sql)
  } catch {
    // Let the runtime return the canonical SQL policy error.
  }
  const boundParameters = hasPlaceholder ? parameters : undefined
  const result = await runtime.execute({
    sql: input.sql,
    parameters: boundParameters,
  })
  assertSafeReportingResult(result, safeStrings)
  return result
}

export class ReportingRuntimeController {
  private context: ReportingRuntimeContext | null = null
  private readonly createRuntime: RuntimeFactory
  private queryCache: QueryResultCache
  private readonly createQueryCache: QueryCacheFactory
  private reportState: ReportStateStore
  private readonly createReportState: ReportStateFactory
  private readonly reportListeners = new Set<() => void>()
  private unsubscribeReportState: (() => void) | undefined
  private workspaceSnapshot: ReportingWorkspaceSnapshot
  private prepareQueue: Promise<void> | null = null
  private lifecycleGeneration = 0

  constructor(
    createRuntime: RuntimeFactory = () => new SqliteReportingRuntime(),
    createQueryCache: QueryCacheFactory = () => new QueryResultCache(),
    createReportState: ReportStateFactory = () => new ReportStateStore()
  ) {
    this.createRuntime = createRuntime
    this.createQueryCache = createQueryCache
    this.queryCache = createQueryCache()
    this.createReportState = createReportState
    this.reportState = createReportState()
    this.workspaceSnapshot = this.createWorkspaceSnapshot()
    this.bindReportState(this.reportState)
  }

  prepare(
    snapshot: ReportingDataSnapshot = DEFAULT_REPORTING_DATA,
    dataVersion = 0
  ) {
    const generation = this.lifecycleGeneration
    const start = () => {
      if (generation !== this.lifecycleGeneration) {
        throw new SqliteReportingRuntimeError(
          "SQLITE_NOT_READY",
          "SQLite reporting runtime is not ready."
        )
      }
      return this.prepareSnapshot(snapshot, dataVersion)
    }
    const scheduled = this.prepareQueue
      ? this.prepareQueue.then(start)
      : start()
    const queueTail = scheduled.catch(() => undefined)
    this.prepareQueue = queueTail
    void queueTail.finally(() => {
      if (this.prepareQueue === queueTail) this.prepareQueue = null
    })
    return scheduled
  }

  private async prepareSnapshot(
    snapshot: ReportingDataSnapshot,
    dataVersion: number
  ) {
    let context = this.context
    if (context && context.dataVersion !== dataVersion) {
      await this.disposeContext(context)
      context = null
    }
    if (!context) {
      if (this.queryCache.getStatus().state === "disposed")
        this.queryCache = this.createQueryCache()
      if (this.reportState.getStatus() === "disposed")
        this.bindReportState(this.createReportState())
      context = {
        runtime: this.createRuntime(),
        queryCache: this.queryCache,
        reportState: this.reportState,
        dataVersion,
        safeStrings: collectReportingStrings(snapshot),
        contextId: crypto.randomUUID(),
      }
      this.context = context
    }
    try {
      await context.runtime.initialize(snapshot)
    } catch (error) {
      await this.disposeContext(context)
      throw error
    }
    if (this.context !== context) {
      throw new SqliteReportingRuntimeError(
        "SQLITE_NOT_READY",
        "SQLite reporting runtime is not ready."
      )
    }
  }

  async execute(args: unknown): Promise<SqlQueryResultWithId> {
    const context = this.context
    if (!context) {
      throw new SqliteReportingRuntimeError(
        "SQLITE_NOT_READY",
        "SQLite reporting runtime is not ready."
      )
    }
    const result = await executeReadonlySqlTool(
      context.runtime,
      args,
      context.safeStrings
    )
    if (this.context !== context) {
      throw new SqliteReportingRuntimeError(
        "SQLITE_NOT_READY",
        "SQLite reporting runtime is not ready."
      )
    }
    try {
      const queryId = context.queryCache.add(result)
      this.emitReportChange()
      return { ...result, queryId }
    } catch (error) {
      this.emitReportChange()
      throw error
    }
  }

  getQueryResult = (queryId: QueryId) => this.queryCache.get(queryId)

  getQueryCacheStatus(): QueryCacheStatus {
    return this.queryCache.getStatus()
  }

  getReportStateStore() {
    return this.reportState
  }

  getReportSnapshot = () => this.reportState.getSnapshot()

  getWorkspaceSnapshot = () => this.workspaceSnapshot

  subscribeReport = (listener: () => void) => {
    this.reportListeners.add(listener)
    return () => this.reportListeners.delete(listener)
  }

  updateReportTitle(title: string) {
    return this.requireContext().reportState.updateReport({
      title: validateReportTitle(title),
    })
  }

  updateReportWidgetTitle(widgetId: string, title: string) {
    return this.requireContext().reportState.updateWidgetTitle(
      widgetId,
      validateReportWidgetTitle(title)
    )
  }

  updateReportWidgetLayout(widgetId: string, xSpace: number, ySpace: number) {
    return this.requireContext().reportState.updateWidgetLayout(
      widgetId,
      xSpace,
      ySpace
    )
  }

  moveReportWidget(widgetId: string, toIndex: number) {
    return this.requireContext().reportState.moveWidget(widgetId, toIndex)
  }

  removeReportWidget(widgetId: string) {
    return this.requireContext().reportState.removeWidget(widgetId)
  }

  createNewReport() {
    return this.requireContext().reportState.createReport({
      title: "Untitled report",
    })
  }

  clearActiveReport() {
    this.requireContext().reportState.clearReport()
  }

  createSavedReportSnapshot(): SavedReport | null {
    const report = this.reportState.getSnapshot()
    if (!report) return null
    const context = this.requireContext()
    const queryIds = report.widgets.flatMap((widget) => {
      if (widget.type === "space") return []
      return widget.type === "markdown" || widget.type === "text"
        ? widget.evidenceQueryIds
        : [widget.queryId]
    })
    return {
      contextId: context.contextId,
      report,
      queryResults: this.queryCache.getEntries(queryIds),
      savedAt: new Date().toISOString(),
    }
  }

  loadSavedReport(savedReport: SavedReport) {
    const context = this.requireContext()
    if (savedReport.contextId !== context.contextId) {
      throw new SqliteReportingRuntimeError(
        "SQLITE_CONTEXT_MISMATCH",
        "Saved query evidence belongs to a different reporting context."
      )
    }
    context.queryCache.restore(savedReport.queryResults)
    return context.reportState.loadReport(savedReport.report)
  }

  executeReportTool(name: string, args: unknown) {
    const context = this.context
    if (!context || !isReportAuthoringTool(name)) {
      throw new SqliteReportingRuntimeError(
        "SQLITE_NOT_READY",
        "SQLite reporting runtime is not ready."
      )
    }
    return executeReportAuthoringTool(
      context.queryCache,
      context.reportState,
      name,
      args
    )
  }

  async dispose() {
    this.lifecycleGeneration += 1
    this.prepareQueue = null
    const context = this.context
    if (context) {
      await this.disposeContext(context)
      return
    }
    const queryCache = this.queryCache
    const reportState = this.reportState
    queryCache.dispose()
    if (this.reportState === reportState) {
      this.unsubscribeReportState?.()
      this.unsubscribeReportState = undefined
    }
    reportState.dispose()
    if (this.reportState === reportState) this.emitReportChange()
  }

  private async disposeContext(context: ReportingRuntimeContext) {
    if (this.context === context) this.context = null
    context.queryCache.dispose()
    if (this.reportState === context.reportState) {
      this.unsubscribeReportState?.()
      this.unsubscribeReportState = undefined
    }
    context.reportState.dispose()
    if (this.reportState === context.reportState) this.emitReportChange()
    await context.runtime.dispose()
  }

  private requireContext() {
    if (!this.context) {
      throw new SqliteReportingRuntimeError(
        "SQLITE_NOT_READY",
        "SQLite reporting runtime is not ready."
      )
    }
    return this.context
  }

  private bindReportState(reportState: ReportStateStore) {
    this.unsubscribeReportState?.()
    this.reportState = reportState
    this.unsubscribeReportState = reportState.subscribe(this.emitReportChange)
    this.emitReportChange()
  }

  private emitReportChange = () => {
    this.workspaceSnapshot = this.createWorkspaceSnapshot()
    for (const listener of this.reportListeners) listener()
  }

  private createWorkspaceSnapshot(): ReportingWorkspaceSnapshot {
    return {
      report: this.reportState.getSnapshot(),
      cacheStatus: this.queryCache.getStatus(),
    }
  }
}
