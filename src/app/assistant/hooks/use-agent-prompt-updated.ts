import { AgentRuntimeEvents } from "@/app/agent/agent-runtime-events";
import { useEffect, useRef } from "react";

export const useAgentPromptUpdated = (agentName: string, listener: () => void) => {
    const listenerRef = useRef(listener);
    listenerRef.current = listener;

    useEffect(() => {
        const handleUpdated = () => {
            listenerRef.current();
        };

        AgentRuntimeEvents.onPromptUpdated(agentName, handleUpdated);
        return () => {
            AgentRuntimeEvents.offPromptUpdated(agentName, handleUpdated);
        };
    }, [agentName]);
};
