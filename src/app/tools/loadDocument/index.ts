import { AgentExecutorProps, AgentTool } from "@/app/agent/agent-common";
import { toolArgumentsError } from "../shared/response";
import { executor } from "./executor";
import { InputSchema } from "./types";

const TOOL_NAME = "loadDocument";

const TOOL_DESCRIPTION = "Load a document from the already active skill folder.";

const TOOL_PROMPT = "Use only after loadSkill succeeds. documentPath must point to a file under the active skill folder; paths are resolved dynamically and the document directory is mounted for later file search.";

const Tool: AgentTool = {
    name: TOOL_NAME,
    description: TOOL_DESCRIPTION,
    prompt: TOOL_PROMPT,
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
                { documentPath: "docs/example.md" },
            );
        }

        const response = await executor(props, validation.data);
        return response;
    }
}

export default Tool;
