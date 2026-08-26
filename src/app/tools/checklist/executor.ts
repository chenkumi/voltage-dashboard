import { AgentExecutorProps } from "@/app/agent/agent-common";
import { memory } from "../memory";
import { ChecklistItem, ToolArgs } from "./types";

export async function executor(
    _props: AgentExecutorProps,
    input: ToolArgs,
) {
    const { cmd, list = [] } = input;

    let currentItems = (await memory.load("checklist") as ChecklistItem[]) || [];

    try {
        switch (cmd) {
            case 'save':
                // 強制覆寫目前的狀態，用於初始化或大幅調整步驟 (包含新增、刪除、排序)
                currentItems = list.map(item => ({
                    id: item.id,
                    task: item.task || "未命名任務",
                    status: item.status || 'todo',
                    params: item.params || []
                }));
                break;

            case 'update':
                // 局部更新，僅修改 AI 提交的 ID 狀態
                if (currentItems.length === 0) throw new Error("無效操作：請先使用 save 初始化清單。");
                currentItems = currentItems.map(existing => {
                    const update = list.find(u => u.id === existing.id);
                    return update ? { ...existing, status: update.status } : existing;
                });
                break;

            case 'list':
                // 不執行修改，僅回傳目前狀態
                break;
        }

        // 同步回 Context
        await memory.save("checklist", currentItems);

        // 結案判定
        const allDone = currentItems.length > 0 && currentItems.every(i => i.status === 'done');
        const hasFailed = currentItems.some(i => i.status === 'failed');
        const resultStatus = allDone ? "completed" : (hasFailed ? "degraded" : "processing");

        return {
            result: resultStatus,
            current_state: currentItems,
            message: cmd === 'list' ? "讀取完成。" : "系統狀態已更新。"
        };
    } catch (e: any) {
        return { error: "CHECKLIST_ERROR", message: e.message };
    }

}