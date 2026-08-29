import { describe, expect, it, vi } from "vitest"
import { normalizeWebMcpToolError } from "../tool-error"
import { REPORTING_SCHEMA_SQL } from "./reporting-data"
import { QueryResultCache } from "./query-cache"
import {
  EXECUTE_READONLY_SQL_TOOL,
  ReportingRuntimeController,
  executeReadonlySqlTool,
  type ReadonlySqlRuntime,
} from "./reporting-tools"
import { SqliteReportingRuntimeError } from "./sqlite-runtime"
import { SqliteReportingDatabase } from "./sqlite-database"

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
    expect(EXECUTE_READONLY_SQL_TOOL.description).toContain("net_revenue_usd")
    expect(EXECUTE_READONLY_SQL_TOOL.description).toContain("price_amount")
    expect(EXECUTE_READONLY_SQL_TOOL.description).toContain("currency_code")
    expect(EXECUTE_READONLY_SQL_TOOL.description).toContain("product_status")
    expect(EXECUTE_READONLY_SQL_TOOL.description).toContain("price_usd is NULL")
    expect(EXECUTE_READONLY_SQL_TOOL.description).toContain(
      "join agent_inventory to agent_products"
    )
    expect(EXECUTE_READONLY_SQL_TOOL.description).toContain("100 rows")
    expect(EXECUTE_READONLY_SQL_TOOL.description?.length).toBeLessThanOrEqual(
      500
    )
    expect(EXECUTE_READONLY_SQL_TOOL.inputSchema).toEqual(
      expect.objectContaining({
        required: ["sql"],
        additionalProperties: false,
      })
    )
  })

  it("delegates SQL and scalar parameters to the page-local runtime", async () => {
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

    await expect(
      executeReadonlySqlTool(runtime, {
        sql: "SELECT title FROM agent_inventory WHERE stock <= ?",
        parameters: ["12"],
      })
    ).resolves.toEqual(result)
    expect(execute).toHaveBeenLastCalledWith({
      sql: "SELECT title FROM agent_inventory WHERE stock <= ?",
      parameters: ["12"],
    })
  })

  it("ignores safe surplus parameters when SQL has no placeholder", async () => {
    const execute = vi.fn(async () => result)

    await expect(
      executeReadonlySqlTool(
        { execute },
        {
          sql: "SELECT category FROM agent_products",
          parameters: ["2026-08-21", "2026-08-27"],
        }
      )
    ).resolves.toEqual(result)
    expect(execute).toHaveBeenCalledWith({
      sql: "SELECT category FROM agent_products",
      parameters: undefined,
    })
  })

  it("does not treat a question mark in a comment as a placeholder", async () => {
    const execute = vi.fn(async () => result)

    await executeReadonlySqlTool(
      { execute },
      {
        sql: "SELECT category FROM agent_products -- why?",
        parameters: ["2026-08-21"],
      }
    )

    expect(execute).toHaveBeenCalledWith({
      sql: "SELECT category FROM agent_products -- why?",
      parameters: undefined,
    })
  })

  it("still rejects sensitive surplus parameters", async () => {
    const execute = vi.fn(async () => result)

    await expect(
      executeReadonlySqlTool(
        { execute },
        {
          sql: "SELECT category FROM agent_products",
          parameters: ["private@example.com"],
        }
      )
    ).rejects.toMatchObject({ category: "SQL_SENSITIVE_VALUE_ERROR" })
    expect(execute).not.toHaveBeenCalled()
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
    [
      { sql: "SELECT ? AS email", parameters: ["private@example.com"] },
      "SQL_SENSITIVE_FIELD_ERROR",
      "curated reporting fields",
    ],
    [
      { sql: "SELECT '4111 1111 1111 1111' AS value" },
      "SQL_SENSITIVE_VALUE_ERROR",
      "Remove personal, account, or payment values",
    ],
    [
      { sql: "SELECT 1 AS cardNumber" },
      "SQL_SENSITIVE_FIELD_ERROR",
      "curated reporting fields",
    ],
    [
      { sql: "SELECT ? AS category", parameters: ["+886912345678"] },
      "SQL_SENSITIVE_VALUE_ERROR",
      "Remove personal, account, or payment values",
    ],
    [
      { sql: "SELECT ? AS category", parameters: ["123 Main Street"] },
      "SQL_LITERAL_ERROR",
      "curated reporting data",
    ],
    [
      { sql: "SELECT ? AS category", parameters: ["John Smith"] },
      "SQL_LITERAL_ERROR",
      "curated reporting data",
    ],
    [
      { sql: "SELECT ? AS category", parameters: [912345678] },
      "SQL_IDENTIFIER_ERROR",
      "suspicious numeric identifier",
    ],
    [
      { sql: "SELECT ? AS category", parameters: ["1234567"] },
      "SQL_LITERAL_ERROR",
      "curated reporting data",
    ],
    [
      { sql: "SELECT ? AS category", parameters: ["1234567.123456"] },
      "SQL_LITERAL_ERROR",
      "curated reporting data",
    ],
  ])(
    "classifies restricted SQL input as %s",
    async (args, category, guidance) => {
      const execute = vi.fn(async () => result)

      try {
        await executeReadonlySqlTool({ execute }, args)
        throw new Error("Expected SQL input to be rejected.")
      } catch (error) {
        expect(error).toMatchObject({ category })
        const normalized = normalizeWebMcpToolError(
          EXECUTE_READONLY_SQL_TOOL.name,
          error
        )
        expect(normalized).toMatchObject({ category, retryable: true })
        expect(normalized.message).toContain(guidance)
        for (const restrictedValue of [
          "private@example.com",
          "4111 1111 1111 1111",
          "+886912345678",
          "123 Main Street",
          "John Smith",
          "912345678",
        ])
          expect(normalized.message).not.toContain(restrictedValue)
      }
      expect(execute).not.toHaveBeenCalled()
    }
  )

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
    ).rejects.toMatchObject({ category: "SQL_OUTPUT_PRIVACY_ERROR" })
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
    ["computed name", "John Smith"],
    ["computed address", "123 Main Street"],
    ["computed numeric identifier", 912345678],
  ])("rejects a restricted runtime result: %s", async (_, computedValue) => {
    const execute = vi.fn(async () => ({
      ...result,
      rows: [{ category: computedValue }],
    }))

    await expect(
      executeReadonlySqlTool(
        { execute },
        { sql: "SELECT category FROM agent_products" }
      )
    ).rejects.toMatchObject({ category: "SQL_OUTPUT_PRIVACY_ERROR" })
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
          "SQL_OUTPUT_PRIVACY_ERROR",
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
    ).rejects.toMatchObject({ category: "SQL_OUTPUT_PRIVACY_ERROR" })
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
    ).rejects.toMatchObject({ category: "SQL_OUTPUT_PRIVACY_ERROR" })
  })
})

