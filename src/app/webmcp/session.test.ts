import { describe, expect, it, vi } from "vitest"
import { WebMcpSession, WebMcpTurnInvalidatedError } from "./session"
import type { WebMcpRegisteredTool, WebMcpWindow } from "./types"

const searchTool: WebMcpRegisteredTool = {
  name: "search_catalog",
  description: "Search the current catalog.",
  inputSchema: { type: "object", properties: {} },
}

const reportingTool: WebMcpRegisteredTool = {
  name: "execute_readonly_sql",
  description: "Execute a read-only SQLite query.",
  inputSchema: { type: "object", properties: {} },
}

const reportAuthoringTool: WebMcpRegisteredTool = {
  name: "create_report",
  description: "Create an editable report in this iframe.",
  inputSchema: { type: "object", properties: {} },
}

const verifiedReportAuthoringTool: WebMcpRegisteredTool = {
  ...reportAuthoringTool,
  annotations: {
    readOnlyHint: false,
    completionVerifier: "get_report_state",
  },
}

const reportStateTool: WebMcpRegisteredTool = {
  name: "get_report_state",
  description: "Read report state.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true },
}

const instructionTool: WebMcpRegisteredTool = {
  name: "agent_instructions",
  inputSchema: { type: "object", properties: {} },
}

const skillListTool: WebMcpRegisteredTool = {
  name: "skill_list",
  inputSchema: { type: "object", properties: {} },
}

const loadSkillTool: WebMcpRegisteredTool = {
  name: "load_skill",
  inputSchema: { type: "object", properties: {} },
}

const navigationStateTool: WebMcpRegisteredTool = {
  name: "navigate_state",
  inputSchema: { type: "object", properties: {} },
}

const navigateBackTool: WebMcpRegisteredTool = {
  name: "navigate_back",
  inputSchema: { type: "object", properties: {} },
}

const navigateForwardTool: WebMcpRegisteredTool = {
  name: "navigate_forward",
  inputSchema: { type: "object", properties: {} },
}

const createFrame = (
  tools: WebMcpRegisteredTool[],
  executeTool: (
    tool: WebMcpRegisteredTool,
    input: string | Record<string, unknown>
  ) => Promise<unknown>
) =>
  ({
    document: {
      modelContext: {
        getTools: async () => tools,
        executeTool: async (
          tool: WebMcpRegisteredTool,
          input: string | Record<string, unknown>
        ) => executeTool(tool, input),
      },
    },
  }) as unknown as Window

