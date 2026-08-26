/**
 * LLM WebWorker — 負責 Transformers.js 的載入與呼叫
 *
 * 職責：
 * 1. 接收來自主執行緒的 ProviderRequest 訊息
 * 2. 管理模型生命週期（載入、釋放）
 * 3. 執行生成（標準 / 串流）
 * 4. 支援中止（AbortController）
 */

import {
    AutoProcessor,
    Gemma4ForConditionalGeneration,
    load_image,
    read_audio,
    TextStreamer,
    type Tensor,
} from "@huggingface/transformers";

import type {
    GenerateMessage,
    GeneratePayload,
    LoadModelPayload,
    ModelProgressData,
    ProviderRequest,
    ProviderResponse
} from "@/lib/llm-types";

// ─── 內部狀態 ──────────────────────────────────────────────

let processor: Awaited<ReturnType<typeof AutoProcessor.from_pretrained>> | null = null;
let model: Awaited<ReturnType<typeof Gemma4ForConditionalGeneration.from_pretrained>> | null = null;
let currentModelId: string | null = null;
let abortController: AbortController | null = null;

// ─── 工具函式 ──────────────────────────────────────────────

function respond(msg: ProviderResponse) {
    self.postMessage(msg);
}

function respondError(id: string, code: string, message: string, rootCause?: string, suggestedFix?: string) {
    respond({
        id,
        status: "ERROR",
        error: { code, message, rootCause, suggestedFix },
    });
}

/**
 * 從 ChatMessage[] 中提取多模態媒體來源（image / audio）
 * 回傳位置引數陣列，與 processor(prompt, ...media) 對齊
 */
async function extractInputs(messages: GenerateMessage[]) {
    const images: any[] = [];
    const audios: any[] = [];
    const cleanMessages: { role: string; content: string }[] = [];

    for (const msg of messages) {
        let textContent = "";

        if (Array.isArray(msg.content)) {
            for (const part of msg.content) {
                if (part.type === "text" && part.text) {
                    textContent += (textContent ? "\n" : "") + part.text;
                } else if (part.type === "image" && part.image) {
                    try {
                        images.push(await load_image(part.image));
                    } catch (e) { console.error("Image load failed:", e); }
                } else if (part.type === "audio" && part.audio) {
                    try {
                        //@ts-ignore
                        audios.push(await read_audio(part.audio, undefined));
                    } catch (e) { console.error("Audio load failed:", e); }
                }
            }
        } else {
            textContent = String(msg.content);
        }

        cleanMessages.push({ role: msg.role, content: textContent });
    }

    return {
        cleanMessages,
        promptImages: images.length > 0 ? images : null,
        promptAudios: audios.length > 0 ? audios : null
    };
}

// ─── Action Handlers ───────────────────────────────────────

async function handleListModels(id: string) {
    // 目前僅支援 Gemma 4 系列，回傳靜態清單
    respond({
        id,
        status: "SUCCESS",
        data: [
            { modelId: "onnx-community/gemma-4-E2B-it-ONNX", label: "Gemma 4 E2B", size: "2B" },
            { modelId: "onnx-community/gemma-4-E4B-it-ONNX", label: "Gemma 4 E4B", size: "4B" },
        ],
    });
}

async function handleLoadModel(id: string, payload: LoadModelPayload) {
    const { modelId, device = "webgpu", dtype = "q4f16" } = payload;

    // 若已載入相同模型，直接回報 READY
    if (currentModelId === modelId && processor && model) {
        respond({ id, status: "SUCCESS", data: { stage: "READY" } satisfies ModelProgressData });
        return;
    }

    try {
        // 階段 1：下載 / 載入 Processor
        respond({ id, status: "PROGRESS", data: { stage: "DOWNLOADING", progress: 0 } satisfies ModelProgressData });

        processor = await AutoProcessor.from_pretrained(modelId);

        // 階段 2：下載 / 載入 Model
        model = await Gemma4ForConditionalGeneration.from_pretrained(modelId, {
            dtype: dtype as "q4f16" | "fp32",
            device: device as "webgpu" | "wasm" | "cpu",
            progress_callback: (info: Record<string, unknown>) => {
                if (info.status === "progress_total") {
                    const progress = typeof info.progress === "number" ? Math.round(info.progress) : 0;
                    respond({
                        id,
                        status: "PROGRESS",
                        data: { stage: "DOWNLOADING", progress } satisfies ModelProgressData,
                    });
                }
            },
        });

        currentModelId = modelId;

        respond({ id, status: "SUCCESS", data: { stage: "READY" } satisfies ModelProgressData });
    } catch (err) {
        // Fail fast：封裝錯誤
        const errMsg = err instanceof Error ? err.message : String(err);
        const isOOM = errMsg.toLowerCase().includes("oom") || errMsg.toLowerCase().includes("out of memory");
        const isWebGPU = errMsg.toLowerCase().includes("webgpu") || errMsg.toLowerCase().includes("context lost");

        respondError(
            id,
            isOOM ? "OOM" : isWebGPU ? "WEBGPU_ERROR" : "LOAD_FAILED",
            `模型載入失敗：${errMsg}`,
            isOOM ? "記憶體不足 (Out of Memory)" : isWebGPU ? "WebGPU context loss" : errMsg,
            isOOM || isWebGPU ? "降低量化級別至 q4f16 或改用 wasm/cpu backend" : undefined,
        );

        // 清理失敗的載入
        processor = null;
        model = null;
        currentModelId = null;
    }
}

