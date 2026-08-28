import { stepCountIs, ToolLoopAgent } from "ai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { PrimaryLanguage } from "@/app/assistant/env"
import {
  evaluateCompletionState,
  type CompletionStep,
  type CompletionVerifierMap,
} from "./completion-policy"
import type { PreparedWebMcpTurn } from "./session"
import { sanitizeDebugValue } from "./tool-debug"
import { createWaitForTool } from "./wait-for"

export const NORMAL_TOOL_STEP_COUNT = 10
export const VERIFIER_RESERVE_STEP = NORMAL_TOOL_STEP_COUNT
export const FINAL_SUMMARY_STEP = VERIFIER_RESERVE_STEP + 1
export const MAX_AGENT_STEPS = FINAL_SUMMARY_STEP + 1

const modelName = import.meta.env.VITE_APP_LLM_MODEL || "local-model"
const baseURL =
  import.meta.env.VITE_APP_LLM_BASE_URL || "http://localhost:1234/v1"
const apiKey = import.meta.env.VITE_APP_AUTH_KEY || "local"

const localProvider = createOpenAICompatible({
  name: "local",
  baseURL,
  apiKey,
})

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

  if (stepNumber >= FINAL_SUMMARY_STEP) {
    return {
      activeTools: [] as string[],
      toolChoice: "none" as const,
      instructions: appendInstructions(
        instructions,
        state.unverified
          ? "This is the final no-tool summary. Report FAILED or PARTIALLY_COMPLETED because one or more mutations remain unverified. Do not claim completion."
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
        state.unverified
          ? "No more tools are available. Give a final summary with status FAILED or PARTIALLY_COMPLETED and identify the unverified outcome without inventing state."
          : "No more tools are available. Give the final evidence-based summary now."
      ),
      state,
    }
  }

  return {
    instructions: state.unverified
      ? appendInstructions(
          instructions,
          "A post-mutation verifier failed. You may continue with safe corrective tools, but if you respond now the status must be FAILED or PARTIALLY_COMPLETED. Do not claim the mutation is verified."
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
  const logger = options.logger ?? console.debug

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
  return new ToolLoopAgent({
    id: "webmcp-agent",
    model: localProvider(modelName),
    instructions,
    tools: { ...turn.tools, wait_for: createWaitForTool() },
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
  })
}

export { buildInstructions }
