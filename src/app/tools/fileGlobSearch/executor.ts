import { AgentExecutorProps } from "@/app/agent/agent-common";
import { toolBlocked, toolException, toolSucceed } from "../shared/response";
import { FileManager, globToRegex, PathUtils, recursiveReaddir } from "../../system/files";
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
            "請改用允許的虛擬檔案系統路徑重新呼叫 globSearchFile。",
            { path: resolvedPath, pattern: safeArgs.pattern },
            {
                type: "SECURITY_ERROR",
                detail: `Access denied: ${resolvedPath}`,
                retryable: true,
                example: 'globSearchFile(path="root", pattern="**/*.ts")',
            },
            403,
        );
    }

    try {
        const allFiles = await recursiveReaddir(resolvedPath);
        const regex = globToRegex(safeArgs.pattern);
        const matchedFiles = allFiles.filter(f => {
            const relativePath = f.startsWith(resolvedPath) ? f.slice(resolvedPath.length).replace(/^\//, '') : f;
            return regex.test(relativePath) || regex.test(f);
        });

        return toolSucceed(
            "檔名搜尋成功。",
            {
                path: resolvedPath,
                pattern: safeArgs.pattern,
                files: matchedFiles,
                total_matches: matchedFiles.length,
            },
            "根據 files 結果挑選檔案後繼續下一步；若沒有結果，請調整 pattern 後重試。",
        );
    } catch (e: any) {
        return toolException(
            `檔名搜尋失敗: ${e.message}`,
            "檢查 path 與 pattern 是否正確，或稍後再試一次。",
            { path: resolvedPath, pattern: safeArgs.pattern },
            {
                type: "GLOB_SEARCH_EXCEPTION",
                detail: e.message,
                retryable: true,
                example: 'globSearchFile(path="root", pattern="**/*.ts")',
            },
        );
    }
}