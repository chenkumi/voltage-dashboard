# WebMCP Agent 實機測試紀錄

## 執行原則

- 主代理在已登入的內建瀏覽器中實際操作 WebMCP。
- 一次僅使用一個子代理；子代理只負責劇本、檢查點與結果審查，不操作瀏覽器。
- 每個案例完成後，先記錄證據與改善項目，再進入下一案。

## TC-F-002：Dashboard 唯讀營運摘要

- 日期：2026-08-31
- 狀態：通過
- 起始頁：`/dashboard`
- 實際呼叫：`get_voltage_admin_dashboard({})`

| 指標 | WebMCP 回傳 | Dashboard 畫面 | 結果 |
| --- | ---: | ---: | --- |
| 訂單 | 65 | 65 | 一致 |
| 需要處理訂單 | 13 | 13 | 一致 |
| 可售 SKU | 190 | 190 | 一致 |
| 低庫存 | 29 | 29 | 一致 |

### 審查結論

- 僅使用預期的唯讀工具；未導覽、未呼叫其他工具、未寫入資料。
- 未發現功能缺陷。
- 後續案例建議保留執行時間與 Dashboard 截圖，作為更完整的可追溯證據。

## FIND-001：未儲存商品草稿阻塞自動導覽

- 日期：2026-08-31
- 影響範圍：商品建立草稿頁離開時的跨頁導覽。
- 觸發步驟：以 `apply_product_editor_draft` 填入可逆草稿後，嘗試透過 WebMCP 導覽至庫存頁。
- 實際結果：頁面出現「捨棄未儲存變更」的阻塞式 JavaScript 確認視窗；在使用者手動捨棄前，後續自動控制無法繼續。
- 風險：長流程 Agent 測試與跨模組工作流會停在確認視窗，且需要人工決定是否捨棄草稿。

### 改善建議

採用可恢復的自動保存草稿。離開頁面時不要求立即捨棄；下次進入相同 editor 時，由使用者選擇繼續既有草稿或捨棄。此設計可保留使用者對草稿的控制權，並降低阻塞式確認對自動化流程的影響。

## 2026-08-31：八個營運模組的三情境實機測試

### 覆蓋結果

| 模組 | 三個 Agent 操作情境 | 結果 |
| --- | --- | --- |
| Dashboard | 摘要查詢、低庫存導覽、back/forward 導覽 | 通過 |
| 商品 | 搜尋至詳情、分類盤點、新品可逆草稿 | 通過 |
| 庫存 | 週期摘要、低庫存詳情、單品年度風險 | 通過 |
| 訂單 | 付款失敗分流、匿名明細、明細導覽返回 | 通過 |
| 顧客 | 客群彙總、90 天導覽彙總、重讀一致性 | 通過 |
| 退貨 | RMA 詳情、review state、資格政策試算 | 通過 |
| 退款核准 | 全部、待核准、待執行安全清單 | 通過；詳情流程受測試資料阻塞 |
| 報表 | schema 查詢、可逆報表草稿、具證據 widget 新增後移除 | 通過 |

所有案例均只使用安全查詢、導覽或可逆草稿；未執行商品發布、庫存異動、訂單異動、RMA 提交、退款核准或退款執行。

### FIND-002：導覽後 WebMCP 工具快照短暫過期

- 觸發：以工具導覽到另一個 route 後，URL 已切換但首次取得的工具 snapshot 仍可能指向舊頁。
- 實際結果：呼叫新頁可用的 `navigate_state` 得到「tool is not available in this snapshot」；等待約 300ms 並重新 discovery 後恢復正常。
- 影響：Agent 若只根據 URL 立即呼叫工具，會把正常 route 切換誤判為工具不可用。
- 建議：Provider 暴露可等待的「工具集已就緒」訊號，或在導覽回應中明確指出 Agent 應等待工具變更通知後再重新 discovery；不要依賴固定等待時間。

### FIND-003：Returns 跨工具 ID 欄位不一致

