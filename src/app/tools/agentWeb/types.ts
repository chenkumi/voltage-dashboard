import { z } from 'zod';

export const InputSchema = z.object({
    cmd: z.string().optional(),
});

export type ToolArgs = z.infer<typeof InputSchema>;