# Voltage Dashboard

Voltage Dashboard 是一個純前端 Vite WebMCP Dashboard Provider，定位為電商營運自動化平台，並以 OpenAI WebMCP 挑戰賽為目前產品目標。

它將既有的商品、訂單、售後、庫存與報表模組以頁面與 WebMCP tools 暴露給 Agent，支援 Agent 蒐集資料、填寫內容、準備退貨審查、建立草稿與產生營運報表。高風險的發布、訂單變更、退款、付款及其他最終核准，仍由使用者在 UI 中檢查並完成。

## 功能範圍

- Dashboard：營運指標與待辦總覽
- Products：商品資料、規格與描述編輯、分類及上架草稿
- Orders：訂單與付款／地址異常的安全查詢
- Returns / RMA：退貨資格、收貨、逐商品驗貨、退款核准與重新入庫流程
- Refund Approvals：人工檢查與退款核准佇列
- Customers、Inventory：客戶及庫存資料檢視
- Reports：安全唯讀 SQL、查詢快取與 Report Canvas
- WebMCP：依頁面提供查詢、導覽、資料填寫與草稿相關能力，並保留同頁 fallback provider 供測試使用

## 開始使用

需求：Node.js 與 npm。

```bash
npm install
npm run dev
```

開發伺服器預設位於 `http://localhost:6171`。Demo 登入帳號為 `guest`，密碼為 `123456`；這組帳號只用於本機展示，不代表正式驗證機制。

常用檢查指令：

```bash
npm run typecheck
npm run lint
npm run build
npm run test
```

## WebMCP 展示

請使用支援 WebMCP 的 Agent／瀏覽器 host 開啟本機 Dashboard，先完成登入，再依目前頁面探索可用能力。工具的能力會隨路由切換，涵蓋商品、訂單、退貨、庫存、客戶與報表等營運情境。

## 資料與安全邊界

- 本專案目前沒有後端，使用本機 seed data、瀏覽器儲存及展示用資料來源；不應放入真實客戶、付款或公司機密資料。
- Agent 可執行低風險且可追蹤的搜尋、內容生成、資料填寫、分類、分析與草稿工作。
- 商品發布、訂單狀態變更、退款、付款及其他高風險動作，必須由使用者在頁面中檢查與完成。
- 不要提交 API key、token、私鑰或其他 secrets。環境變數範例請參考 [.env.example](.env.example)。

更完整的產品與架構說明請參考：

- [docs/COMMERCE-AUTOMATION.md](docs/COMMERCE-AUTOMATION.md)
- [docs/SMART-DASHBOARD.md](docs/SMART-DASHBOARD.md)
- [docs/RETURNS-RMA-SYSTEM-MODEL.md](docs/RETURNS-RMA-SYSTEM-MODEL.md)
- [.agents/rules/webmcp-data-safety.md](.agents/rules/webmcp-data-safety.md)

## 專案協作

請先閱讀 [CONTRIBUTING.md](CONTRIBUTING.md)。安全問題回報方式與不應提交的資料，請參考 [SECURITY.md](SECURITY.md)。版本變更記錄位於 [CHANGELOG.md](CHANGELOG.md)。

## 授權

目前尚未指定公開授權。正式公開前，請由專案擁有者選擇適用授權並加入 `LICENSE` 檔案；在此之前，未授權第三方任意複製、修改或散布本專案。
