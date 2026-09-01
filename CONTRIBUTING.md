# Contributing

感謝協助改善 Voltage Dashboard。這個專案目前是純前端展示與 WebMCP 挑戰賽作品，提交變更前請先確認變更仍符合電商營運自動化的產品敘事與資料安全邊界。

## 開發流程

```bash
npm install
npm run dev
```

請不要在 repository 中提交 `.env`、API key、token、私鑰、真實客戶資料、付款資料或其他機密。需要環境變數時，請更新 [.env.example](.env.example)，但只放空值或非敏感範例。

## 提交前檢查

修改完成後，請依變更範圍執行：

```bash
npm run typecheck
npm run lint
npm run build
npm run test
```

若變更涉及 WebMCP tool、SQL、資料投影、商品、訂單或 RMA，請先閱讀 [.agents/rules/webmcp-data-safety.md](.agents/rules/webmcp-data-safety.md) 及對應的 `docs/` 架構文件。若涉及 UI，請閱讀 [.agents/rules/ui-quality.md](.agents/rules/ui-quality.md)。

## Pull request 建議

- 說明問題背景、修改範圍及使用者可觀察到的結果。
- 列出執行過的檢查指令與結果；UI 變更請附上操作步驟或截圖。
- 保留高風險動作的人工作業與確認邊界，不要讓 Agent 直接執行發布、退款、付款或不可逆資料變更。
- 不要混入與本次變更無關的格式化、產物或舊測試截圖。
