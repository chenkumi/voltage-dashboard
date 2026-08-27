import {
  ArrowDown,
  ArrowUp,
  Database,
  FileChartColumn,
  Trash2,
} from "lucide-react"
import { useRef, useState, useSyncExternalStore } from "react"
import ReactMarkdown from "react-markdown"
import { Button } from "@/components/ui/button"
import {
  createBarDisplayRows,
  getCacheLimitMessage,
  resolveReportWidget,
  shouldCommitTitleOnBlur,
} from "./report-canvas-model"
import type { ReportingRuntimeController } from "./reporting-tools"
import type {
  BarReportWidget,
  CachedQueryResult,
  QueryCacheStatus,
  ReportWidget,
  SqlScalar,
} from "./types"
import "./report-canvas.css"

const scalarFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
})

const formatScalar = (value: SqlScalar | undefined) => {
  if (value === null || value === undefined) return "—"
  if (typeof value === "number") return scalarFormatter.format(value)
  return String(value)
}

const EditableTitle = ({
  value,
  label,
  className,
  onCommit,
}: {
  value: string
  label: string
  className: string
  onCommit: (value: string) => void
}) => {
  const [draft, setDraft] = useState(value)
  const [error, setError] = useState("")
  const cancelBlurRef = useRef(false)

  const commit = () => {
    if (draft === value) return
    try {
      onCommit(draft)
      setError("")
    } catch {
      setDraft(value)
      setError("This title contains unsupported or sensitive content.")
    }
  }

  return (
    <span className="report-editable-title">
      <input
        aria-label={label}
        aria-invalid={error ? true : undefined}
        className={className}
        maxLength={120}
        value={draft}
        onBlur={() => {
          if (!shouldCommitTitleOnBlur(cancelBlurRef.current)) {
            cancelBlurRef.current = false
            return
          }
          commit()
        }}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur()
          if (event.key === "Escape") {
            cancelBlurRef.current = true
            setDraft(value)
            setError("")
            event.currentTarget.blur()
          }
        }}
      />
      {error ? <small role="alert">{error}</small> : null}
    </span>
  )
}

const QueryNotice = ({ result }: { result: CachedQueryResult }) => (
  <>
    {result.rowCount === 0 ? (
      <p className="report-query-notice" role="status">
        This query returned no rows. No value is inferred.
      </p>
    ) : null}
    {result.truncated ? (
      <p className="report-query-notice" role="status">
        This query result was truncated. The widget does not represent the full
        dataset.
      </p>
    ) : null}
  </>
)

const KpiWidget = ({
  result,
  widget,
}: {
  result: CachedQueryResult
  widget: Extract<ReportWidget, { type: "kpi" }>
}) => {
  const row = result.rows[0]
  return (
    <div className="report-kpi">
      <strong>{formatScalar(row?.[widget.valueColumn])}</strong>
      {widget.comparisonColumn ? (
        <span>Comparison: {formatScalar(row?.[widget.comparisonColumn])}</span>
      ) : null}
      <QueryNotice result={result} />
    </div>
  )
}

