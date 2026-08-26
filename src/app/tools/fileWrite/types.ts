import { z } from 'zod';

export const InputSchema = z.object({
    path: z.string().describe("Absolute path of the file."),
    content: z.string().describe("The full text content to write to the file.")
});

export type ToolArgs = z.infer<typeof InputSchema>;