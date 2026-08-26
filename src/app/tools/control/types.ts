import { z } from 'zod';

export const InputSchema = z.object({
    state: z.enum(["continue", 'progress']).describe("Control state"),
});

export type ToolArgs = z.infer<typeof InputSchema>;