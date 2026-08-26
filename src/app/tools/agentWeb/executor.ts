import { AgentExecutorProps} from '@/app/agent/agent-common';
import webSearchAgent from './agent';
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

    const result = await webSearchAgent.generatePrompt(threadId, prompt);
    console.log("webSearchAgent result:", result);
    const content = result.content;
    const text = content?.text ?? "";
    if (text.length > 0) {
        return { status: "RESULT", data: text };
    }
    else {
        return { status: 'CONTENT_EMPTY' };
    }
}
