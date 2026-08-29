import {
  ArrowDown,
  ArrowUp,
  Database,
  FileChartColumn,
  FolderOpen,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Markdown } from "@/components/ui/markdown"
import {
  createBarDisplayRows,
  formatMetricValue,
  getCacheLimitMessage,
  resolveReportWidget,
  shouldCommitTitleOnBlur,
  toggleWidgetEditor,
} from "./report-canvas-model"
import {
  deleteSavedReport,
  listSavedReports,
  readSavedReport,
  saveReportSnapshot,
} from "./report-library"
import type { ReportingRuntimeController } from "./reporting-tools"
import type {
  BarReportWidget,
  CachedQueryResult,
  QueryCacheStatus,
  ReportWidget,
  SavedReportSummary,
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
  readOnly = false,
}: {
  value: string
  label: string
  className: string
  onCommit: (value: string) => void
  readOnly?: boolean
}) => {
  const { t } = useTranslation()
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
      setError(t("This title contains unsupported or sensitive content."))
    }
  }

  return (
    <span className="report-editable-title">
      <textarea
        aria-label={label}
        aria-invalid={error ? true : undefined}
        className={className}
        maxLength={120}
        readOnly={readOnly}
        rows={className === "report-title-input" ? 1 : 2}
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
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey))
            event.currentTarget.blur()
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

const QueryNotice = ({ result }: { result: CachedQueryResult }) => {
  const { t } = useTranslation()

  return (
    <>
      {result.rowCount === 0 ? (
        <p className="report-query-notice" role="status">
          {t("This query returned no rows. No value is inferred.")}
        </p>
      ) : null}
      {result.truncated ? (
        <p className="report-query-notice" role="status">
          {t(
            "This query result was truncated. The widget does not represent the full dataset."
          )}
        </p>
      ) : null}
    </>
  )
}

