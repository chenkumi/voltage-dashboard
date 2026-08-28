# Smart Dashboard 報表建立中斷與錯誤回饋不完整

## 狀態

- 狀態：Closed
- 記錄日期：2026-08-28
- 影響範圍：Voltage Market Admin、WebMCP tool execution、AI tool loop、Report Canvas
- 嚴重度：High

## 摘要

使用者要求 Agent 建立包含 KPI、bar、低庫存 table 與 evidence text 的本週營運報表。
實際結果只建立了 report 標題與期間，沒有任何 widgets。執行期間至少發生一個 SQL
privacy input error 與兩個 report tool argument errors，但 Agent 最終沒有明確回報
「報表建立異常／只完成空殼」，使用者必須從 Canvas 與 console 才能發現失敗。

目前已確認 SQL 與 `create_report` 之間沒有固定先後依賴；兩者可任意排序。真正的
widget 前置條件是同時存在 active report 與有效 query result `queryId`。

## 2026-08-28 修正與複驗狀態

原始三類問題已完成程式層修正與回歸測試：

- SQL 錯誤已拆分為敏感欄位、敏感值、疑似識別碼、未核准 literal、執行錯誤與輸出
  privacy 等類別；門檻的短數字字串（例如 `"12"`）可安全使用。
- Report root／metadata／各 widget type 已分組驗證，錯誤訊息會指出 tool 或 widget
  支援的欄位；合法中文營運標題不再被廣泛攔截。
- 跨 realm error normalization 會把 exception 送入 AI SDK tool-error，而不是普通成功
  result；開發 logs 以相同 `callId` 輸出 sanitized input 與 response/error 單行 JSON。
- 成功 report mutation 會強制下一 step 執行同 turn 的 `get_report_state`；一般 tool
  error 也會留在 completion state，早期 final 必須標示 `PARTIALLY_COMPLETED` 或
  `FAILED`。
- 真實 SQLite WASM workflow regression 已證明 SQL-first 與 create-first 都成立，四種
  widgets 可引用實際 query IDs 建立，部分失敗時 state 會保留成功項目。

使用者授權更換本地模型並收斂 SQL、report tool 與 Markdown schema descriptions 後，
原始 prompt 的兩次實機複驗皆成功。Agent 載入三個指定 skills、以實際 SQL 結果建立
KPI、bar、table 與 evidence text；最新 `get_report_state` 及 Canvas 都確認四種 widgets
與四筆 evidence queries 存在，Agent final 才回覆完成。短商務指標（例如
`12 - 3 - 4`）不再被誤判為電話，但 `123-4567`、Email、帳戶／付款資料、links、HTML、
code 與 diagrams 仍會被拒絕；相同規則已寫入 tool 與 `markdown` schema descriptions。

### 正式驗證結論

計畫原本允許的三次原始 prompt 實機驗證均未建立完整 Canvas：一次在模型 API 首個 tool
call 前收到 HTTP 400；一次產生沒有 placeholder 卻附帶 surplus parameters 的 SQL；
最後一次先引用錯誤 table alias，修正後的 SQL 仍收到已遮蔽底層細節的
`SQL_EXECUTION_ERROR`。第三輪只有低庫存一般 Admin tool 成功，沒有任何 report
mutation，因此無法實機覆蓋 mutation 後強制 `get_report_state` 的成功路徑。

三輪都未再出現原始 issue 的「工具失敗卻宣稱完成」：可取得 final 的輪次均明確回覆
`FAILED` 或 `PARTIALLY_COMPLETED`，且與 Canvas 一致。最終完整品質結果為 23 個 test
files、282 tests 全數通過，typecheck 與 architecture 通過；lint/build 只剩既有
`workspace.tsx:46` unused variable 與 `chat-window.tsx:234` React Compiler warning，
本次修改沒有新增品質失敗。其後使用者明確授權模型切換與重新驗收；最終品質結果為
23 個 test files、299 tests、typecheck、build 與 architecture 全數通過，lint 為 0 errors
（僅保留 `chat-window.tsx:234` warning）。

## 使用者輸入

```text
請幫 Voltage Market 店長建立一份本週營運報表。
報表期間是 2026-08-21 到 2026-08-27，時區使用 Asia/Taipei。請先確認資料集更新狀態，並載入銷售、庫存與報表製作相關 skills。
報表需要包含：
1. 本週總營收 KPI
2. 依營收降冪排序的前三個商品分類長條圖
3. 庫存小於或等於 12 件的低庫存商品表格
4. 一段引用上述查詢證據的營運摘要
請使用實際 SQL 查詢結果建立 Report Canvas，不要自行推測資料。如果資料不完整或查詢被截斷，請在報表中清楚標示。
```

