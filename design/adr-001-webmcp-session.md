# ADR-001：以 Chat Session 為界的 WebMCP 執行期

狀態：已採用（2026-08-27）

## 背景

原本的全域 `webMcpBridge` 同時保存 iframe、工具和 discovery 狀態。切換網站
時，仍在建立中的回合可能讀到新 iframe，造成工具和對話目標不一致。

## 決策

每個 `ChatSession` 建立一個 `WebMcpSession`。Workspace 只負責把目前 iframe
附加到這個 session；transport 在送出訊息時呼叫 `prepareTurn()`，取得不可變的
`PreparedWebMcpTurn`，再以該快照建立 `ToolLoopAgent`。

快照包含工具、工具描述、特殊提示，以及建立時的 iframe context。iframe 版本在
準備過程改變時，回合以 `WebMcpTurnInvalidatedError` 中止，不能改用新網站執行。

`ChatThread` 的 `{ siteId, url }` 是目標快照；以 `siteId` 解析展示用 registry
資料，但 iframe 使用 thread 本身的 URL。因而不再因 URL 不相等而重新導向。

## 後果

- 工具執行期不再由全域可變 singleton 共享，降低跨網站串話風險。
- 切換網站可能使正在準備的回合失效；這是刻意優先保護目標一致性的行為。
- IndexedDB schema 不變，既有 thread 可直接讀取。
- `agent_instructions` 與成對的 `skill_list` / `load_skill` 規則維持不變。

## 未來演進：方案 C

若產品需要多分頁、工作區恢復或更完整的併發控制，將升級為顯式
`WebMcpSessionState` 狀態模型，包含 `idle`、`discovering`、`ready`、`preparing`、
`invalidated`、`failed` 與明確的 `sessionId` / `frameVersion` 轉移。現階段保留
`frameVersion` 與不可變回合契約，作為該遷移的相容基礎。
