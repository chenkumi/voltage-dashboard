# Returns／Refund Approvals 系統模型

狀態：已核准  
核准日期：2026-08-31  
取代範圍：Operations Cases／Approval Inbox

## 1. 想解決的問題

目前 Operations Cases 與 Approval Inbox 只維護不會產生實際業務結果的抽象 Case、
Draft 與 Review。案件沒有完整連結訂單、退貨品項、收貨、驗貨、退款計算或退款執行，
完成案件也不代表完成任何電商售後流程。

重構後，系統應讓營運人員從實際訂單建立、審查並追蹤完整退貨流程，將確定性的退款
計算交由使用者核准，並在外部支付系統完成退款後記錄執行結果。WebMCP 只負責安全
查詢、導覽、草稿填寫與分析，不執行最終業務操作。

## 2. 最終產品定位

| 現有模組 | 重構後模組 |
| --- | --- |
| Operations Cases | Returns／退貨管理 |
| Approval Inbox | Refund Approvals／退款核准 |
| 泛用 Audit trail | 各 RMA Timeline 與全域操作紀錄 |

非退貨類異常不再建立泛用 Case：

- 出貨逾期回歸 Orders 的履約狀態與篩選。
- 付款失敗回歸 Orders 的付款結果篩選。
- 地址異常回歸 Orders 的地址／履約異常狀態。
- 庫存不足由 Inventory 處理。
- 只有 `return_request` 進入 RMA 流程。

## 3. 已確認的產品決策

- 採用完整 RMA 流程。
- 第一階段只支援退貨退款，不包含換貨與補寄。
- 退貨申請採外部匯入與內部人工建立雙來源。
- 外部來源以本機種子資料模擬，不實際串接外部通路。
- 採逐商品結構化驗貨。
- 僅支援驗貨通過品項的全額退款。
- 所有退款使用單級人工核准。
- 退款核准與實際退款執行分離。
- Agent 只能查詢、導覽、分析及填寫目前帳號的可逆表單或備註草稿。
- 提交、資格決定、收貨、驗貨、核准及退款結果都由使用者直接操作 UI。

## 4. 角色

- 客服／營運人員：建立申請、審查資格、核准退貨並準備退款流程。
- 倉庫人員：登記收貨，逐商品完成結構化驗貨與庫存處置判斷。
- 退款核准人員：以單級人工核准方式核准、拒絕或退回退款計算。
- 財務／營運執行人員：在外部支付系統完成退款後，於本系統記錄成功或失敗。
- 外部 Agent：查詢安全資料、套用政策、整理證據及填寫目前登入帳號的備註草稿，
  不能發布備註或執行最終操作。
- 外部通路：第一階段只以本機種子資料表示已匯入的退貨申請。

## 5. 完整 RMA 流程

介面固定顯示七個業務階段，讓人工操作者先看見目前待辦與解鎖條件：

1. 退貨申請：外部通路匯入，或營運人員從 Order Detail 建立並提交品項、數量及原因。
2. 資格審查：系統提供固定政策試算，由使用者授權、拒絕或要求補件。
3. 退貨收件：授權後等待寄回並追蹤期限，由倉庫登記實際收件。
4. 逐商品驗貨：倉庫記錄實收數量、驗貨結果與庫存處置。
5. 退款計算：系統依驗貨通過數量與原始實付金額建立不可變計算。
6. 退款核准：使用者送審，核准人核准、拒絕或退回整份計算，不得改價。
7. 退款執行：核准後，由財務或營運人員記錄外部退款成功或失敗；成功後完成 RMA。

後續階段在前置工作完成前不可操作；拒絕、逾期與全數驗貨不通過會形成可辨識的終止
狀態。庫存處置是驗貨後的平行人工作業，不會讓退款核准或退款執行順序倒置。

## 6. 導覽與路由

側邊欄以「售後管理」取代原本的泛用 Operations：

- Returns
- Refund Approvals

預定路由：

