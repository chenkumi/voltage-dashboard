import { stepCountIs, ToolLoopAgent } from "ai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { PrimaryLanguage } from "@/app/assistant/env"
import type { PreparedWebMcpTurn } from "./session"
import { createWaitForTool } from "./wait-for"

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

export const createWebMcpAgent = (turn: PreparedWebMcpTurn) => {
  return new ToolLoopAgent({
    id: "webmcp-agent",
    model: localProvider(modelName),
    instructions: buildInstructions(turn),
    tools: { ...turn.tools, wait_for: createWaitForTool() },
    stopWhen: stepCountIs(9),
    maxOutputTokens: 16384,
  })
}

export { buildInstructions }
