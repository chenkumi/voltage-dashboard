import { describe, expect, it } from "vitest"
import { QueryResultCache } from "./query-cache"
import { ReportStateStore } from "./report-state"
import {
  executeReportAuthoringTool,
  REPORT_AUTHORING_TOOLS,
} from "./report-tools"

const queryId = "01K00000000000000000000000"
const missingQueryId = "01K00000000000000000000001"

const createWorkspace = () => {
  const cache = new QueryResultCache({ createId: () => queryId })
  cache.add({
    columns: [
      { name: "category", type: "string" },
      { name: "revenue", type: "number" },
      { name: "stock", type: "number" },
      { name: "title", type: "string" },
    ],
    rows: [{ category: "Beauty", revenue: 1250, stock: 3, title: "Mascara" }],
    rowCount: 1,
    truncated: false,
    executionTimeMs: 1,
  })
  const ids = ["report-1", "widget-1", "widget-2", "widget-3", "widget-4"]
  const state = new ReportStateStore({
    createId: () => ids.shift() ?? "fallback-id",
    now: () => "2026-08-28T00:00:00+08:00",
  })
  return { cache, state }
}

const createReport = (cache: QueryResultCache, state: ReportStateStore) =>
  executeReportAuthoringTool(cache, state, "create_report", {
    title: "Weekly operations",
    audience: "Store managers",
    period: {
      start: "2026-08-21",
      end: "2026-08-27",
      timeZone: "Asia/Taipei",
    },
  })

