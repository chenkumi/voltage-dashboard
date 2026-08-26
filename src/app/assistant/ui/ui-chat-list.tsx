import { ScrollButton } from "@/components/ui/scroll-button";
import { cn } from "@/lib/utils";
import { useMemo } from "react";
import { StickToBottom } from "use-stick-to-bottom";
import { ModelThread, ModelThreadMessagePart } from "../../types";
import { UIChatMessageActions, UIChatMessageCell } from "./ui-chat-message-cell";

export const UIChatList = ({
    thread, 
    messages, 
    clipMessageId,
    actions,
    className, 
    children, 
    ...props
}: {
    thread: ModelThread|undefined,
    messages: ModelThreadMessagePart[],
    clipMessageId?: string,
    actions: UIChatMessageActions,
} & React.ComponentProps<"div">) => {

    

    

    const visibleMessages = useMemo(() => {
        if (!clipMessageId) {
            return messages;
        }

        return messages.filter(message => message.id < clipMessageId);
    }, [messages, clipMessageId]);

    const lastIndex = visibleMessages.length - 1;
    

    return (<div className={cn("flex flex-col px-5 relative", className)} {...props}>
        <StickToBottom
            role="log"
            aria-live="polite"
            resize="smooth"
            initial="instant"
            className="flex-1 w-full overflow-auto no-scrollbar relative">
            <StickToBottom.Content scrollClassName="no-scrollbar">
                <ol className="pt-6">
                    {visibleMessages.map((msg, index) => (
                        <UIChatMessageCell key={`msg-${msg.id}-${msg.number}`} message={msg} actions={actions} index={index} isLast={index === lastIndex} />
                    ))}
                </ol>
                {children}
            </StickToBottom.Content>
            <div className="absolute right-7 bottom-4">
                <ScrollButton className="shadow-sm" />
            </div>
        </StickToBottom>
    </div>);
};
