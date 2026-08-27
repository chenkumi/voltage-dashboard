import { describe, expect, it, vi } from "vitest"
import { ReportStateStore } from "./report-state"

const createStore = () => {
  const ids = ["report-1", "widget-1", "widget-2", "widget-3"]
  let tick = 0
  return new ReportStateStore({
    createId: () => ids.shift() ?? "fallback-id",
    now: () => `2026-08-28T00:00:0${tick++}+08:00`,
  })
}

describe("ReportStateStore", () => {
  it("creates one immutable active report and notifies subscribers", () => {
    const store = createStore()
    const listener = vi.fn()
    store.subscribe(listener)

    const actual = store.createReport({
      title: "Weekly operations",
      audience: "Store managers",
      period: {
        start: "2026-08-21",
        end: "2026-08-27",
        timeZone: "Asia/Taipei",
      },
    })

    expect(actual).toMatchObject({
      id: "report-1",
      title: "Weekly operations",
      widgets: [],
      createdAt: "2026-08-28T00:00:00+08:00",
      updatedAt: "2026-08-28T00:00:00+08:00",
    })
    expect(Object.isFrozen(actual)).toBe(true)
    expect(Object.isFrozen(actual.period)).toBe(true)
    expect(Object.isFrozen(actual.widgets)).toBe(true)
    expect(listener).toHaveBeenCalledOnce()
  })

  it("supports widget add, replace, move, and remove transitions", () => {
    const store = createStore()
    store.createReport({ title: "Operations" })
    const first = store.addWidget({
      type: "kpi",
      title: "Revenue",
      queryId: "query-1",
      valueColumn: "revenue",
    })
    const second = store.addWidget({
      type: "table",
      title: "Low stock",
      queryId: "query-2",
      columns: ["title", "stock"],
    })

    store.replaceWidget(first.id, {
      type: "kpi",
      title: "Net revenue",
      queryId: "query-1",
      valueColumn: "revenue",
    })
    expect(store.getSnapshot()?.widgets[0]).toMatchObject({
      id: first.id,
      title: "Net revenue",
    })

    store.moveWidget(second.id, 0)
    expect(store.getSnapshot()?.widgets.map((widget) => widget.id)).toEqual([
      second.id,
      first.id,
    ])

    store.removeWidget(first.id)
    expect(store.getSnapshot()?.widgets.map((widget) => widget.id)).toEqual([
      second.id,
    ])
  })

  it("updates report metadata without replacing its identity or widgets", () => {
    const store = createStore()
    const report = store.createReport({ title: "Draft" })
    const widget = store.addWidget({
      type: "text",
      title: "Scope",
      markdown: "Complete data.",
      evidenceQueryIds: [],
    })

    const actual = store.updateReport({ title: "Reviewed operations" })

    expect(actual.id).toBe(report.id)
    expect(actual.title).toBe("Reviewed operations")
    expect(actual.widgets[0].id).toBe(widget.id)
    expect(actual.updatedAt).not.toBe(actual.createdAt)
  })

  it("rejects edits without a report, unknown widgets, and invalid positions", () => {
    const store = createStore()

    expect(() =>
      store.addWidget({
        type: "text",
        title: "Summary",
        markdown: "No report yet.",
        evidenceQueryIds: [],
      })
    ).toThrowError(expect.objectContaining({ category: "REPORT_NOT_FOUND" }))

    store.createReport({ title: "Operations" })
    const widget = store.addWidget({
      type: "text",
      title: "Summary",
      markdown: "Complete data.",
      evidenceQueryIds: [],
    })
    expect(() => store.removeWidget("missing")).toThrowError(
      expect.objectContaining({ category: "REPORT_WIDGET_NOT_FOUND" })
    )
    expect(() => store.moveWidget(widget.id, 1)).toThrowError(
      expect.objectContaining({ category: "REPORT_ARGUMENT_ERROR" })
    )
  })

  it("clears state and subscriptions on dispose", () => {
    const store = createStore()
    const listener = vi.fn()
    store.subscribe(listener)
    store.createReport({ title: "Operations" })
    store.dispose()

    expect(store.getSnapshot()).toBeNull()
    expect(store.getStatus()).toBe("disposed")
    expect(() => store.createReport({ title: "Stale" })).toThrowError(
      expect.objectContaining({ category: "REPORT_STATE_DISPOSED" })
    )
  })

  it("keeps report state isolated between workspace instances", () => {
    const first = createStore()
    const second = createStore()
    first.createReport({ title: "First workspace" })
    second.createReport({ title: "Second workspace" })

    expect(first.getSnapshot()?.title).toBe("First workspace")
    expect(second.getSnapshot()?.title).toBe("Second workspace")
  })
})
