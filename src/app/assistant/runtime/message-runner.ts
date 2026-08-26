import { AgentContext, AgentHook, AgentRuntimeContext } from "@/app/agent/agent-common";
import { Agent } from "@/app/agent/agent-impl-openai";
import { AgentStateRepository } from "@/app/agent/state-repository";
import { ModelContent, ModelMessageContentView, ModelThreadMessage } from "@/app/types";
import { convertToHistory } from "../utils/converter";
import { createOutputAggregator } from "./output-aggregator";

export type SendMessageResult = {
    ok: boolean;
    status: "success" | "cancelled" | "error";
    error?: unknown;
};

export type AssistantMessageRunnerAdapter = {
    messages: ModelThreadMessage[] | null;
    saveInputMessage: (message: ModelThreadMessage) => Promise<void>;
    saveOutputMessage: (message: ModelThreadMessage) => Promise<void>;
    removeMessage: (id: string) => Promise<void>;
    commitMessage: (threadId: string, msgId: string) => Promise<void>;
};

export type RunAssistantMessageOptions = {
    agent: Agent;
    adapter: AssistantMessageRunnerAdapter;
    threadId: string;
    input: ModelContent;
    abortController?: AbortController;
    historyMessages?: ModelThreadMessage[] | null;
};

const isAbortError = (error: unknown) => {
    if (!error || typeof error !== "object") {
        return false;
    }

    const candidate = error as { name?: string, code?: string };
    return candidate.name === "AbortError" || candidate.code === "ABORT_ERR";
};

export const runAssistantMessage = async ({
    agent,
    adapter,
    threadId,
    input,
    abortController,
    historyMessages: optionHistoryMessages,
}: RunAssistantMessageOptions): Promise<SendMessageResult> => {
    const {
        messages,
        saveInputMessage,
        saveOutputMessage,
        removeMessage,
        commitMessage,
    } = adapter;
    let msgId: string | null = null;

    try {
        const activeState = await AgentStateRepository.ensureActiveSegment(threadId, agent.name());
        const segmentId = activeState.segmentId;
        const historyMessages = optionHistoryMessages ?? messages;
        const modelHistory = convertToHistory(historyMessages ? historyMessages.map(message => ({
            msgId: message.msgId,
            id: message.id,
            role: message.role,
            content: message.content,
        })) : []);

        msgId = Agent.genId();

        const inputMsg: ModelMessageContentView = { msgId, id: Agent.genId(), role: "user", content: input };

        const inputTMsg: ModelThreadMessage = {
            msgId,
            id: inputMsg.id,
            role: "user",
            content: [input],
            threadId,
            segmentId,
            state: "input",
            createdAt: Date.now(),
        };

        await saveInputMessage(inputTMsg);

        const runtimeContext: AgentRuntimeContext = new Map();
        await agent.prepareForUserInput(input, { threadId, runtimeContext } satisfies AgentContext);
        const stableOutputId = Agent.genId();
        const outputAggregator = createOutputAggregator({
            saveOutputMessage,
            removeMessage,
        });

        const genHook: AgentHook = {
            saveOutputMessage: outputAggregator.saveOutputMessage,
            removeOutputMessage: outputAggregator.removeOutputMessage,
        };

        const currentInputMsg = inputMsg;
        const maxAutoContinueRounds = 3;

        for (let autoContinueRound = 0; autoContinueRound <= maxAutoContinueRounds; autoContinueRound++) {
            if (abortController?.signal.aborted) {
                throw abortController.signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
            }

            const result = await agent.generate({
                threadId,
                msgId,
                segmentId,
                context: runtimeContext,
                historyMessages: [],
                inputMessage: currentInputMsg,
                hook: genHook,
                abortController,
                outputMessageId: stableOutputId,
            });

            await commitMessage(threadId, msgId);

            if (result.content) {
                modelHistory.push(currentInputMsg);

                const outputMsg: ModelMessageContentView = {
                    msgId,
                    id: result.content.id,
                    role: "assistant",
                    content: result.content,
                };

                modelHistory.push(outputMsg);

            }
            break;
        }

        return { ok: true, status: "success" };
    }
    catch (e) {
        if (abortController?.signal.aborted || isAbortError(e)) {
            return { ok: false, status: "cancelled", error: e };
        }
        console.error(e);
        return { ok: false, status: "error", error: e };
    }
    finally {
        try {
            if (msgId) {
                await adapter.commitMessage(threadId, msgId);
            }
        }
        catch (cleanupError) {
            console.error("sendMessage cleanup failed:", cleanupError);
        }
    }
};
