import type { UIMessage } from "ai"

export type ThreadSiteTarget = {
  siteId: string
  url: string
}

export type SiteProfile = {
  siteId: string
  url: string
  name: string
}

export type ChatThread = ThreadSiteTarget & {
  id: string
  title: string
  pin?: 0 | 1
  customTitle?: string
  createdAt: number
  updatedAt: number
}

export type SiteLastThread = {
  siteId: string
  threadId: string
  updatedAt: number
}

export type StoredMessage = {
  id: string
  threadId: string
  createdAt: number
  updatedAt: number
  message: UIMessage
}
