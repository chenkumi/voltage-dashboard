import type { WebMcpRegisteredTool } from "../types"
import { QueryResultCache } from "./query-cache"
import { ReportStateError, ReportStateStore } from "./report-state"
import type { NewReportWidget, ReportPeriod, SqlQueryResult } from "./types"

const schema = (
  properties: Record<string, unknown>,
  required: string[] = []
) => ({ type: "object", properties, required, additionalProperties: false })

const reportPeriodSchema = schema(
  {
    start: { type: "string", format: "date" },
    end: { type: "string", format: "date" },
    timeZone: { type: "string", enum: ["Asia/Taipei"] },
  },
  ["start", "end", "timeZone"]
)

const dataWidgetFields = {
  title: { type: "string", maxLength: 120 },
  queryId: { type: "string", description: "A queryId from this workspace." },
}

const reportWidgetSchema = {
  oneOf: [
    schema(
      {
        type: { type: "string", const: "kpi" },
        ...dataWidgetFields,
        valueColumn: { type: "string" },
        comparisonColumn: { type: "string" },
      },
      ["type", "title", "queryId", "valueColumn"]
    ),
    schema(
      {
        type: { type: "string", const: "table" },
        ...dataWidgetFields,
        columns: {
          type: "array",
          minItems: 1,
          maxItems: 12,
          items: { type: "string" },
        },
      },
      ["type", "title", "queryId", "columns"]
    ),
    schema(
      {
        type: { type: "string", const: "text" },
        title: { type: "string", maxLength: 120 },
        markdown: { type: "string", maxLength: 4_000 },
        evidenceQueryIds: {
          type: "array",
          maxItems: 16,
          items: { type: "string" },
        },
      },
      ["type", "title", "markdown", "evidenceQueryIds"]
    ),
    schema(
      {
        type: { type: "string", const: "bar" },
        ...dataWidgetFields,
        categoryColumn: { type: "string" },
        valueColumn: { type: "string" },
      },
      ["type", "title", "queryId", "categoryColumn", "valueColumn"]
    ),
  ],
}

const reversibleAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
}

export const REPORT_AUTHORING_TOOLS: WebMcpRegisteredTool[] = [
  {
    name: "create_report",
    description:
      "Create or replace the single editable report in this Admin workspace. Use verified period metadata and then add widgets that reference queryIds from this workspace.",
    inputSchema: schema(
      {
        title: { type: "string", maxLength: 120 },
        audience: { type: "string", maxLength: 120 },
        period: reportPeriodSchema,
      },
      ["title"]
    ),
    annotations: reversibleAnnotations,
  },
  {
    name: "get_report_state",
    description:
      "Read the current editable report and query-cache status in this Admin workspace.",
    inputSchema: schema({}),
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "add_report_widget",
    description:
      "Add one validated KPI, table, safe Markdown text, or bar widget to the active report.",
    inputSchema: schema({ widget: reportWidgetSchema }, ["widget"]),
    annotations: reversibleAnnotations,
  },
  {
    name: "update_report_widget",
    description:
      "Replace one existing report widget with a newly validated declarative widget while preserving its ID.",
    inputSchema: schema(
      {
        widgetId: { type: "string" },
        widget: reportWidgetSchema,
      },
      ["widgetId", "widget"]
    ),
    annotations: reversibleAnnotations,
  },
  {
    name: "move_report_widget",
    description:
      "Move an existing widget to a zero-based position in the active report.",
    inputSchema: schema(
      {
        widgetId: { type: "string" },
        toIndex: { type: "integer", minimum: 0 },
      },
      ["widgetId", "toIndex"]
    ),
    annotations: reversibleAnnotations,
  },
  {
    name: "remove_report_widget",
    description: "Remove one widget from the active in-memory report.",
    inputSchema: schema({ widgetId: { type: "string" } }, ["widgetId"]),
    annotations: reversibleAnnotations,
  },
]

const reportToolNames = new Set(REPORT_AUTHORING_TOOLS.map((tool) => tool.name))

export const isReportAuthoringTool = (name: string) => reportToolNames.has(name)

type JsonObject = Record<string, unknown>

const throwArgumentError = (message: string): never => {
  throw new ReportStateError("REPORT_ARGUMENT_ERROR", message)
}

const assertObject = (value: unknown, label: string): JsonObject => {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return throwArgumentError(`${label} must be an object.`)
  return value as JsonObject
}

