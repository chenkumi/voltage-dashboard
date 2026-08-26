import { readText } from "@/app/agent/utils";
import { ModelMessageContentView} from "@/app/types";

export const buildConversationLog = (messages: ModelMessageContentView[]) => {
    return messages
        .filter(message => (
            (message.role === "assistant" || message.role === "user")
            && (message.content?.text ?? "").length > 0
        ))
        .map(message => {
            const role = message.role;
            const text = readText(message.content);
            return `- ${role.toUpperCase()}: ${text}`;
        })
        .join("\n");
};
