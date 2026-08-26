import { z } from 'zod';

export const InputSchema = z.object({
});

export type ToolArgs = z.infer<typeof InputSchema>;