const assertKeys = (
  input: JsonObject,
  allowed: readonly string[],
  label: string
) => {
  if (Object.keys(input).some((key) => !allowed.includes(key)))
    throwArgumentError(`${label} contains unsupported fields.`)
}

const EMAIL_TEXT_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/
const PAYMENT_TEXT_PATTERN = /(?:\d[ -]?){13,19}/
const PHONE_TEXT_PATTERN = /\+?[\d ()-]{8,}/g
const SENSITIVE_TERM_PATTERN =
  /customer\s*name|first\s*name|last\s*name|e-?mail|address|phone|account|card\s*number|payment|姓名|電子郵件|地址|電話|帳戶|卡號|付款/i
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const HTML_PATTERN = /[<>]/
const MARKDOWN_LINK_PATTERN =
  /!?\[[^\]]*\]\([^)]*\)|https?:\/\/|mailto:|\bwww\./i
const UNSAFE_MARKDOWN_SYNTAX_PATTERN =
  /(?:\[|\])|```|~~~|&(?:#[0-9]+|#x[0-9a-f]+|[a-z][a-z0-9]+);|\b(?:html|script|javascript|mermaid)\b/i

const containsSensitiveText = (value: string) => {
  if (
    EMAIL_TEXT_PATTERN.test(value) ||
    PAYMENT_TEXT_PATTERN.test(value) ||
    SENSITIVE_TERM_PATTERN.test(value)
  )
    return true
  return [...value.matchAll(PHONE_TEXT_PATTERN)].some(
    (match) => !ISO_DATE_PATTERN.test(match[0].trim())
  )
}

const containsUnsupportedControl = (value: string) =>
  [...value].some((character) => {
    const code = character.charCodeAt(0)
    return code < 32 && code !== 9 && code !== 10 && code !== 13
  })

const assertSafeString = (value: unknown, label: string, maxLength: number) => {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > maxLength ||
    containsUnsupportedControl(value) ||
    containsSensitiveText(value) ||
    HTML_PATTERN.test(value)
  )
    return throwArgumentError(`${label} contains unsupported content.`)
  return value.trim()
}

const assertMarkdown = (value: unknown) => {
  const markdown = assertSafeString(value, "Widget markdown", 4_000)
  if (
    MARKDOWN_LINK_PATTERN.test(markdown) ||
    UNSAFE_MARKDOWN_SYNTAX_PATTERN.test(markdown)
  )
    throwArgumentError("Widget markdown contains unsupported content.")
  return markdown
}

const assertQueryId = (value: unknown) => {
  if (typeof value !== "string" || !/^[0-9A-HJKMNP-TV-Z]{26}$/.test(value))
    return throwArgumentError("queryId must identify this workspace.")
  return value
}

const assertColumnName = (value: unknown) => {
  if (typeof value !== "string" || value.length === 0 || value.length > 128)
    return throwArgumentError("Widget column name is invalid.")
  return value
}

const assertColumn = (
  result: SqlQueryResult,
  name: string,
  numeric = false
) => {
  const column = result.columns.find((candidate) => candidate.name === name)
  if (!column)
    throwArgumentError("Widget references a column that is not in the query.")
  if (numeric && column.type !== "number")
    throwArgumentError("Widget value columns must be numeric.")
}

const assertPeriod = (value: unknown): ReportPeriod => {
  const input = assertObject(value, "Report period")
  assertKeys(input, ["start", "end", "timeZone"], "Report period")
  if (
    typeof input.start !== "string" ||
    typeof input.end !== "string" ||
    !ISO_DATE_PATTERN.test(input.start) ||
    !ISO_DATE_PATTERN.test(input.end) ||
    input.start > input.end ||
    input.timeZone !== "Asia/Taipei"
  )
    return throwArgumentError("Report period is invalid.")
  return {
    start: input.start,
    end: input.end,
    timeZone: input.timeZone,
  }
}

const assertStringArray = (value: unknown, label: string, maxItems: number) => {
  if (!Array.isArray(value) || value.length > maxItems)
    return throwArgumentError(`${label} must be a limited array.`)
  const items = value.map(assertColumnName)
  if (new Set(items).size !== items.length)
    throwArgumentError(`${label} cannot contain duplicates.`)
  return items
}

const parseWidget = (
  value: unknown,
  queryCache: QueryResultCache
): NewReportWidget => {
  const input = assertObject(value, "Widget")
  const type = input.type
  const title = assertSafeString(input.title, "Widget title", 120)

  if (type === "text") {
    assertKeys(
      input,
      ["type", "title", "markdown", "evidenceQueryIds"],
      "Text widget"
    )
    const evidenceQueryIds = assertStringArray(
      input.evidenceQueryIds,
      "Evidence query IDs",
      16
    ).map(assertQueryId)
    for (const queryId of evidenceQueryIds) queryCache.get(queryId)
    return {
      type,
      title,
      markdown: assertMarkdown(input.markdown),
      evidenceQueryIds,
    }
  }

  const queryId = assertQueryId(input.queryId)
  const result = queryCache.get(queryId)
  if (type === "kpi") {
    assertKeys(
      input,
      ["type", "title", "queryId", "valueColumn", "comparisonColumn"],
      "KPI widget"
    )
    const valueColumn = assertColumnName(input.valueColumn)
    assertColumn(result, valueColumn, true)
    const comparisonColumn =
      input.comparisonColumn === undefined
        ? undefined
        : assertColumnName(input.comparisonColumn)
    if (comparisonColumn) assertColumn(result, comparisonColumn, true)
    return { type, title, queryId, valueColumn, comparisonColumn }
  }
  if (type === "table") {
    assertKeys(input, ["type", "title", "queryId", "columns"], "Table widget")
    const columns = assertStringArray(input.columns, "Table columns", 12)
    if (columns.length === 0)
      throwArgumentError("Table columns must not be empty.")
    for (const column of columns) assertColumn(result, column)
    return { type, title, queryId, columns }
  }
  if (type === "bar") {
    assertKeys(
      input,
      ["type", "title", "queryId", "categoryColumn", "valueColumn"],
      "Bar widget"
    )
    const categoryColumn = assertColumnName(input.categoryColumn)
    const valueColumn = assertColumnName(input.valueColumn)
    assertColumn(result, categoryColumn)
    assertColumn(result, valueColumn, true)
    return { type, title, queryId, categoryColumn, valueColumn }
  }
  return throwArgumentError("Widget type is not supported.")
}

const assertRootInput = (args: unknown, allowed: readonly string[]) => {
  const input = assertObject(args, "Report tool input")
  assertKeys(input, allowed, "Report tool input")
  return input
}

export const executeReportAuthoringTool = (
  queryCache: QueryResultCache,
  reportState: ReportStateStore,
  name: string,
  args: unknown
) => {
  if (name === "create_report") {
    const input = assertRootInput(args, ["title", "audience", "period"])
    const report = reportState.createReport({
      title: assertSafeString(input.title, "Report title", 120),
      audience:
        input.audience === undefined
          ? undefined
          : assertSafeString(input.audience, "Report audience", 120),
      period:
        input.period === undefined ? undefined : assertPeriod(input.period),
    })
    return { status: "OK", report }
  }
  if (name === "get_report_state") {
    assertRootInput(args, [])
    return {
      status: "OK",
      report: reportState.getSnapshot(),
      cacheStatus: queryCache.getStatus(),
    }
  }
  if (name === "add_report_widget") {
    const input = assertRootInput(args, ["widget"])
    const widget = reportState.addWidget(parseWidget(input.widget, queryCache))
    return { status: "OK", widget, report: reportState.getSnapshot() }
  }
  if (name === "update_report_widget") {
    const input = assertRootInput(args, ["widgetId", "widget"])
    const widgetId = assertSafeString(input.widgetId, "Widget ID", 128)
    const widget = reportState.replaceWidget(
      widgetId,
      parseWidget(input.widget, queryCache)
    )
    return { status: "OK", widget, report: reportState.getSnapshot() }
  }
  if (name === "move_report_widget") {
    const input = assertRootInput(args, ["widgetId", "toIndex"])
    const widgetId = assertSafeString(input.widgetId, "Widget ID", 128)
    if (!Number.isInteger(input.toIndex))
      throwArgumentError("Widget position must be an integer.")
    return {
      status: "OK",
      report: reportState.moveWidget(widgetId, input.toIndex as number),
    }
  }
  if (name === "remove_report_widget") {
    const input = assertRootInput(args, ["widgetId"])
    const widgetId = assertSafeString(input.widgetId, "Widget ID", 128)
    return { status: "OK", report: reportState.removeWidget(widgetId) }
  }
  return throwArgumentError("Unknown report tool.")
}
