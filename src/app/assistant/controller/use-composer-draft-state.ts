import { useCallback, useState } from "react";
import { EditMessageRequest, EditingMessageState, SpeechRequest } from "./types";

export const useComposerDraftState = () => {
    const [text, setText] = useState("");
    const [attachedImage, setAttachedImage] = useState<string | null>(null);
    const [editingMessage, setEditingMessage] = useState<EditingMessageState | null>(null);
    const [speechRequest, setSpeechRequest] = useState<SpeechRequest | null>(null);

    const restoreDraft = useCallback((draftText: string, draftImage: string | null) => {
        setText(draftText);
        setAttachedImage(draftImage);
    }, []);

    const clearDraft = useCallback(() => {
        setText("");
        setAttachedImage(null);
    }, []);

    const clearEditingMessage = useCallback((restore: boolean) => {
        setEditingMessage(current => {
            if (current && restore) {
                restoreDraft(current.draftText, current.draftImage);
            }
            return null;
        });
    }, [restoreDraft]);

    const requestEditMessage = useCallback((request: EditMessageRequest, loading: boolean) => {
        if (loading) {
            return false;
        }

        setEditingMessage(current => ({
            ...request,
            image: request.image ?? null,
            draftText: current?.threadId === request.threadId ? current.draftText : text,
            draftImage: current?.threadId === request.threadId ? current.draftImage : attachedImage,
        }));
        setText(request.text);
        setAttachedImage(request.image ?? null);
        return true;
    }, [attachedImage, text]);

    const speak = useCallback((speechText: string) => {
        setSpeechRequest(current => ({
            id: (current?.id ?? 0) + 1,
            text: speechText,
        }));
    }, []);

    return {
        text,
        setText,
        attachedImage,
        setAttachedImage,
        editingMessage,
        speechRequest,
        restoreDraft,
        clearDraft,
        clearEditingMessage,
        requestEditMessage,
        speak,
    };
};
