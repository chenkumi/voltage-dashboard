import {
    AlertCircle,
    FolderPlus,
    HomeIcon,
    Loader2,
    Plus,
    Upload
} from 'lucide-react';
import React, { useRef, useState } from 'react';
import { FileEditor } from './components/FileEditor';
import { ImageViewer } from './components/ImageViewer';
import { useFileSystem } from './hooks/use-fs';
import { FileEntry, PathCrumb } from './types';
import { extractZip } from './utils/zip';

import {
    Breadcrumb,
    BreadcrumbEllipsis,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { decodeContent } from '@/lib/utils';
import fs from 'indexeddb-fs';
import { toast } from 'sonner';
import { FileList } from './components/FileList';




const BreadcrumbView = ({crumbs, setCurrentPath}:{crumbs:PathCrumb[], setCurrentPath:(path:string)=>void}) =>{
    return <Breadcrumb>
        <BreadcrumbList>
            <BreadcrumbItem>
                <BreadcrumbLink render={<a className="cursor-pointer" onClick={()=>setCurrentPath(crumbs[0].path)}>{crumbs[0].name}</a>} />
            </BreadcrumbItem>

            {
                crumbs.length>3 && <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                    <BreadcrumbEllipsis />
                </BreadcrumbItem>
                </>
            }

            {
                crumbs.length>2 && <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                    <BreadcrumbLink render={<a className="cursor-pointer" onClick={()=>setCurrentPath(crumbs[crumbs.length-2].path)}>{crumbs[crumbs.length-2].name}</a>} />
                </BreadcrumbItem>
                </>
            }

            {
                crumbs.length>1 && <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                    <BreadcrumbLink render={<a className="cursor-pointer" onClick={()=>setCurrentPath(crumbs[crumbs.length-1].path)}>{crumbs[crumbs.length-1].name}</a>} />
                </BreadcrumbItem>
                </>
            }
        </BreadcrumbList>
    </Breadcrumb>
}

export const FileManagerPage: React.FC = () => {
    const {
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
        rename
    } = useFileSystem();

    // UI States
    const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);
    const [isRenameOpen, setIsRenameOpen] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [renameState, setRenameState] = useState<{ path: string, name: string, isDir: boolean } | null>(null);
    const [editingFile, setEditingFile] = useState<{ name: string, path: string, content: string } | null>(null);
    const [viewingImage, setViewingImage] = useState<{ name: string, blob: Blob } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Handlers
    const handleCreateFolder = async () => {
        if (!newFolderName) return;
        try {
            await mkdir(newFolderName);
            toast.success(`目錄層 "${newFolderName}" 已建立`);
            setNewFolderName('');
            setIsNewFolderOpen(false);
        } catch (err: any) {
            toast.error(`建立失敗: ${err.message}`);
        }
    };

    const handleRename = async () => {
        if (!renameState || !renameState.name) return;
        try {
            await rename(renameState.path, renameState.name, renameState.isDir);
            toast.success('更名成功');
            setIsRenameOpen(false);
            setRenameState(null);
        } catch (err: any) {
            toast.error(`更名失敗: ${err.message}`);
        }
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files) return;

        const uploadPromises = Array.from(files).map(async (file) => {
            const data = await file.arrayBuffer();
            return writeFile(file.name, data);
        });

        try {
            await Promise.all(uploadPromises);
            toast.success(`成功上傳 ${files.length} 個檔案`);
        } catch (err: any) {
            toast.error(`上傳失敗: ${err.message}`);
        }
    };

    const handleFileClick = async (file: FileEntry) => {
        const ext = file.name.split('.').pop()?.toLowerCase() || '';

        try {
            const data = await readFile(file.fullPath);

            if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext)) {
                const blob = data instanceof Blob ? data : new Blob([data as BlobPart]);
                setViewingImage({ name: file.name, blob });
            } else if (['zip'].includes(ext)) {
                // ZIP click - show options or just download? 
                // User requirement asks for unzip.
                toast('ZIP 檔案', {
                    description: '按一下右鍵選單進行解壓縮',
                });
            } else {
                // Default to text editor
                const text = decodeContent(data);
                setEditingFile({ name: file.name, path: file.fullPath, content: text });
            }
        } catch (err: any) {
            toast.error(`讀取失敗: ${err.message}`);
        }
    };

    const handleExtract = async (path: string) => {
        toast.promise(async () => {
            const data = await readFile(path) as BlobPart;
            const blob = data instanceof Blob ? data : new Blob([data]);
            await extractZip(blob, currentPath);
            await refresh();
        }, {
            loading: '正在解壓縮...',
            success: '解壓縮完成',
            error: (err) => `解壓縮失敗: ${err.message}`
        });
    };

    const getBreadcrumbs = ():PathCrumb[] => {
        if (currentPath === 'root') return [{ name: 'root', path: 'root' }];
        const parts = currentPath.split('/');
        // const crumbs = [{ name: 'Root', path: 'root' }];
        const crumbs: { name: string, path: string }[] = [];
        let current = '';
        parts.forEach(part => {
            current = current ? `${current}/${part}` : part;
            crumbs.push({ name: part, path: current });
        });
        return crumbs;
    };

    const pathCrumbs = getBreadcrumbs();

    return (
        <div className="flex h-screen w-full bg-background overflow-hidden text-foreground border-l">
            {/* <ResizablePanelGroup orientation="horizontal" className='flex-1'> */}
            {/* Sidebar */}
            {/* <ResizablePanel defaultSize="20%" minSize={15} maxSize={30} className="bg-muted/30 border-r"> */}
            {/* <div className='w-50 h-full overflow-hidden'>
                <div className="flex flex-col h-full w-full">
                    <div className="p-4 flex items-center justify-between border-b bg-background/50">
                        <span className="font-bold tracking-tight">檔案瀏覽</span>
                        <Button variant="ghost" size="icon" onClick={() => setCurrentPath('root')}>
                            <Home className="w-4 h-4" />
                        </Button>
                    </div>
                    <ScrollArea className="flex-1 p-2">
                        <FileTree
                            path="root"
                            onSelect={setCurrentPath}
                            currentPath={currentPath}
                        />
                    </ScrollArea>
                </div>
            </div> */}
            {/* </ResizablePanel> */}

            {/* <ResizableHandle withHandle /> */}

            {/* Main Content */}
            {/* <ResizablePanel defaultSize="80%"> */}
            <div className='flex-1 h-full overflow-hidden'>
                <div className="flex flex-col h-full w-full">
                    {/* Header */}
                    <header className="border-b flex items-center px-4 py-3 gap-2 bg-background/50 backdrop-blur-sm sticky top-0 z-10">
                        <HomeIcon />
                        <BreadcrumbView  crumbs={pathCrumbs} setCurrentPath={path=>setCurrentPath(path)}/>
                        {/* <div className="flex items-center space-x-2 text-sm text-muted-foreground overflow-hidden mr-4">
                            {getBreadcrumbs().map((crumb, i) => (
                                <div className='flex' key={crumb.path}>
                                    {i > 0 && <ChevronRight className="w-4 h-4 shrink-0" />}
                                    <button
                                        className="hover:text-primary transition-colors whitespace-nowrap font-medium"
                                        onClick={() => setCurrentPath(crumb.path)}
                                    >
                                        {crumb.name}
                                    </button>
                                </div>
                            ))}
                        </div> */}

                    </header>

                    {/* Content Area */}
                    <ScrollArea className="flex-1 bg-muted">

                        {loading ? (
                            <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-muted-foreground animate-pulse">
                                <Loader2 className="w-10 h-10 mb-4 animate-spin" />
                                <p>載入檔案中...</p>
                            </div>
                        ) : error ? (
                            <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-destructive">
                                <AlertCircle className="w-12 h-12 mb-4" />
                                <p className="font-bold">讀取失敗</p>
                                <p className="text-sm">{error}</p>
                                <Button variant="outline" className="mt-4" onClick={() => refresh()}>
                                    重試
                                </Button>
                            </div>
                        ) : contents && (contents.filesCount + contents.directoriesCount > 0) ? (
                            <FileList
                                upDirectory={pathCrumbs.length>1?pathCrumbs[pathCrumbs.length-1]:undefined}
                                files={contents.files}
                                directories={contents.directories}
                                onFileClick={handleFileClick}
                                onDirectoryClick={(dir) => setCurrentPath(dir.fullPath)}
                                onDelete={remove}
                                onRename={(path, isDir) => {
                                    setRenameState({ path, name: path.split('/').pop() || '', isDir });
                                    setIsRenameOpen(true);
                                }}
                                onExtract={handleExtract}
                            />
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-muted-foreground opacity-50">
                                <div className="p-8 rounded-full bg-muted mb-4">
                                    <Plus className="w-12 h-12" />
                                </div>
                                <p className="text-lg font-medium">目前資料夾是空的</p>
                                <p className="text-sm">您可以上傳檔案或建立新目錄</p>
                            </div>
                        )}
                    </ScrollArea>

                    <footer className='px-4 py-3 border-t w-full flex justify-end'>
                        <div className="flex items-center gap-2 shrink-0">
                            <Button className="gap-2" variant="outline" onClick={() => setIsNewFolderOpen(true)}>
                                <FolderPlus className="w-4 h-4" />
                                新建
                            </Button>

                            <Button className="gap-2" onClick={() => fileInputRef.current?.click()}>
                                <Upload className="w-4 h-4" />
                                上傳
                            </Button>

                            <input
                                type="file"
                                className="hidden"
                                ref={fileInputRef}
                                multiple
                                onChange={handleFileUpload}
                            />
                        </div>
                    </footer>
                </div>
            </div>
            {/* </ResizablePanel> */}
            {/* </ResizablePanelGroup> */}


            {/* Overlays */}
            {
                editingFile && (
                    <div className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm flex items-center justify-center p-8">
                        <div className="w-full max-w-5xl h-full max-h-[90vh]">
                            <FileEditor
                                filename={editingFile.name}
                                initialContent={editingFile.content}
                                onSave={async (content) => {
                                    try {
                                        await fs.writeFile(editingFile.path, content);
                                        toast.success('儲存成功');
                                        setEditingFile(null);
                                        await refresh();
                                    } catch (err: any) {
                                        toast.error(`儲存失敗: ${err.message}`);
                                    }
                                }}
                                onCancel={() => setEditingFile(null)}
                            />
                        </div>
                    </div>
                )
            }

            {
                viewingImage && (
                    <ImageViewer
                        filename={viewingImage.name}
                        blob={viewingImage.blob}
                        onClose={() => setViewingImage(null)}
                    />
                )
            }

            {/* Dialogs */}
            <Dialog open={isNewFolderOpen} onOpenChange={setIsNewFolderOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>新建資料夾</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <Input
                            placeholder="輸入資料夾名稱"
                            value={newFolderName}
                            onChange={(e) => setNewFolderName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                            autoFocus
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsNewFolderOpen(false)}>取消</Button>
                        <Button onClick={handleCreateFolder}>建立</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>重新命名</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <Input
                            placeholder="輸入新名稱"
                            value={renameState?.name || ''}
                            onChange={(e) => setRenameState(prev => prev ? { ...prev, name: e.target.value } : null)}
                            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                            autoFocus
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsRenameOpen(false)}>取消</Button>
                        <Button onClick={handleRename}>確定</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div >
    );
};
