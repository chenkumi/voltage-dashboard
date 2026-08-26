import { CacheManager, VIRTUAL_PREFIX } from "@/lib/cache-manager";
import { monotonicFactory } from "ulid";
import { parseJson } from "../assistant/utils/json-util";
import { chatDb } from "../db";
import { ModelContent, ModelLog, ModelMessage, ModelMessageContentView, ModelOutputSchema, ModelResult, ModelTool, ModelThreadMessage } from "../types";
import { flattenMessages, getLatestContent, readText } from "./utils";

const _gen = monotonicFactory();

export type AgentProps = {
    threadId: string
    msgId: string,
    inputId: string,
}

export type AgentExecutorProps = AgentProps & {
    context?:AgentRuntimeContext,
    args: any,
};

export type AgentExecutor = (props:AgentExecutorProps) => any | Promise<any>;

/**
 * AgentTool metadata is split by prompt responsibility:
 * - description: what the tool can do.
 * - prompt: when the agent should use the tool.
 * - roles: detailed capability boundaries.
 * - rules: usage constraints and ordering rules.
 * - examples: concrete call examples.
 */
export type AgentTool = {
    name: string,
    description?: string,
    prompt?: string,
    roles?: string[],
    rules?: string[],
    examples?: string[],
    inputSchema: any,
    executor: AgentExecutor,
};

export type AgentRuntimeContext = Map<string,any>;

export type AgentContext = {
    threadId?: string,
    runtimeContext?: AgentRuntimeContext,
};

export type PromptFormat = string | string[] | ((context?: AgentContext) => string) | ((context?: AgentContext) => Promise<string>) | ((context?: AgentContext) => string[]) | ((context?: AgentContext) => Promise<string[]>);

export type SystemInstructionFormat = PromptFormat;

export type FirstPromptFormat = PromptFormat;

export type ToolsFormat = AgentTool[] | ((context?: AgentContext) => AgentTool[]) | ((context?: AgentContext) => Promise<AgentTool[]>);

export type AgentUserInputPreparation = (input: ModelContent, context?: AgentContext) => void | Promise<void>;

export type AgentMode = 'agent' | 'tool-router';

export type AgentHookContext = {
    agent: string,
    threadId: string,
    msgId: string,
    segmentId: string,
    inputId: string,
    round: number,
    context?: Map<string,any>,
};

export type AgentContentTransform = (message: ModelContent) => ModelContent;

export type AgentContentRender = AgentContentTransform;

export type AgentToolsRetentionDetector = ((tools: ModelTool[]) => 'keep' | 'until-response' | undefined) | ((tools: ModelTool[]) => Promise<'keep' | 'until-response' | undefined>);

export type AgentOutputValidation = {
    status: "OK",
} | {
    status: "FORMAT_ERROR",
    replacementText?: string,
    removeMessage?: string,
    developerMessage?: string,
};

export const mergePromptSections = (sections: string[]) => {
    return sections
        .map(section => section.trim())
        .filter(section => section.length > 0)
        .join('\n\n');
};

export const resolvePromptFormat = async (prompt: PromptFormat, context?: AgentContext) => {
    const resolved = typeof prompt === 'function' ? await prompt(context) : prompt;
    if (Array.isArray(resolved)) {
        return mergePromptSections(resolved);
    }

    return typeof resolved === 'string' ? resolved.trim() : '';
};

export const pruneUntilResponseRecords = <T extends { content: ModelContent }>(records: T[]) => {
    return records.filter(record => record.content.retention !== 'until-response');
};

export const createUntilResponseUserMessage = (msgId: string, text: string): ModelMessageContentView=> ({
    msgId,
    id: AgentCommon.genId(),
    role: 'user',
    content: { id: AgentCommon.genId(), text, retention: 'until-response' }
});

export const createUntilResponseDeveloperMessage = (msgId: string, text: string): ModelMessageContentView=> ({
    msgId,
    id: AgentCommon.genId(),
    role: 'developer',
    content: { id: AgentCommon.genId(), text, retention: 'until-response' }
});

export const normalizeTextualToolInput = (value: unknown) => {
    if (value === undefined || value === null) {
        return {};
    }

    if (typeof value === 'string') {
        return parseJson(value) ?? {};
    }

    return value;
};

