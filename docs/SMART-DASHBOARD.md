# Smart Dashboard：WebMCP 智慧報表工作台

## 1. 設計摘要

Smart Dashboard 不是預先固定圖表與功能的傳統管理後台，而是一個由使用者與
Agent 共同建立報表的 WebMCP 工作台。

網站將允許 Agent 存取的資料整理至瀏覽器內的 SQLite3 WASM memory database，
並透過 WebMCP 暴露唯讀 SQL 查詢、報表編輯、頁面導航、instructions 與 skills。
Agent 根據使用者目標載入所需的領域 skill，自行規劃 SQL、分析結果，再組合 KPI、
圖表、表格與文字摘要。使用者可以直接在頁面檢查、調整與最終確認報表。

核心主張：

> 網站透過 SQLite 暴露結構化資料，透過 skills 暴露領域知識，透過報表 tools
> 暴露創作能力；同一個通用 Agent 在執行時組合三者，適應不同網站與用途。

這個設計用來證明 WebMCP Provider 能以受控資料、領域方法與編輯工具，協助外部
Agent 探索資料、套用分析規則，並與人共同創造原本不存在的成果。

## 2. 設計目標

- 讓相容 WebMCP 的外部 Agent 能探索並操作 Dashboard capabilities。
- 不為每一種指標或分析情境建立專用查詢 tool。
- 允許 Agent 使用 SQL 自由探索、關聯、聚合與比較 Agent 可見資料。
- 讓網站透過 skills 提供資料語意、分析方法與操作規範。
- 產生結構化、可繼續編輯的報表，而不是一次性的文字或圖片。
- 人類與 Agent 操作同一份 iframe 狀態，並保留人類的最終控制權。
- 將資料與安全限制落實於 executor 和資料邊界，不只依賴 prompt 或 skill。

## 3. 非目標

- 不讓 Agent 產生或執行任意 HTML、React、JavaScript 或 SQLite extension。
- 不把 SQLite memory database 當成原始正式資料庫或永久儲存層。
- 不讓 Agent 存取姓名、Email、地址、電話、帳戶識別或付款資料。
- 不由 Agent 發布、寄送或對外分享報表。
- 不為所有可能的業務問題預先設計固定 Dashboard 或專用查詢 API。

## 3.1 實作狀態（2026-08-30）

已完成的 Smart Dashboard 垂直切片：

- Voltage Dashboard 內的 SQLite3 WASM module Worker 與 `:memory:`
  database；不使用 OPFS，也不跨 iframe/session 共用。
- 十二個 deterministic curated datasets：`agent_products`、
  `agent_sales_daily`、`agent_inventory`、`agent_inventory_daily`、
  `agent_order_daily`、`agent_order_product_daily`、
  `agent_customer_monthly`、`agent_return_product_daily`、
  `agent_return_operational_daily`、`agent_refund_daily`、
  `agent_return_cohort_monthly`、`agent_dataset_status`。
- 單一 `execute_readonly_sql` WebMCP tool，支援 SELECT、CTE、join、aggregation
  與 positional parameters。
- SQLite `query_only`、authorizer allowlist、單 statement policy、100-row、32-column、
  4,000-character、VM steps 與時間限制。
- executor 前後的個資／帳戶／付款資料防線；字串 filter 只允許 curated 值或片段、
  ISO 日期與核准的 SQLite 日期語法，字串結果採更嚴格的完整值 allowlist。
- 原生 `registerTool()` 與 same-origin fallback provider 共用相同 executor；
  `__webmcpReady` 會等待 database 初始化，StrictMode、初始化失敗及 unmount 均會
  dispose runtime。
- `voltage-sales-data`、`voltage-inventory-data`、
  `voltage-returns-data` 與 `voltage-report-authoring` 四個按需載入 skills。
- iframe-local immutable query cache；成功 SQL 回傳 ULID `queryId`，上限 32 筆／
  8 MiB，超限時保留既有 evidence 並安全拒絕新結果。
