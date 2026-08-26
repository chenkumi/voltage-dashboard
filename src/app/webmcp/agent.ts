import { stepCountIs, ToolLoopAgent } from "ai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { PrimaryLanguage } from "@/app/assistant/env"
import { webMcpBridge } from "./bridge"

const modelName = import.meta.env.VITE_APP_LLM_MODEL || "local-model"
const baseURL = import.meta.env.VITE_APP_LLM_BASE_URL || "http://localhost:1234/v1"
const apiKey = import.meta.env.VITE_APP_AUTH_KEY || "local"

const localProvider = createOpenAICompatible({
  name: "local",
  baseURL,
  apiKey,
})

const buildInstructions = () => `
<role>
You are a browser WebMCP agent operating an embedded website.
</role>

<instructions>
Use only the tools exposed by the embedded iframe. Do not invent tools, use local filesystem tools, browse independently, or claim an action succeeded without a tool result.
The user can see the embedded website. Explain what happened after the tool call and ask for confirmation before a sensitive action when needed.
Always communicate in ${PrimaryLanguage()}.
</instructions>

<iframe_tools>
${webMcpBridge.toolDescriptions() || "No WebMCP tools are currently available from the embedded page."}
</iframe_tools>

<embedded_context>
${webMcpBridge.specialPrompt()}
</embedded_context>
`

export const createWebMcpAgent = async () => {
  await webMcpBridge.prepareForUserInput()

  return new ToolLoopAgent({
    id: "webmcp-agent",
    model: localProvider(modelName),
    instructions: buildInstructions(),
    tools: webMcpBridge.aiSdkTools(),
    stopWhen: stepCountIs(9),
    maxOutputTokens: 16384,
  })
}
