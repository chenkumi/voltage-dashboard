# 電商營運自動化：WebMCP 與完整 RMA

## 1. 產品定位

Voltage Dashboard 是純前端的既有企業後台示範。Products、Inventory、Orders、
Customers、Returns、Refund Approvals 與 Reports 都是人員可直接操作的業務模組；
WebMCP 將其中的安全查詢、導覽、表單草稿與報表能力提供給外部 Agent。

外部 Agent 由內嵌瀏覽器開啟本系統。PChome 或其他第三方商品頁由 Agent 使用自身的
瀏覽、搜尋與網路能力讀取；本頁 WebMCP executor 不搜尋網路、不抓取第三方頁面，也
不代理跨來源 `fetch`。Agent 將整理後的最小欄位傳給頁面工具，所有外部文字仍視為
untrusted content，必須通過 closed schema 與 executor 驗證。

Product、Commerce、InventoryMovement 與 Return Repository 都使用 IndexedDB
持久化。RMA 以 Order／Product ID 關聯既有資料，但不複製顧客個資、付款資料或私密
備註。Repository mutation 會更新同一 UI snapshot，Returns 變更亦會使舊 reporting
query ID、active report 與 saved evidence 失效。

## 2. 代表性流程

### 2.1 外部商品頁建檔

1. Agent 以自己的瀏覽器讀取使用者提供的商品 URL。
2. Agent 呼叫 `open_product_create` 進入 `/products/add`，路由更新後重新 discovery。
3. Agent 用 `apply_product_editor_draft` 填入原生 USD／TWD 價格、圖片、描述、長短
   文案及自由規格。
4. Agent 立即用 `get_product_editor_state` 核對 mode、dirty、valid、missingFields
   與 version；WebMCP 不會儲存或發布商品。
5. 使用者檢查後在 UI 儲存草稿或發布。

### 2.2 Orders 異常查詢

1. Agent 用 `search_orders` 搜尋訂單編號，或以狀態、固定付款結果、履約、區域、
   客群、幣別、日期及金額篩選。
2. `get_order_detail` 只回傳遮罩且有限的營運資料；付款失敗、地址需處理及履約
   exception 直接由 Orders List／Detail 顯示，不建立額外泛用 Case。
3. `open_order_detail` 只負責導覽；訂單維持唯讀，Agent 不能建立、確認、取消、
   退款或提交付款。

### 2.3 完整 RMA

1. Agent 找到已送達且付款結果為 paid 的訂單，用 `open_return_create` 開啟新增頁。
2. 在新增路由，Agent 用 `apply_return_form_draft` 填入來源、固定原因、安全顧客
   陳述與品項數量，再以 `get_return_form_state` 驗證。只有使用者能儲存或提交。
3. 使用者依序完成資格決定、退貨授權、收貨與逐商品驗貨。Agent 可用
   `check_return_eligibility` 準備固定政策結果，或以
   `apply_return_review_draft` 填可逆審查草稿，但不能執行 transition。
4. 驗貨完成後系統依逐商品實付分配及運費全退／不退規則產生不可編輯的全額退款計算；
   使用者送出單級核准。
5. Refund Approvals 將核准與退款執行分離。核准人只能核准、拒絕或退回整份計算；
   核准後仍需使用者另外記錄成功／失敗結果，失敗可重試，成功後不可重複。
6. 只有 `restock + completed` 的 RMA item 會增加可售庫存，來源參照防止重複入庫。
   Timeline 保存結構化 actor、action、時間與結果，不複製顧客陳述或付款識別。

### 2.4 庫存與客戶人工操作

- Agent 可使用 `get_inventory_overview`、`search_inventory`、
  `get_inventory_detail` 與 `open_inventory_detail`；庫存調整由使用者在 UI 確認。
- Agent 可使用 `get_customer_analytics` 取得至少 5 人的匿名群組，或以
  `open_customer_analysis` 開啟安全 filters；客戶新增、編輯、備註、停權及復權
  只能由使用者執行。

### 2.5 跨模組報表

Agent 以 `execute_readonly_sql` 查詢銷售、庫存、訂單、匿名客群、退貨商品、
RMA 流程、退款與退貨客群，再以 query IDs 組成 Report Canvas。

- `agent_return_product_daily`：商品退貨原因、eligibility、驗貨、處置與處置狀態。
- `agent_return_operational_daily`：流程狀態、快照時間 SLA 與 cycle time。
- `agent_refund_daily`：原幣退款金額、核准、執行嘗試與失敗率。
- `agent_return_cohort_monthly`：至少 5 位不同顧客的安全區域／客群統計。

不同 `currency_code` 必須分開呈現。投影不含 RMA／Order／Customer／Approval／
Execution ID、Timeline 原文、自由文字、付款方式或付款識別。

