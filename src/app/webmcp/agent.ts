import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogle } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import {
  stepCountIs,
  ToolLoopAgent,
  type LanguageModel,
  type ToolSet,
} from "ai"
import { PrimaryLanguage } from "@/app/assistant/env"
import {
  evaluateCompletionState,
  type CompletionStep,
  type CompletionVerifierMap,
} from "./completion-policy"
import type { PreparedWebMcpTurn } from "./session"
import { sanitizeDebugValue, writeStructuredDebugLog } from "./tool-debug"
import { createWaitForTool } from "./wait-for"

export const NORMAL_TOOL_STEP_COUNT = 10
export const VERIFIER_RESERVE_STEP = NORMAL_TOOL_STEP_COUNT
export const FINAL_SUMMARY_STEP = VERIFIER_RESERVE_STEP + 1
export const MAX_AGENT_STEPS = FINAL_SUMMARY_STEP + 1

export const APP_PROVIDERS = [
  "openai-compatible",
  "openai",
  "anthropic",
  "gemini",
] as const

export type AppProvider = (typeof APP_PROVIDERS)[number]

export const THINKING_LEVELS = [
  "provider-default",
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const

export type ThinkingLevel = (typeof THINKING_LEVELS)[number]

type LanguageModelSettings = {
  provider: AppProvider
  modelName: string
  baseURL?: string
  apiKey?: string
}

export const parseAppProvider = (value?: string): AppProvider => {
  if (!value) return "openai-compatible"

  if (APP_PROVIDERS.includes(value as AppProvider)) {
    return value as AppProvider
  }

  throw new Error(
    `Unsupported VITE_APP_PROVIDER: ${value}. Expected one of: ${APP_PROVIDERS.join(
      ", "
    )}.`
  )
}

export const parseThinkingLevel = (
  value?: string
): ThinkingLevel | undefined => {
  if (!value) return undefined

  if (THINKING_LEVELS.includes(value as ThinkingLevel)) {
    return value as ThinkingLevel
  }

  throw new Error(
    `Unsupported VITE_APP_LLM_THINKING_LEVEL: ${value}. Expected one of: ${THINKING_LEVELS.join(
      ", "
    )}.`
  )
}

export const createThinkingSettings = (thinkingLevel?: ThinkingLevel) =>
  thinkingLevel ? { reasoning: thinkingLevel } : {}

export const createLanguageModel = ({
  provider,
  modelName,
  baseURL,
  apiKey,
}: LanguageModelSettings): LanguageModel => {
  switch (provider) {
    case "openai-compatible":
      return createOpenAICompatible({
        name: "local",
        baseURL: baseURL || "http://localhost:1234/v1",
        apiKey: apiKey || "local",
      })(modelName)
    case "openai":
      return createOpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) })(
        modelName
      )
    case "anthropic":
      return createAnthropic({ apiKey, ...(baseURL ? { baseURL } : {}) })(
        modelName
      )
    case "gemini":
      return createGoogle({ apiKey, ...(baseURL ? { baseURL } : {}) })(
        modelName
      )
  }
}

const provider = parseAppProvider(import.meta.env.VITE_APP_PROVIDER)
const modelName = import.meta.env.VITE_APP_LLM_MODEL || "local-model"
const baseURL = import.meta.env.VITE_APP_LLM_BASE_URL
const apiKey = import.meta.env.VITE_APP_AUTH_KEY
const thinkingLevel = parseThinkingLevel(
  import.meta.env.VITE_APP_LLM_THINKING_LEVEL
)

const buildInstructions = (turn: PreparedWebMcpTurn) => `
<role>
You are a browser WebMCP agent operating an embedded website.
</role>

<instructions>
Use only the tools exposed by the embedded iframe, except wait_for, which only waits and does not interact with the website. Do not invent tools, use local filesystem tools, browse independently, or claim an action succeeded without a tool result.
Treat every tool error as an incomplete operation. Correct the input when safe and retryable; otherwise report the failure. Never describe a planned, failed, or unverified change as completed.
The user can see the embedded website. Explain what happened after the tool call and ask for confirmation before a sensitive action when needed.
Never ask the user to provide, paste, or confirm personal data (including name, email, address, phone, account identifiers) or payment data in this chat. Do not repeat any such data if the user volunteers it.
For checkout, payment, cancellation, or any other high-risk step, only use a navigation tool exposed by the iframe when available. Tell the user to enter sensitive data and press the final confirmation directly inside the embedded website; never use a tool to submit, confirm, create, cancel, or otherwise complete that high-risk action.
Always communicate in ${PrimaryLanguage()}.
</instructions>

<iframe_tools>
${turn.toolDescriptions || "No WebMCP tools are currently available from the embedded page."}
</iframe_tools>

<embedded_context>
${turn.specialPrompt}
</embedded_context>
`

type AgentStepDecisionInput = {
  stepNumber: number
  steps: readonly CompletionStep[]
  verifierMap: CompletionVerifierMap
  instructions: string
}

const appendInstructions = (instructions: string, addition: string) =>
  `${instructions}\n\n<completion_policy>\n${addition}\n</completion_policy>`

