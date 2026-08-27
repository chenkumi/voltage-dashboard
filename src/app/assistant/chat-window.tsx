import { Button } from "@/components/ui/button"
import { Markdown } from "@/components/ui/markdown"
import { ScrollButton } from "@/components/ui/scroll-button"
import { cn } from "@/lib/utils"
import { useVirtualizer } from "@tanstack/react-virtual"
import { getToolName, type UIMessage } from "ai"
import { useLiveQuery } from "dexie-react-hooks"
import { CopyIcon, Volume2Icon } from "lucide-react"
import {
  forwardRef,
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react"
import { toast } from "sonner"
import { mergeMessageIds } from "./chat-message-state"
import { getChatMessage, listChatMessageIds } from "./chat-store"
import type { ChatStreamRuntime } from "./chat-stream-runtime"

const emptyMessageIds: string[] = []

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

type MessageRowProps = {
  threadId: string
  messageId: string
  index: number
  style: CSSProperties
  runtime: ChatStreamRuntime
}

const MessageRow = forwardRef<HTMLLIElement, MessageRowProps>(function MessageRow({
  threadId,
  messageId,
  index,
  style,
  runtime,
}, ref) {
  const record = useLiveQuery(() => getChatMessage(threadId, messageId), [threadId, messageId])
  const subscribeMessage = useCallback((listener: () => void) => runtime.subscribeMessage(messageId, listener), [messageId, runtime])
  const getLiveMessage = useCallback(() => runtime.getMessage(messageId), [messageId, runtime])
  const liveMessage = useSyncExternalStore(subscribeMessage, getLiveMessage, getLiveMessage)

  useEffect(() => {
    if (record && !runtime.isTransientMessage(messageId)) runtime.releasePersistedMessage(messageId)
  }, [messageId, record, runtime])

  const message = liveMessage ?? record?.message
  if (!message) return <li ref={ref} style={style} data-index={index} className="absolute left-0 top-0 min-h-24 w-full" aria-busy="true" />

  const text = textFromMessage(message)
  const isUser = message.role === "user"
  const date = record?.createdAt

  return (
    <li ref={ref} style={style} data-index={index} className={cn("absolute left-0 top-0 flex w-full flex-col gap-1", isUser ? "items-end" : "items-start")}>
      {date && (
        <time className="px-1 text-[11px] text-muted-foreground/60">
          {new Date(date).toLocaleString()}
        </time>
      )}
      <div className={cn("flex max-w-[90%] flex-col gap-2 overflow-hidden rounded-lg px-3 py-2 text-base", isUser ? "items-end bg-slate-500/10" : "items-start bg-indigo-500/10")}>
        {message.parts.map((part, partIndex) => <MessagePart key={`${message.id}-${partIndex}`} part={part} />)}
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
})

export const AssistantChatWindow = ({
  threadId,
  runtime,
}: {
  threadId: string
  runtime: ChatStreamRuntime
}) => {
  const persistedMessageIds = useLiveQuery(
    () => listChatMessageIds(threadId),
    [threadId],
    emptyMessageIds,
  )
  const transientMessageIds = useSyncExternalStore(
    runtime.subscribeMessageIds,
    runtime.getTransientMessageIds,
    runtime.getTransientMessageIds,
  )
  const messageIds = useMemo(
    () => mergeMessageIds(persistedMessageIds, transientMessageIds),
    [persistedMessageIds, transientMessageIds],
  )
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLLIElement>({
    count: messageIds.length,
    getScrollElement: () => scrollRef.current,
    initialOffset: () => Number.MAX_SAFE_INTEGER,
    useFlushSync: false,
    estimateSize: () => 120,
    getItemKey: (index) => messageIds[index] ?? index,
    overscan: 6,
    paddingStart: 24,
    paddingEnd: 24,
    gap: 24,
    anchorTo: "end",
    followOnAppend: "auto",
    scrollEndThreshold: 120,
  })

  useEffect(() => {
    runtime.reconcilePersistedMessageIds(persistedMessageIds)
  }, [persistedMessageIds, runtime])

  if (messageIds.length === 0) {
    return <div className="flex h-full items-center justify-center text-2xl text-muted-foreground/70">Hi, how can I help you?</div>
  }

  return (
    <div className="relative h-full w-full">
      <div ref={scrollRef} role="log" aria-live="polite" className="h-full overflow-auto px-5">
        <ol className="relative mx-auto max-w-3xl" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const messageId = messageIds[virtualRow.index]
            if (!messageId) return null

            return (
              <MessageRow
                key={virtualRow.key}
                ref={virtualizer.measureElement}
                threadId={threadId}
                messageId={messageId}
                index={virtualRow.index}
                style={{ transform: `translateY(${virtualRow.start}px)` }}
                runtime={runtime}
              />
            )
          })}
        </ol>
        <div className="absolute bottom-4 right-7">
          <ScrollButton
            className="shadow-sm"
            aria-label="Jump to latest"
            isAtBottom={virtualizer.isAtEnd()}
            onScrollToBottom={() => virtualizer.scrollToEnd({ behavior: "smooth" })}
          />
        </div>
      </div>
    </div>
  )
}