- 觸發：`search_returns({})` 的結果項目使用 `id`，但 `open_return_detail` 與 `get_return_detail` 的輸入欄位要求 `rmaId`。
- 實際結果：將不存在的 `result.rmaId` 直接傳入會失敗；以 `result.id` 映射為 `rmaId` 才能繼續。
- 影響：Agent 難以可靠地串接「搜尋 → 詳情」工作流。
- 建議：搜尋結果直接回傳 `rmaId`，或同時提供 `id` 與 `rmaId` 並在 schema／描述中清楚說明其對應。

### FIND-004：退款流程 fixture 不足

- `RMA-2005` 未建立退款計算，`get_refund_calculation` 正確回覆 `Refund calculation was not found`，但無法驗證計算正常路徑。
- `list_refund_approvals` 的全部、待核准與待執行查詢皆回傳 `total: 0`，因此無 `approvalId` 可驗證詳情、不可變計算與重讀一致性。
- 建議：補齊至少一筆具有退款計算的 RMA，以及各關鍵狀態的 refund approval fixture，讓安全詳情與人工核准前流程能被完整實測。

### 劇本對齊事項

- 商品 editor 的版本欄位為 `version`，不是泛稱的 `editorVersion`。
- 庫存與顧客導覽會附加 `period` query parameter；route 斷言應允許安全 query string。
- 訂單詳情回應結構為 `{ order, items }`；斷言應從 nested `order` 讀取狀態與 timeline。

## 2026-08-31：修正後第二輪內建瀏覽器實測

| 鏈路 | 實際證據 | 結果 |
| --- | --- | --- |
| 導覽與重新 discovery | 從 `/products/add` 導覽至 `/returns` 後，舊 snapshot 對 `open_product_create` 回覆 unavailable；重新 discovery 後即可呼叫，符合 Agent instructions 的提醒。 | 通過 |
| 商品草稿 | `apply_product_editor_draft` 使 `draftPersistence.saved` 變為 `true`；離開再進入 `/products/add` 後，同一草稿與 `draftPersistence.restored: true` 均可讀取。 | 通過 |
| Returns identifier | `search_returns({ approvalStatus: "pending" })` 的 `rmaId` 直接傳給 `get_return_detail` 與 `open_return_detail`；回傳和路由均為 `RMA-2006`。 | 通過 |
| 退款 fixture | 重載後既有 IndexedDB 自動補齊 `RMA-2006`～`RMA-2008`；讀到有效 `CAL-2006`，approval 清單涵蓋 pending、returned、approved/pending_execution，並可開啟 `APR-2008` 詳情。 | 通過 |

### 修正後觀察

- 開發中的既有 Return Repository 若曾在舊 hot-update 階段取得目前 seed version 但遺漏 fixture rows，僅依 version 判斷不足；初始化改為 idempotent 地補齊缺少的 seed rows，且不覆寫已存在資料。
- native WebMCP handle 在 SPA route 變更後會正確拒絕舊 snapshot；Agent 應將該回應視為重新 discovery 的訊號，不可重試舊 handle 或以固定延遲取代 discovery。

## 2026-08-31：第三輪逐頁 Agent 操作測試

- 環境：已登入的 Codex 內建瀏覽器，`http://localhost:6171`，以 WebMCP tool 呼叫完成；沒有連接外置 Chrome。
- 範圍：八個主導覽頁面；商品、訂單、庫存、退貨與退款核准均包含其代表性詳細頁導覽。
- 紀錄：共 50 筆逐案觀測，包含首次 discovery／重試、工具輸入、回傳與 DOM 可見狀態；以下保留每個頁面的 3–5 條可重放業務指令。
- 安全邊界：只使用安全查詢、導覽與既有可恢復草稿的讀取／恢復驗證；未發布商品、調整庫存、異動訂單、提交 RMA、核准或執行退款，也未建立或覆寫報表。

