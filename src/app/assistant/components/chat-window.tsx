import { Button } from "@/components/ui/button"
import { Markdown } from "@/components/ui/markdown"
import { ScrollButton } from "@/components/ui/scroll-button"
import { cn } from "@/lib/utils"
import { getToolName, type UIMessage } from "ai"
import { CopyIcon, Volume2Icon } from "lucide-react"
import { toast } from "sonner"
import { StickToBottom } from "use-stick-to-bottom"

const textFromMessage = (message: UIMessage) => message.parts
  .filter((part): part is { type: "text"; text: string } => part.type === "text")
  .map((part) => part.text)
  .join("")

const formatToolValue = (value: unknown) => {
  if (value === undefined) return ""
  if (typeof value === "string") return value
  return JSON.stringify(value, null, 2)
}

const MessagePart = ({ part }: { part: UIMessage["parts"][number] }) => {
  if (part.type === "text") return <Markdown>{part.text}</Markdown>

  if (part.type === "reasoning") {
    return (
      <details className="w-full text-sm text-muted-foreground">
        <summary className="cursor-pointer">Thinking</summary>
        <Markdown fontLevel="small">{part.text}</Markdown>
      </details>
    )
  }

  if (part.type === "file" && part.mediaType.startsWith("image/")) {
    return <img src={part.url} alt={part.filename ?? "Attached"} className="max-h-80 max-w-full rounded-md object-contain" />
  }

  if (part.type === "dynamic-tool" || part.type.startsWith("tool-")) {
    const toolPart = part as {
      type: string
      toolName?: string
      state?: string
      input?: unknown
      output?: unknown
      errorText?: string
    }
    const name = toolPart.toolName ?? getToolName(part as never)
    const value = toolPart.errorText ?? toolPart.output ?? toolPart.input

    return (
      <details className="w-full rounded-md border border-white/10 bg-black/10 p-2 text-xs">
        <summary className="cursor-pointer font-medium">Tool: {name} ({toolPart.state ?? "pending"})</summary>
        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-muted-foreground">
          {formatToolValue(value)}
        </pre>
      </details>
    )
  }

  return null
}

export const AssistantChatWindow = ({
  messages,
  messageDates,
}: {
  messages: UIMessage[]
  messageDates: Map<string, number>
}) => {
  if (messages.length === 0) {
    return <div className="flex h-full items-center justify-center text-2xl text-muted-foreground/70">Hi, how can I help you?</div>
  }

  return (
    <div className="relative h-full w-full">
      <StickToBottom role="log" aria-live="polite" className="h-full overflow-auto px-5" initial="instant">
        <StickToBottom.Content className="mx-auto max-w-3xl pb-6 pt-6">
          <ol className="space-y-6">
            {messages.map((message) => {
              const text = textFromMessage(message)
              const isUser = message.role === "user"
              const date = messageDates.get(message.id)

              return (
                <li key={message.id} className={cn("flex w-full flex-col gap-1", isUser ? "items-end" : "items-start")}>
                  {date && (
                    <time className="px-1 text-[11px] text-muted-foreground/60">
                      {new Date(date).toLocaleString()}
                    </time>
                  )}
                  <div className={cn("flex max-w-[90%] flex-col gap-2 overflow-hidden rounded-lg px-3 py-2 text-base", isUser ? "items-end bg-slate-500/10" : "items-start bg-indigo-500/10")}>
                    {message.parts.map((part, index) => <MessagePart key={`${message.id}-${index}`} part={part} />)}
                  </div>
                  {text && (
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" aria-label="Copy message" onClick={() => { void navigator.clipboard.writeText(text); toast.info("Text copied.") }}>
                        <CopyIcon />
                      </Button>
                      {!isUser && (
                        <Button variant="ghost" size="icon" aria-label="Speak message" onClick={() => { window.speechSynthesis.cancel(); window.speechSynthesis.speak(new SpeechSynthesisUtterance(text)) }}>
                          <Volume2Icon />
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
        </StickToBottom.Content>
        <div className="absolute bottom-4 right-7">
          <ScrollButton className="shadow-sm" />
        </div>
      </StickToBottom>
    </div>
  )
}
