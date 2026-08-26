import { AgentExecutorProps } from "@/app/agent/agent-common";
import { toolBlocked, toolException, toolNotFound, toolSucceed } from "../shared/response";
import { decodeContent, FileManager, fs, PathUtils } from "../../system/files";
import { ToolArgs } from "./types";


export async function executor(
    _props: AgentExecutorProps,
    input: ToolArgs,
) {
    const safeArgs = input;
    const requestedPath = PathUtils.normalize(safeArgs.file_path);

    if (!FileManager.verifyFilePath(requestedPath)) {
        return toolBlocked(
            `Access denied for path: ${requestedPath}`,
            "Please retry readFile using an allowed virtual file system path.",
            { file_path: requestedPath },
            {
                type: "SECURITY_ERROR",
                detail: `Access denied: ${requestedPath}`,
                retryable: true,
                example: 'readFile(file_path="root/README.md")',
            },
            403,
        );
    }

    try {
        const resolvedPath = await FileManager.resolvePath(requestedPath);
        if (!resolvedPath) {
            return toolNotFound(
                `File not found: ${requestedPath}`,
                "Verify if the file_path is correct. Mounted skill/document folders are searched first, then root.",
                { file_path: requestedPath, mountedPaths: FileManager.getPaths() },
                {
                    type: "FILE_NOT_FOUND",
                    detail: `File not found: ${requestedPath}`,
                    retryable: true,
                    example: 'readFile(file_path="root/README.md")',
                },
            );
        }

        const rawData = await fs.readFile(resolvedPath);
        const raw = decodeContent(rawData);
        const lines = raw.split(/\r?\n/);
        const start = safeArgs.offset || 0;
        const end = start + safeArgs.limit;

        const sliced = lines.slice(start, end).map((line, i) => {
            const lineNum = (start + i + 1).toString().padStart(5);
            return `${lineNum} \t ${line.slice(0, 2000)}`;
        });

        FileManager.markFileAsRead(resolvedPath);

        return toolSucceed(
            "File read successfully.",
            {
                path: resolvedPath,
                content: sliced.join("\n"),
                total_lines: lines.length,
                has_more: lines.length > end,
                info: lines.length > end ? `(Remaining ${lines.length - end} lines not shown)` : "Reached end of file"
            },
            lines.length > end
                ? "If more content is needed, increase the offset and call readFile again."
                : "Reached end of file; proceed based on the content.",
        );
    } catch (e: any) {
        return toolException(
            `Failed to read file: ${e.message}`,
            "Check if the file_path is correct or try again later.",
            { file_path: requestedPath },
            {
                type: "READ_FILE_EXCEPTION",
                detail: e.message,
                retryable: true,
                example: 'readFile(file_path="root/README.md")',
            },
        );
    }
}
