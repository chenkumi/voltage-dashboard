import { AgentExecutorProps, AgentTool } from "@/app/agent/agent-common";
import { executor } from "./executor";
import { InputSchema } from "./types";
import { ValidationError } from "../utils";

const TOOL_NAME = "loadTools";

const TOOL_DESCRIPTION = `Load named browser-side tools into the current agent.`;

const TOOL_PROMPT = `Use before calling any optional tool that appears in <tool_registry> but is not available in the API tool definitions.`;

const Tool: AgentTool = {
    name: TOOL_NAME,
    description: TOOL_DESCRIPTION,
    prompt: TOOL_PROMPT,
    inputSchema: InputSchema,
    executor: async (props: AgentExecutorProps) => {
        const { args } = props;
        const validation = InputSchema.safeParse(args);
        if (!validation.success) {
            return ValidationError(InputSchema, validation.error);
        }

        return executor(props, validation.data);
    },
};

export default Tool;
