import { useTheme } from "@/app/theme-context"
import { Toaster } from "@/components/ui/sonner"
import { Spinner } from "@/components/ui/spinner"
import { useLiveQuery } from "dexie-react-hooks"
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { monotonicFactory } from "ulid"
import type { ChatThread, ThreadSiteTarget } from "../types"
import { WebMcpSession } from "../webmcp/session"
import { createThreadSiteTarget, defaultWebMcpSite, resolveThreadSite } from "../webmcp/sites"
import type { WebMcpSite } from "../webmcp/types"
import { WebMcpWorkspace } from "../webmcp/workspace"
import { AssistantChatHeader } from "./chat-header"
import { AssistantChatInput } from "./chat-input"
import { ChatStreamController } from "./chat-stream-controller"
import { createChatThread, getChatThread, getLastChatThread, touchSiteLastThread } from "./chat-store"
import { ChatStreamRuntime } from "./chat-stream-runtime"
import { AssistantChatWindow } from "./chat-window"

const createId = monotonicFactory()

const Loading = () => <div className="flex h-full items-center justify-center"><Spinner className="size-10" /></div>

const createEmptyThread = (site: WebMcpSite): ChatThread => {
    const timestamp = Date.now()
    return { id: createId(), ...createThreadSiteTarget(site), title: "New Chat", createdAt: timestamp, updatedAt: timestamp }
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

const ChatWorkspace = ({
    site,
    target,
    session,
    runtime,
    onSiteChange,
}: {
    site: WebMcpSite
    target: ThreadSiteTarget
    session: WebMcpSession
    runtime: ChatStreamRuntime
    onSiteChange: (site: WebMcpSite) => void
}) => {
    const status = useSyncExternalStore(runtime.subscribeStatus, runtime.getStatus, runtime.getStatus)
    const disabled = status === "submitted" || status === "streaming"

    return <WebMcpWorkspace site={site} target={target} session={session} onSiteChange={onSiteChange} disabled={disabled} />
}

const ChatSession = ({ thread, site, target }: {
    thread: ChatThread
    site: WebMcpSite
    target: ThreadSiteTarget
}) => {
    const navigate = useNavigate()
    const { theme } = useTheme()
    const session = useMemo(() => new WebMcpSession(), [])
    const runtime = useMemo(() => new ChatStreamRuntime(), [])
    const generateId = useMemo(() => monotonicFactory(), [])

    useEffect(() => () => session.dispose(), [session])

    const createNewThread = useCallback(async () => {
        runtime.cancel()
        session.dispose()
        const nextThread = createEmptyThread(site)
        await createChatThread(nextThread)
        await navigate(`/chat/${nextThread.id}`)
    }, [navigate, runtime, session, site])

    const switchSite = useCallback(async (nextSite: WebMcpSite) => {
        if (nextSite.id === site.id) return
        runtime.cancel()
        session.dispose()
        const nextThread = await createOrOpenSiteThread(nextSite)
        await navigate(`/chat/${nextThread.id}`)
    }, [navigate, runtime, session, site.id])

    return (
        <div className="flex h-full w-full min-w-0 overflow-hidden bg-[#101417]">
            <ChatStreamController threadId={thread.id} session={session} runtime={runtime} generateId={generateId} />
            <ChatWorkspace site={site} target={target} session={session} runtime={runtime} onSiteChange={switchSite} />
            <section className="flex h-full min-w-[320px] basis-[30%] flex-col overflow-hidden border-l border-white/10 bg-background">
                <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-3">
                    <AssistantChatHeader title={thread.customTitle ?? thread.title} onNewThread={createNewThread} />
                    <section className="min-h-0 flex-1 overflow-hidden" aria-label="Chat history">
                        <AssistantChatWindow threadId={thread.id} runtime={runtime} />
                    </section>
                    <AssistantChatInput runtime={runtime} />
                </div>
            </section>
            <Toaster theme={theme} />
        </div>
    )
}

const ChatPage = ({ threadId }: { threadId: string }) => {
    const thread = useLiveQuery(() => getChatThread(threadId), [threadId])

    if (thread === undefined) return <Loading />
    const resolvedSite = thread ? resolveThreadSite(thread) : undefined
    if (!thread || !resolvedSite) return <InvalidThread />
    return <ChatSession key={threadId} thread={thread} site={resolvedSite.site} target={resolvedSite.target} />
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
