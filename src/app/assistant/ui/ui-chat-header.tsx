
import { ModelThread } from "@/app/types";
import { Button } from "@/components/ui/button";
import { BotIcon, PlusCircleIcon } from "lucide-react";
import { useMemo } from "react";

export const UIChatHeader = ({
    thread,
    onNewThread,
}: {
    thread: ModelThread | null | undefined,
    onNewThread: () => void,
}) => {
    const botMessage = useMemo(() => {
        if (thread) {
            return thread.title;
        }
        else if (thread === null) {
            return "Chat with you";
        }

        return "New Chat";
    }, [thread]);

    return <nav className="max-w-3xl mx-auto overflow-hidden flex items-center justify-between p-1 rounded-xl border gap-2">
        <div className="flex rounded-full border p-1 gap-2 items-center justify-center">
            <BotIcon className="size-6" />
        </div>

        <div className="flex-1 items-center overflow-hidden">
            <div className="w-full whitespace-nowrap text-ellipsis overflow-hidden">
                {botMessage}
            </div>
        </div>

        <div className="flex gap-2 items-center">
            <Button className="" onClick={onNewThread}>
                <PlusCircleIcon />
                <span>New Thread</span>
            </Button>
        </div>
    </nav>;
};
