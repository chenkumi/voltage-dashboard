import fs from 'indexeddb-fs';
import { useCallback, useEffect, useState } from 'react';
import { DirectoryContent } from '../types';

export function useFileSystem() {
    const [currentPath, setCurrentPath] = useState<string>('root');
    const [contents, setContents] = useState<DirectoryContent | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async (path: string = currentPath) => {
        setLoading(true);
        setError(null);
        try {
            const result = await fs.readDirectory(path);
            setContents(result as unknown as DirectoryContent);
        } catch (err: any) {
            setError(err.message || 'Failed to read directory');
        } finally {
            setLoading(false);
        }
    }, [currentPath]);

    useEffect(() => {
        refresh(currentPath);
    }, [currentPath, refresh]);

    const mkdir = async (name: string, parentPath: string = currentPath) => {
        const fullPath = parentPath === 'root' ? name : `${parentPath}/${name}`;
        await fs.createDirectory(fullPath);
        await refresh();
    };

    const writeFile = async (name: string, data: any, parentPath: string = currentPath) => {
        const fullPath = parentPath === 'root' ? name : `${parentPath}/${name}`;
        await fs.writeFile(fullPath, data);
        await refresh();
    };

    const readFile = async (path: string) => {
        return await fs.readFile(path);
    };

    const remove = async (path: string, isDirectory: boolean) => {
        if (isDirectory) {
            await fs.removeDirectory(path);
        } else {
            await fs.removeFile(path);
        }
        await refresh();
    };

    const getParentPath = (path: string) => {
        const parts = path.split('/');
        parts.pop();
        return parts.length ? parts.join('/') : 'root';
    };

    const getBaseName = (path: string) => {
        return path.split('/').pop() || path;
    };

    const joinPath = (parentPath: string, name: string) => {
        return parentPath === 'root' ? `root/${name}` : `${parentPath}/${name}`;
    };

    const copyDirectory = async (sourcePath: string, destinationPath: string) => {
        await fs.createDirectory(destinationPath);

        const content = await fs.readDirectory(sourcePath);

        for (const file of content.files) {
            const targetPath = `${destinationPath}/${file.name}`;
            const data = await fs.readFile(file.fullPath);
            await fs.writeFile(targetPath, data);
        }

        for (const directory of content.directories) {
            const targetPath = `${destinationPath}/${directory.name}`;
            await copyDirectory(directory.fullPath, targetPath);
        }
    };

    const rename = async (oldPath: string, newName: string, isDirectory: boolean) => {
        const trimmedName = newName.trim();
        if (!trimmedName || trimmedName.includes('/')) {
            throw new Error('名稱不可為空，也不可包含斜線。');
        }
        if (getBaseName(oldPath) === trimmedName) return;

        if (isDirectory) {
            const parentPath = getParentPath(oldPath);
            const newPath = joinPath(parentPath, trimmedName);
            if (await fs.exists(newPath)) {
                throw new Error(`"${trimmedName}" 已存在。`);
            }

            await copyDirectory(oldPath, newPath);
            await fs.removeDirectory(oldPath);
        } else {
            await fs.renameFile(oldPath, trimmedName);
        }
        await refresh();
    };

    const move = async (oldPath: string, newPath: string) => {
        await fs.moveFile(oldPath, newPath);
        await refresh();
    };

    return {
        currentPath,
        setCurrentPath,
        contents,
        loading,
        error,
        refresh,
        mkdir,
        writeFile,
        readFile,
        remove,
        rename,
        move
    };
}
