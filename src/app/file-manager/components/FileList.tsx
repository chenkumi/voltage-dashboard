import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Archive, Edit2, FileText, Folder, ImageIcon, MoreVertical, Trash2 } from 'lucide-react';
import { FileEntry, PathCrumb } from '../types';

interface FileListProps {
    upDirectory?:PathCrumb;
    files: FileEntry[];
    directories: FileEntry[];
    onFileClick: (file: FileEntry) => void;
    onDirectoryClick: (dir: FileEntry) => void;
    onDelete: (path: string, isDir: boolean) => void;
    onRename: (path: string, isDir: boolean) => void;
    onExtract?: (path: string) => void;
}

const getFileIcon = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext || '')) return <ImageIcon className="w-6 h-6 text-blue-400" />;
    if (['zip', 'rar', '7z'].includes(ext || '')) return <Archive className="w-6 h-6 text-yellow-400" />;
    return <FileText className="w-6 h-6 text-gray-400" />;
};

const FileItem = ({file, props}:{file:FileEntry, props:FileListProps})=> {
    const {    
        onFileClick,
        onDelete,
        onRename,
        onExtract} = props;

    return <div className='border-b py-3 w-full flex gap-2 items-center' onClick={()=>onFileClick(file)}>
        {getFileIcon(file.name)}
        <div className='flex-1 whitespace-nowrap text-ellipsis overflow-hidden text-base'>
            {file.name}
        </div>
        <FileActions
                onDelete={() => onDelete(file.fullPath, false)}
                onRename={() => onRename(file.fullPath, false)}
                isZip={file.name.endsWith('.zip')}
                onExtract={() => onExtract?.(file.fullPath)}
            />
    </div>
}

const DirectoryItem = ({dir, props}:{dir:FileEntry, props:FileListProps})=> {
    const {    
        onDirectoryClick,
        onDelete,
        onRename} = props;

    return <div className='border-b py-3 w-full flex gap-2 items-center' onClick={()=>onDirectoryClick(dir)}>
        <Folder className="w-6 h-6 text-indigo-500" />
        <div className='flex-1 whitespace-nowrap text-ellipsis overflow-hidden text-base'>
            {dir.name}
        </div>
        <FileActions
            onDelete={() => onDelete(dir.fullPath, true)}
            onRename={() => onRename(dir.fullPath, true)}
        />
    </div>
}

export const FileList = (props:FileListProps) => {
    const {    
        files,
        directories} = props;

    return (
        <div className="grid grid-cols-1 px-4">
            {/* <UpItem props={props} key="up" /> */}
            {directories.map((dir) => (
                <DirectoryItem dir={dir} props={props} key={dir.fullPath} />
            ))}

            {files.map((file) => (
                <FileItem file={file} props={props} key={file.fullPath}/>
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