- 單一 memory-only active report，以及 create/get/add/update/move/remove 六個
  report-authoring tools。
- 可共同編輯的 Reports Canvas，支援 KPI、table、受限的商務 Markdown text 與 bar；
  使用者與 Agent 修改同一份 report state。

Capability inspector 尚未實作；目前可從瀏覽器 DevTools 或外部 WebMCP client 確認
discovered tools，但不把它包裝成獨立產品功能。

## 4. 整體架構

```text
網站允許 Agent 存取的資料
          │
          ▼
SQLite3 WASM memory database
  - curated tables/views
  - dataset status
  - no personal/payment data
          │
          ▼
WebMCP tools
  - execute_readonly_sql
  - report authoring tools
  - navigation tools
          │
          ├──────────────┐
          ▼              ▼
agent_instructions   skill_list/load_skill
執行期目標與限制      資料語意與分析方法
          │              │
          └──────┬───────┘
                 ▼
        通用 WebMCP Agent
                 │
                 ▼
       可編輯的 Report Canvas
                 │
                 ▼
         使用者檢查與最終決策
```

### 4.1 元件責任

| 元件            | 責任                                                 |
| --------------- | ---------------------------------------------------- |
| SQLite3 WASM    | 保存本次頁面 session 的 Agent 可見資料並執行唯讀 SQL |
| WebMCP SQL tool | 驗證、限制、執行查詢並管理 query result              |
| Data skills     | 說明資料表、欄位、單位、時區、enum、join 與使用限制  |
| Analysis skills | 提供營運分析、庫存風險、管理摘要等方法               |
| Report tools    | 建立及修改結構化報表與 widget                        |
| Report Canvas   | 顯示同一份報表狀態，讓人類直接編輯與確認             |
| Agent core      | 理解需求、載入 skills、規劃查詢並協調 tools          |

## 5. SQLite3 WASM 資料層

### 5.1 資料來源

頁面初始化時，從 Product Repository、InventoryMovement、Commerce Repository 與
Return Repository 取得同版營運 snapshot，再先經
`createSafeOperationalProjection()` 移除識別資料與自由備註，最後才載入 SQLite3
WASM memory database。SQLite 只存在目前頁面 context，不跨頁面 runtime 共享，也不
屬於 IndexedDB 持久化資料。

第一階段實際提供以下專為 Agent 設計的 curated tables：

```sql
agent_products
agent_sales_daily
agent_inventory
agent_inventory_daily
agent_order_daily
agent_order_product_daily
agent_customer_monthly
agent_return_product_daily
agent_return_operational_daily
agent_refund_daily
agent_return_cohort_monthly
agent_dataset_status
```

`agent_products` 以 `product_id` 對應 Product Repository，保存 `price_amount`、
`currency_code` 與 `product_status`。相容欄位 `price_usd` 只在原生幣別為 USD 時有值；
TWD 為 NULL，不在沒有匯率資料時換算。`agent_inventory` 使用同一商品的目前 stock。

`agent_sales_daily` 與 `agent_order_product_daily` 都由相同 order-line facts 聚合，不得
把兩者相加成兩份銷售。營收同時保留 `net_revenue_amount` 與 `currency_code`；只有 USD
列可填相容 `net_revenue_usd`，TWD 為 NULL。

`agent_inventory_daily` 以日期與商品聚合 receipt、issue、reconciliation 與淨異動；
`agent_order_daily` 以日期、區域、客群、訂單／固定付款結果／履約狀態與幣別聚合；
`agent_customer_monthly` 以月份、區域、客群、客戶狀態與幣別聚合，任何輸出列都必須
包含至少 5 位不同客戶。過小群組只能安全合併為 `other`／`suppressed` 或完全抑制。