- `/returns`
- `/returns/add?orderId=:orderId`
- `/returns/:returnId`
- `/returns/:returnId/inspection`
- `/refund-approvals`
- `/refund-approvals/:approvalId`

相容路由：

- `/operations` 暫時 redirect 至 `/returns`。
- `/approvals` 暫時 redirect 至 `/refund-approvals`。
- 只有可映射的舊 return case 才能導向 RMA；其他舊 case ID 不進行錯誤映射。

## 7. Returns 列表

### 7.1 統計區塊

統一使用 `OperationalMetricCard`：

- 待資格審查
- 等待寄回
- 待驗貨
- 待退款核准
- SLA 逾期

### 7.2 搜尋與過濾

桌面版維持單列：

```text
[搜尋 RMA／Order ID] [狀態] [退貨原因] [SLA] [More]
```

More 包含來源、負責人、申請日期、驗貨結果、退款狀態、原幣別及金額範圍。手機版
使用 Search Bar 加 Filter Icon Button。

### 7.3 列表欄位

- RMA ID
- Order ID
- 申請來源
- 退貨品項數
- 主要原因
- 目前階段
- 負責人
- SLA／等待時間
- 預估退款金額
- 建立時間
- Detail 操作

## 8. 新增退貨申請

`/returns/add?orderId=:orderId` 顯示：

1. 訂單摘要
2. 可退貨商品
3. 每項申請數量
4. 固定退貨原因
5. 顧客陳述
6. 申請來源
7. 政策資格預覽
8. 草稿完整度

使用者可儲存草稿、放棄草稿或提交申請。Agent 可以開啟頁面、選擇商品、填寫原因與
整理安全文字，但不能提交。

## 9. RMA 詳細頁

`/returns/:returnId` 上方顯示 RMA ID、Order ID、目前階段、SLA、負責人、來源、建立
時間及目前可執行的下一步。

主要內容：

- Overview：退貨摘要與目前阻塞原因。
- Return items：申請、實收與驗貨商品。
- Eligibility：政策結果、缺少證據與人工決定。
- Logistics：退貨授權、寄回及收貨狀態。
- Inspection：逐商品驗貨結果。
- Refund calculation：確定性的全額退款計算。
- Review notes：目前帳號可自動儲存的階段備註草稿，以及所有已發布的人工審查建議／備註。
- Timeline：狀態、人工操作與版本紀錄。

頁面只顯示符合目前狀態的操作，不能跳過必要階段。

## 10. 逐商品結構化驗貨

`/returns/:returnId/inspection` 每個品項記錄：

- 申請數量
- 實收數量
- 商品狀態
- 包裝狀態
- 配件／內容物缺失
- 驗貨結果：通過或拒絕
- 驗貨通過數量
- 拒絕原因碼
- 庫存處置：重新入庫、瑕疵品、報廢或退回顧客
- 人工備註
- 驗貨人員與時間
- Inspection version

限制：

- 實收數量不得超過申請數量。
- 驗貨通過數量不得超過實收數量。
- 驗貨拒絕必須選擇固定原因碼。
- 重新入庫只允許狀態符合條件的商品。
- 驗貨完成後才能產生退款計算。
- Agent 不得填寫或確認實際驗貨結果。
- 已完成驗貨若重新開啟修改，既有退款計算及核准立即失效。

## 11. Refund Approvals

### 11.1 列表

統計區塊：

- 待核准
- 已退回修改
- 今日已核准
- 等待退款執行
- 待核准金額，依幣別分列

桌面版搜尋列：

```text
[搜尋 RMA／Order ID] [狀態] [幣別] [等待時間] [More]
```

列表欄位：Approval ID、RMA／Order ID、驗貨通過品項、退款總額、幣別、政策結果、
等待時間、Calculation version、狀態與 Detail 操作。

### 11.2 核准詳細頁

`/refund-approvals/:approvalId` 顯示：

- 原訂單實付摘要
- 申請、實收與驗貨通過數量
- 各品項原始實付單價
- 各品項退款小計
- 運費退款資格
- 最終退款總額
- 政策與驗貨依據
- 第六階段的審查建議與備註
- Calculation version
- RMA Timeline

