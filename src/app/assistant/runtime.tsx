import { createContext, ReactNode, useCallback, useContext } from "react";
import { Agent } from "../agent/agent-impl-openai";
import { ModelContent, ModelThreadMessage } from "../types";
import { AssistantMessageContext, useAssistantDatasource } from "./datasource";
import { runAssistantMessage, SendMessageResult } from "./runtime/message-runner";

type AssistantRuntimeContextValue = {
    sendMessage: (threadId: string, message: ModelContent, abortController?: AbortController, options?: { historyMessages?: ModelThreadMessage[] | null }) => Promise<SendMessageResult>;
};

const AssistantRuntimeContext = createContext<AssistantRuntimeContextValue>({
    sendMessage: async () => ({ ok: false, status: "error" }),
});

export const useAssistantRuntime = () => {
    const context = useContext(AssistantRuntimeContext);
    return context;
};

export const AssistantRuntime = ({ children, agent }: { children: ReactNode, agent: Agent }) => {
    const context = useContext(AssistantMessageContext);
    const datasource = useAssistantDatasource();
    const sendMessage = useCallback(async (threadId: string, input: ModelContent, abortController?: AbortController, options?: { historyMessages?: ModelThreadMessage[] | null }) => {
        if (!context) {
            return { ok: false, status: "error" } satisfies SendMessageResult;
        }

        const {
            messages,
            saveInputMessage,
            saveOutputMessage,
            removeMessage,
            commitMessage,
        } = context;

        return await runAssistantMessage({
            agent,
            adapter: {
                messages,
                saveInputMessage,
                saveOutputMessage,
                removeMessage,
                commitMessage,
                rejectLatestAssistantOutput: datasource.rejectLatestAssistantOutput,
            },
            threadId,
            input,
            abortController,
            historyMessages: options?.historyMessages,
        });
    }, [context, agent, datasource]);

    return <AssistantRuntimeContext.Provider value={{ sendMessage }}>
        {children}
    </AssistantRuntimeContext.Provider>;
};

export type { SendMessageResult };
