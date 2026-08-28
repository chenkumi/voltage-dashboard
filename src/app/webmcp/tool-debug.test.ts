import { describe, expect, it, vi } from "vitest"
import {
  executeWebMcpToolWithDebugLog,
  writeStructuredDebugLog,
} from "./tool-debug"

describe("WebMCP tool debug logging", () => {
  it("renders default debug details as inspectable single-line JSON", () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined)

    writeStructuredDebugLog("[WebMCP tool] input", {
      callId: "voltage-admin:1",
      toolName: "execute_readonly_sql",
    })

    expect(debug).toHaveBeenCalledWith(
      "[WebMCP tool] input",
      '{"callId":"voltage-admin:1","toolName":"execute_readonly_sql"}'
    )
    debug.mockRestore()
  })

  it("logs correlated input and response without changing the result", async () => {
    const logger = vi.fn()
    const response = { status: "OK", queryId: "query-1" }

    const actual = await executeWebMcpToolWithDebugLog({
      site: "voltage-admin",
      toolName: "execute_readonly_sql",
      args: { sql: "SELECT 1" },
      execute: async () => response,
      enabled: true,
      logger,
    })

    expect(actual).toBe(response)
    expect(logger).toHaveBeenCalledTimes(2)
    expect(logger.mock.calls[0]).toEqual([
      "[WebMCP tool] input",
      {
        callId: expect.any(String),
        site: "voltage-admin",
        toolName: "execute_readonly_sql",
        arguments: { sql: "SELECT 1" },
      },
    ])
    expect(logger.mock.calls[1]).toEqual([
      "[WebMCP tool] response",
      {
        callId: logger.mock.calls[0][1].callId,
        site: "voltage-admin",
        toolName: "execute_readonly_sql",
        durationMs: expect.any(Number),
        response,
      },
    ])
  })

  it("redacts sensitive keys and values while preserving safe structure", async () => {
    const logger = vi.fn()

    await executeWebMcpToolWithDebugLog({
      site: "voltage-market",
      toolName: "unsafe_test",
      args: {
        email: "private@example.com",
        note: "Call +886 912 345 678",
        period: "2026-08-21 - 2026-08-27",
        nested: { cardNumber: "4111 1111 1111 1111", category: "Beauty" },
      },
      execute: async () => ({ accountId: "acct-1", status: "OK" }),
      enabled: true,
      logger,
    })

    expect(logger.mock.calls[0][1]).toMatchObject({
      arguments: {
        email: "[REDACTED]",
        note: "[REDACTED]",
        period: "2026-08-21 - 2026-08-27",
        nested: { cardNumber: "[REDACTED]", category: "Beauty" },
      },
    })
    expect(logger.mock.calls[1][1]).toMatchObject({
      response: { accountId: "[REDACTED]", status: "OK" },
    })
  })

  it("does not mistake SQL whitespace and parentheses for a phone value", async () => {
    const logger = vi.fn()
    const sql = `SELECT SUM(net_revenue_usd)
      FROM agent_sales_daily
      WHERE sale_date BETWEEN ? AND ?`

    await executeWebMcpToolWithDebugLog({
      site: "voltage-admin",
      toolName: "execute_readonly_sql",
      args: { sql },
      execute: async () => ({ status: "OK" }),
      enabled: true,
      logger,
    })

    expect(logger.mock.calls[0][1]).toMatchObject({ arguments: { sql } })
  })

  it("logs and rethrows the original tool error", async () => {
    const logger = vi.fn()
    const error = Object.assign(new Error("Tool failed."), {
      category: "REPORT_ARGUMENT_ERROR",
    })

    const promise = executeWebMcpToolWithDebugLog({
      site: "voltage-admin",
      toolName: "create_report",
      args: { title: "Operations" },
      execute: async () => Promise.reject(error),
      enabled: true,
      logger,
    })

    await expect(promise).rejects.toBe(error)
    expect(logger).toHaveBeenLastCalledWith(
      "[WebMCP tool] error",
      expect.objectContaining({
        toolName: "create_report",
        error: {
          name: "WebMcpToolExecutionError",
          message:
            "[REPORT_ARGUMENT_ERROR] Report tool arguments are invalid. Inspect the tool schema and retry with only supported fields.",
          category: "REPORT_ARGUMENT_ERROR",
          retryable: true,
        },
      })
    )
  })

  it("does not log arbitrary fields from cross-realm or unknown errors", async () => {
    const logger = vi.fn()
    const error = {
      name: "ReportStateError",
      category: "REPORT_ARGUMENT_ERROR",
      message: "Tool failed for private@example.com.",
      stack: "secret stack",
      detail: "account acct-secret",
    }

    await expect(
      executeWebMcpToolWithDebugLog({
        site: "voltage-admin",
        toolName: "create_report",
        args: {},
        execute: async () => Promise.reject(error),
        enabled: true,
        logger,
      })
    ).rejects.toBe(error)

    const loggedError = logger.mock.calls[1][1].error
    expect(loggedError).toEqual({
      name: "WebMcpToolExecutionError",
      category: "REPORT_ARGUMENT_ERROR",
      message:
        "[REPORT_ARGUMENT_ERROR] Report tool arguments are invalid. Inspect the tool schema and retry with only supported fields.",
      retryable: true,
    })
    expect(JSON.stringify(loggedError)).not.toContain("secret stack")
    expect(JSON.stringify(loggedError)).not.toContain("acct-secret")

    const unknownLogger = vi.fn()
    await expect(
      executeWebMcpToolWithDebugLog({
        site: "voltage-admin",
        toolName: "create_report",
        args: {},
        execute: async () => Promise.reject({ stack: "secret stack" }),
        enabled: true,
        logger: unknownLogger,
      })
    ).rejects.toEqual({ stack: "secret stack" })
    expect(unknownLogger.mock.calls[1][1].error).toEqual({
      name: "WebMcpToolExecutionError",
      message: "[WEBMCP_TOOL_ERROR] WebMCP tool execution failed.",
      category: "WEBMCP_TOOL_ERROR",
      retryable: false,
    })
  })

  it("does not log when disabled or let a logger failure affect execution", async () => {
    const disabledLogger = vi.fn()
    await expect(
      executeWebMcpToolWithDebugLog({
        site: "voltage-admin",
        toolName: "get_report_state",
        args: {},
        execute: async () => ({ status: "OK" }),
        enabled: false,
        logger: disabledLogger,
      })
    ).resolves.toEqual({ status: "OK" })
    expect(disabledLogger).not.toHaveBeenCalled()

    await expect(
      executeWebMcpToolWithDebugLog({
        site: "voltage-admin",
        toolName: "get_report_state",
        args: {},
        execute: async () => ({ status: "OK" }),
        enabled: true,
        logger: () => {
          throw new Error("Console unavailable.")
        },
      })
    ).resolves.toEqual({ status: "OK" })
  })
})
