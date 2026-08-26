import { CacheManager, VIRTUAL_PREFIX } from "@/lib/cache-manager";
import OpenAI from "openai";
import { ChatCompletionContentPart } from "openai/resources/chat/completions.mjs";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { ModelContent, ModelMessageContentView, ModelResult, ModelRole, ModelThreadMessage, ModelTool, ModelToolResult, ProcessingModelContent } from "../types";
import { AgentCommon, AgentContext, AgentGenerateOptions, AgentHookContext, AgentProps, AgentTool, createUntilResponseDeveloperMessage, createUntilResponseUserMessage, pruneUntilResponseRecords } from "./agent-common";
import { AgentRuntimeEvents } from "./agent-runtime-events";
import { generateLM, GenerateProps } from './llm-api-openai';
import { escapeText, readText } from './utils';

const model = import.meta.env.VITE_APP_LLM_MODEL;
const baseURL = import.meta.env.VITE_APP_LLM_BASE_URL;
const authToken = import.meta.env.VITE_APP_AUTH_KEY;

const findKnownTool = async (name: string): Promise<AgentTool | undefined> => {
    const { DynamicTools, PrimaryTools } = await import("@/app/tools");
    return [...PrimaryTools, ...DynamicTools].find(tool => tool.name === name);
};

export const modelMessageToOpenAI = async (m: { role: ModelRole, content: ModelContent }): Promise<OpenAI.Chat.ChatCompletionMessageParam> => {
    return (await modelMessagesToOpenAI(m))[0];
}

export const modelMessagesToOpenAI = async (m: { role: ModelRole, content: ModelContent }): Promise<OpenAI.Chat.ChatCompletionMessageParam[]> => {
    const { role, content } = m;

    const blocks: ChatCompletionContentPart[] = [];
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    const buildToolCall = (t: ModelTool) => ({
        id: t.id,
        type: 'function' as const,
        function: {
            name: t.name,
            arguments: typeof t.input === 'string' ? t.input : JSON.stringify(t.input || {})
        }
    });

    if (content.text && content.text.length > 0) {
        let content_text = escapeText(content.text);;
        blocks.push({ type: 'text', text: content_text });
    }

    if (content.images) {
        for (const imageUrl of content.images) {
            if (imageUrl.startsWith(VIRTUAL_PREFIX)) {
                const dataUrl = await CacheManager.resolveToDataUrl(imageUrl);
                blocks.push({
                    type: 'image_url',
                    image_url: { url: dataUrl }
                } as any);
            }
            else {
                blocks.push({
                    type: 'image_url',
                    image_url: { url: imageUrl }
                } as any);
            }

        }
    }

    if (content.audios) {
        for (const audioData of content.audios) {
            blocks.push({
                type: 'input_audio',
                input_audio: {
                    data: audioData,
                    format: 'mp3'
                }
            } as any);
        }
    }

    if (role === 'assistant') {
        const assistantMsg: OpenAI.Chat.ChatCompletionAssistantMessageParam = {
            role: 'assistant',
        };
        const toolCalls = content.tools?.map(buildToolCall) || [];
        const toolResults = content.tools?.filter(t => t.output !== undefined && t.output !== null) || [];

        if (blocks.length > 0) {
            assistantMsg.content = blocks as any;
        }

        if (toolCalls.length > 0) {
            assistantMsg.tool_calls = toolCalls;
        }

        if (!assistantMsg.content && (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0)) {
            assistantMsg.content = "";
        }

        messages.push(assistantMsg);

        for (const t of toolResults) {
            messages.push({

                role: 'tool',
                tool_call_id: t.id,
                content: JSON.stringify(t.output)
            });
        }
    }
    else if (role === 'tool') {

        if (content.tools && content.tools.length > 0) {

            const assistantMsg: OpenAI.Chat.ChatCompletionAssistantMessageParam = {
                role: 'assistant',
            };

            if (blocks.length > 0) {
                assistantMsg.content = blocks as any;
            }

            assistantMsg.tool_calls = content.tools.map(buildToolCall);
            if (content.reasoning) {
                // OpenAPI官方api沒有reasoning_content 但是本專案需要使用 直接ignore
                //@ts-ignore
                assistantMsg.reasoning_content = content.reasoning;
            }

            if (!!assistantMsg.content || assistantMsg.tool_calls.length > 0) {
                messages.push(assistantMsg);
            }

            for (const t of content.tools) {
                if (t.output !== undefined && t.output !== null) {
                    messages.push({ role: 'tool', tool_call_id: t.id, content: JSON.stringify(t.output) });
                }
            }
        }
    }
    else {

        messages.push({
            role: role as any,
            content: blocks.length > 0 ? blocks : ""
        });
    }

    return messages;
}

