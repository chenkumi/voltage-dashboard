import type { ThreadSiteTarget } from "@/app/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
    ArrowLeft,
    ArrowRight,
    LayoutDashboard,
    RefreshCw,
    ShoppingBag,
    Sparkles,
} from "lucide-react"
import {
    useCallback,
    useLayoutEffect,
    useState,
    useSyncExternalStore
} from "react"
import type { WebMcpSession } from "./session"
import { webMcpSites } from "./sites"
import type { WebMcpSite } from "./types"

const statusLabel = {
    idle: "Waiting for iframe",
    loading: "Discovering tools",
    ready: "Connected",
    unsupported: "WebMCP unavailable",
    error: "Connection error",
} as const

export const WebMcpWorkspace = ({
    site,
    target,
    session,
    onSiteChange,
    disabled = false,
}: {
    site: WebMcpSite
    target: ThreadSiteTarget
    session: WebMcpSession
    onSiteChange: (site: WebMcpSite) => void
    disabled?: boolean
}) => {
    const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot)
    const [navigationBusy, setNavigationBusy] = useState<"back" | "forward" | null>(null)
    // useEffect(() => {
    //     if (!import.meta.env.DEV) return

    //     const hasNavigateBack = state.tools.some((tool) => tool.name === "navigate_back")
    //     const hasNavigateForward = state.tools.some((tool) => tool.name === "navigate_forward")
    //     console.info("[WebMCP workspace navigation] render state", {
    //         sessionStatus: state.status,
    //         toolNames: state.tools.map((tool) => tool.name),
    //         navigation: state.navigation,
    //         hasNavigationStateTool,
    //         renderBackButton: hasNavigateBack,
    //         renderForwardButton: hasNavigateForward,
    //         navigationControlsDisabled: disabled || navigationBusy !== null,
    //     })
    // }, [
    //     disabled,
    //     hasNavigationStateTool,
    //     navigationBusy,
    //     state.navigation,
    //     state.status,
    //     state.tools,
    // ])

    const hasNavigationTool = useCallback((name: string) => {
        return state.tools.some((tool) => tool.name === name)
    }, [state.tools])

    const handleNavigation = useCallback(async (direction: "back" | "forward") => {
        setNavigationBusy(direction)
        try {
            await session.navigate(direction)
        } finally {
            setNavigationBusy(null)
        }
    }, [session])

    useLayoutEffect(() => {
        void session.attach(null)
    }, [session, target.url])

    const handleFrameLoad = useCallback((event: React.SyntheticEvent<HTMLIFrameElement>) => {
        void session.attach(event.currentTarget.contentWindow)
    }, [session])

    const handleTabKeyDown = useCallback((event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
        if (disabled) return
        const lastIndex = webMcpSites.length - 1
        const nextIndex = event.key === "ArrowRight"
            ? (index + 1) % webMcpSites.length
            : event.key === "ArrowLeft"
                ? (index - 1 + webMcpSites.length) % webMcpSites.length
                : event.key === "Home"
                    ? 0
                    : event.key === "End"
                        ? lastIndex
                        : null

        if (nextIndex === null || nextIndex === index) return
        event.preventDefault()
        const nextSite = webMcpSites[nextIndex]
        onSiteChange(nextSite)
    }, [disabled, onSiteChange])

    return (
        <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-[#101417] text-slate-100">
            <header className="grid min-h-18 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center border-b border-white/10 bg-[#151b1f] px-3 py-2">
                <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-xl bg-amber-400 text-[#101417] shadow-[0_0_24px_rgba(251,191,36,0.18)]">
                        <Sparkles className="size-5" />
                    </div>
                    <div>
                        <p className="text-base font-semibold uppercase tracking-[0.24em] text-amber-300/80">WebMCP workspace</p>
                        {/* <h2 className="mt-1 text-lg font-semibold tracking-tight">Embedded web surface</h2> */}
                    </div>
                </div>

                <div
                    role="tablist"
                    aria-label="Demo pages"
                    className="flex items-center gap-1 justify-self-center rounded-xl border border-white/10 bg-black/20 p-1"
                >
                    {webMcpSites.map((item, index) => {
                        const active = item.id === site.id
                        const Icon = item.id === "shop-c" ? LayoutDashboard : ShoppingBag

                        return (
                            <button
                                key={item.id}
                                type="button"
                                role="tab"
                                aria-selected={active}
                                tabIndex={active ? 0 : -1}
                                disabled={disabled}
                                onClick={() => onSiteChange(item)}
                                onKeyDown={(event) => handleTabKeyDown(event, index)}
                                className={cn(
                                    "inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg px-3 text-xs font-semibold whitespace-nowrap transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 disabled:cursor-wait disabled:opacity-50",
                                    active
                                        ? "bg-amber-300 text-[#101417] shadow-sm"
                                        : "text-slate-300 hover:bg-white/10 hover:text-white"
                                )}
                            >
                                <Icon className="size-3.5" />
                                {item.name}
                            </button>
                        )
                    })}
                </div>

                <div className="flex items-center justify-end gap-2">
                    {hasNavigationTool("navigate_back") ? (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-40"
                            onClick={() => void handleNavigation("back")}
                            disabled={disabled || navigationBusy !== null}
                            aria-label={`上一頁${state.navigation?.page ? `（目前：${state.navigation.page}）` : ""}`}
                            title="上一頁"
                        >
                            <ArrowLeft className="size-4" />
                        </Button>
                    ) : null}
                    {hasNavigationTool("navigate_forward") ? (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-40"
                            onClick={() => void handleNavigation("forward")}
                            disabled={disabled || navigationBusy !== null}
                            aria-label={`下一頁${state.navigation?.page ? `（目前：${state.navigation.page}）` : ""}`}
                            title="下一頁"
                        >
                            <ArrowRight className="size-4" />
                        </Button>
                    ) : null}
                    <Badge variant="outline" className="gap-2 border-white/15 bg-white/5 px-3 py-1.5 text-slate-200">
                        <span className={cn("size-2 rounded-full", state.status === "ready" ? "bg-emerald-400" : "bg-amber-300")} />
                        {statusLabel[state.status]}
                    </Badge>
                    <Button variant="ghost" size="icon" className="text-slate-300 hover:bg-white/10 hover:text-white" onClick={() => void session.refresh()} aria-label="Refresh WebMCP tools">
                        <RefreshCw className="size-4" />
                    </Button>
                </div>
            </header>

            <div className="flex min-h-0 flex-1">
                <div className="flex min-h-0 flex-1 overflow-hidden border-white/10 bg-[#0b0e10] shadow-2xl shadow-black/30">
                    <iframe
                        key={`${target.siteId}:${target.url}`}
                        title={site.name}
                        src={target.url}
                        className="h-full min-h-[420px] w-full border-0 bg-white"
                        onLoad={handleFrameLoad}
                    />
                </div>

                {/* <div className="grid shrink-0 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(240px,0.42fr)]">
          <div className="rounded-2xl border border-white/10 bg-[#151b1f] p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wrench className="size-4 text-amber-300" />
                <h3 className="text-sm font-semibold">Tools from iframe</h3>
              </div>
              <span className="text-xs tabular-nums text-slate-400">{state.tools.length} available</span>
            </div>
            {state.error ? <p className="text-xs text-amber-200/80">{state.error}</p> : null}
            {state.tools.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {state.tools.map((tool) => <Badge key={tool.name} className="border-0 bg-white/10 font-mono text-[11px] text-slate-200">{tool.name}</Badge>)}
              </div>
            ) : (
              <p className="text-xs leading-5 text-slate-400">工具會在 iframe 載入後自動同步到右側 Agent。</p>
            )}
          </div>

          <div className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.06] p-4 text-xs leading-5 text-slate-300">
            <div className="mb-2 flex items-center gap-2 text-emerald-200">
              <ShieldCheck className="size-4" />
              <span className="font-semibold">Scoped tool access</span>
            </div>
            右側 Chat Room 僅會收到這個 iframe 暴露的 tools；目前使用同源 demo，方便驗證 discovery 與 execution flow。
          </div>
        </div> */}
            </div>
        </section>
    )
}
