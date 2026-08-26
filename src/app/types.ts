import type { UIMessage } from "ai"

export type ChatThread = {
  id: string
  title: string
  pin?: 0 | 1
  customTitle?: string
  createdAt: number
  updatedAt: number
}

export type StoredMessage = {
  id: string
  threadId: string
  createdAt: number
  updatedAt: number
  message: UIMessage
}
