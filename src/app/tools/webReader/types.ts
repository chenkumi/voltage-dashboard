import { z } from 'zod';

export const InputSchema = z.object({
    url: z.string().describe("The URL of the web page to read"),
});

export type ToolArgs = z.infer<typeof InputSchema>;