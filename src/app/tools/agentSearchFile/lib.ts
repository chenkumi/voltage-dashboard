import { decodeContent } from "@/lib/utils";
import fs from 'indexeddb-fs';

/**
 * 瀏覽器環境的路徑處理工具
 */
export const PathUtils = {
    normalize(path: string): string {
        if (!path) return "root";
        // 移除多餘的斜線
        let normalized = path.replace(/[\\/]+/g, "/");
        // 確保不以斜線結尾 (除非是根目錄)
        if (normalized.length > 1 && normalized.endsWith("/")) {
            normalized = normalized.slice(0, -1);
        }
        // indexeddb-fs 的路徑通常不以 / 開頭，而是直接從 root 開始
        if (normalized.startsWith("/")) {
            normalized = normalized.slice(1);
        }
        return normalized || "root";
    },

    join(...parts: string[]): string {
        return this.normalize(parts.filter(Boolean).join("/"));
    },

    basename(path: string): string {
        return path.split("/").pop() || "";
    }
};

/**
 * 遞迴讀取目錄下的所有檔案
 */
export async function recursiveReaddir(dirPath: string): Promise<string[]> {
    const results: string[] = [];
    try {
        const { files, directories } = await fs.readDirectory(dirPath);

        // 加入目前的檔案
        for (const file of files) {
            results.push(file.fullPath);
        }

        // 遞迴讀取子目錄
        for (const dir of directories) {
            const subFiles = await recursiveReaddir(dir.fullPath);
            results.push(...subFiles);
        }
    } catch (e) {
        console.warn(`Failed to read directory ${dirPath}:`, e);
    }
    return results;
}

/**
 * 將 Glob 模式轉換為正則表達式
 */
export function globToRegex(pattern: string): RegExp {
    const escaped = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&') // 轉義正則特殊字元
        .replace(/\*\*/g, '(.+)')           // ** 匹配任何字元（包括斜線）
        .replace(/\*/g, '([^/]*)')          // * 匹配除了斜線以外的字元
        .replace(/\?/g, '(.)');             // ? 匹配單一字元
    return new RegExp(`^${escaped}$`);
}

type VirtialFile = {
    path: string,
    description?: string,
}

class VirtualFileManager {
    _files: VirtialFile[] = [];

    public verifyFilePath(path: string) {
        // 在瀏覽器環境，我們暫時允許所有位於虛擬 FS 內的路徑
        console.log("verifyFile: ", path);
        return true;
    }

    public findFile(path: string) {
        return this._files.find(f => f.path === PathUtils.normalize(path));
    }

    public markFileAsRead(path: string, description?: string) {
        const normalized = PathUtils.normalize(path);
        if (!this.findFile(normalized)) {
            this._files.push({ path: normalized, description });
        }
    }

    public hasFileBeenRead(path: string) {
        return !!this.findFile(path);
    }
}

export const FileManager = new VirtualFileManager();
export { decodeContent, fs };

