import { useLiveQuery } from "dexie-react-hooks";
import { createContext, ReactNode, useContext, useMemo } from "react";
import { ModelThread } from "@/app/types";
import { useAssistantDatasource } from "./datasource-context";

export type AssistantThreadContextValue = {
    threads: ModelThread[] | null;
    currentThread: ModelThread | null | undefined;
};

export const AssistantThreadContext = createContext<AssistantThreadContextValue | undefined>(undefined);

export const AssistantThreadProvider = ({
    children,
    threadId,
}: {
    children: ReactNode;
    threadId: string | undefined;
}) => {
    const datasource = useAssistantDatasource();
    const threads = useLiveQuery(() => datasource.listThreads(), [datasource]) ?? null;
    const currentThread = useMemo(() => {
        if (threads && threadId) {
            const thread = threads.find(item => item.id === threadId);
            return thread ?? null;
        }
        return undefined;
    }, [threads, threadId]);

    return <AssistantThreadContext.Provider value={{ threads, currentThread }}>
        {children}
    </AssistantThreadContext.Provider>;
};

export const useAssistantThread = () => {
    const context = useContext(AssistantThreadContext);
    if (context) {
        return context.currentThread;
    }
    return undefined;
};
