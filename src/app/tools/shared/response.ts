import type { ZodTypeAny } from "zod";

export type ToolStatusCode =
    | "succeed"
    | "loaded"
    | "already_loaded"
    | "partial"
    | "arguments_error"
    | "not_found"
    | "blocked"
    | "error"
    | "exception";

export type ToolErrorInfo = {
    type: string,
    detail?: string,
    retryable: boolean,
    inputSchema?: unknown,
    invalidArguments?: unknown,
    example?: string,
};

export type ToolResponse<TData = unknown> = {
    status: ToolStatusCode,
    message: string,
    next: string,
    code: number,
    data: TData | null,
    error: ToolErrorInfo | null,
};

const schemaHintFromShape = (shape: Record<string, unknown>) => {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(shape)) {
        const candidate = value as { isOptional?: () => boolean; _def?: { typeName?: string } };
        const typeName = candidate?._def?.typeName?.replace(/^Zod/, "").toLowerCase() || "unknown";
        const optional = typeof candidate?.isOptional === "function" && candidate.isOptional();
        result[key] = optional ? `${typeName}?` : typeName;
    }
    return result;
};

export const buildInputSchemaHint = (schema: ZodTypeAny) => {
    const objectSchema = schema as unknown as { shape?: Record<string, unknown> };
    if (objectSchema?.shape) {
        return schemaHintFromShape(objectSchema.shape);
    }
    return undefined;
};

export const buildToolExample = (toolName: string, sampleArgs: Record<string, unknown>) => {
    const entries = Object.entries(sampleArgs).map(([key, value]) => {
        if (typeof value === "string") {
            return `${key}="${value}"`;
        }
        return `${key}=${JSON.stringify(value)}`;
    });
    return `${toolName}(${entries.join(", ")})`;
};

const createResponse = <TData>(response: ToolResponse<TData>) => response;

export const toolSucceed = <TData>(message: string, data: TData, next = "任務已完成，可繼續下一步。", code = 200) =>
    createResponse<TData>({
        status: "succeed",
        message,
        next,
        code,
        data,
        error: null,
    });

export const toolLoaded = <TData>(message: string, data: TData, next: string, code = 200) =>
    createResponse<TData>({
        status: "loaded",
        message,
        next,
        code,
        data,
        error: null,
    });

export const toolAlreadyLoaded = <TData>(message: string, data: TData, next: string, code = 409) =>
    createResponse<TData>({
        status: "already_loaded",
        message,
        next,
        code,
        data,
        error: null,
    });

export const toolPartial = <TData>(message: string, data: TData, next: string, error: ToolErrorInfo | null = null, code = 206) =>
    createResponse<TData>({
        status: "partial",
        message,
        next,
        code,
        data,
        error,
    });

export const toolBlocked = <TData>(message: string, next: string, data: TData | null, error: ToolErrorInfo, code = 409) =>
    createResponse<TData>({
        status: "blocked",
        message,
        next,
        code,
        data,
        error,
    });

export const toolNotFound = <TData>(message: string, next: string, data: TData | null, error: ToolErrorInfo, code = 404) =>
    createResponse<TData>({
        status: "not_found",
        message,
        next,
        code,
        data,
        error,
    });

export const toolError = <TData>(message: string, next: string, data: TData | null, error: ToolErrorInfo, code = 500) =>
    createResponse<TData>({
        status: "error",
        message,
        next,
        code,
        data,
        error,
    });

export const toolException = <TData>(message: string, next: string, data: TData | null, error: ToolErrorInfo, code = 500) =>
    createResponse<TData>({
        status: "exception",
        message,
        next,
        code,
        data,
        error,
    });

export const toolArgumentsError = (
    toolName: string,
    schema: ZodTypeAny,
    invalidArguments: unknown,
    detail?: string,
    exampleArgs?: Record<string, unknown>,
) => createResponse({
    status: "arguments_error",
    message: "工具參數格式錯誤。",
    next: "請依照 inputSchema 修正參數後重新呼叫此工具。",
    code: 400,
    data: null,
    error: {
        type: "INVALID_ARGUMENTS",
        detail,
        retryable: true,
        inputSchema: buildInputSchemaHint(schema),
        invalidArguments,
        example: exampleArgs ? buildToolExample(toolName, exampleArgs) : undefined,
    },
});
