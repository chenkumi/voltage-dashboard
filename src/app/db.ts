import { Dexie, EntityTable } from "dexie"
import type { ChatThread, StoredMessage } from "./types"

export const chatDb = new Dexie("webmcp-agent-db") as Dexie & {
  threads: EntityTable<ChatThread, "id">
  messages: EntityTable<StoredMessage, "id">
}

chatDb.version(1).stores({
  threads: "id, title, createdAt, updatedAt",
  messages: "id, threadId, createdAt, updatedAt, [threadId+id]",
})
