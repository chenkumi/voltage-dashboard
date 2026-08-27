import { Button } from "@/components/ui/button"
import { BotIcon, PlusIcon } from "lucide-react"

export const AssistantChatHeader = ({
  title,
  onNewThread,
}: {
  title: string
  onNewThread: () => void
}) => {
  return (
    <header className="flex min-h-18 w-full items-center gap-3 border-b border-white/10 bg-[#151b1f] px-4 py-2">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-amber-300/20 bg-amber-300/10 text-amber-300 shadow-[0_0_24px_rgba(251,191,36,0.08)]">
        <BotIcon className="size-5" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold tracking-[0.22em] text-amber-300/70 uppercase">
          Agent chat
        </p>
        <h1 className="mt-1 truncate text-sm font-semibold text-slate-100">
          {title}
        </h1>
      </div>

      <div className="flex items-center gap-1">
        <Button
          type="button"
          onClick={onNewThread}
          size="icon"
          className="bg-amber-300 text-[#101417] shadow-sm hover:bg-amber-200"
          aria-label="Start new chat"
          title="Start new chat"
        >
          <PlusIcon className="size-4" />
        </Button>
      </div>
    </header>
  )
}
