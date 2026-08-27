import type { ChatStatus, UIMessage } from "ai"

type Listener = () => void

export type ChatStreamActions = {
  send: (text: string) => void
  cancel: () => void
}
const messageUpdatedEvent = (messageId: string) => `${messageId}-updated`
const messageIdsUpdatedEvent = "message-ids-updated"
const statusUpdatedEvent = "status-updated"

export class ChatStreamRuntime {
  #listeners = new Map<string, Set<Listener>>()
  #messages = new Map<string, UIMessage>()
  #transientMessageIds: readonly string[] = []
  #lastStreamingMessage: UIMessage | undefined
  #status: ChatStatus = "ready"
  #actions: ChatStreamActions | undefined

  subscribe = (eventName: string, listener: Listener) => {
    const listeners = this.#listeners.get(eventName) ?? new Set<Listener>()
    listeners.add(listener)
    this.#listeners.set(eventName, listeners)

    return () => {
      listeners.delete(listener)
      if (listeners.size === 0) this.#listeners.delete(eventName)
    }
  }

  subscribeMessage = (messageId: string, listener: Listener) => {
    return this.subscribe(messageUpdatedEvent(messageId), listener)
  }

  subscribeMessageIds = (listener: Listener) => {
    return this.subscribe(messageIdsUpdatedEvent, listener)
  }

  subscribeStatus = (listener: Listener) => {
    return this.subscribe(statusUpdatedEvent, listener)
  }

  getMessage = (messageId: string) => this.#messages.get(messageId)

  getTransientMessageIds = () => this.#transientMessageIds

  isTransientMessage = (messageId: string) => this.#transientMessageIds.includes(messageId)

  getStatus = () => this.#status

  syncLatestAssistantMessage = (messages: readonly UIMessage[]) => {
    const message = messages.at(-1)
    if (!message || message.role !== "assistant") return
    if (this.#lastStreamingMessage === message) return

    this.#lastStreamingMessage = message
    const isNewMessage = !this.#messages.has(message.id)
    this.#messages.set(message.id, message)

    if (isNewMessage) {
      this.#transientMessageIds = [...this.#transientMessageIds, message.id]
      this.#emit(messageIdsUpdatedEvent)
    }

    this.#emit(messageUpdatedEvent(message.id))
  }

  reconcilePersistedMessageIds = (persistedMessageIds: readonly string[]) => {
    if (this.#transientMessageIds.length === 0) return

    const persistedIds = new Set(persistedMessageIds)
    const nextTransientIds = this.#transientMessageIds.filter((id) => !persistedIds.has(id))
    if (nextTransientIds.length === this.#transientMessageIds.length) return

    this.#transientMessageIds = nextTransientIds
    this.#emit(messageIdsUpdatedEvent)
  }

  releasePersistedMessage = (messageId: string) => {
    if (!this.#messages.delete(messageId)) return
    this.#emit(messageUpdatedEvent(messageId))
  }

  discardMessage = (messageId: string) => {
    const hadMessage = this.#messages.delete(messageId)
    const nextTransientIds = this.#transientMessageIds.filter((id) => id !== messageId)
    const hadTransientId = nextTransientIds.length !== this.#transientMessageIds.length
    this.#transientMessageIds = nextTransientIds

    if (hadMessage) this.#emit(messageUpdatedEvent(messageId))
    if (hadTransientId) this.#emit(messageIdsUpdatedEvent)
  }

  clear = () => {
    const messageIds = [...this.#messages.keys()]
    const hadTransientIds = this.#transientMessageIds.length > 0
    this.#messages.clear()
    this.#transientMessageIds = []
    this.#lastStreamingMessage = undefined

    for (const messageId of messageIds) this.#emit(messageUpdatedEvent(messageId))
    if (hadTransientIds) this.#emit(messageIdsUpdatedEvent)
  }

  setStatus = (status: ChatStatus) => {
    if (this.#status === status) return
    this.#status = status
    this.#emit(statusUpdatedEvent)
  }

  setActions = (actions: ChatStreamActions) => {
    this.#actions = actions
  }

  clearActions = (actions: ChatStreamActions) => {
    if (this.#actions === actions) this.#actions = undefined
  }

  send = (text: string) => this.#actions?.send(text)

  cancel = () => this.#actions?.cancel()

  #emit(eventName: string) {
    for (const listener of this.#listeners.get(eventName) ?? []) listener()
  }
}
