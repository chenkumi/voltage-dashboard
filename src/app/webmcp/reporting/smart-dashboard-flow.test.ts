import { afterEach, describe, expect, it } from "vitest"
import { SqliteReportingDatabase } from "./sqlite-database"
import { ReportingRuntimeController } from "./reporting-tools"
import type { SqlQueryInput, SqlQueryResult } from "./types"

const PERIOD = {
  start: "2026-08-21",
  end: "2026-08-27",
  timeZone: "Asia/Taipei",
} as const

class InProcessReportingRuntime {
  private database: SqliteReportingDatabase | null = null

  async initialize() {
    this.database ??= await SqliteReportingDatabase.create()
  }

  async execute(input: SqlQueryInput): Promise<SqlQueryResult> {
    if (!this.database)
      throw new Error("Reporting database is not initialized.")
    return this.database.execute(input)
  }

  async dispose() {
    this.database?.close()
    this.database = null
  }
}

type QueryEvidence = Awaited<ReturnType<typeof queryEvidence>>

const queryEvidence = async (controller: ReportingRuntimeController) => {
  const status = await controller.execute({
    sql: `
      SELECT dataset_name, updated_at, time_zone, period_start, period_end,
             completeness
      FROM agent_dataset_status
      ORDER BY dataset_name
    `,
  })
  const revenue = await controller.execute({
    sql: `
      SELECT ROUND(SUM(net_revenue_usd), 2) AS total_revenue_usd
      FROM agent_sales_daily
      WHERE sale_date BETWEEN ? AND ?
    `,
    parameters: [PERIOD.start, PERIOD.end],
  })
  const categories = await controller.execute({
    sql: `
      SELECT p.category, ROUND(SUM(s.net_revenue_usd), 2) AS revenue_usd
      FROM agent_sales_daily AS s
      JOIN agent_products AS p ON p.product_id = s.product_id
      WHERE s.sale_date BETWEEN ? AND ?
      GROUP BY p.category
      ORDER BY revenue_usd DESC, p.category ASC
      LIMIT 3
    `,
    parameters: [PERIOD.start, PERIOD.end],
  })
  const lowStock = await controller.execute({
    sql: `
      SELECT p.title, p.category, i.stock, i.updated_at
      FROM agent_inventory AS i
      JOIN agent_products AS p ON p.product_id = i.product_id
      WHERE i.stock <= ?
      ORDER BY i.stock ASC, p.title ASC
    `,
    parameters: [12],
  })

  return { status, revenue, categories, lowStock }
}

const createReport = (controller: ReportingRuntimeController) =>
  controller.executeReportTool("create_report", {
    title: "Voltage Market 本週營運報表 (2026-08-21 至 2026-08-27)",
    audience: "Voltage Market 店長",
    period: PERIOD,
  })

const addWidgets = (
  controller: ReportingRuntimeController,
  evidence: QueryEvidence
) => {
  controller.executeReportTool("add_report_widget", {
    widget: {
      type: "kpi",
      title: "本週總營收",
      queryId: evidence.revenue.queryId,
      valueColumn: "total_revenue_usd",
    },
  })
  controller.executeReportTool("add_report_widget", {
    widget: {
      type: "bar",
      title: "營收前三商品分類",
      queryId: evidence.categories.queryId,
      categoryColumn: "category",
      valueColumn: "revenue_usd",
    },
  })
  controller.executeReportTool("add_report_widget", {
    widget: {
      type: "table",
      title: "低庫存商品 (12 件以下)",
      queryId: evidence.lowStock.queryId,
      columns: ["title", "category", "stock", "updated_at"],
    },
  })
  controller.executeReportTool("add_report_widget", {
    widget: {
      type: "markdown",
      title: "營運摘要與查詢證據",
      markdown:
        "報表依實際查詢建立，涵蓋 **2026-08-21** 至 **2026-08-27**，時區為 Asia/Taipei。營收、前三分類與低庫存項目均引用下列查詢證據；若任何結果遭截斷，應視為部分資料。",
      evidenceQueryIds: [
        evidence.status.queryId,
        evidence.revenue.queryId,
        evidence.categories.queryId,
        evidence.lowStock.queryId,
      ],
    },
  })
}

