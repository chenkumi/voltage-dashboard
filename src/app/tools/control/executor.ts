import { AgentExecutorProps } from "@/app/agent/agent-common";
import { ToolArgs } from "./types";

export async function executor(
    _props: AgentExecutorProps,
    input: ToolArgs,
) {
    console.info("input:", input);
    // 統一回傳結構
    return { status: 'ok', next: 'continue' };
}