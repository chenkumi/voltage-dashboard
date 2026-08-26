import { decodeContent } from "@/lib/utils";
import fs from "indexeddb-fs";

export const PathUtils = {
    normalize(path: string): string {
        if (!path) return "root";

        let normalized = path.replace(/[\\/]+/g, "/").trim();

        if (normalized.length > 1 && normalized.endsWith("/")) {
            normalized = normalized.slice(0, -1);
        }

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
    },

    dirname(path: string): string {
        const normalized = this.normalize(path);
        const index = normalized.lastIndexOf("/");
        return index > 0 ? normalized.slice(0, index) : "root";
    },

    relative(from: string, to: string): string {
        const normalizedFrom = this.normalize(from);
        const normalizedTo = this.normalize(to);

        if (normalizedTo === normalizedFrom) {
            return "";
        }

        if (normalizedTo.startsWith(`${normalizedFrom}/`)) {
            return normalizedTo.slice(normalizedFrom.length + 1);
        }

        return normalizedTo;
    },

    isInside(basePath: string, targetPath: string): boolean {
        const base = this.normalize(basePath);
        const target = this.normalize(targetPath);
        return target === base || target.startsWith(`${base}/`);
    },
};

export async function recursiveReaddir(dirPath: string): Promise<string[]> {
    const results: string[] = [];
    try {
        const { files, directories } = await fs.readDirectory(dirPath);

        for (const file of files) {
            results.push(file.fullPath);
        }

        for (const dir of directories) {
            const subFiles = await recursiveReaddir(dir.fullPath);
            results.push(...subFiles);
        }
    } catch (e) {
        console.warn(`Failed to read directory ${dirPath}:`, e);
    }
    return results;
}

export function globToRegex(pattern: string): RegExp {
    const escaped = pattern
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*\*/g, "(.+)")
        .replace(/\*/g, "([^/]*)")
        .replace(/\?/g, "(.)");
    return new RegExp(`^${escaped}$`);
}

type VirtualFile = {
    path: string;
    description?: string;
};

class VirtualFileManager {
    private _files: VirtualFile[] = [];
    private _paths: string[] = [];
    private _systemRoot = "root";

    public addPath(path: string) {
        const normalized = PathUtils.normalize(path);
        if (!this.verifyFilePath(normalized)) {
            return;
        }

        if (!this._paths.includes(normalized)) {
            this._paths.push(normalized);
        }
    }

    public removePath(path: string) {
        const normalized = PathUtils.normalize(path);
        this._paths = this._paths.filter(item => item !== normalized);
    }

    public getPaths() {
        return [...this._paths];
    }

    public clearPaths() {
        this._paths = [];
    }

    public async resolvePath(path: string) {
        const normalized = PathUtils.normalize(path);
        if (!this.verifyFilePath(normalized)) {
            return null;
        }

        if (await fs.exists(normalized)) {
            return normalized;
        }

        const candidates = [
            ...this._paths.map(basePath => PathUtils.join(basePath, normalized)),
            PathUtils.join(this._systemRoot, normalized),
        ];

        for (const candidate of candidates) {
            if (this.verifyFilePath(candidate) && await fs.exists(candidate)) {
                return candidate;
            }
        }

        return null;
    }

    public verifyFilePath(path: string) {
        const normalized = PathUtils.normalize(path);
        return Boolean(normalized) && !normalized.split("/").includes("..");
    }

    public findFile(path: string) {
        return this._files.find(file => file.path === PathUtils.normalize(path));
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
