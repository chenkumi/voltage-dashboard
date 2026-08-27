import { useTheme } from "@/app/theme-context"
import { Toaster } from "@/components/ui/sonner"
import { Spinner } from "@/components/ui/spinner"
import { type UIMessage, useChat } from "@ai-sdk/react"
import { useLiveQuery } from "dexie-react-hooks"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router"
import { monotonicFactory } from "ulid"
import type { ChatThread, ThreadSiteTarget } from "../types"
import { WebMcpSession } from "../webmcp/session"
import { createThreadSiteTarget, defaultWebMcpSite, resolveThreadSite } from "../webmcp/sites"
import { WebMcpChatTransport } from "../webmcp/transport"
import type { WebMcpSite } from "../webmcp/types"
import { WebMcpWorkspace } from "../webmcp/workspace"
import { AssistantChatHeader } from "./chat-header"
import { AssistantChatInput } from "./chat-input"
import { createChatThread, getChatThread, getLastChatThread, listChatMessageIds, listChatMessages, saveCompletedAssistantMessage, saveUserMessage, touchSiteLastThread } from "./chat-store"
import { isPersistableAssistantCompletion, withoutDiscardedAssistantMessages, type AssistantCompletionStatus } from "./chat-message-state"
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

const ChatSession = ({ thread, site, target, messageIds }: {
    thread: ChatThread
    site: WebMcpSite
    target: ThreadSiteTarget
    messageIds: Awaited<ReturnType<typeof listChatMessageIds>>
}) => {
    const navigate = useNavigate()
    const { theme } = useTheme()
    const session = useMemo(() => new WebMcpSession(), [])
    const transport = useMemo(() => new WebMcpChatTransport(session, async () => {
        const records = await listChatMessages(thread.id)
        return records.map((record) => record.message)
    }), [session, thread.id])
    const generateId = useMemo(() => monotonicFactory(), [])
    const [discardedAssistantIds, setDiscardedAssistantIds] = useState<Set<string>>(new Set())
    const persistedAssistantIds = useRef(new Set<string>())
    const messagesRef = useRef<UIMessage[]>([])
    const setMessagesRef = useRef<((messages: UIMessage[] | ((messages: UIMessage[]) => UIMessage[])) => void) | undefined>(undefined)
    const discardIncompleteAssistants = useCallback(() => {
        const incompleteIds = messagesRef.current
            .filter((message) => message.role === "assistant" && !persistedAssistantIds.current.has(message.id))
            .map((message) => message.id)
        if (incompleteIds.length > 0) {
            for (const id of incompleteIds) persistedAssistantIds.current.delete(id)
            setDiscardedAssistantIds((current) => new Set([...current, ...incompleteIds]))
        }
        setMessagesRef.current?.((current) => withoutDiscardedAssistantMessages(current, new Set(incompleteIds)))
    }, [])
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
        const completion: AssistantCompletionStatus = isAbort
            ? "aborted"
            : isDisconnect
                ? "disconnected"
                : isError
                    ? "error"
                    : "complete"
        if (isPersistableAssistantCompletion(completion)) {
            persistedAssistantIds.current.add(message.id)
            void saveCompletedAssistantMessage(thread.id, message, completion)
        } else {
            setDiscardedAssistantIds((current) => new Set([...current, message.id]))
            setMessagesRef.current?.((current) => current.filter((item) => item.id !== message.id))
        }
    }, [thread.id])
    const { messages, sendMessage, setMessages, status, stop } = useChat<UIMessage>({
        id: thread.id,
        generateId,
        transport,
        onFinish: handleFinish,
        onError: discardIncompleteAssistants,
    })
    useEffect(() => {
        setMessagesRef.current = setMessages
        return () => { setMessagesRef.current = undefined }
    }, [setMessages])
    useEffect(() => { messagesRef.current = messages }, [messages])
    const busy = status === "submitted" || status === "streaming"

    useEffect(() => () => session.dispose(), [session])

    const createNewThread = useCallback(async () => {
        void stop()
        discardIncompleteAssistants()
        session.dispose()
        const nextThread = createEmptyThread(site)
        await createChatThread(nextThread)
        await navigate(`/chat/${nextThread.id}`)
    }, [discardIncompleteAssistants, navigate, session, site, stop])

    const switchSite = useCallback(async (nextSite: WebMcpSite) => {
        if (nextSite.id === site.id) return
        void stop()
        discardIncompleteAssistants()
        session.dispose()
        const nextThread = await createOrOpenSiteThread(nextSite)
        await navigate(`/chat/${nextThread.id}`)
    }, [discardIncompleteAssistants, navigate, session, site.id, stop])

    const cancel = useCallback(() => {
        void stop()
        discardIncompleteAssistants()
    }, [discardIncompleteAssistants, stop])

    const send = useCallback((text: string) => {
        const userMessage: UIMessage = {
            id: generateId(),
            role: "user",
            parts: [{ type: "text", text }],
        }
        void (async () => {
            await saveUserMessage(thread.id, userMessage)
            await sendMessage(userMessage)
        })()
    }, [generateId, sendMessage, thread.id])

    useEffect(() => () => { void stop() }, [stop])

    return (
        <div className="flex h-full w-full min-w-0 overflow-hidden bg-[#101417]">
            <WebMcpWorkspace site={site} target={target} session={session} onSiteChange={switchSite} disabled={busy} />
            <section className="flex h-full min-w-[320px] basis-[30%] flex-col overflow-hidden border-l border-white/10 bg-background">
                <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-3">
                    <AssistantChatHeader title={thread.customTitle ?? thread.title} onNewThread={createNewThread} />
                    <section className="min-h-0 flex-1 overflow-hidden" aria-label="Chat history">
                        <AssistantChatWindow threadId={thread.id} messageIds={messageIds} messages={messages} discardedAssistantIds={discardedAssistantIds} />
                    </section>
                        <AssistantChatInput status={status} onSend={send} onStop={cancel} />
                </div>
            </section>
            <Toaster theme={theme} />
        </div>
    )
}

const ChatPage = ({ threadId }: { threadId: string }) => {
    const data = useLiveQuery(async () => ({
        thread: await getChatThread(threadId),
        messageIds: await listChatMessageIds(threadId),
    }), [threadId])

    if (!data) return <Loading />
    const resolvedSite = data.thread ? resolveThreadSite(data.thread) : undefined
    if (!data.thread || !resolvedSite) return <InvalidThread />
    return <ChatSession key={threadId} thread={data.thread} site={resolvedSite.site} target={resolvedSite.target} messageIds={data.messageIds} />
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
