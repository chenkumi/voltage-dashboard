import { createContext, ReactNode, useContext, useMemo } from "react";
import { useNavigate } from "react-router";
import { useAssistantDatasource, useAssistantThread, useAssistantThreadMessages } from "../datasource";
import { useAssistantRuntime } from "../runtime";
import { AssistantController } from "./types";
import { useMessageComposerController } from "./use-message-composer-controller";
import { useThreadActionsController } from "./use-thread-actions-controller";

const AssistantControllerContext = createContext<AssistantController | undefined>(undefined);

export const AssistantControllerProvider = ({ children }: { children: ReactNode }) => {
    const datasource = useAssistantDatasource();
    const thread = useAssistantThread();
    const messages = useAssistantThreadMessages();
    const { sendMessage } = useAssistantRuntime();
    const navigate = useNavigate();
    const threadActions = useThreadActionsController({
        datasource,
        thread,
        messages,
        navigate,
    });
    const composer = useMessageComposerController({
        datasource,
        thread,
        messages,
        sendMessage,
        navigate,
    });

    const value = useMemo<AssistantController>(() => ({
        ...composer,
        ...threadActions,
    }), [composer, threadActions]);

    return <AssistantControllerContext.Provider value={value}>
        {children}
    </AssistantControllerContext.Provider>;
};

export const useAssistantController = () => {
    const controller = useContext(AssistantControllerContext);
    if (!controller) {
        throw new Error("useAssistantController must be used within AssistantControllerProvider.");
    }

    return controller;
};

export type {
    AssistantController,
    EditMessageRequest,
    EditingMessageState,
    SpeechRequest,
} from "./types";
