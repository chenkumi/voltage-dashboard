import type { AgentTool } from "@/app/agent/agent-common"

export type WebMcpRegisteredTool = {
  name: string
  description?: string
  inputSchema?: unknown
  annotations?: Record<string, unknown>
  origin?: string
  window?: Window
  [key: string]: unknown
}

export type WebMcpModelContext = {
  registerTool?: (
    tool: WebMcpRegisteredTool,
    options?: { signal?: AbortSignal },
  ) => Promise<void>
  getTools: (options?: { fromOrigins?: string[] }) => Promise<WebMcpRegisteredTool[]>
  executeTool: (
    tool: WebMcpRegisteredTool,
    input: string | Record<string, unknown>,
    options?: { signal?: AbortSignal },
  ) => Promise<unknown>
}

export type WebMcpTestProvider = {
  getTools: () => WebMcpRegisteredTool[]
  executeTool: (
    tool: WebMcpRegisteredTool,
    input: Record<string, unknown>,
  ) => Promise<unknown>
}

export type WebMcpBridgeState = {
  frameWindow: Window | null
  tools: WebMcpRegisteredTool[]
  status: "idle" | "loading" | "ready" | "unsupported" | "error"
  error: string | null
}

export type WebMcpAgentTool = AgentTool & {
  source: "iframe"
}

export type WebMcpDocument = Document & {
  modelContext?: WebMcpModelContext
}

export type WebMcpWindow = Window & {
  __webmcpReady?: Promise<void>
  __webmcpTestProvider?: WebMcpTestProvider
}
