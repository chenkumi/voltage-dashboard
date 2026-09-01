import type { WebMcpRegisteredTool } from "../types"
import { COMPLETION_VERIFIER_SCHEMA_KEY } from "../completion-policy"
import { QueryResultCache } from "./query-cache"
import { ReportStateError, ReportStateStore } from "./report-state"
import type { CachedQueryResult, NewReportWidget, ReportPeriod } from "./types"

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
  xSpace: { type: "integer", minimum: 1, maximum: 6 },
  ySpace: { type: "integer", minimum: 1 },
}

const reportWidgetSchema = {
  oneOf: [
    schema(
      {
        type: { type: "string", const: "metric" },
        ...dataWidgetFields,
        valueColumn: { type: "string" },
        valueFormat: {
          type: "string",
          enum: ["number", "currency", "percent"],
        },
        currencyCode: { type: "string", enum: ["USD", "TWD"] },
        detail: { type: "string", maxLength: 120 },
        detailTone: {
          type: "string",
          enum: ["neutral", "positive", "negative"],
        },
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
        type: { type: "string", const: "markdown" },
        title: { type: "string", maxLength: 120 },
        markdown: {
          type: "string",
          maxLength: 4_000,
          description:
            "Evidence-based Markdown. Use ordinary business formats such as $49,722.51, 12 items, YYYY-MM-DD, and IANA time zones; do not use unformatted 7+ digit sequences. Mermaid fenced blocks are supported. Do not include personal contact, account, payment data, links, HTML, JavaScript, or other code fences.",
        },
        evidenceQueryIds: {
          type: "array",
          maxItems: 16,
          items: { type: "string" },
        },
        xSpace: dataWidgetFields.xSpace,
        ySpace: dataWidgetFields.ySpace,
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
    schema(
      {
        type: { type: "string", const: "space" },
        xSpace: dataWidgetFields.xSpace,
        ySpace: dataWidgetFields.ySpace,
      },
      ["type"]
    ),
  ],
}

const reversibleAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
  completionVerifier: "get_report_state",
}

const withCompletionVerifier = <T extends Record<string, unknown>>(
  value: T
) => ({
  ...value,
  [COMPLETION_VERIFIER_SCHEMA_KEY]: "get_report_state",
})

export const REPORT_AUTHORING_TOOLS: WebMcpRegisteredTool[] = [
  {
    name: "create_report",
    description:
      "Create or replace the single editable report in this Admin workspace. Use verified period metadata and then add widgets that reference queryIds from this workspace. Titles and audiences may use business terms and YYYY-MM-DD dates; never include personal contact, account, or payment data.",
    inputSchema: withCompletionVerifier(
      schema(
        {
          title: { type: "string", maxLength: 120 },
          audience: { type: "string", maxLength: 120 },
          period: reportPeriodSchema,
        },
        ["title"]
      )
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
      "Add one validated Metric, table, Markdown, bar, or space widget to the active report. A Metric shows one numeric value as a number, currency, or percentage, with optional colored detail text. Every widget uses xSpace (1 to 6 columns) and ySpace (a positive row span); a space widget only reserves layout area and has no data fields. Markdown may use ordinary business formats such as $49,722.51, 12 items, YYYY-MM-DD, and IANA time zones, plus standard Markdown and Mermaid fences. Never include personal contact, account, payment data, links, HTML, or JavaScript. The root input must contain only widget; put type, title, queryId, columns, layout, and other widget fields inside widget. Do not include reportId.",
    inputSchema: withCompletionVerifier({
      ...schema({ widget: reportWidgetSchema }, ["widget"]),
      description:
        "Root input: { widget: {...} }. Do not flatten widget fields or include reportId.",
    }),
    annotations: reversibleAnnotations,
  },
  {
    name: "update_report_widget",
    description:
      "Replace one existing report widget with a newly validated declarative widget while preserving its ID.",
    inputSchema: withCompletionVerifier(
      schema(
        {
          widgetId: { type: "string" },
          widget: reportWidgetSchema,
        },
        ["widgetId", "widget"]
      )
    ),
    annotations: reversibleAnnotations,
  },
  {
    name: "move_report_widget",
    description:
      "Move an existing widget to a zero-based position in the active report.",
    inputSchema: withCompletionVerifier(
      schema(
        {
          widgetId: { type: "string" },
          toIndex: { type: "integer", minimum: 0 },
        },
        ["widgetId", "toIndex"]
      )
    ),
    annotations: reversibleAnnotations,
  },
  {
    name: "remove_report_widget",
    description: "Remove one widget from the active in-memory report.",
    inputSchema: withCompletionVerifier(
      schema({ widgetId: { type: "string" } }, ["widgetId"])
    ),
    annotations: reversibleAnnotations,
  },
]

const reportToolNames = new Set(REPORT_AUTHORING_TOOLS.map((tool) => tool.name))

export const isReportAuthoringTool = (name: string) => reportToolNames.has(name)

type JsonObject = Record<string, unknown>

type ReportArgumentErrorCategory =
  | "REPORT_ARGUMENT_ERROR"
  | "REPORT_CREATE_ARGUMENT_ERROR"
  | "REPORT_STATE_ARGUMENT_ERROR"
  | "REPORT_ADD_WIDGET_ARGUMENT_ERROR"
  | "REPORT_UPDATE_WIDGET_ARGUMENT_ERROR"
  | "REPORT_MOVE_WIDGET_ARGUMENT_ERROR"
  | "REPORT_REMOVE_WIDGET_ARGUMENT_ERROR"

const throwArgumentError = (
  message: string,
  category: ReportArgumentErrorCategory = "REPORT_ARGUMENT_ERROR"
): never => {
  throw new ReportStateError(category, message)
}

const assertObject = (
  value: unknown,
  label: string,
  category: ReportArgumentErrorCategory = "REPORT_ARGUMENT_ERROR"
): JsonObject => {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return throwArgumentError(`${label} must be an object.`, category)
  return value as JsonObject
}

const assertKeys = (
  input: JsonObject,
  allowed: readonly string[],
  label: string,
  category: ReportArgumentErrorCategory = "REPORT_ARGUMENT_ERROR"
) => {
  if (Object.keys(input).some((key) => !allowed.includes(key)))
    throwArgumentError(
      `${label} contains unsupported fields. Allowed fields: ${
        allowed.length > 0 ? allowed.join(", ") : "none"
      }.`,
      category
    )
}

const EMAIL_VALUE_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/
const PAYMENT_CARD_VALUE_PATTERN = /(?:\d[ -]?){13,19}/
// A report summary can legitimately contain short, space-separated business
// metrics (for example, "12 - 3 - 4"). Require seven actual digits before
// treating text as a phone number, instead of matching punctuation alone.
const PHONE_VALUE_PATTERN = /\+?(?:\d[\s().-]*){7,15}/g
const ISO_DATE_IN_TEXT_PATTERN = /\b\d{4}-\d{2}-\d{2}\b/g
const COLON_LABELED_VALUE_PATTERN =
  /\b(?:customer\s*(?:id|name)|first\s*name|last\s*name|full\s*name|name|e-?mail|address|phone|account(?:\s*id)?|card\s*number)\b\s*[:：#]\s*([^\n;；]+)/gi
const STRONG_LABELED_VALUE_PATTERN =
  /\b(?:customer\s*(?:id|name)|first\s*name|last\s*name|full\s*name|name|e-?mail|address|phone|account(?:\s*id)?|card\s*number)\b\s+([^\n;；]+)/gi
const CJK_LABELED_VALUE_PATTERN =
  /(?:姓名|電子郵件|地址|電話|帳戶(?:識別(?:號|碼)?)?|帳號|卡號)\s*(?:[:：#]\s*|\s+)([^\n；;]+)/g
const STREET_ADDRESS_PATTERN =
  /\b\d{1,6}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,4}\s+(?:street|st|road|rd|avenue|ave|lane|ln|boulevard|blvd)\b|[一-龥]{1,16}(?:路|街|巷|弄)\d{1,5}(?:號)?/i
const BUSINESS_CONTEXT_WORDS = new Set([
  "account",
  "address",
  "analysis",
  "business",
  "coverage",
  "customer",
  "data",
  "first",
  "full",
  "inventory",
  "last",
  "market",
  "metrics",
  "name",
  "operations",
  "overview",
  "performance",
  "phone",
  "product",
  "report",
  "revenue",
  "sales",
  "summary",
  "team",
  "weekly",
])
const SAFE_CJK_BUSINESS_CONTEXTS = new Set([
  "資料",
  "資料說明",
  "營運",
  "營運團隊",
  "團隊",
  "說明",
  "不在本報表範圍內",
])
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const isCalendarDate = (value: string) => {
  if (!ISO_DATE_PATTERN.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  )
}
const HTML_PATTERN = /[<>]/
const MARKDOWN_LINK_PATTERN =
  /!?\[[^\]]*\]\([^)]*\)|https?:\/\/|mailto:|\bwww\./i
const MARKDOWN_REFERENCE_LINK_PATTERN = /!?\[[^\]]+\]\s*\[[^\]]*\]/
const UNSAFE_MARKDOWN_SYNTAX_PATTERN =
  /~~~|&(?:#[0-9]+|#x[0-9a-f]+|[a-z][a-z0-9]+);|\b(?:html|script|javascript)\b/i
const MARKDOWN_WRAPPER_PATTERN =
  /^\s*<markdown>\s*([\s\S]*?)\s*<\/markdown>\s*$/i
const MARKDOWN_FENCE_PATTERN = /```([^\n`]*)\n([\s\S]*?)```/g

const containsRestrictedDataValue = (value: string) => {
  const valueWithoutDates = value.replaceAll(ISO_DATE_IN_TEXT_PATTERN, "")
  if (
    EMAIL_VALUE_PATTERN.test(value) ||
    PAYMENT_CARD_VALUE_PATTERN.test(valueWithoutDates) ||
    containsRestrictedLabeledValue(value) ||
    STREET_ADDRESS_PATTERN.test(valueWithoutDates)
  )
    return true
  return [...valueWithoutDates.matchAll(PHONE_VALUE_PATTERN)].length > 0
}

const isSafeBusinessContext = (value: string) => {
  const normalized = value
    .trim()
    .replace(/[.!?。！？，,]+$/g, "")
    .trim()
  if (SAFE_CJK_BUSINESS_CONTEXTS.has(normalized.replaceAll(" ", "")))
    return true
  const normalizedEnglish = normalized.toLowerCase().replace(/\s+/g, " ")
  const words = normalizedEnglish.match(/[a-z]+/g)
  return Boolean(
    words?.length &&
    words.join(" ") === normalizedEnglish &&
    words.every((word) => BUSINESS_CONTEXT_WORDS.has(word))
  )
}

const containsRestrictedLabeledValue = (value: string) => {
  const values = [
    ...[...value.matchAll(COLON_LABELED_VALUE_PATTERN)].map(
      (match) => match[1]
    ),
    ...[...value.matchAll(STRONG_LABELED_VALUE_PATTERN)].map(
      (match) => match[1]
    ),
    ...[...value.matchAll(CJK_LABELED_VALUE_PATTERN)].map((match) => match[1]),
  ]
  return values.some((candidate) => !isSafeBusinessContext(candidate))
}

const containsUnsupportedControl = (value: string) =>
  [...value].some((character) => {
    const code = character.charCodeAt(0)
    return code < 32 && code !== 9 && code !== 10 && code !== 13
  })

const assertText = (value: unknown, label: string, maxLength: number) => {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > maxLength ||
    containsUnsupportedControl(value) ||
    HTML_PATTERN.test(value)
  )
    return throwArgumentError(`${label} contains unsupported content.`)
  return value.trim()
}

const assertDisplayText = (
  value: unknown,
  label: string,
  maxLength: number
) => {
  const text = assertText(value, label, maxLength)
  if (containsRestrictedDataValue(text))
    return throwArgumentError(`${label} contains restricted data.`)
  return text
}

export const validateReportTitle = (value: unknown) =>
  assertDisplayText(value, "Report title", 120)

const validateReportAudience = (value: unknown) =>
  assertDisplayText(value, "Report audience", 120)

export const validateReportWidgetTitle = (value: unknown) =>
  assertDisplayText(value, "Widget title", 120)

const assertMarkdown = (value: unknown) => {
  const wrapped =
    typeof value === "string"
      ? value.match(MARKDOWN_WRAPPER_PATTERN)?.[1]
      : undefined
  const markdownSource = wrapped === undefined ? value : wrapped
  if (
    typeof markdownSource !== "string" ||
    markdownSource.trim().length === 0 ||
    markdownSource.length > 4_000 ||
    containsUnsupportedControl(markdownSource) ||
    markdownSource.includes("<")
  )
    return throwArgumentError("Widget markdown contains unsupported content.")
  const markdown = markdownSource.trim()
  if (containsRestrictedDataValue(markdown))
    return throwArgumentError("Widget markdown contains restricted data.")
  const invalidFence = [...markdown.matchAll(MARKDOWN_FENCE_PATTERN)].some(
    (match) => match[1].trim().toLowerCase() !== "mermaid"
  )
  if (
    MARKDOWN_LINK_PATTERN.test(markdown) ||
    MARKDOWN_REFERENCE_LINK_PATTERN.test(markdown) ||
    UNSAFE_MARKDOWN_SYNTAX_PATTERN.test(markdown) ||
    invalidFence ||
    markdown.replaceAll(MARKDOWN_FENCE_PATTERN, "").includes("```")
  )
    throwArgumentError("Widget markdown contains unsupported content.")
  return markdown
}