`agent_return_product_daily` 提供商品、原因、Eligibility、驗貨、庫存處置及處置執行
狀態；只有 `restock + completed` 可視為實際重新入庫。`agent_return_operational_daily`
提供流程狀態、快照時間 SLA 與 cycle time；SLA 欄位以
`agent_dataset_status.updated_at` 為 as-of，不宣稱即時。`agent_refund_daily` 依原
幣別聚合核准、金額、執行嘗試與失敗；`agent_return_cohort_monthly` 的每列至少包含
5 位不同顧客。

不要將 customer/order/RMA/approval/execution ID、姓名、Email、電話、地址、任意
顧客陳述、Timeline 原文、備註、付款方式、卡號、token、授權碼或帳戶資料複製進
Agent database。唯一付款例外是固定且不可識別個人的
`payment_status_code`：`paid`、`pending`、`failed`、`refunded`。

### 5.2 動態資料狀態

資料更新時間、完整度與實際涵蓋期間屬於動態狀態，應保存在可查詢的資料表，而不是
只寫在靜態 skill 中：

```sql
CREATE TABLE agent_dataset_status (
  dataset_name TEXT PRIMARY KEY,
  updated_at TEXT NOT NULL,
  time_zone TEXT NOT NULL,
  period_start TEXT,
  period_end TEXT,
  completeness TEXT NOT NULL
);
```

Agent 在建立報表前可查詢這張表，並在報表中標示資料期間、時區、更新時間與資料缺口。

### 5.3 Schema discovery

Agent 可以使用唯讀 SQL 查詢允許的 SQLite metadata，了解當下可用 tables、views 與
columns。不必為此建立大量固定資料查詢 tools。

機械性結構由 SQLite 提供；業務語意由 skill 提供。SQL schema 不足以表達營收是否
含稅、日期使用哪個時區、enum 代表什麼，或某種 join 是否會造成重複計算。

## 6. Skills 設計

### 6.1 Skills 的責任

Skills 提供 Agent 正確使用資料與製作報表所需的知識：

- table/view 用途與粒度。
- 欄位定義、單位與日期時區。
- enum 值的業務意義。
- 建議與禁止的 join 關係。
- 聚合、比較與分析注意事項。
- 資料是否可能包含敏感或不可信內容。
- 報表結構、分析方法與品質要求。

Skills 是使用指引，不是安全執行邊界。即使 Agent 未載入或誤解 skill，SQL executor
與 Agent database 仍必須阻擋越權或危險操作。

### 6.2 目前實作的 skill 分組

依分析領域分組，避免每張 table 各自成為過度碎片化的 skill：

```text
voltage-sales-data
voltage-inventory-data
voltage-returns-data
voltage-report-authoring
```

`skill_list({})` 每次 user input 前重新取得當下可用 skills；只有需要詳細內容時，
Agent 才呼叫 `load_skill({ name })`。

Admin 另提供 `voltage-admin-inventory`、`voltage-admin-order-safety` 與
`voltage-admin-customer-analytics`，分別說明唯讀庫存查詢與人工調整邊界、匿名訂單
安全界線，以及至少 5 人的匿名客群分析。WebMCP 不提供庫存、訂單或客戶 mutation；
需要改動資料時，由使用者在相應頁面完成。

### 6.3 Data skill 範例

```md
# Sales data

## agent_sales_daily

用途：分析每日商品銷售與營收。

- `sale_date`：銷售日期，Asia/Taipei。
- `product_id`：可連接 `agent_products.product_id`。
- `quantity`：銷售數量，單位為件。
- `net_revenue_amount`：折扣後、不含運費的原生幣別營收，必須連同
  `currency_code` 分組；`net_revenue_usd` 只在 USD 列保留相容值。

規則：

- 需要商品分類時才 join `agent_products`。
- 不要將每日銷售與每日庫存直接做多對多 join。
- 比較期間必須使用相同天數。
- 資料期間不完整時必須在報表中標示。
```

### 6.4 庫存風險分析流程

目前的 `voltage-admin-inventory` 與 `voltage-inventory-data` 會要求 Agent：

