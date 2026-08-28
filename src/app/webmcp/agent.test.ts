import { describe, expect, it, vi } from "vitest"
import {
  APP_PROVIDERS,
  buildInstructions,
  createLanguageModel,
  createThinkingSettings,
  createAgentLifecycleObserver,
  createAgentStepDecision,
  FINAL_SUMMARY_STEP,
  parseAppProvider,
  parseThinkingLevel,
  THINKING_LEVELS,
  VERIFIER_RESERVE_STEP,
} from "./agent"

const verifierMap = Object.freeze({ create_report: "get_report_state" })
const instructions = "base instructions"
const result = (toolName: string) => ({ toolName })
const error = (toolName: string) => ({ type: "tool-error", toolName })

describe("LLM provider configuration", () => {
  it.each(APP_PROVIDERS)("creates a %s language model", (provider) => {
    const modelName = `${provider}-test-model`
    const model = createLanguageModel({
      provider,
      modelName,
      baseURL: "http://localhost:1234/v1",
      apiKey: "test-key",
    })

    expect(model).toMatchObject({ modelId: modelName })
  })

  it("defaults an empty provider value to openai-compatible", () => {
    expect(parseAppProvider()).toBe("openai-compatible")
    expect(parseAppProvider("")).toBe("openai-compatible")
  })

  it("rejects an unsupported provider value", () => {
    expect(() => parseAppProvider("unknown")).toThrow(
      /Unsupported VITE_APP_PROVIDER: unknown/
    )
  })
})

describe("LLM thinking configuration", () => {
  it.each(THINKING_LEVELS)("accepts the %s thinking level", (thinkingLevel) => {
    expect(parseThinkingLevel(thinkingLevel)).toBe(thinkingLevel)
  })

  it("does not pass reasoning when the environment value is empty", () => {
    expect(parseThinkingLevel()).toBeUndefined()
    expect(createThinkingSettings()).toEqual({})
  })

  it("passes the configured reasoning level", () => {
    expect(createThinkingSettings("high")).toEqual({ reasoning: "high" })
  })

  it("rejects an unsupported thinking level", () => {
    expect(() => parseThinkingLevel("maximum")).toThrow(
      /Unsupported VITE_APP_LLM_THINKING_LEVEL: maximum/
    )
  })
})

