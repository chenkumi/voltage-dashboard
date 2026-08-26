import { dynamicTool, jsonSchema } from "ai"
import type { ToolSet } from "ai"
import type {
  WebMcpBridgeState,
  WebMcpDocument,
  WebMcpModelContext,
  WebMcpRegisteredTool,
  WebMcpWindow,
} from "./types"

const AGENT_INSTRUCTIONS_TOOL = "agent_instructions"
const SKILL_LIST_TOOL = "skill_list"
const LOAD_SKILL_TOOL = "load_skill"

const emptyState: WebMcpBridgeState = {
  frameWindow: null,
  tools: [],
  status: "idle",
  error: null,
}

const readModelContext = (frameWindow: Window): WebMcpModelContext | null => {
  return (frameWindow.document as WebMcpDocument).modelContext ?? null
}

const normalizeSchema = (schema: unknown) => {
  if (typeof schema !== "string") return schema

  try {
    return JSON.parse(schema) as unknown
  } catch {
    return undefined
  }
}

const defaultSchema = {
  type: "object",
  properties: {},
  additionalProperties: false,
}

const normalizeError = (error: unknown) => {
  if (error instanceof Error) return error.message
  return typeof error === "string" ? error : "WebMCP tool execution failed."
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

class WebMcpBridge {
  private state: WebMcpBridgeState = emptyState
  private listeners = new Set<() => void>()
  private refreshVersion = 0
  private specialContext = {
    instructions: null as string | null,
    skills: [] as Array<{ name: string; description: string }>,
    skillsLoaded: false,
  }

  getSnapshot = () => this.state

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify() {
    for (const listener of this.listeners) listener()
  }

  private setState(nextState: WebMcpBridgeState) {
    this.state = nextState
    this.notify()
  }

  async attach(frameWindow: Window | null) {
    const version = ++this.refreshVersion

    if (!frameWindow) {
      this.specialContext = { instructions: null, skills: [], skillsLoaded: false }
      this.setState(emptyState)
      return
    }

    this.setState({ frameWindow, tools: [], status: "loading", error: null })
    this.specialContext = { instructions: null, skills: [], skillsLoaded: false }

    try {
      const targetWindow = frameWindow as WebMcpWindow
      await targetWindow.__webmcpReady

      const modelContext = readModelContext(frameWindow)
      const tools = modelContext
        ? await modelContext.getTools()
        : targetWindow.__webmcpTestProvider?.getTools() ?? null

      if (version !== this.refreshVersion) return

      if (!tools) {
        this.setState({
          frameWindow,
          tools: [],
          status: "unsupported",
          error: "The embedded page does not expose a WebMCP provider.",
        })
        return
      }

      this.setState({ frameWindow, tools, status: "ready", error: null })
    } catch (error) {
      if (version !== this.refreshVersion) return

      this.setState({
        frameWindow,
        tools: [],
        status: "error",
        error: normalizeError(error),
      })
    }
  }

  async refresh() {
    await this.attach(this.state.frameWindow)
  }

  async prepareForUserInput() {
    const instructionTool = this.state.tools.find((tool) => tool.name === AGENT_INSTRUCTIONS_TOOL)
    const skillListTool = this.state.tools.find((tool) => tool.name === SKILL_LIST_TOOL)
    const loadSkillTool = this.state.tools.find((tool) => tool.name === LOAD_SKILL_TOOL)

    const instructionPromise = instructionTool
      ? this.executeRegisteredTool(instructionTool, {}).then((result) => {
          this.specialContext = {
            ...this.specialContext,
            instructions: this.readInstructionText(result),
          }
        })
      : Promise.resolve()

    const skillPromise = skillListTool && loadSkillTool
      ? this.executeRegisteredTool(skillListTool, {}).then((result) => {
          this.specialContext = {
            ...this.specialContext,
            skills: this.readSkills(result),
            skillsLoaded: true,
          }
        })
      : Promise.resolve()

    await Promise.all([instructionPromise, skillPromise])
  }

  specialPrompt() {
    const sections: string[] = []

    if (this.specialContext.instructions) {
      sections.push(`<embedded_page_instructions>\n${this.specialContext.instructions}\n</embedded_page_instructions>`)
    }

    if (this.specialContext.skillsLoaded) {
      const skills = this.specialContext.skills.length > 0
        ? this.specialContext.skills.map((skill) => `- ${skill.name}: ${skill.description}`).join("\n")
        : "- none"
      sections.push(`<embedded_page_skills>\n${skills}\n</embedded_page_skills>`)
    }

    return sections.join("\n\n")
  }

  toolDescriptions() {
    return this.agentToolDefinitions()
      .map((tool) => `- ${tool.name}: ${tool.description ?? "No description provided."}`)
      .join("\n")
  }

  aiSdkTools(): ToolSet {
    const frameWindow = this.state.frameWindow

    return Object.fromEntries(
      this.agentToolDefinitions().map((registeredTool) => [
        registeredTool.name,
        dynamicTool({
          description: registeredTool.description ?? `Execute ${registeredTool.name} in the embedded website.`,
          inputSchema: jsonSchema((normalizeSchema(registeredTool.inputSchema) ?? defaultSchema) as never),
          metadata: { source: "iframe", toolName: registeredTool.name },
          execute: async (input, { abortSignal }) => {
            return this.executeRegisteredTool(
              registeredTool,
              isRecord(input) ? input : {},
              abortSignal,
              frameWindow,
            )
          },
        }),
      ]),
    )
  }

  async executeRegisteredTool(
    tool: WebMcpRegisteredTool,
    args: Record<string, unknown>,
    signal?: AbortSignal,
    frameWindowOverride?: Window | null,
  ) {
    const frameWindow = frameWindowOverride === undefined
      ? this.state.frameWindow
      : frameWindowOverride
    if (!frameWindow) {
      return { status: "ERROR", message: "WebMCP iframe is not connected." }
    }

    const modelContext = readModelContext(frameWindow)
    const testProvider = (frameWindow as WebMcpWindow).__webmcpTestProvider

    try {
      if (modelContext) {
        return await modelContext.executeTool(tool, JSON.stringify(args), { signal })
      }

      if (testProvider) {
        return await testProvider.executeTool(tool, args)
      }

      return { status: "ERROR", message: "WebMCP provider is no longer available." }
    } catch (error) {
      return { status: "ERROR", message: normalizeError(error) }
    }
  }

  private agentToolDefinitions() {
    const skillPairIsAvailable = this.state.tools.some((tool) => tool.name === SKILL_LIST_TOOL)
      && this.state.tools.some((tool) => tool.name === LOAD_SKILL_TOOL)

    return this.state.tools
      .filter((tool) => tool.name !== AGENT_INSTRUCTIONS_TOOL)
      .filter((tool) => !(skillPairIsAvailable && tool.name === SKILL_LIST_TOOL))
  }

  private readInstructionText(result: unknown) {
    const payload = this.unwrapToolResult(result)
    if (!isRecord(payload)) return null
    const text = payload.text
    return typeof text === "string" ? text : null
  }

  private readSkills(result: unknown) {
    const payload = this.unwrapToolResult(result)
    if (!isRecord(payload) || !Array.isArray(payload.skills)) return []

    return payload.skills.filter((skill): skill is { name: string; description: string } => {
      return isRecord(skill)
        && typeof skill.name === "string"
        && typeof skill.description === "string"
    })
  }

  private unwrapToolResult(result: unknown): unknown {
    if (typeof result === "string") {
      try {
        return this.unwrapToolResult(JSON.parse(result) as unknown)
      } catch {
        return result
      }
    }

    if (!isRecord(result)) return result

    if (Array.isArray(result.content)) {
      const textBlock = result.content.find((block) => isRecord(block) && typeof block.text === "string")
      if (isRecord(textBlock) && typeof textBlock.text === "string") {
        return this.unwrapToolResult(textBlock.text)
      }
    }

    return result
  }
}

export const webMcpBridge = new WebMcpBridge()