| 頁面 | Agent 操作指令（實際 WebMCP） | UI／結果比對 | 狀態 |
| --- | --- | --- | --- |
| Dashboard | 1. 開啟儀表板。2. 讀取營運摘要。3. 探索唯讀資料集。4. 搜尋 beauty 商品。 | 摘要的營收 `US$115,045.23`、訂單 `65`、需處理 `13`、顧客 `28`、可售 SKU `190`、低庫存 `29` 均與 KPI 卡一致；資料集列出 12 張受控表。 | 通過 |
| 商品 | 1. 開啟商品。2. 列出分類。3. 搜尋 beauty。4. 以回傳 product ID 讀取商品。5. 開啟商品詳情。 | `search_admin_products` 的第一個 `id: 1` 可直接傳給 `get_admin_product`／`open_product_detail`；詳情的名稱、價格、規格與 3 則評價可見。 | 通過 |
| 商品建立草稿 | 1. 開啟建立商品。2. 讀取 editor state。3. 導覽至儀表板。4. 再開啟建立商品並重讀 state。 | 已存在的本機測試草稿 `LIVE-AGENT-DRAFT-1` 於回到 `/products/add` 後仍可讀取，`draftPersistence.saved/restored` 均為 `true`；沒有阻塞式確認。 | 通過；保留草稿供後續測試 |
| 訂單 | 1. 開啟訂單。2. 搜尋需處理訂單。3. 以回傳 orderNumber 讀明細。4. 開啟明細頁。 | `VM-25065` 可完整串接；回傳的失敗付款／履約異常／總額與詳細頁狀態、明細及遮罩客戶資料一致。 | 通過（見 FIND-005） |
| 顧客 | 1. 開啟顧客。2. 讀取近 90 天區域客群。3. 讀取 VIP 區域客群。4. 開啟南區 VIP、90 天分析頁。 | 第一個查詢只回傳人數達 5 的 central 群組，並標示 `suppressedGroupCount: 3`；VIP 細分為空結果且保留抑制統計；導覽 query string 與 UI 篩選一致。 | 通過 |
| 庫存 | 1. 開啟庫存。2. 讀取本月摘要。3. 搜尋低庫存並依存量排序。4. 以回傳 productId 讀明細。5. 開啟庫存詳情。 | 摘要為 194 個商品、29 個低庫存、4 個缺貨；`productId: 102` 可直接串接，詳情回傳存量 `1`、風險與異動歷史；導覽路徑為 `/inventory/102?period=month`。 | 通過 |
| 退貨管理 | 1. 開啟退貨。2. 讀取目前導覽 state。3. 搜尋 active RMA。4. 將回傳 `rmaId` 讀明細。5. 開啟 RMA 詳情。 | Active 搜尋回傳 5 筆 fixture；`RMA-2005` 的資格缺漏、品項與頁面狀態一致，並可開啟 `/returns/RMA-2005`。 | 通過（見 FIND-005） |
| 退款核准 | 1. 開啟退款核准。2. 篩選已核准且待執行。3. 以回傳 approvalId 開啟核准單。4. 讀取不可變計算。 | `APR-2008` 可直接串接；清單與頁面均顯示待執行、`US$0.79`，詳細回傳的 `CAL-2008`、RMA 版本與驗貨結果亦一致。 | 通過 |
| 報表 | 1. 開啟報表。2. 讀取 report state。3. 列出 skills。4. 載入 `voltage-report-authoring`。5. 查詢 dataset status。 | 空白畫布與 `report: null` 一致；skill 載入後以 `agent_dataset_status` 成功取得 12 個資料集、`Asia/Taipei`、期間與完整度。 | 通過（見 FIND-006） |

### FIND-005：SPA 導覽後第一次 discovery 仍可能給出 stale handle

