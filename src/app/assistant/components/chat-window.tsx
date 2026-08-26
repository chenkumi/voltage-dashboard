import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";
import { ModelThreadMessagePart } from "../../types";
import { useAssistantThread, useAssistantThreadMessages, useAssistantViewState } from "../datasource";
import { UIChatEmpty } from "../ui/ui-chat-empty";
import { UIChatList } from "../ui/ui-chat-list";
import { AssistantSpeech } from "./chat-speech";
import { ScreenReaderAnnouncement } from "./screen-reader-announcement";
import { convertToParts } from "../utils/converter";
import { useAssistantController } from "../controller/AssistantControllerProvider";

export const AssistantChatWindow = () => {
    const thread = useAssistantThread();
    const messages = useAssistantThreadMessages();
    const viewState = useAssistantViewState();
    const controller = useAssistantController();
    const isSpeaking = viewState?.state.isSpeaking ?? false;

    const [visibleIndices, setVisibleIndices] = useState<number[]>([]);

     useEffect(() => {

        const tid = setTimeout(() => {
            setVisibleIndices([]);
        }, 3000);
        return () => {
            clearTimeout(tid);
        };
    }, []);

    useEffect(()=>{
        window.speechSynthesis.cancel();
    },[thread]);


    const messageAnnouncementText = useMemo(() => {
        if (messages) {
            return visibleIndices.length > 0
                ? `Messages range: ${visibleIndices[0] + 1} to ${visibleIndices[visibleIndices.length - 1] + 1} `
                : "";
        }
        else if (messages === null) {
            return `No messages in chat`;
        }
        else {
            return ``;
        }
    }, [messages, visibleIndices]);

    const threadAnnouncementText = useMemo(() => {
        if (thread) {
            return `Thread - ${thread.title}`;
        }

        return "";
    }, [thread]);

    const messageActions = useMemo(() => ({
        onEditMessage: controller.requestEditMessage,
        onSpeakMessage: controller.speak,
        onBranchMessage: controller.branchFromMessage,
        onSendOption: controller.sendOption,
    }), [controller.branchFromMessage, controller.requestEditMessage, controller.sendOption, controller.speak]);

    if (thread && messages) {
        const parts: ModelThreadMessagePart[] = convertToParts(messages);
        const editingFromMessageId = controller.editingMessage?.threadId === thread.id
            ? controller.editingMessage.messageId
            : undefined;

        if (parts.length === 0) {
            return <UIChatEmpty />;
        }

        return <>
            <ScreenReaderAnnouncement threadStatus={threadAnnouncementText} messageStatus={messageAnnouncementText} />
            <UIChatList
                thread={thread}
                messages={parts}
                clipMessageId={editingFromMessageId}
                actions={messageActions}
                className="max-w-3xl mx-auto h-full"
            >
                <div className={cn("w-full" , isSpeaking?"h-36":"h-0")}/>
            </UIChatList>
            <AssistantSpeech />
        </>;

    }
    else if (thread === null || messages === undefined) {
        return <div aria-busy="true" className="h-full flex flex-col items-center justify-center text-2xl text-muted-foreground/70 gap-3 max-w-3xl mx-auto">
            <Spinner className="size-14" />
            <span className="ms-3">Loading...</span>
        </div>;
    }
    
    return <UIChatEmpty />;
};
