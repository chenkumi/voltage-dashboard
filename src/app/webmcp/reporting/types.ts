export type SqlScalar = string | number | boolean | null

export type SqlQueryInput = {
  sql: string
  parameters?: SqlScalar[]
}

export type SqlColumn = {
  name: string
  type: "string" | "number" | "boolean" | "null"
}

export type SqlQueryResult = {
  columns: SqlColumn[]
  rows: Array<Record<string, SqlScalar>>
  rowCount: number
  truncated: boolean
  executionTimeMs: number
}

export type QueryId = string

export type CachedQueryResult = {
  readonly columns: readonly Readonly<SqlColumn>[]
  readonly rows: readonly Readonly<Record<string, SqlScalar>>[]
  readonly rowCount: number
  readonly truncated: boolean
  readonly executionTimeMs: number
}

export type SqlQueryResultWithId = SqlQueryResult & {
  queryId: QueryId
}

export type QueryCacheState = "active" | "disposed"

export type QueryCacheStatus = {
  state: QueryCacheState
  entryCount: number
  totalBytes: number
  maxEntries: number
  maxTotalBytes: number
  limitReached: boolean
  lastRejection: QueryCacheErrorCategory | null
}

export type QueryCacheErrorCategory =
  | "QUERY_CACHE_DISPOSED"
  | "QUERY_CACHE_ENTRY_TOO_LARGE"
  | "QUERY_CACHE_LIMIT_EXCEEDED"
  | "QUERY_CACHE_NOT_FOUND"

export type ReportPeriod = {
  start: string
  end: string
  timeZone: "Asia/Taipei"
}

type ReportWidgetBase = {
  id: string
  title: string
  /** Width in the six-column report grid. */
  xSpace?: number
  /** Height in grid rows. There is intentionally no product limit. */
  ySpace?: number
}

export type MetricValueFormat = "number" | "currency" | "percent"

export type MetricCurrencyCode = "USD" | "TWD"

export type MetricDetailTone = "neutral" | "positive" | "negative"

export type MetricReportWidget = ReportWidgetBase & {
  type: "metric"
  queryId: QueryId
  valueColumn: string
  valueFormat?: MetricValueFormat
  currencyCode?: MetricCurrencyCode
  detail?: string
  detailTone?: MetricDetailTone
}

export type TableReportWidget = ReportWidgetBase & {
  type: "table"
  queryId: QueryId
  columns: readonly string[]
}

type MarkdownReportWidgetBase = ReportWidgetBase & {
  markdown: string
  evidenceQueryIds: readonly QueryId[]
}

export type MarkdownReportWidget = MarkdownReportWidgetBase & {
  type: "markdown"
}

/** Allows reports saved by the former TextWidget to remain readable. */
export type LegacyTextReportWidget = MarkdownReportWidgetBase & {
  type: "text"
}

export type BarReportWidget = ReportWidgetBase & {
  type: "bar"
  queryId: QueryId
  categoryColumn: string
  valueColumn: string
}

export type SpaceReportWidget = {
  id: string
  type: "space"
  xSpace: number
  ySpace: number
}

export type ReportWidget =
  | MetricReportWidget
  | TableReportWidget
  | MarkdownReportWidget
  | LegacyTextReportWidget
  | BarReportWidget
  | SpaceReportWidget

export type NewReportWidget =
  | Omit<MetricReportWidget, "id">
  | Omit<TableReportWidget, "id">
  | Omit<MarkdownReportWidget, "id">
  | Omit<BarReportWidget, "id">
  | Omit<SpaceReportWidget, "id">

export type Report = {
  id: string
  title: string
  audience?: string
  period?: ReportPeriod
  widgets: readonly ReportWidget[]
  createdAt: string
  updatedAt: string
}

export type ReportingWorkspaceSnapshot = {
  report: Report | null
  cacheStatus: QueryCacheStatus
}

export type SavedQueryResult = {
  queryId: QueryId
  result: CachedQueryResult
}

export type SavedReport = {
  contextId: string
  report: Report
  queryResults: readonly SavedQueryResult[]
  savedAt: string
}

export type SavedReportSummary = Pick<
  Report,
  "id" | "title" | "createdAt" | "updatedAt"
> & {
  widgetCount: number
  savedAt: string
}

export type ReportErrorCategory =
  | "REPORT_ARGUMENT_ERROR"
  | "REPORT_CREATE_ARGUMENT_ERROR"
  | "REPORT_STATE_ARGUMENT_ERROR"
  | "REPORT_ADD_WIDGET_ARGUMENT_ERROR"
  | "REPORT_UPDATE_WIDGET_ARGUMENT_ERROR"
  | "REPORT_MOVE_WIDGET_ARGUMENT_ERROR"
  | "REPORT_REMOVE_WIDGET_ARGUMENT_ERROR"
  | "REPORT_NOT_FOUND"
  | "REPORT_STATE_DISPOSED"
  | "REPORT_WIDGET_NOT_FOUND"

export type ReportingWorkerRequest =
  | { id: string; type: "init"; snapshot: ReportingDataSnapshot }
  | ({ id: string; type: "execute" } & SqlQueryInput)
  | { id: string; type: "dispose" }

export type ReportingWorkerResponse =
  | { id: string; type: "ready" }
  | { id: string; type: "result"; result: SqlQueryResult }
  | { id: string; type: "disposed" }
  | {
      id: string
      type: "error"
      error: { category: string; message: string }
    }

export interface ReportingWorkerPort {
  postMessage(message: ReportingWorkerRequest): void
  terminate(): void
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<ReportingWorkerResponse>) => void
  ): void
  addEventListener(type: "error", listener: (event: ErrorEvent) => void): void
  removeEventListener(
    type: "message",
    listener: (event: MessageEvent<ReportingWorkerResponse>) => void
  ): void
  removeEventListener(
    type: "error",
    listener: (event: ErrorEvent) => void
  ): void
}
import type { ReportingDataSnapshot } from "./reporting-data"