核准人只能核准完整退款計算、拒絕退款，或填寫理由後退回修改。核准人不能修改金額。
核准頁不執行退款；退款執行只在核准後回到 RMA 詳細頁處理。

## 12. 核心資料實體

### 12.1 RMA

- RMA ID、Order ID、來源、主要原因與安全顧客陳述
- 負責人、SLA、各階段狀態
- 建立、提交、完成時間與目前版本

RMA 不複製姓名、Email、地址或付款資料；UI 需要時由關聯訂單取得，WebMCP 不回傳。

### 12.2 Return Item

- Order line ID、Product ID、SKU 與商品名稱快照
- 原購買、已退款、剩餘可退、本次申請、實收及驗貨通過數量
- 原始實付金額與原幣別
- 驗貨結果、原因與庫存處置

### 12.3 Eligibility Assessment

- 政策版本
- `eligible`、`ineligible` 或 `needs_information`
- 符合規則與缺少證據
- 系統計算結果、人工決定與決定理由
- 評估版本與時間

系統政策結果與人工決定分開保存，人工結果不能覆蓋原始政策判定。

### 12.4 Return Logistics

- 退貨授權時間、寄回期限、物流狀態、收貨時間
- 實際收到的包裹數量與固定結果原因碼

第一階段不串接物流商，也不保存完整寄件地址。

### 12.5 Refund Calculation

- Calculation ID、RMA ID
- RMA、Inspection 與 Order snapshot version
- 各品項退款明細、運費退款、原幣別及最終退款總額
- Calculation version 與產生時間

### 12.6 Refund Approval

- Approval ID、RMA ID
- Calculation ID 與版本
- 狀態、核准人員、理由、建立與決定時間

同一張 RMA 同時間只能存在一筆有效的待核准項目。

### 12.7 Refund Execution Attempt

- Attempt ID、Approval ID、Calculation version
- 執行序號、成功或失敗、固定結果／失敗原因碼
- 執行人員、時間及不含付款識別的備註

退款失敗後可建立下一次 Attempt；成功後禁止再次執行。

### 12.8 Timeline Event

只保存 actor、action、entity ID、occurredAt、result 與 version。不複製 Agent prompt、
完整顧客陳述、客服草稿、個資或付款資料。

### 12.9 Review Note

每筆備註綁定 RMA、七階段之一、作者帳號、類型、內容、證據碼、狀態與版本。草稿只有
作者本人可讀寫；發布後成為所有經手人可見的不可變審查紀錄。人工與 Agent 共用同一
資料模型，Agent 只可代表目前登入帳號更新草稿，不能發布或捨棄。

## 13. 狀態模型

不使用單一巨大 status，而是分開保存各階段狀態：

| 階段 | 狀態 |
| --- | --- |
| RMA | `draft`、`active`、`completed`、`rejected`、`cancelled` |
| Eligibility | `pending`、`authorized`、`rejected`、`needs_information` |
| Logistics | `not_started`、`awaiting_return`、`received`、`expired` |
| Inspection | `not_started`、`in_progress`、`completed` |
| Approval | `not_ready`、`pending`、`approved`、`returned`、`rejected`、`invalidated` |
| Refund | `not_started`、`pending_execution`、`succeeded`、`failed` |

畫面上的「目前階段」由上述狀態推導，避免出現已退款但尚未驗貨等矛盾組合。

主要流程：

```text
草稿
→ 提交申請
→ 資格審查
→ 核准退貨
→ 等待寄回
→ 已收貨
→ 驗貨中
→ 驗貨完成
→ 產生退款計算
→ 等待退款核准
→ 已核准
→ 等待退款執行
→ 退款成功
→ RMA 完成
```

例外分支：

