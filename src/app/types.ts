export type ModelThread = {
    id: string,
    pin?: 0 | 1,
    title: string,
    customTitle?: string,
    createdAt: number,
}

export type ModelOutputSchema = {
    type: 'object',
    properties: any,
    required?: string[],
    additionalProperties?: boolean,
}

export type ModelToolResult = object;

export type AgentSegmentState = {
    id: string,
    threadId: string,
    agentName: string,
    segmentId: string,
    status: "running" | "final",
    activeSkill?: { name: string, path: string, inlineId: string },
    createdAt: number,
    updatedAt: number,
    finalizedAt?: number,
};

export type ModelTool = {
    id: string,
    name: string,
    input?: any,
    output?: any,
}

export type ModelContentRetention = 'keep' | 'until-response';

export type ModelMessageState = 'log' | 'input' | 'output';

export type ModelRole = 'user' | 'assistant' | 'system' | 'tool' | 'developer';

/**
 * 訊息內容的最小可組合單位。
 *
 * 一則 ModelMessage 可以包含多個 content block，用來保留同一段交談內的串流、
 * tool round-trip、自我修正等中間結果。Provider 與 UI 不應自行發明另一套內容形狀。
 */
export type ModelContent = {
    id: string,
    reasoning?: string,
    text?: string,
    value?: string,
    images?: string[], // image url array
    audios?: string[], // audio url array
    tools?: ModelTool[],
    metadata?: any;
    retention?: ModelContentRetention, // default = keep
};

export type ModelResult = {
    msgId: string,
    stopReason?: string,
    stopSequence?: string,
    safetyReject?: boolean,
    contextOverflow?: boolean,
    content?: ModelContent,
}

export type ModelMessageIdentity = {
    msgId: string,
    id: string,
};

export type ModelMessageEnvelope = ModelMessageIdentity & {
    role: ModelRole,
};

/**
 * Canonical message model。
 *
 * 這是 provider、runtime、storage 共用的訊息模型；content 一律是陣列。
 * 需要單一 content 的場景請使用 ModelMessageContentView，而不是改變 canonical shape。
 */
export type ModelMessage = ModelMessageEnvelope & {
    content: ModelContent[],
};

/**
 * Runtime/provider 使用的單一 content 投影。
 *
 * 歷史名稱 ModelMessageContentView仍保留相容，但新程式優先使用 ModelMessageContentView。
 */
export type ModelMessageContentView = ModelMessageEnvelope & {
    messageId?: string,
    content: ModelContent,
};

export type ModelThreadScope = {
    threadId: string,
    segmentId: string,
    state: ModelMessageState,
    createdAt: number,
};

export type ModelThreadMessage = ModelMessage & ModelThreadScope;

/**
 * UI list 使用的展平 view。
 *
 * 保留 ModelContent 欄位展開是為了相容既有 UI；canonical 資料仍以 content block 表達。
 */
export type ModelThreadMessageContentView = ModelMessageEnvelope & ModelThreadScope & ModelContent & {
    messageId: string,
    contentId: string,
    content: ModelContent,
    number: number,
    last:boolean,
};

export type ModelThreadMessagePart = ModelThreadMessageContentView;

export type ProcessingModelContent = {
    id?: string,
    role: 'assistant',
    streaming: boolean,
    content: ModelContent;
    usage?: any,
    stop_reason?: string | null;
    stop_sequence?: string | null;
};

export type ModelLogMetadata =
    {
        type: 'text', text: string
    } | {
        type: 'tool', toolCallId: string, name: string, input: any, output: any
    };

export type ModelLog = {
    id: string,
    threadId: string,
    agent: string,
    role: 'user' | 'assistant',
    metadata: ModelLogMetadata,
};