describe("ReportingRuntimeController", () => {
  it("returns no saved report before the reporting context is prepared", () => {
    const controller = new ReportingRuntimeController()

    expect(controller.createSavedReportSnapshot()).toBeNull()
  })

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

  it("serializes rapid data versions and leaves only the newest runtime active", async () => {
    const initializationResolvers: Array<() => void> = []
    const runtimes: Array<{
      initialize: ReturnType<typeof vi.fn>
      execute: ReturnType<typeof vi.fn>
      dispose: ReturnType<typeof vi.fn>
    }> = []
    const createRuntime = vi.fn(() => {
      const initialization = new Promise<void>((resolve) => {
        initializationResolvers.push(resolve)
      })
      const runtime = {
        initialize: vi.fn(() => initialization),
        execute: vi.fn(async () => result),
        dispose: vi.fn(async () => undefined),
      }
      runtimes.push(runtime)
      return runtime
    })
    const controller = new ReportingRuntimeController(createRuntime)

    const first = controller.prepare(undefined, 1)
    const second = controller.prepare(undefined, 2)
    const third = controller.prepare(undefined, 3)

    expect(createRuntime).toHaveBeenCalledTimes(1)
    initializationResolvers[0]()
    await first
    await vi.waitFor(() => expect(createRuntime).toHaveBeenCalledTimes(2))
    initializationResolvers[1]()
    await second
    await vi.waitFor(() => expect(createRuntime).toHaveBeenCalledTimes(3))
    initializationResolvers[2]()
    await third

    await expect(controller.execute({ sql: "SELECT 1" })).resolves.toEqual({
      ...result,
      queryId: expect.any(String),
    })
    expect(runtimes[0].dispose).toHaveBeenCalledOnce()
    expect(runtimes[1].dispose).toHaveBeenCalledOnce()
    expect(runtimes[2].dispose).not.toHaveBeenCalled()
    expect(runtimes[0].execute).not.toHaveBeenCalled()
    expect(runtimes[1].execute).not.toHaveBeenCalled()
    expect(runtimes[2].execute).toHaveBeenCalledOnce()
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
    ).rejects.toMatchObject({ category: "SQL_OUTPUT_PRIVACY_ERROR" })

    expect(controller.getQueryResult(safe.queryId).rows).toEqual(result.rows)
    expect(controller.getQueryCacheStatus().entryCount).toBe(1)
  })

  it("executes and caches the parameterized low-stock reporting query", async () => {
    const sql = `
      SELECT p.title, p.category, i.stock, i.updated_at
      FROM agent_inventory AS i
      JOIN agent_products AS p ON p.product_id = i.product_id
      WHERE i.stock <= ?
      ORDER BY i.stock ASC, p.title ASC
    `
    const database = await SqliteReportingDatabase.create()
    try {
      const lowStockResult = database.execute({ sql, parameters: [12] })
      expect(lowStockResult.rows.length).toBeGreaterThan(0)
      expect(lowStockResult.rows.every((row) => Number(row.stock) <= 12)).toBe(
        true
      )
      expect(lowStockResult.rows.map((row) => row.stock)).toEqual(
        [...lowStockResult.rows.map((row) => row.stock)].sort(
          (left, right) => Number(left) - Number(right)
        )
      )

      const runtime = {
        initialize: vi.fn(async () => undefined),
        execute: vi.fn(async () => lowStockResult),
        dispose: vi.fn(async () => undefined),
      }
      const controller = new ReportingRuntimeController(() => runtime)
      await controller.prepare()
      const cached = await controller.execute({ sql, parameters: [12] })

      expect(cached).toMatchObject({
        ...lowStockResult,
        queryId: expect.any(String),
      })
      expect(runtime.execute).toHaveBeenCalledWith({ sql, parameters: [12] })
      expect(controller.getQueryResult(cached.queryId)).toEqual(lowStockResult)
    } finally {
      database.close()
    }
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

  it("keeps report state in the same disposable runtime context", async () => {
    const runtime = {
      initialize: vi.fn(async () => undefined),
      execute: vi.fn(async () => result),
      dispose: vi.fn(async () => undefined),
    }
    const controller = new ReportingRuntimeController(() => runtime)
    await controller.prepare()
    const oldState = controller.getReportStateStore()

    controller.executeReportTool("create_report", { title: "Operations" })
    expect(oldState.getSnapshot()?.title).toBe("Operations")
    await controller.dispose()
    expect(oldState.getStatus()).toBe("disposed")
    expect(() =>
      controller.executeReportTool("get_report_state", {})
    ).toThrowError(expect.objectContaining({ category: "SQLITE_NOT_READY" }))

    await controller.prepare()
    const newState = controller.getReportStateStore()
    expect(newState).not.toBe(oldState)
    expect(newState.getSnapshot()).toBeNull()
  })

  it("bridges report subscriptions and validated human edits across replay", async () => {
    const runtime = {
      initialize: vi.fn(async () => undefined),
      execute: vi.fn(async () => result),
      dispose: vi.fn(async () => undefined),
    }
    const controller = new ReportingRuntimeController(() => runtime)
    const listener = vi.fn()
    controller.subscribeReport(listener)
    await controller.prepare()
    controller.executeReportTool("create_report", { title: "Operations" })
    const query = await controller.execute({ sql: "SELECT 1" })
    controller.executeReportTool("add_report_widget", {
      widget: {
        type: "table",
        title: "Categories",
        queryId: query.queryId,
        columns: ["category"],
      },
    })
    const widgetId = controller.getReportSnapshot()?.widgets[0].id
    if (!widgetId) throw new Error("Expected a report widget.")

    controller.updateReportTitle("Reviewed operations")
    controller.updateReportWidgetTitle(widgetId, "Reviewed categories")

    expect(controller.getReportSnapshot()).toMatchObject({
      title: "Reviewed operations",
      widgets: [{ title: "Reviewed categories" }],
    })
    expect(listener.mock.calls.length).toBeGreaterThanOrEqual(4)

    await controller.dispose()
    await controller.prepare()
    expect(controller.getReportSnapshot()).toBeNull()
    expect(listener.mock.calls.length).toBeGreaterThanOrEqual(6)
  })

  it("snapshots and restores a report with the evidence needed by its widgets", async () => {
    const runtime = {
      initialize: vi.fn(async () => undefined),
      execute: vi.fn(async () => result),
      dispose: vi.fn(async () => undefined),
    }
    const controller = new ReportingRuntimeController(() => runtime)
    await controller.prepare()
    controller.executeReportTool("create_report", { title: "Operations" })
    const query = await controller.execute({ sql: "SELECT 1" })
    controller.executeReportTool("add_report_widget", {
      widget: {
        type: "markdown",
        title: "Evidence",
        markdown: "Complete data.",
        evidenceQueryIds: [query.queryId],
      },
    })
    const snapshot = controller.createSavedReportSnapshot()
    if (!snapshot) throw new Error("Expected a saved report snapshot.")

    controller.createNewReport()
    controller.loadSavedReport(snapshot)

    expect(controller.getReportSnapshot()).toMatchObject({
      id: snapshot.report.id,
      widgets: [{ type: "markdown", evidenceQueryIds: [query.queryId] }],
    })
    expect(controller.getQueryResult(query.queryId).rows).toEqual(result.rows)
  })

  it("publishes cache additions and rejected limits through one stable workspace snapshot", async () => {
    const runtime = {
      initialize: vi.fn(async () => undefined),
      execute: vi.fn(async () => result),
      dispose: vi.fn(async () => undefined),
    }
    const controller = new ReportingRuntimeController(
      () => runtime,
      () => new QueryResultCache({ maxEntries: 1 })
    )
    const listener = vi.fn()
    controller.subscribeReport(listener)
    await controller.prepare()

    await controller.execute({ sql: "SELECT 1" })
    expect(controller.getWorkspaceSnapshot().cacheStatus).toMatchObject({
      entryCount: 1,
      limitReached: true,
      lastRejection: null,
    })

    await expect(controller.execute({ sql: "SELECT 1" })).rejects.toMatchObject(
      { category: "QUERY_CACHE_LIMIT_EXCEEDED" }
    )
    expect(controller.getWorkspaceSnapshot().cacheStatus).toMatchObject({
      entryCount: 1,
      limitReached: true,
      lastRejection: "QUERY_CACHE_LIMIT_EXCEEDED",
    })
    expect(listener).toHaveBeenCalledTimes(2)
  })
})