## 3. WebMCP 工具契約

| 分組             | Tools                                                                                                                                      | 邊界                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| 商品查詢／導覽   | `search_admin_products`, `get_admin_product`, `list_product_categories`, `open_product_create`, `open_product_detail`, `open_product_edit` | 查詢與導覽；不執行商品 mutation           |
| 商品填表         | `apply_product_editor_draft`, `get_product_editor_state`                                                                                   | 只改目前 editor 暫存狀態；後者為 verifier |
| 庫存             | `get_inventory_overview`, `search_inventory`, `get_inventory_detail`, `open_inventory_detail`                                              | 安全摘要／趨勢／導覽；不得調整            |
| 訂單             | `search_orders`, `get_order_detail`, `open_order_detail`                                                                                   | 唯讀、遮罩、固定狀態碼                    |
| 客群             | `get_customer_analytics`, `open_customer_analysis`                                                                                         | 至少 5 人匿名群組；不讀寫個人客戶         |
| Returns 全域     | `search_returns`, `get_return_detail`, `open_return_create`, `open_return_detail`                                                          | 安全查詢與導覽；不提交 RMA                |
| Return 新增頁    | `apply_return_form_draft`, `get_return_form_state`                                                                                         | 可逆暫存；verifier 確認版本與完整度       |
| Return Detail    | `check_return_eligibility`, `apply_return_review_draft`, `get_return_review_state`, `get_refund_calculation`                               | 固定政策、草稿、唯讀計算；無 transition   |
| Refund Approvals | `list_refund_approvals`, `open_refund_approval`, `get_refund_approval`                                                                     | 核准頁只讀；決策與退款執行均 user-only    |

所有 input object 都以 `additionalProperties: false` 關閉額外欄位，executor 仍獨立驗證
ID、enum、長度、陣列、內容安全、來源、目前 route 與 version。商品與 Returns 成功
輸出各自有 1,500 字元上限。Route-aware tools 只在正確頁面 discovery，頁面切換會
觸發 `toolchange`。

## 4. 安全與人工邊界

- WebMCP 不接受或回傳姓名、Email、電話、實際地址、Customer ID、帳戶、卡號、
  token、授權碼、付款或外部退款識別。
- Agent 沒有商品發布、庫存調整、客戶 mutation、RMA 提交、資格決定、收貨、驗貨、
  送出退款核准、核准／退回／拒絕、記錄退款結果、重新入庫或完成 RMA 的 tools。
- Agent 草稿必須由最新唯讀 verifier 確認；stale version 與不完整輸入安全拒絕。
- 退款計算綁定 RMA、Inspection 與 Order snapshot version；資料改變後既有核准失效。
- 退款只支援全額、單級核准且核准與執行分離；不存在部分退款、換貨或補寄。

## 5. 三分鐘 Demo 腳本

### 0:00–0:55：外部來源到商品表單

1. 展示 Products 可搜尋、詳細、新增與編輯。
2. 請外部 Agent 讀取商品 URL，開啟 `/products/add` 並填入內容。
3. Agent 用 verifier 確認草稿；使用者親自發布。

### 0:55–2:15：完整售後流程

1. 從 delivered／paid 訂單建立 RMA；Agent 填表但使用者提交。
2. 展示固定政策、補件／授權、結構化收貨與逐商品驗貨。
3. 產生不可編輯的全額退款計算並送審；在 Refund Approvals 由使用者核准。
4. 分別記錄一次退款失敗與重試成功，確認成功後不能重複；完成合格品重新入庫。

### 2:15–3:00：報表一致性與安全

1. 查詢分類退貨率、SLA、退款失敗率及不同幣別金額，建立 Report Canvas。
2. 列出 registry，確認只存在查詢、導覽與可逆草稿 tools，沒有高風險 transition。
3. 更新 Return Repository 後確認舊 query ID／active report／saved evidence 失效。

## 6. 驗證模式與相容性

一般 Chromium 尚未提供原生 `document.modelContext` 時，頁面建立同源
`window.__webmcpTestProvider`，使用與原生註冊相同的 definitions 與 executor，供測試
discovery、schema、UI 同步及 reload 隔離。這是測試介面，不是產品內建 Agent。

原生實機需在支援 WebMCP 的 in-app browser 驗證 route-aware tools、SQL／report
tools、`skill_list`／`load_skill` 與 `toolchange`。若環境沒有原生 API，紀錄必須
明確標示 fallback 已通過、原生待實機。

舊 `/operations`、`/operations-cases` 與 `/approvals` 只保留相容 redirect，
分別導向 Returns 或 Refund Approvals；舊泛用案件資料與工具不再存在。
