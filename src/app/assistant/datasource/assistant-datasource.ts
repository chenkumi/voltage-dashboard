import { ModelLog, ModelThread, ModelThreadMessage } from "@/app/types";

export type CreateThreadInput = {
    id: string;
    title: string;
    createdAt: number;
};

export type BranchThreadInput = {
    thread: ModelThread;
    messages: ModelThreadMessage[];
};

export type AssistantDatasource = {
    listThreads: () => Promise<ModelThread[]>;
    listMessages: (threadId: string) => Promise<ModelThreadMessage[]>;
    listLogs: (threadId: string) => Promise<ModelLog[]>;
    createThread: (input: CreateThreadInput) => Promise<void>;
    updateThread: (threadId: string, patch: Partial<ModelThread>) => Promise<void>;
    deleteThread: (threadId: string) => Promise<void>;
    saveInputMessage: (message: ModelThreadMessage) => Promise<void>;
    saveOutputMessage: (message: ModelThreadMessage) => Promise<void>;
    removeMessage: (id: string) => Promise<void>;
    commitMessage: (threadId: string, msgId: string) => Promise<void>;
    deleteMessagesFrom: (threadId: string, messageId: string) => Promise<void>;
    branchThread: (input: BranchThreadInput) => Promise<void>;
    rejectLatestAssistantOutput: (threadId: string, msgId: string, reason: string) => Promise<void>;
};
