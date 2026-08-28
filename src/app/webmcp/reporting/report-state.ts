import { ulid } from "ulid"
import type {
  Report,
  ReportErrorCategory,
  NewReportWidget,
  ReportPeriod,
  ReportWidget,
} from "./types"

type CreateReportInput = {
  title: string
  audience?: string
  period?: ReportPeriod
}

type UpdateReportInput = Partial<CreateReportInput>
type ReportStateOptions = {
  createId?: () => string
  now?: () => string
}

export class ReportStateError extends Error {
  readonly category: ReportErrorCategory

  constructor(category: ReportErrorCategory, message: string) {
    super(message)
    this.category = category
    this.name = "ReportStateError"
  }
}

const DEFAULT_WIDGET_LAYOUT = {
  kpi: { xSpace: 2, ySpace: 1 },
  table: { xSpace: 6, ySpace: 3 },
  markdown: { xSpace: 6, ySpace: 2 },
  text: { xSpace: 6, ySpace: 2 },
  bar: { xSpace: 6, ySpace: 3 },
  space: { xSpace: 1, ySpace: 1 },
} as const

const normalizeWidget = (widget: ReportWidget): ReportWidget => {
  const defaults = DEFAULT_WIDGET_LAYOUT[widget.type]
  const xSpace = widget.xSpace
  const ySpace = widget.ySpace
  return {
    ...widget,
    xSpace:
      typeof xSpace === "number" &&
      Number.isSafeInteger(xSpace) &&
      xSpace >= 1 &&
      xSpace <= 6
        ? xSpace
        : defaults.xSpace,
    ySpace:
      typeof ySpace === "number" && Number.isSafeInteger(ySpace) && ySpace >= 1
        ? ySpace
        : defaults.ySpace,
  } as ReportWidget
}

const freezeWidget = (widget: ReportWidget): ReportWidget => {
  const normalized = normalizeWidget(widget)
  if (normalized.type === "table")
    return Object.freeze({
      ...normalized,
      columns: Object.freeze([...normalized.columns]),
    })
  if (normalized.type === "text")
    return Object.freeze({
      ...normalized,
      evidenceQueryIds: Object.freeze([...normalized.evidenceQueryIds]),
    })
  return Object.freeze({ ...normalized })
}

const freezeReport = (report: Report): Report =>
  Object.freeze({
    ...report,
    period: report.period ? Object.freeze({ ...report.period }) : undefined,
    widgets: Object.freeze(report.widgets.map(freezeWidget)),
  })

export class ReportStateStore {
  private report: Report | null = null
  private readonly listeners = new Set<() => void>()
  private readonly createId: () => string
  private readonly now: () => string
  private disposed = false

  constructor(options: ReportStateOptions = {}) {
    this.createId = options.createId ?? ulid
    this.now = options.now ?? (() => new Date().toISOString())
  }

  getSnapshot = () => this.report

  getStatus() {
    return this.disposed ? "disposed" : "active"
  }