const MetricWidget = ({
  result,
  widget,
}: {
  result: CachedQueryResult
  widget: Extract<ReportWidget, { type: "metric" }>
}) => {
  const row = result.rows[0]
  return (
    <div className="report-metric">
      <strong>
        {formatMetricValue(
          row?.[widget.valueColumn],
          widget.valueFormat,
          widget.currencyCode
        )}
      </strong>
      {widget.detail ? (
        <span data-tone={widget.detailTone ?? "neutral"}>{widget.detail}</span>
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
}) => {
  const { t } = useTranslation()

  return (
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
                <td colSpan={widget.columns.length}>
                  {t("No rows returned.")}
                </td>
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
}

const MarkdownWidget = ({
  widget,
}: {
  widget:
    | Extract<ReportWidget, { type: "markdown" }>
    | Extract<ReportWidget, { type: "text" }>
}) => {
  const { t } = useTranslation()
  const evidenceCount = widget.evidenceQueryIds.length

  return (
    <div className="report-markdown">
      <Markdown fontLevel="small">{widget.markdown}</Markdown>
      <p className="report-evidence-count">
        <Database className="size-3.5" />
        {t(
          evidenceCount === 1
            ? "{{count}} evidence query"
            : "{{count}} evidence queries",
          {
            count: evidenceCount,
          }
        )}
      </p>
    </div>
  )
}

const BarWidget = ({
  result,
  widget,
}: {
  result: CachedQueryResult
  widget: BarReportWidget
}) => {
  const { t } = useTranslation()
  const rows = createBarDisplayRows(widget, result)
  return (
    <div>
      <div
        className="report-bars"
        role="img"
        aria-label={t("{{title}}: {{count}} category values", {
          title: widget.title,
          count: rows.length,
        })}
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
        <p className="report-query-notice">{t("No chart rows returned.")}</p>
      ) : null}
      {result.rows.length > rows.length ? (
        <p className="report-query-notice">
          {t("Showing the first 12 categories from this query.")}
        </p>
      ) : null}
      <QueryNotice result={result} />
    </div>
  )
}

const CacheLimitNotice = ({ status }: { status: QueryCacheStatus }) => {
  const { t } = useTranslation()
  const message = getCacheLimitMessage(status)
  return message ? (
    <div className="report-cache-notice" role="status">
      {t(message)}
    </div>
  ) : null
}

const WidgetLayoutControls = ({
  controller,
  widget,
}: {
  controller: ReportingRuntimeController
  widget: ReportWidget
}) => {
  const { t } = useTranslation()
  const xSpace = widget.xSpace ?? (widget.type === "metric" ? 2 : 6)
  const ySpace = widget.ySpace ?? 1
  const [draftYSpace, setDraftYSpace] = useState(String(ySpace))

  const updateLayout = (nextXSpace: number, nextYSpace: number) => {
    try {
      controller.updateReportWidgetLayout(widget.id, nextXSpace, nextYSpace)
    } catch {
      setDraftYSpace(String(ySpace))
    }
  }

  return (
    <fieldset className="report-widget-layout" aria-label={t("Widget layout")}>
      <label>
        <span>{t("Columns")}</span>
        <select
          aria-label={t("{{type}} widget width", { type: t(widget.type) })}
          value={xSpace}
          onChange={(event) => updateLayout(Number(event.target.value), ySpace)}
        >
          {[1, 2, 3, 4, 5, 6].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>{t("Rows")}</span>
        <input
          aria-label={t("{{type}} widget height", { type: t(widget.type) })}
          min="1"
          step="1"
          type="number"
          value={draftYSpace}
          onBlur={() => {
            const nextYSpace = Number(draftYSpace)
            updateLayout(xSpace, nextYSpace)
          }}
          onChange={(event) => setDraftYSpace(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur()
            if (event.key === "Escape") {
              setDraftYSpace(String(ySpace))
              event.currentTarget.blur()
            }
          }}
        />
      </label>
    </fieldset>
  )
}

const SavedReportLibrary = ({
  controller,
  report,
}: {
  controller: ReportingRuntimeController
  report: ReportingRuntimeController["getReportSnapshot"] extends () => infer T
    ? T
    : never
}) => {
  const { t, i18n } = useTranslation()
  const [savedReports, setSavedReports] = useState<
    readonly SavedReportSummary[]
  >([])
  const [error, setError] = useState("")

  const refresh = useCallback(async () => {
    try {
      setSavedReports(await listSavedReports())
      setError("")
    } catch {
      setError(t("Saved reports are unavailable in this browser."))
    }
  }, [t])

  useEffect(() => {
    let cancelled = false
    const loadSavedReports = async () => {
      try {
        const saved = await listSavedReports()
        if (!cancelled) {
          setSavedReports(saved)
          setError("")
        }
      } catch {
        if (!cancelled)
          setError(t("Saved reports are unavailable in this browser."))
      }
    }
    void loadSavedReports()
    return () => {
      cancelled = true
    }
  }, [t])

  useEffect(() => {
    const snapshot = controller.createSavedReportSnapshot()
    if (!snapshot) return
    void saveReportSnapshot(snapshot)
      .then(refresh)
      .catch(() => {
        setError(t("This report could not be saved locally."))
      })
  }, [controller, refresh, report, t])

  const openReport = async (id: string) => {
    try {
      const savedReport = await readSavedReport(id)
      if (!savedReport) {
        await refresh()
        return
      }
      controller.loadSavedReport(savedReport)
    } catch {
      setError(t("This saved report could not be opened."))
    }
  }

  const removeReport = async (id: string) => {
    if (!window.confirm(t("Delete this saved report? This cannot be undone.")))
      return
    try {
      await deleteSavedReport(id)
      if (report?.id === id) controller.clearActiveReport()
      await refresh()
    } catch {
      setError(t("This saved report could not be deleted."))
    }
  }

  return (
    <section className="report-library" aria-label={t("Saved reports")}>
      <div className="report-library-heading">
        <div>
          <p>{t("Report library")}</p>
          <strong>{t("Saved locally in this browser")}</strong>
        </div>
        <Button
          className="cursor-pointer"
          size="sm"
          type="button"
          onClick={() => controller.createNewReport()}
        >
          <Plus /> {t("New report")}
        </Button>
      </div>
      {savedReports.length === 0 ? (
        <p className="report-library-empty">{t("No saved reports yet.")}</p>
      ) : (
        <ul>
          {savedReports.map((savedReport) => (
            <li key={savedReport.id}>
              <button
                className="report-library-open cursor-pointer"
                type="button"
                onClick={() => void openReport(savedReport.id)}
              >
                <FolderOpen className="size-4" />
                <span>
                  <strong>{savedReport.title}</strong>
                  <small>
                    {t("{{count}} widgets · Updated {{time}}", {
                      count: savedReport.widgetCount,
                      time: new Date(savedReport.updatedAt).toLocaleString(
                        i18n.resolvedLanguage === "zh-TW" ? "zh-TW" : "en-US"
                      ),
                    })}
                  </small>
                </span>
              </button>
              <Button
                aria-label={t("Delete {{title}}", {
                  title: savedReport.title,
                })}
                className="cursor-pointer"
                size="icon-sm"
                title={t("Delete saved report")}
                type="button"
                variant="ghost"
                onClick={() => void removeReport(savedReport.id)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error ? (
        <p className="report-library-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  )
}

export const ReportCanvas = ({
  controller,
}: {
  controller: ReportingRuntimeController
}) => {
  const { t, i18n } = useTranslation()
  const workspace = useSyncExternalStore(
    controller.subscribeReport,
    controller.getWorkspaceSnapshot,
    controller.getWorkspaceSnapshot
  )
  const { report, cacheStatus } = workspace
  const [editingWidgetId, setEditingWidgetId] = useState<string | null>(null)

  if (!report)
    return (
      <div className="report-canvas">
        <SavedReportLibrary controller={controller} report={report} />
        <CacheLimitNotice status={cacheStatus} />
        <section className="report-empty" aria-label={t("Empty report canvas")}>
          <span>
            <FileChartColumn className="size-6" />
          </span>
          <p>{t("Report workspace")}</p>
          <h2>{t("No active report")}</h2>
          <div>{t("Create or open a report to review operational data.")}</div>
        </section>
      </div>
    )

  return (
    <section className="report-canvas" aria-label={t("Editable report canvas")}>
      <SavedReportLibrary controller={controller} report={report} />
      <header className="report-canvas-header">
        <div>
          <p>{t("Active report")}</p>
          <EditableTitle
            key={`${report.id}-${report.title}`}
            value={report.title}
            label={t("Report title")}
            className="report-title-input"
            onCommit={(title) => controller.updateReportTitle(title)}
          />
        </div>
        <dl>
          <div>
            <dt>{t("Period")}</dt>
            <dd>
              {report.period
                ? `${report.period.start} — ${report.period.end}`
                : t("Not specified")}
            </dd>
          </div>
          <div>
            <dt>{t("Time zone")}</dt>
            <dd>{report.period?.timeZone ?? t("Not specified")}</dd>
          </div>
          <div>
            <dt>{t("Updated")}</dt>
            <dd>
              {new Date(report.updatedAt).toLocaleString(
                i18n.resolvedLanguage === "zh-TW" ? "zh-TW" : "en-US"
              )}
            </dd>
          </div>
        </dl>
      </header>

      <CacheLimitNotice status={cacheStatus} />

      {report.widgets.length === 0 ? (
        <div className="report-widget-empty">
          {t("This report has no widgets yet.")}
        </div>
      ) : (
        <div className="report-widget-grid">
          {report.widgets.map((widget, index) => {
            const resolved = resolveReportWidget(
              widget,
              controller.getQueryResult
            )
            const isEditing = editingWidgetId === widget.id
            const widgetLabel = widget.type === "space" ? "space" : widget.title
            const editorId = `report-widget-editor-${widget.id}`
            return (
              <article
                className={[
                  "report-widget",
                  `report-widget-${widget.type}`,
                  isEditing ? "report-widget-editing" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={widget.id}
                style={{
                  gridColumn: `span ${widget.xSpace ?? 6}`,
                  gridRow: `span ${widget.ySpace ?? 1}`,
                }}
              >
                {isEditing ? (
                  <div className="report-widget-editor" id={editorId}>
                    <WidgetLayoutControls
                      controller={controller}
                      key={`${widget.id}-${widget.xSpace}-${widget.ySpace}`}
                      widget={widget}
                    />
                    <div className="report-widget-editor-actions">
                      <Button
                        aria-label={t("Move {{widget}} earlier", {
                          widget: widgetLabel,
                        })}
                        className="cursor-pointer"
                        disabled={index === 0}
                        size="icon-sm"
                        title={t("Move earlier")}
                        variant="ghost"
                        onClick={() =>
                          controller.moveReportWidget(widget.id, index - 1)
                        }
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        aria-label={t("Move {{widget}} later", {
                          widget: widgetLabel,
                        })}
                        className="cursor-pointer"
                        disabled={index === report.widgets.length - 1}
                        size="icon-sm"
                        title={t("Move later")}
                        variant="ghost"
                        onClick={() =>
                          controller.moveReportWidget(widget.id, index + 1)
                        }
                      >
                        <ArrowDown />
                      </Button>
                      <Button
                        aria-label={t("Remove {{widget}}", {
                          widget: widgetLabel,
                        })}
                        className="cursor-pointer"
                        size="icon-sm"
                        title={t("Remove widget")}
                        variant="destructive"
                        onClick={() => controller.removeReportWidget(widget.id)}
                      >
                        <Trash2 />
                      </Button>
                      <Button
                        aria-label={t("Close {{widget}} editor", {
                          widget: widgetLabel,
                        })}
                        className="cursor-pointer"
                        size="icon-sm"
                        title={t("Close widget editor")}
                        variant="ghost"
                        onClick={() => setEditingWidgetId(null)}
                      >
                        <X />
                      </Button>
                    </div>
                  </div>
                ) : null}
                <header>
                  <div>
                    <span>{t(widget.type)}</span>
                    {widget.type === "space" ? (
                      <p className="report-space-title">{t("Layout spacer")}</p>
                    ) : (
                      <EditableTitle
                        key={`${widget.id}-${widget.title}`}
                        value={widget.title}
                        label={t("{{type}} widget title", {
                          type: t(widget.type),
                        })}
                        className="report-widget-title-input"
                        readOnly={!isEditing}
                        onCommit={(title) =>
                          controller.updateReportWidgetTitle(widget.id, title)
                        }
                      />
                    )}
                  </div>
                  {isEditing ? null : (
                    <div className="report-widget-actions">
                      <Button
                        aria-controls={editorId}
                        aria-expanded={false}
                        aria-label={t("Edit {{widget}}", {
                          widget: widgetLabel,
                        })}
                        className="cursor-pointer"
                        size="icon-sm"
                        title={t("Edit widget")}
                        variant="ghost"
                        onClick={() =>
                          setEditingWidgetId((activeWidgetId) =>
                            toggleWidgetEditor(activeWidgetId, widget.id)
                          )
                        }
                      >
                        <Pencil />
                      </Button>
                    </div>
                  )}
                </header>

                {widget.type === "space" ? (
                  <div
                    className="report-space-widget"
                    aria-label={t("Layout spacer")}
                  />
                ) : resolved.status === "error" ? (
                  <div className="report-widget-error" role="alert">
                    {resolved.message}
                  </div>
                ) : widget.type === "markdown" || widget.type === "text" ? (
                  <MarkdownWidget widget={widget} />
                ) : widget.type === "metric" && resolved.result ? (
                  <MetricWidget result={resolved.result} widget={widget} />
                ) : widget.type === "table" && resolved.result ? (
                  <TableWidget result={resolved.result} widget={widget} />
                ) : widget.type === "bar" && resolved.result ? (
                  <BarWidget result={resolved.result} widget={widget} />
                ) : (
                  <div className="report-widget-error" role="alert">
                    {t("Widget data is unavailable.")}
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
