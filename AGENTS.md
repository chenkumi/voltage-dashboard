# Repository Guidelines

## 專案概覽

這是 `webmcp-agent` 的 Vite 前端，定位為「操作其他 WebMCP 網頁的 Web Agent」，而不是讓本專案本身成為 WebMCP Provider。使用者在右側 Chat Room 輸入自然語言，Agent 透過左側 iframe 所提供的 WebMCP tools 操作嵌入的網站。

應用程式同時保留可持久化聊天、agent runtime、瀏覽器內檔案管理、WebWorker LLM、技能載入與 IndexedDB/`indexeddb-fs` 資料處理能力；但 `/chat` 的 WebMCP Agent 僅允許使用目前 iframe 暴露的 tools。

## 專案結構與入口

- `src/main.tsx`、`src/App.tsx`：應用程式啟動與路由；主要路由為 `/chat`、`/files`、`/webmcp-demo`。
- `src/app/assistant/`：Chat Room UI、訊息資料來源、agent runtime 與執行生命週期。
- `src/app/webmcp/`：WebMCP Web Agent 功能；包含 iframe workspace、tool bridge、WebMCP-only agent 與同源測試 demo。
- `src/app/tools/`、`src/app/system/`：既有工具、技能、檔案系統與系統服務。這些模組仍保留供既有功能使用，但不得自動混入 WebMCP Agent 的 tool list。
- `src/app/file-manager/`：檔案瀏覽、編輯、圖片預覽與 ZIP 處理。
- `src/components/ui/`：shadcn/ui 元件；`src/lib/`、`src/hooks/` 放共用邏輯；`skills/` 放可載入技能。

## WebMCP Agent 架構

- `/chat` 使用 `webMcpAgent`，不使用既有 `chatAgent` 的工具清單與 known-tool fallback。
- 左側 workspace 目前載入同源 `/webmcp-demo` iframe，右側 30% 為 Chat Room；版面比例約為左 70%、右 30%。
- `webMcpBridge` 從 iframe 的 `document.modelContext.getTools()` 取得 tools，轉成專案 `AgentTool` 後提供給 Agent；工具執行必須回到 iframe 的 WebMCP context。
- `/webmcp-demo` 提供 `search_catalog`、`add_product_to_cart`、`get_cart_summary`，用於驗證 discovery、schema、tool execution 與 UI 更新流程。
- iframe 可選擇提供特殊 tools：`agent_instructions({})` 不掛載給 Agent，而是在每次 user input 前呼叫並將回傳的 `{ text: string }` 注入 System Prompt。
- 只有同時存在 `skill_list({})` 與 `load_skill({ name })` 時才啟用 skill 特殊處理：`skill_list` 在每次 user input 前呼叫並將 `{ skills: { name, description }[] }` 注入 System Prompt；`load_skill` 直接掛載給 Agent，並回傳 `{ type: "skill", name: string, text: string }`。若兩者不成對，依一般 iframe tool 處理。
- demo 優先使用瀏覽器原生 WebMCP API；若目前瀏覽器沒有 API，才使用 demo 專用的同源測試 provider。不要將測試 provider 當成跨來源整合方案。
- 未來切換跨來源網站時，需重新檢查 iframe `allow="tools"`、`exposedTo`、`fromOrigins`、來源隔離與 Permissions Policy；不可繞過瀏覽器的來源安全模型。

## 基線設定與指令

- 使用 Node.js 與 npm；依 `package-lock.json` 執行 `npm install`。
- 開發伺服器：`npm run dev`（Vite 預設使用 `http://localhost:6171`）。
- 常用驗證：`npm run typecheck`、`npm run lint`、`npm run build`；格式化使用 `npm run format`。
- <!-- user-specified -->前端使用 React 19、TypeScript、shadcn/ui、Tailwind CSS；後端若新增於本專案，使用 Node.js 與 Hono。

## 開發原則與安全邊界

- WebMCP Agent 只能使用 iframe 當前暴露的 tools；新增或修改 Agent tool source 時，必須維持此邊界，不能重新掛載 filesystem、網路、script 或既有全域工具。
- Tool schema 只協助模型選擇工具，實際 executor 仍需驗證輸入、處理錯誤，並在敏感副作用前保留使用者確認流程。
- 工具名稱、描述與參數應清楚、單一職責且不重疊；完成工具後需同步更新嵌入網站 UI 狀態與回傳結果。
- 本機密鑰放在 `.env`，不可提交 API key 或其他 secrets。涉及檔案寫入、技能執行、網路工具、iframe 權限或 IndexedDB schema 的變更，需保留既有路徑驗證與錯誤處理。
- 不得使用破壞性 git 操作或未確認的廣泛資料刪除；若要進行跨模組重構、引入重大依賴或改變持久化 schema，先確認影響範圍。

## 編碼與測試規範

遵循 Prettier：2 spaces、LF、無分號、雙引號、80 欄寬；Tailwind class 由 Prettier plugin 排序。元件與頁面採 PascalCase，hooks 採 `use-*.ts`，工具資料夾以功能命名。專案目前沒有獨立 test runner；修改行為時至少執行 typecheck、lint、build，並在瀏覽器手動驗證 `/chat`、`/webmcp-demo` 與 iframe tool discovery/execution。

## Commit 與 Pull Request

目前工作目錄沒有可讀取的 Git 歷史，因此沒有既定 commit 慣例可供遵循。提交訊息請使用簡短、命令式描述（例如 `feat: add iframe tool bridge`）。PR 應說明目的與影響範圍、列出驗證指令；UI 變更附前後截圖，並標註尚未處理的瀏覽器支援、跨來源權限或設定限制。

## 參考資料

### WebMCP

- [WebMCP GitHub](https://github.com/webmachinelearning/webmcp)：規格草案、API 設計、實作狀態與安全考量。
- [Chrome WebMCP 文件](https://developer.chrome.com/docs/ai/webmcp?hl=zh-tw)：Chrome API、Origin Trial、命令式/宣告式 API、最佳做法與工具安全性。