const toOpenAIoolParameters = (schema: any) => {
    const normalizeObjectSchema = (candidate: any) => {
        if (!candidate || candidate.type !== 'object') {
            return null;
        }

        const normalized: {
            type: 'object',
            properties: Record<string, unknown>,
            required?: string[],
            additionalProperties: boolean,
        } = {
            type: 'object',
            properties: candidate.properties ?? {},
            additionalProperties: candidate.additionalProperties ?? false,
        };

        if (Array.isArray(candidate.required) && candidate.required.length > 0) {
            normalized.required = candidate.required;
        }

        return normalized;
    };

    if (!schema) {
        return {
            type: 'object',
            properties: {},
            additionalProperties: false,
        };
    }

    // Zod schema objects expose safeParse; convert them to plain JSON Schema for OpenAI tools.
    if (typeof schema.safeParse === 'function') {
        const nativeJsonSchema = typeof (z as any).toJSONSchema === 'function'
            ? (z as any).toJSONSchema(schema)
            : null;

        const normalizedNative = normalizeObjectSchema(nativeJsonSchema);
        if (normalizedNative) {
            return normalizedNative;
        }

        const jsonSchema = zodToJsonSchema(schema, {
            $refStrategy: 'none',
        }) as any;

        const normalizedJsonSchema = normalizeObjectSchema(jsonSchema);
        if (normalizedJsonSchema) {
            return normalizedJsonSchema;
        }

        if (jsonSchema?.definitions) {
            const firstDefinition = Object.values(jsonSchema.definitions)[0];
            const normalizedDefinition = normalizeObjectSchema(firstDefinition);
            if (normalizedDefinition) {
                return normalizedDefinition;
            }
        }
    }

    return normalizeObjectSchema(schema) ?? {
        type: 'object',
        properties: {},
        additionalProperties: false,
    };
};

const normalizeText = (text: string) => {
    let ntext = text;
    if (ntext.startsWith('```json') && ntext.endsWith('```')) {
        ntext = ntext.substring(7, ntext.length - 3);
    }
    return ntext;
}

const createInternalRoundLimitMessage = (msgId: string, maxRounds: number): ModelMessageContentView => ({
    msgId,
    id: AgentCommon.genId(),
    role: 'system',
    content: {
        id: AgentCommon.genId(),
        retention: 'until-response',
        text: [
            `Internal execution round limit reached (${maxRounds} rounds).`,
            "Stop calling tools now.",
            "Reply to the user with a concise summary of current progress and the next-step plan.",
            "Ask the user to confirm before continuing.",
        ].join("\n"),
    },
});

export class Agent extends AgentCommon {

    public async genProps(context?: AgentContext) {
        const systemInstruction = await this.systemInstruction(context);
        console.log("systemInstruction:", systemInstruction);
        const firstPrompt = await this.firstPrompt(context) + "\n\n" + await this.activeSkillPrompt(context);

        const tools = await this.tools(context);

        const props: GenerateProps = {
            model,
            baseURL,
            authToken,
            systemInstruction: systemInstruction || undefined,
            firstPrompt: firstPrompt || undefined,
            maxTokens: this.tokenExtended ? this.maxExtendedTokens : this.maxTokens,
            thinking: this.thinking,
            budgetTokens: this.budgetTokens,
            jsonOutputSchema: this.jsonOutputSchema,
            toolChoice: this.toolChoice,
            tools: tools.map(t => {
                const { inputSchema, name, description } = t;
                return {
                    type: 'function',
                    function: {
                        name,
                        description,
                        parameters: toOpenAIoolParameters(inputSchema),
                    }
                };
            }),
        };

        return props;
    }