describe("report authoring WebMCP tools", () => {
  it("exposes one read-only state tool and reversible local mutation tools", () => {
    expect(REPORT_AUTHORING_TOOLS.map((tool) => tool.name)).toEqual([
      "create_report",
      "get_report_state",
      "add_report_widget",
      "update_report_widget",
      "move_report_widget",
      "remove_report_widget",
    ])
    expect(
      REPORT_AUTHORING_TOOLS.find((tool) => tool.name === "get_report_state")
        ?.annotations
    ).toMatchObject({ readOnlyHint: true, openWorldHint: false })
    for (const tool of REPORT_AUTHORING_TOOLS.filter(
      (candidate) => candidate.name !== "get_report_state"
    )) {
      expect(tool.annotations).toMatchObject({
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      })
    }
  })

  it("creates and reads one report with explicit period semantics", () => {
    const { cache, state } = createWorkspace()

    expect(createReport(cache, state)).toMatchObject({
      status: "OK",
      report: {
        id: "report-1",
        title: "Weekly operations",
        period: {
          start: "2026-08-21",
          end: "2026-08-27",
          timeZone: "Asia/Taipei",
        },
      },
    })
    expect(
      executeReportAuthoringTool(cache, state, "get_report_state", {})
    ).toMatchObject({
      status: "OK",
      report: { id: "report-1" },
      cacheStatus: { state: "active", entryCount: 1 },
    })
  })

  it("adds KPI, table, text, and bar widgets with validated evidence mappings", () => {
    const { cache, state } = createWorkspace()
    createReport(cache, state)
    const widgets = [
      {
        type: "kpi",
        title: "Net revenue",
        queryId,
        valueColumn: "revenue",
        comparisonColumn: "stock",
      },
      {
        type: "table",
        title: "Low stock",
        queryId,
        columns: ["title", "stock"],
      },
      {
        type: "text",
        title: "Evidence",
        markdown: "Data covers **2026-08-21** through **2026-08-27**.",
        evidenceQueryIds: [queryId],
      },
      {
        type: "bar",
        title: "Revenue by category",
        queryId,
        categoryColumn: "category",
        valueColumn: "revenue",
      },
    ]

    for (const widget of widgets) {
      expect(
        executeReportAuthoringTool(cache, state, "add_report_widget", {
          widget,
        })
      ).toMatchObject({ status: "OK", widget: { type: widget.type } })
    }

    expect(state.getSnapshot()?.widgets.map((widget) => widget.type)).toEqual([
      "kpi",
      "table",
      "text",
      "bar",
    ])
  })

  it("updates, reorders, and removes widgets in the same report", () => {
    const { cache, state } = createWorkspace()
    createReport(cache, state)
    executeReportAuthoringTool(cache, state, "add_report_widget", {
      widget: {
        type: "kpi",
        title: "Revenue",
        queryId,
        valueColumn: "revenue",
      },
    })
    executeReportAuthoringTool(cache, state, "add_report_widget", {
      widget: {
        type: "table",
        title: "Stock",
        queryId,
        columns: ["title", "stock"],
      },
    })

    executeReportAuthoringTool(cache, state, "update_report_widget", {
      widgetId: "widget-1",
      widget: {
        type: "kpi",
        title: "Net revenue",
        queryId,
        valueColumn: "revenue",
      },
    })
    executeReportAuthoringTool(cache, state, "move_report_widget", {
      widgetId: "widget-2",
      toIndex: 0,
    })
    executeReportAuthoringTool(cache, state, "remove_report_widget", {
      widgetId: "widget-1",
    })

    expect(state.getSnapshot()?.widgets).toEqual([
      expect.objectContaining({ id: "widget-2", type: "table" }),
    ])
  })

  it.each([
    {
      widget: {
        type: "kpi",
        title: "Missing evidence",
        queryId: missingQueryId,
        valueColumn: "revenue",
      },
      category: "QUERY_CACHE_NOT_FOUND",
    },
    {
      widget: {
        type: "table",
        title: "Missing column",
        queryId,
        columns: ["unknown"],
      },
      category: "REPORT_ARGUMENT_ERROR",
    },
    {
      widget: {
        type: "kpi",
        title: "Wrong type",
        queryId,
        valueColumn: "category",
      },
      category: "REPORT_ARGUMENT_ERROR",
    },
    {
      widget: {
        type: "bar",
        title: "Wrong value type",
        queryId,
        categoryColumn: "category",
        valueColumn: "title",
      },
      category: "REPORT_ARGUMENT_ERROR",
    },
  ])("rejects invalid query and column mappings", ({ widget, category }) => {
    const { cache, state } = createWorkspace()
    createReport(cache, state)

    expect(() =>
      executeReportAuthoringTool(cache, state, "add_report_widget", { widget })
    ).toThrowError(expect.objectContaining({ category }))
    expect(state.getSnapshot()?.widgets).toEqual([])
  })

  it.each([
    "<script>alert(1)</script>",
    "[Send report](https://example.com)",
    "See www.example.com for details.",
    "[Open report][target]\n\n[target]: /internal/path",
    "[Open report][]",
    "[Open report]",
    "```html\n&lt;img src=x onerror=alert(1)&gt;\n```",
    "```mermaid\ngraph TD; A-->B\n```",
    "&lt;script&gt;alert(1)&lt;/script&gt;",
    "Contact private@example.com",
    "Call +886 912 345 678",
    "Account 123 must be reviewed",
    "付款資料摘要",
  ])("rejects unsafe report Markdown: %s", (markdown) => {
    const { cache, state } = createWorkspace()
    createReport(cache, state)

    expect(() =>
      executeReportAuthoringTool(cache, state, "add_report_widget", {
        widget: {
          type: "text",
          title: "Summary",
          markdown,
          evidenceQueryIds: [queryId],
        },
      })
    ).toThrowError(
      expect.objectContaining({ category: "REPORT_ARGUMENT_ERROR" })
    )
  })

  it("rejects unknown evidence and executor fields at every object boundary", () => {
    const { cache, state } = createWorkspace()
    createReport(cache, state)

    expect(() =>
      executeReportAuthoringTool(cache, state, "get_report_state", {
        includeSecrets: true,
      })
    ).toThrowError(
      expect.objectContaining({ category: "REPORT_ARGUMENT_ERROR" })
    )
    expect(() =>
      executeReportAuthoringTool(cache, state, "add_report_widget", {
        widget: {
          type: "text",
          title: "Summary",
          markdown: "Complete data.",
          evidenceQueryIds: [missingQueryId],
          html: "<p>unsafe</p>",
        },
      })
    ).toThrowError(
      expect.objectContaining({ category: "REPORT_ARGUMENT_ERROR" })
    )
  })

  it("does not resolve a query ID from another workspace cache", () => {
    const first = createWorkspace()
    const secondCache = new QueryResultCache({ createId: () => missingQueryId })
    secondCache.add({
      columns: [{ name: "revenue", type: "number" }],
      rows: [{ revenue: 1 }],
      rowCount: 1,
      truncated: false,
      executionTimeMs: 1,
    })
    createReport(secondCache, first.state)

    expect(() =>
      executeReportAuthoringTool(
        secondCache,
        first.state,
        "add_report_widget",
        {
          widget: {
            type: "kpi",
            title: "Cross workspace",
            queryId,
            valueColumn: "revenue",
          },
        }
      )
    ).toThrowError(
      expect.objectContaining({ category: "QUERY_CACHE_NOT_FOUND" })
    )
  })
})