- 資格拒絕 → RMA rejected。
- 逾期未寄回 → Logistics expired。
- 全部品項驗貨拒絕 → 無退款結案。
- 核准退回 → 修改後重新產生版本並送審。
- 核准拒絕 → 無退款結案。
- 退款失敗 → 保留有效核准並等待重新執行。
- 金額或驗貨依據改變 → 原 Approval invalidated。

## 14. 僅全額退款模型

### 14.1 品項退款

每個驗貨通過品項按照原訂單分配後的實付金額退款：

```text
品項退款數量 = 驗貨通過數量
品項退款金額 = 該數量對應的原始實付金額
```

- 原始折扣必須反映在實付金額中，不能按商品牌價退款。
- 訂單折扣產生的尾差沿用訂單原本的金額分配，不在 RMA 重新分配或四捨五入。
- 未通過驗貨的品項退款金額為零。
- 不支援比例退款、人工折價、整新費或其他扣除項目。

### 14.2 運費退款

- 商品瑕疵、寄錯商品或缺件造成退貨時，退還原運費全額。
- 單純改變心意時不退運費。
- 同一訂單已由其他 RMA 退還運費時，不得重複退款。
- 運費只能是原始運費全額或零，不支援部分運費退款。

### 14.3 稅額、優惠與上限

- 商品稅額與訂單折扣沿用原訂單的實付分配結果。
- 不重新計稅。
- 優惠券不恢復，也不另外折現。
- 不跨幣別換算。

```text
最終退款總額
= 驗貨通過品項的原始實付金額
+ 符合政策的原運費
```

最終金額不得超過本次品項剩餘可退款金額、訂單未退款餘額及原訂單實際支付總額。

## 15. 版本與失效規則

以下變更會使 Eligibility、Refund Calculation 與未完成 Approval 失效：

- 退貨品項或申請數量改變
- 退貨原因改變
- Eligibility 人工決定改變
- 實收或驗貨結果改變
- 原訂單金額快照改變
- 運費退款資格改變

以下變更不會使核准失效：

- 負責人改變
- SLA 調整
- 一般內部備註
- Timeline 增加紀錄
- 退款執行失敗

失效後必須標記舊 Approval 為 `invalidated`、重新產生 Refund Calculation version，
並再次送交單級核准。舊核准不得用於退款執行。

## 16. 退款執行

核准後，RMA 詳細頁顯示「記錄退款結果」。使用者可記錄執行時間、成功或失敗、固定
結果／失敗原因碼及不含付款識別的內部備註。

- 核准只會進入 `pending_execution`，不會直接標記退款成功。
- 失敗後可建立新的執行嘗試，計算未變時不必重新核准。
- 成功後完成 RMA，並禁止再次執行。
- 本系統不呼叫支付 API，也不宣稱自己實際移轉款項。

## 17. WebMCP 工具模型

### 17.1 全站查詢與導覽

- `search_returns`
- `get_return_detail`
- `open_return_create`
- `open_return_detail`
- `list_refund_approvals`
- `open_refund_approval`

### 17.2 新增頁工具

- `apply_return_form_draft`：填寫目前新增頁的退貨草稿，不建立或提交 RMA。
- `get_return_form_state`：回傳 route、dirty、valid、missingFields、selectedItems 與
  editor version，作為 completion verifier。

### 17.3 RMA 詳細頁工具

- `check_return_eligibility`：由 executor 依固定政策重新計算資格。
- `get_refund_calculation`：唯讀取得退款計算與有效性。
- `get_my_return_note_draft`：讀取目前帳號、目前 RMA 階段的私人備註草稿及版本。
- `apply_my_return_note_draft`：以 `expectedVersion` 更新同一草稿；不發布、不捨棄，
  也不改變 RMA 業務狀態。

### 17.4 Refund Approval 頁工具

- `get_refund_approval`：唯讀解釋退款依據、驗貨結果、政策與版本。
- `get_my_return_note_draft`、`apply_my_return_note_draft`：只操作目前帳號、
  第六階段 `refund_approval` 的備註草稿。

### 17.5 Registry 禁止項目

