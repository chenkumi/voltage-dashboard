import type { UIMessage } from "ai"

export type AssistantCompletionStatus = "complete" | "aborted" | "disconnected" | "error"

export const isPersistableAssistantCompletion = (status: AssistantCompletionStatus) => status === "complete"

// AI SDK serializes `reasoning` parts as the OpenAI-compatible
// `reasoning_content` field. Keep that internal model output out of both
// persisted messages and subsequent model requests.
export const withoutReasoningContent = (messages: readonly UIMessage[]) =>
  messages.map((message) => ({
    ...message,
    parts: message.parts.filter((part) => part.type !== "reasoning"),
  }))

export const withoutToolCalls = (messages: readonly UIMessage[]) =>
  messages
    .map((message) => ({
      ...message,
      parts: message.parts.filter(
        (part) => part.type !== "dynamic-tool" && !part.type.startsWith("tool-"),
      ),
    }))
    .filter((message) => message.parts.length > 0)

export const persistableMessagesForTurn = ({
  userMessage,
  assistantMessage,
  assistantStatus,
}: {
  userMessage: UIMessage
  assistantMessage?: UIMessage
  assistantStatus: AssistantCompletionStatus
}) => {
  const messages = [userMessage]
  if (assistantMessage && isPersistableAssistantCompletion(assistantStatus)) messages.push(assistantMessage)
  return messages
}

export const mergeMessagesById = (
  persistedMessages: readonly UIMessage[],
  liveMessages: readonly UIMessage[],
) => {
  const messages = new Map(persistedMessages.map((message) => [message.id, message]))
  for (const message of liveMessages) messages.set(message.id, message)
  return [...messages.values()]
}

export const withoutDiscardedAssistantMessages = (
  messages: readonly UIMessage[],
  discardedAssistantIds: ReadonlySet<string>,
) => messages.filter((message) => !discardedAssistantIds.has(message.id) || message.role === "user")

export const mergeMessageIds = (
  persistedMessageIds: readonly string[],
  transientMessageIds: readonly string[],
) => {
  const messageIds = [...persistedMessageIds]
  const knownIds = new Set(messageIds)

  for (const id of transientMessageIds) {
    if (knownIds.has(id)) continue
    knownIds.add(id)
    messageIds.push(id)
  }

  return messageIds
}
