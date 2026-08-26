import { z } from 'zod';

export const InputSchema = z.object({
    cmd: z.string(),
});

export type ToolArgs = z.infer<typeof InputSchema>;