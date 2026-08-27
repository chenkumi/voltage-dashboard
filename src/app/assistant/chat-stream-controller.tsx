import { useChat, type UIMessage } from "@ai-sdk/react"
import { useCallback, useEffect, useMemo, useRef } from "react"
import type { WebMcpSession } from "../webmcp/session"
import { WebMcpChatTransport } from "../webmcp/transport"
import {
  isPersistableAssistantCompletion,
  withoutDiscardedAssistantMessages,
  type AssistantCompletionStatus,
} from "./chat-message-state"
import { listChatMessages, saveCompletedAssistantMessage, saveUserMessage } from "./chat-store"
import { type ChatStreamActions, ChatStreamRuntime } from "./chat-stream-runtime"

export const ChatStreamController = ({
  threadId,
  session,
  runtime,
  generateId,
}: {
  threadId: string
  session: WebMcpSession
  runtime: ChatStreamRuntime
  generateId: () => string
}) => {
  const transport = useMemo(() => new WebMcpChatTransport(session, async () => {
    const records = await listChatMessages(threadId)
    return records.map((record) => record.message)
  }), [session, threadId])
  const persistedAssistantIds = useRef(new Set<string>())
  const messagesRef = useRef<UIMessage[]>([])
  const setMessagesRef = useRef<((messages: UIMessage[] | ((messages: UIMessage[]) => UIMessage[])) => void)>()
  const activeRef = useRef(true)
  const discardIncompleteAssistants = useCallback(() => {
    const incompleteIds = messagesRef.current
      .filter((message) => message.role === "assistant" && !persistedAssistantIds.current.has(message.id))
      .map((message) => message.id)

    for (const id of incompleteIds) runtime.discardMessage(id)
    setMessagesRef.current?.((current) => withoutDiscardedAssistantMessages(current, new Set(incompleteIds)))
  }, [runtime])
  const handleFinish = useCallback(({
    message,
    isAbort,
    isDisconnect,
    isError,
  }: {
    message: UIMessage
    isAbort: boolean
    isDisconnect: boolean
    isError: boolean
  }) => {
    if (!activeRef.current) return

    const completion: AssistantCompletionStatus = isAbort
      ? "aborted"
      : isDisconnect
        ? "disconnected"
        : isError
          ? "error"
          : "complete"

    if (isPersistableAssistantCompletion(completion)) {
      persistedAssistantIds.current.add(message.id)
      void saveCompletedAssistantMessage(threadId, message, completion)
      return
    }

    runtime.discardMessage(message.id)
    setMessagesRef.current?.((current) => current.filter((item) => item.id !== message.id))
  }, [runtime, threadId])
  const { messages, sendMessage, setMessages, status, stop } = useChat<UIMessage>({
    id: threadId,
    generateId,
    transport,
    onFinish: handleFinish,
    onError: discardIncompleteAssistants,
  })
  const send = useCallback((text: string) => {
    const userMessage: UIMessage = {
      id: generateId(),
      role: "user",
      parts: [{ type: "text", text }],
    }

    void (async () => {
      try {
        await saveUserMessage(threadId, userMessage)
        await sendMessage(userMessage)
      } catch (error) {
        if (!(error instanceof Error && error.name === "AbortError")) discardIncompleteAssistants()
      }
    })()
  }, [discardIncompleteAssistants, generateId, sendMessage, threadId])
  const cancel = useCallback(() => {
    void stop().catch(() => { })
    discardIncompleteAssistants()
  }, [discardIncompleteAssistants, stop])
  const actions = useMemo<ChatStreamActions>(() => ({ send, cancel }), [cancel, send])

  useEffect(() => {
    setMessagesRef.current = setMessages
    return () => { setMessagesRef.current = undefined }
  }, [setMessages])

  useEffect(() => {
    messagesRef.current = messages
    runtime.syncLatestAssistantMessage(messages)
  }, [messages, runtime])

  useEffect(() => {
    runtime.setStatus(status)
  }, [runtime, status])

  useEffect(() => {
    runtime.setActions(actions)
    return () => runtime.clearActions(actions)
  }, [actions, runtime])

  useEffect(() => {
    activeRef.current = true
    return () => {
      activeRef.current = false
      void stop().catch(() => { })
      runtime.clear()
    }
  }, [runtime, stop])

  return null
}
