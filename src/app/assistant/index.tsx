import { useTheme } from "@/app/theme-context"
import { Toaster } from "@/components/ui/sonner"
import { Spinner } from "@/components/ui/spinner"
import { useLiveQuery } from "dexie-react-hooks"
import {
  useCallback,
  useEffect,
  memo,
  useMemo,
  useSyncExternalStore,
  useRef,
  useState,
} from "react"
import { monotonicFactory } from "ulid"
import type { ChatThread, ThreadSiteTarget } from "../types"
import { WebMcpSession } from "../webmcp/session"
import {
  createThreadSiteTarget,
  defaultWebMcpSite,
  resolveThreadSite,
  webMcpSites,
} from "../webmcp/sites"
import type { WebMcpSite } from "../webmcp/types"
import { WebMcpWorkspace } from "../webmcp/workspace"
import { AssistantChatHeader } from "./chat-header"
import { AssistantChatInput } from "./chat-input"
import { ChatStreamController } from "./chat-stream-controller"
import {
  createAndActivateThread,
  clearStaleSiteLastThread,
  getSiteThread,
} from "./chat-store"
import { ChatStreamRuntime } from "./chat-stream-runtime"
import { AssistantChatWindow } from "./chat-window"
import { getSiteProfileByUrl, getSiteProfiles } from "./site-profile-store"

const createId = monotonicFactory()

const Loading = () => (
  <div className="flex h-full items-center justify-center">
    <Spinner className="size-10" />
  </div>
)

const createEmptyThread = (site: WebMcpSite): ChatThread => {
  const timestamp = Date.now()
  return {
    id: createId(),
    ...createThreadSiteTarget(site),
    title: "New Chat",
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

const createOrOpenSiteThread = async (site: WebMcpSite) => {
  const siteThread = await getSiteThread(site.id)
  if (siteThread.thread) return siteThread.thread
  if (siteThread.lastThread) {
    await clearStaleSiteLastThread(site.id, siteThread.lastThread)
  }

  const thread = createEmptyThread(site)
  return createAndActivateThread(thread)
}

const ChatWorkspace = memo(function ChatWorkspace({
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
}) {
  const status = useSyncExternalStore(
    runtime.subscribeStatus,
    runtime.getStatus,
    runtime.getStatus
  )
  const disabled = status === "submitted" || status === "streaming"

  return (
    <WebMcpWorkspace
      site={site}
      target={target}
      session={session}
      onSiteChange={onSiteChange}
      disabled={disabled}
    />
  )
})

const ChatSession = memo(
  function ChatSession({
    thread,
    site,
    target,
    onSiteChange,
  }: {
    thread: ChatThread
    site: WebMcpSite
    target: ThreadSiteTarget
    onSiteChange: (site: WebMcpSite) => void
  }) {
    const { theme } = useTheme()
    const session = useMemo(() => new WebMcpSession(), [])
    const runtime = useMemo(() => new ChatStreamRuntime(), [])
    const generateId = useMemo(() => monotonicFactory(), [])

    useEffect(() => () => session.dispose(), [session])

    const createNewThread = useCallback(async () => {
      runtime.cancel()
      const nextThread = createEmptyThread(site)
      await createAndActivateThread(nextThread)
    }, [runtime, site])

    const switchSite = useCallback(
      async (nextSite: WebMcpSite) => {
        if (nextSite.id === site.id) return
        runtime.cancel()
        session.dispose()
        await createOrOpenSiteThread(nextSite)
        onSiteChange(nextSite)
      },
      [onSiteChange, runtime, session, site.id]
    )

    return (
      <div className="flex h-full w-full min-w-0 overflow-hidden bg-[#101417]">
        <ChatStreamController
          key={thread.id}
          threadId={thread.id}
          session={session}
          runtime={runtime}
          generateId={generateId}
        />
        <ChatWorkspace
          site={site}
          target={target}
          session={session}
          runtime={runtime}
          onSiteChange={switchSite}
        />
        <section className="flex h-full min-w-[320px] basis-[30%] flex-col overflow-hidden border-l border-white/10 bg-[#101417] text-slate-100">
          <AssistantChatHeader
            title={thread.customTitle ?? thread.title}
            onNewThread={createNewThread}
          />
          <div className="flex min-h-0 flex-1 flex-col bg-[radial-gradient(circle_at_50%_0%,rgba(251,191,36,0.04),transparent_38%)] px-4 pt-3 pb-4">
            <section
              className="min-h-0 flex-1 overflow-hidden"
              aria-label="Chat history"
            >
              <AssistantChatWindow threadId={thread.id} runtime={runtime} />
            </section>
            <div className="pt-3">
              <AssistantChatInput runtime={runtime} />
            </div>
          </div>
        </section>
        <Toaster theme={theme} />
      </div>
    )
  },
  (previous, next) =>
    previous.thread.id === next.thread.id &&
    (previous.thread.customTitle ?? previous.thread.title) ===
      (next.thread.customTitle ?? next.thread.title) &&
    previous.site.id === next.site.id &&
    previous.site.url === next.site.url &&
    previous.target.siteId === next.target.siteId &&
    previous.target.url === next.target.url
)

export const Assistant = () => {
  const [activeSiteUrl, setActiveSiteUrl] = useState(defaultWebMcpSite.url)
  const profiles = useLiveQuery(() => getSiteProfiles(), [])
  const profile = useLiveQuery(
    () => getSiteProfileByUrl(activeSiteUrl),
    [activeSiteUrl]
  )
  const siteThread = useLiveQuery(
    () => (profile ? getSiteThread(profile.siteId) : undefined),
    [profile?.siteId]
  )
  const creationKeyRef = useRef<string | null>(null)

  const site = useMemo(
    () =>
      profile
        ? webMcpSites.find((candidate) => candidate.id === profile.siteId)
        : undefined,
    [profile]
  )

  useEffect(() => {
    if (!profile || !site || !siteThread) return

    const creationKey = `${profile.siteId}:${siteThread.lastThread?.threadId ?? "new"}`
    if (creationKeyRef.current === creationKey) return
    creationKeyRef.current = creationKey

    if (siteThread.thread) return

    if (siteThread.lastThread) {
      void clearStaleSiteLastThread(profile.siteId, siteThread.lastThread)
    }
    void createOrOpenSiteThread(site)
  }, [profile, site, siteThread])

  const handleSiteChange = useCallback((nextSite: WebMcpSite) => {
    setActiveSiteUrl(nextSite.url)
  }, [])

  if (!profiles || !profile || !site || !siteThread?.thread) return <Loading />

  const thread = siteThread.thread
  const resolvedSite = resolveThreadSite({ siteId: thread.siteId, url: thread.url })
  if (!resolvedSite) return <Loading />

  return (
    <ChatSession
      key={thread.id}
      thread={thread}
      site={resolvedSite.site}
      target={resolvedSite.target}
      onSiteChange={handleSiteChange}
    />
  )
}