不得提供建立／提交 RMA、核准退貨、登記收貨、填寫或完成驗貨、提交退款核准、核准／
拒絕／退回退款、修改金額、記錄退款結果、完成 RMA、執行退款，以及修改訂單、付款、
庫存或顧客狀態的工具。

## 18. WebMCP 安全投影

Agent 可以取得 RMA／Order ID、商品與 SKU、數量、固定原因碼與證據碼、日期與 SLA、
原幣別金額、政策結果、結構化驗貨結果、退款計算及遮罩且有限長度的安全文字。

不得提供姓名、Email、電話、實際地址、Customer ID、帳戶識別、付款方式、卡號、token、
授權碼、外部退款識別、未清理顧客陳述、私密內部備註或 Agent prompt。

所有工具使用 closed object schema，executor 重新驗證輸入，限制字串、陣列、頁數與輸出
筆數，拒絕額外欄位，驗證所有實體與版本。導覽成功會回傳
`rediscoveryRequired: true`；若仍使用舊 registry，executor 回傳結構化
`RE_DISCOVER_REQUIRED`，Agent 最多重新 discovery 一次。備註版本衝突回傳
`VERSION_CONFLICT`，成功 mutation 必須再以 `get_my_return_note_draft` 驗證。

## 19. WebMCP Skills

### `return-intake-assistant`

查詢訂單、開啟新增頁、填寫退貨草稿、驗證完整度，並停在使用者提交前。

### `return-policy-review`

讀取安全 RMA、執行固定政策、整理證據、填寫目前帳號的階段備註草稿，並停在使用者
資格決定前。

### `refund-review-preparation`

讀取驗貨結果與退款計算、檢查版本、解釋全額退款依據、導覽 Refund Approval，必要時
填寫目前帳號的第六階段備註草稿，並停在人工核准前。

## 20. Dashboard 整合

現有指標重構：

| 現有指標 | 重構後指標 |
| --- | --- |
| Exception cases | Open returns／處理中退貨 |
| Human approvals | Pending refunds／待核准退款 |

Dashboard 首頁保留處理中退貨與待核准退款。等待寄回、待驗貨、SLA 逾期與等待退款執行
等詳細指標放在 Returns 與 Refund Approvals 頁面。

Latest activity 可顯示新申請、退貨授權、收貨、驗貨完成、退款核准及退款執行結果，
但不得顯示個資、備註或付款識別。

## 21. Reporting 整合

RMA Repository 納入 Operational Reporting version。建立／提交 RMA、Eligibility 決定、
收貨、驗貨、Refund Calculation、Approval、Refund Execution 或庫存處置變更後，舊
query ID、active report 與 saved evidence 一律失效。

安全投影可包含商品、分類、原因碼、RMA 階段、數量、原幣別金額、政策結果、驗貨結果、
庫存處置、SLA 與各階段耗時。不得投影顧客陳述、備註、客服草稿、個資、Customer ID、
地址、付款／退款識別或 Timeline 原文。

報表能力：

- 商品與分類退貨率
- 退貨原因與來源分布
- Eligibility 通過／拒絕比例
- 驗貨通過、瑕疵、缺件與報廢比例
- 重新入庫數量與價值
- 待核准、待執行與成功退款金額
- 退款失敗率與重試次數
- 各階段平均處理時間與 SLA 逾期

退貨率必須使用實際銷售數量作為分母。不同幣別分開呈現；區域與客群分析沿用目前至少
5 位不同顧客的匿名門檻。

## 22. 持久化與一致性

- RMA、驗貨、核准、退款執行與 Timeline 必須持久保存，reload 後不得消失。
- 初始外部申請只作為種子資料，不得覆蓋使用者修改。
- Returns 必須連結現有 Order 與 Product snapshot。
- 多張 RMA 不得重複退款相同訂單品項數量或運費。
- 「重新入庫」只產生待執行處置；實際 InventoryMovement 仍由使用者確認。
- RMA 或退款資料變更時，Dashboard、Reporting 與 WebMCP 查詢使用一致的新版本。

## 23. 舊功能與資料移除

