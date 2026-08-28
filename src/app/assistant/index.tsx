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
import type { ChatThread, SiteProfile, ThreadSiteTarget } from "../types"
import { WebMcpSession } from "../webmcp/session"
import {
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
import {
  createThreadTargetFromProfile,
  getSiteProfileById,
  getSiteProfileByUrl,
  getSiteProfiles,
} from "./site-profile-store"

const createId = monotonicFactory()

const Loading = () => (
  <div className="flex h-full items-center justify-center">
    <Spinner className="size-10" />
  </div>
)

const createEmptyThread = (profile: SiteProfile): ChatThread => {
  const timestamp = Date.now()
  return {
    id: createId(),
    ...createThreadTargetFromProfile(profile),
    title: "New Chat",
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

const createOrOpenSiteThread = async (profile: SiteProfile) => {
  const siteThread = await getSiteThread(profile.siteId)
  if (siteThread.thread) return siteThread.thread
  if (siteThread.lastThread) {
    await clearStaleSiteLastThread(profile.siteId, siteThread.lastThread)
  }

  const thread = createEmptyThread(profile)
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
    profile,
    onSiteChange,
  }: {
    thread: ChatThread
    site: WebMcpSite
    target: ThreadSiteTarget
    profile: SiteProfile
    onSiteChange: (site: WebMcpSite) => Promise<void>
  }) {
    const { theme } = useTheme()
    const session = useMemo(() => new WebMcpSession(), [])
    const runtime = useMemo(() => new ChatStreamRuntime(), [])
    const generateId = useMemo(() => monotonicFactory(), [])

    useEffect(() => () => session.dispose(), [session])

    const createNewThread = useCallback(async () => {
      runtime.cancel()
      const nextThread = createEmptyThread(profile)
      await createAndActivateThread(nextThread)
    }, [profile, runtime])

    const switchSite = useCallback(
      async (nextSite: WebMcpSite) => {
        if (nextSite.id === site.id) return
        runtime.cancel()
        session.dispose()
        await onSiteChange(nextSite)
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
    previous.target.url === next.target.url &&
    previous.profile.siteId === next.profile.siteId &&
    previous.profile.url === next.profile.url
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
  const creatingSiteIdsRef = useRef(new Set<string>())
  const siteSwitchRequestRef = useRef(0)
  const siteSwitchChainRef = useRef(Promise.resolve())

  const site = useMemo(
    () =>
      profile
        ? webMcpSites.find((candidate) => candidate.id === profile.siteId)
        : undefined,
    [profile]
  )

  useEffect(() => {
    if (!profile || !site || !siteThread) return

    if (siteThread.thread) return
    if (creatingSiteIdsRef.current.has(profile.siteId)) return

    creatingSiteIdsRef.current.add(profile.siteId)
    void createOrOpenSiteThread(profile).finally(() => {
      creatingSiteIdsRef.current.delete(profile.siteId)
    })
  }, [profile, site, siteThread])

  const handleSiteChange = useCallback((nextSite: WebMcpSite) => {
    const requestId = ++siteSwitchRequestRef.current
    const switchTask = async () => {
      const nextProfile = await getSiteProfileById(nextSite.id)
      if (!nextProfile || requestId !== siteSwitchRequestRef.current) return

      await createOrOpenSiteThread(nextProfile)
      if (requestId !== siteSwitchRequestRef.current) return
      setActiveSiteUrl(nextProfile.url)
    }

    const nextTask = siteSwitchChainRef.current.then(switchTask, switchTask)
    siteSwitchChainRef.current = nextTask
    return nextTask
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
      profile={profile}
      onSiteChange={handleSiteChange}
    />
  )
}
