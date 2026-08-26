import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Save, X } from 'lucide-react';

interface FileEditorProps {
    filename: string;
    initialContent: string;
    onSave: (content: string) => void;
    onCancel: () => void;
}

export const FileEditor: React.FC<FileEditorProps> = ({ 
    filename, 
    initialContent, 
    onSave, 
    onCancel 
}) => {
    const [content, setContent] = useState(initialContent);

    return (
        <div className="flex flex-col h-full bg-background rounded-lg border shadow-sm">
            <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
                <div className="flex items-center space-x-2">
                    <span className="text-sm font-medium text-muted-foreground">編輯:</span>
                    <span className="text-sm font-bold">{filename}</span>
                </div>
                <div className="flex items-center space-x-2">
                    <Button variant="ghost" size="sm" onClick={onCancel}>
                        <X className="w-4 h-4 mr-1" />
                        取消
                    </Button>
                    <Button size="sm" onClick={() => onSave(content)}>
                        <Save className="w-4 h-4 mr-1" />
                        儲存
                    </Button>
                </div>
            </div>
            <div className="flex-1 p-0 overflow-hidden">
                <Textarea 
                    className="w-full h-full min-h-[400px] p-4 resize-none border-none focus-visible:ring-0 font-mono text-sm leading-relaxed"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="輸入內容..."
                />
            </div>
        </div>
    );
};
