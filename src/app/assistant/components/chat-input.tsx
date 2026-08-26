import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { SendIcon, SquareIcon } from "lucide-react"
import { useState } from "react"
import type { ChatStatus } from "ai"

export const AssistantChatInput = ({
  status,
  onSend,
  onStop,
}: {
  status: ChatStatus
  onSend: (text: string) => void
  onStop: () => void
}) => {
  const [text, setText] = useState("")
  const busy = status === "submitted" || status === "streaming"

  const submit = () => {
    const value = text.trim()
    if (!value || busy) return
    setText("")
    onSend(value)
  }

  return (
    <form
      className="mx-auto flex w-full max-w-3xl items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <Textarea
        aria-label="Send Message"
        className="min-h-[2.8lh] max-h-[7lh] resize-none text-base"
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
        onClick={busy ? onStop : undefined}
      >
        {busy ? <SquareIcon /> : <SendIcon />}
        <span>{busy ? "Cancel" : "Send"}</span>
      </Button>
    </form>
  )
}
