# Repository Guidelines

## 專案概覽

`voltage-dashboard` 是純前端 Vite WebMCP Dashboard Provider。應用程式只有一個
Dashboard 主體，不包含 Market storefront、Chat Room、內建 Agent 或網站切換器。
Dashboard 以 `document.modelContext` 暴露管理、唯讀 SQL、skills 與報表編輯 tools；
瀏覽器尚未支援原生 API 時，使用同頁測試 provider。

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
- `src/app/webmcp/voltage-admin-data.ts`、`voltage-product-data.ts`：匿名化營運資料。
- `src/app/webmcp/reporting/`：SQLite runtime、查詢限制、query cache、報表狀態與
  Report Canvas。
- `src/app/webmcp/voltage-admin-skills.ts`：Dashboard instructions 與 skills。
- `src/components/ui/`：共用 shadcn 元件與 Markdown renderer。

## 核心邊界

- 根路徑直接渲染 Dashboard；不得重新加入 Market、Chat、AI SDK runtime 或多網站
  registry，除非使用者明確要求。
- WebMCP schema 只協助外部 Agent 選擇工具；executor 必須獨立驗證輸入、處理錯誤，
  並遵守瀏覽器來源與 Permissions Policy。
- SQL 僅允許安全的唯讀查詢；不得放寬 single-statement、row/column、字串資料、VM
  steps、逾時或 SQLite authorizer 限制。
- query result 與 active report 綁定目前頁面 runtime；不得跨 context 重用。
- 個資與付款屬高風險資料：tools 不得接受或回傳姓名、Email、地址、電話、帳戶識別
  或付款資料。 <!-- user-specified -->
- 訂單只能唯讀查看；不得新增可建立、確認、取消訂單或提交付款的 tool。高風險最終
  確認必須由使用者直接操作頁面。 <!-- user-specified -->
- 存量修改只接受明確商品與非負整數，並保留 UI 端確認與 executor 驗證。

## 開發與 Git

- 遵循 Prettier：2 spaces、LF、無分號、雙引號、80 欄寬；Tailwind class 由 plugin
  排序。元件使用 PascalCase，hooks 使用 `use-*.ts`。
- 本機密鑰只放 `.env`，不可提交 API key 或 secrets。
- 不得使用破壞性 Git 操作；保留工作樹中與任務無關的修改。
- Commit 使用簡短命令式訊息，例如 `feat: focus app on dashboard`。

## 參考文件

- [docs/SMART-DASHBOARD.md](docs/SMART-DASHBOARD.md)：修改 SQLite、skills、報表 tools
  或 Report Canvas 前閱讀其架構與安全限制。
