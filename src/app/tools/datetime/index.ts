import { AgentExecutorProps, AgentTool } from "@/app/agent/agent-common";
import { executor } from "./executor";
import { InputSchema } from "./types";
import { ValidationError } from '../utils';

const TOOL_NAME = "datetimeConverter";

const TOOL_DESCRIPTION = `Convert, calculate, and format dates and times.`;

const TOOL_PROMPT = `Use when the user asks for current time, date arithmetic, timezone conversion, date formatting, or Gregorian and Chinese lunar calendar conversion.`;

const TOOL_ROLES = [
    "Get current time in ISO, formatted string, or timestamp formats.",
    "Add or subtract years, months, weeks, days, hours, minutes, or seconds.",
    "Convert dates and times between IANA timezones such as Asia/Taipei, UTC, or America/New_York.",
    "Convert between Gregorian dates and Chinese lunar calendar dates.",
    "Format date and time output when the user requests a specific display format.",
];

const TOOL_EXAMPLES = [
    `"What time is it now?" -> datetimeConverter({ "now": true })`,
    `"What is the date 30 days from now?" -> datetimeConverter({ "now": true, "arithmetic": [{ "action": "add", "value": 30, "unit": "day" }] })`,
    `"Convert current time to New York timezone" -> datetimeConverter({ "now": true, "timezone": "America/New_York" })`,
    `"Find the lunar date for 2024-02-10" -> datetimeConverter({ "date": "2024-02-10", "lunar": true })`,
    `"What is the Gregorian date for Lunar 2024-01-01?" -> datetimeConverter({ "lunar": { "year": 2024, "month": 1, "day": 1 } })`,
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
