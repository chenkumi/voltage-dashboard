import { AgentExecutorProps } from "@/app/agent/agent-common";
import { toolError, toolException, toolSucceed } from "../shared/response";
import { ToolArgs } from "./types";


export async function executor(
    _props: AgentExecutorProps,
    input: ToolArgs,
) {
    const { url } = input;
    const apiKey = import.meta.env.VITE_APP_GINA_API_KEY;

    if (!apiKey) {
        return toolError(
            'Jina Reader API Key missing.',
            'Please check environment settings before calling webReader again.',
            null,
            {
                type: 'CONFIG_ERROR',
                detail: 'VITE_APP_GINA_API_KEY is missing.',
                retryable: false,
            },
        );
    }

    try {
        const response = await fetch(`https://r.jina.ai/${url}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Accept': 'text/markdown'
            }
        });

        if (!response.ok) {
            return toolError(
                `Jina Reader API returned an error: ${response.status} ${response.statusText}`,
                "Check if the URL is readable or try again later.",
                null,
                {
                    type: 'HTTP_ERROR',
                    detail: `status=${response.status}`,
                    retryable: response.status >= 500,
                    example: 'webReader(url="https://example.com")',
                },
                response.status,
            );
        }

        const markdown = await response.text();
        return toolSucceed(
            "Web page read successful.",
            { markdown },
            "Proceed based on the markdown content; if it's incomplete, consider reading other URLs.",
        );
    } catch (error: any) {
        return toolException(
            `Web Reader execution failed: ${error.message}`,
            "Check the URL and network status before trying again.",
            null,
            {
                type: 'FETCH_FAILURE',
                detail: error.message,
                retryable: true,
                example: 'webReader(url="https://example.com")',
            },
        );
    }
}