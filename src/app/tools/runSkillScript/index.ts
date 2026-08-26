import { AgentExecutorProps, AgentTool } from "@/app/agent/agent-common";
import { toolArgumentsError } from "../shared/response";
import { executor } from "./executor";
import { InputSchema } from "./types";

const TOOL_NAME = "runSkillScript";

const TOOL_DESCRIPTION = "Dynamically mount and run a JavaScript script from the currently active skill folder.";

const TOOL_PROMPT = "Use after loadSkill. scriptName=\"draw\" resolves draw.js under the active skill folder or scripts/draw.js, mounts it, then executes it.";

const Tool: AgentTool = {
    name: TOOL_NAME,
    description: TOOL_DESCRIPTION,
    prompt: TOOL_PROMPT,
    inputSchema: InputSchema,
    executor: async (props: AgentExecutorProps) => {
        const { args } = props;
        const validation = InputSchema.safeParse(args);
        if (!validation.success) {
            return toolArgumentsError(
                TOOL_NAME,
                InputSchema,
                args,
                validation.error.message,
                { scriptName: "draw", args: { spread: "three", question: "..." } },
            );
        }

        return executor(props, validation.data);
    },
};

export default Tool;