- 觸發：從退款核准詳細頁導覽到 `/returns`，以及從 Dashboard 導覽到 `/orders` 後，立刻 `fetchTools()` 並呼叫新頁工具。
- 實際結果：URL 與 UI 已切到目標頁，但第一次取得的 snapshot 分別拒絕 `navigate_state`（not available）與 `search_orders`（stale）；下一次重新 discovery 後，兩者皆正常成功。
- 分類：能力同步問題，不是業務 tool 或 fixture 缺口。
- 影響：已遵循 `agent_instructions` 的「導覽後重新 discovery」仍可能需要額外一次重新 discovery；Agent 若把第一次拒絕視為業務失敗，會錯誤中止流程。
- 改善建議：在導覽 tool 成功回應中提供可觀測的 `toolsReady`／revision，或等 WebMCP tool registry 完成更新後才 resolve 導覽 Promise；至少對 stale error 提供結構化 `RE_DISCOVER_REQUIRED` code，讓 Agent 能以一次受控的重新 discovery 復原。

### FIND-006：報表資料語意需要被明確 discovery；錯誤訊息可更可操作

- 觸發：未先按 skill 指引確認表欄位，就以 `SUM(gross_revenue)` 查詢 `agent_sales_daily`。
- 實際結果：唯讀 SQL 正確拒絕該查詢；載入 `voltage-report-authoring` 後，以其明示的 `agent_dataset_status` 查詢成功。
- 分類：測試腳本假設錯誤，並非資料缺失或權限問題；同時 `skill_list` 的清單欄位為 `skills`，不是腳本假設的 `items`。
- 改善建議：維持現有安全拒絕，但讓 SQL error 回傳結構化原因（例如未知欄位／不允許的語意）與下一個安全步驟；在 `skill_list` description 明示回傳 root 欄位為 `skills`，可減少 Agent 的 schema 猜測。

### 本輪結論與後續資料需求

- 退款核准三個新 fixture（pending、returned、approved／pending_execution）均可被實測，沒有再出現缺少正常路徑測試資料的阻塞。
- 顧客小於 5 人的分組被正確抑制；這是刻意的隱私邊界，不是空資料缺陷。
- 本輪未發現新的核心業務 tool 契約不一致；`rmaId` 與 approval ID 的跨工具串接均成功。
- 留存的 `LIVE-AGENT-DRAFT-1` 為本機可恢復測試草稿。若要清除，應由使用者在商品建立頁使用「捨棄已儲存草稿」，不可由 Agent 未經確認刪除。

## 2026-08-31：第四輪實機回歸測試（重新 discovery 契約後）

- 環境：已登入的 Codex 內建瀏覽器與 `http://localhost:6171`；直接使用 WebMCP，未使用外置 Chrome。
- 安全邊界：僅安全查詢與導覽；未填寫或清除草稿，未建立報表，未執行任何核准、退款、提交、發布或庫存異動。

| 模組 | 實際案例 | 結果 |
| --- | --- | --- |
| Dashboard | 導覽、`agent_instructions`、導覽 state、營運摘要、skill list | 通過；導覽回傳 `nextToolset.status: "RE_DISCOVER_REQUIRED"`。 |
| 商品 | 分類、搜尋、詳情、詳情導覽、編輯器導覽與 state | 讀取及 UI 比對通過；見 FIND-007。 |
| 庫存 | 月度摘要、低庫存排序、單品明細、詳情導覽與 UI 歷史 | 通過；產品 9 的存量、期間變化與異動紀錄一致。 |
| 訂單 | 需處理訂單搜尋、明細、詳情導覽、UI 金額與時間軸 | 通過；`VM-25065` 的失敗付款與履約異常一致。 |
| 顧客 | VIP 區域彙總、少量群組、篩選導覽與 UI | 隱私抑制正確；見 FIND-009。 |
| 退貨 | RMA 詳情、審查草稿 state、錯誤版本拒絕、正確版本資格試算 | 通過；版本不符回 `ARGUMENT_ERROR`，正確試算不改寫人工資格。 |
| 退款核准 | pending 清單、approval 導覽、詳細不可變計算與 UI | 通過；`APR-2006` 的 `US$7.99`、計算與 RMA 版本一致；見 FIND-007。 |
| 報表 | 載入 authoring skill、dataset status SQL、report state、無效 SQL | 正常唯讀查詢通過；無效 SQL 的 agent 可操作性見 FIND-008。 |

### FIND-007：首次重新 discovery 仍早於 route-specific tools 的發布

