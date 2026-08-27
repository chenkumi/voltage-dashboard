import type { UIMessage } from "ai"

export type AssistantCompletionStatus = "complete" | "aborted" | "disconnected" | "error"

export type ChatMessageRow = {
  id: string
  message?: UIMessage
}

export const isPersistableAssistantCompletion = (status: AssistantCompletionStatus) => status === "complete"

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

export const withoutDiscardedAssistantMessages = (
  messages: readonly UIMessage[],
  discardedAssistantIds: ReadonlySet<string>,
) => messages.filter((message) => !discardedAssistantIds.has(message.id) || message.role === "user")

export const mergeMessageRows = ({
  persistedIds,
  liveMessages,
  discardedAssistantIds = new Set<string>(),
}: {
  persistedIds: readonly string[]
  liveMessages: readonly UIMessage[]
  discardedAssistantIds?: ReadonlySet<string>
}) => {
  const liveById = new Map(liveMessages.map((message) => [message.id, message]))
  const rows = new Map<string, ChatMessageRow>()

  for (const id of persistedIds) {
    if (discardedAssistantIds.has(id)) continue
    rows.set(id, { id, message: liveById.get(id) })
  }

  for (const message of liveMessages) {
    if (discardedAssistantIds.has(message.id)) continue
    if (!rows.has(message.id)) rows.set(message.id, { id: message.id, message })
  }

  return [...rows.values()]
}