const expectCompleteReport = (
  controller: ReportingRuntimeController,
  evidence: QueryEvidence
) => {
  const state = controller.executeReportTool("get_report_state", {})
  expect(state).toMatchObject({
    status: "OK",
    report: {
      title: "Voltage Market 本週營運報表 (2026-08-21 至 2026-08-27)",
      audience: "Voltage Market 店長",
      period: PERIOD,
      widgets: [
        {
          type: "kpi",
          queryId: evidence.revenue.queryId,
          valueColumn: "total_revenue_usd",
        },
        {
          type: "bar",
          queryId: evidence.categories.queryId,
          categoryColumn: "category",
          valueColumn: "revenue_usd",
        },
        {
          type: "table",
          queryId: evidence.lowStock.queryId,
          columns: ["title", "category", "stock", "updated_at"],
        },
        {
          type: "markdown",
          evidenceQueryIds: [
            evidence.status.queryId,
            evidence.revenue.queryId,
            evidence.categories.queryId,
            evidence.lowStock.queryId,
          ],
        },
      ],
    },
  })
  expect(evidence.status.truncated).toBe(false)
  expect(evidence.status.rows).toHaveLength(4)
  expect(evidence.status.rows).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        dataset_name: "agent_sales_daily",
        time_zone: PERIOD.timeZone,
        period_start: PERIOD.start,
        period_end: PERIOD.end,
        completeness: "complete",
      }),
    ])
  )
  expect(
    evidence.status.rows.every(
      (row) =>
        row.time_zone === PERIOD.timeZone && row.completeness === "complete"
    )
  ).toBe(true)
  expect(evidence.revenue.truncated).toBe(false)
  expect(evidence.revenue.rows).toEqual([{ total_revenue_usd: 49_722.51 }])
  expect(evidence.categories).toMatchObject({ rowCount: 3, truncated: false })
  expect(evidence.categories.rows).toEqual(
    [...evidence.categories.rows].sort(
      (left, right) =>
        Number(right.revenue_usd) - Number(left.revenue_usd) ||
        String(left.category).localeCompare(String(right.category))
    )
  )
  expect(evidence.lowStock.truncated).toBe(false)
  expect(evidence.lowStock.rows.length).toBeGreaterThan(0)
  expect(
    evidence.lowStock.rows.every(
      (row) => typeof row.stock === "number" && row.stock <= 12
    )
  ).toBe(true)
  expect(evidence.lowStock.rows).toEqual(
    [...evidence.lowStock.rows].sort(
      (left, right) =>
        Number(left.stock) - Number(right.stock) ||
        String(left.title).localeCompare(String(right.title))
    )
  )
}

describe("Smart Dashboard report workflow", () => {
  const controllers: ReportingRuntimeController[] = []

  afterEach(async () => {
    await Promise.all(
      controllers.splice(0).map((controller) => controller.dispose())
    )
  })

  const createController = async () => {
    const controller = new ReportingRuntimeController(
      () => new InProcessReportingRuntime()
    )
    controllers.push(controller)
    await controller.prepare()
    return controller
  }

  it("builds the complete report when SQL runs before create_report", async () => {
    const controller = await createController()

    const evidence = await queryEvidence(controller)
    createReport(controller)
    addWidgets(controller, evidence)

    expectCompleteReport(controller, evidence)
  })

  it("builds the same complete report when create_report runs before SQL", async () => {
    const controller = await createController()

    createReport(controller)
    const evidence = await queryEvidence(controller)
    addWidgets(controller, evidence)

    expectCompleteReport(controller, evidence)
  })

  it("retains successful widgets and exposes a missing widget after partial failure", async () => {
    const controller = await createController()
    createReport(controller)
    const evidence = await queryEvidence(controller)

    controller.executeReportTool("add_report_widget", {
      widget: {
        type: "kpi",
        title: "本週總營收",
        queryId: evidence.revenue.queryId,
        valueColumn: "total_revenue_usd",
      },
    })
    expect(() =>
      controller.executeReportTool("add_report_widget", {
        widget: {
          type: "bar",
          title: "錯誤的分類圖",
          queryId: evidence.categories.queryId,
          categoryColumn: "category",
          valueColumn: "missing_revenue",
        },
      })
    ).toThrowError(
      expect.objectContaining({ category: "REPORT_ARGUMENT_ERROR" })
    )

    const state = controller.executeReportTool("get_report_state", {})
    expect(state).toMatchObject({
      status: "OK",
      report: { widgets: [{ type: "kpi" }] },
    })
    expect(
      "report" in state && state.report
        ? state.report.widgets.some((widget) => widget.type === "bar")
        : true
    ).toBe(false)
  })
})