1. 先確認報告期間與受眾。
2. 同時考慮目前庫存和最近 30 天銷量。
3. 計算 estimated days of supply。
4. 將缺貨風險與滯銷風險分開呈現。
5. 沒有足夠歷史資料時標示資料不足，不得自行推測。
6. 每項行動建議都必須能對應到查詢結果。

## 7. WebMCP Tools

### 7.1 最小資料工具

資料探索原則上只需要一個通用工具：

```ts
{
  name: "execute_readonly_sql",
  description:
    "在智慧報表的 Agent database 執行一個唯讀 SQLite 查詢。只允許單一 SELECT 或 WITH 查詢。",
  inputSchema: {
    type: "object",
    properties: {
      sql: {
        type: "string",
        description: "單一唯讀 SELECT 或 WITH 查詢。"
      },
      parameters: {
        type: "array",
        items: {
          type: ["string", "number", "boolean", "null"]
        }
      }
    },
    required: ["sql"],
    additionalProperties: false
  },
  annotations: {
    readOnlyHint: true,
    untrustedContentHint: true
  }
}
```

建議回傳：

```ts
type SqlQueryResult = {
  queryId: string
  columns: Array<{
    name: string
    type: "string" | "number" | "boolean" | "null"
  }>
  rows: Array<Record<string, string | number | boolean | null>>
  rowCount: number
  truncated: boolean
  executionTimeMs: number
}
```

目前成功結果會同時回傳受限資料與 `queryId`。`queryId` 對應目前 Admin iframe
workspace 內的 immutable query result；建立資料 widget 時只傳 `queryId` 與明確欄位
mapping，不需讓模型再次回傳整批資料。cache 最多 32 筆／8 MiB，不設 TTL；iframe
dispose、reload、context replay 或網站切換後，舊 `queryId` 立即失效且不會落入新 context。
Product Repository 的商品或庫存版本改變時也會序列化重建 SQLite context，清除 query
cache 與 active report；mutation tool 回傳前必須完成這次同步。Saved report evidence
另綁定 `contextId`，不得還原到不同資料版本或不同 Provider context。

### 7.2 報表操作工具

第一版建議提供：

```text
create_report
add_report_widget
update_report_widget
move_report_widget
remove_report_widget
get_report_state
```

報表編輯屬於可逆操作，Agent 可直接執行。發布、寄送或對外分享不屬於 Agent tool；
若未來加入相關功能，最終確認必須由使用者直接在 iframe 頁面完成。

### 7.3 導航與特殊工具

```text
navigate_state
navigate_back
navigate_forward
agent_instructions
skill_list
load_skill
```

`agent_instructions({})` 說明當下頁面的目標、SQL 限制、資料安全要求與報表協作方式。
它不掛載給 Agent，而是在每個 user input 前執行並加入 system prompt。

### 7.4 Tool error 與完成驗證協議

所有 iframe tool exception 都會在 host 端正規化成安全、可修正的錯誤，保留
`toolName`、`category`、canonical `message` 與 `retryable`，且跨 iframe realm 不依賴
`instanceof Error`。開發模式的 tool input、response 與 error 以同一個 `callId` 輸出成
已遮蔽的單行 JSON；Agent lifecycle 只記錄 step、tool 名稱、result/error 類型與完成
狀態，不記錄 prompt 或任意資料內容。

Report mutation 以 `completionVerifier` annotation 宣告 `get_report_state`。原生 WebMCP
WebIDL 可能移除未知 annotation，因此 schema 同時帶有
`x-webmcp-completion-verifier` fallback。Host 只接受同一 turn 中、`readOnlyHint: true`、
不需參數且 schema 關閉額外欄位的 verifier。每次成功 mutation 後，下一個 Agent step
只能執行該 verifier；最新 state 未確認前不得宣稱完成。

