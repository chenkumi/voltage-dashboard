import { z } from 'zod';

/**
 * Parameter definitions for the AI bot (business logic parameters only)
 */
export const InputSchema = z.object({
    url: z.url()
        .describe("Target URL address, must include http or https"),
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH'])
        .default('GET')
        .describe("HTTP request method"),

    headers: z.record(z.string(), z.string())
        .optional()
        .describe("HTTP Header object, e.g., {'Authorization': 'Bearer ...'}"),

    body: z.string()
        .optional()
        .describe("Request body content. If POST JSON, pass the stringified JSON"),

    timeout: z.number()
        .int()
        .min(1000)
        .max(60000)
        .default(30000)
        .describe("Timeout duration (ms), default is 30000ms")
});

export type ToolArgs = z.infer<typeof InputSchema>;