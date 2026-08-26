import { Agent } from "@/app/agent/agent-impl-openai"
import { PrimaryLanguage } from "@/app/assistant/env"
import { webMcpBridge } from "./bridge"

const renderIframeTools = () => {
  const tools = webMcpBridge.agentTools()
  if (tools.length === 0) return "No WebMCP tools are currently available from the embedded page."

  return tools
    .map((tool) => `- ${tool.name}: ${tool.description ?? "No description provided."}`)
    .join("\n")
}

export const webMcpAgent = new Agent("webmcp-agent")

webMcpAgent.setSystemInstruction(() => `
<role>
You are a browser WebMCP agent operating an embedded website.
</role>

<instructions>
Use only the tools exposed by the embedded iframe. Do not invent tools, use local filesystem tools, browse independently, or claim an action succeeded without a tool result.
The user can see the embedded website. Explain what happened after the tool call and ask for confirmation before a sensitive action when needed.
Always communicate in ${PrimaryLanguage()}.
</instructions>

<iframe_tools>
${renderIframeTools()}
</iframe_tools>

<embedded_context>
${webMcpBridge.specialPrompt()}
</embedded_context>
`)

webMcpAgent.setTools(() => webMcpBridge.agentTools())
webMcpAgent.setUserInputPreparation(() => webMcpBridge.prepareForUserInput())
