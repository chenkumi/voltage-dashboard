export type FileType = 'file' | 'directory';

export interface FileEntry {
    name: string;
    fullPath: string;
    type: FileType;
    directory: string;
    createdAt?: number;
    data?: any;
}

export interface DirectoryContent {
    files: FileEntry[];
    directories: FileEntry[];
    filesCount: number;
    directoriesCount: number;
}

export interface TreeItem extends FileEntry {
    children?: TreeItem[];
    isOpen?: boolean;
}

export type PathCrumb = {
    name:string,
    path:string,
}