- 觸發：`open_product_edit({ productId: 1 })` 回傳 `RE_DISCOVER_REQUIRED` 後立即首次 `fetchTools()`，再呼叫 `get_product_editor_state`；`open_refund_approval({ approvalId: "APR-2006" })` 後同樣立即呼叫 `get_refund_approval`。
- 實際結果：URL 與 UI 均已切至目標詳細頁，但第一次 snapshot 仍回覆「tool is not available in this snapshot」；第二次 `fetchTools()` 才可成功呼叫新頁 tool。
- 影響：目前 `agent_instructions` 要求「只重新 discovery 一次」，實際上卻需要第二次，Agent 無法依既定契約完成商品草稿與退款詳情工作流。
- 改善建議：導覽工具應等待 route-specific WebMCP registry 完成發布才 resolve，或在第一次 discovery 尚未 ready 時由 host／頁面回傳可辨識的 `RE_DISCOVER_REQUIRED`，並附帶同一 revision 的 ready 訊號；不要把首次空快照當成可完成的 discovery。

### FIND-008：SQL 執行失敗仍被 host 壓縮為非結構化例外

- 觸發：`execute_readonly_sql({ sql: "SELECT missing_column FROM agent_dataset_status" })`。
- 實際結果：Agent 僅收到 `The read-only SQL query could not be executed.` 的 browser error；新 description 雖已引導先查 skill、`agent_dataset_status` 與 `sqlite_schema`，但未取得 `SQL_EXECUTION_ERROR` 或可解析的下一步欄位。
- 影響：Agent 無法分辨未知欄位、SQL 語法、policy 拒絕或 runtime 問題，也不能受控選擇修復流程。
- 改善建議：報表 executor 對可預期的安全 SQL 失敗改回傳 `{ status: "SQL_EXECUTION_ERROR", retryable: false, nextStep: "LOAD_SKILL_OR_INSPECT_SCHEMA" }`（必要時附安全分類），而非 throw 到 WebMCP host。

### FIND-009：客群隱私抑制與真正空資料的語意仍不夠明確

- 觸發：`get_customer_analytics({ segment: "vip", period: "365d", groupBy: "region" })`。
- 實際結果：回傳 `items: []`、`total: 0`、`suppressedGroupCount: 4`；UI 同時顯示有 9 位 VIP 顧客與 6 筆符合篩選的顧客。
- 影響：數字本身安全且正確，但 Agent 很容易把 `total: 0` 解讀為沒有 VIP，而非所有區域分組均未達至少 5 人的隱私門檻。
- 改善建議：在 `suppressedGroupCount > 0 && total === 0` 時回傳明確的 `status: "GROUPS_SUPPRESSED"` 或 `reason: "MINIMUM_GROUP_SIZE"`，並保留 `minimumGroupSize`，避免將隱私抑制誤報為業務空結果。

## 2026-08-31：第五輪實機回歸測試（toolset readiness 與結果語意修正後）

- 環境：已登入的 Codex 內建瀏覽器，`http://localhost:6171`；直接使用 WebMCP，未連接外置 Chrome。
- 安全邊界：只執行安全查詢、導覽與資格試算；未填寫草稿、未建立報表，也未執行發布、提交、核准、退款、庫存或訂單異動。
- 自動化基線：`npm run test` 71 files／623 tests 通過；`npm run typecheck`、`npm run lint`、`npm run build` 通過。初次 build 發現 `erasableSyntaxOnly` 與 nullable test assertion，修正後重跑通過。

