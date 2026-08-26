/**
 * 根據 Claude Code SKILL.md 規格定義的 Type Skill
 */

/**
 * Claude Code SKILL.md Header (Frontmatter) 欄位說明：
 * * @property {string} name 
 * Skill 的唯一識別名稱。將成為斜線指令 (例如 /my-skill)。若省略則預設為目錄名稱。
 * * @property {string} description 
 * (建議填寫) 描述 Skill 的功能與觸發時機。Claude 會以此決定何時自動載入此 Skill。
 * * @property {string} [argument-hint] 
 * 在自動完成 (Autocomplete) 時顯示的參數提示，例如 "[filename] [format]"。
 * * @property {boolean} [disable-model-invocation] 
 * 若為 true，Claude 不會主動觸發。僅供使用者手動輸入指令執行（適用於部署、提交等具副作用的操作）。
 * * @property {boolean} [user-invocable] 
 * 若為 false，此 Skill 將從 / 選單中隱藏，僅作為 Claude 內部的背景知識使用。
 * * @property {string | string[]} [allowed-tools] 
 * 當此 Skill 執行時，允許 Claude 無需詢問即可直接使用的工具清單（如：Read, Grep, Glob）。
 * * @property {string} [model] 
 * 指定執行此 Skill 時要使用的特定模型。
 * * @property {string} [effort] 
 * 設定推理密度 (Effort level)，選項包含：low, medium, high, max。
 * * @property {string} [context] 
 * 若設定為 "fork"，此 Skill 將在獨立的子代理 (Subagent) 上下文中執行，不共享對話歷史。
 * * @property {string} [agent] 
 * 當 context 為 "fork" 時，指定子代理的類型（例如：Explore, Plan, general-purpose）。
 * * @property {string | string[]} [paths] 
 * Glob 模式限制。僅當使用者正在處理符合路徑的檔案時，才會自動啟動此 Skill。
 * * @property {string} [shell] 
 * 指定指令中 !`command` 語法使用的 Shell 環境（bash 或 powershell）。
 */

export interface Skill {
    // 必要的標頭欄位
    name: string;
    description: string;
    skillPath?: string; // skill實體路徑(目錄)

    // 其他選用標頭欄位 (Optional Header Fields)
    "argument-hint"?: string;
    "disable-model-invocation"?: boolean;
    "user-invocable"?: boolean;
    "allowed-tools"?: string | string[];
    context?: 'fork' | string;
    agent?: string;
    model?: string;
    effort?: string;
    paths?: string | string[];
    shell?: 'bash' | 'powershell';

    // 允許擴充其他自定義標頭
    [key: string]: any;

    status: 'ready' | 'error';
    errorMsg?: string;

    // Header 以下的所有內容視為 instructions
    instructions: string;
}

export type SkillDocument = {
    name:string,
    path:string,
    content:string,
}