import { describe, expect, it } from "vitest"
import { COMPLETION_VERIFIER_SCHEMA_KEY } from "../completion-policy"
import { QueryResultCache } from "./query-cache"
import { ReportStateStore } from "./report-state"
import {
  executeReportAuthoringTool,
  REPORT_AUTHORING_TOOLS,
} from "./report-tools"
import { normalizeWebMcpToolError } from "../tool-error"

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
        completionVerifier: "get_report_state",
      })
      expect(tool.inputSchema).toMatchObject({
        [COMPLETION_VERIFIER_SCHEMA_KEY]: "get_report_state",
      })
    }
    expect(
      REPORT_AUTHORING_TOOLS.find((tool) => tool.name === "add_report_widget")
        ?.inputSchema
    ).toMatchObject({
      required: ["widget"],
      additionalProperties: false,
      description: expect.stringContaining("Do not flatten widget fields"),
    })
    expect(
      REPORT_AUTHORING_TOOLS.find((tool) => tool.name === "add_report_widget")
        ?.description
    ).toContain("$49,722.51, 12 items, YYYY-MM-DD, and IANA time zones")
    expect(
      REPORT_AUTHORING_TOOLS.find((tool) => tool.name === "add_report_widget")
        ?.description
    ).toContain("personal contact, account, payment data")
    expect(
      REPORT_AUTHORING_TOOLS.find((tool) => tool.name === "create_report")
        ?.description
    ).toContain("business terms and YYYY-MM-DD dates")
    expect(
      REPORT_AUTHORING_TOOLS.find((tool) => tool.name === "create_report")
        ?.description
    ).toContain("personal contact, account, or payment data")
    expect(
      REPORT_AUTHORING_TOOLS.find((tool) => tool.name === "add_report_widget")
        ?.inputSchema
    ).toMatchObject({
      properties: {
        widget: {
          oneOf: expect.arrayContaining([
            expect.objectContaining({
              properties: expect.objectContaining({
                markdown: expect.objectContaining({
                  description: expect.stringContaining("$49,722.51, 12 items"),
                }),
              }),
            }),
          ]),
        },
      },
    })
    const markdownDescription = (
      REPORT_AUTHORING_TOOLS.find((tool) => tool.name === "add_report_widget")
        ?.inputSchema as {
        properties: {
          widget: {
            oneOf: Array<{
              properties: { markdown?: { description?: string } }
            }>
          }
        }
      }
    ).properties.widget.oneOf.find((candidate) => candidate.properties.markdown)
      ?.properties.markdown?.description
    expect(markdownDescription).toContain(
      "personal contact, account, payment data"
    )
    expect(markdownDescription).toContain("Mermaid fenced blocks are supported")
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

  it.each(["2026-02-30", "2026-99-99"])(
    "rejects an impossible report period date: %s",
    (date) => {
      const { cache, state } = createWorkspace()

      expect(() =>
        executeReportAuthoringTool(cache, state, "create_report", {
          title: "Invalid period",
          period: {
            start: date,
            end: date,
            timeZone: "Asia/Taipei",
          },
        })
      ).toThrowError(
        expect.objectContaining({ category: "REPORT_ARGUMENT_ERROR" })
      )
      expect(state.getSnapshot()).toBeNull()
    }
  )

  it("allows date ranges and ordinary business terms in display text", () => {
    const { cache, state } = createWorkspace()

    expect(
      executeReportAuthoringTool(cache, state, "create_report", {
        title: "本週營運報表 (2026-08-21 - 2026-08-27)",
        audience: "付款與帳戶營運團隊",
      })
    ).toMatchObject({
      status: "OK",
      report: {
        title: "本週營運報表 (2026-08-21 - 2026-08-27)",
        audience: "付款與帳戶營運團隊",
      },
    })

    expect(
      executeReportAuthoringTool(cache, state, "add_report_widget", {
        widget: {
          type: "markdown",
          title: "付款與帳戶資料說明",
          markdown:
            "資料期間為 **2026-08-21** 至 **2026-08-27**。付款與帳戶資料不在本報表範圍內。",
          evidenceQueryIds: [queryId],
        },
      })
    ).toMatchObject({ status: "OK" })

    expect(
      executeReportAuthoringTool(cache, state, "add_report_widget", {
        widget: {
          type: "markdown",
          title: "營運摘要",
          markdown:
            "本週指標為營收、前三分類與低庫存，檢核值為 12 - 3 - 4 件。",
          evidenceQueryIds: [queryId],
        },
      })
    ).toMatchObject({ status: "OK" })

    for (const title of [
      "Executive Overview",
      "Gross Margin",
      "Business Performance",
      "Accounting Summary",
      "Addressable Market",
      "Address: Operations Overview",
      "Account: Data Operations",
      "Phone: Team Metrics",
      "帳戶：資料說明",
      "Report Name Summary",
      "Product Name Analysis",
      "Customer Name Analysis",
      "Full Name Coverage",
      "Name: Weekly Revenue",
    ]) {
      expect(
        executeReportAuthoringTool(cache, state, "create_report", { title })
      ).toMatchObject({ status: "OK", report: { title } })
    }
  })

  it("allows multiline report and widget titles", () => {
    const { cache, state } = createWorkspace()

    expect(
      executeReportAuthoringTool(cache, state, "create_report", {
        title: "Weekly operations\nExecutive summary",
      })
    ).toMatchObject({
      status: "OK",
      report: { title: "Weekly operations\nExecutive summary" },
    })
    expect(
      executeReportAuthoringTool(cache, state, "add_report_widget", {
        widget: {
          type: "markdown",
          title: "Evidence\nSummary",
          markdown: "Complete data.",
          evidenceQueryIds: [queryId],
        },
      })
    ).toMatchObject({
      status: "OK",
      widget: { title: "Evidence\nSummary" },
    })
  })

  it("adds Metric, table, Markdown, and bar widgets with validated evidence mappings", () => {
    const { cache, state } = createWorkspace()
    createReport(cache, state)
    const widgets = [
      {
        type: "metric",
        title: "Net revenue",
        queryId,
        valueColumn: "revenue",
        valueFormat: "currency",
        currencyCode: "USD",
        detail: "Up 12.4% from last week",
        detailTone: "positive",
      },
      {
        type: "table",
        title: "Low stock",
        queryId,
        columns: ["title", "stock"],
      },
      {
        type: "markdown",
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
      "metric",
      "table",
      "markdown",
      "bar",
    ])
  })

  it("stores percent format and negative detail tone for a Metric", () => {
    const { cache, state } = createWorkspace()
    createReport(cache, state)

    expect(
      executeReportAuthoringTool(cache, state, "add_report_widget", {
        widget: {
          type: "metric",
          title: "Conversion rate",
          queryId,
          valueColumn: "revenue",
          valueFormat: "percent",
          detail: "Down 2.1% from last week",
          detailTone: "negative",
        },
      })
    ).toMatchObject({
      status: "OK",
      widget: {
        type: "metric",
        valueFormat: "percent",
        detail: "Down 2.1% from last week",
        detailTone: "negative",
      },
    })
  })

  it("rejects unknown Metric value formats", () => {
    const { cache, state } = createWorkspace()
    createReport(cache, state)

    expect(() =>
      executeReportAuthoringTool(cache, state, "add_report_widget", {
        widget: {
          type: "metric",
          title: "Invalid metric",
          queryId,
          valueColumn: "revenue",
          valueFormat: "ratio",
        },
      })
    ).toThrowError(/Metric value format is invalid/)
  })

  it("rejects a currency code for non-currency Metrics", () => {
    const { cache, state } = createWorkspace()
    createReport(cache, state)

    expect(() =>
      executeReportAuthoringTool(cache, state, "add_report_widget", {
        widget: {
          type: "metric",
          title: "Revenue",
          queryId,
          valueColumn: "revenue",
          valueFormat: "number",
          currencyCode: "USD",
        },
      })
    ).toThrowError(/Metric currency code is invalid/)
  })

  it("requires detail text when a Metric detail tone is specified", () => {
    const { cache, state } = createWorkspace()
    createReport(cache, state)

    expect(() =>
      executeReportAuthoringTool(cache, state, "add_report_widget", {
        widget: {
          type: "metric",
          title: "Revenue",
          queryId,
          valueColumn: "revenue",
          detailTone: "positive",
        },
      })
    ).toThrowError(/Metric detail tone requires detail text/)
  })

  it("adds a six-column grid layout and a data-free space widget", () => {
    const { cache, state } = createWorkspace()
    createReport(cache, state)

    expect(
      executeReportAuthoringTool(cache, state, "add_report_widget", {
        widget: {
          type: "space",
          xSpace: 2,
          ySpace: 7,
        },
      })
    ).toMatchObject({
      status: "OK",
      widget: { type: "space", xSpace: 2, ySpace: 7 },
    })
    expect(
      executeReportAuthoringTool(cache, state, "add_report_widget", {
        widget: {
          type: "metric",
          title: "Revenue",
          queryId,
          valueColumn: "revenue",
          xSpace: 4,
          ySpace: 2,
        },
      })
    ).toMatchObject({
      status: "OK",
      widget: { type: "metric", xSpace: 4, ySpace: 2 },
    })
  })

  it.each([
    { xSpace: 0, ySpace: 1 },
    { xSpace: 7, ySpace: 1 },
    { xSpace: 1, ySpace: 0 },
  ])("rejects invalid grid dimensions: %o", ({ xSpace, ySpace }) => {
    const { cache, state } = createWorkspace()
    createReport(cache, state)

    expect(() =>
      executeReportAuthoringTool(cache, state, "add_report_widget", {
        widget: { type: "space", xSpace, ySpace },
      })
    ).toThrowError(
      expect.objectContaining({ category: "REPORT_ARGUMENT_ERROR" })
    )
  })

  it("updates, reorders, and removes widgets in the same report", () => {
    const { cache, state } = createWorkspace()
    createReport(cache, state)
    executeReportAuthoringTool(cache, state, "add_report_widget", {
      widget: {
        type: "metric",
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
        type: "metric",
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
        type: "metric",
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
        type: "metric",
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
    "```html\n&lt;img src=x onerror=alert(1)&gt;\n```",
    "&lt;script&gt;alert(1)&lt;/script&gt;",
    "Contact private@example.com",
    "Call +886 912 345 678",
    "Call 123-4567",
    "Account ID: acct-123456",
    "帳戶識別：acct-123456",
    "付款卡號：4111 1111 1111 1111",
  ])("rejects unsafe report Markdown: %s", (markdown) => {
    const { cache, state } = createWorkspace()
    createReport(cache, state)

    expect(() =>
      executeReportAuthoringTool(cache, state, "add_report_widget", {
        widget: {
          type: "markdown",
          title: "Summary",
          markdown,
          evidenceQueryIds: [queryId],
        },
      })
    ).toThrowError(
      expect.objectContaining({ category: "REPORT_ARGUMENT_ERROR" })
    )
  })

  it("accepts a wrapped MarkdownWidget with a Mermaid diagram", () => {
    const { cache, state } = createWorkspace()
    createReport(cache, state)

    expect(
      executeReportAuthoringTool(cache, state, "add_report_widget", {
        widget: {
          type: "markdown",
          title: "Revenue flow",
          markdown: "<markdown>```mermaid\ngraph TD; A-->B\n```</markdown>",
          evidenceQueryIds: [queryId],
        },
      })
    ).toMatchObject({
      status: "OK",
      widget: {
        type: "markdown",
        markdown: "```mermaid\ngraph TD; A-->B\n```",
      },
    })
  })

  it.each([
    { field: "title", value: "Contact private@example.com" },
    { field: "title", value: "Call +886 912 345 678" },
    { field: "audience", value: "Account ID: acct-123456" },
    { field: "audience", value: "Account ID acct-123456" },
    { field: "audience", value: "帳戶識別 acct-123456" },
    { field: "title", value: "Customer name john smith" },
    { field: "title", value: "Name: john smith" },
    { field: "title", value: "Name：John Smith" },
    { field: "title", value: "Name John Smith" },
    { field: "title", value: "Full name: john smith" },
    { field: "title", value: "Name: Operations John Smith" },
    { field: "audience", value: "Account: Data acct-123456" },
    { field: "audience", value: "Account：Data acct-123456" },
    { field: "audience", value: "Account Data acct-123456" },
    { field: "audience", value: "帳戶：資料 acct-123456" },
    { field: "audience", value: "帳戶識別號：acct-123456" },
    { field: "audience", value: "帳戶識別碼：acct-123456" },
    { field: "audience", value: "帳號：acct-123456" },
    { field: "title", value: "姓名 王小明" },
    { field: "title", value: "123 Main Street" },
    { field: "title", value: "台北市信義路100號" },
  ])("rejects restricted values in report $field", ({ field, value }) => {
    const { cache, state } = createWorkspace()

    expect(() =>
      executeReportAuthoringTool(cache, state, "create_report", {
        title: "Operations",
        [field]: value,
      })
    ).toThrowError(
      expect.objectContaining({ category: "REPORT_ARGUMENT_ERROR" })
    )
  })

  it("validates widget IDs as structural tokens instead of narrative text", () => {
    const { cache, state } = createWorkspace()
    createReport(cache, state)
    executeReportAuthoringTool(cache, state, "add_report_widget", {
      widget: {
        type: "metric",
        title: "Revenue",
        queryId,
        valueColumn: "revenue",
      },
    })

    expect(() =>
      executeReportAuthoringTool(cache, state, "remove_report_widget", {
        widgetId: "widget 1",
      })
    ).toThrowError(
      expect.objectContaining({
        category: "REPORT_ARGUMENT_ERROR",
        message: "Widget ID is invalid.",
      })
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
      expect.objectContaining({ category: "REPORT_STATE_ARGUMENT_ERROR" })
    )
    expect(() =>
      executeReportAuthoringTool(cache, state, "add_report_widget", {
        widget: {
          type: "markdown",
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

  it.each([
    {
      name: "create_report",
      args: { title: "Operations", reportId: "report-1" },
      category: "REPORT_CREATE_ARGUMENT_ERROR",
      allowed: ["title", "audience", "period"],
    },
    {
      name: "add_report_widget",
      args: {
        type: "metric",
        title: "Revenue",
        queryId,
        valueColumn: "revenue",
      },
      category: "REPORT_ADD_WIDGET_ARGUMENT_ERROR",
      allowed: ["widget"],
    },
    {
      name: "add_report_widget",
      args: { widgets: [] },
      category: "REPORT_ADD_WIDGET_ARGUMENT_ERROR",
      allowed: ["widget"],
    },
    {
      name: "add_report_widget",
      args: {
        reportId: "report-1",
        widget: {
          type: "metric",
          title: "Revenue",
          queryId,
          valueColumn: "revenue",
        },
      },
      category: "REPORT_ADD_WIDGET_ARGUMENT_ERROR",
      allowed: ["widget"],
    },
  ])(
    "returns actionable root fields for $name",
    ({ name, args, category, allowed }) => {
      const { cache, state } = createWorkspace()
      createReport(cache, state)

      try {
        executeReportAuthoringTool(cache, state, name, args)
        throw new Error("Expected report tool arguments to be rejected.")
      } catch (error) {
        expect(error).toMatchObject({
          category,
          message: expect.stringContaining(
            `Allowed fields: ${allowed.join(", ")}.`
          ),
        })
        const normalized = normalizeWebMcpToolError(name, error)
        expect(normalized).toMatchObject({
          category,
          retryable: true,
        })
        for (const field of allowed) expect(normalized.message).toContain(field)
      }
    }
  )

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
            type: "metric",
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
