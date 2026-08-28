import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { CornerDownLeftIcon, SendIcon, SquareIcon } from "lucide-react"
import { memo, useState, useSyncExternalStore } from "react"
import type { ChatStreamRuntime } from "./chat-stream-runtime"

export const AssistantChatInput = memo(function AssistantChatInput({
  runtime,
}: {
  runtime: ChatStreamRuntime
}) {
  const status = useSyncExternalStore(
    runtime.subscribeStatus,
    runtime.getStatus,
    runtime.getStatus
  )
  const [text, setText] = useState("")
  const busy = status === "submitted" || status === "streaming"

  const submit = () => {
    const value = text.trim()
    if (!value || busy) return
    setText("")
    runtime.send(value)
  }

  return (
    <form
      className="mx-auto flex w-full max-w-3xl flex-col gap-2 rounded-2xl border border-white/10 bg-[#0b0e10] p-2 shadow-[0_16px_48px_rgba(0,0,0,0.28)] transition-colors duration-200 focus-within:border-amber-300/40"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <Textarea
        aria-label="Send Message"
        className="max-h-[7lh] min-h-[3lh] resize-none border-0 bg-transparent px-2 py-2 text-sm leading-6 text-slate-100 placeholder:text-slate-500 focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent"
        disabled={busy}
        placeholder="Ask the agent to work with this page…"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault()
            submit()
          }
        }}
      />

      <div className="flex items-center justify-between gap-3 px-1 pb-1">
        <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <CornerDownLeftIcon className="size-3" />
          Enter to send
        </span>
        <Button
          type={busy ? "button" : "submit"}
          aria-label={busy ? "Cancel AI response" : "Send message"}
          disabled={!busy && !text.trim()}
          onClick={busy ? runtime.cancel : undefined}
          className="min-w-20 bg-amber-300 text-[#101417] shadow-sm hover:bg-amber-200 disabled:bg-white/10 disabled:text-slate-500"
        >
          {busy ? <SquareIcon /> : <SendIcon />}
          <span>{busy ? "Cancel" : "Send"}</span>
        </Button>
      </div>
    </form>
  )
})
