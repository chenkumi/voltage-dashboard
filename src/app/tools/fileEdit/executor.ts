import { AgentExecutorProps } from "@/app/agent/agent-common";
import { decodeContent, FileManager, fs, PathUtils } from "../../system/files";
import { ToolArgs } from "./types";

export async function executor(
    _props: AgentExecutorProps,
    input: ToolArgs,
) {
    const resolvedPath = PathUtils.normalize(input.file_path);

    if (!FileManager.verifyFilePath(resolvedPath)) {
        return { success: false, error: `Security Error: Access denied for path: ${resolvedPath}` };
    }

    try {
        if (!FileManager.hasFileBeenRead(resolvedPath)) {
            return {
                success: false,
                error: "Causal Lock Error: The file must be read before editing to ensure an exact match."
            };
        }

        const rawOriginal = await fs.readFile(resolvedPath);
        const original = decodeContent(rawOriginal);
        const parts = original.split(input.old_string);

        if (!input.replace_all && parts.length !== 2) {
            return {
                success: false,
                error: `Ambiguity Error: Found ${parts.length - 1} matches; editing cannot proceed without a unique match.`
            };
        }

        const updated = original.split(input.old_string).join(input.new_string);
        await fs.writeFile(resolvedPath, updated);

        return {
            success: true,
            path: resolvedPath,
            matches_replaced: parts.length - 1
        };
    } catch (e: any) {
        return { success: false, error: `Execution failed: ${e.message}` };
    }
}