describe("Agent completion policy", () => {
  it("forces the matching verifier after a successful mutation", () => {
    expect(
      createAgentStepDecision({
        stepNumber: 1,
        steps: [{ toolResults: [result("create_report")] }],
        verifierMap,
        instructions,
      })
    ).toMatchObject({
      activeTools: ["get_report_state"],
      toolChoice: { type: "tool", toolName: "get_report_state" },
      instructions: expect.stringContaining("must now be verified"),
    })
  })

  it("does not force an endless verifier retry after verifier failure", () => {
    const decision = createAgentStepDecision({
      stepNumber: 2,
      steps: [
        { toolResults: [result("create_report")] },
        { content: [error("get_report_state")] },
      ],
      verifierMap,
      instructions,
    })

    expect(decision).not.toHaveProperty("toolChoice")
    expect(decision.instructions).toMatch(
      /FAILED or PARTIALLY_COMPLETED[\s\S]*Do not claim/
    )
    expect(decision.state).toMatchObject({
      pendingVerifiers: [],
      failedVerifiers: ["get_report_state"],
      unverified: true,
    })
  })

  it("keeps a failed standalone state read as a general tool failure", () => {
    const decision = createAgentStepDecision({
      stepNumber: 1,
      steps: [{ content: [error("get_report_state")] }],
      verifierMap,
      instructions,
    })

    expect(decision.state).toMatchObject({
      pendingVerifiers: [],
      failedVerifiers: [],
      failedTools: ["get_report_state"],
    })
    expect(decision.instructions).toMatch(/get_report_state/)
  })

  it("resets carried verifier instructions after later successful verification", () => {
    const decision = createAgentStepDecision({
      stepNumber: 3,
      steps: [
        { toolResults: [result("create_report")] },
        { content: [error("get_report_state")] },
        { toolResults: [result("get_report_state")] },
      ],
      verifierMap,
      instructions,
    })

    expect(decision.instructions).toBe(instructions)
    expect(decision.state.unverified).toBe(false)
    expect(decision.state.failedTools).toEqual([])
  })

  it("recovers after repeated verifier failures followed by success", () => {
    const decision = createAgentStepDecision({
      stepNumber: 4,
      steps: [
        { toolResults: [result("create_report")] },
        { content: [error("get_report_state")] },
        { content: [error("get_report_state")] },
        { toolResults: [result("get_report_state")] },
      ],
      verifierMap,
      instructions,
    })

    expect(decision.instructions).toBe(instructions)
    expect(decision.state).toMatchObject({
      pendingVerifiers: [],
      failedVerifiers: [],
      failedTools: [],
    })
  })

  it("requires an explicit incomplete status after an unresolved tool error", () => {
    const decision = createAgentStepDecision({
      stepNumber: 2,
      steps: [
        { content: [error("execute_readonly_sql")] },
        { toolResults: [result("create_report")] },
      ],
      verifierMap: {},
      instructions,
    })

    expect(decision.instructions).toMatch(
      /execute_readonly_sql[\s\S]*FAILED or PARTIALLY_COMPLETED/
    )
    expect(decision.state.failedTools).toEqual(["execute_readonly_sql"])
  })

  it("does not let an unrelated same-name success hide an earlier failure", () => {
    const decision = createAgentStepDecision({
      stepNumber: 2,
      steps: [
        { content: [error("execute_readonly_sql")] },
        { toolResults: [result("execute_readonly_sql")] },
      ],
      verifierMap: {},
      instructions,
    })

    expect(decision.instructions).toMatch(/FAILED or PARTIALLY_COMPLETED/)
    expect(decision.state.failedTools).toEqual(["execute_readonly_sql"])
  })

  it("reserves a no-tool final summary and reports unverified state honestly", () => {
    const decision = createAgentStepDecision({
      stepNumber: FINAL_SUMMARY_STEP,
      steps: [
        { toolResults: [result("create_report")] },
        { content: [error("get_report_state")] },
      ],
      verifierMap,
      instructions,
    })

    expect(decision).toMatchObject({
      activeTools: [],
      toolChoice: "none",
      instructions: expect.stringMatching(/FAILED or PARTIALLY_COMPLETED/),
    })
  })

  it("names a still-pending verifier in the final summary instructions", () => {
    const decision = createAgentStepDecision({
      stepNumber: FINAL_SUMMARY_STEP,
      steps: [{ toolResults: [result("create_report")] }],
      verifierMap,
      instructions,
    })

    expect(decision.instructions).toMatch(
      /FAILED or PARTIALLY_COMPLETED[\s\S]*get_report_state/
    )
  })

  it("uses the verifier reserve step for a pending verifier before summary", () => {
    expect(
      createAgentStepDecision({
        stepNumber: VERIFIER_RESERVE_STEP,
        steps: [{ toolResults: [result("create_report")] }],
        verifierMap,
        instructions,
      })
    ).toMatchObject({
      activeTools: ["get_report_state"],
      toolChoice: { type: "tool", toolName: "get_report_state" },
    })
  })

  it("instructs the Agent not to claim failed or unverified actions completed", () => {
    expect(
      buildInstructions({
        frameVersion: 1,
        tools: {},
        toolDescriptions: "",
        specialPrompt: "",
        completionVerifiers: {},
      })
    ).toMatch(/tool error[\s\S]*Never describe.*unverified change as completed/)
  })
})

describe("Agent lifecycle logging", () => {
  it("logs only lifecycle metadata and sanitized result types", () => {
    const logger = vi.fn()
    const observe = createAgentLifecycleObserver(verifierMap, {
      enabled: true,
      logger,
    })

    observe({
      stepNumber: 0,
      finishReason: "tool-calls",
      toolCalls: [{ toolName: "create_report" }],
      toolResults: [result("create_report")],
      content: [{ type: "tool-result", toolName: "create_report" }],
    })

    expect(logger).toHaveBeenCalledWith(
      "[WebMCP agent] step",
      expect.objectContaining({
        stepNumber: 0,
        finishReason: "tool-calls",
        toolNames: ["create_report"],
        resultTypes: [{ type: "tool-result", toolName: "create_report" }],
        pendingVerifiers: ["get_report_state"],
        failedTools: [],
        finalSummary: false,
      })
    )
    expect(JSON.stringify(logger.mock.calls)).not.toContain("arguments")
    expect(JSON.stringify(logger.mock.calls)).not.toContain("prompt")
  })

  it("marks an early natural text response as the final summary", () => {
    const logger = vi.fn()
    const observe = createAgentLifecycleObserver(verifierMap, {
      enabled: true,
      logger,
    })

    observe({
      stepNumber: 0,
      finishReason: "tool-calls",
      toolCalls: [{ toolName: "create_report" }],
      toolResults: [result("create_report")],
    })
    observe({
      stepNumber: 1,
      finishReason: "tool-calls",
      toolCalls: [{ toolName: "get_report_state" }],
      toolResults: [result("get_report_state")],
    })
    observe({
      stepNumber: 2,
      finishReason: "stop",
      toolCalls: [],
      content: [{ type: "text" }],
    })

    expect(logger).toHaveBeenLastCalledWith(
      "[WebMCP agent] step",
      expect.objectContaining({
        stepNumber: 2,
        pendingVerifiers: [],
        finalSummary: true,
      })
    )
  })
})
