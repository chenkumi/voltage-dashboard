import { describe, expect, it } from "vitest"
import {
  WebMcpToolExecutionError,
  isAbortError,
  normalizeWebMcpToolError,
} from "./tool-error"

describe("WebMCP tool error contract", () => {
  it("normalizes a cross-realm error-like object with a safe category", () => {
    const error = normalizeWebMcpToolError("add_report_widget", {
      name: "ReportStateError",
      category: "REPORT_ARGUMENT_ERROR",
      message: "Widget input contains unsupported fields.",
    })

    expect(error).toBeInstanceOf(WebMcpToolExecutionError)
    expect(error).toMatchObject({
      name: "WebMcpToolExecutionError",
      toolName: "add_report_widget",
      category: "REPORT_ARGUMENT_ERROR",
      retryable: true,
      message:
        "[REPORT_ARGUMENT_ERROR] Report tool arguments are invalid. Inspect the tool schema and retry with only supported fields.",
    })
  })

  it("uses a fixed fallback for unknown exceptions", () => {
    const error = normalizeWebMcpToolError("create_report", {
      payload: "private@example.com",
      stack: "secret stack",
    })

    expect(error).toMatchObject({
      category: "WEBMCP_TOOL_ERROR",
      retryable: false,
      message: "[WEBMCP_TOOL_ERROR] WebMCP tool execution failed.",
    })
    expect(JSON.stringify(error)).not.toContain("private@example.com")
    expect(JSON.stringify(error)).not.toContain("secret stack")
  })

  it("does not trust arbitrary well-formed categories", () => {
    const error = normalizeWebMcpToolError("create_report", {
      category: "LOOKS_SAFE_BUT_IS_UNTRUSTED",
      message: "account acct-secret, token sk-live-secret",
    })

    expect(error).toMatchObject({
      category: "WEBMCP_TOOL_ERROR",
      message: "[WEBMCP_TOOL_ERROR] WebMCP tool execution failed.",
    })
  })

  it.each(["constructor", "toString", "__proto__"])(
    "does not resolve inherited object key %s as an error contract",
    (category) => {
      expect(
        normalizeWebMcpToolError("create_report", {
          category,
          message: "untrusted provider detail",
        })
      ).toMatchObject({
        category: "WEBMCP_TOOL_ERROR",
        message: "[WEBMCP_TOOL_ERROR] WebMCP tool execution failed.",
      })
    }
  )

  it("redacts sensitive values from contracted messages", () => {
    const error = normalizeWebMcpToolError("execute_readonly_sql", {
      category: "SQL_ARGUMENT_ERROR",
      message:
        "Invalid value private@example.com for 2026-08-21 and +886 912 345 678.",
    })

    expect(error.message).toContain("SQL tool arguments are invalid")
    expect(error.message).not.toContain("private@example.com")
    expect(error.message).not.toContain("912 345 678")
  })

  it("preserves an explicit retryability decision", () => {
    expect(
      normalizeWebMcpToolError("execute_readonly_sql", {
        category: "SQL_PRIVACY_ERROR",
        message: "The query requests restricted data.",
        retryable: false,
      }).retryable
    ).toBe(false)
  })

  it("redacts labeled account and token values from trusted messages", () => {
    const error = normalizeWebMcpToolError("create_report", {
      category: "REPORT_ARGUMENT_ERROR",
      message: "Rejected account acct-secret and token sk-live-secret.",
    })

    expect(error.message).toBe(
      "[REPORT_ARGUMENT_ERROR] Report tool arguments are invalid. Inspect the tool schema and retry with only supported fields."
    )
  })

  it("reattributes an already normalized error to the current tool", () => {
    const original = normalizeWebMcpToolError("create_report", {
      category: "REPORT_ARGUMENT_ERROR",
      message: "Unsupported fields.",
    })

    expect(normalizeWebMcpToolError("add_report_widget", original)).toMatchObject({
      toolName: "add_report_widget",
      message:
        "[REPORT_ARGUMENT_ERROR] Report tool arguments are invalid. Inspect the tool schema and retry with only supported fields.",
    })
  })

  it.each(["SQL_RESULT_LIMIT", "SQLITE_ERROR"])(
    "keeps the runtime category %s in the safe registry",
    (category) => {
      expect(
        normalizeWebMcpToolError("execute_readonly_sql", {
          category,
          message: "untrusted provider detail",
        })
      ).toMatchObject({ category, retryable: true })
    }
  )

  it("detects cross-realm abort-like objects structurally", () => {
    expect(isAbortError({ name: "AbortError", message: "aborted" })).toBe(true)
    expect(isAbortError(new Error("failed"))).toBe(false)
  })
})
