import { z } from 'zod';

export const InputSchema = z.object({
    cmd: z.enum(['CURRENT_TIME', 'OS']).describe("執行指令"),
    args: z.array(z.string()).optional().describe("附加參數陣列")
});

export type ToolArgs = z.infer<typeof InputSchema>;