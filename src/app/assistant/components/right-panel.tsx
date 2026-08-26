import { cn } from "@/lib/utils";
import { Activity, useState } from "react";
import { FileManagerPage } from "../../file-manager";
import { AgentTest } from "./agent-test";
import { useAssistantThread } from "../datasource";
import { InspectorOption, InspectorToolbar } from "./inspector-toolbar";
import { AssistantThreadLog } from "./inspector-thread-log";
import { AssistantActiveSkill, AssistantPrompt, AssistantSystemInstruction } from "./prompt-preview";

const AssistantFiles = () => {
    return <>
        <FileManagerPage />
    </>;
};

export const AssistantRightPanel = () => {
    const thread = useAssistantThread();
    const threadId = thread?.id;
    const [option, setOption] = useState<InspectorOption>('log');

    return <div className={cn("h-full w-auto min-w-16 overflow-hidden flex relative")}>
        <div className={cn("h-full me-16 space-y-3 overflow-hidden transition-all", option.length === 0 ? 'w-0' : 'w-100')}>
            <Activity mode={option === 'log' ? 'visible' : 'hidden'}>
                <AssistantThreadLog />
            </Activity>

            <Activity mode={option === 'systemInstruction' ? 'visible' : 'hidden'}>
                <AssistantSystemInstruction threadId={threadId} />
            </Activity>

            <Activity mode={option === 'prompt' ? 'visible' : 'hidden'}>
                <AssistantPrompt threadId={threadId} />
            </Activity>

            <Activity mode={option === 'skill' ? 'visible' : 'hidden'}>
                <AssistantActiveSkill threadId={threadId} />
            </Activity>

            <Activity mode={option === 'files' ? 'visible' : 'hidden'}>
                <AssistantFiles />
            </Activity>

            <Activity mode={option === 'agent' ? 'visible' : 'hidden'}>
                <AgentTest />
            </Activity>
        </div>

        <InspectorToolbar option={option} setOption={setOption} />
    </div>;
};
