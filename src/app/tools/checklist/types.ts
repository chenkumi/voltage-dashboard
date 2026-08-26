import { z } from 'zod';

// 定義清單項目的狀態
export type ChecklistStatus = 'todo' | 'doing' | 'done' | 'failed';

// 定義單一任務項目的結構
export interface ChecklistItem {
    id: number;
    task: string;
    status: ChecklistStatus;
    params?: string[];
}

// 定義 Context 中儲存的結構 (如果除了 list 還有其他元數據可擴充)
export interface ChecklistContext {
    items: ChecklistItem[];
}

const checklistItemSchema = z.object({
    id: z.number().describe("項目 ID"),
    status: z.enum(['todo', 'doing', 'done', 'failed']).describe("狀態"),
    task: z.string().optional().describe("任務描述 (save 時建議提供)"),
    params: z.array(z.string()).optional().describe("參數")
});


export const InputSchema = z.object({
    cmd: z.enum(['save', 'update', 'list']).describe("指令：save (初始化或重設清單), update (更新特定項次), list (獲取當前實體狀態)"),
    list: z.array(checklistItemSchema).optional().describe("操作的任務項次陣列 (cmd 為 list 時可省略)")
});

export type ToolArgs = z.infer<typeof InputSchema>;