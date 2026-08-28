import { Button } from "@/components/ui/button"
import { Markdown } from "@/components/ui/markdown"
import { ScrollButton } from "@/components/ui/scroll-button"
import { cn } from "@/lib/utils"
import { useVirtualizer } from "@tanstack/react-virtual"
import type { UIMessage } from "ai"
import { useLiveQuery } from "dexie-react-hooks"
import {
  BotIcon,
  CopyIcon,
  SparklesIcon,
  UserIcon,
  Volume2Icon,
} from "lucide-react"
import {
  forwardRef,
  memo,
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

const textFromMessage = (message: UIMessage) =>
  message.parts
    .filter(
      (part): part is { type: "text"; text: string } => part.type === "text"
    )
    .map((part) => part.text)
    .join("")

const MessagePart = ({
  part,
  showReasoning,
}: {
  part: UIMessage["parts"][number]
  showReasoning: boolean
}) => {
  if (part.type === "text") return <Markdown>{part.text}</Markdown>

  if (part.type === "reasoning" && showReasoning) {
    return (
      <details className="w-full text-sm text-slate-400">
        <summary className="cursor-pointer text-amber-300/70">Thinking</summary>
        <Markdown fontLevel="small">{part.text}</Markdown>
      </details>
    )
  }

  if (part.type === "file" && part.mediaType.startsWith("image/")) {
    return (
      <img
        src={part.url}
        alt={part.filename ?? "Attached"}
        className="max-h-80 max-w-full rounded-lg border border-white/10 object-contain"
      />
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

const MessageRow = forwardRef<HTMLLIElement, MessageRowProps>(
  function MessageRow({ threadId, messageId, index, style, runtime }, ref) {
    const record = useLiveQuery(
      () => getChatMessage(threadId, messageId),
      [threadId, messageId]
    )
    const subscribeMessage = useCallback(
      (listener: () => void) => runtime.subscribeMessage(messageId, listener),
      [messageId, runtime]
    )
    const getLiveMessage = useCallback(
      () => runtime.getMessage(messageId),
      [messageId, runtime]
    )
    const liveMessage = useSyncExternalStore(
      subscribeMessage,
      getLiveMessage,
      getLiveMessage
    )

    useEffect(() => {
      if (record && !runtime.isTransientMessage(messageId))
        runtime.releasePersistedMessage(messageId)
    }, [messageId, record, runtime])

    const message = liveMessage ?? record?.message
    if (!message)
      return (
        <li
          ref={ref}
          style={style}
          data-index={index}
          className="absolute top-0 left-0 min-h-24 w-full"
          aria-busy="true"
        />
      )

    const text = textFromMessage(message)
    const showReasoning = text.length === 0
    const isUser = message.role === "user"
    const date = record?.createdAt

    return (
      <li
        ref={ref}
        style={style}
        data-index={index}
        className="absolute top-0 left-0 flex w-full gap-2.5"
      >
        <div
          className={cn(
            "mt-5 flex size-7 shrink-0 items-center justify-center rounded-lg border",
            isUser
              ? "order-2 border-amber-300/20 bg-amber-300/10 text-amber-300"
              : "border-white/10 bg-white/[0.06] text-slate-300"
          )}
        >
          {isUser ? (
            <UserIcon className="size-3.5" />
          ) : (
            <BotIcon className="size-3.5" />
          )}
        </div>

        <div
          className={cn(
            "flex max-w-[calc(100%-2.5rem)] min-w-0 flex-1 flex-col gap-1",
            isUser ? "items-end" : "items-start"
          )}
        >
          <div className="flex items-center gap-2 px-1">
            <span className="text-[10px] font-semibold tracking-[0.16em] text-slate-500 uppercase">
              {isUser ? "You" : "Agent"}
            </span>
            {date ? (
              <time className="text-[10px] text-slate-600">
                {new Date(date).toLocaleString()}
              </time>
            ) : null}
          </div>
          <div
            className={cn(
              "flex max-w-full flex-col gap-2 overflow-hidden rounded-xl border px-3 py-2.5 text-sm leading-6 text-slate-200 shadow-sm",
              isUser
                ? "items-end border-amber-300/15 bg-amber-300/[0.08]"
                : "items-start border-white/10 bg-[#151b1f]"
            )}
          >
            {message.parts.map((part, partIndex) => (
              <MessagePart
                key={`${message.id}-${partIndex}`}
                part={part}
                showReasoning={showReasoning}
              />
            ))}
          </div>
          {text ? (
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon-xs"
                className="cursor-pointer text-slate-500 transition-colors duration-200 hover:bg-white/10 hover:text-slate-200"
                aria-label="Copy message"
                onClick={() => {
                  void navigator.clipboard.writeText(text)
                  toast.info("Text copied.")
                }}
              >
                <CopyIcon />
              </Button>
              {!isUser ? (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="cursor-pointer text-slate-500 transition-colors duration-200 hover:bg-white/10 hover:text-slate-200"
                  aria-label="Speak message"
                  onClick={() => {
                    window.speechSynthesis.cancel()
                    window.speechSynthesis.speak(
                      new SpeechSynthesisUtterance(text)
                    )
                  }}
                >
                  <Volume2Icon />
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </li>
    )
  }
)

export const AssistantChatWindow = memo(function AssistantChatWindow({
  threadId,
  runtime,
}: {
  threadId: string
  runtime: ChatStreamRuntime
}) {
  const persistedMessageIds = useLiveQuery(
    () => listChatMessageIds(threadId),
    [threadId],
    emptyMessageIds
  )
  const transientMessageIds = useSyncExternalStore(
    runtime.subscribeMessageIds,
    runtime.getTransientMessageIds,
    runtime.getTransientMessageIds
  )
  const messageIds = useMemo(
    () => mergeMessageIds(persistedMessageIds, transientMessageIds),
    [persistedMessageIds, transientMessageIds]
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
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-300/10 text-amber-300 shadow-[0_0_32px_rgba(251,191,36,0.08)]">
          <SparklesIcon className="size-5" />
        </div>
        <h2 className="mt-4 text-base font-semibold text-slate-100">
          Ready to explore
        </h2>
        <p className="mt-1 max-w-64 text-sm leading-5 text-slate-500">
          Ask the agent to use the tools available in the workspace.
        </p>
      </div>
    )
  }

  return (
    <div className="relative h-full w-full">
      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        className="h-full [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.14)_transparent] overflow-auto px-4"
      >
        <ol
          className="relative mx-auto max-w-3xl"
          style={{ height: virtualizer.getTotalSize() }}
        >
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
        <div className="absolute right-5 bottom-4">
          <ScrollButton
            className="cursor-pointer border-white/10 bg-[#151b1f] text-slate-300 shadow-lg shadow-black/20 hover:bg-[#20282d] hover:text-white"
            aria-label="Jump to latest"
            isAtBottom={virtualizer.isAtEnd()}
            onScrollToBottom={() =>
              virtualizer.scrollToEnd({ behavior: "smooth" })
            }
          />
        </div>
      </div>
    </div>
  )
})
