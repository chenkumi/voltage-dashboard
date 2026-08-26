---
name: meihua-yishu
description: Meihua Yishu (梅花易數) Plum Blossom I Ching divination skill. Use when users request divination, fortune telling, hexagram casting, or character analysis (測字). Triggers on 占卜, 算卦, 問卦, 起卦, 解卦, 測字, 拆字, meihua, plum blossom, I Ching divination, 梅花易數.
---

# 梅花易數占卜系統 (Plum Blossom I Ching)

梅花易數（梅花心易）是一種高效率、動態的易學占卜系統，核心在於「以理導象，以象定數」。本技能旨在協助使用者進行起卦、斷卦與行動建議。

## 1. 核心指南 (Key Principles)

> [!IMPORTANT]
> **變則通**：占卜的目的不是預定命運，而是指引「如何做出最佳改變」。
> 每次解卦結束時，**必須**提供行動策略建議（策略表詳見 `references/hexagram-strategy.md`）。

---

## 2. 漸進式執行路徑 (Decision Routing)

根據使用者提供的初步資訊，請依照下表選擇後續閱讀的路徑：

| 任務類型 | 第一步建議動作 | 必須閱讀的參考文件 |
| :--- | :--- | :--- |
| **首次使用/無問題** | 向使用者介紹起卦方式 (見下方「起卦引導」) | (無) |
| **帶具體問題起卦** | 優先引導「取象起卦」，或請報數 | `references/divination-casting.md` |
| **已起好卦/請求解卦** | 查閱卦辭與動爻爻辭，判定體用 | `references/64gua.md`, `references/yaoci.md` |
| **提供文字/測字** | 分析字形構造與筆畫 | `references/bagua-wanwu.md` |
| **提供照片/環境資訊** | 提取外應資訊 (顏色、方位、人物) | `references/ying-guides.md` |
| **專業分項目問卜** | (婚姻/財運/疾病/遷移等) | `references/18-divinations.md` |
| **生成最終建議** | 設定吉率等級、給予「下一步」具體動作 | `references/hexagram-strategy.md` |

---

## 3. 標準作業程序 (SOP)

### 第一階段：資訊收集與起卦
1.  **判定起卦法**：預設推薦「時間起卦」，若有具體問題則推薦「數字」或「取象」。
2.  **時間處理**：若涉及時間，必須轉換為農曆。參考 `references/calendar-system.md`。
3.  **數學演算**：演算上下卦、動爻與互卦。規則詳見 `references/divination-casting.md`。

### 第二階段：解卦核心 (四角分析)
1.  **體用分析**：區分體卦（我方）與用卦（事端）。
2.  **爻辭判定**：**優先閱讀** `references/yaoci.md` 中對應動爻的爻辭（定吉凶之基）。
3.  **時序演進**：分析本卦（起點）、互卦（過程）、變卦（結果）。
4.  **外應加持**：若有環境描述，查閱 `references/ying-guides.md` 加入斷卦權重。

### 第三階段：策略產出 (必備)
1.  **判定類型**：依據 `references/hexagram-strategy.md` 判定卦象屬於「吸引子/排斥子/福地/困境/陷阱/一般」。
2.  **給予建議**：明確給出「留 / 走 / 觀 / 守 / 變 / 慎」之一。

---

## 4. 輸出模板 (Output Template)

解卦回覆必須遵循以下結構：

### 0x01 | 起卦資訊
- **方法**：[e.g. 數字起卦] | **農曆**：[e.g. 甲辰年二月初十]

### 0x02 | 卦象圖騰
- **[本卦]** → **[互卦]** → **[變卦]**
- **體用關係**：[e.g. 用生體，吉]
- **動爻爻辭**：「[查閱 `references/yaoci.md`]」— [簡述意義]

### 0x03 | 綜合斷語
[根據體用、理、象、數進行一段深入分析。結合問事背景，避開機械化描述。]

### 0x04 | 策略建議 (必填)
- **本卦**：[卦名] | **吉率**：[X]%
- **類型**：[吸引子/排斥子/福地/...等]
- **策略**：**[留 / 走 / 守 / 變 / 慎 / 觀]**
- **【下一步】**：[對應策略的行動方針，從 `references/hexagram-strategy.md` 提取]
- **路徑**：[若吉率低，指出轉化為「臨卦」的路徑]

---

## 5. 執行規範與倫理
- **理 > 象 > 數**：若卦象與現實邏輯衝突，以現實邏輯（理）為準。
- **倫理約束**：不占涉及死亡、違法、隱私之事。
- 更多規範請見：`references/workflow-and-ethics.md`。
