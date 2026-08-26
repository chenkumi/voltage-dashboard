import { z } from "zod";

export const InputSchema = z.object({
    toolNames: z.array(z.string().min(1))
        .min(1)
        .describe("Names of tools to load from tool_registry."),
});

export type ToolArgs = z.infer<typeof InputSchema>;
