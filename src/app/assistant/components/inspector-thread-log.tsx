import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import ReactJsonView from '@microlink/react-json-view';
import { BotIcon, UserIcon, WrenchIcon } from "lucide-react";
import { Activity, useEffect, useRef, useState } from "react";
import { ModelLog } from "../../types";
import { useAssistantThreadLogs } from "../datasource";
import { parseJson } from "../utils/json-util";

const AssistantThreadLogEmpty = () => {
    return <div className="w-full h-full flex flex-col items-center justify-center gap-3">
        <BotIcon className="size-10" />
        <Label>No logs</Label>
    </div>;
};

const toJson = (input: unknown) => {
    if (typeof input === 'string') {
        return parseJson(input);
    }

    return input;
};

const AssistantThreadLogCell = ({ log }: { log: ModelLog }) => {
    const { role, metadata } = log;

    const [inputOpen, setInputOpen] = useState(false);
    const [outputOpen, setOutputOpen] = useState(false);
    if (metadata.type === 'text') {
        return <li className="mb-2">
            <div className="border rounded-xl bg-background px-3 pt-3 pb-3 space-y-2">
                <div className="w-full flex gap-2 text-sm">
                    {role === 'user' ? <UserIcon className="size-5" /> : <BotIcon className="size-5" />}
                    <div className="text-foreground flex-1 whitespace-nowrap text-ellipsis overflow-hidden">{metadata.text}</div>
                </div>
            </div>
        </li>;
    }

    return <li className="mb-2">
        <div className="border rounded-xl bg-background px-3 pt-3 pb-3">
            <div className="w-full flex gap-2 text-sm items-center">
                <WrenchIcon className="size-5" />
                <div className="flex-1 text-foreground whitespace-nowrap text-ellipsis overflow-hidden">{metadata.name}</div>
                <div className="flex text-xs items-center font-bold gap-1 me-4">
                    <Switch checked={inputOpen} onCheckedChange={checked => setInputOpen(checked)} /> <span>INPUT</span>
                </div>
                <div className="flex text-xs items-center font-bold gap-1">
                    <Switch checked={outputOpen} onCheckedChange={checked => setOutputOpen(checked)} /> <span>OUTPUT</span>
                </div>
            </div>
            <Activity mode={inputOpen ? 'visible' : 'hidden'}>
                <div className="border rounded-xl p-2 mt-2">
                    <ReactJsonView src={toJson(metadata.input)} />
                </div>
            </Activity>

            <Activity mode={outputOpen ? 'visible' : 'hidden'}>
                <div className="border rounded-xl p-2 mt-2">
                    <ReactJsonView src={toJson(metadata.output)} />
                </div>
            </Activity>
        </div>
    </li>;
};

export const AssistantThreadLog = () => {
    const bottomRef = useRef<HTMLDivElement | null>(null);
    const logs = useAssistantThreadLogs();

    useEffect(() => {
        if (bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'instant', block: 'end' });
        }
    }, [logs]);

    if (logs && logs.length > 0) {
        return <div className="w-full h-full overflow-x-hidden overflow-y-auto no-scrollbar px-4 py-3">
            <div className="w-full">
                <ol>
                    {logs.map(log => (<AssistantThreadLogCell key={log.id} log={log} />))}
                </ol>
                <div ref={bottomRef} className="h-px w-full" />
            </div>
        </div>;
    }

    return <AssistantThreadLogEmpty />;
};
