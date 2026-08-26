import { EventEmitter } from "events";
import { ModelContent } from "../types";

const eventBus = new EventEmitter();

const messageContentEvent = (outputId: string) => `message-content:${outputId}`;
const promptUpdatedEvent = (agentName: string) => `prompt-updated:${agentName}`;

export const AgentRuntimeEvents = {
    emitMessageContent: (outputId: string, content: ModelContent) => {
        eventBus.emit(messageContentEvent(outputId), content);
    },

    onMessageContent: (outputId: string, listener: (content: ModelContent) => void) => {
        eventBus.on(messageContentEvent(outputId), listener);
    },

    offMessageContent: (outputId: string, listener: (content: ModelContent) => void) => {
        eventBus.off(messageContentEvent(outputId), listener);
    },

    emitPromptUpdated: (agentName: string) => {
        eventBus.emit(promptUpdatedEvent(agentName));
    },

    onPromptUpdated: (agentName: string, listener: () => void) => {
        eventBus.on(promptUpdatedEvent(agentName), listener);
    },

    offPromptUpdated: (agentName: string, listener: () => void) => {
        eventBus.off(promptUpdatedEvent(agentName), listener);
    },
};
