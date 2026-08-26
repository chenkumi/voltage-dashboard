# AI SDK ToolLoopAgent 重構計畫

## 目標

將自製 Agent 核心收斂為純前端 WebAgent：使用 AI SDK `ToolLoopAgent`、`useChat` 與 `UIMessage`，直接連線 local OpenAI-compatible LLM，且只允許操作嵌入 iframe 當下暴露的 WebMCP tools。不加入後端、Hono、API key 安全層或舊資料 migration。

## 已完成

### Checkpoint 1：AI SDK 與 persistence model

- [x] 新增 `ai`、`@ai-sdk/react`、`@ai-sdk/openai-compatible`。
- [x] 以 ULID 建立 thread/message ID。
- [x] 重建 Dexie schema；`StoredMessage` 以薄 envelope 包住 `UIMessage`，附 `threadId`、`createdAt`、`updatedAt`。

### Checkpoint 2：WebMCP bridge

- [x] iframe tools 轉為 AI SDK dynamic `ToolSet`。
- [x] 保留 native `document.modelContext` 與同源 demo provider fallback。
- [x] `agent_instructions` 不掛載，改在每次 user input 前注入 system prompt。
- [x] `skill_list` 與 `load_skill` 成對時才啟用特殊 skill 流程；`load_skill` 掛載給 Agent。

### Checkpoint 3：ToolLoopAgent

- [x] 建立當次 `ToolLoopAgent`、`instructions` 與 iframe-only tools。
- [x] 使用 local OpenAI-compatible provider 與 `stepCountIs(9)`。
- [x] 移除自製 tool loop、auto-continue 與 OpenAI response parser。

### Checkpoint 4：useChat runtime

- [x] Chat Room 改用 AI SDK `useChat<UIMessage>`。
- [x] 建立薄型 `WebMcpChatTransport`，每次送出時重新 discovery/建構 Agent，以支援動態 iframe tools。
- [x] 由 AI SDK 管理 streaming、abort、status 與 tool parts。

### Checkpoint 5：Chat UI

- [x] Chat window 直接讀取 `UIMessage.parts`，顯示 text、reasoning、tool 與 image parts。
- [x] Chat input 改呼叫 `sendMessage`，保留 stop、copy、speech 與日期標籤。
- [x] 保留 70/30 split view、同源 `/webmcp-demo` iframe 與 Chat Room。

### Checkpoint 6：清理

- [x] 刪除 `src/app/agent/`、舊 assistant runtime/controller/datasource/converter。
- [x] 移除檔案管理時期的 Cache Storage service worker、cache manager 與未使用 UI modules。
- [x] 移除未使用 npm dependencies，更新 `AGENTS.md`。

## 驗證

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run build`
- [x] Vite smoke check：`/`、`/chat`、`/webmcp-demo` 均回應 HTTP 200。
- [ ] 需要具備可用瀏覽器工具後，再手動驗證 iframe discovery、tool execution、streaming 與 IndexedDB reload。

## 目前技術決策

- 動態 WebMCP tools 不使用 `DirectChatTransport` 的靜態 tool validation，採最薄的 custom transport。
- 由 `createWebMcpAgent()` 在每次 user input 前呼叫特殊 tools，再建立當次 system prompt 與 tool list。
- IndexedDB 直接使用新 database name `webmcp-agent-db`，不支援舊 schema。
