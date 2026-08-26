import { Button } from "@/components/ui/button";
import { MessageCircleIcon } from "lucide-react";
import { AgentReplyOption } from "../types";

type AssistantChatOptionsProps = {
    options: AgentReplyOption[];
    send: (option: AgentReplyOption) => void;
};

export const UIChatOptions = ({
    options,
    send,
}: AssistantChatOptionsProps) => {
    if (options.length) {
        const showOptions = options;
        return <div className="space-y-2 space-x-2 mt-2">
            {showOptions.map(option => <Button key={option} variant="outline" onClick={() => send(option)}>
                <MessageCircleIcon />
                <span>{option}</span>
            </Button>)}
        </div>;
    }

    return <></>;
};
