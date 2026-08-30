import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { DEFAULT_REPORTING_DATA, REPORTING_DATASETS } from "./reporting-data"
import {
  ReportingDatabaseError,
  SqliteReportingDatabase,
} from "./sqlite-database"

describe("SqliteReportingDatabase", () => {
  let database: SqliteReportingDatabase

  beforeEach(async () => {
    database = await SqliteReportingDatabase.create()
  })

  afterEach(() => database.close())

  it("supports parameterized joins and aggregations", () => {
    const result = database.execute({
      sql: `
        SELECT p.category, SUM(s.quantity) AS units
        FROM agent_sales_daily AS s
        JOIN agent_products AS p ON p.product_id = s.product_id
        WHERE s.sale_date >= ?
        GROUP BY p.category
        ORDER BY units DESC, p.category
        LIMIT 3
      `,
      parameters: ["2026-08-24"],
    })

    expect(result.columns).toEqual([
      { name: "category", type: "string" },
      { name: "units", type: "number" },
    ])
    expect(result.rows.length).toBeGreaterThan(0)
    expect(result.rows.length).toBeLessThanOrEqual(3)
    expect(result.rows.every((row) => Number(row.units) > 0)).toBe(true)
    expect(result.rows.map((row) => Number(row.units))).toEqual(
      [...result.rows.map((row) => Number(row.units))].sort(
        (left, right) => right - left
      )
    )
    expect(result.truncated).toBe(false)
  })

  it("supports CTE queries and dataset status discovery", () => {
    const result = database.execute({
      sql: `
        WITH current_status AS (
          SELECT dataset_name, updated_at, time_zone
          FROM agent_dataset_status
          WHERE completeness = 'complete'
        )
        SELECT * FROM current_status ORDER BY dataset_name
      `,
    })

    expect(result.rows).toHaveLength(REPORTING_DATASETS.length)
    expect(result.rows[0]).toEqual({
      dataset_name: "agent_customer_monthly",
      updated_at: DEFAULT_REPORTING_DATA.datasetStatus.find(
        ([dataset]) => dataset === "agent_customer_monthly"
      )?.[1],
      time_zone: "Asia/Taipei",
    })
  })

  it("allows schema discovery without allowing other schemas", () => {
    const schema = database.execute({
      sql: "SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name",
    })
    expect(schema.rows.map((row) => row.name)).toEqual([
      "agent_customer_monthly",
      "agent_dataset_status",
      "agent_inventory",
      "agent_inventory_daily",
      "agent_order_daily",
      "agent_order_product_daily",
      "agent_products",
      "agent_refund_daily",
      "agent_return_cohort_monthly",
      "agent_return_operational_daily",
      "agent_return_product_daily",
      "agent_sales_daily",
    ])
    expect(() =>
      database.execute({
        sql: "SELECT * FROM pragma_table_info('agent_products')",
      })
    ).toThrow(ReportingDatabaseError)
  })

  it.each([
    "INSERT INTO agent_inventory VALUES (99, 1, 'now')",
    "UPDATE agent_inventory SET stock = 0",
    "DELETE FROM agent_inventory",
    "CREATE TABLE stolen(value TEXT)",
    "PRAGMA query_only = OFF",
    "SELECT random()",
    "SELECT readfile('secret.txt')",
  ])("rejects mutation or non-approved capabilities: %s", (sql) => {
    expect(() => database.execute({ sql })).toThrow(ReportingDatabaseError)
  })

  it("rejects reads from non-approved tables through the authorizer", () => {
    expect(() =>
      database.execute({ sql: "SELECT * FROM sqlite_temp_schema" })
    ).toThrow(ReportingDatabaseError)
  })

  it("truncates result rows explicitly", () => {
    const result = database.execute({
      sql: `
        WITH RECURSIVE numbers(value) AS (
          SELECT 1
          UNION ALL
          SELECT value + 1 FROM numbers WHERE value < 120
        )
        SELECT value FROM numbers
      `,
    })

    expect(result.rows).toHaveLength(100)
    expect(result.rowCount).toBe(100)
    expect(result.truncated).toBe(true)
  })

  it("limits columns and truncates oversized strings", () => {
    const columns = Array.from(
      { length: 33 },
      (_, index) => `${index} AS column_${index}`
    ).join(", ")
    expect(() => database.execute({ sql: `SELECT ${columns}` })).toThrow(
      "more than 32 columns"
    )

    const result = database.execute({
      sql: "SELECT ? AS value",
      parameters: ["x".repeat(5_000)],
    })
    expect(result.rows[0].value).toBe("x".repeat(4_000))
    expect(result.truncated).toBe(true)
  })

  it("normalizes non-finite SQLite results to JSON-safe strings", () => {
    const result = database.execute({ sql: "SELECT 1e999 AS value" })

    expect(result.rows).toEqual([{ value: "Infinity" }])
    expect(result.columns).toEqual([{ name: "value", type: "string" }])
    expect(JSON.parse(JSON.stringify(result))).toEqual(result)
  })

  it("interrupts queries that exceed the VM budget with a safe error", () => {
    expect(() =>
      database.execute({
        sql: `
          SELECT COUNT(*) AS combinations
          FROM agent_sales_daily AS a
          CROSS JOIN agent_sales_daily AS b
          CROSS JOIN agent_sales_daily AS c
        `,
      })
    ).toThrowError(
      expect.objectContaining({
        category: "SQL_EXECUTION_ERROR",
        message: "The read-only SQL query could not be executed.",
      })
    )
  })

  it("contains no personal or payment data in its curated schema and fixtures", () => {
    const serialized = JSON.stringify([
      database.execute({
        sql: "SELECT sql FROM sqlite_schema WHERE sql IS NOT NULL",
      }).rows,
      database.execute({ sql: "SELECT * FROM agent_products" }).rows,
      database.execute({ sql: "SELECT * FROM agent_sales_daily" }).rows,
      database.execute({ sql: "SELECT * FROM agent_inventory" }).rows,
      database.execute({ sql: "SELECT * FROM agent_inventory_daily" }).rows,
      database.execute({ sql: "SELECT * FROM agent_order_daily" }).rows,
      database.execute({ sql: "SELECT * FROM agent_order_product_daily" }).rows,
      database.execute({ sql: "SELECT * FROM agent_customer_monthly" }).rows,
      database.execute({ sql: "SELECT * FROM agent_return_product_daily" })
        .rows,
      database.execute({ sql: "SELECT * FROM agent_return_operational_daily" })
        .rows,
      database.execute({ sql: "SELECT * FROM agent_refund_daily" }).rows,
      database.execute({ sql: "SELECT * FROM agent_return_cohort_monthly" })
        .rows,
      database.execute({ sql: "SELECT * FROM agent_dataset_status" }).rows,
    ])
    expect(serialized).not.toMatch(
      /customerName|email|address|phone|account|cardNumber|paymentMethod|paymentId/i
    )
    expect(serialized).toMatch(/payment_status_code/)
  })

  it("supports product, policy, SLA, inspection, inventory, and refund analysis", () => {
    const productReturns = database.execute({
      sql: `
        SELECT p.category, r.reason_code, r.eligibility_status_code,
               r.inspection_result_code, r.inventory_disposition_code,
               r.inventory_disposition_status_code,
               SUM(r.requested_quantity) AS requested,
               SUM(r.accepted_quantity) AS accepted
        FROM agent_return_product_daily AS r
        JOIN agent_products AS p ON p.product_id = r.product_id
        GROUP BY p.category, r.reason_code, r.eligibility_status_code,
                 r.inspection_result_code, r.inventory_disposition_code,
                 r.inventory_disposition_status_code
      `,
    })
    const operations = database.execute({
      sql: `
        SELECT return_date, SUM(rma_count) AS returns,
               SUM(sla_breached_count_as_of_snapshot) AS sla_breaches,
               SUM(completed_count) AS completed,
               SUM(cycle_time_hours_total) AS cycle_hours
        FROM agent_return_operational_daily
        GROUP BY return_date
      `,
    })

    expect(productReturns.rows.length).toBeGreaterThan(0)
    expect(operations.rows.length).toBeGreaterThan(0)
    expect(
      productReturns.rows.every(
        (row) =>
          typeof row.category === "string" &&
          Number(row.requested) >= Number(row.accepted)
      )
    ).toBe(true)
  })

  it("answers the six representative operational reporting questions", () => {
    const queries = {
      regionalSales: `
        SELECT region_code, currency_code, SUM(order_count) AS orders,
               ROUND(SUM(net_revenue_amount), 2) AS revenue
        FROM agent_order_daily
        GROUP BY region_code, currency_code
        ORDER BY currency_code, revenue DESC
      `,
      customerRevenue: `
        SELECT month_start, region_code, segment_code, currency_code,
               customer_count, ROUND(net_revenue_amount, 2) AS revenue
        FROM agent_customer_monthly
        WHERE customer_count >= 5
        ORDER BY month_start DESC, currency_code, revenue DESC
        LIMIT 20
      `,
      paymentAnomalies: `
        SELECT order_date, payment_status_code, currency_code,
               SUM(order_count) AS affected_orders
        FROM agent_order_daily
        WHERE payment_status_code IN ('pending', 'failed')
        GROUP BY order_date, payment_status_code, currency_code
        ORDER BY order_date DESC
      `,
      productSales: `
        SELECT p.title, p.category, f.currency_code,
               SUM(f.quantity) AS units,
               ROUND(SUM(f.net_revenue_amount), 2) AS revenue
        FROM agent_order_product_daily AS f
        JOIN agent_products AS p ON p.product_id = f.product_id
        GROUP BY p.product_id, p.title, p.category, f.currency_code
        ORDER BY revenue DESC
        LIMIT 10
      `,
      inventoryTrend: `
        SELECT inventory_date, SUM(received_quantity) AS received,
               SUM(issued_quantity) AS issued, SUM(net_change) AS net_change
        FROM agent_inventory_daily
        GROUP BY inventory_date
        ORDER BY inventory_date
        LIMIT 100
      `,
      restockCandidates: `
        WITH recent_issues AS (
          SELECT product_id, SUM(issued_quantity) AS issued
          FROM agent_inventory_daily
          GROUP BY product_id
        )
        SELECT p.title, i.stock, COALESCE(r.issued, 0) AS issued
        FROM agent_inventory AS i
        JOIN agent_products AS p ON p.product_id = i.product_id
        LEFT JOIN recent_issues AS r ON r.product_id = i.product_id
        ORDER BY i.stock ASC, issued DESC
        LIMIT 10
      `,
    }

    const results = Object.fromEntries(
      Object.entries(queries).map(([name, sql]) => [
        name,
        database.execute({ sql }),
      ])
    )

    for (const result of Object.values(results)) {
      expect(result.rows.length).toBeGreaterThan(0)
      expect(result.truncated).toBe(false)
    }
    expect(
      results.regionalSales.rows.every(
        (row) => typeof row.region_code === "string" && Number(row.orders) > 0
      )
    ).toBe(true)
    expect(
      results.customerRevenue.rows.every(
        (row) => Number(row.customer_count) >= 5
      )
    ).toBe(true)
    expect(
      results.paymentAnomalies.rows.every((row) =>
        ["pending", "failed"].includes(String(row.payment_status_code))
      )
    ).toBe(true)
  })
})