export const createAgentStepDecision = ({
  stepNumber,
  steps,
  verifierMap,
  instructions,
}: AgentStepDecisionInput) => {
  const state = evaluateCompletionState(steps, verifierMap)
  const incompleteOperations = [
    ...new Set([
      ...state.failedTools,
      ...state.failedVerifiers,
      ...state.pendingVerifiers,
    ]),
  ].join(", ")

  if (stepNumber >= FINAL_SUMMARY_STEP) {
    return {
      activeTools: [] as string[],
      toolChoice: "none" as const,
      instructions: appendInstructions(
        instructions,
        state.unverified || state.failedTools.length > 0
          ? `This is the final no-tool summary. Report FAILED or PARTIALLY_COMPLETED because these operations failed or remain unverified: ${incompleteOperations}. Identify the missing outcome and do not claim completion.`
          : "This is the final no-tool summary. Summarize only outcomes supported by successful tool results and post-mutation verification."
      ),
      state,
    }
  }

  if (state.pendingVerifiers.length > 0) {
    const activeTools = [...state.pendingVerifiers]
    return {
      activeTools,
      toolChoice:
        activeTools.length === 1
          ? ({ type: "tool", toolName: activeTools[0] } as const)
          : ("required" as const),
      instructions: appendInstructions(
        instructions,
        `A successful mutation must now be verified. Call only: ${activeTools.join(
          ", "
        )}. Do not claim completion before this post-mutation verification result.`
      ),
      state,
    }
  }

  if (stepNumber >= VERIFIER_RESERVE_STEP) {
    return {
      activeTools: [] as string[],
      toolChoice: "none" as const,
      instructions: appendInstructions(
        instructions,
        state.unverified || state.failedTools.length > 0
          ? `No more tools are available. Give a final summary with status FAILED or PARTIALLY_COMPLETED because these operations failed or remain unverified: ${incompleteOperations}. Identify the missing outcome without inventing state.`
          : "No more tools are available. Give the final evidence-based summary now."
      ),
      state,
    }
  }

  return {
    instructions:
      state.unverified || state.failedTools.length > 0
        ? appendInstructions(
            instructions,
            `One or more tool operations remain failed or unverified (${incompleteOperations}). Continue with a safe corrective retry when possible. If you respond now, begin the final answer with FAILED or PARTIALLY_COMPLETED. Do not claim the failed operation completed.`
          )
        : instructions,
    state,
  }
}

type LifecycleStep = CompletionStep & {
  stepNumber: number
  finishReason: string
  toolCalls?: readonly { toolName: string }[]
}

type LifecycleLogger = (message: string, detail: unknown) => void

export const createAgentLifecycleObserver = (
  verifierMap: CompletionVerifierMap,
  options: {
    enabled?: boolean
    logger?: LifecycleLogger
  } = {}
) => {
  const steps: LifecycleStep[] = []
  const enabled = options.enabled ?? import.meta.env.DEV
  const logger = options.logger ?? writeStructuredDebugLog

  return (step: LifecycleStep) => {
    steps.push(step)
    if (!enabled) return
    const state = evaluateCompletionState(steps, verifierMap)
    const toolNames = (step.toolCalls ?? []).map((call) => call.toolName)
    const resultTypes = (step.content ?? [])
      .filter(
        (part) => part.type === "tool-result" || part.type === "tool-error"
      )
      .map((part) => ({ type: part.type, toolName: part.toolName }))
    const hasText = (step.content ?? []).some((part) => part.type === "text")
    try {
      logger(
        "[WebMCP agent] step",
        sanitizeDebugValue({
          stepNumber: step.stepNumber,
          finishReason: step.finishReason,
          toolNames,
          resultTypes,
          pendingVerifiers: state.pendingVerifiers,
          failedVerifiers: state.failedVerifiers,
          failedTools: state.failedTools,
          finalSummary:
            toolNames.length === 0 &&
            (hasText ||
              step.finishReason !== "tool-calls" ||
              step.stepNumber >= VERIFIER_RESERVE_STEP),
        })
      )
    } catch {
      // Debug instrumentation must never change Agent execution behavior.
    }
  }
}

export const createWebMcpAgent = (turn: PreparedWebMcpTurn) => {
  const instructions = buildInstructions(turn)
  const observeStep = createAgentLifecycleObserver(turn.completionVerifiers)
  const tools: ToolSet = { ...turn.tools, wait_for: createWaitForTool() }
  return new ToolLoopAgent({
    id: "webmcp-agent",
    model: createLanguageModel({ provider, modelName, baseURL, apiKey }),
    instructions,
    tools,
    stopWhen: stepCountIs(MAX_AGENT_STEPS),
    prepareStep: ({ stepNumber, steps }) =>
      createAgentStepDecision({
        stepNumber,
        steps,
        verifierMap: turn.completionVerifiers,
        instructions,
      }),
    onStepEnd: observeStep,
    maxOutputTokens: 16384,
    ...createThinkingSettings(thinkingLevel),
  })
}

export { buildInstructions }
