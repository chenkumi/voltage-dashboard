# UI 與品質規則

## 路由頁面版面

- Outlet 路由頁面統一使用 `PageLayout`：Header 外層為 `p-1`，下方 view 為
  `grid grid-cols-12 gap-2`；每個 grid block 必須有 `p-1`，以 responsive `col-span-*`
  分配版面。不得以額外 margin 重複區塊間距，保留 block padding 供內容的 shadow 或 ring
  使用。 <!-- user-specified -->

## 程式風格

- 遵循 Prettier：2 spaces、LF、無分號、雙引號、80 欄寬；Tailwind class 由 plugin 排序。
  元件使用 PascalCase，hooks 使用 `use-*.ts`。

## 驗證

- 完成修改至少執行 `npm run test`、`npm run typecheck`、`npm run lint` 與 `npm run build`。
- UI 修改需在根路徑驗證 Dashboard、WebMCP discovery 與相關工具。

## 穩定入口

- 路由定義位於 `src/App.tsx`；共用頁面骨架在
  `src/app/webmcp/voltage-admin-page-layout.tsx`。
- 共用營運清單與指標 UI 位於 `src/app/webmcp/operational-ui/`。
