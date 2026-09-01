建議把三分鐘影片集中成一條故事：「Agent 準備退款審查，人員保留最終決策權」。這比逐頁展示功能更容易讓評審理解 WebMCP 的價值。

我已確認目前 `APR-2006` 適合拍攝：處於第 6 階段待核准、退款金額 `US$7.99`，具有完整政策、驗貨、退款計算與人工決策區。

## 三分鐘展示腳本

| 時間 | 畫面與操作 | 旁白重點 |
|---|---|---|
| 0:00–0:15 | Voltage Dashboard 與 Codex 並排 | 產品定位與問題 |
| 0:15–0:35 | 退款核准清單／待處理數量 | 人工原本必須跨頁查證 |
| 0:35–1:20 | 將主提示詞交給 Agent，顯示 WebMCP 呼叫 | Agent 自動搜尋、讀取、導覽、核對 |
| 1:20–1:45 | `APR-2006` 頁面與自動填入的審查備註 | Agent 只準備可逆內容 |
| 1:45–2:15 | 使用者發布備註並核准退款 | 高風險決策仍由人執行 |
| 2:15–2:40 | 第二個提示詞，Agent 重新確認並開啟 RMA | 業務狀態跨模組同步 |
| 2:40–2:55 | 顯示七階段流程進入「退款執行」 | Agent 不能執行退款 |
| 2:55–3:00 | 定格於流程與人工按鈕 | 一句話總結產品價值 |

## 0:00–0:15：開場

畫面：

- 左側或主要區域顯示 Voltage Dashboard。
- 右側顯示 Codex。
- 快速帶到側邊欄的商品、訂單、退貨、退款核准、報表模組。

旁白：

> 企業後台通常有完整的人工流程，但 Agent 只能猜測畫面操作。Voltage 透過 WebMCP，將既有營運功能安全地暴露成結構化工具，不需要加入聊天介面，也不改變原本的人工系統。

## 0:15–0:35：建立業務問題

進入「退款核准」列表，顯示目前有一筆待處理案件。

旁白：

> 例如退款核准，人員原本需要查找待辦、檢查退貨資格、驗貨結果、退款計算及相關版本。我現在把這項準備工作交給 Agent。

## 0:35–1:20：主要 Agent 提示詞

在 Codex 輸入：

> 找出目前待核准且等待最久的退款申請。檢查它的退貨資格、驗貨結果、退款計算、金額與資料版本；如果證據一致，請用目前帳號草擬一則「建議核准」的審查備註，並開啟核准頁讓我檢查。不要替我發布備註、核准或執行退款。

> Find the refund request that is currently awaiting approval and has been waiting the longest. Review its return eligibility, inspection results, immutable refund calculation, amount, and relevant data versions.  
> If the evidence is consistent, use my current account to prepare a review note recommending approval, then open the approval page for my review.  
> Do not publish the note, approve or reject the request, modify the refund amount, execute the refund, or perform any other final action. Leave all final decisions to me.


理想 WebMCP 操作順序：

1. `agent_instructions`
2. `skill_list`／必要時 `load_skill`
3. `list_refund_approvals`
4. `open_refund_approval`
5. 導覽後重新 discovery
6. `get_refund_approval`
7. `get_my_return_note_draft`
8. `apply_my_return_note_draft`
9. 再用 `get_my_return_note_draft` 驗證結果

旁白：

> Agent 不是從畫面猜按鈕，而是發現網站提供的工具。它找到待核准案件，導覽後重新取得該頁能力，再讀取不可變的退款計算與驗貨證據。

畫面應停留一下，讓觀眾看見：

- `APR-2006`
- `RMA-2006`
- `US$7.99`
- 驗貨與計算版本
- WebMCP 工具呼叫紀錄

## 1:20–1:45：展示 Agent 準備的結果

畫面向下捲到「審查建議與備註」，顯示：

- 類型：審查建議
- 建議：建議核准
- Agent 擬寫的備註
- 草稿已自動儲存
- 「加入審查建議與備註」仍是人工按鈕

旁白：

> Agent 依證據準備了一份可逆草稿。這不是 Agent 專用筆記，而是原本人工流程中的審查備註；使用者可以修改、發布或捨棄。

## 1:45–2:15：人工決策

由使用者親自：

1. 按下「加入審查建議與備註」。
2. 選擇「核准退款」。
3. 按下「確認所選決定」。

旁白：

> WebMCP 沒有核准工具。發布備註與退款決策仍由登入使用者完成。Agent 加速資料蒐集與準備，但不越過責任邊界。

建議讓畫面清楚出現核准成功，以及流程進入下一階段。

## 2:15–2:40：證明跨模組狀態同步

在 Codex 輸入第二個提示詞：

> 確認剛才核准的案件現在位於哪個流程階段，並開啟對應的 RMA 讓我繼續處理。不要記錄或執行退款。

> Verify the current workflow stage of the refund request I just approved, then open the corresponding RMA so I can continue the process. Do not execute the refund or record a refund result.

Agent 應重新讀取狀態並導覽至 `RMA-2006`。

旁白：

> 人工核准完成後，Agent 可以重新讀取最新狀態並跨模組繼續工作，不需要複製 ID 或重新描述上下文。

## 2:40–2:55：展示最後安全邊界

畫面顯示七階段流程：

- 前六階段已完成。
- 目前階段為「退款執行」。
- 頁面提供人工記錄退款結果的入口。
- WebMCP 沒有實際退款工具。

旁白：

> 系統已進入退款執行階段，但實際付款與結果紀錄仍由人員操作。網站明確決定 Agent 可以做什麼，而不是讓 Agent任意控制整個後台。

## 2:55–3:00：收尾

旁白建議：

> Voltage 證明既有企業系統不必變成 AI 應用，也能透過 WebMCP，讓人與 Agent 安全地完成真正的端到端工作。

畫面定格在七階段流程與人工操作區。

## 拍攝前準備

- 確認 `APR-2006` 仍為待核准，避免彩排時先核准掉。
- 先捨棄 `RMA-2006`／`APR-2006` 現有備註草稿，讓影片能清楚拍到 Agent 從無到有填入內容。
- 彩排後若案件狀態已改變，需要重置展示資料再正式錄影。
- 將瀏覽器縮放設為約 90%，確保流程、金額與 Codex 工具呼叫能同時看清楚。
- 剪掉 Agent 等待時間，但保留關鍵工具名稱、輸入與結果。
- 不要展示所有工具或逐頁巡覽；三分鐘內只需證明「搜尋 → 驗證 → 草稿 → 人工核准 → 狀態同步」。
- 商品建檔與報表能力可放在 Devpost 文字說明或補充截圖，不要搶占主影片時間。

