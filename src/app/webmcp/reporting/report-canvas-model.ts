import type {
  BarReportWidget,
  CachedQueryResult,
  MetricCurrencyCode,
  MetricValueFormat,
  QueryCacheStatus,
  ReportWidget,
  SqlScalar,
} from "./types"

const metricNumberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
})

const metricPercentFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  style: "percent",
})

const metricCurrencyFormatters = {
  TWD: new Intl.NumberFormat("en-US", {
    currency: "TWD",
    maximumFractionDigits: 0,
    style: "currency",
  }),
  USD: new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 2,
    style: "currency",
  }),
}

export const getCacheLimitMessage = (status: QueryCacheStatus) => {
  if (!status.limitReached) return null
  if (status.lastRejection === "QUERY_CACHE_ENTRY_TOO_LARGE")
    return "The latest query result was too large to cache. Existing report evidence remains available."
  return "Query cache limit reached. Existing report evidence remains available, but new query results cannot be added."
}

export const shouldCommitTitleOnBlur = (cancelPending: boolean) =>
  !cancelPending

export const toggleWidgetEditor = (
  activeWidgetId: string | null,
  widgetId: string
) => (activeWidgetId === widgetId ? null : widgetId)

export const formatMetricValue = (
  value: SqlScalar | undefined,
  format: MetricValueFormat | undefined,
  currencyCode: MetricCurrencyCode | undefined
) => {
  if (value === null || value === undefined) return "—"
  if (typeof value !== "number") return String(value)
  if (format === "percent") return metricPercentFormatter.format(value)
  if (format === "currency")
    return metricCurrencyFormatters[currencyCode ?? "USD"].format(value)
  return metricNumberFormatter.format(value)
}

type QueryResultGetter = (queryId: string) => CachedQueryResult

export type ResolvedReportWidget =
  | { status: "ready"; result?: CachedQueryResult }
  | { status: "error"; message: string }

export const resolveReportWidget = (
  widget: ReportWidget,
  getQueryResult: QueryResultGetter
): ResolvedReportWidget => {
  try {
    if (widget.type === "space") return { status: "ready" }
    if (widget.type === "markdown" || widget.type === "text") {
      for (const queryId of widget.evidenceQueryIds) getQueryResult(queryId)
      return { status: "ready" }
    }
    const result = getQueryResult(widget.queryId)
    const columns = new Map(
      result.columns.map((column) => [column.name, column.type])
    )
    if (
      widget.type === "metric" &&
      columns.get(widget.valueColumn) !== "number"
    )
      return {
        status: "error",
        message: "Metric column mapping is unavailable.",
      }
    if (
      widget.type === "table" &&
      widget.columns.some((column) => !columns.has(column))
    )
      return {
        status: "error",
        message: "One or more table columns are unavailable.",
      }
    if (
      widget.type === "bar" &&
      (!columns.has(widget.categoryColumn) ||
        columns.get(widget.valueColumn) !== "number")
    )
      return { status: "error", message: "Bar column mapping is unavailable." }
    return { status: "ready", result }
  } catch {
    return {
      status: "error",
      message: "The query evidence is no longer available in this workspace.",
    }
  }
}

export type BarDisplayRow = {
  label: string
  value: number
  widthPercent: number
}

export const createBarDisplayRows = (
  widget: BarReportWidget,
  result: CachedQueryResult
): BarDisplayRow[] => {
  const rows = result.rows.flatMap((row) => {
    const value = row[widget.valueColumn]
    if (typeof value !== "number") return []
    return [
      {
        label: String(row[widget.categoryColumn] ?? "—"),
        value,
      },
    ]
  })
  let maxValue = 0
  for (const row of rows) maxValue = Math.max(maxValue, Math.abs(row.value))
  return rows.slice(0, 12).map((row) => ({
    ...row,
    widthPercent: maxValue === 0 ? 0 : (Math.abs(row.value) / maxValue) * 100,
  }))
}
