import { describe, expect, it, vi } from "vitest"
import { REPORTING_SCHEMA_SQL } from "./reporting-data"
import {
  EXECUTE_READONLY_SQL_TOOL,
  ReportingRuntimeController,
  executeReadonlySqlTool,
  type ReadonlySqlRuntime,
} from "./reporting-tools"
import { SqliteReportingRuntimeError } from "./sqlite-runtime"

const result = {
  columns: [{ name: "category", type: "string" as const }],
  rows: [{ category: "Beauty" }],
  rowCount: 1,
  truncated: false,
  executionTimeMs: 1,
}

describe("execute_readonly_sql WebMCP tool", () => {
  it("describes one generic read-only SQL capability and its limits", () => {
    expect(EXECUTE_READONLY_SQL_TOOL.name).toBe("execute_readonly_sql")
    expect(EXECUTE_READONLY_SQL_TOOL.annotations).toEqual({
      readOnlyHint: true,
      untrustedContentHint: true,
    })
    expect(EXECUTE_READONLY_SQL_TOOL.description).toContain("SQLite")
    expect(EXECUTE_READONLY_SQL_TOOL.description).toContain("agent_products")
    expect(EXECUTE_READONLY_SQL_TOOL.description).toContain("100 rows")
    expect(EXECUTE_READONLY_SQL_TOOL.inputSchema).toEqual(
      expect.objectContaining({
        required: ["sql"],
        additionalProperties: false,
      })
    )
  })

  it("delegates SQL and scalar parameters to the iframe-local runtime", async () => {
    const execute = vi.fn(async () => result)
    const runtime = { execute } satisfies ReadonlySqlRuntime

    await expect(
      executeReadonlySqlTool(runtime, {
        sql: "SELECT category FROM agent_products WHERE price_usd > ?",
        parameters: [100],
      })
    ).resolves.toEqual(result)
    expect(execute).toHaveBeenCalledWith({
      sql: "SELECT category FROM agent_products WHERE price_usd > ?",
      parameters: [100],
    })
  })

  it.each([
    [null, "SQL tool input must be an object."],
    ["SELECT 1", "SQL tool input must be an object."],
    [["SELECT 1"], "SQL tool input must be an object."],
    [{}, "A SQL query string is required."],
    [
      { sql: "SELECT ?", parameters: { value: 1 } },
      "SQL parameters must be an array of finite JSON scalar values.",
    ],
    [
      { sql: "SELECT ?", parameters: [Number.POSITIVE_INFINITY] },
      "SQL parameters must be an array of finite JSON scalar values.",
    ],
    [
      { sql: "SELECT 1", email: "private@example.com" },
      "Only sql and parameters are accepted.",
    ],
    [
      { sql: "SELECT 1", outputFormat: "raw" },
      "Only sql and parameters are accepted.",
    ],
  ])(
    "rejects malformed executor input before runtime execution",
    async (args, message) => {
      const execute = vi.fn(async () => result)

      await expect(executeReadonlySqlTool({ execute }, args)).rejects.toEqual(
        new SqliteReportingRuntimeError("SQL_ARGUMENT_ERROR", message)
      )
      expect(execute).not.toHaveBeenCalled()
    }
  )

  it.each([
    {
      sql: "SELECT ? AS email",
      parameters: ["private@example.com"],
    },
    { sql: "SELECT '4111 1111 1111 1111' AS value" },
    { sql: "SELECT 1 AS cardNumber" },
    { sql: "SELECT ? AS category", parameters: ["+886912345678"] },
    { sql: "SELECT ? AS category", parameters: ["123 Main Street"] },
    { sql: "SELECT ? AS category", parameters: ["John Smith"] },
    { sql: "SELECT ? AS category", parameters: [912345678] },
  ])("rejects restricted SQL input before runtime execution", async (args) => {
    const execute = vi.fn(async () => result)

    await expect(executeReadonlySqlTool({ execute }, args)).rejects.toEqual(
      new SqliteReportingRuntimeError(
        "SQL_PRIVACY_ERROR",
        "Personal, account, or payment data is not allowed in reporting queries."
      )
    )
    expect(execute).not.toHaveBeenCalled()
  })

  it.each([
    "customerEmail",
    "e-mail",
    "card-number",
    "deliveryAddress",
    "accountId",
  ])("rejects a normalized sensitive result field: %s", async (name) => {
    const execute = vi.fn(async () => ({
      ...result,
      columns: [{ name, type: "string" as const }],
      rows: [{ [name]: "Beauty" }],
    }))

    await expect(
      executeReadonlySqlTool(
        { execute },
        { sql: "SELECT category FROM agent_products" }
      )
    ).rejects.toMatchObject({ category: "SQL_PRIVACY_ERROR" })
  })

  it("allows sqlite_schema name discovery for approved reporting tables", async () => {
    const schemaResult = {
      ...result,
      columns: [{ name: "name", type: "string" as const }],
      rows: [
        { name: "agent_dataset_status" },
        { name: "agent_inventory" },
        { name: "agent_products" },
        { name: "agent_sales_daily" },
      ],
      rowCount: 4,
    }
    const execute = vi.fn(async () => schemaResult)

    await expect(
      executeReadonlySqlTool(
        { execute },
        { sql: "SELECT name FROM sqlite_schema WHERE type = 'table'" }
      )
    ).resolves.toEqual(schemaResult)
  })

  it.each(["start of month", "weekday 0", "unixepoch"])(
    "allows a supported SQLite date modifier: %s",
    async (modifier) => {
      const execute = vi.fn(async () => ({
        ...result,
        columns: [{ name: "month", type: "string" as const }],
        rows: [{ month: "2026-08" }],
      }))

      await expect(
        executeReadonlySqlTool(
          { execute },
          {
            sql: "SELECT date(sale_date, ?) AS month FROM agent_sales_daily",
            parameters: [modifier],
          }
        )
      ).resolves.toMatchObject({ rows: [{ month: "2026-08" }] })
    }
  )

  it.each([
    "SELECT printf('%c%c%c%c%c%c%c%c%c%c', 74, 111, 104, 110, 32, 83, 109, 105, 116, 104) AS category",
    "SELECT printf('%c%c%c%c%c%c%c%c%c%c%c%c%c%c%c', 49, 50, 51, 32, 77, 97, 105, 110, 32, 83, 116, 114, 101, 101, 116) AS category",
    "SELECT 912345678 AS category",
  ])("rejects a computed restricted result: %s", async (sql) => {
    const computedValue = sql.includes("912345678")
      ? 912345678
      : sql.includes("49, 50, 51")
        ? "123 Main Street"
        : "John Smith"
    const execute = vi.fn(async () => ({
      ...result,
      rows: [{ category: computedValue }],
    }))

    await expect(
      executeReadonlySqlTool({ execute }, { sql })
    ).rejects.toMatchObject({ category: "SQL_PRIVACY_ERROR" })
  })

  it.each(["private@example.com", "John Smith", "123 Main Street", 912345678])(
    "rejects a restricted value returned by the runtime: %s",
    async (value) => {
      const execute = vi.fn(async () => ({
        ...result,
        columns: [
          {
            name: "category",
            type:
              typeof value === "number"
                ? ("number" as const)
                : ("string" as const),
          },
        ],
        rows: [{ category: value }],
      }))

      await expect(
        executeReadonlySqlTool(
          { execute },
          { sql: "SELECT category FROM agent_products" }
        )
      ).rejects.toEqual(
        new SqliteReportingRuntimeError(
          "SQL_PRIVACY_ERROR",
          "The reporting query result contains restricted data."
        )
      )
    }
  )

  it("allows only exact approved schema definitions", async () => {
    const schema = REPORTING_SCHEMA_SQL.split(";")[0].trim()
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        ...result,
        columns: [{ name: "sql", type: "string" as const }],
        rows: [{ sql: schema }],
      })
      .mockResolvedValueOnce({
        ...result,
        columns: [{ name: "sql", type: "string" as const }],
        rows: [{ sql: `${schema} Smith` }],
      })

    await expect(
      executeReadonlySqlTool(
        { execute },
        {
          sql: "SELECT sql FROM sqlite_schema WHERE name = ?",
          parameters: ["agent_products"],
        }
      )
    ).resolves.toMatchObject({ rows: [{ sql: schema }] })
    await expect(
      executeReadonlySqlTool(
        { execute },
        {
          sql: "SELECT sql FROM sqlite_schema WHERE name = ?",
          parameters: ["agent_products"],
        }
      )
    ).rejects.toMatchObject({ category: "SQL_PRIVACY_ERROR" })
  })

  it("does not allow curated search fragments as result values", async () => {
    const execute = vi.fn(async () => ({
      ...result,
      rows: [{ category: "Table" }],
    }))

    await expect(
      executeReadonlySqlTool(
        { execute },
        { sql: "SELECT category FROM agent_products" }
      )
    ).rejects.toMatchObject({ category: "SQL_PRIVACY_ERROR" })
  })
})

