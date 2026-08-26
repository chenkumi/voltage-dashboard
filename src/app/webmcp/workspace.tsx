import { RefreshCw, ShieldCheck, Sparkles, Wrench } from "lucide-react"
import { useCallback, useEffect, useSyncExternalStore } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { webMcpBridge } from "./bridge"
import { getWebMcpSite, webMcpSites } from "./sites"
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
  onSiteChange,
  disabled = false,
}: {
  site: WebMcpSite
  onSiteChange: (site: WebMcpSite) => void
  disabled?: boolean
}) => {
  const state = useSyncExternalStore(webMcpBridge.subscribe, webMcpBridge.getSnapshot, webMcpBridge.getSnapshot)

  useEffect(() => {
    void webMcpBridge.attach(null)
  }, [site.id])

  const handleFrameLoad = useCallback((event: React.SyntheticEvent<HTMLIFrameElement>) => {
    void webMcpBridge.attach(event.currentTarget.contentWindow)
  }, [])

  return (
    <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-[#101417] text-slate-100">
      <header className="flex min-h-18 items-center justify-between border-b border-white/10 bg-[#151b1f] px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-amber-400 text-[#101417] shadow-[0_0_24px_rgba(251,191,36,0.18)]">
            <Sparkles className="size-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-300/80">WebMCP workspace</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight">Embedded web surface</h2>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="webmcp-site">Embedded website</label>
          <select
            id="webmcp-site"
            value={site.id}
            disabled={disabled}
            onChange={(event) => {
              const nextSite = getWebMcpSite(event.target.value)
              if (nextSite) onSiteChange(nextSite)
            }}
            className="max-w-40 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-slate-200 outline-none focus-visible:border-amber-300 disabled:cursor-wait disabled:opacity-60"
          >
            {webMcpSites.map((item) => <option key={item.id} value={item.id} className="bg-[#151b1f]">{item.name}</option>)}
          </select>
          <Badge variant="outline" className="gap-2 border-white/15 bg-white/5 px-3 py-1.5 text-slate-200">
            <span className={cn("size-2 rounded-full", state.status === "ready" ? "bg-emerald-400" : "bg-amber-300")} />
            {statusLabel[state.status]}
          </Badge>
          <Button variant="ghost" size="icon" className="text-slate-300 hover:bg-white/10 hover:text-white" onClick={() => void webMcpBridge.refresh()} aria-label="Refresh WebMCP tools">
            <RefreshCw className="size-4" />
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 lg:p-6">
        <div className="flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/10 bg-[#0b0e10] shadow-2xl shadow-black/30">
          <iframe
            key={site.id}
            title="WebMCP demo website"
            src={site.url}
            className="h-full min-h-[420px] w-full border-0 bg-white"
            onLoad={handleFrameLoad}
          />
        </div>

        <div className="grid shrink-0 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(240px,0.42fr)]">
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
        </div>
      </div>
    </section>
  )
}
