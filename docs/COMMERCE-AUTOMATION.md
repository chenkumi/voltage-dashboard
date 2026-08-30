# 電商營運自動化：WebMCP 工作流

## 1. 產品定位

Voltage Dashboard 是純前端的既有企業後台示範。Products、Inventory、Operations
Cases、Approval Inbox 與 Reports 都是可由人員直接操作的業務模組；WebMCP 只是把
頁面既有的查詢、導覽、填表、案件草稿與分析能力提供給外部 Agent。

外部 Agent 由內嵌瀏覽器開啟本系統。PChome 或其他第三方商品頁由 Agent 使用自身的
瀏覽、搜尋與網路能力讀取；本頁 WebMCP executor 不搜尋網路、不抓取第三方頁面，也
不代理跨來源 `fetch`。Agent 將整理後的最小商品欄位交給本頁填寫工具，來源內容仍視
為 untrusted content，必須通過 schema 與 executor 驗證。

商品由 IndexedDB Product Repository 持久化；訂單、客戶、備註與客戶活動由 Commerce
Repository 持久化，庫存異動由 Product Repository 的 InventoryMovement 保存。
operations cases、reviews 與 audit 只存在目前 Provider 的 memory workspace，reload
後重設。

## 2. 代表性流程

### 2.1 外部商品頁建檔

1. Agent 用自己的瀏覽器開啟使用者提供的商品 URL，讀取可公開取得的標題、圖片、
   描述、規格及價格。
2. Agent 呼叫 `open_product_create`，頁面導覽至 `/products/add`。路由更新後 host 重新
   discovery，取得商品 editor tools。
3. Agent 用 `apply_product_editor_draft` 填入基本資料、原生 USD／TWD 價格、圖片、
   描述、短文案、長文案及自由規格列表。
4. Agent 立即用 `get_product_editor_state` 驗證 mode、dirty、valid、missingFields 與
   version；WebMCP 不會儲存或發布商品。
5. 使用者在頁面檢查內容，再按「儲存草稿」或「發布商品」。提交後 Products、
   Inventory、Dashboard、WebMCP 查詢與 Reports 使用同一 Product Repository 版本。

### 2.2 訂單異常分類

1. Agent 用 `list_ops_cases` 依 type、status、priority 篩選未出貨、付款檢核失敗或
   地址驗證異常。
2. 用 `get_ops_case` 讀取非個人的 case ID、reason code 與 immutable fact codes。
3. 用 `save_case_draft` 保存相符分類、優先級、facts 子集合、建議與客服草稿，再以
   `get_workflow_state` 驗證 draft version。
4. Agent 可用 `open_case_review` 導覽 Approval Inbox；只有使用者頁面按鈕可核准、
   退回或完成案件。流程不修改訂單、付款、退款或取消狀態。

### 2.3 退貨與售後建議

1. Agent 找到 `return_request` 案件並用 `check_return_eligibility` 套用固定示範政策。
2. 結果只有 `eligible`、`ineligible`、`needs_human_review`，並包含 matched rules 與
   missing evidence；資料不足時不得猜測或承諾退款。
3. Agent 保存完全相符的 eligibility、證據、建議與客服草稿並送審。
4. 使用者執行最終案件處理；registry 沒有 refund、cancel 或 order mutation tool。

### 2.4 庫存分析與人工調整

1. Agent 用 `get_inventory_overview` 取得整體風險，再以 `search_inventory` 依商品文字、
   分類、風險與排序取得安全庫存摘要，並用 `get_inventory_detail` 讀取週／月／年異動
   與前期比較。
2. Agent 可用 `open_inventory_detail` 導覽明細，但 registry 沒有庫存 mutation tool。
3. 使用者在頁面開啟調整 dialog、輸入目標庫存與固定原因碼並確認；成功後 Product、
   InventoryMovement、Dashboard 與 Reporting 使用同一新版 snapshot。

### 2.5 訂單查詢與客戶管理

1. Agent 用 `search_orders` 搜尋訂單編號並套用狀態、付款結果、履約、區域、客群、
   幣別、日期與金額條件；`get_order_detail` 只回傳遮罩後且有上限的營運資料。
2. Agent 用 `get_customer_analytics` 讀取至少 5 人的匿名群組，或以
   `open_customer_analysis` 導覽安全 filters；不接受客戶 ID、姓名、Email、電話、地址
   或任意標籤。
3. 客戶新增、編輯、備註、停權及復權只能由使用者在 Customers UI 完成。訂單維持
   唯讀，付款方式與付款識別不會透過 WebMCP 暴露。

### 2.6 跨模組報表

