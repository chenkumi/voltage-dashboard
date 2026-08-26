import { ModelThread, ModelThreadMessage } from "@/app/types";
import { NavigateFunction } from "react-router";
import { useCallback, useEffect, useMemo } from "react";
import { AssistantDatasource } from "../datasource";
import { AgentReplyOption } from "../types";
import {
    branchEditedMessageAction,
    ComposerActionRuntime,
    ComposerDraftSnapshot,
    resendEditedMessageAction,
    sendDraftAction,
    sendOptionAction,
} from "./message-composer-actions";
import { EditMessageRequest, SendMessage } from "./types";
import { useComposerDraftState } from "./use-composer-draft-state";
import { useSendingLifecycle } from "./use-sending-lifecycle";

export type MessageComposerControllerOptions = {
    datasource: AssistantDatasource;
    thread: ModelThread | null | undefined;
    messages: ModelThreadMessage[] | null | undefined;
    sendMessage: SendMessage;
    navigate: NavigateFunction;
};

export const useMessageComposerController = ({
    datasource,
    thread,
    messages,
    sendMessage,
    navigate,
}: MessageComposerControllerOptions) => {
    const draft = useComposerDraftState();
    const sending = useSendingLifecycle();

    const snapshot = useMemo<ComposerDraftSnapshot>(() => ({
        text: draft.text,
        attachedImage: draft.attachedImage,
        editingMessage: draft.editingMessage,
    }), [draft.attachedImage, draft.editingMessage, draft.text]);

    const actionRuntime = useMemo<ComposerActionRuntime>(() => ({
        datasource,
        thread,
        messages,
        sendMessage,
        navigate,
        loading: sending.loading,
        startSending: sending.startSending,
        finishSending: sending.finishSending,
        restoreDraft: draft.restoreDraft,
        clearDraft: draft.clearDraft,
        clearEditingMessage: draft.clearEditingMessage,
        hasActiveSending: sending.hasActiveSending,
    }), [
        datasource,
        draft.clearDraft,
        draft.clearEditingMessage,
        draft.restoreDraft,
        messages,
        navigate,
        sending.finishSending,
        sending.hasActiveSending,
        sending.loading,
        sending.startSending,
        sendMessage,
        thread,
    ]);

    const requestEditMessage = useCallback((request: EditMessageRequest) => {
        return draft.requestEditMessage(request, sending.loading);
    }, [draft, sending.loading]);

    const cancelEditMessage = useCallback((restore = true) => {
        draft.clearEditingMessage(restore);
    }, [draft]);

    const sendDraft = useCallback(() => {
        sendDraftAction(snapshot, actionRuntime);
    }, [actionRuntime, snapshot]);

    const resendEditedMessage = useCallback(() => {
        resendEditedMessageAction(snapshot, actionRuntime);
    }, [actionRuntime, snapshot]);

    const branchEditedMessage = useCallback(() => {
        branchEditedMessageAction(snapshot, actionRuntime);
    }, [actionRuntime, snapshot]);

    const sendOption = useCallback(async (option: AgentReplyOption) => {
        await sendOptionAction(option, actionRuntime);
    }, [actionRuntime]);

    useEffect(() => {
        if (draft.editingMessage && thread?.id !== draft.editingMessage.threadId) {
            draft.clearEditingMessage(true);
        }
    }, [draft, thread]);

    return useMemo(() => ({
        text: draft.text,
        setText: draft.setText,
        loading: sending.loading,
        attachedImage: draft.attachedImage,
        setAttachedImage: draft.setAttachedImage,
        editingMessage: draft.editingMessage,
        speechRequest: draft.speechRequest,
        requestEditMessage,
        cancelEditMessage,
        sendDraft,
        resendEditedMessage,
        branchEditedMessage,
        cancelSending: sending.cancelSending,
        speak: draft.speak,
        sendOption,
    }), [
        branchEditedMessage,
        cancelEditMessage,
        draft.attachedImage,
        draft.editingMessage,
        draft.setAttachedImage,
        draft.setText,
        draft.speak,
        draft.speechRequest,
        draft.text,
        requestEditMessage,
        resendEditedMessage,
        sendDraft,
        sendOption,
        sending.cancelSending,
        sending.loading,
    ]);
};