export const normalizeTextualToolCall = (value: unknown): ModelTool | null => {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const candidate = value as Record<string, unknown>;
    const type = typeof candidate.type === 'string' ? candidate.type.toUpperCase() : '';
    if (type !== 'TOOL_CALL') {
        return null;
    }

    const name = typeof candidate.tool_name === 'string'
        ? candidate.tool_name
        : typeof candidate.name === 'string'
            ? candidate.name
            : typeof candidate.tool === 'string'
                ? candidate.tool
                : '';

    if (!name) {
        return null;
    }

    const id = typeof candidate.tool_call_id === 'string'
        ? candidate.tool_call_id
        : typeof candidate.id === 'string'
            ? candidate.id
            : AgentCommon.genId();

    const input = normalizeTextualToolInput(
        candidate.input ?? candidate.arguments ?? candidate.parameters ?? candidate.args
    );

    return { id, name, input };
};

export const extractTextualToolCalls = (content: ModelContent): ModelTool[] | null => {
    if (content.tools && content.tools.length > 0) {
        return content.tools;
    }

    const text = readText(content).trim();
    if (!text) {
        return null;
    }

    const parsed = parseJson(text);
    if (!parsed) {
        return null;
    }

    if (Array.isArray(parsed)) {
        const tools = parsed
            .map(normalizeTextualToolCall)
            .filter((tool): tool is ModelTool => tool !== null);
        return tools.length > 0 ? tools : null;
    }

    if (typeof parsed === 'object' && parsed !== null) {
        const candidate = parsed as Record<string, unknown>;
        if (Array.isArray(candidate.tool_calls)) {
            const tools = candidate.tool_calls
                .map(normalizeTextualToolCall)
                .filter((tool): tool is ModelTool => tool !== null);
            if (tools.length > 0) {
                return tools;
            }
        }
    }

    const directToolCall = normalizeTextualToolCall(parsed);
    return directToolCall ? [directToolCall] : null;
};

export type AgentHook = {
    prepareInputMessages?: (messages: ModelMessageContentView[], context: AgentHookContext) => ModelMessageContentView[] | Promise<ModelMessageContentView[]>;
    prepareInputMessage?: (messages: ModelMessageContentView[]) => ModelMessageContentView[] | Promise<ModelMessageContentView[]>;
    transformContent?: (message: ModelContent, context: AgentHookContext) => ModelContent | Promise<ModelContent>;
    saveOutputMessage?: (message: ModelThreadMessage, context: AgentHookContext) => Promise<void>;
    removeOutputMessage?: (id: string, context: AgentHookContext) => Promise<void>;
    validateOutput?: (message: ModelContent, context: AgentHookContext) => AgentOutputValidation | Promise<AgentOutputValidation>;
    onStreamContent?: (message: ModelContent, context: AgentHookContext) => void | Promise<void>;
}

export type AgentGenerateOptions = {
    threadId: string,
    msgId: string,
    segmentId: string,
    context?: AgentRuntimeContext,
    historyMessages: ModelMessageContentView[],
    inputMessage: ModelMessageContentView,
    hook?: AgentHook,
    abortController?: AbortController,
    outputMessageId?: string,
};

export abstract class AgentCommon {

    _name: string;
    _systemInstruction: SystemInstructionFormat = "";
    _firstPrompt: FirstPromptFormat = "";
    _activeSkillPrompt: FirstPromptFormat = "";
    _tools: ToolsFormat = [];
    _mode: AgentMode = 'agent';
    maxTokens: number = 16384;
    maxExtendedTokens: number = 32768;
    maxInternalRounds: number = 9;
    tokenExtended: boolean = false;
    budgetTokens: number = 2048;
    jsonOutputSchema: ModelOutputSchema | null = null;
    thinking: boolean = true;
    toolChoice: 'none' | 'auto' | 'any' | { toolName: string } = 'auto';
    anyToolResult: boolean = false; // stop when get any tool result
    contentTransform: AgentContentTransform | null = null;
    toolsRetentionDetector: AgentToolsRetentionDetector | null = null;
    allowKnownToolFallback = true;
    userInputPreparation: AgentUserInputPreparation | null = null;

    constructor(name: string) {
        this._name = name
    }

    public static genId() {
        return _gen()
    }

    public name() {
        return this._name;
    }

    public setToolsRetentionDetector(detector: AgentToolsRetentionDetector) {
        this.toolsRetentionDetector = detector;
    }

    public setKnownToolFallback(value: boolean) {
        this.allowKnownToolFallback = value;
    }

    public setUserInputPreparation(preparation: AgentUserInputPreparation | null) {
        this.userInputPreparation = preparation;
    }

    public async prepareForUserInput(input: ModelContent, context?: AgentContext) {
        await this.userInputPreparation?.(input, context);
    }

    public setContentTransform(transform: AgentContentTransform) {
        this.contentTransform = transform;
    }

    public setContentRender(render: AgentContentRender) {
        this.setContentTransform(render);
    }

    public renderContent(content: ModelContent) {
        if (!this.contentTransform) {
            return content;
        }

        return this.contentTransform(content);
    }

