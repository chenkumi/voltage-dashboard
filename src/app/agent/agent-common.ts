import { monotonicFactory } from "ulid";
import { ModelContent, ModelMessageContentView, ModelOutputSchema, ModelResult, ModelThreadMessage } from "../types";

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
    _tools: ToolsFormat = [];
    maxTokens: number = 16384;
    maxExtendedTokens: number = 32768;
    maxInternalRounds: number = 9;
    tokenExtended: boolean = false;
    budgetTokens: number = 2048;
    jsonOutputSchema: ModelOutputSchema | null = null;
    thinking: boolean = true;
    toolChoice: 'none' | 'auto' | 'any' | { toolName: string } = 'auto';
    contentTransform: AgentContentTransform | null = null;
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

    public setTools(tl: ToolsFormat) {
        this._tools = tl;
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

    public abstract generate(options: AgentGenerateOptions): Promise<ModelResult>;

}
