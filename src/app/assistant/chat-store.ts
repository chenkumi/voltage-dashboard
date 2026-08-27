import type { UIMessage } from "ai"
import { Dexie } from "dexie"
import { chatDb } from "@/app/db"
import type { ChatThread, StoredMessage } from "@/app/types"
import {
  isPersistableAssistantCompletion,
  type AssistantCompletionStatus,
  withoutReasoningContent,
} from "./chat-message-state"

const now = () => Date.now()

export const createChatThread = async (thread: ChatThread) => {
  await chatDb.transaction("rw", chatDb.threads, chatDb.siteLastThreads, async () => {
    await chatDb.threads.put(thread)
    await chatDb.siteLastThreads.put({
      siteId: thread.siteId,
      threadId: thread.id,
      updatedAt: thread.updatedAt,
    })
  })
}

export const getChatThread = async (threadId: string) => {
  return chatDb.threads.get(threadId)
}

export const getLastChatThread = async (siteId: string) => {
  const lastThread = await chatDb.siteLastThreads.get(siteId)
  if (!lastThread) return undefined

  const thread = await chatDb.threads.get(lastThread.threadId)
  if (!thread || thread.siteId !== siteId) {
    await chatDb.siteLastThreads.delete(siteId)
    return undefined
  }

  return thread
}

export const touchSiteLastThread = async (thread: ChatThread) => {
  await chatDb.siteLastThreads.put({
    siteId: thread.siteId,
    threadId: thread.id,
    updatedAt: Date.now(),
  })
}

export const listChatMessages = async (threadId: string) => {
  return chatDb.messages.where("threadId").equals(threadId).sortBy("id")
}

export const listChatMessageIds = async (threadId: string) => {
  const ids = await chatDb.messages
    .where("[threadId+id]")
    .between([threadId, Dexie.minKey], [threadId, Dexie.maxKey])
    .primaryKeys()

  return ids.map(String)
}

export const getChatMessage = async (threadId: string, messageId: string) => {
  const record = await chatDb.messages.get(messageId)
  return record?.threadId === threadId ? record : undefined
}

const persistMessage = async (threadId: string, message: UIMessage) => {
  const timestamp = now()
  const [sanitizedMessage] = withoutReasoningContent([message])

  await chatDb.transaction("rw", chatDb.threads, chatDb.messages, chatDb.siteLastThreads, async () => {
    const thread = await chatDb.threads.get(threadId)
    if (!thread) return

    const existing = await chatDb.messages.get(message.id)
    if (existing?.threadId && existing.threadId !== threadId) return

    const record: StoredMessage = {
      id: message.id,
      threadId,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      message: sanitizedMessage,
    }

    await chatDb.messages.put(record)
    await chatDb.threads.update(threadId, { updatedAt: timestamp })
    await chatDb.siteLastThreads.put({
      siteId: thread.siteId,
      threadId,
      updatedAt: timestamp,
    })
  })
}

export const saveUserMessage = async (threadId: string, message: UIMessage) => {
  if (message.role !== "user") throw new Error("Only user messages can use saveUserMessage.")
  await persistMessage(threadId, message)
}

export const saveCompletedAssistantMessage = async (
  threadId: string,
  message: UIMessage,
  completion: AssistantCompletionStatus,
) => {
  if (message.role !== "assistant") throw new Error("Only assistant messages can use saveCompletedAssistantMessage.")
  if (!isPersistableAssistantCompletion(completion)) return
  await persistMessage(threadId, message)
}
