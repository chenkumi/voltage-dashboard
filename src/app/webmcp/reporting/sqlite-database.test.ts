import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { REPORTING_DATASETS } from "./reporting-data"
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
    expect(result.rows).toEqual([
      { category: "Furniture", units: 34 },
      { category: "Groceries", units: 30 },
      { category: "Beauty", units: 29 },
    ])
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
      dataset_name: "agent_dataset_status",
      updated_at: "2026-08-28T00:00:00+08:00",
      time_zone: "Asia/Taipei",
    })
  })

  it("allows schema discovery without allowing other schemas", () => {
    const schema = database.execute({
      sql: "SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name",
    })
    expect(schema.rows.map((row) => row.name)).toEqual([
      "agent_dataset_status",
      "agent_inventory",
      "agent_products",
      "agent_sales_daily",
    ])
    expect(() =>
      database.execute({ sql: "SELECT * FROM pragma_table_info('agent_products')" })
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
    const columns = Array.from({ length: 33 }, (_, index) =>
      `${index} AS column_${index}`
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
      database.execute({ sql: "SELECT * FROM agent_dataset_status" }).rows,
    ])
    expect(serialized).not.toMatch(
      /customerName|email|address|phone|account|cardNumber|payment/i
    )
  })
})