| 鏈路 | 實際輸入與關鍵回應 | URL／UI 對照 | 結果 |
| --- | --- | --- | --- |
| 商品編輯器單次 discovery | `open_product_edit({productId:1})` 回傳 `nextToolset: {status:"READY",route:"/products/edit/1",revision:2,ready:true}`；只重新 discovery 一次後，`get_product_editor_state({})` 回傳 `status:"OK"`、`mode:"edit"`、`productId:1`。 | URL 為 `/products/edit/1`。 | 通過；首次 snapshot 即含 route-specific tool。 |
| 退款核准單次 discovery | `open_refund_approval({approvalId:"APR-2006"})` 回傳 `READY`、route `/refund-approvals/APR-2006`、revision 3；只重新 discovery 一次後，`get_refund_approval` 回傳 `APR-2006`／`RMA-2006`。 | URL 為 `/refund-approvals/APR-2006`。 | 通過；首次 snapshot 即可讀取詳情。 |
| SQL 結構化錯誤 | `execute_readonly_sql({sql:"SELECT missing_column FROM agent_products LIMIT 1"})` 回傳 `status:"SQL_SCHEMA_MISMATCH"`、`reasonCode:"SQL_EXECUTION_ERROR"`、`retryable:true` 與查詢 `sqlite_schema` 的 `nextStep`。 | 沒有 Browser Use exception，也沒有原始 SQLite 訊息。 | 通過。 |
| 客群全數抑制 | `get_customer_analytics({segment:"vip",groupBy:"region"})` 回傳 `outcome:"ALL_GROUPS_SUPPRESSED"`、`reasonCode:"MINIMUM_GROUP_SIZE"`、`visibleGroupCount:0`、`suppressedGroupCount:4`、`items:[]`。 | 未輸出任何被抑制群組人數或個人欄位。 | 通過。 |
| RMA 資格試算 | 導覽至 `RMA-2005` 後，試算回傳 `scope:"SIMULATION"`、`persisted:false`、`uiStateChanged:false`、decision `eligible`；前後 `get_return_detail` 的 version、eligibility 與 status 完全一致。 | URL 為 `/returns/RMA-2005`；DOM 仍顯示資格「需要補充資訊」、核准狀態「尚未送審」，沒有阻塞式 alert。 | 通過；試算未改寫人工狀態。 |

### 第五輪結論

- FIND-007 已關閉：商品與退款核准在導覽回傳 ready 後，各只需一次 fresh discovery。
- FIND-008 已關閉：可預期 SQL 失敗是安全結構化結果，不再被 host 壓成例外。
- FIND-009 已關閉：`ALL_GROUPS_SUPPRESSED` 與 `NO_MATCHING_DATA` 可明確區分。
- 本輪未發現新的阻塞式 alert、高風險寫入或 route-specific tool 同步問題。

## 2026-09-01：退貨七階段與人工備註重構實機驗收

- 環境：使用者執行中的 Vite 開發伺服器與已登入 Codex 內置瀏覽器；程式修改透過 HMR 套用，必要時重新載入頁面以驗證 IndexedDB migration。
- 測試方式：主 Agent 直接呼叫頁面 WebMCP；每次導覽成功後只重新 discovery 一次，再以畫面 DOM、唯讀 verifier 與工具 registry 交叉驗證。
- 安全邊界：只建立目前帳號可恢復的備註草稿；未發布或捨棄備註，未做資格決定、收貨、驗貨、核准、退款或重新入庫。

