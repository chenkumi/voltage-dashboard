import { AgentExecutorProps, AgentTool } from "@/app/agent/agent-common";
import { executor } from "./executor";
import { InputSchema } from "./types";
import { ValidationError } from '../utils';

const TOOL_NAME = "conversationLog";

const TOOL_DESCRIPTION = `Query earlier conversation records stored outside the active prompt.`;

const TOOL_PROMPT = `Use when required constraints, decisions, file names, user intent, or other earlier details may be in the conversation log.`;

const TOOL_RULES = [
    "Required argument: query, a concise natural language search question.",
];

const Tool: AgentTool = {
    name: TOOL_NAME,
    description: TOOL_DESCRIPTION,
    prompt: TOOL_PROMPT,
    rules: TOOL_RULES,
    inputSchema: InputSchema,
        executor: async (props:AgentExecutorProps) => {
        const {args} = props;
        const validation = InputSchema.safeParse(args);
        if (!validation.success) {
            return ValidationError(InputSchema, validation.error);
        }

        const response = await executor(props, validation.data);
        return response;
    }
}

export default Tool;
