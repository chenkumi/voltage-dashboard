import { AgentCommon } from "@/app/agent/agent-common";
import { ModelThread, ModelThreadMessage } from "@/app/types";
import { NavigateFunction } from "react-router";
import { useCallback, useMemo } from "react";
import { AssistantDatasource } from "../datasource";
import { cloneMessagesForThread } from "./thread-actions";
import { createMessageBranchThreadTitle } from "./thread-title-policy";

export type ThreadActionsControllerOptions = {
    datasource: AssistantDatasource;
    thread: ModelThread | null | undefined;
    messages: ModelThreadMessage[] | null | undefined;
    navigate: NavigateFunction;
};

export const useThreadActionsController = ({
    datasource,
    thread,
    messages,
    navigate,
}: ThreadActionsControllerOptions) => {
    const openThread = useCallback((threadId: string) => {
        navigate(`/chat/${threadId}`);
    }, [navigate]);

    const createNewThread = useCallback(() => {
        navigate("/chat");
    }, [navigate]);

    const pinThread = useCallback(async (targetThread: ModelThread) => {
        const nextPin = targetThread.pin === 1 ? 0 : 1;
        await datasource.updateThread(targetThread.id, { pin: nextPin });
    }, [datasource]);

    const renameThread = useCallback(async (threadId: string, title: string) => {
        await datasource.updateThread(threadId, { customTitle: title });
    }, [datasource]);

    const deleteThread = useCallback(async (threadId: string) => {
        await datasource.deleteThread(threadId);
    }, [datasource]);

    const branchFromMessage = useCallback(async (messageId: string) => {
        if (!thread) {
            return;
        }

        const nextThreadId = AgentCommon.genId();
        const nextThread: ModelThread = {
            id: nextThreadId,
            title: createMessageBranchThreadTitle(),
            createdAt: Date.now(),
        };
        const sourceMessages = (messages ?? []).filter(message => message.id <= messageId);
        await datasource.branchThread({
            thread: nextThread,
            messages: cloneMessagesForThread(sourceMessages, nextThreadId),
        });
        navigate(`/chat/${nextThreadId}`);
    }, [datasource, messages, navigate, thread]);

    return useMemo(() => ({
        openThread,
        createNewThread,
        pinThread,
        renameThread,
        deleteThread,
        branchFromMessage,
    }), [
        branchFromMessage,
        createNewThread,
        deleteThread,
        openThread,
        pinThread,
        renameThread,
    ]);
};
