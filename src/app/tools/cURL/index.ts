import { AgentExecutorProps, AgentTool } from "@/app/agent/agent-common";
import { toolArgumentsError } from "../shared/response";
import { executor } from "./executor";
import { InputSchema } from "./types";

export const TOOL_NAME = 'cURL';

export const TOOL_DESCRIPTION = `Execute network requests to fetch data or perform API operations. Supports GET, POST, PUT, DELETE.`;

const robot_compatible_mode: boolean = true;

const Tool: AgentTool = {
    name: TOOL_NAME,
    description: TOOL_DESCRIPTION,
    inputSchema: InputSchema,
    executor: async (props: AgentExecutorProps) => {
        const {args} = props;
        const validation = InputSchema.safeParse(args);
        if (!validation.success) {
            return toolArgumentsError(
                TOOL_NAME,
                InputSchema,
                args,
                validation.error.message,
                { url: "https://example.com", method: "GET" },
            );
        }

        const response = await executor(props, validation.data, robot_compatible_mode);;
        return response;
    }
}

export default Tool;
