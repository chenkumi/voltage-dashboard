import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Archive, Edit2, FileText, Folder, ImageIcon, MoreVertical, Trash2 } from 'lucide-react';
import React from 'react';
import { FileEntry } from '../types';

interface FileGridProps {
    files: FileEntry[];
    directories: FileEntry[];
    onFileClick: (file: FileEntry) => void;
    onDirectoryClick: (dir: FileEntry) => void;
    onDelete: (path: string, isDir: boolean) => void;
    onRename: (path: string, isDir: boolean) => void;
    onExtract?: (path: string) => void;
}

export const FileGrid: React.FC<FileGridProps> = ({
    files,
    directories,
    onFileClick,
    onDirectoryClick,
    onDelete,
    onRename,
    onExtract
}) => {
    const getFileIcon = (name: string) => {
        const ext = name.split('.').pop()?.toLowerCase();
        if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext || '')) return <ImageIcon className="w-8 h-8 text-blue-400" />;
        if (['zip', 'rar', '7z'].includes(ext || '')) return <Archive className="w-8 h-8 text-yellow-400" />;
        return <FileText className="w-8 h-8 text-gray-400" />;
    };

    return (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4">
            {directories.map((dir) => (
                <Card
                    key={dir.fullPath}
                    className="group relative flex flex-col items-center p-4 hover:bg-accent/50 cursor-pointer transition-all border-none shadow-none bg-background"
                    onClick={() => onDirectoryClick(dir)}
                >
                    <Folder className="w-12 h-12 text-indigo-500 mb-2 fill-indigo-500/20" />
                    <span className="text-sm font-medium text-center truncate w-full px-2" title={dir.name}>
                        {dir.name}
                    </span>

                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <FileActions
                            onDelete={() => onDelete(dir.fullPath, true)}
                            onRename={() => onRename(dir.fullPath, true)}
                        />
                    </div>
                </Card>
            ))}

            {files.map((file) => (
                <Card
                    key={file.fullPath}
                    className="group relative flex flex-col items-center p-4 hover:bg-accent/50 cursor-pointer transition-all border-none shadow-none bg-background"
                    onClick={() => onFileClick(file)}
                >
                    {getFileIcon(file.name)}
                    <span className="text-sm font-medium text-center truncate w-full px-2 mt-2" title={file.name}>
                        {file.name}
                    </span>

                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <FileActions
                            onDelete={() => onDelete(file.fullPath, false)}
                            onRename={() => onRename(file.fullPath, false)}
                            isZip={file.name.endsWith('.zip')}
                            onExtract={() => onExtract?.(file.fullPath)}
                        />
                    </div>
                </Card>
            ))}
        </div>
    );
};

const FileActions = ({ onDelete, onRename, isZip, onExtract }: { onDelete: () => void, onRename: () => void, isZip?: boolean, onExtract?: () => void }) => (
    <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-background/80" />} onClick={(e) => e.stopPropagation()}>
            <MoreVertical className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onRename(); }}>
                <Edit2 className="mr-2 h-4 w-4" />
                <span>更名</span>
            </DropdownMenuItem>
            {isZip && (
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onExtract?.(); }}>
                    <Archive className="mr-2 h-4 w-4" />
                    <span>解壓縮</span>
                </DropdownMenuItem>
            )}
            <DropdownMenuItem className="text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
                <Trash2 className="mr-2 h-4 w-4" />
                <span>刪除</span>
            </DropdownMenuItem>
        </DropdownMenuContent>
    </DropdownMenu>
);
