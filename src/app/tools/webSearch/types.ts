import { z } from 'zod';

export const InputSchema = z.object({
    query: z.string().describe("Search keywords"),
    freshness: z.enum(['oneDay', 'oneWeek', 'oneMonth', 'oneYear', 'noLimit']).default('noLimit').optional().describe("Time range for search results"),
    summary: z.boolean().default(true).optional().describe("Whether to include detailed content summaries"),
    count: z.number().int().min(1).max(10).default(10).optional().describe("Number of search results to return (1-10)"),
});


export type ToolArgs = z.infer<typeof InputSchema>;