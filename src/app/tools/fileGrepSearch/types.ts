import { z } from 'zod';

export const InputSchema = z.object({
    path: z.string().default('root').optional().describe("Search folder, default=\"/root\""),
    pattern: z.string().describe("Regular expression for filename"),
    output_mode: z.enum(["content", "files_with_matches", "count"]).default("files_with_matches").describe("Output mode：content(show contents) , files_with_matches(path only), count(match count)"),
    multiline: z.boolean().default(false).describe("If enable regex multiline match")
});

export type ToolArgs = z.infer<typeof InputSchema>;