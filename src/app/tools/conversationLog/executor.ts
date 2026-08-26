import { AgentExecutorProps } from "@/app/agent/agent-common";
import { LogAgent } from "@/app/agent/agent-log";
import { ToolArgs } from "./types";

const CONVERSATION_LOG_CONTEXT_KEY = "conversationLog";

type ConversationLogContext = {
    foldedCount?: number,
    totalCount?: number,
    fullText?: string,
    foldedText?: string,
};

const getConversationLogContext = (props: AgentExecutorProps): ConversationLogContext | null => {
    const value = props.context?.get(CONVERSATION_LOG_CONTEXT_KEY);
    if (!value || typeof value !== "object") {
        return null;
    }

    return value as ConversationLogContext;
};

export async function executor(
    props: AgentExecutorProps,
    input: ToolArgs,
) {
    const logContext = getConversationLogContext(props);

    if (!logContext) {
        return {
            status: "NO_CONVERSATION_LOG",
            message: "No conversation log is available in the current runtime context.",
            recovery: "Continue with the visible conversation, or ask the user for the missing details.",
        };
    }

    if (!logContext.foldedCount || !logContext.foldedText?.trim()) {
        return {
            status: "NO_CONVERSATION_RECORDS",
            message: "No earlier conversation records are available outside the active prompt.",
            recovery: "Use the currently visible conversation instead of calling conversationLog again.",
        };
    }

    const prompt = [
        "<query>",
        input.query,
        "</query>",
        "",
        "<conversation_log>",
        logContext.foldedText,
        "</conversation_log>",
        "",
        "Return only records relevant to the query. Include role and message index when useful.",
    ].join("\n");

    const result = await LogAgent.generatePrompt(props.threadId, prompt);
    const text = result.content?.text?.trim();

    if (!text) {
        return {
            status: "EMPTY_RESULT",
            message: "The log retrieval agent returned no text.",
            foldedCount: logContext.foldedCount,
            query: input.query,
        };
    }

    return {
        status: "ok",
        query: input.query,
        foldedCount: logContext.foldedCount,
        totalCount: logContext.totalCount,
        result: text,
    };
}
