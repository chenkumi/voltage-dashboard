import { AgentExecutorProps, AgentTool } from "@/app/agent/agent-common";
import { toolArgumentsError } from "../shared/response";
import { executor } from "./executor";
import { InputSchema } from "./types";

const TOOL_NAME = "loadSkill";

const TOOL_DESCRIPTION = "Load a skill definition and make it the active skill.";

const TOOL_PROMPT = "Use when the task needs specialized instructions, domain rules, or reusable workflows from <skill_registry>. Do not reload the same active skill.";

const Tool: AgentTool = {
    name: TOOL_NAME,
    description: TOOL_DESCRIPTION,
    prompt: TOOL_PROMPT,
    inputSchema: InputSchema,
        executor: async (props:AgentExecutorProps) => {
        const {args} = props;
        const validation = InputSchema.safeParse(args);
        if (!validation.success) {
            return toolArgumentsError(
                TOOL_NAME,
                InputSchema,
                args,
                validation.error.message,
                { skillName: "skill-name" },
            );
        }

        const response = await executor(props, validation.data);
        return response;
    }
}

export default Tool;
