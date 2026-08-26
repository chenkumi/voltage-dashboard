import { AgentExecutorProps } from "@/app/agent/agent-common";
import { fileAgent } from "./agent";
import { ToolArgs } from "./types";

export async function executor(
    _props: AgentExecutorProps,
    input: ToolArgs,
) {
    const { cmd } = input;
    const { threadId } = _props;

    let prompt;
    if (cmd && cmd.length>0) {
        prompt = cmd;
    }
    else {
        return { status: 'ARGUMENT_ERROR', message: 'Miss task command.' };
    }

    const result = await fileAgent.generatePrompt(threadId, prompt);

    const msg = result.content;
    let toolCall = null;
    if (msg?.tools && msg.tools.length > 0) {
        toolCall = msg.tools[0];
    }

    if (toolCall) {
        const { name, input, output } = toolCall;
        return { status: 'TOOL_RESULT', toolName: name, args: input, output };
    }
    else {
        return { status: "INTERNAL_ERROR" };
    }
}