未被後續同名成功呼叫清除的 tool error 也會進入 completion state。Agent 若提早結束，
final answer 必須以 `PARTIALLY_COMPLETED` 或 `FAILED` 開頭；成功的 tool loop 結束本身
不代表業務操作成功。

## 8. 報表資料模型

Agent 不生成任意程式碼，而是組合頁面允許的宣告式 widget：

```ts
type Report = {
  id: string
  title: string
  audience?: string
  period?: {
    start: string
    end: string
    timeZone: string
  }
  widgets: ReportWidget[]
  createdAt: string
  updatedAt: string
}

type ReportWidget =
  | {
      id: string
      type: "kpi"
      title: string
      queryId: string
      valueColumn: string
      comparisonColumn?: string
    }
  | {
      id: string
      type: "bar"
      title: string
      queryId: string
      categoryColumn: string
      valueColumn: string
    }
  | {
      id: string
      type: "table"
      title: string
      queryId: string
      columns: string[]
    }
  | {
      id: string
      type: "text"
      title: string
      markdown: string
      evidenceQueryIds: string[]
    }
```

Report Canvas 只渲染支援的 widget 與安全 Markdown，不執行 AI 產生的 HTML、React、
JavaScript 或 SQL extension。

## 9. 安全與可靠性

### 9.1 SQL executor

`execute_readonly_sql` 必須在 executor 強制執行以下限制：

- 只允許單一 `SELECT` 或 `WITH ... SELECT`。
- 禁止多 statement。
- 禁止 `INSERT`、`UPDATE`、`DELETE`、DDL、`ATTACH`、`DETACH` 與寫入型 `PRAGMA`。
- 禁止載入 extension、filesystem 或 network 能力。
- 只允許讀取核准的 tables、views 與 metadata。
- 設定查詢時間、SQLite VM step、輸出列數、欄位數和字串長度上限。
- 支援 abort；thread、iframe 或 turn 失效後不得繼續回傳到新 context。
- SQL 錯誤只回傳必要資訊，不暴露不允許的內部 schema 或資料。
- tool root input 只接受 `sql` 與 `parameters`；不得依賴 JSON Schema 取代 executor
  驗證。
- 個資、帳戶或付款資料不得透過 alias、literal、parameter、SQL function 合成結果或
  schema DDL 拼接繞過；結果值必須符合 curated output allowlist。

### 9.2 資料安全

- Agent database 不存放個資或付款資料。
- 訂單及客戶資料只提供匿名化、聚合後的 Agent views。
- 固定 `payment_status_code` 可作為安全維度；付款方式、識別資料與任意付款值仍拒絕。
- safe projection 是 SQLite 前的強制邊界，raw repository 不得直接交給 reporting。
- 資料列中的文字一律視為 untrusted content，不得當成 Agent instructions。
- 報表文字不得推導、重述或保存個人識別資訊。
- 每個 iframe session 擁有獨立 database、query cache 與 report state。

### 9.3 分析正確性

- 報表必須顯示資料期間、時區與更新時間。
- 推論與查詢所得事實應清楚區分。
- 建議必須能引用對應的 `queryId` 或 evidence query。
- 資料不足、結果截斷或查詢失敗時不得宣稱分析完整。
- 修改查詢後，所有引用舊 query result 的 widget 必須重新整理或標示過期。
- Product、InventoryMovement、Order、Customer 或 Return 安全維度變化會序列化重建
  Operational Reporting context；舊 query ID、active report 與 saved evidence 不得
  跨 context 使用。

### 9.4 輸入安全分組

SQL、report metadata 與 report widget arguments 使用不同驗證規則。SQL 拒絕敏感欄位、
Email／電話／付款格式、疑似長識別碼與未核准文字，但允許 ISO 日期、curated 值與最多
3 位整數、2 位小數的短數字字串，避免模型把門檻 `12` 序列化為字串時被誤判。SQL 結果另以更嚴格的
欄位和值 allowlist 檢查。

