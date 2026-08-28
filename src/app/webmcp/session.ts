import { dynamicTool, jsonSchema } from "ai"
import type { ToolSet } from "ai"
import {
  createWebMcpProviderUnavailableError,
  isAbortError,
  normalizeWebMcpToolError,
} from "./tool-error"
import type {
  WebMcpDocument,
  WebMcpModelContext,
  WebMcpNavigationState,
  WebMcpRegisteredTool,
  WebMcpSessionState,
  WebMcpWindow,
} from "./types"

const AGENT_INSTRUCTIONS_TOOL = "agent_instructions"
const SKILL_LIST_TOOL = "skill_list"
const LOAD_SKILL_TOOL = "load_skill"
const NAVIGATE_STATE_TOOL = "navigate_state"
const NAVIGATE_BACK_TOOL = "navigate_back"
const NAVIGATE_FORWARD_TOOL = "navigate_forward"
const PROVIDER_WAIT_FRAMES = 30

const createEmptyState = (): WebMcpSessionState => ({
  frameWindow: null,
  tools: [],
  navigation: null,
  status: "idle",
  error: null,
})

const defaultSchema = {
  type: "object",
  properties: {},
  additionalProperties: false,
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
  if (isAbortError(error)) return "WebMCP operation was aborted."
  return "WebMCP operation failed."
}

