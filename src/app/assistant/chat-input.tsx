import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { SendIcon, SquareIcon } from "lucide-react"
import { useState, useSyncExternalStore } from "react"
import type { ChatStreamRuntime } from "./chat-stream-runtime"

export const AssistantChatInput = ({
    runtime,
}: {
    runtime: ChatStreamRuntime
}) => {
    const status = useSyncExternalStore(runtime.subscribeStatus, runtime.getStatus, runtime.getStatus)
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
            className="mx-auto flex w-full max-w-3xl flex-col items-end gap-1 rounded-xl border px-1 py-1 transition-shadow focus-within:ring-2 focus-within:ring-ring/10 focus-within:ring-offset-0"
            onSubmit={(event) => {
                event.preventDefault()
                submit()
            }}
        >
            <Textarea
                aria-label="Send Message"
                className="min-h-[2.8lh] max-h-[7lh] resize-none text-base border-0 focus-visible:ring-0"
                disabled={busy}
                placeholder="You say: Shift+Enter for a new line"
                value={text}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault()
                        submit()
                    }
                }}
            />
            <Button
                type={busy ? "button" : "submit"}
                aria-label={busy ? "Cancel AI response" : "Send message"}
                disabled={!busy && !text.trim()}
                onClick={busy ? runtime.cancel : undefined}
            >
                {busy ? <SquareIcon /> : <SendIcon />}
                <span>{busy ? "Cancel" : "Send"}</span>
            </Button>
        </form>
    )
}
