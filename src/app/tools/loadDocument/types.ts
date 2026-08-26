import { z } from "zod";

export const InputSchema = z.object({
    documentPath: z.string().describe("Document path"),
});

export type ToolArgs = z.infer<typeof InputSchema>;
