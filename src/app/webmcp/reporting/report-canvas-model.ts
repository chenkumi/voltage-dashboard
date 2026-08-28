import type {
  BarReportWidget,
  CachedQueryResult,
  QueryCacheStatus,
  ReportWidget,
} from "./types"

export const getCacheLimitMessage = (status: QueryCacheStatus) => {
  if (!status.limitReached) return null
  if (status.lastRejection === "QUERY_CACHE_ENTRY_TOO_LARGE")
    return "The latest query result was too large to cache. Existing report evidence remains available."
  return "Query cache limit reached. Existing report evidence remains available, but new query results cannot be added."
}

export const shouldCommitTitleOnBlur = (cancelPending: boolean) =>
  !cancelPending

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
      widget.type === "kpi" &&
      (columns.get(widget.valueColumn) !== "number" ||
        (widget.comparisonColumn !== undefined &&
          columns.get(widget.comparisonColumn) !== "number"))
    )
      return { status: "error", message: "KPI column mapping is unavailable." }
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
