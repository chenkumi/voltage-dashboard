import { ModelContent, ModelThread, ModelThreadMessage } from "@/app/types";
import { Dispatch, SetStateAction } from "react";
import { AgentReplyOption } from "../types";
import { SendMessageResult } from "../runtime";

export type EditMessageRequest = {
    threadId: string;
    messageId: string;
    msgId: string;
    text: string;
    image?: string | null;
};

export type EditingMessageState = EditMessageRequest & {
    image: string | null;
    draftText: string;
    draftImage: string | null;
};

export type SpeechRequest = {
    id: number;
    text: string;
};

export type SendMessage = (
    threadId: string,
    message: ModelContent,
    abortController?: AbortController,
    options?: { historyMessages?: ModelThreadMessage[] | null },
) => Promise<SendMessageResult>;

export type AssistantController = {
    text: string;
    setText: Dispatch<SetStateAction<string>>;
    loading: boolean;
    attachedImage: string | null;
    setAttachedImage: Dispatch<SetStateAction<string | null>>;
    editingMessage: EditingMessageState | null;
    speechRequest: SpeechRequest | null;
    openThread: (threadId: string) => void;
    createNewThread: () => void;
    pinThread: (thread: ModelThread) => Promise<void>;
    renameThread: (threadId: string, title: string) => Promise<void>;
    deleteThread: (threadId: string) => Promise<void>;
    branchFromMessage: (messageId: string) => Promise<void>;
    requestEditMessage: (request: EditMessageRequest) => boolean;
    cancelEditMessage: (restoreDraft?: boolean) => void;
    sendDraft: () => void;
    resendEditedMessage: () => void;
    branchEditedMessage: () => void;
    cancelSending: () => void;
    speak: (text: string) => void;
    sendOption: (option: AgentReplyOption) => Promise<void>;
};
