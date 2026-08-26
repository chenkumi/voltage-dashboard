/**
 * useLLM — React Hook for LLM Provider
 *
 * 將 LLMProvider 的 WebWorker 通訊封裝為 React 響應式狀態，
 * 提供模型管理、生成、串流、中止等功能。
 */

import {
  LLMProvider,
  getLLMProvider,
  type OnProgressCallback,
  type OnStreamCallback,
} from "@/lib/llm-provider";
import type {
  GenerateMessage,
  GenerateOptions,
  ModelInfo,
  ModelProgressData,
  ProviderError,
} from "@/lib/llm-types";
import { useCallback, useEffect, useRef, useState } from "react";

// ─── 狀態型別 ──────────────────────────────────────────────

export type ModelStatus = "idle" | "downloading" | "loading" | "ready" | "error";
export type GenerateStatus = "idle" | "generating" | "streaming" | "error";

export type UseLLMState = {
  /** 模型狀態 */
  modelStatus: ModelStatus;
  /** 模型下載 / 載入進度（0-100） */
  modelProgress: number;
  /** 當前已載入的 modelId */
  loadedModelId: string | null;
  /** 生成狀態 */
  generateStatus: GenerateStatus;
  /** 串流模式下累積的文字 */
  streamText: string;
  /** 最近一次錯誤 */
  error: ProviderError | null;
};

export type UseLLMActions = {
  /** 取得可用模型清單 */
  listModels: () => Promise<ModelInfo[]>;
  /** 載入模型 */
  loadModel: (
    modelId: string,
    options?: { device?: "webgpu" | "wasm" | "cpu"; dtype?: "q4f16" | "fp32" },
  ) => Promise<void>;
  /** 標準生成（完整回傳） */
  generate: (
    messages: GenerateMessage[],
    options?: Partial<GenerateOptions>,
  ) => Promise<string>;
  /** 串流生成（逐 Token 更新 streamText，並調用選用的 onStream 回呼） */
  generateStream: (
    messages: GenerateMessage[],
    onStream?: OnStreamCallback,
    options?: Partial<Omit<GenerateOptions, "stream">>,
  ) => Promise<string>;
  /** 中止當前生成 */
  abort: () => Promise<void>;
  /** 清除錯誤狀態 */
  clearError: () => void;
  /** 重置串流文字 */
  resetStreamText: () => void;
};

export type UseLLMReturn = UseLLMState & UseLLMActions;

// ─── Hook 實作 ─────────────────────────────────────────────

export function useLLM(): UseLLMReturn {
  const providerRef = useRef<LLMProvider | null>(null);

  const [modelStatus, setModelStatus] = useState<ModelStatus>("idle");
  const [modelProgress, setModelProgress] = useState(0);
  const [loadedModelId, setLoadedModelId] = useState<string | null>(null);
  const [generateStatus, setGenerateStatus] = useState<GenerateStatus>("idle");
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState<ProviderError | null>(null);

  // 取得 Provider 單例
  const getProvider = useCallback((): LLMProvider => {
    if (!providerRef.current) {
      providerRef.current = getLLMProvider();
    }
    return providerRef.current;
  }, []);

  // 元件卸載時不銷毀 Provider（因為是全域單例），僅清除 ref
  useEffect(() => {
    return () => {
      providerRef.current = null;
    };
  }, []);

  // ─── Actions ────────────────────────────────────────────

  const listModels = useCallback(async (): Promise<ModelInfo[]> => {
    try {
      return await getProvider().listModels();
    } catch (err) {
      setError(err as ProviderError);
      return [];
    }
  }, [getProvider]);

  const loadModel = useCallback(
    async (
      modelId: string,
      options?: { device?: "webgpu" | "wasm" | "cpu"; dtype?: "q4f16" | "fp32" },
    ): Promise<void> => {
      setError(null);
      setModelStatus("downloading");
      setModelProgress(0);

      const onProgress: OnProgressCallback = (data: ModelProgressData) => {
        if (data.stage === "DOWNLOADING") {
          setModelStatus("downloading");
          setModelProgress(data.progress ?? 0);
        } else if (data.stage === "LOADING") {
          setModelStatus("loading");
        }
      };

      try {
        await getProvider().loadModel(
          { modelId, device: options?.device, dtype: options?.dtype },
          onProgress,
        );
        setModelStatus("ready");
        setModelProgress(100);
        setLoadedModelId(modelId);
      } catch (err) {
        setModelStatus("error");
        setError(err as ProviderError);
      }
    },
    [getProvider],
  );

  const generate = useCallback(
    async (
      messages: GenerateMessage[],
      options: Partial<GenerateOptions> = {},
    ): Promise<string> => {
      setError(null);
      setGenerateStatus("generating");

      try {
        const result = await getProvider().generate(messages, {
          ...options,
          stream: false,
        });
        setGenerateStatus("idle");
        return result;
      } catch (err) {
        setGenerateStatus("error");
        setError(err as ProviderError);
        return "";
      }
    },
    [getProvider],
  );

  const generateStream = useCallback(
    async (
      messages: GenerateMessage[],
      onStream?: OnStreamCallback,
      options: Partial<Omit<GenerateOptions, "stream">> = {},
    ): Promise<string> => {
      setError(null);
      setStreamText("");
      setGenerateStatus("streaming");

      let accumulated = "";

      try {
        await getProvider().generateStream(
          messages,
          (text: string) => {
            accumulated += text;
            setStreamText(accumulated);
            if (onStream) onStream(text);
          },
          options,
        );

        // accumulated = await getProvider().generate(
        //   messages,
        //   // (text: string) => {
        //   //   accumulated += text;
        //   //   setStreamText(accumulated);
        //   //   if (onStream) onStream(text);
        //   // },
        //   options,
        // );

        // if (onStream) onStream(accumulated);
        console.log("accumulated:", accumulated);

        setGenerateStatus("idle");
        return accumulated;
      } catch (err) {
        setGenerateStatus("error");
        setError(err as ProviderError);
        return accumulated;
      }
    },
    [getProvider],
  );

  const abort = useCallback(async (): Promise<void> => {
    try {
      await getProvider().abort();
      setGenerateStatus("idle");
    } catch (err) {
      setError(err as ProviderError);
    }
  }, [getProvider]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const resetStreamText = useCallback(() => {
    setStreamText("");
  }, []);

  // ─── 回傳 ──────────────────────────────────────────────

  return {
    // State
    modelStatus,
    modelProgress,
    loadedModelId,
    generateStatus,
    streamText,
    error,
    // Actions
    listModels,
    loadModel,
    generate,
    generateStream,
    abort,
    clearError,
    resetStreamText,
  };
}
