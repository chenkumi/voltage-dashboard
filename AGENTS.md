# Repository Guidelines

## 專案概覽

`webmcp-agent` 是純前端 Vite Web Agent，用來操作其他提供 WebMCP 的網站。本專案不是 WebMCP Provider：`/chat` 以 split view 呈現，左側約 70% 載入目標網站 iframe，右側約 30% 為 Chat Room。

## 專案結構與入口

- `src/main.tsx`、`src/App.tsx`：應用程式啟動、主題與路由。
- `src/app/assistant/`：Chat Room、AI SDK `useChat` runtime、訊息持久化。
- `src/app/webmcp/`：iframe workspace、WebMCP bridge、AI SDK `ToolLoopAgent`、同源測試 demo。
- `src/app/db.ts`、`src/app/types.ts`：IndexedDB schema 與訊息/執行緒 envelope 型別。
- `src/components/ui/`：目前使用的 shadcn/ui 元件與 Markdown renderer。

## WebMCP Agent 邊界

- `/chat` 只使用 iframe 當下透過 `webMcpBridge` 暴露的 tools；不得混入 filesystem、網路、script、本地 tools 或本地 skills。
- `webMcpBridge` 優先讀取 iframe 的 `document.modelContext.getTools()`，瀏覽器不支援原生 API 時才使用 `/webmcp-demo` 的同源測試 provider。工具執行必須回到同一個 iframe context。
- 每次 user input 都先重新執行 iframe 特殊 tools，再建立當次 `ToolLoopAgent` 與 system prompt；不可在 module 初始化時快取 iframe tools 或特殊 prompt。
- `agent_instructions({})` 不掛載給 Agent；每次 user input 前呼叫，將 `{ text: string }` 放入 system prompt。
- 只有同時存在 `skill_list({})` 與 `load_skill({ name })` 才啟用特殊 skill 流程：`skill_list` 每次 user input 前呼叫並將 `{ skills: { name, description }[] }` 放入 system prompt；`load_skill` 掛載給 Agent，回傳 `{ type: "skill", name: string, text: string }`。不成對時，兩者皆視為一般 iframe tool。
- iframe schema 只協助模型選擇工具；executor 必須處理錯誤，敏感副作用需保留使用者確認。跨來源整合前，確認 iframe `allow="tools"`、`exposedTo`、`fromOrigins` 與 Permissions Policy，不得繞過來源安全模型。

## 資料與 runtime

- 使用 AI SDK `ToolLoopAgent`、`useChat` 與自訂 `WebMcpChatTransport`；不維護舊自製 Agent core 或 datasource/controller runtime。
- IndexedDB 只保存薄 envelope：`StoredMessage` 以 ULID 作為主鍵與排序依據，包住 AI SDK `UIMessage`，並附 `threadId`、`createdAt`、`updatedAt`。不需支援舊 schema 遷移。
- LLM 使用 `@ai-sdk/openai-compatible` 連接本地模型；設定讀取 `VITE_APP_LLM_MODEL`、`VITE_APP_LLM_BASE_URL`、`VITE_APP_AUTH_KEY`。

## 基線設定

- 使用 Node.js、npm 與 `package-lock.json`；安裝依賴執行 `npm install`。
- 開發伺服器：`npm run dev`（Vite 預設 `http://localhost:6171`）。
- 完成修改至少執行 `npm run typecheck`、`npm run lint`、`npm run build`；UI 行為需確認 `/chat`、`/webmcp-demo`、iframe discovery 與 tool execution。
- <!-- user-specified -->前端使用 React 19、TypeScript、shadcn/ui、Tailwind CSS；本專案目前不架設後端，若未來新增後端則使用 Node.js 與 Hono。

## 開發原則與安全邊界

- 本機密鑰放在 `.env`，不可提交 API key 或其他 secrets。
- 改變 IndexedDB schema、iframe 權限、訊息持久化或跨模組邊界前，先確認影響範圍；不得使用破壞性 git 操作或未確認的廣泛資料刪除。
- 遵循 Prettier：2 spaces、LF、無分號、雙引號、80 欄寬；Tailwind class 由 plugin 排序。元件採 PascalCase，hooks 採 `use-*.ts`。

## Commit 與 Pull Request

提交訊息使用簡短、命令式描述，例如 `feat: add iframe tool bridge`。PR 說明目的、影響範圍與驗證指令；UI 變更附截圖，並標註瀏覽器支援、跨來源權限或設定限制。

## 參考資料

- [WebMCP GitHub](https://github.com/webmachinelearning/webmcp)：規格草案、API 設計、實作狀態與安全考量。
- [Chrome WebMCP 文件](https://developer.chrome.com/docs/ai/webmcp?hl=zh-tw)：Chrome API、Origin Trial、命令式/宣告式 API、最佳做法與工具安全性。
