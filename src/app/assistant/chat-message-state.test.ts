import { describe, expect, it } from "vitest"
import type { UIMessage } from "ai"
import {
  mergeMessagesById,
  mergeMessageRows,
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

  it("deduplicates persisted and live rows while preserving persisted order", () => {
    const liveUser = message("user-1", "user", "Updated")
    const liveAssistant = message("assistant-1", "assistant", "Streaming")
    const liveNew = message("assistant-2", "assistant", "Next")

    expect(mergeMessageRows({
      persistedIds: ["user-1", "assistant-1"],
      liveMessages: [liveUser, liveAssistant, liveNew],
    })).toEqual([
      { id: "user-1", message: liveUser },
      { id: "assistant-1", message: liveAssistant },
      { id: "assistant-2", message: liveNew },
    ])
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

  it("filters discarded IDs before merging rows", () => {
    const user = message("user-1", "user", "Hello")
    const partialAssistant = message("assistant-1", "assistant", "Partial")

    expect(mergeMessageRows({
      persistedIds: [user.id],
      liveMessages: [user, partialAssistant],
      discardedAssistantIds: new Set([partialAssistant.id]),
    })).toEqual([{ id: user.id, message: user }])
  })
})
