import { AgentExecutorProps, AgentTool } from "@/app/agent/agent-common";
import { executor } from "./executor";
import { InputSchema } from "./types";
import { ValidationError } from '../utils';

const TOOL_NAME = "webSearch";

const TOOL_DESCRIPTION = `Search the web for news, knowledge, documents, or specific web content.`;

const TOOL_PROMPT = `Use before answering questions that depend on current, external, niche, or uncertain knowledge.`;

const TOOL_ROLES = [
    "Supports filtering by time range.",
    "Can request AI-generated summaries when useful.",
];

const Tool: AgentTool = {
    name: TOOL_NAME,
    description: TOOL_DESCRIPTION,
    prompt: TOOL_PROMPT,
    roles: TOOL_ROLES,
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
