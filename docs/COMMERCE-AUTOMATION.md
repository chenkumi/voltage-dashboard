# 電商營運自動化：WebMCP 工作流

## 1. 產品定位

Voltage Dashboard 是一套既有企業 Web 系統的示範工作台。重點不是替頁面加上 AI
按鈕，而是透過 WebMCP 將商品候選、營運案件、退貨政策、審核佇列、庫存與報表等
既有模組暴露給外部 Agent。Agent 可以跨模組完成資料搜尋、內容填寫、分類、政策判斷
與草稿準備；使用者仍在原頁面檢查並執行高風險最終動作。

所有 operations state 都保存在目前頁面的 memory workspace。跨 Outlet route 會保留，
reload 或建立新的 Provider context 後重設，不寫入後端或瀏覽器持久化儲存。

## 2. 三條展示流程

### 2.1 商品上架草稿

1. Agent 用 `list_catalog_candidates` 找待處理候選。
2. 用 `get_catalog_candidate` 讀取來源時間、可信度、缺漏欄位與原廠規格。來源文字一律
   視為 untrusted content。
3. 用 `save_product_draft` 保存標題、分類、描述與六個受限規格欄位。
4. 立即用 `get_workflow_state` 驗證 candidate ID、draft version 與狀態。
5. 用 `open_product_review` 將草稿送入 Approval Inbox。
6. 使用者在 Inbox 核准建議，再按 `Publish product`。Agent 沒有發布 tool。

### 2.2 訂單異常分類

1. Agent 用 `list_ops_cases` 依 type、status、priority 篩選未出貨、付款檢核失敗或
   地址驗證異常。
2. 用 `get_ops_case` 讀取非個人的 case ID、reason code 與 immutable fact codes。
3. 用 `save_case_draft` 保存相符分類、優先級、facts 子集合、處理建議與客服草稿。
4. 用 `get_workflow_state` 驗證 draft version，再以 `open_case_review` 送審。
5. 使用者在 Inbox 核准並完成模擬案件。此流程不修改訂單、付款、退款或取消狀態。

### 2.3 退貨與售後建議

1. Agent 找到 `return_request` 案件並讀取安全 return facts。
2. 用 `check_return_eligibility` 套用固定示範政策。結果只有 `eligible`、
   `ineligible` 或 `needs_human_review`，並附 matched rules 與 missing evidence。
3. 資料不足時必須保留人工審查；不得猜測或承諾退款。
4. Agent 將完全相符的 eligibility、證據、建議與客服草稿保存並送入 Inbox。
5. 使用者執行最終模擬處理；沒有 refund、cancel 或 order mutation tool。

## 3. WebMCP 工具契約

| 分組 | Tools | 副作用與驗證 |
| --- | --- | --- |
| 商品讀取 | `list_catalog_candidates`, `get_catalog_candidate` | 唯讀；來源標記 untrusted |
| 商品草稿 | `save_product_draft`, `open_product_review` | 可逆草稿／送審；不得發布 |
| 案件讀取 | `list_ops_cases`, `get_ops_case` | 唯讀安全狀態碼；無個資、地址或付款內容 |
| 售後準備 | `check_return_eligibility`, `save_case_draft`, `open_case_review` | 固定政策、可逆草稿／送審 |
| 工作流狀態 | `list_pending_reviews`, `get_workflow_state` | 唯讀；後者是兩個 save tools 的 completion verifier |

所有 input object 都以 `additionalProperties: false` 關閉額外欄位，executor 仍會獨立
驗證 ID、enum、長度、陣列大小、內容安全、規格 allowlist、case category、evidence
provenance、eligibility 與目前 snapshot。成功輸出以約 1.5K 字元為上限；列表只回摘要，
再以單筆 tool 取得詳情。

`save_product_draft` 與 `save_case_draft` 同時在 annotation 宣告
`completionVerifier: get_workflow_state`，並在 schema 保存
`x-webmcp-completion-verifier` fallback。原生 WebMCP round-trip 若移除未知 annotation，
仍可從 schema 建立 verifier mapping。只有同步 verifier 看見預期版本後，Agent 才能
宣稱草稿已保存。