const assertWidgetId = (value: unknown) => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  )
    return throwArgumentError("Widget ID is invalid.")
  return value
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

const assertMetricValueFormat = (value: unknown) => {
  if (value === undefined) return "number" as const
  if (value === "number" || value === "currency" || value === "percent")
    return value
  return throwArgumentError("Metric value format is invalid.")
}

const assertMetricCurrencyCode = (value: unknown, format: string) => {
  if (value === undefined) return undefined
  if (format !== "currency" || (value !== "USD" && value !== "TWD"))
    return throwArgumentError("Metric currency code is invalid.")
  return value
}

const assertMetricDetailTone = (value: unknown) => {
  if (value === undefined) return "neutral" as const
  if (value === "neutral" || value === "positive" || value === "negative")
    return value
  return throwArgumentError("Metric detail tone is invalid.")
}

const assertWidgetLayout = (input: JsonObject, type: unknown) => {
  const defaults =
    type === "metric"
      ? { xSpace: 2, ySpace: 1 }
      : type === "markdown"
        ? { xSpace: 6, ySpace: 2 }
        : { xSpace: 6, ySpace: 3 }
  const xSpace = input.xSpace ?? defaults.xSpace
  const ySpace = input.ySpace ?? defaults.ySpace
  if (
    !Number.isSafeInteger(xSpace) ||
    (xSpace as number) < 1 ||
    (xSpace as number) > 6 ||
    !Number.isSafeInteger(ySpace) ||
    (ySpace as number) < 1
  )
    return throwArgumentError(
      "Widget layout must use 1 to 6 columns and a positive row span."
    )
  return { xSpace: xSpace as number, ySpace: ySpace as number }
}

