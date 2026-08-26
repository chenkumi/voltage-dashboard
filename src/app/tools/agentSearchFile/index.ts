import { AgentExecutorProps, AgentTool } from "@/app/agent/agent-common";
import { ValidationError } from '../utils';
import { executor } from "./executor";
import { InputSchema } from "./types";

const TOOL_NAME = "file";

// const TOOL_DESCRIPTION = `**檔案讀取/搜尋工具，指令範例:**
// - read_file(file_path={檔案的絕對路徑。})
// - glob_search:(path={搜尋目錄，預設為根目錄}, pattern={Glob 模式 (如 **/*.ts)})
// - grep_search(path={搜尋目錄，預設為根目錄},pattern={搜尋內容的正則表達式})
// `;

const Tool: AgentTool = {
    name: TOOL_NAME,
    // description: TOOL_DESCRIPTION,
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