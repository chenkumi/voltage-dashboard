import { useMemo } from "react";
import { useAssistantThread } from "../datasource";
import { UIChatHeader } from "../ui/ui-chat-header";
import { useAssistantController } from "../controller/AssistantControllerProvider";

export const AssistantChatHeader = () => {
    const thread = useAssistantThread();
    const controller = useAssistantController();

    const title = useMemo(() => {
        if (thread === undefined) return "New Chat";
        if (thread === null) return "Chat Window";
        return `Chat - ${thread.title}`;
    }, [thread]);

    return <header>
        <h1 className="sr-only">{title}</h1>
        <nav className="w-full">
            <UIChatHeader thread={thread} onNewThread={controller.createNewThread} />
        </nav>
    </header>;
};
