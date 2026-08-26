import { z } from "zod";

export const InputSchema = z.object({
    scriptName: z.string().describe("Script filename without .js, resolved under the active skill folder or scripts folder."),
    args: z.record(z.string(), z.unknown()).optional().default({}).describe("Arguments passed to the skill script."),
});

export type ToolArgs = z.infer<typeof InputSchema>;
