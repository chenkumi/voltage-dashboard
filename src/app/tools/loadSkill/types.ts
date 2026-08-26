import { z } from 'zod';

export const InputSchema = z.object({
    skillName: z.string().describe("Skill Name"),
});

export type ToolArgs = z.infer<typeof InputSchema>;
