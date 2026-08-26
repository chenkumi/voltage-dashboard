import type { AgentExecutorProps } from "@/app/agent/agent-common"
import type {
  WebMcpAgentTool,
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

const normalizeError = (error: unknown) => {
  if (error instanceof Error) return error.message
  return typeof error === "string" ? error : "WebMCP tool execution failed."
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

    this.setState({
      frameWindow,
      tools: [],
      status: "loading",
      error: null,
    })
    this.specialContext = { instructions: null, skills: [], skillsLoaded: false }

    try {
      const modelContext = readModelContext(frameWindow)
      const targetWindow = frameWindow as WebMcpWindow
      await targetWindow.__webmcpReady
      const testProvider = targetWindow.__webmcpTestProvider

      const tools = modelContext
        ? await modelContext.getTools()
        : testProvider?.getTools() ?? null

      if (version !== this.refreshVersion) return

      if (!tools) {
        this.setState({
          frameWindow,
          tools: [],
          status: "unsupported",
          error: "此瀏覽器目前沒有可用的 WebMCP API。",
        })
        return
      }

      this.setState({
        frameWindow,
        tools,
        status: "ready",
        error: null,
      })
      this.specialContext = { instructions: null, skills: [], skillsLoaded: false }
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
          const text = this.readInstructionText(result)
          this.specialContext = { ...this.specialContext, instructions: text }
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

  agentTools(): WebMcpAgentTool[] {
    const skillPairIsAvailable = this.state.tools.some((tool) => tool.name === SKILL_LIST_TOOL)
      && this.state.tools.some((tool) => tool.name === LOAD_SKILL_TOOL)

    return this.state.tools
      .filter((tool) => tool.name !== AGENT_INSTRUCTIONS_TOOL)
      .filter((tool) => !(skillPairIsAvailable && tool.name === SKILL_LIST_TOOL))
      .map((tool) => ({
      source: "iframe",
      name: tool.name,
      description: tool.description ?? `Execute ${tool.name} in the embedded website.`,
      inputSchema: normalizeSchema(tool.inputSchema) ?? {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      executor: (props: AgentExecutorProps) => this.executeRegisteredTool(tool, props.args),
      }))
  }

  async executeRegisteredTool(tool: WebMcpRegisteredTool, args: Record<string, unknown>) {
    const frameWindow = this.state.frameWindow
    if (!frameWindow) {
      return { status: "ERROR", message: "WebMCP iframe is not connected." }
    }

    const modelContext = readModelContext(frameWindow)
    const testProvider = (frameWindow as WebMcpWindow).__webmcpTestProvider

    try {
      if (modelContext) {
        return await modelContext.executeTool(tool, JSON.stringify(args))
      }

      if (testProvider) {
        return await testProvider.executeTool(tool, args)
      }

      return { status: "ERROR", message: "WebMCP provider is no longer available." }
    } catch (error) {
      return { status: "ERROR", message: normalizeError(error) }
    }
  }

  private readInstructionText(result: unknown) {
    const payload = this.unwrapToolResult(result)
    if (!payload || typeof payload !== "object") return null
    const text = (payload as { text?: unknown }).text
    return typeof text === "string" ? text : null
  }

  private readSkills(result: unknown) {
    const payload = this.unwrapToolResult(result)
    if (!payload || typeof payload !== "object") return []
    const skills = (payload as { skills?: unknown }).skills
    if (!Array.isArray(skills)) return []

    return skills.filter((skill): skill is { name: string; description: string } => {
      return Boolean(skill)
        && typeof skill === "object"
        && typeof (skill as { name?: unknown }).name === "string"
        && typeof (skill as { description?: unknown }).description === "string"
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

    if (!result || typeof result !== "object") return result

    const content = (result as { content?: unknown }).content
    if (Array.isArray(content)) {
      const textBlock = content.find((block): block is { text: string } => {
        return Boolean(block)
          && typeof block === "object"
          && typeof (block as { text?: unknown }).text === "string"
      })

      if (textBlock) return this.unwrapToolResult(textBlock.text)
    }

    return result
  }
}

export const webMcpBridge = new WebMcpBridge()
