import { AgentRuntimeEvents } from "@/app/agent/agent-runtime-events";
import { ModelContent } from "@/app/types";
import { useEffect, useState } from "react";

export const useStreamingMessageContent = (outputId: string | null, enabled: boolean) => {
    const [content, setContent] = useState<ModelContent | null>(null);

    useEffect(() => {
        setContent(null);

        if (!outputId || !enabled) {
            return;
        }

        const handleContent = (nextContent: ModelContent) => {
            setContent(nextContent);
        };

        AgentRuntimeEvents.onMessageContent(outputId, handleContent);
        return () => {
            AgentRuntimeEvents.offMessageContent(outputId, handleContent);
        };
    }, [enabled, outputId]);

    return content;
};