Report root input 只檢查各 tool 支援的 keys；標題、受眾與 Markdown 依各自內容風險套用
不同規則。Widget 再依 `type` 驗證專屬欄位，例如 bar 只接受 `categoryColumn` 與
`valueColumn`，table 才接受 `columns`。合法中文營運標題不會再被當成個資。

## 10. 人類與 Agent 的協作邊界

Agent 負責：

- 理解報告目標與受眾。
- 載入需要的 data/analysis/report skills。
- 探索 schema、規劃與執行 SQL。
- 找出趨勢、異常與資料缺口。
- 建立報表初稿並依回饋修改 widget。
- 說明分析依據與限制。

使用者負責：

- 決定報告目的、受眾與重要問題。
- 在 Report Canvas 檢查、重排、編輯或刪除內容。
- 判斷分析與行動建議是否符合實際情境。
- 執行發布、分享、寄送等最終外部副作用。

## 11. 代表性使用流程

使用者：

> 幫我做一份本週營運報表，包含營收趨勢、低庫存風險，以及三項行動建議。

Agent：

1. 透過 `skill_list` 確認 sales、inventory 與 report skills。
2. 載入需要的 data semantics 與分析方法。
3. 查詢 `agent_dataset_status`，確認期間和資料完整度。
4. 使用 `execute_readonly_sql` 查詢核心 KPI、分類趨勢及庫存風險。
5. 呼叫 `create_report` 建立報表。
6. 使用 `add_report_widget` 加入 KPI、圖表、風險表格和證據式摘要。
7. 向使用者說明已建立的內容與已知限制。

使用者：

> 把營收圖改成依分類堆疊，移除客戶區塊，再加一個優先補貨商品表。

Agent 取得目前 report state，執行新的 SQL 或重用既有 `queryId`，再更新、移動或移除
widgets。第一版只支援 bar，不支援 stacked bar；Agent 應說明限制，並以分類 bar 或 table
回應。使用者在 iframe 中立即看到同一份結構化報表的變化，並可直接繼續編輯。

### 11.1 可重現 demo 流程

1. 開啟根路徑，使用外部 WebMCP client 確認 discovery 到 Dashboard tools。
2. 請外部 Agent 列出並載入 sales、inventory、report-authoring 三個 skills。
3. 查詢 `agent_dataset_status`，確認 `2026-08-21` 至 `2026-08-27`、
   `Asia/Taipei`、更新時間與完整度。
4. 查詢本週總營收、以營收降冪排序且 `LIMIT 3` 的前三分類，以及 stock 小於或等於
   12 的低庫存商品；保留每次成功結果的 `queryId`。
5. 建立期間為上述七天的 report，加入營收 KPI、分類 bar、低庫存 table 與引用三組
   evidence 的商務 Markdown 摘要。
6. 在 Reports Canvas 直接修改 report/widget 標題、移除或排序 widget，再要求 Agent
   先讀取 `get_report_state`，延續修改同一份 report。
7. Reload Dashboard，確認舊 `queryId`／active report state 不得被新 runtime context
   接受；已儲存的 report library 仍依其 IndexedDB lifecycle 管理。

Demo 中若要展示截斷狀態，可用核准資料做大於 100 列的唯讀查詢；Canvas 必須顯示
`truncated` 提示，不得宣稱結果代表完整資料集。

## 12. Hackathon 展示重點

Demo 應讓 Dashboard 的 WebMCP capabilities 與共同編輯流程清楚可見：

1. 顯示 Dashboard 動態暴露的 SQL、report tools、instructions 與 skills。
2. 由自然語言目標建立原本不存在的營運報表。
3. 讓使用者在 Canvas 編輯，再要求外部 Agent 延續修改。
4. 展示 reload 後 runtime、query cache 與 active report 的隔離。

建議在 workspace 顯示精簡 capability inspector：

- 目前頁面與 WebMCP context。
- discovered tools 數量與名稱。
- available/loaded skills。
- Agent database 可見 datasets。
- 原生或 fallback provider 狀態。

