# 多網站 WebMCP 與網站 thread 管理計畫

完成後，使用者可以在兩個購物網站間切換；每個網站擁有獨立的 WebMCP tools、skills 與對話紀錄，且系統會自動回到該網站最近使用的 thread。此計畫建立在既有 AI SDK `ToolLoopAgent`、`useChat`、同源 iframe 與 IndexedDB 薄型訊息模型之上。

> 本計畫請使用 `execute-plan` 技能執行。

## Scope

### In

- 建立兩個同源購物網站 demo。
- 每個網站提供不同 tools、`agent_instructions` 與 skills。
- `ChatThread` 增加 `siteId`、`url`。
- 新增網站最後使用 thread 的 IndexedDB table。
- 切換網站時載入該網站最後一次交談的 thread。
- 建立 New Thread 時更新網站的最後 thread。
- 保持 iframe-only WebMCP tool boundary。

### Out

- 不加入後端或 Hono。
- 不處理舊 IndexedDB 資料 migration。
- 不改變 `ToolLoopAgent` 與 local LLM 架構。
- 不支援跨來源 iframe 的額外安全整合。

## Files

- `src/app/webmcp/sites.ts`：網站 registry 與網站識別資料。
- `src/app/webmcp/demo.tsx`：依網站變體提供不同商品、tools 與 skills。
- `src/App.tsx`：新增兩個 demo route。
- `src/app/types.ts`：新增網站與最後 thread 型別。
- `src/app/db.ts`：新增網站最後 thread table。
- `src/app/assistant/chat-store.ts`：封裝網站 thread 查詢、建立與更新。
- `src/app/assistant/index.tsx`：處理網站切換、thread 導航與預設 thread。
- `src/app/webmcp/workspace.tsx`：加入網站切換 UI，依目前網站載入 iframe。
- `src/app/webmcp/bridge.ts`：處理 iframe 切換後的 tool reset 與重新 discovery。
- `AGENTS.md`、`PLAN.md`：同步架構與執行狀態。

## Plan

[x] 1. 建立網站 registry 與兩個 demo provider
    Depends on: 無；建立穩定的 `WebMcpSite` registry，提供 `siteId`、名稱與 iframe URL。
    - [x] 建立兩個網站設定，例如 `/webmcp-demo/shop-a` 與 `/webmcp-demo/shop-b`。
    - [x] 讓兩個網站提供不同的 tool 名稱與功能。
    - [x] 讓兩個網站提供不同的 `agent_instructions` 與 skills。
    - [x] 保留 `/webmcp-demo` 作為預設 demo 或導向第一個網站。
    Verify:
      Tier: 2
      Check: Vite smoke check 確認兩個 demo route 回應 HTTP 200，source check 確認頁面內容、tool 清單、instructions 與 skill 清單均不同；實際 iframe registration 待可用瀏覽器工具後補驗。

[x] 2. 重建 IndexedDB 網站與 thread 關聯模型
    Depends on: `WebMcpSite.siteId`，作為 thread 與最後使用紀錄的穩定識別。
    - [x] `ChatThread` 新增 `siteId` 與 `url`。
    - [x] 新增 `SiteLastThread` 型別。
    - [x] 新增 `siteLastThreads` table，以 `siteId` 作為 primary key。
    - [x] 建立依網站取得最後 thread 的查詢方法。
    - [x] 建立 thread、儲存訊息與更新最後 thread 的原子操作。
    - [x] 使用新 database name `webmcp-agent-db-v2`，不處理舊 thread migration。
    Verify:
      Tier: 1
      Check: `npm run typecheck` 通過；確認同一個 `siteId` 只能指向一個最後 thread，messages 仍只依 `threadId` 隔離。

[ ] 3. 實作網站切換與最後 thread 導航
    Depends on: `SiteLastThread` 查詢與 thread 建立介面。
    - [ ] `/chat` 進入時依預設網站載入最後 thread，沒有時建立新 thread。
    - [ ] workspace 加入網站選擇器。
    - [ ] 切換網站時載入該網站最後 thread。
    - [ ] 該網站沒有 thread 時建立新的 thread 並更新 mapping。
    - [ ] New Thread 使用目前網站的 `siteId/url` 建立並更新 mapping。
    - [ ] 直接開啟 `/chat/:threadId` 時，以 thread 的網站資料決定 iframe URL。
    - [ ] 切換網站或 thread 時停止正在進行的生成，避免舊 iframe tool call 殘留。
    Verify:
      Tier: 2
      Check: 依序操作「網站 A → 建立對話 → 網站 B → 建立對話 → 回到網站 A」，確認回到網站 A 時只看到網站 A 最後的 thread 與 messages。

[ ] 4. 連接 iframe、bridge 與 Agent context
    Depends on: `ChatThread.siteId/url` 與目前 active site。
    - [ ] `WebMcpWorkspace` 改為接受目前網站資料，不再硬編碼 iframe URL。
    - [ ] iframe URL 變更時清除舊 tool state 並重新 discovery。
    - [ ] 確認網站 A 的 tools 不會殘留到網站 B。
    - [ ] 每次送出 user input 時，重新讀取目前 iframe 的 instructions、skills 與 tools。
    - [ ] 確認不同網站的 `load_skill` 只能讀取該網站提供的 skill。
    Verify:
      Tier: 2
      Check: 在網站 A 與 B 分別呼叫各自專屬 tool，確認 tool execution、special prompt 與 tool result 都不會跨網站混用。

[ ] 5. 清理、文件與完整驗證
    Depends on: 前述網站切換與持久化流程完成。
    - [ ] 更新 `AGENTS.md`，描述網站 registry、site/thread 隔離與最後 thread table。
    - [ ] 更新 `PLAN.md` checkpoint 狀態。
    - [ ] 清除不再使用的 route、props、state 與 imports。
    - [ ] 執行 `npm run lint`。
    - [ ] 執行 `npm run typecheck`。
    - [ ] 執行 `npm run build`。
    - [ ] 手動驗證兩個網站、thread 切換、New Thread、重新整理與 IndexedDB reload。
    Verify:
      Tier: 2
      Check: `npm run lint`、`npm run typecheck`、`npm run build` 全部通過，且兩個網站的對話與 tools 維持完全隔離。

## Open questions

- 無。採用穩定 `siteId` 作為網站識別，並在 `ChatThread` 保留 `url` 作為實際 iframe 目標紀錄；使用者切換、建立 thread 或成功儲存訊息時，都更新該網站的最後 active thread。

---

此計畫基於目前已知資訊產生。若後續出現新資訊或需求變更，請重新產生計畫。
