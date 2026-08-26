import OpenAI from 'openai';
import { parseJson } from '../assistant/utils/json-util';
import { ModelOutputSchema, ProcessingModelContent } from '../types';
// const jaison = require('jaison');

export type GenerateProps = {
    model: string,
    baseURL?: string | null,
    authToken?: string | null,
    apiKey?: string,
    systemInstruction?: string | (() => string) | (() => Promise<string>),
    firstPrompt?: string | (() => string) | (() => Promise<string>),
    maxTokens?: number,
    budgetTokens?: number,
    thinking?: boolean,
    tools?: OpenAI.Chat.ChatCompletionTool[],
    toolChoice?: 'none' | 'any' | 'auto' | { toolName: string },
    toolParallel?: boolean,
    jsonOutputSchema?: ModelOutputSchema | null,
};

export const generateLM = async (
    props: GenerateProps,
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    progressCallback?: (processingMessage: ProcessingModelContent) => void,
    signal?: AbortSignal,
): Promise<ProcessingModelContent> => {
    const client = new OpenAI({
        baseURL: props.baseURL || undefined,
        apiKey: props.apiKey || props.authToken || "no-key-provided",
        dangerouslyAllowBrowser: true,
    });

    let system_instruction = null;
    if (props.systemInstruction) {
        if (typeof props.systemInstruction === 'function') {
            system_instruction = await props.systemInstruction();
        }
        else {
            system_instruction = props.systemInstruction;
        }
    }

    // console.log('system_instruction:' , system_instruction);

    let first_prompt = null;
    if (props.firstPrompt) {
        if (typeof props.firstPrompt === 'function') {
            first_prompt = await props.firstPrompt();
        }
        else {
            first_prompt = props.firstPrompt;
        }
    }

    console.log('first_prompt:' , first_prompt);

    const messageQueue: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (system_instruction) {
        messageQueue.push({ role: 'system', content: system_instruction });
    }
    if (first_prompt) {
        messageQueue.push({ role: 'user', content: first_prompt });
    }
    messageQueue.push(...messages);

    const model = props.model;

    const params: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
        stream: true,
        model,
        messages: messageQueue,
    };

    if (props.maxTokens) {
        params.max_completion_tokens = props.maxTokens;
    }

    if (props.thinking) {
        params.reasoning_effort = 'medium';
    }

    if (props.tools && props.tools.length > 0) {
        params.tools = props.tools;
        const toolChoice = props.toolChoice ?? 'auto';
        const toolParallel = props.toolParallel ?? true;

        if (toolChoice === 'none') {
            params.tool_choice = 'none';
        }
        else if (toolChoice === 'any') {
            params.tool_choice = 'required';
            params.parallel_tool_calls = toolParallel;
        }
        else if (toolChoice === 'auto') {
            params.tool_choice = 'auto';
            params.parallel_tool_calls = toolParallel;
        }
        else {
            params.tool_choice = { type: 'function', function: { name: toolChoice.toolName } };
            params.parallel_tool_calls = toolParallel;
        }
    }

    const outputSchema = props.jsonOutputSchema;
    if (outputSchema) {
        const { type, properties, required, additionalProperties } = outputSchema;
        params.response_format = {
            type: 'json_schema',
            json_schema: {
                name: 'response',
                strict: true,
                schema: {
                    type,
                    properties,
                    required,
                    additionalProperties: additionalProperties ?? false,
                }
            }
        };
    }

    const stream = await client.chat.completions.create(params, { signal });

    let processingMessage: ProcessingModelContent = {
        streaming: true,
        role: 'assistant',
        content: { id: "", text: "", tools: [] }
    };

    let textContent = "";
    let reasoningContent = "";
    const toolsMap = new Map<number, { id: string, name: string, arguments: string }>();

    const updateContent = () => {
        const content: any = {
            text: textContent,
            reasoning: reasoningContent,
            tools: []
        };

        const sortedIndices = Array.from(toolsMap.keys()).sort((a, b) => a - b);
        for (const index of sortedIndices) {
            const t = toolsMap.get(index)!;
            let parsedInput = {};
            try {
                if (t.arguments) {
                    parsedInput = parseJson(t.arguments) ?? {};
                }
            } catch (e) {
                // partial json, ignore during stream
            }
            content.tools.push({
                id: t.id,
                name: t.name,
                input: parsedInput,
                output: null
            });
        }

        if (!content.text) delete content.text;
        if (!content.reasoning) delete content.reasoning;
        if (content.tools.length === 0) delete content.tools;

        processingMessage.content = content;
    };

    let notify = false;

    for await (const chunk of stream) {
        notify = false;
        
        const choice = chunk.choices[0];

        if (!choice) continue;

        const delta = choice.delta;

        if (delta.content) {
            textContent += delta.content;
            if ( textContent.length>10) {
                notify = true;
            }
        }
        
        if ((delta as any).reasoning_content) {
            reasoningContent += (delta as any).reasoning_content;
            notify = true;
        }

        if (delta.tool_calls && delta.tool_calls.length > 0) {
            for (const toolCall of delta.tool_calls) {
                const index = toolCall.index;
                if (!toolsMap.has(index)) {
                    toolsMap.set(index, { id: toolCall.id || "", name: toolCall.function?.name || "", arguments: "" });
                }
                const existing = toolsMap.get(index)!;
                if (toolCall.id) existing.id = toolCall.id;
                if (toolCall.function?.name) existing.name = toolCall.function.name;
                if (toolCall.function?.arguments) existing.arguments += toolCall.function.arguments;
            }
            notify = true;
        }

        if (notify) {
            updateContent();
            if (progressCallback) {
                progressCallback(processingMessage);
            }
        }
        
        if (choice.finish_reason) {
            processingMessage.streaming = false;
            let stop_reason: string = choice.finish_reason;
            // Map finish_reason to match Anthropic's expected stop_reasons (used in agent/index.ts)
            if (stop_reason === 'stop') stop_reason = 'end_turn';
            else if (stop_reason === 'tool_calls') stop_reason = 'tool_use';
            else if (stop_reason === 'length') stop_reason = 'max_tokens';

            processingMessage.stop_reason = stop_reason as any;
        }
    }

    updateContent();
    processingMessage.streaming = false;

    if (progressCallback) {
        progressCallback(processingMessage);
    }

    return processingMessage;
}
