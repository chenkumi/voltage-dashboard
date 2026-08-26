import { AgentExecutorProps, AgentTool } from "@/app/agent/agent-common";
import { executor } from "./executor";
import { InputSchema } from "./types";
import { ValidationError } from '../utils';

const TOOL_NAME = "readFile";

const TOOL_DESCRIPTION = "Read file content. Mounted skill/document folders are searched first, then root. Supports segmented reading of large files to save tokens.";

const Tool: AgentTool = {
    name: TOOL_NAME,
    description: TOOL_DESCRIPTION,
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
