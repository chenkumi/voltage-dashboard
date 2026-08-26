import { AgentExecutorProps, AgentTool } from "@/app/agent/agent-common";
import { executor } from "./executor";
import { InputSchema } from "./types";
import { ValidationError } from '../utils';

const TOOL_NAME = "randomGenerator";

const TOOL_DESCRIPTION = `Generate random numbers or randomly choose items.`;

const TOOL_PROMPT = `Use when the user asks for random numbers, dice-like rolls, lucky draws, weighted choices, or selecting items by chance.`;

const TOOL_ROLES = [
    "Generate random integers within a specified range, such as rolling dice from 1 to 6.",
    "Randomly select one or more items from options, with optional probabilities or weights.",
];

const TOOL_EXAMPLES = [
    `"Roll two dice" -> randomGenerator({ "mode": "range", "min": 1, "max": 6, "count": 2 })`,
    `"Randomly select one from [A, B, C] with probabilities 50%, 30%, 20%" -> randomGenerator({ "mode": "choice", "options": ["A", "B", "C"], "weights": [50, 30, 20] })`,
];

const Tool: AgentTool = {
    name: TOOL_NAME,
    description: TOOL_DESCRIPTION,
    prompt: TOOL_PROMPT,
    roles: TOOL_ROLES,
    examples: TOOL_EXAMPLES,
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