    public async generate(options: AgentGenerateOptions): Promise<ModelResult> {
        const {
            threadId,
            msgId,
            segmentId,
            context,
            historyMessages,
            inputMessage,
            hook,
        } = options;

        const agent = this.name();
        const agentContext: AgentContext = { threadId, runtimeContext: context };

        this.tokenExtended = false;

        const inputId = inputMessage.id;

        let round = 0;

        const resultBuilder: ModelResult = {
            msgId
        }

        if (inputMessage.content.text) {
            this.logLlmMessageText(agent, threadId, 'user', inputMessage.content.text);
        }

        let finalContent: ModelContent | undefined = undefined;

        const outputId = options.outputMessageId ?? AgentCommon.genId();
        let currentOutputContent: ModelContent = { id: Agent.genId(), text: "" };

        let outputMsg: ModelThreadMessage = {
            threadId,
            segmentId,
            msgId,
            state: "output",
            id: outputId,
            role: "assistant",
            content: [currentOutputContent],
            createdAt: Date.now(),
        };

        const createHookContext = (round: number): AgentHookContext => ({
            agent,
            threadId,
            msgId,
            segmentId,
            inputId,
            round,
            context,
        });

        if (hook?.saveOutputMessage) {
            await hook.saveOutputMessage(outputMsg, createHookContext(round));
        }

        const syncCurrentOutputContent = () => {
            outputMsg = {
                ...outputMsg,
                content: [
                    ...outputMsg.content.slice(0, -1),
                    currentOutputContent,
                ],
            };
        };

        const currentOutputAdapter = (): ModelMessageContentView => ({
            msgId,
            id: currentOutputContent.id,
            messageId: outputMsg.id,
            role: "assistant",
            content: currentOutputContent,
        });

        const dropCurrentOutputContent = async (hookContext: AgentHookContext) => {
            if (outputMsg.content.length <= 1) {
                if (hook?.removeOutputMessage) {
                    await hook.removeOutputMessage(outputId, hookContext);
                }
                return;
            }

            outputMsg = {
                ...outputMsg,
                content: outputMsg.content.slice(0, -1),
            };
            currentOutputContent = outputMsg.content[outputMsg.content.length - 1];
            if (hook?.saveOutputMessage) {
                await hook.saveOutputMessage(outputMsg, hookContext);
            }
        };

        // 初始對話紀錄只留 user 與 assistant 的對話
        let conversationMessages: ModelMessageContentView[] = [...historyMessages, inputMessage].filter(m => (m.role === 'user' || m.role === 'assistant'));

        if (hook?.prepareInputMessages) {
            conversationMessages = await hook.prepareInputMessages(conversationMessages, createHookContext(round));
        }
        else if (hook?.prepareInputMessage) {
            conversationMessages = await hook.prepareInputMessage(conversationMessages);
        }

        let roundLimitMessageSent = false;

        while (true) {
            round++;

            if (round > this.maxInternalRounds && !roundLimitMessageSent) {
                conversationMessages = [
                    ...conversationMessages,
                    createInternalRoundLimitMessage(msgId, this.maxInternalRounds),
                ];
                roundLimitMessageSent = true;
            }

            const hookContext = createHookContext(round);

            if (round > 1) {
                currentOutputContent = { id: Agent.genId(), text: "" };
                outputMsg = {
                    ...outputMsg,
                    content: [...outputMsg.content, currentOutputContent],
                };

                if (hook?.saveOutputMessage) {
                    await hook.saveOutputMessage(outputMsg, hookContext);
                }
            }

            let llmMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

            for (const m of conversationMessages) {
                const list = await modelMessagesToOpenAI(m);
                llmMessages = [...llmMessages, ...list];
            }

            const messageProgressCallback = (message: ProcessingModelContent) => {

                const render_content = this.renderContent(message.content);

                const { reasoning, text, metadata } = render_content;

                const formatError = metadata?.formatError ?? false;

                if (!formatError) {
                    currentOutputContent = { ...currentOutputContent, reasoning, text: text ?? currentOutputContent.text };
                    syncCurrentOutputContent();
                    AgentRuntimeEvents.emitMessageContent(outputId, render_content);
                    hook?.onStreamContent?.(render_content, hookContext);
                }
            }

            const props = await this.genProps(agentContext);
            if (roundLimitMessageSent) {
                props.toolChoice = 'none';
            }
            AgentRuntimeEvents.emitPromptUpdated(this.name());

            console.log("llmMessages:", llmMessages);
            const result = await generateLM(props, llmMessages, messageProgressCallback, options.abortController?.signal);
            const { id, content } = result;
            const partId = id ?? AgentCommon.genId();
            const resultText = normalizeText(content.text ?? '');
            const normalizedReasoning = result.content?.reasoning;
            const normalizedStopReason = result.stop_reason;
            content.text = resultText;

            if (resultText.length > 0) {
                currentOutputContent = { ...currentOutputContent, reasoning: normalizedReasoning, text: resultText };
                syncCurrentOutputContent();
                if (hook?.saveOutputMessage) {
                    await hook.saveOutputMessage(outputMsg, hookContext);
                }
            }

            resultBuilder.stopReason = normalizedStopReason ?? undefined;

            conversationMessages = pruneUntilResponseRecords(conversationMessages);

            conversationMessages = conversationMessages.map(c => {
                const { reasoning, ...filtedContent } = c.content;
                return { ...c, content: filtedContent };
            });

            if (currentOutputContent.text) {
                this.logLlmMessageText(agent, threadId, 'assistant', currentOutputContent.text);
            }

            const stop_reason: any = normalizedStopReason ?? "";

            if (stop_reason === 'end_turn') {

                const result_text = readText(content);

                if (result_text.length === 0 && (!content.tools || content.tools.length === 0)) {

                    const continueModelMsg = createUntilResponseUserMessage(msgId, 'continue');

                    conversationMessages = [...conversationMessages, currentOutputAdapter(), continueModelMsg];

                    continue;
                }
                else {
                    if (hook?.validateOutput) {

                        const state = await hook.validateOutput(content, hookContext);

                        if (state.status === 'FORMAT_ERROR') {

                            const replacementText = state.replacementText ?? state.removeMessage;

                            if (replacementText) {
                                currentOutputContent = { ...currentOutputContent, text: replacementText };
                                syncCurrentOutputContent();
                            }

                            const developerMessage = state.developerMessage ?? `Output format error, fix and reply again`;

                            const nextModelMsg = createUntilResponseDeveloperMessage(msgId, developerMessage);

                            conversationMessages = [...conversationMessages, currentOutputAdapter(), nextModelMsg];

                            continue;
                        }
                    }

                    currentOutputContent = await this.transformContent(currentOutputContent, hook, hookContext);
                    syncCurrentOutputContent();
                    if (hook?.saveOutputMessage) {
                        await hook.saveOutputMessage(outputMsg, hookContext);
                    }

                    finalContent = currentOutputContent;

                    break;
                }
            }
            else if (stop_reason === 'max_tokens' || stop_reason === 'model_context_window_exceeded') {

                this.tokenExtended = true;

                const continueModelMsg = createUntilResponseUserMessage(
                    msgId,
                    'continue and pause, reply summary of task.'
                );

                conversationMessages = [...conversationMessages, currentOutputAdapter(), continueModelMsg];

                if (resultText.length === 0) {
                    await dropCurrentOutputContent(hookContext);
                }

                continue;
            }
            else if (stop_reason === 'pause_turn') {
                const continueModelMsg = createUntilResponseUserMessage(msgId, 'continue');

                conversationMessages = [...conversationMessages, currentOutputAdapter(), continueModelMsg];

                if (resultText.length === 0) {
                    await dropCurrentOutputContent(hookContext);
                }

                continue;
            }
            else if (stop_reason === 'tool_use' || (content.tools && content.tools.length > 0)) {
                const props: AgentProps = { threadId, msgId, inputId };
                const tool_calls = content.tools || [];
                const tool_results: ModelTool[] = [];

                if (tool_calls.length > 0) {
                    const tools = await this.tools(agentContext);
                    for (const tc of tool_calls) {
                        const { id, name, input } = tc;
                        let mt = tools.find(ft => ft.name === name);
                        let output: ModelToolResult;

                        console.log("tool " + name + " input:", input);

                        if (mt && mt.executor) {
                            try {
                                output = await mt.executor({ ...props, context, args: input });

                            } catch (e: any) {
                                output = { status: "EXCEPTION", message: `RuntimeError: ${e.message}` };
                            }
                        } else if (this.allowKnownToolFallback) {

                            mt = await findKnownTool(name);

                            if (mt) {
                                const validation = mt.inputSchema.safeParse(input)

                                if (validation.success) {
                                    try {
                                        output = await mt.executor({ ...props, context, args: input });
                                    } catch (e: any) {
                                        output = { status: "EXCEPTION", message: `RuntimeError: ${e.message}` };
                                    }
                                }
                                else {
                                    output = { status: "ARGUMENT_ERROR", message: `tool(${name}) is unloaded. Use loadTools({toolNames:['${name}']}) to load the tool first.` };
                                }
                            }
                            else {
                                output = { status: "ARGUMENT_ERROR", message: `tool(${name}) does not exist.` };
                            }
                        } else {
                            output = { status: "ARGUMENT_ERROR", message: `tool(${name}) is not available from the embedded WebMCP page.` };
                        }

                        console.log("tool " + name + " output:", output);

                        tool_results.push({ id, name, input, output: output });

                        this.logLlmMessageTool(agent, threadId, 'assistant', name, id, input, output);

                        const retention = await this.retentionOfTools(tool_results);;

                        if (this.anyToolResult) {
                            currentOutputContent = { ...currentOutputContent, tools: tool_results, retention };
                            syncCurrentOutputContent();
                            finalContent = currentOutputContent;
                            break;
                        }
                    }
                }

                if (tool_results.length > 0) {
                    const retention = await this.retentionOfTools(tool_results);
                    currentOutputContent = { ...currentOutputContent, tools: tool_results, retention };
                    syncCurrentOutputContent();
                    if (hook?.saveOutputMessage) {
                        await hook.saveOutputMessage(outputMsg, hookContext);
                    }
                }

                if (this._mode === 'tool-router') {
                    currentOutputContent = { ...currentOutputContent, tools: tool_results };
                    syncCurrentOutputContent();
                    finalContent = currentOutputContent;
                    resultBuilder.safetyReject = true;
                    break;
                }
                else {
                    const stepId = AgentCommon.genId();
                    console.log("tool normalizedReasoning:" + normalizedReasoning);
                    const toolResultMsg: ModelMessageContentView = {
                        msgId,
                        id: stepId,
                        role: 'tool',
                        content: {
                            id: partId,
                            tools: tool_results,
                            reasoning: normalizedReasoning
                        }
                    };

                    conversationMessages = [...conversationMessages, toolResultMsg];
                }

                if (resultText.length === 0 && tool_results.length === 0) {
                    await dropCurrentOutputContent(hookContext);
                }

                continue;
            }
            else if (stop_reason === 'refusal') {

                currentOutputContent = { id: currentOutputContent.id, text: "Safety Rejected" }
                syncCurrentOutputContent();

                finalContent = currentOutputContent;

                resultBuilder.safetyReject = true;

                break;
            }
            else if (stop_reason === 'stop_sequence') {

                const stop_sequence = result.stop_sequence;

                currentOutputContent = { id: currentOutputContent.id, text: "STOP_SEQUENCE" }
                syncCurrentOutputContent();

                finalContent = currentOutputContent;

                resultBuilder.stopSequence = stop_sequence || 'default';

                break;
            }
            else {

                finalContent = currentOutputContent;

                break;
            }
        }

        if (this.tokenExtended) {
            resultBuilder.contextOverflow = true;
        }

        const finalResult: ModelResult = {
            ...resultBuilder,
            content: finalContent,
        }

        return finalResult;
    }
}

export class ToolAgent extends Agent {
    constructor(name = "tool-agent") {
        super(name);
        this.setThinking(false);
        this.setToolChoice("none");
    }
}
