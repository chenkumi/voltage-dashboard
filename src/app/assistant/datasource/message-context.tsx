import { useLiveQuery } from "dexie-react-hooks";
import { createContext, ReactNode, useContext } from "react";
import { ModelThreadMessage } from "@/app/types";
import { useAssistantDatasource } from "./datasource-context";
import { useAssistantThread } from "./thread-context";

export type AssistantThreadMessageValue = {
    threadId: string;
    messages: ModelThreadMessage[] | null;
    saveInputMessage: (message: ModelThreadMessage) => Promise<void>;
    saveOutputMessage: (message: ModelThreadMessage) => Promise<void>;
    removeMessage: (id: string) => Promise<void>;
    commitMessage: (threadId: string, msgId: string) => Promise<void>;
};

export const AssistantMessageContext = createContext<AssistantThreadMessageValue | undefined>(undefined);

export const AssistantMessageProvider = ({ children }: { children: ReactNode }) => {
    const datasource = useAssistantDatasource();
    const thread = useAssistantThread();
    const messages = useLiveQuery(async () => {
        if (thread) {
            return await datasource.listMessages(thread.id);
        }

        return null;
    }, [thread, datasource]) ?? null;
    const threadId = thread ? thread.id : "default";

    const saveInputMessage = async (message: ModelThreadMessage) => {
        await datasource.saveInputMessage(message);
    };

    const saveOutputMessage = async (message: ModelThreadMessage) => {
        await datasource.saveOutputMessage(message);
    };

    const commitMessage = async (targetThreadId: string, msgId: string) => {
        await datasource.commitMessage(targetThreadId, msgId);
    };

    const removeMessage = async (id: string) => {
        await datasource.removeMessage(id);
    };

    return <AssistantMessageContext.Provider value={{
        threadId,
        messages,
        saveInputMessage,
        saveOutputMessage,
        removeMessage,
        commitMessage,
    }}>
        {children}
    </AssistantMessageContext.Provider>;
};

export const useAssistantThreadMessages = () => {
    const context = useContext(AssistantMessageContext);
    if (context) {
        return context.messages;
    }
    return undefined;
};

export const useAssistantMessageContext = () => {
    return useContext(AssistantMessageContext);
};
