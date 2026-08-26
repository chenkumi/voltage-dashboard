import { AgentExecutorProps } from "@/app/agent/agent-common";
import { FileManager, fs, PathUtils } from "../../system/files";
import { ToolArgs } from "./types";

export async function executor(
    _props: AgentExecutorProps,
    input: ToolArgs,
) {
    const resolvedPath = PathUtils.normalize(input.path);

    if (!FileManager.verifyFilePath(resolvedPath)) {
        return { success: false, error: `Security Error: Access denied for path: ${resolvedPath}` };
    }

    try {
        // Automatically create non-existent directories in the path
        const parts = resolvedPath.split("/");
        let currentPath = "";
        for (let i = 0; i < parts.length - 1; i++) {
            currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
            if (!(await fs.exists(currentPath))) {
                await fs.createDirectory(currentPath);
            }
        }

        // To satisfy Causal Lock, mark as read if it's a new file
        if (!(await fs.exists(resolvedPath))) {
            FileManager.markFileAsRead(resolvedPath);
        }

        if (!FileManager.hasFileBeenRead(resolvedPath)) {
            return {
                success: false,
                error: "Causal Lock Error: The file must be read before writing to ensure version consistency."
            };
        }

        await fs.writeFile(resolvedPath, input.content);
        return { success: true, path: resolvedPath };
    } catch (e: any) {
        return { success: false, error: `Execution failed: ${e.message}` };
    }
}