import { afterEach, describe, expect, it } from "vitest"
import { createCommerceSeed } from "../commerce-data/commerce-seed"
import { createInventoryMovementSeed } from "../inventory/inventory-seed"
import { createDummyJsonProductSeed } from "../products/product-seed"
import { createReturnSeed } from "../returns/return-seed"
import {
  createReportingDataSnapshot,
  DEFAULT_REPORTING_DATA,
  type ReportingDataSnapshot,
} from "./reporting-data"
import { SqliteReportingDatabase } from "./sqlite-database"
import { ReportingRuntimeController } from "./reporting-tools"
import type {
  SqlQueryInput,
  SqlQueryResult,
  SqlQueryResultWithId,
} from "./types"

const PERIOD = {
  start: "2026-08-21",
  end: "2026-08-27",
  timeZone: "Asia/Taipei",
} as const

class InProcessReportingRuntime {
  private database: SqliteReportingDatabase | null = null

  async initialize(snapshot: ReportingDataSnapshot = DEFAULT_REPORTING_DATA) {
    this.database ??= await SqliteReportingDatabase.create(snapshot)
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
    title: "Voltage Dashboard 本週營運報表 (2026-08-21 至 2026-08-27)",
    audience: "營運主管",
    period: PERIOD,
  })

const addWidgets = (
  controller: ReportingRuntimeController,
  evidence: QueryEvidence
) => {
  controller.executeReportTool("add_report_widget", {
    widget: {
      type: "metric",
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
      title: "Voltage Dashboard 本週營運報表 (2026-08-21 至 2026-08-27)",
      audience: "營運主管",
      period: PERIOD,
      widgets: [
        {
          type: "metric",
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
  expect(evidence.status.rows).toHaveLength(12)
  expect(evidence.status.rows).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        dataset_name: "agent_sales_daily",
        time_zone: PERIOD.timeZone,
        period_start: "2025-08-03",
        period_end: "2026-08-24",
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
  expect(evidence.revenue.rows).toEqual([{ total_revenue_usd: 56.98 }])
  expect(evidence.categories).toMatchObject({ truncated: false })
  expect(evidence.categories.rowCount).toBeGreaterThan(0)
  expect(evidence.categories.rowCount).toBeLessThanOrEqual(3)
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

  it("turns all six operational queries into evidence and invalidates it after safe data changes", async () => {
    const products = createDummyJsonProductSeed()
    const commerce = createCommerceSeed(products)
    const source = {
      products,
      inventoryMovements: createInventoryMovementSeed(products),
      commerce,
      returns: createReturnSeed(commerce),
    }
    const queries = [
      "SELECT region_code, currency_code, SUM(net_revenue_amount) AS revenue FROM agent_order_daily GROUP BY region_code, currency_code",
      "SELECT month_start, region_code, segment_code, currency_code, customer_count, net_revenue_amount FROM agent_customer_monthly ORDER BY month_start",
      "SELECT payment_status_code, SUM(order_count) AS affected_orders FROM agent_order_daily WHERE payment_status_code IN ('pending', 'failed') GROUP BY payment_status_code",
      "SELECT p.category, f.currency_code, SUM(f.quantity) AS units FROM agent_order_product_daily AS f JOIN agent_products AS p ON p.product_id = f.product_id GROUP BY p.category, f.currency_code",
      "SELECT inventory_date, SUM(received_quantity) AS received, SUM(issued_quantity) AS issued FROM agent_inventory_daily GROUP BY inventory_date LIMIT 100",
      "WITH issues AS (SELECT product_id, SUM(issued_quantity) AS issued FROM agent_inventory_daily GROUP BY product_id) SELECT p.title, i.stock, COALESCE(x.issued, 0) AS issued FROM agent_inventory AS i JOIN agent_products AS p ON p.product_id = i.product_id LEFT JOIN issues AS x ON x.product_id = i.product_id ORDER BY i.stock LIMIT 20",
    ]
    const controller = new ReportingRuntimeController(
      () => new InProcessReportingRuntime()
    )
    controllers.push(controller)
    await controller.prepare(createReportingDataSnapshot(source), 1)

    const evidence: SqlQueryResultWithId[] = []
    for (const sql of queries) evidence.push(await controller.execute({ sql }))
    controller.executeReportTool("create_report", {
      title: "Operational evidence",
    })
    controller.executeReportTool("add_report_widget", {
      widget: {
        type: "markdown",
        title: "Six operational queries",
        markdown:
          "Regional, customer, payment, product, inventory and restock evidence.",
        evidenceQueryIds: evidence.map((item) => item.queryId),
      },
    })
    const saved = controller.createSavedReportSnapshot()
    if (!saved) throw new Error("Expected saved operational evidence.")
    expect(controller.getQueryCacheStatus().entryCount).toBe(6)
    expect(saved.queryResults).toHaveLength(6)

    const changedProducts = source.products.map((product, index) =>
      index === 0
        ? {
            ...product,
            title: "Changed safe title",
            stock: product.stock + 1,
            updatedAt: "2031-01-01T00:00:00.000Z",
          }
        : product
    )
    const changedMovements = source.inventoryMovements.map((movement, index) =>
      index === 0
        ? { ...movement, occurredAt: "2032-01-01T00:00:00.000Z" }
        : movement
    )
    const changedCommerce = {
      ...source.commerce,
      customers: source.commerce.customers.map((customer, index) =>
        index === 0
          ? {
              ...customer,
              segment: "vip" as const,
              updatedAt: "2033-01-01T00:00:00.000Z",
            }
          : customer
      ),
    }
    await controller.prepare(
      createReportingDataSnapshot({
        products: changedProducts,
        inventoryMovements: changedMovements,
        commerce: changedCommerce,
        returns: {
          ...source.returns,
          version: source.returns.version + 1,
          rmas: source.returns.rmas.map((rma, index) =>
            index === 0
              ? {
                  ...rma,
                  updatedAt: "2034-01-01T00:00:00.000Z",
                  version: rma.version + 1,
                }
              : rma
          ),
        },
      }),
      2
    )

    expect(controller.getReportSnapshot()).toBeNull()
    expect(() => controller.getQueryResult(evidence[0]!.queryId)).toThrowError(
      expect.objectContaining({ category: "QUERY_CACHE_NOT_FOUND" })
    )
    expect(() => controller.loadSavedReport(saved)).toThrowError(
      expect.objectContaining({ category: "SQLITE_CONTEXT_MISMATCH" })
    )
  })

  it("keeps SLA evidence fixed to its context snapshot until the context version changes", async () => {
    const products = createDummyJsonProductSeed()
    const commerce = createCommerceSeed(products)
    const returns = createReturnSeed(commerce)
    const activeRma = {
      ...returns.rmas[0]!,
      status: "active" as const,
      slaDueAt: "2026-08-29T00:00:00.000Z",
      completedAt: null,
    }
    const source = {
      products,
      inventoryMovements: createInventoryMovementSeed(products),
      commerce,
      returns: { ...returns, rmas: [activeRma] },
    }
    const controller = new ReportingRuntimeController(
      () => new InProcessReportingRuntime()
    )
    controllers.push(controller)
    const query = {
      sql: "SELECT SUM(sla_breached_count_as_of_snapshot) AS breaches FROM agent_return_operational_daily",
    }

    await controller.prepare(
      createReportingDataSnapshot({
        ...source,
        asOf: "2026-08-28T23:59:59.000Z",
      }),
      1
    )
    const before = await controller.execute(query)
    expect(before.rows).toEqual([{ breaches: 0 }])

    await controller.prepare(
      createReportingDataSnapshot({
        ...source,
        asOf: "2026-08-29T00:00:01.000Z",
      }),
      1
    )
    const sameContext = await controller.execute(query)
    expect(sameContext.rows).toEqual([{ breaches: 0 }])

    await controller.prepare(
      createReportingDataSnapshot({
        ...source,
        asOf: "2026-08-29T00:00:01.000Z",
      }),
      2
    )
    const refreshed = await controller.execute(query)
    expect(refreshed.rows).toEqual([{ breaches: 1 }])
    expect(() => controller.getQueryResult(before.queryId)).toThrowError(
      expect.objectContaining({ category: "QUERY_CACHE_NOT_FOUND" })
    )
  })

  it("retains successful widgets and exposes a missing widget after partial failure", async () => {
    const controller = await createController()
    createReport(controller)
    const evidence = await queryEvidence(controller)

    controller.executeReportTool("add_report_widget", {
      widget: {
        type: "metric",
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
      report: { widgets: [{ type: "metric" }] },
    })
    expect(
      "report" in state && state.report
        ? state.report.widgets.some((widget) => widget.type === "bar")
        : true
    ).toBe(false)
  })
})