## 4. 資料與內容安全

- Workflow ID 只代表示範商品候選或營運案件，不可連回自然人。
- Operations tools 不接受或回傳姓名、Email、電話、實際地址、帳戶識別、卡號、付款
  token、憑證、連結、HTML 或 JavaScript。
- 付款檢核與地址驗證只保留 type、reason code 及 fact codes；沒有付款或地址內容。
- 商品 specifications 只允許 `material`、`capacity`、`origin`、`power`、`runtime`、
  `warranty`；key-value 合併後仍須通過內容安全檢查。
- Case evidence 必須是該案件 immutable facts 的不重複子集合。
- 退貨 eligibility 必須完全等於固定 policy 對該案件的結果。
- Audit 只保存 `id`、`actor`、`action`、`workflowId`、`occurredAt`、`result`，不複製
  prompt、標題、描述、客服草稿或建議文字。

## 5. 人機分工與 stale approval 防護

Agent 可以讀取候選／案件、建立與修改草稿、檢查退貨資格、送審、讀取待審清單與
同步 verifier。WebMCP registry 不提供 approve、complete、publish、resolve、refund、
payment、create/confirm/cancel order 等能力。

使用者只能從頁面按鈕核准、退回或完成最終操作。URL、chat confirmation 或 tool
input 不能替代頁面操作。ReviewItem 會保存送審的 `draftVersion`；pending 或 approved
草稿一旦被修改，review 立即轉為 returned。重新送審會綁定新版本，完成前也會再次比對
目前 draft version，避免核准後內容被替換。

## 6. 三分鐘 Demo 腳本

### 0:00–0:35：說明既有系統與 discovery

1. 開啟 Dashboard，展示原有 Products、Orders、Customers、Inventory、Reports，以及
   新增的 Catalog Intake、Operations Cases、Approval Inbox。
2. 用 WebMCP client discovery 顯示跨路由 tools 與四個 workflow skills。
3. 強調這是同一 Provider 暴露既有模組，不是內建 chatbot。

### 0:35–1:25：商品上架

1. 請 Agent 找候選並補商品草稿。
2. 展示 save 後立即呼叫 `get_workflow_state`；Catalog Intake 同步顯示 Agent draft。
3. Agent 送入 Approval Inbox，但無法發布。
4. 使用者核准並按 `Publish product`，Audit trail 顯示 user final action。

### 1:25–2:30：異常與售後

1. 請 Agent 找未處理的 return case、檢查資格並產生分類與客服建議。
2. 展示安全 reason/fact codes，刻意指出沒有姓名、地址與付款資料。
3. Agent 保存、verifier 確認並送審；使用者在 Inbox 核准與完成案件。
4. 強調完成只改 demo workflow，不退款、不取消也不改訂單。

### 2:30–3:00：隔離與安全收尾

1. 列出 registry，確認沒有高風險 final-action tools。
2. Reload 頁面，確認舊 drafts/reviews 不會進入新 context。
3. 若瀏覽器沒有 `document.modelContext`，明確說明本次使用同頁 fallback provider；
   不把 fallback 驗證宣稱為原生 WebMCP 實機結果。

## 7. 驗證模式

### Fallback provider

一般 Chromium 尚未提供原生 `document.modelContext` 時，頁面建立同源
`window.__webmcpTestProvider`，使用與原生註冊相同的 tool definitions 與 executor。
可用它驗證 discovery、schema、skills、完整工作流、UI 同步與 reload 隔離。

### 原生 WebMCP（待支援環境）

1. 在已啟用 WebMCP 的 Chrome 或 ChatGPT in-app browser 開啟 Dashboard。
2. 確認 `document.modelContext` 存在，且不依賴 fallback provider。
3. Discovery 應包含 11 個 operations tools、`skill_list`／`load_skill` 與四個 workflow
   skills。
4. 執行兩條 demo，確認 schema round-trip 後兩個 save mutation 仍映射
   `get_workflow_state`。
5. 確認人工 final action、reload 隔離與 console，記錄瀏覽器版本與 WebMCP 啟用方式。

若環境沒有原生 API，驗證紀錄必須標示「fallback 已通過、原生待實機」，不可混用。
