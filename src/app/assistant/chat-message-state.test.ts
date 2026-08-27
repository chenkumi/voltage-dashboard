import { describe, expect, it } from "vitest"
import type { UIMessage } from "ai"
import {
  mergeMessagesById,
  mergeMessageIds,
  persistableMessagesForTurn,
  withoutDiscardedAssistantMessages,
} from "./chat-message-state"

const message = (id: string, role: UIMessage["role"], text: string): UIMessage => ({
  id,
  role,
  parts: [{ type: "text", text }],
})

describe("chat message state", () => {
  it("keeps the user message for every completion outcome and only persists a complete assistant", () => {
    const user = message("user-1", "user", "Hello")
    const assistant = message("assistant-1", "assistant", "Hi")

    expect(persistableMessagesForTurn({ userMessage: user, assistantMessage: assistant, assistantStatus: "complete" })).toEqual([user, assistant])
    expect(persistableMessagesForTurn({ userMessage: user, assistantMessage: assistant, assistantStatus: "aborted" })).toEqual([user])
    expect(persistableMessagesForTurn({ userMessage: user, assistantMessage: assistant, assistantStatus: "disconnected" })).toEqual([user])
    expect(persistableMessagesForTurn({ userMessage: user, assistantMessage: assistant, assistantStatus: "error" })).toEqual([user])
  })

  it("removes discarded assistant messages without removing the persisted user", () => {
    const user = message("user-1", "user", "Hello")
    const assistant = message("assistant-1", "assistant", "Partial")

    expect(withoutDiscardedAssistantMessages([user, assistant], new Set([assistant.id]))).toEqual([user])
  })

  it("merges persisted and transient IDs while preserving persisted order", () => {
    expect(mergeMessageIds(
      ["user-1", "assistant-1"],
      ["assistant-1", "assistant-2"],
    )).toEqual(["user-1", "assistant-1", "assistant-2"])
  })

  it("merges model history by ID without duplicating the current runtime turn", () => {
    const persistedUser = message("user-1", "user", "Hello")
    const persistedAssistant = message("assistant-1", "assistant", "Hi")
    const liveUser = message("user-1", "user", "Hello")
    const liveAssistant = message("assistant-2", "assistant", "Current")

    expect(mergeMessagesById(
      [persistedUser, persistedAssistant],
      [liveUser, liveAssistant],
    )).toEqual([persistedUser, persistedAssistant, liveAssistant])
  })

})
