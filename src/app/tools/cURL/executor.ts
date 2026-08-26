import { AgentExecutorProps } from "@/app/agent/agent-common";
import { parseJson } from "@/app/assistant/utils/json-util";
import { toolError, toolException, toolSucceed } from "../shared/response";
import { ToolArgs } from "./types";

/**
 * Define which Content-Types should be treated as plain text.
 * Includes common development files, configuration files, and API formats.
 */
const TEXTUAL_MIME_TYPES = new Set([
    'text/plain',
    'text/html',
    'text/css',
    'text/javascript',
    'text/markdown',
    'text/csv',
    'text/xml',
    'application/json',
    'application/xml',
    'application/xhtml+xml',
    'application/javascript',
    'application/typescript',
    'application/x-yaml',
    'application/yaml',
    'application/rtf',
    'application/sql',
    'image/svg+xml' // SVG 雖然是圖片，但本質是 XML 文本
]);

/**
 * Helper function to check if a content type is textual
 */
function isTextualType(contentType: string): boolean {
    // Remove possible encoding info, e.g., "application/json; charset=utf-8" -> "application/json"
    const pureType = contentType.split(';')[0].toLowerCase().trim();

    // 1. Direct lookup in table
    if (TEXTUAL_MIME_TYPES.has(pureType)) return true;

    // 2. Extra handling for custom types with +json or +xml suffixes (e.g., application/ld+json)
    if (pureType.endsWith('+json') || pureType.endsWith('+xml')) return true;

    return false;
}

export async function executor(
    _props: AgentExecutorProps,
    input: ToolArgs,
    robot_compatible_mode: boolean = true
) {
    const { url, method = 'GET', headers = {}, body, timeout = 30000 } = input;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            method,
            headers,
            body: ['GET', 'HEAD'].includes(method) ? undefined : body,
            signal: controller.signal,
        });

        clearTimeout(timer);

        // Get Content-Type, default to unknown binary if not present
        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        const isText = isTextualType(contentType);

        // Error handling: directly return the failure reason (do not generate result ourselves)
        if (!response.ok) {
            const errorDetail = await response.text().catch(() => 'No detail available');
            return toolError(
                `Remote server returned an error: ${response.statusText}`,
                "Check if URL, method, headers, or body are correct; retry later if it's a temporary error.",
                null,
                {
                    type: 'HTTP_ERROR',
                    detail: errorDetail,
                    retryable: response.status >= 500,
                    example: 'cURL(url="https://example.com", method="GET")',
                },
                response.status,
            );
        }

        let finalData: any;

        if (robot_compatible_mode) {
            if (isText) {
                // Text mode processing
                const text = await response.text();
                if (contentType.includes('application/json')) {
                    try {
                        finalData = parseJson(text); // Try parsing as JSON object
                    } catch {
                        finalData = text;
                    }
                } else {
                    finalData = text;
                }
            } else {
                // Binary mode processing: convert to Data URL
                const buffer = await response.arrayBuffer();
                const base64 = Buffer.from(buffer).toString('base64');
                finalData = `data:${contentType.split(';')[0]};base64,${base64}`;
            }
        } else {
            // Non-robot compatible mode (raw return)
            finalData = contentType.includes('application/json') ? await response.json() : await response.text();
        }

        return toolSucceed(
            "HTTP request completed successfully.",
            {
                body: finalData,
                headers: Object.fromEntries(response.headers.entries()),
                status: response.status,
            },
            "Continue based on data content; if data is insufficient, adjust URL, method, or headers and call again.",
            response.status,
        );

    } catch (error: any) {
        clearTimeout(timer);
        // Based on your instruction: if tool does not exist or fails, answer the failure reason directly
        return toolException(
            `Tool execution failed: ${error.message}`,
            error.name === 'AbortError'
                ? "Shorten the request content, extend the timeout, or try again later."
                : "Check the URL, network status, and CORS restrictions, then try again.",
            null,
            {
                type: error.name === 'AbortError' ? 'TIMEOUT' : 'FETCH_FAILURE',
                detail: error.message,
                retryable: true,
                example: 'cURL(url="https://example.com", method="GET")',
            },
            error.name === 'AbortError' ? 408 : 500,
        );
    }
}
