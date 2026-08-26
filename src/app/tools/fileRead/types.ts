import { z } from 'zod';

export const InputSchema = z.object({
    file_path: z.string().describe("Absolute path of the file."),
    offset: z.number().optional().default(0).describe("Starting line number for reading, used for segmented reading of large files."),
    limit: z.number().optional().default(2000).describe("Limit on the number of lines to read to prevent token overflow. Default is 2000.")
});


export type ToolArgs = z.infer<typeof InputSchema>;