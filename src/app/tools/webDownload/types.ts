import { z } from 'zod';

export const InputSchema = z.object({
    url: z.string().describe("The URL of the file to download"),
    filename: z.string().optional().describe("The filename to save as (optional, automatically extracted from URL if not provided)"),
});

export type ToolArgs = z.infer<typeof InputSchema>;