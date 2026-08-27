import { describe, expect, it, vi } from "vitest"
import type { UIMessage } from "ai"
import { ChatStreamRuntime } from "./chat-stream-runtime"

const message = (id: string, role: UIMessage["role"], text: string): UIMessage => ({
  id,
  role,
  parts: [{ type: "text", text }],
})

describe("ChatStreamRuntime", () => {
  it("only publishes the changed latest assistant snapshot", () => {
    const runtime = new ChatStreamRuntime()
    const user = message("user-1", "user", "Hello")
    const first = message("assistant-1", "assistant", "Hel")
    const second = message("assistant-1", "assistant", "Hello")
    const onMessageUpdated = vi.fn()
    const onMessageIdsUpdated = vi.fn()
    runtime.subscribe("assistant-1-updated", onMessageUpdated)
    runtime.subscribe("message-ids-updated", onMessageIdsUpdated)

    runtime.syncLatestAssistantMessage([user, first])
    runtime.syncLatestAssistantMessage([user, first])
    runtime.syncLatestAssistantMessage([user, second])

    expect(runtime.getMessage("assistant-1")).toBe(second)
    expect(runtime.getTransientMessageIds()).toEqual(["assistant-1"])
    expect(onMessageUpdated).toHaveBeenCalledTimes(2)
    expect(onMessageIdsUpdated).toHaveBeenCalledTimes(1)
  })

  it("ignores a latest user message without scanning or changing transient state", () => {
    const runtime = new ChatStreamRuntime()
    const onMessageIdsUpdated = vi.fn()
    runtime.subscribe("message-ids-updated", onMessageIdsUpdated)

    runtime.syncLatestAssistantMessage([message("user-1", "user", "Hello")])

    expect(runtime.getTransientMessageIds()).toEqual([])
    expect(onMessageIdsUpdated).not.toHaveBeenCalled()
  })

  it("keeps a persisted handoff snapshot until the message view releases it", () => {
    const runtime = new ChatStreamRuntime()
    const assistant = message("assistant-1", "assistant", "Done")
    const onMessageIdsUpdated = vi.fn()
    const onMessageUpdated = vi.fn()
    runtime.subscribe("message-ids-updated", onMessageIdsUpdated)
    runtime.subscribe("assistant-1-updated", onMessageUpdated)

    runtime.syncLatestAssistantMessage([assistant])
    runtime.reconcilePersistedMessageIds([assistant.id])

    expect(runtime.getTransientMessageIds()).toEqual([])
    expect(runtime.getMessage(assistant.id)).toBe(assistant)

    runtime.releasePersistedMessage(assistant.id)

    expect(runtime.getMessage(assistant.id)).toBeUndefined()
    expect(onMessageIdsUpdated).toHaveBeenCalledTimes(2)
    expect(onMessageUpdated).toHaveBeenCalledTimes(2)
  })

  it("removes an incomplete assistant without removing another runtime's data", () => {
    const runtime = new ChatStreamRuntime()
    const otherRuntime = new ChatStreamRuntime()
    const assistant = message("assistant-1", "assistant", "Partial")
    runtime.syncLatestAssistantMessage([assistant])
    otherRuntime.syncLatestAssistantMessage([assistant])

    runtime.discardMessage(assistant.id)

    expect(runtime.getMessage(assistant.id)).toBeUndefined()
    expect(runtime.getTransientMessageIds()).toEqual([])
    expect(otherRuntime.getMessage(assistant.id)).toBe(assistant)
    expect(otherRuntime.getTransientMessageIds()).toEqual([assistant.id])
  })

  it("publishes status changes and delegates actions without retaining stale actions", () => {
    const runtime = new ChatStreamRuntime()
    const onStatusUpdated = vi.fn()
    const send = vi.fn()
    const cancel = vi.fn()
    const actions = { send, cancel }
    runtime.subscribe("status-updated", onStatusUpdated)

    runtime.setStatus("streaming")
    runtime.setStatus("streaming")
    runtime.setActions(actions)
    runtime.send("Hello")
    runtime.cancel()
    runtime.clearActions(actions)
    runtime.send("Ignored")

    expect(runtime.getStatus()).toBe("streaming")
    expect(onStatusUpdated).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith("Hello")
    expect(cancel).toHaveBeenCalledTimes(1)
  })
})
