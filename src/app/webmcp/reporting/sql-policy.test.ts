import { describe, expect, it } from "vitest"
import {
  MAX_SQL_LENGTH,
  SqlPolicyError,
  validateReadonlySql,
} from "./sql-policy"

describe("validateReadonlySql", () => {
  it.each([
    "SELECT * FROM agent_products",
    "\tSeLeCt\r\n* FROM agent_products",
    "  -- report\nSELECT category, COUNT(*) FROM agent_products GROUP BY category; ",
    "WITH totals AS (SELECT SUM(quantity) AS quantity FROM agent_sales_daily) SELECT * FROM totals",
    "SELECT 'UPDATE agent_products' AS harmless_text",
    'SELECT "update" FROM (SELECT 1 AS "update")',
  ])("accepts one read-only query: %s", (sql) => {
    expect(validateReadonlySql({ sql })).toEqual({
      sql: sql.trim(),
      parameters: [],
    })
  })

  it.each([
    "",
    "UPDATE agent_inventory SET stock = 0",
    "WITH changed AS (DELETE FROM agent_inventory RETURNING *) SELECT * FROM changed",
    "SELECT 1; DELETE FROM agent_inventory",
    "SELECT 1; /* hidden */ UPDATE agent_inventory SET stock = 0",
    "PRAGMA query_only = OFF",
    "ATTACH DATABASE 'other.db' AS other",
    "DETACH DATABASE other",
    "CREATE VIEW unsafe AS SELECT 1",
    "DROP TABLE agent_products",
    "ALTER TABLE agent_products ADD COLUMN unsafe TEXT",
    "VACUUM",
    "REINDEX",
    "ANALYZE",
    "SELECT load_extension('unsafe')",
    "SEL/**/ECT * FROM agent_products",
    "/* unterminated",
    "SELECT 'unterminated",
  ])("rejects unsafe or malformed SQL: %s", (sql) => {
    expect(() => validateReadonlySql({ sql })).toThrow(SqlPolicyError)
  })

  it("rejects oversized SQL and parameter lists", () => {
    expect(() =>
      validateReadonlySql({ sql: `SELECT '${"x".repeat(MAX_SQL_LENGTH)}'` })
    ).toThrow("exceeds")
    expect(() =>
      validateReadonlySql({
        sql: "SELECT 1",
        parameters: Array.from({ length: 51 }, () => 1),
      })
    ).toThrow("at most 50")
  })

  it("rejects non-scalar and non-finite parameters", () => {
    expect(() =>
      validateReadonlySql({
        sql: "SELECT ?",
        parameters: [Number.NaN, Number.POSITIVE_INFINITY],
      })
    ).toThrow("JSON scalar")
    expect(() =>
      validateReadonlySql({
        sql: "SELECT ?",
        parameters: [{}] as never,
      })
    ).toThrow("JSON scalar")
  })
})
