import { useLiveQuery } from "dexie-react-hooks"
import { type UIMessage, useChat } from "@ai-sdk/react"
import { useEffect, useMemo, useRef } from "react"
import { useNavigate, useParams } from "react-router"
import { monotonicFactory } from "ulid"
import { Spinner } from "@/components/ui/spinner"
import { Toaster } from "@/components/ui/sonner"
import { WebMcpWorkspace } from "../webmcp/workspace"
import { WebMcpChatTransport } from "../webmcp/transport"
import type { ChatThread } from "../types"
import { createChatThread, getChatThread, listChatMessages, saveChatMessages } from "./chat-store"
import { AssistantChatHeader } from "./components/chat-header"
import { AssistantChatInput } from "./components/chat-input"
import { AssistantChatWindow } from "./components/chat-window"

const createId = monotonicFactory()

const Loading = () => <div className="flex h-full items-center justify-center"><Spinner className="size-10" /></div>

const createEmptyThread = (): ChatThread => {
  const timestamp = Date.now()
  return { id: createId(), title: "New Chat", createdAt: timestamp, updatedAt: timestamp }
}

const InvalidThread = () => {
  const navigate = useNavigate()
  useEffect(() => { navigate("/chat", { replace: true }) }, [navigate])
  return <Loading />
}

const ChatSession = ({ thread, records }: { thread: ChatThread; records: Awaited<ReturnType<typeof listChatMessages>> }) => {
  const transport = useMemo(() => new WebMcpChatTransport(), [])
  const generateId = useMemo(() => monotonicFactory(), [])
  const initialMessages = useMemo(() => records.map((record) => record.message), [records])
  const messageDates = useMemo(() => new Map(records.map((record) => [record.id, record.createdAt])), [records])
  const { messages, sendMessage, status, stop } = useChat<UIMessage>({
    id: thread.id,
    messages: initialMessages,
    generateId,
    transport,
    onFinish: ({ messages }) => { void saveChatMessages(thread.id, messages) },
  })

  return (
    <div className="flex h-full w-full min-w-0 overflow-hidden bg-[#101417]">
      <WebMcpWorkspace />
      <section className="flex h-full min-w-[320px] basis-[30%] flex-col overflow-hidden border-l border-white/10 bg-background">
        <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-3">
          <AssistantChatHeader title={thread.customTitle ?? thread.title} onNewThread={() => { window.location.assign("/chat") }} />
          <section className="min-h-0 flex-1 overflow-hidden" aria-label="Chat history">
            <AssistantChatWindow messages={messages} messageDates={messageDates} />
          </section>
          <AssistantChatInput status={status} onSend={(text) => { void sendMessage({ text }) }} onStop={stop} />
        </div>
      </section>
      <Toaster />
    </div>
  )
}

const ChatPage = ({ threadId }: { threadId: string }) => {
  const data = useLiveQuery(async () => ({
    thread: await getChatThread(threadId),
    records: await listChatMessages(threadId),
  }), [threadId])

  if (!data) return <Loading />
  if (!data.thread) return <InvalidThread />
  return <ChatSession key={threadId} thread={data.thread} records={data.records} />
}

export const Assistant = () => {
  const { threadId } = useParams()
  const navigate = useNavigate()
  const creatingRef = useRef(false)

  useEffect(() => {
    if (threadId || creatingRef.current) return
    creatingRef.current = true
    const thread = createEmptyThread()
    void createChatThread(thread).then(() => navigate(`/chat/${thread.id}`, { replace: true }))
  }, [navigate, threadId])

  if (!threadId) return <Loading />
  return <ChatPage threadId={threadId} />
}
