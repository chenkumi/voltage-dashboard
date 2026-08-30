# Repository Guidelines

## 專案概覽

`voltage-dashboard` 是純前端 Vite WebMCP Dashboard Provider。應用程式只有一個
Dashboard 主體，不包含 Market storefront、Chat Room、內建 Agent 或網站切換器。
Dashboard 以 `document.modelContext` 暴露管理、唯讀 SQL、skills 與報表編輯 tools；
瀏覽器尚未支援原生 API 時，使用同頁測試 provider。

## 參賽目標與產品敘事

<!-- user-specified -->

- 本專案以參加 [OpenAI WebMCP 挑戰賽](https://openai.com/zh-Hant/webmcp-challenge/)
  為當前產品目標，定位為「電商營運自動化平台」。
- 核心敘事不是「做一個可以讓 AI 操作的頁面」，而是「讓既有企業 Web 系統透過
  WebMCP 將商品、訂單、售後、庫存與報表等既有模組暴露給 Agent，使 Agent 能跨功能
  蒐集資料、填寫內容、分類案件、建立草稿並推進原本需要大量人工操作的行政流程」。
- 外部 Agent 由內嵌瀏覽器開啟本系統，並可使用 Agent 自身的瀏覽、搜尋或網路讀取能力
  蒐集第三方資料；本系統的 WebMCP Provider 只負責暴露目前頁面的導覽、查詢、表單填寫
  與安全草稿操作。以外部商品頁建檔時，應由 Agent 先讀取來源，再將整理後的商品欄位
  傳給本頁 WebMCP 填寫工具；不得為此把第三方網頁抓取責任放進 WebMCP executor。
  <!-- user-specified -->
- 產品設計應優先形成可展示的端到端營運流程，而不是加入孤立的 AI 按鈕、聊天介面或
  與業務狀態分離的工具。
- 代表性場景包含：商品資料蒐集、規格與描述填寫、分類及上架草稿；未出貨、付款失敗
  與地址異常的訂單辨識及分類；退貨原因、訂單狀態與政策資格的交叉判斷及客服建議。
- Agent 負責低風險且可追蹤的資料搜尋、內容生成、資料填寫、分類、分析與草稿工作；
  使用者負責檢查結果，並在頁面中直接完成商品發布、訂單變更、退款、付款及其他
  高風險最終核准。

## 環境與基線

- 使用繁體中文回答，文字檔預設以 UTF-8 讀取。 <!-- user-specified -->
- 使用 Node.js、npm、React 19、TypeScript、shadcn/ui、Tailwind CSS 與 Vite。
  <!-- user-specified -->
- 本專案目前沒有後端；未來新增後端時使用 Node.js 與 Hono。
  <!-- user-specified -->
- 安裝依賴：`npm install`；開發伺服器：`npm run dev`，預設
  `http://localhost:6171`。
- 完成修改至少執行 `npm run test`、`npm run typecheck`、`npm run lint` 與
  `npm run build`；UI 修改需在根路徑驗證 Dashboard、WebMCP discovery 與相關工具。
- <!-- user-specified -->Outlet 路由頁面統一使用 `PageLayout`：Header 外層為
  `p-1`，下方 view 為 `grid grid-cols-12 gap-2`；每個 grid block 必須有 `p-1`，
  以 responsive `col-span-*` 分配版面。不得以額外 margin 重複區塊間距，保留
  block padding 供內容的 shadow 或 ring 使用。

## 專案結構與入口

- `src/main.tsx`、`src/App.tsx`：單一 Dashboard 應用程式入口。
- `src/app/webmcp/voltage-admin.tsx`：Dashboard UI、WebMCP tool 註冊與 fallback
  executor。
- `src/app/webmcp/products/`：Product Repository、商品清單／詳細／編輯頁、editor
  state 與路由感知 WebMCP tools。
- `src/app/webmcp/data/dummyjson-products.json`：本機商品種子快照；評價已移除身分欄位。
- `src/app/webmcp/voltage-admin-data.ts`：以 Product Repository snapshot 計算 Dashboard、
  商品搜尋與庫存投影。
- `src/app/webmcp/reporting/`：SQLite runtime、查詢限制、query cache、報表狀態與
  Report Canvas。
- `src/app/webmcp/voltage-admin-skills.ts`：Dashboard instructions 與 skills。
- `src/app/webmcp/operations/`：Operations Cases、案件 Approval Inbox、同步 workflow
  controller、內容安全、退貨政策與 WebMCP tools；不包含商品草稿或商品送審流程。
- `src/components/ui/`：共用 shadcn 元件與 Markdown renderer。

## 核心邊界

- 根路徑直接渲染 Dashboard；不得重新加入 Market、Chat、AI SDK runtime 或多網站
  registry，除非使用者明確要求。
- WebMCP schema 只協助外部 Agent 選擇工具；executor 必須獨立驗證輸入、處理錯誤，
  並遵守瀏覽器來源與 Permissions Policy。
- WebMCP tools 接收外部 Agent 整理後的最小必要欄位並操作本頁狀態；它們不負責搜尋網路、
  讀取第三方商品頁或代理跨來源 fetch。Agent 從外部來源取得的標題、描述、規格與文案仍
  屬不可信內容，executor 必須重新驗證後才能填入頁面。 <!-- user-specified -->
- SQL 僅允許安全的唯讀查詢；不得放寬 single-statement、row/column、字串資料、VM
  steps、逾時或 SQLite authorizer 限制。
- query result 與 active report 綁定目前頁面 runtime；不得跨 context 重用。
- Products、Inventory、Dashboard、商品 WebMCP 查詢與 reporting 商品／庫存投影必須使用
  同一 Product Repository snapshot；商品 mutation 後舊 query ID 與 active report 失效。
- 個資與付款屬高風險資料：tools 不得接受或回傳姓名、Email、地址、電話、帳戶識別
  或付款資料。 <!-- user-specified -->
- WebMCP 營運查詢可使用固定且不可識別個人的付款結果狀態碼
  (`paid`、`pending`、`failed`、`refunded`) 作為篩選或彙總維度；不得接受或回傳付款
  方式、卡號、token、授權碼、帳戶資訊或其他付款識別資料。 <!-- user-specified -->
- 訂單只能唯讀查看；不得新增可建立、確認、取消訂單或提交付款的 tool。高風險最終
  確認必須由使用者直接操作頁面。 <!-- user-specified -->
- Inventory、Orders 與 Customers 的 WebMCP tools 僅提供安全查詢及導覽；庫存調整與
  客戶新增、修改、停權及復權只能由使用者在 UI 中確認執行。 <!-- user-specified -->

## 開發與 Git

- 遵循 Prettier：2 spaces、LF、無分號、雙引號、80 欄寬；Tailwind class 由 plugin
  排序。元件使用 PascalCase，hooks 使用 `use-*.ts`。
- 本機密鑰只放 `.env`，不可提交 API key 或 secrets。
- 不得使用破壞性 Git 操作；保留工作樹中與任務無關的修改。
- Commit 使用簡短命令式訊息，例如 `feat: focus app on dashboard`。

## 參考文件

- [docs/SMART-DASHBOARD.md](docs/SMART-DASHBOARD.md)：修改 SQLite、skills、報表 tools
  或 Report Canvas 前閱讀其架構與安全限制。
- [docs/COMMERCE-AUTOMATION.md](docs/COMMERCE-AUTOMATION.md)：修改商品 editor、營運案件、
  退貨政策、Approval Inbox、operations tools 或人工核准邊界前閱讀。
