import { Dexie, EntityTable } from "dexie"
import type { ChatThread, SiteLastThread, StoredMessage } from "./types"

export const chatDb = new Dexie("webmcp-agent-db-v2") as Dexie & {
  threads: EntityTable<ChatThread, "id">
  messages: EntityTable<StoredMessage, "id">
  siteLastThreads: EntityTable<SiteLastThread, "siteId">
}

chatDb.version(1).stores({
  threads: "id, siteId, url, title, createdAt, updatedAt",
  messages: "id, threadId, createdAt, updatedAt, [threadId+id]",
  siteLastThreads: "siteId, threadId, updatedAt",
})
