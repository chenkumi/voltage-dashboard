# Repository Guidelines

## 專案概覽

`voltage-dashboard` 是純前端 Vite WebMCP Dashboard Provider，定位為參加
[OpenAI WebMCP 挑戰賽](https://openai.com/zh-Hant/webmcp-challenge/)的電商營運自動化
平台。應用程式只有一個 Dashboard 主體；以 `document.modelContext` 暴露管理、唯讀
SQL、skills 與報表編輯 tools，原生 API 不可用時使用同頁測試 provider。

## 產品敘事

<!-- user-specified -->

- 本專案以參加 [OpenAI WebMCP 挑戰賽](https://openai.com/zh-Hant/webmcp-challenge/)
  為當前產品目標，定位為「電商營運自動化平台」。
- 核心敘事不是「做一個可以讓 AI 操作的頁面」，而是「讓既有企業 Web 系統透過
  WebMCP 將商品、訂單、售後、庫存與報表等既有模組暴露給 Agent，使 Agent 能跨功能
  蒐集資料、填寫內容、準備退貨審查、建立草稿並推進原本需要大量人工操作的行政流程」。
- 產品設計應優先形成可展示的端到端營運流程，而不是加入孤立的 AI 按鈕、聊天介面或
  與業務狀態分離的工具。
- 代表性場景包含：商品資料蒐集、規格與描述填寫、分類及上架草稿；未出貨、付款失敗
  與地址異常的訂單安全查詢；RMA 建立、政策資格、收貨、逐商品驗貨、全額退款核准、
  退款執行紀錄、重新入庫及匿名退貨報表。
- Agent 負責低風險且可追蹤的資料搜尋、內容生成、資料填寫、分類、分析與草稿工作；
  使用者負責檢查結果，並在頁面中直接完成商品發布、訂單變更、退款、付款及其他
  高風險最終核准。

## 專案結構

- `src/main.tsx`、`src/App.tsx`：應用程式入口與路由。
- `src/app/webmcp/voltage-admin.tsx`：Provider、tool 註冊與 fallback executor。
- `src/app/webmcp/products/`、`inventory/`、`orders/`、`customers/`、`returns/`：各營運
  領域的資料、頁面與 route-aware tools。
- `src/app/webmcp/commerce-data/`：Commerce Repository 與訂單／客戶資料基線。
- `src/app/webmcp/reporting/`：SQLite runtime、安全 SQL、query cache 與 Report Canvas。
- `src/app/webmcp/operational-ui/`：清單與指標共用 UI；不承擔資料投影或 tool 安全邏輯。
- `src/components/ui/`：共用 shadcn 元件與 Markdown renderer。

## 基線環境

- 使用繁體中文回答，文字檔預設以 UTF-8 讀取。 <!-- user-specified -->
- 使用 Node.js、npm、React 19、TypeScript、shadcn/ui、Tailwind CSS 與 Vite。
  <!-- user-specified -->
- 本專案目前沒有後端；未來新增後端時使用 Node.js 與 Hono。
  <!-- user-specified -->
- 安裝：`npm install`；開發：`npm run dev`（預設 `http://localhost:6171`）。
- 完成修改至少執行：`npm run test`、`npm run typecheck`、`npm run lint`、`npm run build`。

## 核心邊界

- 根路徑直接渲染 Dashboard；不得重新加入 Market、Chat、AI SDK runtime 或多網站
  registry，除非使用者明確要求。
- WebMCP tools 僅處理本頁的安全查詢、導覽與草稿；高風險最終動作一律由使用者在 UI
  完成。修改 tool、資料投影、SQL、商品或 RMA 流程前，閱讀
  [.agents/rules/webmcp-data-safety.md](.agents/rules/webmcp-data-safety.md)。
- 不得提交 secrets 或 API key；本機密鑰僅放 `.env`。不得使用破壞性 Git 操作，並保留
  工作樹中與任務無關的修改。

## 參考規則

- [.agents/rules/webmcp-data-safety.md](.agents/rules/webmcp-data-safety.md)：修改
  WebMCP schema／executor、SQLite、Repository 投影、商品、訂單或 RMA 時閱讀。
- [.agents/rules/ui-quality.md](.agents/rules/ui-quality.md)：修改 Outlet 路由頁面、Tailwind
  版面、元件格式或規劃驗證時閱讀。
- [docs/SMART-DASHBOARD.md](docs/SMART-DASHBOARD.md)：修改 SQLite、skills、報表 tools
  或 Report Canvas 前閱讀其架構與安全限制。
- [docs/COMMERCE-AUTOMATION.md](docs/COMMERCE-AUTOMATION.md)：修改商品 editor、RMA、
  Refund Approvals、Returns tools 或人工核准／退款邊界前閱讀。
- [docs/RETURNS-RMA-SYSTEM-MODEL.md](docs/RETURNS-RMA-SYSTEM-MODEL.md)：變更 RMA 狀態、
  退款模型、退貨投影或其驗收行為前閱讀。

## 追蹤項目

- [TODO.md](TODO.md) 是動態待辦；開始涉及 tool chain、輸入視窗、provider、Report Canvas
  或模型錯誤顯示的工作前重新確認。
