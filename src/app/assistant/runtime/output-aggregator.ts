import { AgentHook } from "@/app/agent/agent-common";
import { ModelThreadMessage } from "@/app/types";

export type OutputAggregatorAdapter = {
    saveOutputMessage: (message: ModelThreadMessage) => Promise<void>;
    removeMessage: (id: string) => Promise<void>;
};

export const createOutputAggregator = ({
    saveOutputMessage,
    removeMessage,
}: OutputAggregatorAdapter): Pick<AgentHook, "saveOutputMessage" | "removeOutputMessage"> => {
    let aggregatedOutputMessage: ModelThreadMessage | null = null;
    let outputSourceId: string | null = null;
    let outputSourceContentCount = 0;

    const saveAggregatedOutputMessage: AgentHook["saveOutputMessage"] = async (message, hookContext) => {
        const sourceId = hookContext.inputId;
        if (!aggregatedOutputMessage) {
            aggregatedOutputMessage = { ...message };
            outputSourceId = sourceId;
            outputSourceContentCount = message.content.length;
            await saveOutputMessage(aggregatedOutputMessage);
            return;
        }

        if (outputSourceId !== sourceId) {
            aggregatedOutputMessage = {
                ...aggregatedOutputMessage,
                content: [...aggregatedOutputMessage.content, ...message.content],
            };
            outputSourceId = sourceId;
            outputSourceContentCount = message.content.length;
            await saveOutputMessage(aggregatedOutputMessage);
            return;
        }

        aggregatedOutputMessage = {
            ...aggregatedOutputMessage,
            content: [
                ...aggregatedOutputMessage.content.slice(0, -outputSourceContentCount),
                ...message.content,
            ],
        };
        outputSourceContentCount = message.content.length;
        await saveOutputMessage(aggregatedOutputMessage);
    };

    const removeAggregatedOutputMessage: AgentHook["removeOutputMessage"] = async (id, hookContext) => {
        if (!aggregatedOutputMessage || outputSourceId !== hookContext.inputId) {
            await removeMessage(id);
            return;
        }

        const nextContent = aggregatedOutputMessage.content.slice(0, -outputSourceContentCount);
        if (nextContent.length === 0) {
            await removeMessage(aggregatedOutputMessage.id);
            aggregatedOutputMessage = null;
            outputSourceId = null;
            outputSourceContentCount = 0;
            return;
        }

        aggregatedOutputMessage = {
            ...aggregatedOutputMessage,
            content: nextContent,
        };
        outputSourceContentCount = 0;
        await saveOutputMessage(aggregatedOutputMessage);
    };

    return {
        saveOutputMessage: saveAggregatedOutputMessage,
        removeOutputMessage: removeAggregatedOutputMessage,
    };
};
