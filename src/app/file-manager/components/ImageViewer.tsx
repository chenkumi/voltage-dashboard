import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { X, Download, ZoomIn, ZoomOut } from 'lucide-react';

interface ImageViewerProps {
    filename: string;
    blob: Blob;
    onClose: () => void;
}

export const ImageViewer: React.FC<ImageViewerProps> = ({ 
    filename, 
    blob, 
    onClose 
}) => {
    const [url, setUrl] = useState<string>('');
    const [zoom, setZoom] = useState(1);

    useEffect(() => {
        const objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
        return () => URL.revokeObjectURL(objectUrl);
    }, [blob]);

    const handleDownload = () => {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
    };

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-background/80 backdrop-blur-md animate-in fade-in zoom-in duration-300">
            <div className="flex items-center justify-between p-4 border-b bg-background/50">
                <span className="font-bold text-lg">{filename}</span>
                <div className="flex items-center space-x-2">
                    <Button variant="outline" size="icon" onClick={() => setZoom(prev => Math.min(prev + 0.2, 3))}>
                        <ZoomIn className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => setZoom(prev => Math.max(prev - 0.2, 0.5))}>
                        <ZoomOut className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={handleDownload}>
                        <Download className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={onClose}>
                        <X className="w-6 h-6" />
                    </Button>
                </div>
            </div>
            <div className="flex-1 flex items-center justify-center p-8 overflow-auto">
                {url && (
                    <img 
                        src={url} 
                        alt={filename} 
                        className="max-w-full max-h-full object-contain shadow-2xl rounded-lg transition-transform duration-200"
                        style={{ transform: `scale(${zoom})` }}
                    />
                )}
            </div>
        </div>
    );
};
