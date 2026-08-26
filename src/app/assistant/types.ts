export type AgentReplyOption = string;

export type AgentReplyType = "MESSAGE" | "FINAL";

export type AgentReplyMode = "continue" | "input" | "final";

export type AgentReplyContent = {
    type: AgentReplyType,
    mode: AgentReplyMode,
    message: string,
    options?: AgentReplyOption[],
};

export type AgentContentMetadata = {
    type: AgentReplyType,
    responseMode?: AgentReplyMode,
    formatError?: boolean,
    options?: AgentReplyOption[],
};
