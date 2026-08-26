import { AgentExecutorProps } from "@/app/agent/agent-common";
import { toolBlocked, toolException, toolSucceed } from "../shared/response";
import { decodeContent, FileManager, fs, PathUtils, recursiveReaddir } from "../../system/files";
import { ToolArgs } from "./types";

export async function executor(
    _props: AgentExecutorProps,
    input: ToolArgs,
) {
    const safeArgs = input;
    const resolvedPath = PathUtils.normalize(safeArgs.path || "");

    if (!FileManager.verifyFilePath(resolvedPath)) {
        return toolBlocked(
            `拒絕存取路徑: ${resolvedPath}`,
            "請改用允許的虛擬檔案系統路徑重新呼叫 grepSearchFile。",
            { path: resolvedPath, pattern: safeArgs.pattern },
            {
                type: "SECURITY_ERROR",
                detail: `Access denied: ${resolvedPath}`,
                retryable: true,
                example: 'grepSearchFile(path="root", pattern="TODO")',
            },
            403,
        );
    }

    try {
        const allFiles = await recursiveReaddir(resolvedPath);
        const results: any[] = [];
        const regex = new RegExp(safeArgs.pattern, safeArgs.multiline ? "gm" : "g");

        for (const f of allFiles) {
            const rawContent = await fs.readFile(f);
            const content = decodeContent(rawContent);
            if (regex.test(content)) {
                if (safeArgs.output_mode === "files_with_matches") {
                    results.push(f);
                } else {
                    results.push({ path: f, preview: content.slice(0, 100) });
                }
            }
        }

        const payload = safeArgs.output_mode === "count"
            ? { count: results.length }
            : safeArgs.output_mode === "files_with_matches"
                ? { files_with_matches: results }
                : { results };

        return toolSucceed(
            "內容搜尋成功。",
            {
                path: resolvedPath,
                pattern: safeArgs.pattern,
                output_mode: safeArgs.output_mode,
                ...payload,
            },
            "根據搜尋結果繼續下一步；若沒有結果，請調整 pattern 或 path 後重試。",
        );
    } catch (e: any) {
        return toolException(
            `內容搜尋失敗: ${e.message}`,
            "檢查 path 與 pattern 是否正確，或稍後再試一次。",
            { path: resolvedPath, pattern: safeArgs.pattern },
            {
                type: "GREP_SEARCH_EXCEPTION",
                detail: e.message,
                retryable: true,
                example: 'grepSearchFile(path="root", pattern="TODO")',
            },
        );
    }
}