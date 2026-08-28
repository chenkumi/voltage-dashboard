1. tool chain調用次數達上限目前如何處理
是否能夠到達上限 會自動發出一則暫停指示
停用所有訊息
報告用戶處理進度
等待下一步指示
而不是直接截斷

2. input message應有滑動窗口(先使用20輪對話)

3. .env增加provider支援 VITE_APP_PROVIDER value四選一:
openai-compatible(default) / openai / anthropic / gemini

4. report canvas grid排版

5. get_state

6. model有錯誤沒有任何顯示