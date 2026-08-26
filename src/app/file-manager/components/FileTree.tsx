import { cn } from '@/lib/utils';
import fs from 'indexeddb-fs';
import { ChevronDown, ChevronRight, Folder, FolderOpen } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { FileEntry } from '../types';

interface FileTreeProps {
    path: string;
    onSelect: (path: string) => void;
    currentPath: string;
    level?: number;
}

export const FileTree: React.FC<FileTreeProps> = ({ path, onSelect, currentPath, level = 0 }) => {
    const [isOpen, setIsOpen] = useState(path === 'root');
    const [children, setChildren] = useState<FileEntry[]>([]);
    const name = useMemo(() => {
        return path === 'root' ? 'Root' : path.split('/').pop() || '';
    }, [path]);

    useEffect(() => {
        if (isOpen) {
            fs.readDirectory(path).then((result: any) => {
                setChildren(result.directories);
            });
        }
    }, [isOpen, path]);

    const isSelected = currentPath === path;

    return (
        <div className="flex flex-col">
            <div
                className={cn(
                    "flex items-center py-1 px-2 cursor-pointer hover:bg-accent/50 rounded-md transition-colors group",
                    isSelected && "bg-accent text-accent-foreground font-medium"
                )}
                style={{ paddingLeft: `${level * 12 + 8}px` }}
                onClick={() => {
                    onSelect(path);
                    if (children.length > 0 || path === 'root') setIsOpen(!isOpen);
                }}
            >
                <div className="w-4 h-4 mr-1 flex items-center justify-center">
                    {children.length > 0 && (
                        isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />
                    )}
                </div>
                {isOpen ? (
                    <FolderOpen className={cn("w-4 h-4 mr-2 text-indigo-400 fill-indigo-400/10", isSelected && "text-indigo-500")} />
                ) : (
                    <Folder className={cn("w-4 h-4 mr-2 text-indigo-400 fill-indigo-400/10", isSelected && "text-indigo-500")} />
                )}
                <span className="text-sm truncate">{name}</span>
            </div>

            {isOpen && children.map((dir) => (
                <FileTree
                    key={dir.fullPath}
                    path={dir.fullPath}
                    onSelect={onSelect}
                    currentPath={currentPath}
                    level={level + 1}
                />
            ))}
        </div>
    );
};