  subscribe = (listener: () => void) => {
    this.assertActive()
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  createReport(input: CreateReportInput) {
    this.assertActive()
    const timestamp = this.now()
    this.report = freezeReport({
      id: this.createId(),
      ...input,
      period: input.period ? { ...input.period } : undefined,
      widgets: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    this.emit()
    return this.report
  }

  updateReport(input: UpdateReportInput) {
    const report = this.requireReport()
    this.report = freezeReport({
      ...report,
      ...input,
      period: input.period ? { ...input.period } : report.period,
      updatedAt: this.now(),
    })
    this.emit()
    return this.report
  }

  addWidget(input: NewReportWidget) {
    const report = this.requireReport()
    const widget = { ...input, id: this.createId() } as ReportWidget
    this.report = freezeReport({
      ...report,
      widgets: [...report.widgets, widget],
      updatedAt: this.now(),
    })
    this.emit()
    return freezeWidget(widget)
  }

  replaceWidget(widgetId: string, input: NewReportWidget) {
    const report = this.requireReport()
    const index = report.widgets.findIndex((widget) => widget.id === widgetId)
    if (index < 0) this.throwWidgetNotFound()
    const widget = { ...input, id: widgetId } as ReportWidget
    const widgets = [...report.widgets]
    widgets[index] = widget
    this.report = freezeReport({
      ...report,
      widgets,
      updatedAt: this.now(),
    })
    this.emit()
    return freezeWidget(widget)
  }

  updateWidgetTitle(widgetId: string, title: string) {
    const report = this.requireReport()
    const index = report.widgets.findIndex((widget) => widget.id === widgetId)
    if (index < 0) this.throwWidgetNotFound()
    const widgets = [...report.widgets]
    widgets[index] = { ...widgets[index], title } as ReportWidget
    this.report = freezeReport({
      ...report,
      widgets,
      updatedAt: this.now(),
    })
    this.emit()
    return widgets[index]
  }

  updateWidgetLayout(widgetId: string, xSpace: number, ySpace: number) {
    const report = this.requireReport()
    const index = report.widgets.findIndex((widget) => widget.id === widgetId)
    if (index < 0) this.throwWidgetNotFound()
    if (
      !Number.isSafeInteger(xSpace) ||
      xSpace < 1 ||
      xSpace > 6 ||
      !Number.isSafeInteger(ySpace) ||
      ySpace < 1
    )
      throw new ReportStateError(
        "REPORT_ARGUMENT_ERROR",
        "Widget layout must use 1 to 6 columns and a positive row span."
      )
    const widgets = [...report.widgets]
    widgets[index] = { ...widgets[index], xSpace, ySpace } as ReportWidget
    this.report = freezeReport({
      ...report,
      widgets,
      updatedAt: this.now(),
    })
    this.emit()
    return widgets[index]
  }

  loadReport(report: Report) {
    this.assertActive()
    this.report = freezeReport(report)
    this.emit()
    return this.report
  }

  clearReport() {
    this.assertActive()
    this.report = null
    this.emit()
  }

  moveWidget(widgetId: string, toIndex: number) {
    const report = this.requireReport()
    const fromIndex = report.widgets.findIndex(
      (widget) => widget.id === widgetId
    )
    if (fromIndex < 0) this.throwWidgetNotFound()
    if (
      !Number.isInteger(toIndex) ||
      toIndex < 0 ||
      toIndex >= report.widgets.length
    )
      throw new ReportStateError(
        "REPORT_ARGUMENT_ERROR",
        "Widget position is outside the report."
      )
    const widgets = [...report.widgets]
    const [widget] = widgets.splice(fromIndex, 1)
    widgets.splice(toIndex, 0, widget)
    this.report = freezeReport({
      ...report,
      widgets,
      updatedAt: this.now(),
    })
    this.emit()
    return this.report
  }

  removeWidget(widgetId: string) {
    const report = this.requireReport()
    const index = report.widgets.findIndex((widget) => widget.id === widgetId)
    if (index < 0) this.throwWidgetNotFound()
    const widgets = [...report.widgets]
    widgets.splice(index, 1)
    this.report = freezeReport({
      ...report,
      widgets,
      updatedAt: this.now(),
    })
    this.emit()
    return this.report
  }

  dispose() {
    this.report = null
    this.listeners.clear()
    this.disposed = true
  }

  private requireReport() {
    this.assertActive()
    if (!this.report)
      throw new ReportStateError(
        "REPORT_NOT_FOUND",
        "Create a report before editing widgets."
      )
    return this.report
  }

  private assertActive() {
    if (this.disposed)
      throw new ReportStateError(
        "REPORT_STATE_DISPOSED",
        "The report workspace is no longer available."
      )
  }

  private throwWidgetNotFound(): never {
    throw new ReportStateError(
      "REPORT_WIDGET_NOT_FOUND",
      "The report widget was not found."
    )
  }

  private emit() {
    for (const listener of this.listeners) listener()
  }
}
