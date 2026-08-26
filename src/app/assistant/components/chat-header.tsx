import { Button } from "@/components/ui/button"
import { BotIcon, PlusCircleIcon } from "lucide-react"

export const AssistantChatHeader = ({ title, onNewThread }: { title: string; onNewThread: () => void }) => {
  return (
    <header className="mx-auto flex w-full max-w-3xl items-center justify-between gap-2 rounded-xl border p-1">
      <div className="flex items-center justify-center rounded-full border p-1">
        <BotIcon className="size-6" />
      </div>
      <h1 className="min-w-0 flex-1 truncate px-2 text-sm font-medium">{title}</h1>
      <Button type="button" onClick={onNewThread}>
        <PlusCircleIcon />
        <span>New Thread</span>
      </Button>
    </header>
  )
}