    public async transformContent(content: ModelContent, hook?: AgentHook, context?: AgentHookContext) {
        let nextContent = this.contentTransform
            ? await this.contentTransform(content)
            : content;

        if (hook?.transformContent && context) {
            nextContent = await hook.transformContent(nextContent, context);
        }

        return nextContent;
    }

    public setSystemInstruction(s: SystemInstructionFormat) {
        this._systemInstruction = s;
    }

    public setFirstPrompt(prompt: FirstPromptFormat) {
        this._firstPrompt = prompt;
    }

    public setActiveSkillPrompt(prompt: FirstPromptFormat) {
        this._activeSkillPrompt = prompt;
    }

    public setTools(tl: ToolsFormat) {
        this._tools = tl;
    }

    public setAnyToolResult(value: boolean) {
        this.anyToolResult = value;
    }

    public setMaxToken(n: number) {
        this.maxTokens = n;
    }

    public setMaxInternalRounds(n: number) {
        this.maxInternalRounds = Math.max(1, Math.floor(n));
    }

    public setJsonOutputSchema(schema: ModelOutputSchema) {
        this.jsonOutputSchema = schema;
    }

    public setThinking(thinking: boolean) {
        this.thinking = thinking;
    }

    public setToolChoice(choice: 'none' | 'auto' | 'any' | { toolName: string }) {
        this.toolChoice = choice;
    }

    public setMode(mode: AgentMode) {
        this._mode = mode;
    }

    public async tools(context?: AgentContext): Promise<AgentTool[]> {
        if (!this._tools) return [];
        return typeof this._tools === 'function' ? await this._tools(context) : this._tools;
    }

    public async systemInstruction(context?: AgentContext) {
        return resolvePromptFormat(this._systemInstruction, context);
    }

    public async firstPrompt(context?: AgentContext) {
        return resolvePromptFormat(this._firstPrompt, context);
    }

    public async activeSkillPrompt(context?: AgentContext) {
        return resolvePromptFormat(this._activeSkillPrompt, context);
    }

    public async resolveVirtualAssets(messages: ModelMessage[]): Promise<ModelMessage[]> {
        const resolvedMessages = [...messages];
        for (let i = 0; i < resolvedMessages.length; i++) {
            const m = resolvedMessages[i];
            const content = getLatestContent(m.content);
            if (content.images) {
                const resolvedImages: string[] = [];
                for (const img of content.images) {
                    if (img.startsWith(VIRTUAL_PREFIX)) {
                        const dataUrl = await CacheManager.resolveToDataUrl(img);
                        resolvedImages.push(dataUrl || img);
                    } else {
                        resolvedImages.push(img);
                    }
                }
                resolvedMessages[i] = {
                    ...m,
                    content: flattenMessages([m]).map(adapter => adapter.content).map(part => part.id === content.id ? {
                        ...part,
                        images: resolvedImages
                    } : part)
                };
            }
        }
        return resolvedMessages;
    }

    public generatePrompt(threadId: string, text: string) {
        const msgId = AgentCommon.genId();
        const inputId = AgentCommon.genId();
        const outputId = AgentCommon.genId();

        const msg: ModelMessageContentView= {
            msgId,
            id: inputId,
            role: 'user',
            content: { id: "MSG_01", text },
        }

        return this.generate({
            threadId,
            msgId,
            segmentId: outputId,
            historyMessages: [],
            inputMessage: msg,
        });
    }

    public abstract generate(options: AgentGenerateOptions): Promise<ModelResult>;

    public async cleanMessages(agent: string, threadId: string) {
        await chatDb.contentLogs.where('[threadId+agent]').equals([threadId, agent]).delete();
    }

    public async logLlmMessageText(
        agent: string,
        threadId: string,
        role: 'user' | 'assistant',
        text: string,
    ) {
        const saveLog: ModelLog = {
            id: AgentCommon.genId(),
            agent,
            threadId,
            role,
            metadata: { type: 'text', text },
        };

        await chatDb.contentLogs.put(saveLog);
    }

    public async logLlmMessageTool(
        agent: string,
        threadId: string,
        role: 'user' | 'assistant',
        name: string,
        toolCallId: string,
        input: any,
        output: any,
    ) {
        const saveLog: ModelLog = {
            id: AgentCommon.genId(),
            agent,
            threadId,
            role,
            metadata: { type: 'tool', toolCallId, name, input, output },
        };

        await chatDb.contentLogs.put(saveLog);
    }

    public async retentionOfTools(tools: ModelTool[]): Promise<'keep' | 'until-response' | undefined> {
        if (this.toolsRetentionDetector) {
            return await this.toolsRetentionDetector(tools);
        }
        return undefined;
    }
}
