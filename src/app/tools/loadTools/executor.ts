import { AgentExecutorProps } from "@/app/agent/agent-common";
import { AgentStateRepository } from "@/app/agent/state-repository";
import { dynamicToolRegistry } from "../registry";
import { ToolArgs } from "./types";

const unique = (values: string[]) =>
    Array.from(new Set(values.map(value => value.trim()).filter(Boolean)));

export async function executor(
    props: AgentExecutorProps,
    input: ToolArgs,
) {
    const requestedToolNames = unique(input.toolNames);
    const availableToolNames = new Set(dynamicToolRegistry.list().map(tool => tool.name));
    const invalidToolNames = requestedToolNames.filter(name => !availableToolNames.has(name));
    const validToolNames = requestedToolNames.filter(name => availableToolNames.has(name));
    const currentState = await AgentStateRepository.ensureActiveSegment(props.threadId, "assistant");
    const alreadyLoadedSet = new Set(currentState.loadedToolNames ?? []);
    const alreadyLoadedToolNames = validToolNames.filter(name => alreadyLoadedSet.has(name));
    const newToolNames = validToolNames.filter(name => !alreadyLoadedSet.has(name));

    if (invalidToolNames.length > 0) {
        return {
            status: "error",
            loadedToolNames: currentState.loadedToolNames ?? [],
            alreadyLoadedToolNames,
            invalidToolNames,
            availableToolNames: dynamicToolRegistry.list().map(tool => tool.name),
            message: "Some requested tools do not exist in tool_registry. Retry with valid toolNames.",
        };
    }

    const nextState = newToolNames.length > 0
        ? await AgentStateRepository.addLoadedTools(props.threadId, "assistant", newToolNames)
        : currentState;

    return {
        status: "ok",
        loadedToolNames: nextState.loadedToolNames ?? [],
        alreadyLoadedToolNames,
        invalidToolNames: [],
        nextInstruction: "Now call the loaded action tool through the API tool channel. Do not claim completion until a matching tool result succeeds.",
    };
}
