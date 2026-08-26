/**
 * LLM Provider 通訊型別定義
 *
 * 定義主執行緒與 WebWorker 之間的完整訊息協定。
 */

import { ModelRole } from "@/app/types";

// ─── 通訊基礎格式 ─────────────────────────────────────────

export type ProviderAction = "LIST_MODELS" | "LOAD_MODEL" | "GENERATE" | "ABORT";

export type ProviderRequest = {
  id: string;
  action: ProviderAction;
  payload: unknown;
};

export type ProviderResponseStatus = "SUCCESS" | "ERROR" | "PROGRESS" | "STREAMING";

export type ProviderError = {
  code: string;
  message: string;
  rootCause?: string;
  suggestedFix?: string;
};

export type ProviderResponse = {
  id: string;
  status: ProviderResponseStatus;
  data?: unknown;
  error?: ProviderError;
};

// ─── 模型管理 ──────────────────────────────────────────────

export type LoadModelPayload = {
  modelId: string;
  device?: "webgpu" | "wasm" | "cpu";
  dtype?: "q4f16" | "fp32";
};

export type ModelProgressStage = "DOWNLOADING" | "LOADING" | "READY";

export type ModelProgressData = {
  stage: ModelProgressStage;
  progress?: number;
};

export type ModelInfo = {
  modelId: string;
  label: string;
  size: string;
};

// ─── 交談訊息與多模態設計 ──────────────────────────────────

export type MessageRole = ModelRole;

export type TextContent = { type: "text"; text: string };
export type ImageContent = { type: "image"; image?: string };
export type AudioContent = { type: "audio"; audio?: string };

export type GenerateMessageContent = TextContent | ImageContent | AudioContent;

export type PromptContent = { type: 'image' } | { type: 'audio' } | { type: 'text', text: string };
export type GeneratePromptMessage = { role: MessageRole, content: string | PromptContent[] };

export type GenerateMessage = {
  role: MessageRole;
  content: string | GenerateMessageContent[];
};

// ─── 生成請求設計 ──────────────────────────────────────────

export type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type GenerateOptions = {
  stream: boolean;
  enable_thinking: boolean;
  max_new_tokens?: number;
  do_sample?: boolean;
  temperature?: number;
  tools?: ToolDefinition[];
};

export type GeneratePayload = {
  messages: GenerateMessage[];
  options: GenerateOptions;
};