describe("ReportingRuntimeController", () => {
  it("disposes and forgets a runtime when initialization fails", async () => {
    const failure = new Error("Database initialization failed.")
    const runtime = {
      initialize: vi.fn(async () => Promise.reject(failure)),
      execute: vi.fn(async () => result),
      dispose: vi.fn(async () => undefined),
    }
    const controller = new ReportingRuntimeController(() => runtime)

    await expect(controller.prepare()).rejects.toBe(failure)
    expect(runtime.dispose).toHaveBeenCalledOnce()
    await expect(controller.execute({ sql: "SELECT 1" })).rejects.toMatchObject(
      { category: "SQLITE_NOT_READY" }
    )
    expect(runtime.execute).not.toHaveBeenCalled()
  })

  it("reuses one prepared runtime and disposes it on teardown", async () => {
    const runtime = {
      initialize: vi.fn(async () => undefined),
      execute: vi.fn(async () => result),
      dispose: vi.fn(async () => undefined),
    }
    const controller = new ReportingRuntimeController(() => runtime)

    await controller.prepare()
    await controller.prepare()
    const actual = await controller.execute({ sql: "SELECT 1" })
    await controller.dispose()

    expect(actual).toEqual({ ...result, queryId: expect.any(String) })
    expect(runtime.initialize).toHaveBeenCalledTimes(2)
    expect(runtime.execute).toHaveBeenCalledOnce()
    expect(runtime.dispose).toHaveBeenCalledOnce()
  })

  it("creates and prepares a fresh runtime after effect-replay cleanup", async () => {
    const first = {
      initialize: vi.fn(async () => undefined),
      execute: vi.fn(async () => ({
        ...result,
        rows: [{ category: "Furniture" }],
      })),
      dispose: vi.fn(async () => undefined),
    }
    const second = {
      initialize: vi.fn(async () => undefined),
      execute: vi.fn(async () => ({
        ...result,
        rows: [{ category: "Beauty" }],
      })),
      dispose: vi.fn(async () => undefined),
    }
    const createRuntime = vi
      .fn<() => typeof first>()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second)
    const controller = new ReportingRuntimeController(createRuntime)

    await controller.prepare()
    await controller.dispose()
    await controller.prepare()

    await expect(controller.execute({ sql: "SELECT 1" })).resolves.toEqual({
      ...result,
      rows: [{ category: "Beauty" }],
      queryId: expect.any(String),
    })
    expect(createRuntime).toHaveBeenCalledTimes(2)
    expect(first.dispose).toHaveBeenCalledOnce()
    expect(second.initialize).toHaveBeenCalledOnce()
    expect(first.execute).not.toHaveBeenCalled()
    expect(second.execute).toHaveBeenCalledOnce()
  })

  it("does not let an old initialization failure dispose the replayed context", async () => {
    let rejectFirstInitialization: ((reason: Error) => void) | undefined
    const firstInitialization = new Promise<void>((_resolve, reject) => {
      rejectFirstInitialization = reject
    })
    const first = {
      initialize: vi.fn(() => firstInitialization),
      execute: vi.fn(async () => result),
      dispose: vi.fn(async () => undefined),
    }
    const second = {
      initialize: vi.fn(async () => undefined),
      execute: vi.fn(async () => result),
      dispose: vi.fn(async () => undefined),
    }
    const createRuntime = vi
      .fn<() => typeof first | typeof second>()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second)
    const controller = new ReportingRuntimeController(createRuntime)
    const stalePreparation = controller.prepare()

    void controller.dispose()
    await controller.prepare()
    rejectFirstInitialization?.(new Error("Stale initialization failed."))

    await expect(stalePreparation).rejects.toThrow(
      "Stale initialization failed."
    )
    await expect(controller.execute({ sql: "SELECT 1" })).resolves.toEqual({
      ...result,
      queryId: expect.any(String),
    })
    expect(controller.getQueryCacheStatus()).toMatchObject({
      state: "active",
      entryCount: 1,
    })
  })

  it("does not cache a stale query that finishes after context replay", async () => {
    let resolveStaleQuery: ((value: typeof result) => void) | undefined
    const staleQueryResult = new Promise<typeof result>((resolve) => {
      resolveStaleQuery = resolve
    })
    const first = {
      initialize: vi.fn(async () => undefined),
      execute: vi.fn(() => staleQueryResult),
      dispose: vi.fn(async () => undefined),
    }
    const second = {
      initialize: vi.fn(async () => undefined),
      execute: vi.fn(async () => result),
      dispose: vi.fn(async () => undefined),
    }
    const createRuntime = vi
      .fn<() => typeof first | typeof second>()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second)
    const controller = new ReportingRuntimeController(createRuntime)
    await controller.prepare()
    const staleQuery = controller.execute({ sql: "SELECT 1" })

    void controller.dispose()
    await controller.prepare()
    resolveStaleQuery?.(result)

    await expect(staleQuery).rejects.toMatchObject({
      category: "SQLITE_NOT_READY",
    })
    expect(controller.getQueryCacheStatus().entryCount).toBe(0)
    await expect(controller.execute({ sql: "SELECT 1" })).resolves.toEqual({
      ...result,
      queryId: expect.any(String),
    })
  })

  it("caches only a result that passed the output privacy guard", async () => {
    const runtime = {
      initialize: vi.fn(async () => undefined),
      execute: vi
        .fn()
        .mockResolvedValueOnce(result)
        .mockResolvedValueOnce({
          ...result,
          columns: [{ name: "customerEmail", type: "string" as const }],
          rows: [{ customerEmail: "private@example.com" }],
        }),
      dispose: vi.fn(async () => undefined),
    }
    const controller = new ReportingRuntimeController(() => runtime)
    await controller.prepare()

    const safe = await controller.execute({
      sql: "SELECT category FROM agent_products",
    })
    await expect(
      controller.execute({ sql: "SELECT category FROM agent_products" })
    ).rejects.toMatchObject({ category: "SQL_PRIVACY_ERROR" })

    expect(controller.getQueryResult(safe.queryId).rows).toEqual(result.rows)
    expect(controller.getQueryCacheStatus().entryCount).toBe(1)
  })

  it("does not cache a failed query", async () => {
    const runtime = {
      initialize: vi.fn(async () => undefined),
      execute: vi.fn(async () =>
        Promise.reject(
          new SqliteReportingRuntimeError(
            "SQL_EXECUTION_ERROR",
            "The read-only SQL query could not be executed."
          )
        )
      ),
      dispose: vi.fn(async () => undefined),
    }
    const controller = new ReportingRuntimeController(() => runtime)
    await controller.prepare()

    await expect(
      controller.execute({ sql: "SELECT category FROM agent_products" })
    ).rejects.toMatchObject({ category: "SQL_EXECUTION_ERROR" })
    expect(controller.getQueryCacheStatus().entryCount).toBe(0)
  })

  it("invalidates cached query IDs on dispose and creates a fresh cache", async () => {
    const runtime = {
      initialize: vi.fn(async () => undefined),
      execute: vi.fn(async () => result),
      dispose: vi.fn(async () => undefined),
    }
    const controller = new ReportingRuntimeController(() => runtime)
    await controller.prepare()
    const first = await controller.execute({ sql: "SELECT 1" })
    await controller.dispose()

    expect(() => controller.getQueryResult(first.queryId)).toThrowError(
      expect.objectContaining({ category: "QUERY_CACHE_DISPOSED" })
    )

    await controller.prepare()
    expect(() => controller.getQueryResult(first.queryId)).toThrowError(
      expect.objectContaining({ category: "QUERY_CACHE_NOT_FOUND" })
    )
  })
})
