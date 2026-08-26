import { AgentExecutorProps, AgentTool } from '@/app/agent/agent-common';
import { ValidationError } from '../utils';
import { executor } from "./executor";
import { InputSchema } from "./types";

const TOOL_NAME = "web";

// const TOOL_DESCRIPTION = `# 網路工具(搜尋/讀取/下載)
// - query: 你可以透過此工具獲取最新的新聞、知識、文件或特定的網頁內容。支援過濾時間範圍與選擇是否獲取 AI 總結內容。
// - read: 你可以指定一個網址讀取，被讀取網址的網頁內容將以Markdown格式回傳。
// - download: 你可以指定一個網址進行下載，下載完成後檔案將會儲存在下載目錄。
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