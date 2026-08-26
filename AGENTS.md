# Repository Guidelines

## 專案概覽

`webmcp-agent` 是以 Vite 建置的 React Web Agent，用來操作其他提供 WebMCP 的網站。本專案不是 WebMCP Provider；`/chat` 右側是 Chat Room，左側 iframe 載入目標網站，Agent 只能使用該 iframe 當下暴露的 tools。

## 專案結構與入口

- `src/main.tsx`、`src/App.tsx`：應用程式啟動、主題與路由；主要路由為 `/chat` 與 `/webmcp-demo`。
- `src/app/assistant/`：Chat Room、IndexedDB 聊天資料來源、runtime 與訊息生命週期。
- `src/app/webmcp/`：iframe workspace、WebMCP tool bridge、WebMCP-only agent 與同源測試 demo。
- `src/app/agent/`：OpenAI 相容生成器、Agent 基礎型別、執行狀態與 runtime events。
- `src/components/ui/`、`src/lib/`、`src/hooks/`：目前使用中的 shadcn/ui、共用樣式工具、圖片快取與 UI hooks。

## WebMCP Agent 邊界

- `/chat` 使用 `webMcpAgent`；不得重新掛載 filesystem、網路、script、本地 tools 或本地 skills。
- 左側 workspace 約佔 70%，右側 Chat Room 約佔 30%；目前 iframe 預設載入同源 `/webmcp-demo`。
- `webMcpBridge` 從 iframe 的 `document.modelContext.getTools()` 取得 tools，並把執行請求送回同一個 iframe WebMCP context。瀏覽器不支援原生 API 時，demo 才使用同源測試 provider。
- `agent_instructions({})` 若存在，不掛載給 Agent；每次 user input 前呼叫，將 `{ text: string }` 放入 system prompt。
- 只有同時存在 `skill_list({})` 與 `load_skill({ name })` 才啟用特殊 skill 流程：前者每次 user input 前呼叫並將 `{ skills: { name, description }[] }` 放入 system prompt；後者掛載給 Agent，回傳 `{ type: "skill", name: string, text: string }`。不成對時，兩者皆視為一般 iframe tool。
- iframe 工具的 schema 只協助模型選擇工具；executor 必須處理錯誤，敏感副作用需保留使用者確認。跨來源整合前，確認 iframe `allow="tools"`、`exposedTo`、`fromOrigins` 與 Permissions Policy，不得繞過來源安全模型。

## 基線設定

- 使用 Node.js、npm 與 `package-lock.json`；安裝依賴執行 `npm install`。
- 開發伺服器：`npm run dev`（Vite 預設 `http://localhost:6171`）。
- 完成修改至少執行 `npm run typecheck`、`npm run lint`、`npm run build`，並手動確認 `/chat`、`/webmcp-demo` 的 iframe discovery 與 tool execution。
- <!-- user-specified -->前端使用 React 19、TypeScript、shadcn/ui、Tailwind CSS；後端若新增於本專案，使用 Node.js 與 Hono。

## 開發原則與安全邊界

- 本機密鑰放在 `.env`，不可提交 API key 或其他 secrets。
- 改變 IndexedDB schema、iframe 權限、訊息持久化或跨模組邊界前，先確認影響範圍；不得使用破壞性 git 操作或未確認的廣泛資料刪除。
- 遵循 Prettier：2 spaces、LF、無分號、雙引號、80 欄寬；Tailwind class 由 plugin 排序。元件採 PascalCase，hooks 採 `use-*.ts`。

## Commit 與 Pull Request

提交訊息使用簡短、命令式描述，例如 `feat: add iframe tool bridge`。PR 說明目的、影響範圍與驗證指令；UI 變更附截圖，並標註瀏覽器支援、跨來源權限或設定限制。

## 參考資料

- [WebMCP GitHub](https://github.com/webmachinelearning/webmcp)：規格草案、API 設計、實作狀態與安全考量。
- [Chrome WebMCP 文件](https://developer.chrome.com/docs/ai/webmcp?hl=zh-tw)：Chrome API、Origin Trial、命令式/宣告式 API、最佳做法與工具安全性。