Agent 以 `execute_readonly_sql` 查詢區域銷售、客群營收、付款結果異常、商品銷售、
庫存趨勢與補貨風險，再將 query IDs 組成 Report Canvas。Customer monthly 每列至少
5 位不同客戶；不同 `currency_code` 必須分開呈現，沒有匯率時不得合計。

## 3. WebMCP 工具契約

| 分組       | Tools                                                                                         | 邊界                                                 |
| ---------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 商品查詢   | `search_admin_products`, `get_admin_product`, `list_product_categories`                       | 唯讀、有限輸出、商品文字視為 untrusted               |
| 商品導覽   | `open_product_create`, `open_product_detail`, `open_product_edit`                             | 只導覽，不建立或修改商品                             |
| 商品填表   | `apply_product_editor_draft`, `get_product_editor_state`                                      | 只改目前 editor 暫存狀態；後者是 completion verifier |
| 庫存查詢   | `get_inventory_overview`, `search_inventory`, `get_inventory_detail`, `open_inventory_detail` | 安全摘要／趨勢／導覽；不得調整庫存                   |
| 訂單查詢   | `search_orders`, `get_order_detail`, `open_order_detail`                                      | 唯讀、遮罩、固定狀態碼；不得修改訂單或付款           |
| 客群查詢   | `get_customer_analytics`, `open_customer_analysis`                                            | 至少 5 人匿名群組與安全 filters；不得讀寫個人客戶    |
| 案件讀取   | `list_ops_cases`, `get_ops_case`, `check_return_eligibility`                                  | 唯讀安全狀態碼；無個資、地址或付款內容               |
| 案件草稿   | `save_case_draft`, `open_case_review`                                                         | 可逆草稿／送審；不得完成案件                         |
| 工作流狀態 | `list_pending_reviews`, `get_workflow_state`                                                  | 唯讀；後者是 `save_case_draft` verifier              |

所有 input object 都以 `additionalProperties: false` 關閉額外欄位，executor 仍獨立驗證
ID、enum、長度、陣列大小、內容安全、case category、evidence provenance 與目前
snapshot。商品與 operations 成功輸出各自有 1,500 字元硬上限。

## 4. 安全與人工邊界

- WebMCP 不接受或回傳姓名、Email、電話、實際地址、帳戶識別、卡號或付款 token。
- 商品圖片只接受 HTTPS URL；文字不渲染為 HTML；圖片與規格採整組替換並重新驗證。
- Case evidence 必須是該案件 immutable facts 的不重複子集合。
- 退貨 eligibility 必須完全等於固定政策對該案件的結果。
- Audit 只保存 actor、action、workflow ID、時間與結果，不複製 prompt 或草稿文字。
- Agent 沒有商品儲存、發布、封存、還原、刪除，亦沒有庫存調整、客戶 mutation、案件
  核准、完成、退款、付款、建立／確認／取消訂單等 tools。
- Review 綁定 `draftVersion`；草稿修改後既有 pending／approved review 立即失效。

## 5. 三分鐘 Demo 腳本

### 0:00–1:10：外部來源到商品表單

1. 開啟 Products，展示可搜尋、可進入詳細頁及新增／編輯的真實後台流程。
2. 請 Agent 讀取使用者提供的 PChome 商品頁；強調讀取由外部 Agent 完成。
3. Agent 開啟 `/products/add`、填入完整內容並用 editor verifier 確認，但不能提交。
4. 使用者在頁面發布，回到清單並核對商品、庫存與 Dashboard 已同步。

### 1:10–2:15：異常與售後

1. 請 Agent 找未處理的 return case、檢查資格並產生分類與客服建議。
2. 展示 reason／fact codes，不含姓名、地址或付款資料。
3. Agent 保存、驗證並送審；使用者在 Approval Inbox 核准與完成案件。

### 2:15–3:00：報表一致性與安全

1. 在 Reports 查詢新商品及目前庫存；新商品沒有虛構銷售，TWD 不換算 USD。
2. 列出 registry，確認不存在舊 Catalog Intake 或高風險 final-action tools。
3. Reload 後確認舊 operations state、query IDs 與 active report 不進入新 context。

## 6. 驗證模式

一般 Chromium 尚未提供原生 `document.modelContext` 時，頁面建立同源
`window.__webmcpTestProvider`，使用與原生註冊相同的 definitions 與 executor，供測試
discovery、schema、UI 同步及 reload 隔離。這是測試介面，不是產品內建 Agent。

原生實機需在支援 WebMCP 的 in-app browser 驗證：商品全站工具、add／edit route-only
tools、七個 operations tools、SQL／report tools、`skill_list`／`load_skill` 與
`toolchange`。若環境沒有原生 API，紀錄必須明確標示 fallback 已通過、原生待實機。
