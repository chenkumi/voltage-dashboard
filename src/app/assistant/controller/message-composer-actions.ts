import { Agent } from "@/app/agent/agent-impl-openai";
import { ModelThread, ModelThreadMessage } from "@/app/types";
import { NavigateFunction } from "react-router";
import { AssistantDatasource } from "../datasource";
import { AgentReplyOption } from "../types";
import { cloneMessagesForThread } from "./thread-actions";
import { createEditedBranchThreadTitle, createInitialThreadTitle } from "./thread-title-policy";
import { EditingMessageState, SendMessage } from "./types";

export type ComposerDraftSnapshot = {
    text: string;
    attachedImage: string | null;
    editingMessage: EditingMessageState | null;
};

export type ComposerActionRuntime = {
    datasource: AssistantDatasource;
    thread: ModelThread | null | undefined;
    messages: ModelThreadMessage[] | null | undefined;
    sendMessage: SendMessage;
    navigate: NavigateFunction;
    loading: boolean;
    startSending: () => AbortController;
    finishSending: (controller: AbortController) => void;
    restoreDraft: (draftText: string, draftImage: string | null) => void;
    clearDraft: () => void;
    clearEditingMessage: (restore: boolean) => void;
    hasActiveSending: () => boolean;
};

const createInputContent = (text: string, image: string | null) => ({
    id: Agent.genId(),
    text,
    images: image ? [image] : undefined,
});

const restoreDraftOnSendFailure = (
    result: { ok: boolean; status: string },
    text: string,
    image: string | null,
    restoreDraft: (draftText: string, draftImage: string | null) => void,
) => {
    if (!result.ok && result.status !== "cancelled") {
        restoreDraft(text, image);
    }
};

export const sendDraftAction = async (snapshot: ComposerDraftSnapshot, runtime: ComposerActionRuntime) => {
    const { text, attachedImage } = snapshot;
    const {
        datasource,
        thread,
        sendMessage,
        navigate,
        loading,
        startSending,
        finishSending,
        restoreDraft,
        clearDraft,
    } = runtime;

    if ((!text.trim() && !attachedImage) || loading) {
        return;
    }

    const currentText = text;
    const currentImage = attachedImage;

    clearDraft();
    const abortController = startSending();

    let sendThreadId: string;
    if (thread) {
        sendThreadId = thread.id;
    }
    else {
        sendThreadId = Agent.genId();
        const newThread: ModelThread = {
            id: sendThreadId,
            title: createInitialThreadTitle(currentText, Boolean(currentImage)),
            createdAt: Date.now(),
        };
        await datasource.createThread(newThread);
    }

    sendMessage(sendThreadId, createInputContent(currentText, currentImage), abortController)
        .then(result => {
            restoreDraftOnSendFailure(result, currentText, currentImage, restoreDraft);
        })
        .catch(() => {
            restoreDraft(currentText, currentImage);
        })
        .finally(() => {
            finishSending(abortController);
        });

    if (!thread) {
        navigate(`/chat/${sendThreadId}`);
    }
};

export const resendEditedMessageAction = (snapshot: ComposerDraftSnapshot, runtime: ComposerActionRuntime) => {
    const { text, attachedImage, editingMessage } = snapshot;
    const {
        datasource,
        messages,
        sendMessage,
        loading,
        startSending,
        finishSending,
        restoreDraft,
        clearDraft,
        clearEditingMessage,
    } = runtime;

    if (!editingMessage || (!text.trim() && !attachedImage) || loading) {
        return;
    }

    const currentText = text;
    const currentImage = attachedImage;
    const currentEdit = editingMessage;
    const historyMessages = (messages ?? []).filter(message => (
        message.threadId === currentEdit.threadId && message.id < currentEdit.messageId
    ));

    clearDraft();
    clearEditingMessage(false);
    const abortController = startSending();

    datasource.deleteMessagesFrom(currentEdit.threadId, currentEdit.messageId)
        .then(() => {
            return sendMessage(currentEdit.threadId, createInputContent(currentText, currentImage), abortController, { historyMessages });
        })
        .then(result => {
            restoreDraftOnSendFailure(result, currentText, currentImage, restoreDraft);
        })
        .catch(() => {
            restoreDraft(currentText, currentImage);
        })
        .finally(() => {
            finishSending(abortController);
        });
};

export const branchEditedMessageAction = (snapshot: ComposerDraftSnapshot, runtime: ComposerActionRuntime) => {
    const { text, attachedImage, editingMessage } = snapshot;
    const {
        datasource,
        messages,
        sendMessage,
        navigate,
        loading,
        startSending,
        finishSending,
        restoreDraft,
        clearDraft,
        clearEditingMessage,
    } = runtime;

    if (!editingMessage || (!text.trim() && !attachedImage) || loading) {
        return;
    }

    const currentText = text;
    const currentImage = attachedImage;
    const currentEdit = editingMessage;
    const sendThreadId = Agent.genId();
    const newThread: ModelThread = {
        id: sendThreadId,
        title: createEditedBranchThreadTitle(currentText),
        createdAt: Date.now(),
    };
    const sourceMessages = (messages ?? []).filter(message => (
        message.threadId === currentEdit.threadId && message.id < currentEdit.messageId
    ));
    const branchMessages = cloneMessagesForThread(sourceMessages, sendThreadId);

    clearDraft();
    clearEditingMessage(false);
    const abortController = startSending();

    datasource.branchThread({ thread: newThread, messages: branchMessages })
        .then(() => {
            navigate(`/chat/${sendThreadId}`);
            return sendMessage(sendThreadId, createInputContent(currentText, currentImage), abortController, { historyMessages: branchMessages });
        })
        .then(result => {
            restoreDraftOnSendFailure(result, currentText, currentImage, restoreDraft);
        })
        .catch(() => {
            restoreDraft(currentText, currentImage);
        })
        .finally(() => {
            finishSending(abortController);
        });
};

export const sendOptionAction = async (option: AgentReplyOption, runtime: ComposerActionRuntime) => {
    const {
        thread,
        sendMessage,
        startSending,
        finishSending,
        hasActiveSending,
    } = runtime;

    if (!thread || hasActiveSending()) {
        return;
    }

    const abortController = startSending();
    await sendMessage(thread.id, createInputContent(option, null), abortController).finally(() => {
        finishSending(abortController);
    });
};
