# 資料模型

## 持久化模型

| 模型 | 必要欄位 | 目的 |
| --- | --- | --- |
| `SiteProfile` | `siteId`、`url`、`name` | registry 網站的持久化 metadata 與 URL 對應 |
| `ChatThread` | `id`、`siteId`、`url`、`title`、時間戳、可選 `pin`/`customTitle` | 一段對話與其 WebMCP 目標快照 |
| `StoredMessage` | ULID、`threadId`、`createdAt`、`updatedAt`、`UIMessage` envelope | 以建立順序保存對話 |
| `siteLastThreads` | `siteId`、`threadId`、`updatedAt` | 每個 registry 網站最後開啟的 thread |

`siteProfiles` 使用 `siteId` 作為 primary key，並以唯一 `url` index 支援 URL 查詢。
目前 seed 為 `market → /market` 與 `dashboard → /dashboard`。App 啟動時以
transaction + `bulkPut` 冪等初始化兩筆 profile；profile query 本身只讀取，避免
在 Dexie live query 中寫入資料。

`siteId` 用來取得網站名稱與 profile；建立 thread 時從 profile 複製 `url`，形成
不可被 registry URL 覆寫的 `ThreadSiteTarget` snapshot。`siteLastThreads` 只保存
每個 site 的最後 active thread；讀取時若 mapping 指向不存在或其他 site 的 thread，
只回報 stale，另由明確 cleanup transaction 清理。建立 thread 以
`createAndActivateThread` 在同一 transaction 寫入 thread 與 mapping；若 thread ID
已屬於不同 site 或 URL，操作會拒絕覆蓋。

資料庫名稱維持 `webmcp-agent-db-v2`，Dexie schema version 維持 1，既有
`threads`、`messages`、`siteLastThreads` schema 保留並新增 `siteProfiles` table。
本次不做舊資料 migration；部署前先刪除整個 `webmcp-agent-db-v2`，再以新 schema
初始化。

## Route 與 thread lifecycle

`/` 是 Assistant host，URL 不包含 threadId。Assistant 以目前 profile URL 查到
siteId，再透過 `siteLastThreads` 恢復該 site 最後的 thread；沒有有效 mapping 時
建立並 activate 新 thread。New Thread 以 atomic persistence 建立；site switch 選取
既有 thread 時以 transaction 更新 active mapping，建立缺少的 thread 時同樣使用
atomic persistence；切換後由 live query 觸發畫面更新。每個 ChatThread 保持自己的 `siteId + url`
target snapshot；`thread.id` 是 `ChatSession` 的 React key，因此 session、runtime、
transport 與 iframe discovery 會隨 thread 邊界重建。

`/market` 與 `/dashboard` 是可直接載入的 iframe demo route，不會渲染 Assistant；
Assistant workspace 的 iframe 則使用 thread snapshot URL。網站切換後舊的
`WebMcpSession` dispose，新 session 只 discovery 新 iframe 暴露的 tools、instructions
與 skills。

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