提交敘事不應將作品描述為 SQL chatbot，而應強調：

> 任意 WebMCP 網站都能提供受控的資料空間、領域 skills 與創作 tools；同一個
> 通用 Agent 便能在執行時理解網站、分析資料，並與使用者共同建立可編輯成果。

## 13. 分階段範圍

第一版已完成：

- SQLite3 WASM memory database 與 12 個 curated datasets。
- `agent_dataset_status`。
- 一個安全的 `execute_readonly_sql`。
- SQL 安全、資料隔離、runtime lifecycle、skill pairing 基線與 iframe executor 綁定測試。
- sales、inventory、report-authoring 三組 skills。
- KPI、bar、table、受限的商務 Markdown text 四種 widget。
- 建立、修改、移動、刪除與讀取 report state。
- 一個可在兩分鐘內完成的營運報表 demo scenario。
- query result cache、`queryId` 與 report state 自動化測試。

後續才考慮多份報表與持久化、分享／發布、更多圖表、自由 layout 與 capability
inspector。不在第一版加入任意程式碼 widget、跨來源資料匯入、多人協作、報表寄送或
外部發布。

## 14. 驗證狀態與待確認事項

已確認：

- 使用 `@sqlite.org/sqlite-wasm` OO1 API、自有 Vite module Worker 與 `:memory:`
  database；production build/preview 的 Worker 與 WASM assets 可載入。
- production Chromium fallback provider 已實際 discovery `execute_readonly_sql`，並通過
  schema discovery、參數化 join/aggregation、CTE、100-row 截斷、mutation 拒絕與
  runtime lifecycle 隔離。
- fallback provider 已完成一條 dataset status → 三組分析 SQL → query IDs →
  KPI/table/text/bar → 人工修改 → Agent 延續修改流程；Canvas 與 report tools 讀寫
  同一份 iframe-local state。
- 375、768、1024 與 1440 px 已驗證無 body overflow；窄 viewport 的 table 由自身
  容器水平捲動，bar label、具名輸入與鍵盤操作可用。
- Dashboard reload 不會把舊 query IDs、active report、skills 或 executor 綁到新的
  page context。
- 自動化 Chromium 沒有原生 `document.modelContext`；不可把 fallback 結果宣稱為原生
  WebMCP 驗證。
- 固定 workflow regression 已使用真實 SQLite WASM 驗證 SQL-first 與 create-first
  兩種順序；兩者均可建立 KPI、bar、table、text，且部分 widget 失敗會保留已成功項目。
- 2026-08-28 在使用者授權更換本地模型並收斂 SQL／report tool descriptions 後，原樣
  執行代表性 prompt 兩次皆成功：Agent 只在最新 `get_report_state` 確認 KPI、bar、table、
  text 與四筆 evidence queries 後回覆完成。此為同源 fallback provider 的 end-to-end
  Agent 驗收，不能宣稱為原生 `document.modelContext` 驗證。

原生 WebMCP 實機驗證步驟（待支援環境執行）：

1. 在已啟用 WebMCP 的 Chrome 或 ChatGPT in-app browser 開啟根路徑。
2. 確認原生 `document.modelContext` discovery 包含 `skill_list`／`load_skill`、SQL tool
   與六個 report tools；再呼叫 `skill_list({})`，確認結果包含三個 Smart Dashboard
   skills。不得依賴 `__webmcpTestProvider`。
3. 執行 dataset status 與一個 aggregation，使用回傳 `queryId` 建立 KPI 與 text widget，
   再直接於 Canvas 修改標題。
4. Reload Dashboard，確認建立的是新 page context，舊 query ID 不可用。
5. 記錄 Chrome 版本、WebMCP flag/origin-trial 狀態、console 與畫面證據。

目前自動化環境沒有原生 API，因此上述狀態明確標記為「待實機」，不以 fallback 結果
冒充原生驗證。