const assertColumn = (
  result: CachedQueryResult,
  name: string,
  numeric = false
) => {
  const column = result.columns.find((candidate) => candidate.name === name)
  if (!column)
    return throwArgumentError(
      "Widget references a column that is not in the query."
    )
  if (numeric && column.type !== "number")
    throwArgumentError("Widget value columns must be numeric.")
}

const assertPeriod = (value: unknown): ReportPeriod => {
  const input = assertObject(value, "Report period")
  assertKeys(input, ["start", "end", "timeZone"], "Report period")
  if (
    typeof input.start !== "string" ||
    typeof input.end !== "string" ||
    !isCalendarDate(input.start) ||
    !isCalendarDate(input.end) ||
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
  const layout = assertWidgetLayout(input, type)

  if (type === "space") {
    assertKeys(input, ["type", "xSpace", "ySpace"], "Space widget")
    return { type, ...layout }
  }

  const title = validateReportWidgetTitle(input.title)

  if (type === "markdown") {
    assertKeys(
      input,
      ["type", "title", "markdown", "evidenceQueryIds", "xSpace", "ySpace"],
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
      ...layout,
      markdown: assertMarkdown(input.markdown),
      evidenceQueryIds,
    }
  }

  const queryId = assertQueryId(input.queryId)
  const result = queryCache.get(queryId)
  if (type === "metric") {
    assertKeys(
      input,
      [
        "type",
        "title",
        "queryId",
        "valueColumn",
        "valueFormat",
        "currencyCode",
        "detail",
        "detailTone",
        "xSpace",
        "ySpace",
      ],
      "Metric widget"
    )
    const valueColumn = assertColumnName(input.valueColumn)
    assertColumn(result, valueColumn, true)
    const valueFormat = assertMetricValueFormat(input.valueFormat)
    const currencyCode = assertMetricCurrencyCode(
      input.currencyCode,
      valueFormat
    )
    const detail =
      input.detail === undefined
        ? undefined
        : assertDisplayText(input.detail, "Metric detail", 120)
    if (detail === undefined && input.detailTone !== undefined)
      throwArgumentError("Metric detail tone requires detail text.")
    const detailTone = detail
      ? assertMetricDetailTone(input.detailTone)
      : undefined
    return {
      type,
      title,
      queryId,
      valueColumn,
      valueFormat,
      currencyCode,
      detail,
      detailTone,
      ...layout,
    }
  }
  if (type === "table") {
    assertKeys(
      input,
      ["type", "title", "queryId", "columns", "xSpace", "ySpace"],
      "Table widget"
    )
    const columns = assertStringArray(input.columns, "Table columns", 12)
    if (columns.length === 0)
      throwArgumentError("Table columns must not be empty.")
    for (const column of columns) assertColumn(result, column)
    return { type, title, queryId, columns, ...layout }
  }
  if (type === "bar") {
    assertKeys(
      input,
      [
        "type",
        "title",
        "queryId",
        "categoryColumn",
        "valueColumn",
        "xSpace",
        "ySpace",
      ],
      "Bar widget"
    )
    const categoryColumn = assertColumnName(input.categoryColumn)
    const valueColumn = assertColumnName(input.valueColumn)
    assertColumn(result, categoryColumn)
    assertColumn(result, valueColumn, true)
    return { type, title, queryId, categoryColumn, valueColumn, ...layout }
  }
  return throwArgumentError("Widget type is not supported.")
}

const assertRootInput = (
  args: unknown,
  allowed: readonly string[],
  category: ReportArgumentErrorCategory
) => {
  const input = assertObject(args, "Report tool input", category)
  assertKeys(input, allowed, "Report tool input", category)
  return input
}

export const executeReportAuthoringTool = (
  queryCache: QueryResultCache,
  reportState: ReportStateStore,
  name: string,
  args: unknown
) => {
  if (name === "create_report") {
    const input = assertRootInput(
      args,
      ["title", "audience", "period"],
      "REPORT_CREATE_ARGUMENT_ERROR"
    )
    const report = reportState.createReport({
      title: validateReportTitle(input.title),
      audience:
        input.audience === undefined
          ? undefined
          : validateReportAudience(input.audience),
      period:
        input.period === undefined ? undefined : assertPeriod(input.period),
    })
    return { status: "OK", report }
  }
  if (name === "get_report_state") {
    assertRootInput(args, [], "REPORT_STATE_ARGUMENT_ERROR")
    return {
      status: "OK",
      report: reportState.getSnapshot(),
      cacheStatus: queryCache.getStatus(),
    }
  }
  if (name === "add_report_widget") {
    const input = assertRootInput(
      args,
      ["widget"],
      "REPORT_ADD_WIDGET_ARGUMENT_ERROR"
    )
    const widget = reportState.addWidget(parseWidget(input.widget, queryCache))
    return { status: "OK", widget, report: reportState.getSnapshot() }
  }
  if (name === "update_report_widget") {
    const input = assertRootInput(
      args,
      ["widgetId", "widget"],
      "REPORT_UPDATE_WIDGET_ARGUMENT_ERROR"
    )
    const widgetId = assertWidgetId(input.widgetId)
    const widget = reportState.replaceWidget(
      widgetId,
      parseWidget(input.widget, queryCache)
    )
    return { status: "OK", widget, report: reportState.getSnapshot() }
  }
  if (name === "move_report_widget") {
    const input = assertRootInput(
      args,
      ["widgetId", "toIndex"],
      "REPORT_MOVE_WIDGET_ARGUMENT_ERROR"
    )
    const widgetId = assertWidgetId(input.widgetId)
    if (!Number.isInteger(input.toIndex))
      throwArgumentError("Widget position must be an integer.")
    return {
      status: "OK",
      report: reportState.moveWidget(widgetId, input.toIndex as number),
    }
  }
  if (name === "remove_report_widget") {
    const input = assertRootInput(
      args,
      ["widgetId"],
      "REPORT_REMOVE_WIDGET_ARGUMENT_ERROR"
    )
    const widgetId = assertWidgetId(input.widgetId)
    return { status: "OK", report: reportState.removeWidget(widgetId) }
  }
  return throwArgumentError("Unknown report tool.")
}
