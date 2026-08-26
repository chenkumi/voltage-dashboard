import { AgentExecutorProps, AgentTool } from "@/app/agent/agent-common";
import { toolArgumentsError } from "../shared/response";
import { executor } from "./executor";
import { InputSchema } from "./types";

const TOOL_NAME = "systemEnv";

const TOOL_DESCRIPTION = `查詢系統時間或作業系統資訊。`;

// \`cmd\`支援指令如下：
// - \`CURRENT_TIME\`: 取得系統時間。args 支援多個參數併用：
//   1. IANA時區 (如 'Asia/Taipei', 'America/New_York')
//   2. 時間偏移 (如 'd+1', 'h-2')。單位：y(年), M(月), d(日), h(時), m(分), s(秒)
// - \`OS\`: 取得作業系統資訊


const Tool: AgentTool = {
    name: TOOL_NAME,
    description: TOOL_DESCRIPTION,
    inputSchema: InputSchema,
        executor: async (props:AgentExecutorProps) => {
        const {args} = props;
        console.log("systemEnv:", args);
        const validation = InputSchema.safeParse(args);
        if (!validation.success) {
            const response = toolArgumentsError(
                TOOL_NAME,
                InputSchema,
                args,
                validation.error.message,
                { cmd: "CURRENT_TIME", args: ["Asia/Taipei"] },
            );

            console.log("systemEnv response:", response);

            return response;
        }

        const response = await executor(props, validation.data);
        return response;
    }
}

export default Tool;
