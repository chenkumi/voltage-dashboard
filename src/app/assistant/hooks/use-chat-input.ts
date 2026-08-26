import { CacheManager } from "@/lib/cache-manager";
import { useEffect, useRef } from "react";
import { useAssistantController } from "../controller/AssistantControllerProvider";

export const useChatInput = () => {
    const controller = useAssistantController();
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const previousEditingMessageIdRef = useRef<string | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            CacheManager.saveFile(file).then(virtualUrl => {
                controller.setAttachedImage(virtualUrl);
            });
        }
        e.target.value = "";
    };

    const handleRemoveImage = () => {
        if (controller.attachedImage) {
            CacheManager.deleteFile(controller.attachedImage);
        }
        controller.setAttachedImage(null);
    };

    const handleCancelMessage = () => {
        controller.cancelSending();
    };

    const handleCancelEditMessage = () => {
        controller.cancelEditMessage(true);
        textareaRef.current?.focus();
    };

    const handleSendMessage = (e?: React.FormEvent) => {
        e?.preventDefault();
        controller.sendDraft();
    };

    const handleResendMessage = (e?: React.FormEvent) => {
        e?.preventDefault();
        controller.resendEditedMessage();
    };

    const handleBranchMessage = (e?: React.FormEvent) => {
        e?.preventDefault();
        controller.branchEditedMessage();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (controller.editingMessage) {
                controller.resendEditedMessage();
            }
            else {
                controller.sendDraft();
            }
        }
    };

    useEffect(() => {
        const editingMessageId = controller.editingMessage?.messageId ?? null;
        if (editingMessageId && previousEditingMessageIdRef.current !== editingMessageId) {
            setTimeout(() => {
                textareaRef.current?.focus();
            }, 0);
        }
        previousEditingMessageIdRef.current = editingMessageId;
    }, [controller.editingMessage]);

    return {
        text: controller.text,
        setText: controller.setText,
        loading: controller.loading,
        editingMessage: controller.editingMessage,
        attachedImage: controller.attachedImage,
        textareaRef,
        fileInputRef,
        handleFileChange,
        handleRemoveImage,
        handleCancelMessage,
        handleCancelEditMessage,
        handleResendMessage,
        handleBranchMessage,
        handleSendMessage,
        handleKeyDown,
    };
};
