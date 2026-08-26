import { useLiveQuery } from "dexie-react-hooks"
import { type UIMessage, useChat } from "@ai-sdk/react"
import { useEffect, useMemo, useRef } from "react"
import { useNavigate, useParams } from "react-router"
import { monotonicFactory } from "ulid"
import { Spinner } from "@/components/ui/spinner"
import { Toaster } from "@/components/ui/sonner"
import { WebMcpWorkspace } from "../webmcp/workspace"
import { WebMcpChatTransport } from "../webmcp/transport"
import { defaultWebMcpSite, getWebMcpSite } from "../webmcp/sites"
import type { WebMcpSite } from "../webmcp/types"
import type { ChatThread } from "../types"
import { createChatThread, getChatThread, getLastChatThread, listChatMessages, saveChatMessages, touchSiteLastThread } from "./chat-store"
import { AssistantChatHeader } from "./components/chat-header"
import { AssistantChatInput } from "./components/chat-input"
import { AssistantChatWindow } from "./components/chat-window"

const createId = monotonicFactory()

const Loading = () => <div className="flex h-full items-center justify-center"><Spinner className="size-10" /></div>

const createEmptyThread = (site: WebMcpSite): ChatThread => {
  const timestamp = Date.now()
  return { id: createId(), siteId: site.id, url: site.url, title: "New Chat", createdAt: timestamp, updatedAt: timestamp }
}

const createOrOpenSiteThread = async (site: WebMcpSite) => {
  const lastThread = await getLastChatThread(site.id)
  if (lastThread) {
    await touchSiteLastThread(lastThread)
    return lastThread
  }

  const thread = createEmptyThread(site)
  await createChatThread(thread)
  return thread
}

const InvalidThread = () => {
  const navigate = useNavigate()
  useEffect(() => { void navigate("/chat", { replace: true }) }, [navigate])
  return <Loading />
}

const ChatSession = ({ thread, site, records }: {
  thread: ChatThread
  site: WebMcpSite
  records: Awaited<ReturnType<typeof listChatMessages>>
}) => {
  const navigate = useNavigate()
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
  const busy = status === "submitted" || status === "streaming"

  const createNewThread = async () => {
    stop()
    const nextThread = createEmptyThread(site)
    await createChatThread(nextThread)
    await navigate(`/chat/${nextThread.id}`)
  }

  const switchSite = async (nextSite: WebMcpSite) => {
    if (nextSite.id === site.id) return
    stop()
    const nextThread = await createOrOpenSiteThread(nextSite)
    await navigate(`/chat/${nextThread.id}`)
  }

  return (
    <div className="flex h-full w-full min-w-0 overflow-hidden bg-[#101417]">
      <WebMcpWorkspace site={site} onSiteChange={(nextSite) => { void switchSite(nextSite) }} disabled={busy} />
      <section className="flex h-full min-w-[320px] basis-[30%] flex-col overflow-hidden border-l border-white/10 bg-background">
        <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-3">
          <AssistantChatHeader title={thread.customTitle ?? thread.title} onNewThread={() => { void createNewThread() }} />
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
  const site = data.thread ? getWebMcpSite(data.thread.siteId) : undefined
  if (!data.thread || !site || data.thread.url !== site.url) return <InvalidThread />
  return <ChatSession key={threadId} thread={data.thread} site={site} records={data.records} />
}

export const Assistant = () => {
  const { threadId } = useParams()
  const navigate = useNavigate()
  const creatingRef = useRef(false)

  useEffect(() => {
    if (threadId || creatingRef.current) return
    creatingRef.current = true
    void createOrOpenSiteThread(defaultWebMcpSite).then((thread) => navigate(`/chat/${thread.id}`, { replace: true }))
  }, [navigate, threadId])

  if (!threadId) return <Loading />
  return <ChatPage threadId={threadId} />
}