## 實際結果

- Report Canvas 顯示：
  `Voltage Market 本週營運報表 (2026-08-21 至 2026-08-27)`。
- Report Canvas 沒有 KPI、bar、table 或 text widget。
- 總營收 SQL 成功，回傳 `49,722.51` 與 query ID。
- 低庫存 SQL 被 `SQL_PRIVACY_ERROR` 拒絕。
- 至少兩次 report authoring tool 呼叫被 `REPORT_ARGUMENT_ERROR` 拒絕。
- Agent 說明它「將使用」查詢結果建立 KPI，但沒有明確回報 KPI/widget 實際建立失敗，
  也沒有說明目前報表只有標題。

## 預期結果

- 任一必要 SQL 或 widget 操作失敗時，Agent 應明確標記整體結果為
  `PARTIALLY_COMPLETED` 或 `FAILED`。
- Agent 不得只依 stream/tool loop 正常結束就宣稱或暗示報表完成。
- Agent 應列出成功與失敗項目，並說明 Canvas 當下的真實狀態。
- Agent 宣稱完成前，應以 `get_report_state` 確認要求的 widgets 實際存在。
- 錯誤應保留安全且可供 Agent 修正的 `toolName`、`category`、`message` 與
  `retryable` 資訊。

## 修正前已確認問題（歷史記錄）

以下小節保留初始診斷脈絡；其中「目前」均指修正前版本。現況以本文前段的
「2026-08-28 修正與複驗狀態」為準。

### 1. SQL privacy input guard 拒絕了 Agent 產生的低庫存 SQL

錯誤發生在 SQLite 執行前的 `assertSafeReportingInput()`：

```text
SQL_PRIVACY_ERROR
Personal, account, or payment data is not allowed in reporting queries.
```

該 guard 會在以下任一條件成立時使用同一個錯誤訊息：

- SQL 含敏感欄位名稱。
- SQL／parameters 含 Email、電話或付款格式。
- SQL 含 8～12 位疑似識別碼。
- SQL string literal 或字串 parameter 不在 curated allowlist。

目前 console stack 沒有包含失敗呼叫的實際 SQL arguments，因此尚不能確認是哪一條
predicate 命中。常見可能性是 Agent 在 `CASE` 中產生 `'Low Stock'` 等非 curated
string literal，但這仍是待驗證假說。

資料表與 join 本身沒有問題。以下查詢已實際通過並回傳 4 rows、`truncated=false` 與
有效 `queryId`：

```sql
SELECT
  p.title,
  p.category,
  i.stock,
  i.updated_at
FROM agent_inventory AS i
JOIN agent_products AS p
  ON p.product_id = i.product_id
WHERE i.stock <= ?
ORDER BY i.stock ASC, p.title ASC
```

```json
{
  "parameters": [12]
}
```

### 2. Report authoring tool 收到不支援的 root fields

錯誤：

```text
REPORT_ARGUMENT_ERROR
Report tool input contains unsupported fields.
```

`add_report_widget` root input 只接受：

```json
{
  "widget": {
    "type": "kpi",
    "title": "本週總營收",
    "queryId": "<workspace query id>",
    "valueColumn": "total_revenue"
  }
}
```

可能的錯誤形態包括 flattened widget fields、額外 `reportId` 或 `widgets` batch 欄位。
目前提供的 stack 沒有展開 `[WebMCP tool] input.arguments`，因此尚不能確認實際多出的
欄位。這兩次錯誤直接解釋為什麼 Canvas 沒有成功加入 widgets。

### 3. 跨 iframe error normalization 可能遺失具體錯誤

修正前 Host 以 `error instanceof Error` 判斷是否可讀取 `message`。iframe 與 host 屬於
不同 JavaScript realm，iframe 建立的 Error 可能無法通過 host 的 `instanceof Error`，
因而退化為：

```text
WebMCP tool execution failed.
```

此外，`executeRegisteredTool()` 會 catch exception 並回傳一般物件：

```json
{
  "status": "ERROR",
  "message": "WebMCP tool execution failed."
}
```

這會遺失原始 `category`，並讓 AI SDK 將它視為普通 tool result，而不是 protocol-level
tool error。Agent 因此缺少可用來修正 arguments 的具體資訊。