const logNavigationDebug = (event: string, detail: Record<string, unknown>) => {
  if (import.meta.env.DEV) {
    console.info(`[WebMCP navigation] ${event}`, detail)
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

const readModelContext = (frameWindow: Window): WebMcpModelContext | null => {
  return (frameWindow.document as WebMcpDocument).modelContext ?? null
}

const waitForAnimationFrame = (frameWindow: Window) =>
  new Promise<void>((resolve) => {
    if (typeof frameWindow.requestAnimationFrame === "function") {
      frameWindow.requestAnimationFrame(() => resolve())
      return
    }

    setTimeout(resolve, 0)
  })

const createAbortError = () => {
  const error = new Error("The WebMCP turn was aborted.")
  error.name = "AbortError"
  return error
}

export class WebMcpTurnInvalidatedError extends Error {
  constructor() {
    super("The embedded website changed before this WebMCP turn was prepared.")
    this.name = "WebMcpTurnInvalidatedError"
  }
}

export type PreparedWebMcpTurn = Readonly<{
  frameVersion: number
  tools: ToolSet
  toolDescriptions: string
  specialPrompt: string
}>

type SpecialContext = {
  instructions: string | null
  skills: Array<{ name: string; description: string }>
  skillsLoaded: boolean
}

export class WebMcpSession {
  private state: WebMcpSessionState = createEmptyState()
  private listeners = new Set<() => void>()
  private frameVersion = 0
  private discovery: Promise<void> | null = null
  private removeToolChangeListener: (() => void) | null = null
  private toolChangeContext: WebMcpModelContext | null = null
  private toolChangeRefreshQueued = false

  getSnapshot = () => this.state

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async attach(frameWindow: Window | null) {
    const frameVersion = ++this.frameVersion
    this.clearToolChangeListener()

    if (!frameWindow) {
      this.discovery = null
      this.setState(createEmptyState())
      return
    }

    this.setState({
      frameWindow,
      tools: [],
      navigation: null,
      status: "loading",
      error: null,
    })
    logNavigationDebug("iframe attached", { frameVersion })
    const discovery = this.discover(frameWindow, frameVersion)
    this.discovery = discovery

    try {
      await discovery
    } finally {
      if (this.discovery === discovery) this.discovery = null
    }
  }

  async refresh() {
    const frameWindow = this.state.frameWindow
    if (!frameWindow) return

    await this.attach(frameWindow)
  }

  async getNavigationState(): Promise<WebMcpNavigationState | null> {
    const frameWindow = this.state.frameWindow
    const frameVersion = this.frameVersion
    const discovery = this.discovery

    if (!frameWindow) return null
    if (discovery) await discovery
    if (!this.isCurrentFrame(frameVersion, frameWindow)) return null

    const navigationTool = this.state.tools.find(
      (tool) => tool.name === NAVIGATE_STATE_TOOL
    )
    if (!navigationTool) {
      logNavigationDebug("navigate_state unavailable", {
        frameVersion,
        toolNames: this.state.tools.map((tool) => tool.name),
      })
      if (this.state.navigation !== null) {
        this.setState({ ...this.state, navigation: null })
      }
      return null
    }

    return this.readAndSetNavigationState(frameWindow, frameVersion, navigationTool)
  }

  async navigate(direction: "back" | "forward") {
    const frameWindow = this.state.frameWindow
    const frameVersion = this.frameVersion
    if (!frameWindow) return null

    const toolName =
      direction === "back" ? NAVIGATE_BACK_TOOL : NAVIGATE_FORWARD_TOOL
    const navigationTool = this.state.tools.find(
      (tool) => tool.name === toolName
    )
    if (!navigationTool) return null

    logNavigationDebug("navigation requested", {
      direction,
      frameVersion,
      toolName,
    })

    const result = await this.executeNavigationTool(
      navigationTool,
      {},
      undefined,
      frameWindow
    )

    if (this.isCurrentFrame(frameVersion, frameWindow)) {
      await this.readAndSetNavigationState(frameWindow, frameVersion)
    }

    return result
  }

  dispose() {
    void this.attach(null)
  }

  async prepareTurn(signal?: AbortSignal): Promise<PreparedWebMcpTurn> {
    const frameWindow = this.state.frameWindow
    const frameVersion = this.frameVersion
    const discovery = this.discovery

    if (!frameWindow)
      return this.createPreparedTurn(
        frameVersion,
        [],
        { instructions: null, skills: [], skillsLoaded: false },
        null
      )

    if (discovery) await discovery
    this.throwIfAborted(signal)
    this.throwIfFrameChanged(frameVersion, frameWindow)

    const tools = [...this.state.tools]
    const instructionTool = tools.find(
      (tool) => tool.name === AGENT_INSTRUCTIONS_TOOL
    )
    const skillListTool = tools.find((tool) => tool.name === SKILL_LIST_TOOL)
    const skillPairIsAvailable = Boolean(
      skillListTool && tools.some((tool) => tool.name === LOAD_SKILL_TOOL)
    )

    const [instructions, skills] = await Promise.all([
      instructionTool
        ? this.executeOptionalRegisteredTool(
            instructionTool,
            {},
            signal,
            frameWindow
          ).then((result) => this.readInstructionText(result))
        : Promise.resolve(null),
      skillListTool && skillPairIsAvailable
        ? this.executeOptionalRegisteredTool(
            skillListTool,
            {},
            signal,
            frameWindow
          ).then((result) => this.readSkills(result))
        : Promise.resolve([]),
    ])

    this.throwIfAborted(signal)
    this.throwIfFrameChanged(frameVersion, frameWindow)

    return this.createPreparedTurn(
      frameVersion,
      tools,
      {
        instructions,
        skills,
        skillsLoaded: skillPairIsAvailable,
      },
      frameWindow
    )
  }

  private async discover(frameWindow: Window, frameVersion: number) {
    try {
      const targetWindow = frameWindow as WebMcpWindow
      let modelContext = readModelContext(frameWindow)
      let registrationReady = targetWindow.__webmcpReady

      for (let frame = 0; frame < PROVIDER_WAIT_FRAMES; frame += 1) {
        if (modelContext)
          this.listenForToolChanges(modelContext, frameWindow, frameVersion)

        registrationReady = targetWindow.__webmcpReady
        if (registrationReady || targetWindow.__webmcpTestProvider) break

        await waitForAnimationFrame(frameWindow)
        if (!this.isCurrentFrame(frameVersion, frameWindow)) return
        modelContext = readModelContext(frameWindow)
      }

      if (registrationReady) {
        logNavigationDebug("awaiting tool registration", { frameVersion })
        await registrationReady
      } else if (modelContext) {
        logNavigationDebug("missing registration handshake", { frameVersion })
      }
      if (!this.isCurrentFrame(frameVersion, frameWindow)) return

      modelContext = readModelContext(frameWindow)
      if (modelContext)
        this.listenForToolChanges(modelContext, frameWindow, frameVersion)
      const tools = modelContext
        ? await modelContext.getTools()
        : (targetWindow.__webmcpTestProvider?.getTools() ?? null)

      if (!this.isCurrentFrame(frameVersion, frameWindow)) return

      if (!tools) {
        this.setState({
          frameWindow,
          tools: [],
          navigation: null,
          status: "unsupported",
          error: "The embedded page does not expose a WebMCP provider.",
        })
        return
      }

      logNavigationDebug("tools discovered", {
        frameVersion,
        toolNames: tools.map((tool) => tool.name),
        hasNavigateState: tools.some(
          (tool) => tool.name === NAVIGATE_STATE_TOOL
        ),
        hasNavigateBack: tools.some(
          (tool) => tool.name === NAVIGATE_BACK_TOOL
        ),
        hasNavigateForward: tools.some(
          (tool) => tool.name === NAVIGATE_FORWARD_TOOL
        ),
      })

      this.setState({
        frameWindow,
        tools,
        navigation: null,
        status: "ready",
        error: null,
      })
      await this.readAndSetNavigationState(frameWindow, frameVersion)
    } catch (error) {
      if (!this.isCurrentFrame(frameVersion, frameWindow)) return

      logNavigationDebug("discovery failed", {
        frameVersion,
        error: normalizeError(error),
      })

      this.setState({
        frameWindow,
        tools: [],
        navigation: null,
        status: "error",
        error: normalizeError(error),
      })
    }
  }

  private createPreparedTurn(
    frameVersion: number,
    tools: WebMcpRegisteredTool[],
    specialContext: SpecialContext,
    frameWindow: Window | null
  ): PreparedWebMcpTurn {
    const agentTools = this.agentToolDefinitions(tools)
    const preparedTools = frameWindow
      ? this.createAiSdkTools(agentTools, frameWindow)
      : {}

    return Object.freeze({
      frameVersion,
      tools: Object.freeze(preparedTools) as ToolSet,
      toolDescriptions: agentTools
        .map(
          (tool) =>
            `- ${tool.name}: ${tool.description ?? "No description provided."}`
        )
        .join("\n"),
      specialPrompt: this.createSpecialPrompt(specialContext),
    })
  }

  private createAiSdkTools(
    tools: WebMcpRegisteredTool[],
    frameWindow: Window
  ): ToolSet {
    return Object.fromEntries(
      tools.map((registeredTool) => [
        registeredTool.name,
        dynamicTool({
          description:
            registeredTool.description ??
            `Execute ${registeredTool.name} in the embedded website.`,
          inputSchema: jsonSchema(
            (normalizeSchema(registeredTool.inputSchema) ??
              defaultSchema) as never
          ),
          metadata: { source: "iframe", toolName: registeredTool.name },
          execute: async (input, { abortSignal }) => {
            return this.executeRegisteredTool(
              registeredTool,
              isRecord(input) ? input : {},
              abortSignal,
              frameWindow
            )
          },
        }),
      ])
    )
  }

  private async executeRegisteredTool(
    tool: WebMcpRegisteredTool,
    args: Record<string, unknown>,
    signal: AbortSignal | undefined,
    frameWindow: Window
  ) {
    if (signal?.aborted) throw createAbortError()

    try {
      const modelContext = readModelContext(frameWindow)
      const testProvider = (frameWindow as WebMcpWindow).__webmcpTestProvider

      if (modelContext) {
        return await modelContext.executeTool(tool, JSON.stringify(args), {
          signal,
        })
      }

      if (testProvider) {
        return await testProvider.executeTool(tool, args)
      }

      throw createWebMcpProviderUnavailableError(tool.name)
    } catch (error) {
      if (isAbortError(error)) throw error
      throw normalizeWebMcpToolError(tool.name, error)
    }
  }

  private async executeOptionalRegisteredTool(
    tool: WebMcpRegisteredTool,
    args: Record<string, unknown>,
    signal: AbortSignal | undefined,
    frameWindow: Window
  ) {
    try {
      return await this.executeRegisteredTool(tool, args, signal, frameWindow)
    } catch (error) {
      if (isAbortError(error)) throw error
      return null
    }
  }

  private async executeNavigationTool(
    tool: WebMcpRegisteredTool,
    args: Record<string, unknown>,
    signal: AbortSignal | undefined,
    frameWindow: Window
  ) {
    try {
      return await this.executeRegisteredTool(tool, args, signal, frameWindow)
    } catch (error) {
      if (isAbortError(error)) throw error
      const normalized = normalizeWebMcpToolError(tool.name, error)
      return { status: "ERROR", message: normalized.message }
    }
  }

  private agentToolDefinitions(tools: WebMcpRegisteredTool[]) {
    const skillPairIsAvailable =
      tools.some((tool) => tool.name === SKILL_LIST_TOOL) &&
      tools.some((tool) => tool.name === LOAD_SKILL_TOOL)

    return tools
      .filter((tool) => tool.name !== AGENT_INSTRUCTIONS_TOOL)
      .filter(
        (tool) =>
          tool.name !== NAVIGATE_STATE_TOOL &&
          tool.name !== NAVIGATE_BACK_TOOL &&
          tool.name !== NAVIGATE_FORWARD_TOOL
      )
      .filter(
        (tool) => !(skillPairIsAvailable && tool.name === SKILL_LIST_TOOL)
      )
  }

  private createSpecialPrompt(specialContext: SpecialContext) {
    const sections: string[] = []

    if (specialContext.instructions) {
      sections.push(
        `<embedded_page_instructions>\n${specialContext.instructions}\n</embedded_page_instructions>`
      )
    }

    if (specialContext.skillsLoaded) {
      const skills =
        specialContext.skills.length > 0
          ? specialContext.skills
              .map((skill) => `- ${skill.name}: ${skill.description}`)
              .join("\n")
          : "- none"
      sections.push(
        `<embedded_page_skills>\n${skills}\n</embedded_page_skills>`
      )
    }

    return sections.join("\n\n")
  }

  private readInstructionText(result: unknown) {
    const payload = this.unwrapToolResult(result)
    if (!isRecord(payload)) return null
    return typeof payload.text === "string" ? payload.text : null
  }

  private readSkills(result: unknown) {
    const payload = this.unwrapToolResult(result)
    if (!isRecord(payload) || !Array.isArray(payload.skills)) return []

    return payload.skills.filter(
      (skill): skill is { name: string; description: string } => {
        return (
          isRecord(skill) &&
          typeof skill.name === "string" &&
          typeof skill.description === "string"
        )
      }
    )
  }

  private async readAndSetNavigationState(
    frameWindow: Window,
    frameVersion: number,
    navigationTool = this.state.tools.find(
      (tool) => tool.name === NAVIGATE_STATE_TOOL
    )
  ) {
    if (!navigationTool) {
      if (this.isCurrentFrame(frameVersion, frameWindow)) {
        this.setState({ ...this.state, navigation: null })
      }
      return null
    }

    const result = await this.executeNavigationTool(
      navigationTool,
      {},
      undefined,
      frameWindow
    )
    const navigation = this.readNavigationState(result)

    const payload = this.unwrapToolResult(result)
    logNavigationDebug("navigate_state result", {
      frameVersion,
      parsed: navigation,
      resultKind: Array.isArray(payload) ? "array" : typeof payload,
      resultKeys: isRecord(payload) ? Object.keys(payload) : [],
    })

    if (this.isCurrentFrame(frameVersion, frameWindow)) {
      const currentNavigation = this.state.navigation
      const navigationChanged =
        currentNavigation?.page !== navigation?.page ||
        currentNavigation?.canGoBack !== navigation?.canGoBack ||
        currentNavigation?.canGoForward !== navigation?.canGoForward

      if (navigationChanged) this.setState({ ...this.state, navigation })
    }

    return navigation
  }

  private readNavigationState(result: unknown): WebMcpNavigationState | null {
    const payload = this.unwrapToolResult(result)
    if (!isRecord(payload) || payload.status === "ERROR") return null

    return typeof payload.page === "string" &&
      typeof payload.canGoBack === "boolean" &&
      typeof payload.canGoForward === "boolean"
      ? {
          page: payload.page,
          canGoBack: payload.canGoBack,
          canGoForward: payload.canGoForward,
        }
      : null
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
      const textBlock = result.content.find(
        (block) => isRecord(block) && typeof block.text === "string"
      )
      if (isRecord(textBlock) && typeof textBlock.text === "string") {
        return this.unwrapToolResult(textBlock.text)
      }
    }

    return result
  }

  private isCurrentFrame(frameVersion: number, frameWindow: Window) {
    return (
      this.frameVersion === frameVersion &&
      this.state.frameWindow === frameWindow
    )
  }

  private listenForToolChanges(
    modelContext: WebMcpModelContext,
    frameWindow: Window,
    frameVersion: number
  ) {
    if (
      this.toolChangeContext === modelContext &&
      this.removeToolChangeListener
    ) {
      return
    }

    this.clearToolChangeListener()
    if (!modelContext.addEventListener || !modelContext.removeEventListener)
      return

    const onToolChange: EventListener = () => {
      if (!this.isCurrentFrame(frameVersion, frameWindow)) return
      logNavigationDebug("toolchange received", { frameVersion })
      if (this.toolChangeRefreshQueued) return

      this.toolChangeRefreshQueued = true
      queueMicrotask(() => {
        this.toolChangeRefreshQueued = false
        if (this.isCurrentFrame(frameVersion, frameWindow)) {
          void this.refreshToolsAfterToolChange(frameWindow, frameVersion)
        }
      })
    }

    modelContext.addEventListener("toolchange", onToolChange)
    this.toolChangeContext = modelContext
    this.removeToolChangeListener = () => {
      modelContext.removeEventListener?.("toolchange", onToolChange)
    }
  }

  private clearToolChangeListener() {
    this.removeToolChangeListener?.()
    this.removeToolChangeListener = null
    this.toolChangeContext = null
    this.toolChangeRefreshQueued = false
  }

  private async refreshToolsAfterToolChange(
    frameWindow: Window,
    frameVersion: number
  ) {
    const modelContext = readModelContext(frameWindow)
    if (!modelContext) return

    try {
      const tools = await modelContext.getTools()
      if (!this.isCurrentFrame(frameVersion, frameWindow)) return

      logNavigationDebug("tools refreshed after toolchange", {
        frameVersion,
        toolNames: tools.map((tool) => tool.name),
      })
      this.setState({
        ...this.state,
        tools,
        navigation: null,
        status: "ready",
        error: null,
      })
      await this.readAndSetNavigationState(frameWindow, frameVersion)
    } catch (error) {
      if (!this.isCurrentFrame(frameVersion, frameWindow)) return
      logNavigationDebug("toolchange refresh failed", {
        frameVersion,
        error: normalizeError(error),
      })
    }
  }

  private throwIfFrameChanged(frameVersion: number, frameWindow: Window) {
    if (!this.isCurrentFrame(frameVersion, frameWindow)) {
      throw new WebMcpTurnInvalidatedError()
    }
  }

  private throwIfAborted(signal?: AbortSignal) {
    if (signal?.aborted) throw createAbortError()
  }

  private setState(nextState: WebMcpSessionState) {
    this.state = nextState
    for (const listener of this.listeners) listener()
  }
}