async function handleGenerate(id: string, payload: GeneratePayload) {
    if (!processor || !model) {
        console.error("尚未載入模型，請先呼叫 LOAD_MODEL。");
        respondError(id, "MODEL_NOT_LOADED", "尚未載入模型，請先呼叫 LOAD_MODEL。");
        return;
    }

    abortController = new AbortController();

    try {
        const { messages, options } = payload;
        const {
            stream = false,
            enable_thinking = false,
            max_new_tokens = 512,
            do_sample = false,
            temperature = 1.0,
            tools,
        } = options;



        // 1. 提取多模態資源與清理消息格式
        const { cleanMessages, promptImages, promptAudios } = await extractInputs(messages);
        console.log("cleanMessages:", cleanMessages);
        console.log("promptImages:", promptImages);
        console.log("promptAudios:", promptAudios);
        // 2. 套用 Chat Template (使用清理後的純文字消息)
        let prompt: string;
        try {
            const templateOptions: Record<string, unknown> = {
                add_generation_prompt: true,
                tokenize: false,
                //@ts-ignore (某些模型需要特定的 multimodal 參數)
                has_images: !!promptImages,
            };

            if (enable_thinking) {
                templateOptions.enable_thinking = true;
            }

            if (tools && tools.length > 0) {
                templateOptions.tools = tools;
            }

            prompt = processor.apply_chat_template(cleanMessages, templateOptions) as string;
        } catch (templateErr) {
            const errMsg = templateErr instanceof Error ? templateErr.message : String(templateErr);
            console.error(`Chat template 處理失敗：${errMsg}`);
            respondError(
                id,
                "TEMPLATE_ERROR",
                `Chat template 處理失敗：${errMsg}`,
                `Template missing for option (enable_thinking=${enable_thinking}, tools=${!!tools})`,
                "確認模型版本支援所需的 template 功能，或停用 enable_thinking / tools。",
            );
            return;
        }

        console.info("Final Prompt:", prompt);

        // 3. 編碼輸入
        const inputs = await processor(prompt, promptImages, promptAudios, {
            add_special_tokens: false,
        });

        const tokenCount = inputs.input_ids.dims.at(-1) || 0;
        console.log("Encoded input_ids dims:", inputs.input_ids.dims);
        console.log("Input token count:", tokenCount);

        // Fail fast: 確保 input_ids 不為空，避免 WebGPU dispatch (0, 1, 1) 錯誤
        if (tokenCount === 0) {
            throw new Error("模型輸入編碼後為空：請確認 Prompt 是否包含有效文字。");
        }

        console.log("inputs:", inputs);
        console.log("stream:", stream);

        // 3. 生成
        if (stream) {

            console.info("stream mode");
            let output = "";
            // ─── 串流模式 ─────────────────────────────────
            const streamer = new TextStreamer(processor.tokenizer!, {
                skip_prompt: true,
                skip_special_tokens: false,
                callback_function: (text: string) => {
                    // console.log("stream:", text);
                    output += text;
                    console.log("stream:", output);
                    if (!abortController?.signal.aborted) {
                        respond({ id, status: "STREAMING", data: text });
                    }
                },
            });

            await model.generate({
                ...inputs,
                max_new_tokens, // max output token
                do_sample,
                temperature: do_sample ? temperature : undefined,
                streamer,
            });

            if (!abortController.signal.aborted) {
                respond({ id, status: "SUCCESS", data: null });
            }
        } else {
            console.info("standard mode");
            // ─── 標準模式 ─────────────────────────────────
            const outputs = await model.generate({
                ...inputs,
                max_new_tokens,
                do_sample,
                temperature: do_sample ? temperature : undefined,
            }) as Tensor;

            console.log("outputs:", outputs);

            // 裁切 Prompt 部分
            const trimmedOutputs = outputs.slice(null, [inputs.input_ids.dims.at(-1), null]);

            const decoded = processor.batch_decode(trimmedOutputs, {
                skip_special_tokens: false,
            });

            console.log("normal:", decoded);

            respond({ id, status: "SUCCESS", data: decoded[0] });
        }
    } catch (err) {
        console.error("generate error:", err);
        if (abortController?.signal.aborted) {
            respond({ id, status: "SUCCESS", data: null });
            return;
        }

        const errMsg = err instanceof Error ? err.message : String(err);
        const isOOM = errMsg.toLowerCase().includes("oom") || errMsg.toLowerCase().includes("out of memory");

        console.error(`生成失敗：${errMsg}`);

        respondError(
            id,
            isOOM ? "OOM" : "GENERATE_FAILED",
            `生成失敗：${errMsg}`,
            isOOM ? "記憶體不足 (Out of Memory)" : errMsg,
            isOOM ? "降低 max_new_tokens 或使用較小的模型" : undefined,
        );
    } finally {
        abortController = null;
    }
}

function handleAbort(id: string) {
    if (abortController) {
        abortController.abort();
        respond({ id, status: "SUCCESS", data: null });
    } else {
        respond({ id, status: "SUCCESS", data: null });
    }
}

// ─── 訊息監聽器 ────────────────────────────────────────────

self.addEventListener("message", async (event: MessageEvent<ProviderRequest>) => {
    const { id, action, payload } = event.data;
    console.log("worker receive message:", action, payload);

    switch (action) {
        case "LIST_MODELS":
            await handleListModels(id);
            break;
        case "LOAD_MODEL":
            await handleLoadModel(id, payload as LoadModelPayload);
            break;
        case "GENERATE":
            await handleGenerate(id, payload as GeneratePayload);
            break;
        case "ABORT":
            handleAbort(id);
            break;
        default:
            respondError(id, "UNKNOWN_ACTION", `未知的 action：${action}`);
    }
});
