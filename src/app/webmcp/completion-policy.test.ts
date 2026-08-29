import { describe, expect, it } from "vitest"
import {
  COMPLETION_VERIFIER_SCHEMA_KEY,
  createCompletionVerifierMap,
} from "./completion-policy"
import type { WebMcpRegisteredTool } from "./types"

const mutation = (name: string, verifier: string): WebMcpRegisteredTool => ({
  name,
  inputSchema: { type: "object", properties: {} },
  annotations: { readOnlyHint: false, completionVerifier: verifier },
})

const verifier = (
  overrides: Partial<WebMcpRegisteredTool> = {}
): WebMcpRegisteredTool => ({
  name: "get_report_state",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true },
  ...overrides,
})

describe("completion verifier discovery", () => {
  it("accepts a same-turn read-only no-input verifier", () => {
    const actual = createCompletionVerifierMap([
      mutation("create_report", "get_report_state"),
      verifier(),
    ])

    expect(actual).toEqual({ create_report: "get_report_state" })
    expect(Object.isFrozen(actual)).toBe(true)
  })

  it.each([
    verifier({ annotations: { readOnlyHint: false } }),
    verifier({
      inputSchema: {
        type: "object",
        properties: { reportId: { type: "string" } },
      },
    }),
    verifier({ inputSchema: { type: "string" } }),
  ])("rejects a verifier that is not safe and input-free", (unsafeVerifier) => {
    expect(
      createCompletionVerifierMap([
        mutation("create_report", "get_report_state"),
        unsafeVerifier,
      ])
    ).toEqual({})
  })

  it("does not resolve a verifier that was not discovered in this turn", () => {
    expect(
      createCompletionVerifierMap([
        mutation("create_report", "get_report_state"),
      ])
    ).toEqual({})
  })

  it("reads a schema extension preserved by native WebMCP discovery", () => {
    const nativeRoundTrippedMutation: WebMcpRegisteredTool = {
      name: "create_report",
      inputSchema: JSON.stringify({
        type: "object",
        properties: { title: { type: "string" } },
        required: ["title"],
        additionalProperties: false,
        [COMPLETION_VERIFIER_SCHEMA_KEY]: "get_report_state",
      }),
      annotations: { readOnlyHint: false },
    }

    expect(
      createCompletionVerifierMap([nativeRoundTrippedMutation, verifier()])
    ).toEqual({ create_report: "get_report_state" })
  })

  it("rejects an open object schema as not explicitly no-input", () => {
    expect(
      createCompletionVerifierMap([
        mutation("create_report", "get_report_state"),
        verifier({
          inputSchema: { type: "object", properties: {} },
        }),
      ])
    ).toEqual({})
  })
})
