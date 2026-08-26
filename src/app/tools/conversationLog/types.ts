import { z } from 'zod';

export const InputSchema = z.object({
    query: z.string().min(1).describe("Query for the folded conversation records."),
});

export type ToolArgs = z.infer<typeof InputSchema>;
