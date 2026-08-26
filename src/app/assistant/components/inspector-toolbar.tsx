import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BotIcon, FilesIcon, LogsIcon, MenuIcon, ScaleIcon } from "lucide-react";

export type InspectorOption = '' | 'log' | 'systemInstruction' | 'prompt' | 'skill' | 'files' | 'agent';

type InspectorToolbarProps = {
    option: InspectorOption;
    setOption: (option: InspectorOption) => void;
};

export const InspectorToolbar = ({ option, setOption }: InspectorToolbarProps) => {
    const handleSetOption = (value: InspectorOption) => {
        if (value === option) {
            setOption('');
        }
        else {
            setOption(value);
        }
    };

    return <div className="w-16 p-2 space-y-2 bg-mist-900/80 absolute right-0 top-0 bottom-0">
        <Button variant="ghost" className="size-12 text-white" onClick={() => setOption('')}>
            <MenuIcon className={cn("group-hover:size-7 transition-all size-6")} />
        </Button>

        <Button variant={option === 'log' ? 'default' : 'ghost'} className="size-12 group" onClick={() => handleSetOption('log')}>
            <LogsIcon className={cn("group-hover:size-7 transition-all", option === 'log' ? 'size-7' : 'size-6')} />
        </Button>

        <Button variant={option === 'systemInstruction' ? 'default' : 'ghost'} className="size-12 group" onClick={() => handleSetOption('systemInstruction')}>
            <ScaleIcon className={cn("group-hover:size-7 transition-all", option === 'systemInstruction' ? 'size-7' : 'size-6')} />
        </Button>

        <Button variant={option === 'files' ? 'default' : 'ghost'} className="size-12 group" onClick={() => handleSetOption('files')}>
            <FilesIcon className={cn("group-hover:size-7 transition-all", option === 'files' ? 'size-7' : 'size-6')} />
        </Button>

        <Button variant={option === 'agent' ? 'default' : 'ghost'} className="size-12 group" onClick={() => handleSetOption('agent')}>
            <BotIcon className={cn("group-hover:size-7 transition-all", option === 'agent' ? 'size-7' : 'size-6')} />
        </Button>
    </div>;
};
