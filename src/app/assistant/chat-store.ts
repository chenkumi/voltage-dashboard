import type { UIMessage } from "ai"
import { chatDb } from "@/app/db"
import type { ChatThread, StoredMessage } from "@/app/types"

const now = () => Date.now()

export const createChatThread = async (thread: ChatThread) => {
  await chatDb.threads.put(thread)
}

export const getChatThread = async (threadId: string) => {
  return chatDb.threads.get(threadId)
}

export const listChatMessages = async (threadId: string) => {
  return chatDb.messages.where("threadId").equals(threadId).sortBy("id")
}

export const saveChatMessages = async (threadId: string, messages: UIMessage[]) => {
  const timestamp = now()

  await chatDb.transaction("rw", chatDb.threads, chatDb.messages, async () => {
    const existing = await listChatMessages(threadId)
    const existingById = new Map(existing.map((record) => [record.id, record]))
    const nextIds = new Set(messages.map((message) => message.id))
    const records: StoredMessage[] = messages.map((message) => {
      const previous = existingById.get(message.id)

      return {
        id: message.id,
        threadId,
        createdAt: previous?.createdAt ?? timestamp,
        updatedAt: timestamp,
        message,
      }
    })

    await chatDb.messages.bulkPut(records)
    await chatDb.messages
      .where("threadId")
      .equals(threadId)
      .filter((record) => !nextIds.has(record.id))
      .delete()
    await chatDb.threads.update(threadId, { updatedAt: timestamp })
  })
}
