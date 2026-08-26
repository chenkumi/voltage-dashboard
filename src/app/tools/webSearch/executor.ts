import { AgentExecutorProps } from "@/app/agent/agent-common";
import { toolError, toolException, toolSucceed } from '../shared/response';
import { ToolArgs } from "./types";


export interface WebPageValue {
    id: string;
    name: string;
    url: string;
    displayUrl: string;
    snippet: string;
    summary?: string;
    datePublished: string | null;
    dateLastCrawled: string | null;
}

export interface SearchResponse {
    code: number;
    log_id: string;
    msg: string | null;
    data: {
        _type: string;
        queryContext: {
            originalQuery: string;
        };
        webPages: {
            webSearchUrl: string;
            totalEstimatedMatches: number | null;
            value: WebPageValue[];
            someResultsRemoved: boolean;
        };
    };
}

const API_ENDPOINT = "https://api.langsearch.com/v1/web-search";

export async function executor(
    _props: AgentExecutorProps,
    input: ToolArgs,
) {
    const { query, freshness, summary, count } = input;
    const apiKey = import.meta.env.VITE_APP_LANG_SEARCH_API_KEY;

    if (!apiKey) {
        return toolError(
            'LangSearch API Key missing.',
            'Please check environment settings before calling webSearch again.',
            null,
            {
                type: 'CONFIG_ERROR',
                detail: 'VITE_APP_LANG_SEARCH_API_KEY is missing.',
                retryable: false,
            },
        );
    }

    try {
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                query,
                freshness,
                summary,
                count
            })
        });

        if (!response.ok) {
            console.log("web fetch response:", response);
            const errorDetail = await response.text().catch(() => 'No detail available');
            return toolError(
                `LangSearch API returned an error: ${response.statusText}`,
                "Please check the query and API status, and try again later if necessary.",
                null,
                {
                    type: 'HTTP_ERROR',
                    detail: errorDetail,
                    retryable: response.status >= 500,
                    example: 'webSearch(query="latest ai news")',
                },
                response.status,
            );
        }

        const result: SearchResponse = await response.json();

        console.info("WebSearch result:", result);

        if (result.code !== 200) {
            return toolError(
                result.msg || 'API execution failed',
                "Please adjust the query or try again later.",
                null,
                {
                    type: 'API_ERROR',
                    detail: JSON.stringify(result),
                    retryable: true,
                    example: 'webSearch(query="latest ai news")',
                },
                result.code,
            );
        }

        // Transform output format for better readability by the agent
        const formattedResults = result.data.webPages.value.map(page => ({
            title: page.name,
            link: page.url,
            snippet: page.snippet,
            summary: page.summary,
            published_date: page.datePublished
        }));

        return toolSucceed(
            "Web search successful.",
            {
                results: formattedResults,
                search_url: result.data.webPages.webSearchUrl,
                total_matches: result.data.webPages.totalEstimatedMatches
            },
            "Prioritize using results for answers; if summaries are insufficient, use webReader to read specific pages.",
        );

    } catch (error: any) {
        return toolException(
            `Web Search execution failed: ${error.message}`,
            "Check network status and API settings before trying again.",
            null,
            {
                type: 'FETCH_FAILURE',
                detail: error.message,
                retryable: true,
                example: 'webSearch(query="latest ai news")',
            },
        );
    }
}