- `CASE-2004`、`CASE-2005` 轉為外部來源 RMA 種子資料。
- `CASE-2001`、`CASE-2002`、`CASE-2003` 不轉換，分別回歸 Orders 對應狀態。
- 現有記憶體 CaseDraft、Review 與 Audit 不視為正式使用者資料，不進行 migration。
- 移除泛用 `OpsCase`、`CaseDraft.category`、`resolve_case`、固定
  `requiredAction: "resolve_case"`、分類草稿及泛用 Review。
- 保留固定退貨政策、evidence subset 驗證、draft version、人工核准邊界、immutable
  timeline、內容安全、route-aware tools 與 completion verifier 等有效設計。

## 24. 系統邊界

### In

- 雙來源退貨申請
- 固定政策資格判斷
- 退貨授權與寄回追蹤
- 收貨與逐商品驗貨
- 確定性全額退款計算
- 單級人工退款核准
- 外部退款結果記錄與重試
- Timeline、Dashboard、Reports 與安全 WebMCP

### Out

- 顧客退貨前台
- 換貨、補寄與維修
- 物流商與支付 API
- 多級核准
- 部分金額退款與人工改價
- 跨幣別退款
- Agent 最終操作
- 個資或付款識別的 WebMCP 暴露

## 25. 驗收標準

### 25.1 人工建立與外部來源

- 使用者可從 Order Detail 建立退貨，Agent 可填寫但不能提交。
- 外部種子 RMA 可被搜尋與接續處理。
- RMA reload 後仍存在，且初始資料不覆蓋使用者修改。

### 25.2 完整 RMA

- 系統依序完成資格審查、授權、寄回、收貨、驗貨、計算、核准及退款結果。
- 使用者不能跳過驗貨或核准。
- 全部驗貨拒絕時可以無退款結案。

### 25.3 全額退款

- 只退款驗貨通過數量對應的原始實付金額。
- 不允許部分金額、人工扣除、跨幣別或重複退款。
- 核准人不能修改金額。

### 25.4 版本安全

- 驗貨或金額依據變更後，舊 Calculation 與 Approval 自動失效。
- 舊核准不能執行退款。
- 退款失敗可重試；成功後不能再次執行。

### 25.5 WebMCP

- Agent 可查詢、導覽、填寫與驗證目前帳號的表單或備註草稿。
- 備註草稿可由人工或 Agent 填寫，但只有使用者能發布或捨棄。
- Registry 不存在提交、驗貨、核准、退款或完成工具。
- 敏感、額外或版本失效輸入會被 executor 拒絕。
- Route 變更後只暴露目前頁面適用的工具。

### 25.6 Dashboard 與 Reports

- RMA 變更後 Dashboard 與 Reporting 同步更新。
- 不同幣別分開統計。
- Repository version 變更後舊 query evidence 失效。
- Reporting 無法暴露或反推出單一顧客。

### 25.7 舊系統退場

- 導覽不再出現 Operations Cases／Approval Inbox。
- 泛用 OpsCase、Review 與舊 WebMCP tools 移除。
- 非退貨異常回歸 Orders／Inventory。
- 舊路由提供相容 redirect。
- `AGENTS.md`、`docs/COMMERCE-AUTOMATION.md`、Dashboard instructions、skills、測試與
  Demo 腳本全部改用 RMA 敘事。

## 26. 執行前待查證

- Commerce Repository 是否已有足夠的 order-line 實付金額與運費分配資料。
- Order snapshot 如何表示已退款數量與剩餘可退款餘額。
- 重新入庫處置如何與既有 InventoryMovement 人工操作整合。
- RMA Repository 應獨立建立或併入 Commerce Repository。
- Reporting SQLite 安全投影需要新增哪些表與版本來源。
- 舊路由、WebMCP discovery 與 fallback provider 的完整替換範圍。

---

本系統模型已由使用者核准。下一階段應先進行技術可行性查證，再依查證結果建立可執行
的重構計畫；本文件本身不是執行計畫。
