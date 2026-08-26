import { z } from 'zod';

export const InputSchema = z.object({
    path: z.string().optional().default('root').describe("Search folder, default=\"/root\""),
    pattern: z.string().describe("Glob pattern (ex: **/*.ts) for filename")
});

export type ToolArgs = z.infer<typeof InputSchema>;