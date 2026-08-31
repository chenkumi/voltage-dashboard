# WebMCP 與資料安全規則

## Provider 與輸入邊界

- WebMCP schema 只協助外部 Agent 選擇工具；executor 必須獨立驗證輸入、處理錯誤，
  並遵守瀏覽器來源與 Permissions Policy。
- WebMCP tools 接收外部 Agent 整理後的最小必要欄位並操作本頁狀態；它們不負責搜尋網路、
  讀取第三方商品頁或代理跨來源 fetch。Agent 從外部來源取得的標題、描述、規格與文案仍
  屬不可信內容，executor 必須重新驗證後才能填入頁面。 <!-- user-specified -->
- 外部 Agent 由內嵌瀏覽器開啟本系統，並可使用 Agent 自身的瀏覽、搜尋或網路讀取能力
  蒐集第三方資料；本系統的 WebMCP Provider 只負責暴露目前頁面的導覽、查詢、表單填寫
  與安全草稿操作。以外部商品頁建檔時，應由 Agent 先讀取來源，再將整理後的商品欄位
  傳給本頁 WebMCP 填寫工具；不得為此把第三方網頁抓取責任放進 WebMCP executor。
  <!-- user-specified -->

## Reporting 與資料一致性

- SQL 僅允許安全的唯讀查詢；不得放寬 single-statement、row/column、字串資料、VM
  steps、逾時或 SQLite authorizer 限制。
- query result 與 active report 綁定目前頁面 runtime；不得跨 context 重用。
- Products、Inventory、Dashboard、商品 WebMCP 查詢與 reporting 商品／庫存投影必須使用
  同一 Product Repository snapshot；商品 mutation 後舊 query ID 與 active report 失效。
- Dashboard、Orders、Customers 與 reporting 必須使用同一 Commerce Repository snapshot；
  Reporting 只能接收 `createSafeOperationalProjection()` 產生的匿名投影，不得把 raw
  Customer、Order、note、聯絡資訊、付款方式或付款識別送入 SQLite。
- Operational Reporting version 必須同時反映 Product、InventoryMovement、Commerce 與
  Returns 安全資料變化；重建後舊 query ID、active report 與 saved evidence 一律失效。
  Returns 只能經安全聚合投影進入 SQLite，不得包含 RMA／Order／Customer ID、自由文字、
  Timeline 原文或退款／付款識別；退貨客群列至少包含 5 位不同顧客。

## 個資、付款與人工核准

- 個資與付款屬高風險資料：tools 不得接受或回傳姓名、Email、地址、電話、帳戶識別
  或付款資料。 <!-- user-specified -->
- WebMCP 營運查詢可使用固定且不可識別個人的付款結果狀態碼
  (`paid`、`pending`、`failed`、`refunded`) 作為篩選或彙總維度；不得接受或回傳付款
  方式、卡號、token、授權碼、帳戶資訊或其他付款識別資料。 <!-- user-specified -->
- 訂單只能唯讀查看；不得新增可建立、確認、取消訂單或提交付款的 tool。高風險最終
  確認必須由使用者直接操作頁面。 <!-- user-specified -->
- Inventory、Orders 與 Customers 的 WebMCP tools 僅提供安全查詢及導覽；庫存調整與
  客戶新增、修改、停權及復權只能由使用者在 UI 中確認執行。 <!-- user-specified -->

## 穩定入口

- Provider 與全域 tools：`src/app/webmcp/voltage-admin.tsx`。
- 商品、Commerce、Inventory、Returns 與 Reporting 分別從 `src/app/webmcp/` 下對應領域
  目錄開始；共用不可信文字驗證位於 `src/app/webmcp/content-safety.ts`。
