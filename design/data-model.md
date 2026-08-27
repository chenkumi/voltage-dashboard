# 資料模型

## 持久化模型

| 模型 | 必要欄位 | 目的 |
| --- | --- | --- |
| `ChatThread` | `id`、`siteId`、`url`、時間戳 | 一段對話與其 WebMCP 目標快照 |
| `StoredMessage` | ULID、`threadId`、`UIMessage` envelope | 以建立順序保存對話 |
| `siteLastThreads` | `siteId`、`threadId` | 每個 registry 網站最後開啟的 thread |

`siteId` 用來取得網站名稱與 registry 預設資料；`url` 是 thread 建立當時要載入
的目標。兩者共同形成 `ThreadSiteTarget`，不可用 registry 的 URL 覆寫既有 thread。

本次未更動 `webmcp-agent-db-v2` 或 IndexedDB 欄位。

## Chat message lifecycle

`messages` 的 `[threadId+id]` compound index 可直接提供排序後的 primary key
清單；Chat Room 開啟 thread 時只讀取這份 ID 清單，再由各 virtual row 依 ID
讀取單筆 envelope。完整 history 僅由送出模型請求前的 transport loader 讀取。

user message 在送出請求前先以穩定 ULID 寫入。assistant 串流期間只存在記憶體；
只有 finish event 同時不是 abort、disconnect 或 error 時才寫入 IndexedDB。未完成
assistant 在停止、錯誤、切換 thread 或卸載時直接捨棄，且不可進入下一輪 context。

## 記憶體執行期模型

| 模型 | 擁有者 | 壽命 |
| --- | --- | --- |
| `WebMcpSession` | 一個 `ChatSession` | ChatSession 掛載期間 |
| iframe / discovery | `WebMcpSession` | 每次 attach 至下一次 attach 或 dispose |
| `PreparedWebMcpTurn` | 一次 `sendMessages` | 該次 agent 執行完成或失效 |

`PreparedWebMcpTurn` 不可變，工具 executor 會閉包捕捉它自己的 iframe context，
而不回頭讀取 session 的目前狀態。