### 4. Agent 沒有以實際 report state 驗證完成度

修正前 instructions 禁止 Agent 在沒有 tool result 時宣稱成功，但沒有強制它在複合報表
任務結束前呼叫 `get_report_state`，也沒有檢查要求的 widget types 是否存在。因此
report shell 建立成功可能被誤當成整份報表已進入正常建立流程，即使後續所有 widget
操作都失敗。

## 尚待確認：step limit 是否阻止最後一次錯誤總結

修正前 Agent 使用：

```ts
stopWhen: stepCountIs(9)
```

有 final assistant message 並不能排除命中 step limit。AI SDK 的單一 step 可以同時
產生 assistant text、tool calls 與 tool results；如果第 9 步在執行 tool 後命中 stop
condition，stream 仍會正常送出 `finish`，但不會再建立第 10 個模型 step 解讀最後的
tool errors。使用者可能只看到 tool call 前的文字，例如「我將使用此結果建立 KPI」。

另一種可能流程是：錯誤發生在較早 step，模型已收到 generic error，最後自行產生
text-only final response，卻沒有正確揭露失敗。僅憑目前 console stack 無法區分這兩種
流程，因此不得把 step limit 寫成已確認根因。

## 需要補充的診斷資料

### WebMCP tool logs

在 Chrome DevTools Console 啟用 Verbose level，保存每次失敗前後的：

```text
[WebMCP tool] input
[WebMCP tool] error
```

至少記錄：

- `callId`
- `toolName`
- sanitized `arguments`
- error `category`／`message`
- 執行順序與時間

### Agent step lifecycle logs

每個模型 step 應記錄：

- step number
- assistant text
- tool calls
- tool results／tool errors
- finish reason
- stop condition 是否命中

藉此判斷 report errors 是最後一個 tool-calling step 的結果，還是模型已讀取錯誤後仍
產生誤導性 final message。

## 建議修正方向

1. 以結構判斷取代跨 realm 的單一 `instanceof Error`，保留安全的 error category 與
   message。
2. 定義一致的 WebMCP error envelope，至少包含 `toolName`、`category`、`message` 與
   `retryable`。
3. 讓 SQL privacy guard 回傳不洩漏資料、但可區分 predicate 的錯誤分類，例如
   `SQL_UNAPPROVED_LITERAL`、`SQL_SENSITIVE_FIELD`、`SQL_SUSPICIOUS_IDENTIFIER`。
4. 根據實際 debug arguments 修正 report tool schema 提示或 Agent argument 組裝；在未
   取得 arguments 前，不應先放寬 executor allowlist。
5. 為複合報表流程保留錯誤恢復與 final summary 的模型步驟；提高 step 上限只能降低
   發生率，不能單獨保證最後錯誤一定被解讀。
6. Agent 宣稱完成前必須呼叫 `get_report_state`，驗證 report ID、期間與要求的 widget
   types；缺少任何必要項目時回報 partial/failed。
7. UI 可顯示明確的 report completion status，避免使用者將空 report shell 誤認為完成。

## 驗收條件

- 合法低庫存查詢可成功取得 query ID；被拒絕的 SQL 可得到具體、安全且可修正的分類。
- `add_report_widget` arguments 錯誤會向 Agent 保留 `REPORT_ARGUMENT_ERROR` 與安全訊息。
- Agent 在最後一個 tool call 失敗時仍會產生一段讀取該失敗後的 final summary。
- 任一必要 widget 缺失時，Agent 回覆明確包含 `PARTIALLY_COMPLETED` 或 `FAILED`。
- Agent 只有在 `get_report_state` 證明 KPI、bar、table、text 均存在後，才能回覆報表完成。
- Report Canvas、Agent 回覆與 tool logs 對成功／失敗狀態的描述一致。

## 相關程式碼

- `src/app/webmcp/agent.ts`：ToolLoopAgent 與 step limit。
- `src/app/webmcp/session.ts`：跨 iframe tool executor 與 error normalization。
- `src/app/webmcp/tool-debug.ts`：WebMCP input／response／error debug logs。
- `src/app/webmcp/reporting/reporting-tools.ts`：SQL input/output privacy guards。
- `src/app/webmcp/reporting/report-tools.ts`：report authoring schemas 與 runtime allowlists。
- `src/app/webmcp/reporting/report-state.ts`：active report 與 widget state transitions。
