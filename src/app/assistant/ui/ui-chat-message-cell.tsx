import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/ui/markdown";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { CopyIcon, GitBranchIcon, PencilLineIcon, Volume2Icon } from "lucide-react";
import { Activity } from "react";
import { toast } from "sonner";
import { readText } from "../../agent/utils";
import { ModelContent, ModelThreadMessagePart } from "../../types";
import { AgentReplyOption } from "../types";
import { UIChatOptions } from "./ui-chat-options";
import { useStreamingMessageContent } from "../hooks/use-streaming-message-content";

export type UIChatMessageActions = {
    onEditMessage: (request: {
        threadId: string;
        messageId: string;
        msgId: string;
        text: string;
        image?: string | null;
    }) => void;
    onSpeakMessage: (text: string) => void;
    onBranchMessage: (messageId: string) => void;
    onSendOption: (option: AgentReplyOption) => void;
};

const contentText = (content: ModelContent) => {
    return readText(content);
};

const UserMessageCell = ({ message, actions, className, children, ...props }: { message: ModelThreadMessagePart, actions: UIChatMessageActions } & React.ComponentProps<"div">) => {
    const content = message.content;
    const text = contentText(content);
    const images = content.images ?? [];

    const handleCopyToClipboard = ()=>{
        if (text.length>0) {
            navigator.clipboard.writeText(text);
            toast.info("Text copied.");
        }
    }

    const handleEdit = ()=>{
        actions.onEditMessage({
            threadId: message.threadId,
            messageId: message.id,
            msgId: message.msgId,
            text,
            image: images[0] ?? null,
        });
    }

    return <div className={cn("w-full flex items-end flex-row-reverse text-base overflow-hidden", className)} {...props}>
        <div>
            <div className="flex flex-col bg-slate-500/10 px-3 py-2 rounded-tr-lg rounded-tl-lg rounded-bl-lg items-end gap-2 overflow-hidden">
                {images.map((img, i) => (
                    <img key={i} src={img} alt="Attached" className="max-w-full max-h-80 rounded-md object-contain" />
                ))}
                {
                    text.length > 0 && <Markdown>{text}</Markdown>
                }
            </div>
            <div className="flex items-center justify-end pt-1 gap-1">
                <Button variant="ghost" className="size-8 text-foreground/50" aria-label="Copy to Clipboard" onClick={handleCopyToClipboard}>
                    <CopyIcon />
                </Button>
                <Button variant="ghost" className="size-8 text-foreground/50" aria-label="Edit Message" onClick={handleEdit}>
                    <PencilLineIcon />
                </Button>
            </div>
        </div>
    </div>;
};

const ModelMessageCell = ({ message, actions, className, children, ...props }: { message: ModelThreadMessagePart, actions: UIChatMessageActions } & React.ComponentProps<"div">) => {
    const streaming = false;
    const content = message.content;
    const processingContent = useStreamingMessageContent(message.id, message.last);
    const threadId = message.threadId;
    const msgId = message.id;
    let reasoning = "";
    let text = "";

    if (message.state === 'output') {
        const content = processingContent ? processingContent : message.content;
        reasoning = content.reasoning ?? "Preparing...";
        text = content.text ?? "";
    }
    else {
        text = content.text ?? "";
    }

    if (text.length === 0 && reasoning.length === 0) {
        console.log("empty message:", message);
    }

    const handleCopyToClipboard = ()=>{
        if (text.length>0) {
            navigator.clipboard.writeText(text);
            toast.info("Text copied.");
        }
    }

    const handleSpeak =()=>{
        if (text.length>0) {
            actions.onSpeakMessage(text);
        }
    }

    const handleBranchToNewThread = ()=>{
        actions.onBranchMessage(msgId);
    }

    return <div className={cn("w-full flex items-start text-base overflow-hidden", className)} {...props} aria-busy={streaming}>
        <div>
            <div className="flex flex-col bg-indigo-500/10 px-3 py-2 rounded-tr-lg rounded-br-lg rounded-bl-lg items-start gap-2 overflow-hidden">
                <Activity mode={(text.length == 0 && message.state === 'output') ? 'visible' : 'hidden'}>
                    <Accordion
                        defaultValue={[]}
                        className="max-w-lg"
                    >
                        <AccordionItem value="reasoning">
                            <AccordionTrigger className="flex gap-3 items-center min-w-60"><Spinner /><span>Thinking...</span></AccordionTrigger>
                            <AccordionContent>
                                <Markdown fontLevel="small">
                                    {reasoning}
                                </Markdown>
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                </Activity>
                {content.images?.map((img, i) => (
                    <img key={i} src={img} alt="Output" className="max-w-full max-h-80 rounded-md object-contain" />
                ))}
                <div className="w-full flex items-center overflow-hidden">
                    <Markdown>{text}</Markdown>
                </div>
            </div>

            <div className="flex items-center justify-start pt-1 gap-1">
                <Button variant="ghost" className="size-8 text-foreground/50" aria-label="Copy to Clipboard" onClick={handleCopyToClipboard}>
                    <CopyIcon />
                </Button>

                <Button variant="ghost" className="size-8 text-foreground/50" aria-label="Speak content" onClick={handleSpeak}>
                    <Volume2Icon />
                </Button>

                {threadId.length>0&& <Button variant="ghost" className="size-8 text-foreground/50" aria-label="Branch to new thread" onClick={handleBranchToNewThread}>
                    <GitBranchIcon />
                </Button>}

                
            </div>
        </div>
    </div>;
};

const MessageCellRouter = ({ message, actions }: { message: ModelThreadMessagePart, actions: UIChatMessageActions }) => {
    const { role } = message;
    if (role === 'user') {
        return <UserMessageCell message={message} actions={actions} />;
    }

    return <ModelMessageCell message={message} actions={actions} />;
};

export const UIChatMessageCell = ({ message, actions, index, className, isLast, ...props }: { message: ModelThreadMessagePart, actions: UIChatMessageActions, index: number, isLast: boolean } & React.ComponentProps<"li">) => {

    let options: AgentReplyOption[] = [];
    const content = message.content;
    if (content.metadata) {
        options = content.metadata.options ?? [];
    }

    const sendOption = (option: AgentReplyOption) => {
        actions.onSendOption(option);
    };

    return <li
        role="group"
        aria-roledescription="chat message"
        aria-labelledby={`msg-author-${message.id}`}
        data-index={index}
        className={cn("chat-item mb-6 w-full", className)}
        {...props}
    >
        <span
            id={`msg-author-${message.id}`}
            className="sr-only">
            {message.role === 'user' ? 'You said:' : 'Assistant said:'}
        </span>

        <MessageCellRouter message={message} actions={actions} />

        <Activity mode={!isLast || options.length === 0 ? "hidden" : "visible"}>
            <UIChatOptions options={options} send={sendOption} />
        </Activity>
    </li>;
};