| 案例 | 實際操作與觀測 | 結果 |
| --- | --- | --- |
| 退貨申請階段 | 以 `open_return_create({orderId:"VM-25052"})` 開啟申請頁，單次重新 discovery 後以 `apply_return_form_draft` 填入 1 件商品，再由 `get_return_form_state` 驗證 version 2、`valid: true`、`dirty: true`。 | 通過；UI 顯示「新增退貨」、儲存草稿與提交退貨均為人工按鈕，Agent 沒有建立或提交工具，也沒有 dialog。 |
| RMA 資格階段 | 讀取 `RMA-2005`，以 `apply_my_return_note_draft` 建立 eligibility 備註，再由 `get_my_return_note_draft` 驗證版本與內容；重新載入後 UI 恢復同一份草稿。 | 通過；修正外部 WebMCP 寫入後備註元件未同步更新的問題。 |
| 草稿版本衝突 | 對既有 version 1 草稿再次使用 `expectedVersion: 0`。 | 回傳結構化 `VERSION_CONFLICT` 與只重讀一次 verifier 的 `nextStep`；原草稿未被覆寫。 |
| 單次重新 discovery | 從 RMA 導覽至 `APR-2006`；舊 handle 被 host 拒絕，fresh discovery 一次後即可讀取核准資料。 | 通過；導覽回傳 `rediscoveryRequired: true` 與 ready revision。 |
| 待核准 | `APR-2006` 顯示第 6 階段目前待辦、單一人工決策區及固定退款計算；WebMCP 可填寫目前帳號備註但不能做決策。 | 通過；UI 與安全工具投影一致。 |
| 收件、驗貨、計算、執行 | 分別檢查 `RMA-2004`、`RMA-2011`、`RMA-2007`、`RMA-2008`。 | 通過；目前階段依序為 receipt、inspection、refund_calculation、refund_execution；驗貨頁顯示逐商品「完成驗貨」人工操作與平行庫存處置，`RMA-2004` 的摘要名稱已修正為「退貨收件」。 |
| 已核准與已退回 | 檢查 `APR-2008` 與 `APR-2007`。 | 通過；已核准案件落在第 7 階段且只有人工「記錄退款結果」入口，已退回案件回到第 5 階段；兩者均無可用決策 radio。 |
| 已拒絕 | 新增 `APR-2009`／`RMA-2009` fixture，透過清單、導覽、詳情與 UI 驗證。 | 通過；第 6 階段為終止狀態，第 7 階段不適用，沒有決策操作。 |
| 已失效 | 新增 `APR-2010`／`RMA-2010` fixture，透過清單、導覽、詳情與 UI 驗證。 | 通過；流程回到第 5 階段，Agent 指示明確區分「第 6 階段核准記錄」與 RMA 實際 `refund_calculation` 階段。 |
| 阻塞式提示 | 草稿建立、HMR、重新載入及跨 route 導覽期間檢查 DOM。 | 通過；未出現 `alert`、`confirm`、`beforeunload` 或 dialog，草稿可於重新進入後繼續或由使用者捨棄。 |
| 高風險能力邊界 | 檢查 route-specific tool 描述與 registry。 | 通過；只有備註草稿讀寫與安全查詢／導覽，沒有發布、捨棄、資格決定、收貨、驗貨、核准、退款結果或重新入庫工具。 |

### 本輪修正與資料遷移

- 補齊七階段、核准摘要與決策結果的繁中翻譯，並消除 `receipt` 翻譯鍵碰撞。
- 備註元件以目前帳號草稿版本作為同步依據；WebMCP 自動儲存後 UI 立即呈現，重新載入仍可恢復。
- 新增 rejected、invalidated 退款核准 fixture，讓五種核准狀態均可實機驗收。
- 新增停在 `inspection` 的 `RMA-2011` fixture，讓七個 RMA 階段不必越過人工收貨操作即可逐階段驗收。
- 開發中曾短暫產生錯誤的 `APR/RMA-20010` ID；seed version 5 migration 只在完整 fixture 特徵吻合且沒有任何使用者備註時移除相關列。若已有草稿或發布備註則保留整個案件，避免內容遺失；正確 `APR/RMA-2010` 與其他使用者資料不受影響。實機 migration 後 rejected、invalidated 各只回傳一筆。
- `RMA-2011` 初版曾指向錯誤測試訂單；seed version 7 同樣只在完整舊 fixture 特徵吻合且無備註時替換。實機 migration 後 WebMCP 與 UI 均顯示 `RMA-2011`／`VM-25016`、received logistics 與 in-progress inspection。
- `agent_instructions` 在 Approval 詳情頁同時描述核准記錄所屬第 6 階段與 RMA 實際目前流程階段，避免 returned／invalidated／approved 案例誤導 Agent。

### 留存狀態

- 本機瀏覽器保留 `RMA-2005` eligibility 與 `RMA-2006` refund_approval 的目前帳號測試草稿，供使用者檢查恢復／捨棄／發布流程；Agent 未自行刪除或發布。
- 第 1 階段目前另保留 `VM-25052` 的頁面內可逆表單內容；尚未按下人工「儲存草稿」或「提交退貨」。