describe("WebMcpSession", () => {
  it("creates an immutable turn from one iframe capability snapshot", async () => {
    const executeTool = vi.fn(async (tool: WebMcpRegisteredTool) => {
      if (tool.name === "agent_instructions")
        return { text: "Use the studio catalog." }
      if (tool.name === "skill_list") {
        return {
          skills: [{ name: "catalog-guide", description: "Catalog rules" }],
        }
      }
      return { status: "OK" }
    })
    const session = new WebMcpSession()
    await session.attach(
      createFrame(
        [searchTool, instructionTool, skillListTool, loadSkillTool],
        executeTool
      )
    )

    const turn = await session.prepareTurn()

    expect(Object.isFrozen(turn)).toBe(true)
    expect(Object.keys(turn.tools)).toEqual(["search_catalog", "load_skill"])
    expect(turn.toolDescriptions).toContain("search_catalog")
    expect(turn.specialPrompt).toContain("Use the studio catalog.")
    expect(turn.specialPrompt).toContain("catalog-guide: Catalog rules")
  })

  it("invalidates a turn when the iframe changes during special-context discovery", async () => {
    let resolveInstruction: ((value: unknown) => void) | undefined
    const deferredInstruction = new Promise<unknown>((resolve) => {
      resolveInstruction = resolve
    })
    const session = new WebMcpSession()
    const frameA = createFrame(
      [instructionTool],
      async () => deferredInstruction
    )
    const frameB = createFrame([searchTool], async () => ({ status: "OK" }))

    await session.attach(frameA)
    const pendingTurn = session.prepareTurn()
    await Promise.resolve()
    await session.attach(frameB)
    resolveInstruction?.({ text: "Stale instructions" })

    await expect(pendingTurn).rejects.toBeInstanceOf(WebMcpTurnInvalidatedError)
  })

  it("waits one iframe frame for a same-origin test provider to register", async () => {
    const session = new WebMcpSession()
    const frame = {
      document: {},
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        setTimeout(() => callback(0), 0)
        return 0
      },
    } as unknown as Window & WebMcpWindow

    const attaching = session.attach(frame)
    await Promise.resolve()
    frame.__webmcpTestProvider = {
      getTools: () => [searchTool],
      executeTool: async () => ({ content: [] }),
    }

    await attaching
    expect(session.getSnapshot().status).toBe("ready")
    expect(session.getSnapshot().tools).toEqual([searchTool])
  })

  it("waits for a lazy-loaded iframe provider before reporting unsupported", async () => {
    const session = new WebMcpSession()
    let animationFrames = 0
    const frame = {
      document: {},
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        setTimeout(() => {
          animationFrames += 1
          if (animationFrames === 3) {
            frame.__webmcpTestProvider = {
              getTools: () => [searchTool],
              executeTool: async () => ({ content: [] }),
            }
          }
          callback(0)
        }, 0)
        return 0
      },
    } as unknown as Window & WebMcpWindow

    await session.attach(frame)

    expect(session.getSnapshot().status).toBe("ready")
    expect(session.getSnapshot().tools).toEqual([searchTool])
  })

  it("checks tools only after the iframe registration promise resolves", async () => {
    let resolveRegistration: (() => void) | undefined
    const registrationReady = new Promise<void>((resolve) => {
      resolveRegistration = resolve
    })
    const getTools = vi.fn(async () => [searchTool])
    const frame = {
      document: {
        modelContext: {
          getTools,
          executeTool: async () => ({ status: "OK" }),
        },
      },
      __webmcpReady: registrationReady,
    } as unknown as Window & WebMcpWindow
    const session = new WebMcpSession()
    const attaching = session.attach(frame)

    await Promise.resolve()
    expect(getTools).not.toHaveBeenCalled()
    resolveRegistration?.()
    await attaching

    expect(getTools).toHaveBeenCalledOnce()
    expect(session.getSnapshot().tools).toEqual([searchTool])
  })

  it("rechecks tools after a model context toolchange event", async () => {
    const listeners = new Set<EventListener>()
    let tools = [searchTool]
    const modelContext = {
      getTools: async () => tools,
      executeTool: async () => ({ status: "OK" }),
      addEventListener: (_type: "toolchange", listener: EventListener) => {
        listeners.add(listener)
      },
      removeEventListener: (_type: "toolchange", listener: EventListener) => {
        listeners.delete(listener)
      },
    }
    const frame = {
      document: { modelContext },
      __webmcpReady: Promise.resolve(),
    } as unknown as Window & WebMcpWindow
    const session = new WebMcpSession()
    await session.attach(frame)

    tools = [searchTool, navigationStateTool]
    for (const listener of listeners) listener(new Event("toolchange"))

    await vi.waitFor(() => {
      expect(session.getSnapshot().tools).toEqual(tools)
    })
  })

  it("keeps a prepared tool executor bound to its original iframe", async () => {
    const executeA = vi.fn(async () => ({ site: "A" }))
    const executeB = vi.fn(async () => ({ site: "B" }))
    const session = new WebMcpSession()

    await session.attach(createFrame([searchTool], executeA))
    const turnA = await session.prepareTurn()
    await session.attach(createFrame([searchTool], executeB))

    const execute = turnA.tools.search_catalog.execute
    if (!execute) throw new Error("Prepared iframe tool must be executable.")

    await expect(
      execute(
        { query: "mug" },
        {
          toolCallId: "tool-call",
          messages: [],
          context: {},
        }
      )
    ).resolves.toEqual({ site: "A" })
    expect(executeA).toHaveBeenCalledOnce()
    expect(executeB).not.toHaveBeenCalled()
  })

  it("keeps a prepared reporting executor bound to its original iframe runtime", async () => {
    const executeA = vi.fn(async () => ({ runtime: "admin-a" }))
    const executeB = vi.fn(async () => ({ runtime: "admin-b" }))
    const session = new WebMcpSession()

    await session.attach(createFrame([reportingTool], executeA))
    const turnA = await session.prepareTurn()
    await session.attach(createFrame([reportingTool], executeB))
    const execute = turnA.tools.execute_readonly_sql.execute
    if (!execute) throw new Error("Prepared reporting tool must be executable.")

    await expect(
      execute(
        { sql: "SELECT COUNT(*) FROM agent_products" },
        { toolCallId: "sql-call", messages: [], context: {} }
      )
    ).resolves.toEqual({ runtime: "admin-a" })
    expect(executeA).toHaveBeenCalledWith(
      expect.objectContaining({ name: "execute_readonly_sql" }),
      '{"sql":"SELECT COUNT(*) FROM agent_products"}'
    )
    expect(executeB).not.toHaveBeenCalled()
  })

  it("keeps a prepared report authoring executor bound to its original iframe state", async () => {
    const executeA = vi.fn(async () => ({ report: "admin-a" }))
    const executeB = vi.fn(async () => ({ report: "admin-b" }))
    const session = new WebMcpSession()

    await session.attach(createFrame([reportAuthoringTool], executeA))
    const turnA = await session.prepareTurn()
    await session.attach(createFrame([reportAuthoringTool], executeB))
    const execute = turnA.tools.create_report.execute
    if (!execute) throw new Error("Prepared report tool must be executable.")

    await expect(
      execute(
        { title: "Weekly operations" },
        { toolCallId: "report-call", messages: [], context: {} }
      )
    ).resolves.toEqual({ report: "admin-a" })
    expect(executeA).toHaveBeenCalledWith(
      expect.objectContaining({ name: "create_report" }),
      '{"title":"Weekly operations"}'
    )
    expect(executeB).not.toHaveBeenCalled()
  })

  it("captures only a safe same-turn completion verifier mapping", async () => {
    const session = new WebMcpSession()
    await session.attach(
      createFrame(
        [verifiedReportAuthoringTool, reportStateTool],
        async () => ({ status: "OK" })
      )
    )

    const turn = await session.prepareTurn()

    expect(turn.completionVerifiers).toEqual({
      create_report: "get_report_state",
    })
    expect(Object.isFrozen(turn.completionVerifiers)).toBe(true)
  })

  it("does not carry a completion verifier across iframe turns", async () => {
    const session = new WebMcpSession()
    await session.attach(
      createFrame(
        [verifiedReportAuthoringTool, reportStateTool],
        async () => ({ status: "OK" })
      )
    )
    const turnA = await session.prepareTurn()

    await session.attach(
      createFrame([reportAuthoringTool], async () => ({ status: "OK" }))
    )
    const turnB = await session.prepareTurn()

    expect(turnA.completionVerifiers).toEqual({
      create_report: "get_report_state",
    })
    expect(turnB.completionVerifiers).toEqual({})
  })

  it("rejects agent-facing tool failures with a normalized cross-realm error", async () => {
    const session = new WebMcpSession()
    await session.attach(
      createFrame([reportAuthoringTool], async () =>
        Promise.reject({
          name: "ReportStateError",
          category: "REPORT_ARGUMENT_ERROR",
          message: "Report tool input contains unsupported fields.",
        })
      )
    )
    const turn = await session.prepareTurn()
    const execute = turn.tools.create_report.execute
    if (!execute) throw new Error("Prepared report tool must be executable.")

    await expect(
      execute(
        { title: "Weekly operations", reportId: "unsupported" },
        { toolCallId: "report-call", messages: [], context: {} }
      )
    ).rejects.toMatchObject({
      name: "WebMcpToolExecutionError",
      toolName: "create_report",
      category: "REPORT_ARGUMENT_ERROR",
      retryable: true,
      message:
        "[REPORT_ARGUMENT_ERROR] Report tool arguments are invalid. Inspect the tool schema and retry with only supported fields.",
    })
  })

  it("does not expose unknown provider exceptions to agent-facing tools", async () => {
    const session = new WebMcpSession()
    await session.attach(
      createFrame([reportAuthoringTool], async () =>
        Promise.reject({ stack: "secret stack", value: "private@example.com" })
      )
    )
    const turn = await session.prepareTurn()
    const execute = turn.tools.create_report.execute
    if (!execute) throw new Error("Prepared report tool must be executable.")

    await expect(
      execute(
        { title: "Weekly operations" },
        { toolCallId: "report-call", messages: [], context: {} }
      )
    ).rejects.toMatchObject({
      category: "WEBMCP_TOOL_ERROR",
      message: "[WEBMCP_TOOL_ERROR] WebMCP tool execution failed.",
    })
  })

  it("keeps failures from optional special-context tools out of the turn lifecycle", async () => {
    const session = new WebMcpSession()
    await session.attach(
      createFrame(
        [searchTool, instructionTool, skillListTool, loadSkillTool],
        async (tool) => {
          if (tool.name === "agent_instructions" || tool.name === "skill_list")
            throw {
              category: "SPECIAL_CONTEXT_ERROR",
              message: "Optional context unavailable.",
            }
          return { status: "OK" }
        }
      )
    )

    await expect(session.prepareTurn()).resolves.toMatchObject({
      specialPrompt: expect.not.stringContaining("Optional context unavailable"),
    })
  })

  it("does not swallow aborts from optional special-context tools", async () => {
    const session = new WebMcpSession()
    await session.attach(
      createFrame([instructionTool], async () =>
        Promise.reject({ name: "AbortError", message: "aborted" })
      )
    )

    await expect(session.prepareTurn()).rejects.toMatchObject({
      name: "AbortError",
    })
  })

  it("rejects an agent-facing executor when its abort signal is already aborted", async () => {
    const session = new WebMcpSession()
    await session.attach(createFrame([searchTool], async () => ({ status: "OK" })))
    const turn = await session.prepareTurn()
    const execute = turn.tools.search_catalog.execute
    if (!execute) throw new Error("Prepared iframe tool must be executable.")
    const controller = new AbortController()
    controller.abort()

    await expect(
      execute(
        {},
        {
          toolCallId: "search-call",
          messages: [],
          context: {},
          abortSignal: controller.signal,
        }
      )
    ).rejects.toMatchObject({ name: "AbortError" })
  })

  it("keeps optional navigation tools host-only and tracks navigation state", async () => {
    const executeTool = vi.fn(async (tool: WebMcpRegisteredTool) => {
      if (tool.name === "navigate_state") {
        return {
          status: "OK",
          page: "catalog",
          canGoBack: false,
          canGoForward: true,
        }
      }
      return { status: "OK" }
    })
    const session = new WebMcpSession()
    await session.attach(
      createFrame(
        [
          searchTool,
          navigationStateTool,
          navigateBackTool,
          navigateForwardTool,
        ],
        executeTool
      )
    )

    expect(session.getSnapshot().navigation).toEqual({
      page: "catalog",
      canGoBack: false,
      canGoForward: true,
    })
    const turn = await session.prepareTurn()
    expect(Object.keys(turn.tools)).toEqual(["search_catalog"])

    await session.navigate("back")
    expect(executeTool).toHaveBeenCalledWith(
      expect.objectContaining({ name: "navigate_back" }),
      "{}"
    )
  })

  it("returns a safe error result when host-only navigation fails", async () => {
    const session = new WebMcpSession()
    await session.attach(
      createFrame(
        [navigationStateTool, navigateBackTool],
        async (tool) => {
          if (tool.name === "navigate_state")
            return {
              status: "OK",
              page: "catalog",
              canGoBack: true,
              canGoForward: false,
            }
          throw {
            category: "REPORT_ARGUMENT_ERROR",
            message: "Navigation failed for private@example.com.",
          }
        }
      )
    )

    await expect(session.navigate("back")).resolves.toEqual({
      status: "ERROR",
      message:
        "[REPORT_ARGUMENT_ERROR] Report tool arguments are invalid. Inspect the tool schema and retry with only supported fields.",
    })
    expect(session.getSnapshot().navigation).toEqual({
      page: "catalog",
      canGoBack: true,
      canGoForward: false,
    })
  })
})
