# Security Policy

## 專案定位

Voltage Dashboard 目前是沒有後端的前端展示專案，不是可直接承載正式交易、付款或真實個資的生產系統。請只使用虛構或匿名化資料進行開發與展示。

## 不要提交的內容

- API keys、access tokens、session cookies、私鑰及密碼
- 真實客戶個資、地址、電話、訂單或付款資料
- 生產環境 URL、內部連線資訊或其他未公開設定

本機設定請放在未納入 Git 的 `.env`，並以 [.env.example](.env.example) 維護必要的變數名稱與空值範例。

## 回報安全問題

請不要在公開 issue 或 pull request 貼出可利用的 secret 或完整漏洞細節。若 repository 已啟用 GitHub Private Vulnerability Reporting，請優先使用該管道；否則請透過 repository 維護者的 GitHub 聯絡方式私下回報，並提供重現步驟、影響範圍與建議修復方向。
