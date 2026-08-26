import { AgentCommon } from "@/app/agent/agent-common";
import { ModelThreadMessage } from "@/app/types";

export const cloneMessagesForThread = (messages: ModelThreadMessage[], threadId: string) => {
    return messages.map(message => ({
        ...message,
        threadId,
        id: AgentCommon.genId(),
    }));
};