const TableWidget = ({
  result,
  widget,
}: {
  result: CachedQueryResult
  widget: Extract<ReportWidget, { type: "table" }>
}) => (
  <div>
    <div className="report-table-wrap">
      <table className="report-table">
        <thead>
          <tr>
            {widget.columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.length === 0 ? (
            <tr>
              <td colSpan={widget.columns.length}>No rows returned.</td>
            </tr>
          ) : (
            result.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {widget.columns.map((column) => (
                  <td key={column}>{formatScalar(row[column])}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
    <QueryNotice result={result} />
  </div>
)

const TextWidget = ({
  widget,
}: {
  widget: Extract<ReportWidget, { type: "text" }>
}) => (
  <div className="report-markdown">
    <ReactMarkdown
      skipHtml
      disallowedElements={["a", "img", "pre"]}
      unwrapDisallowed
    >
      {widget.markdown}
    </ReactMarkdown>
    <p className="report-evidence-count">
      <Database className="size-3.5" />
      {widget.evidenceQueryIds.length} evidence quer
      {widget.evidenceQueryIds.length === 1 ? "y" : "ies"}
    </p>
  </div>
)

const BarWidget = ({
  result,
  widget,
}: {
  result: CachedQueryResult
  widget: BarReportWidget
}) => {
  const rows = createBarDisplayRows(widget, result)
  return (
    <div>
      <div
        className="report-bars"
        role="img"
        aria-label={`${widget.title}: ${rows.length} category values`}
      >
        {rows.map((row, index) => (
          <div className="report-bar-row" key={`${row.label}-${index}`}>
            <span title={row.label}>{row.label}</span>
            <span className="report-bar-track" aria-hidden="true">
              <span style={{ width: `${row.widthPercent}%` }} />
            </span>
            <strong>{formatScalar(row.value)}</strong>
          </div>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="report-query-notice">No chart rows returned.</p>
      ) : null}
      {result.rows.length > rows.length ? (
        <p className="report-query-notice">
          Showing the first 12 categories from this query.
        </p>
      ) : null}
      <QueryNotice result={result} />
    </div>
  )
}

const CacheLimitNotice = ({ status }: { status: QueryCacheStatus }) => {
  const message = getCacheLimitMessage(status)
  return message ? (
    <div className="report-cache-notice" role="status">
      {message}
    </div>
  ) : null
}

export const ReportCanvas = ({
  controller,
}: {
  controller: ReportingRuntimeController
}) => {
  const workspace = useSyncExternalStore(
    controller.subscribeReport,
    controller.getWorkspaceSnapshot,
    controller.getWorkspaceSnapshot
  )
  const { report, cacheStatus } = workspace

  if (!report)
    return (
      <div className="report-canvas">
        <CacheLimitNotice status={cacheStatus} />
        <section className="report-empty" aria-label="Empty report canvas">
          <span>
            <FileChartColumn className="size-6" />
          </span>
          <p>Editable report canvas</p>
          <h2>Start with a question, not a template.</h2>
          <div>
            Ask the Agent to inspect dataset status, explore the curated data
            with SQL, and build a report from verified query evidence. No fixed
            widgets are added in advance.
          </div>
        </section>
      </div>
    )

  return (
    <section className="report-canvas" aria-label="Editable report canvas">
      <header className="report-canvas-header">
        <div>
          <p>Active report · editable by you and the Agent</p>
          <EditableTitle
            key={`${report.id}-${report.title}`}
            value={report.title}
            label="Report title"
            className="report-title-input"
            onCommit={(title) => controller.updateReportTitle(title)}
          />
        </div>
        <dl>
          <div>
            <dt>Period</dt>
            <dd>
              {report.period
                ? `${report.period.start} — ${report.period.end}`
                : "Not specified"}
            </dd>
          </div>
          <div>
            <dt>Time zone</dt>
            <dd>{report.period?.timeZone ?? "Not specified"}</dd>
          </div>
          <div>
            <dt>Updated</dt>
            <dd>{new Date(report.updatedAt).toLocaleString("en-US")}</dd>
          </div>
        </dl>
      </header>

      <CacheLimitNotice status={cacheStatus} />

      {report.widgets.length === 0 ? (
        <div className="report-widget-empty">
          The report exists, but it has no widgets yet. Ask the Agent to add a
          KPI, table, evidence note, or bar chart.
        </div>
      ) : (
        <div className="report-widget-grid">
          {report.widgets.map((widget, index) => {
            const resolved = resolveReportWidget(
              widget,
              controller.getQueryResult
            )
            return (
              <article
                className={`report-widget report-widget-${widget.type}`}
                key={widget.id}
              >
                <header>
                  <div>
                    <span>{widget.type}</span>
                    <EditableTitle
                      key={`${widget.id}-${widget.title}`}
                      value={widget.title}
                      label={`${widget.type} widget title`}
                      className="report-widget-title-input"
                      onCommit={(title) =>
                        controller.updateReportWidgetTitle(widget.id, title)
                      }
                    />
                  </div>
                  <div className="report-widget-actions">
                    <Button
                      aria-label={`Move ${widget.title} earlier`}
                      className="cursor-pointer"
                      disabled={index === 0}
                      size="icon-sm"
                      title="Move earlier"
                      variant="ghost"
                      onClick={() =>
                        controller.moveReportWidget(widget.id, index - 1)
                      }
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      aria-label={`Move ${widget.title} later`}
                      className="cursor-pointer"
                      disabled={index === report.widgets.length - 1}
                      size="icon-sm"
                      title="Move later"
                      variant="ghost"
                      onClick={() =>
                        controller.moveReportWidget(widget.id, index + 1)
                      }
                    >
                      <ArrowDown />
                    </Button>
                    <Button
                      aria-label={`Remove ${widget.title}`}
                      className="cursor-pointer"
                      size="icon-sm"
                      title="Remove widget"
                      variant="destructive"
                      onClick={() => controller.removeReportWidget(widget.id)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </header>

                {resolved.status === "error" ? (
                  <div className="report-widget-error" role="alert">
                    {resolved.message}
                  </div>
                ) : widget.type === "text" ? (
                  <TextWidget widget={widget} />
                ) : widget.type === "kpi" && resolved.result ? (
                  <KpiWidget result={resolved.result} widget={widget} />
                ) : widget.type === "table" && resolved.result ? (
                  <TableWidget result={resolved.result} widget={widget} />
                ) : widget.type === "bar" && resolved.result ? (
                  <BarWidget result={resolved.result} widget={widget} />
                ) : (
                  <div className="report-widget-error" role="alert">
                    Widget data is unavailable.
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
