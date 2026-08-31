import { describe, expect, it } from "vitest"
import { SqliteReportingRuntimeError } from "./sqlite-runtime"
import { executeReadonlySqlToolResult } from "./reporting-tool-result"
import { ReportingRuntimeController } from "./reporting-tools"

const success = {
  columns: [{ name: "total", type: "number" as const }],
  rows: [{ total: 1 }],
  rowCount: 1,
  truncated: false,
  executionTimeMs: 1,
  queryId: "01K00000000000000000000000" as const,
}

describe("executeReadonlySqlToolResult", () => {
  it.each([
    ["SQL_ARGUMENT_ERROR", "SQL_PARAMETER_ERROR"],
    ["SQL_POLICY_ERROR", "SQL_POLICY_REJECTED"],
    ["SQL_EXECUTION_ERROR", "SQL_SCHEMA_MISMATCH"],
    ["SQLITE_NOT_READY", "SQL_RUNTIME_ERROR"],
  ])("projects %s as %s", async (category, status) => {
    const result = await executeReadonlySqlToolResult(() =>
      Promise.reject(new SqliteReportingRuntimeError(category, "raw sqlite detail"))
    )

    expect(result).toMatchObject({
      status,
      reasonCode: category,
      retryable: expect.any(Boolean),
      nextStep: expect.any(String),
      message: expect.any(String),
    })
    expect(JSON.stringify(result)).not.toContain("raw sqlite detail")
  })

  it("keeps successful SELECT results unchanged", async () => {
    await expect(
      executeReadonlySqlToolResult(() => Promise.resolve(success))
    ).resolves.toBe(success)
  })

  it("still throws unknown programming errors", async () => {
    const error = new Error("unexpected invariant")
    await expect(
      executeReadonlySqlToolResult(() => Promise.reject(error))
    ).rejects.toBe(error)
  })

  it("returns structured boundary results for schema, policy, parameters, readiness, and success", async () => {
    const runtime = {
      initialize: async () => undefined,
      dispose: async () => undefined,
      execute: async ({ sql }: { sql: string }) => {
        if (sql.includes("missing_column"))
          throw new SqliteReportingRuntimeError(
            "SQL_EXECUTION_ERROR",
            "no such column: missing_column"
          )
        if (sql.startsWith("INSERT"))
          throw new SqliteReportingRuntimeError(
            "SQL_POLICY_ERROR",
            "write statement rejected"
          )
        return success
      },
    }
    const controller = new ReportingRuntimeController(() => runtime)

    await expect(
      executeReadonlySqlToolResult(() =>
        controller.execute({ sql: "SELECT missing_column FROM agent_products" })
      )
    ).resolves.toMatchObject({ status: "SQL_RUNTIME_ERROR" })

    await controller.prepare()
    await expect(
      executeReadonlySqlToolResult(() =>
        controller.execute({ sql: "SELECT missing_column FROM agent_products" })
      )
    ).resolves.toMatchObject({ status: "SQL_SCHEMA_MISMATCH" })
    await expect(
      executeReadonlySqlToolResult(() =>
        controller.execute({ sql: "INSERT INTO agent_products VALUES (1)" })
      )
    ).resolves.toMatchObject({ status: "SQL_POLICY_REJECTED" })
    await expect(
      executeReadonlySqlToolResult(() =>
        controller.execute({ sql: "SELECT ?", parameters: [Number.NaN] })
      )
    ).resolves.toMatchObject({ status: "SQL_PARAMETER_ERROR" })
    await expect(
      executeReadonlySqlToolResult(() =>
        controller.execute({ sql: "SELECT 1 AS total" })
      )
    ).resolves.toMatchObject({
      rows: [{ total: 1 }],
      queryId: expect.any(String),
    })
  })
})
