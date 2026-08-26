import { Markdown } from "@/components/ui/markdown";
import { useEffect, useState } from "react";
import { chatAgent } from "../../system/agents/main";
import { useAgentPromptUpdated } from "../hooks/use-agent-prompt-updated";

const PromptPreview = ({
    title,
    loadPrompt,
    threadId,
}: {
    title: string;
    loadPrompt: (threadId?: string) => Promise<string>;
    threadId?: string;
}) => {
    const [prompt, setPrompt] = useState("");

    const reloadData = () => {
        loadPrompt(threadId).then(nextPrompt => {
            setPrompt(nextPrompt);
        });
    };

    useAgentPromptUpdated(chatAgent.name(), reloadData);

    useEffect(() => {
        reloadData();
    }, [threadId]);

    return <div className="w-full h-full p-2 overflow-x-hidden overflow-y-auto no-scrollbar px-4 py-3">
        <div className="text-foreground text-xl font-bold">{title}</div>
        <Markdown fontLevel='small' className="text-foreground/80">
            {prompt}
        </Markdown>
    </div>;
};

export const AssistantSystemInstruction = ({ threadId }: { threadId?: string }) => {
    return <PromptPreview
        title="System Instruction"
        threadId={threadId}
        loadPrompt={(id) => chatAgent.systemInstruction({ threadId: id })}
    />;
};

export const AssistantPrompt = ({ threadId }: { threadId?: string }) => {
    return <PromptPreview
        title="Prompt"
        threadId={threadId}
        loadPrompt={(id) => chatAgent.firstPrompt({ threadId: id })}
    />;
};

export const AssistantActiveSkill = ({ threadId }: { threadId?: string }) => {
    return <PromptPreview
        title="Active Skill"
        threadId={threadId}
        loadPrompt={(id) => chatAgent.activeSkillPrompt({ threadId: id })}
    />;
};
