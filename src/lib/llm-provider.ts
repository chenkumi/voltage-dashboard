/**
 * LLM Provider 管理層
 *
 * 職責：
 * 1. 建立並管理 WebWorker 實例
 * 2. 提供 Promise-based API 封裝 Worker 訊息通訊
 * 3. 支援串流回呼與進度事件
 * 4. 實作請求 ID 追蹤與生命週期管理
 */

import type {
  GenerateMessage,
  GenerateOptions,
  GeneratePayload,
  LoadModelPayload,
  ModelInfo,
  ModelProgressData,
  ProviderAction,
  ProviderError,
  ProviderRequest,
  ProviderResponse,
} from "@/lib/llm-types";
import { ulid } from "ulid";

// ─── 回呼型別 ──────────────────────────────────────────────

export type OnProgressCallback = (data: ModelProgressData) => void;
export type OnStreamCallback = (text: string) => void;
export type OnErrorCallback = (error: ProviderError) => void;

type PendingRequest = {
  resolve: (data: unknown) => void;
  reject: (error: ProviderError) => void;
  onProgress?: OnProgressCallback;
  onStream?: OnStreamCallback;
};

// ─── LLMProvider Class ────────────────────────────────────

export class LLMProvider {
  private worker: Worker;
  private pending = new Map<string, PendingRequest>();
  private disposed = false;

  constructor() {
    this.worker = new Worker(
      new URL("../workers/llm.worker.ts", import.meta.url),
      { type: "module" },
    );
    this.worker.addEventListener("message", this.handleMessage);
    this.worker.addEventListener("error", this.handleWorkerError);
  }

  // ─── 公開 API ──────────────────────────────────────────

  /**
   * 取得可用模型清單
   */
  async listModels(): Promise<ModelInfo[]> {
    const data = await this.send("LIST_MODELS");
    return data as ModelInfo[];
  }

  /**
   * 載入模型
   *
   * @param payload 模型載入參數（modelId, device, dtype）
   * @param onProgress 進度回呼，接收 ModelProgressData
   * @returns 最終回傳包含 stage: "READY" 的資料
   */
  async loadModel(
    payload: LoadModelPayload,
    onProgress?: OnProgressCallback,
  ): Promise<ModelProgressData> {
    const data = await this.send("LOAD_MODEL", payload, { onProgress });
    return data as ModelProgressData;
  }

  /**
   * 標準生成（非串流）
   *
   * @param messages 對話歷史
   * @param options 生成參數
   * @returns 完整生成結果字串
   */
  async generate(
    messages: GenerateMessage[],
    options: Partial<GenerateOptions> = {},
  ): Promise<string> {
    const payload: GeneratePayload = {
      messages,
      options: {
        stream: false,
        enable_thinking: false,
        ...options,
      },
    };
    const data = await this.send("GENERATE", payload);
    return data as string;
  }

  /**
   * 串流生成
   *
   * @param messages 對話歷史
   * @param onStream 每次收到 token 片段時的回呼
   * @param options 生成參數（stream 固定為 true）
   */
  async generateStream(
    messages: GenerateMessage[],
    onStream: OnStreamCallback,
    options: Partial<Omit<GenerateOptions, "stream">> = {},
  ): Promise<void> {
    const payload: GeneratePayload = {
      messages,
      options: {
        stream: true,
        enable_thinking: false,
        ...options,
      },
    };
    await this.send("GENERATE", payload, { onStream });
  }

  /**
   * 中止當前生成
   */
  async abort(): Promise<void> {
    await this.send("ABORT");
  }

  /**
   * 銷毀 Worker 實例並清理所有待處理請求
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    // 拒絕所有待處理請求
    for (const [, pending] of this.pending) {
      pending.reject({
        code: "DISPOSED",
        message: "LLMProvider 已被銷毀。",
      });
    }
    this.pending.clear();

    this.worker.removeEventListener("message", this.handleMessage);
    this.worker.removeEventListener("error", this.handleWorkerError);
    this.worker.terminate();
  }

  // ─── 內部實作 ──────────────────────────────────────────

  private send(
    action: ProviderAction,
    payload?: unknown,
    callbacks?: { onProgress?: OnProgressCallback; onStream?: OnStreamCallback },
  ): Promise<unknown> {
    if (this.disposed) {
      return Promise.reject({
        code: "DISPOSED",
        message: "LLMProvider 已被銷毀，無法傳送新請求。",
      } satisfies ProviderError);
    }

    return new Promise((resolve, reject) => {
      const id = ulid();

      this.pending.set(id, {
        resolve,
        reject,
        onProgress: callbacks?.onProgress,
        onStream: callbacks?.onStream,
      });

      const request: ProviderRequest = { id, action, payload };
      this.worker.postMessage(request);
    });
  }

  private handleMessage = (event: MessageEvent<ProviderResponse>) => {
    const { id, status, data, error } = event.data;
    const pending = this.pending.get(id);

    if (!pending) return;

    switch (status) {
      case "PROGRESS":
        pending.onProgress?.(data as ModelProgressData);
        // PROGRESS 為中間狀態，不結算 Promise
        break;

      case "STREAMING":
        pending.onStream?.(data as string);
        // STREAMING 為中間狀態，不結算 Promise
        break;

      case "SUCCESS":
        this.pending.delete(id);
        pending.resolve(data);
        break;

      case "ERROR":
        this.pending.delete(id);
        pending.reject(error!);
        break;
    }
  };

  private handleWorkerError = (event: ErrorEvent) => {
    // Worker 本身的未捕獲錯誤：拒絕所有待處理請求
    const error: ProviderError = {
      code: "WORKER_ERROR",
      message: `WebWorker 發生未捕獲錯誤：${event.message}`,
      rootCause: event.filename ? `${event.filename}:${event.lineno}` : undefined,
    };

    for (const [id, pending] of this.pending) {
      pending.reject(error);
      this.pending.delete(id);
    }
  };
}

// ─── Singleton 存取 ────────────────────────────────────────

let providerInstance: LLMProvider | null = null;

/**
 * 取得全域 LLMProvider 單例
 */
export function getLLMProvider(): LLMProvider {
  if (!providerInstance) {
    providerInstance = new LLMProvider();
  }
  return providerInstance;
}

/**
 * 銷毀全域 LLMProvider 單例
 */
export function disposeLLMProvider(): void {
  if (providerInstance) {
    providerInstance.dispose();
    providerInstance = null;
  }
}
