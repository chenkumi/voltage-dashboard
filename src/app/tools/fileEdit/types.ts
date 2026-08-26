import { z } from 'zod';

export const InputSchema = z.object({
    file_path: z.string().describe("Absolute path of the file."),
    old_string: z.string().describe("The exact string in the file to be replaced."),
    new_string: z.string().describe("The new string to replace with."),
    replace_all: z.boolean().default(false).describe("Whether to replace all occurrences of old_string. If false, old_string must be unique.")
});

export type ToolArgs = z.infer<typeof InputSchema>;