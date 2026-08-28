type VoltageAdminSkill = {
  name: string
  description: string
  text: string
}

const skills = [
  {
    name: "voltage-admin-inventory",
    description:
      "用途：安全更新後台庫存。何時呼叫：管理者明確要求補貨或校正時。觸發例子：「補貨」、「庫存改為 20」、「盤點」、「缺貨商品」。不該呼叫：未指定商品和數量時。",
    text: "先用 get_voltage_admin_product 或 list_voltage_admin_inventory 確認目前庫存。只有當管理者明確提供商品 ID 與新的非負整數存量時，才可使用 set_voltage_admin_inventory。回覆更新後的商品與庫存摘要；不要推測或自行調整存量。",
  },
  {
    name: "voltage-admin-order-safety",
    description:
      "用途：說明匿名訂單查閱的安全邊界。何時呼叫：詢問訂單處理或客戶資料限制時。觸發例子：「訂單怎麼處理」、「取消訂單」、「客戶資料」、「付款狀態」。不該呼叫：僅需商品庫存時。",
    text: "訂單工具只提供匿名化摘要，不能回傳或索取姓名、Email、地址、電話或付款資料。不得以任何 WebMCP tool 建立、確認或取消訂單；需要這些高風險操作時，請使用者直接在安全的管理頁面完成最終動作。",
  },
  {
    name: "voltage-sales-data",
    description:
      "用途：理解商品與每日銷售資料的粒度、單位、期間及 join 規則。何時呼叫：分析營收、銷量、品類或趨勢前。觸發例子：「本週營收」、「前三分類」、「每日趨勢」。不該呼叫：只需修改單一商品庫存時。",
    text: `# Voltage sales data

## agent_products

每列代表一個商品。\`product_id\` 是商品鍵；\`title\` 與 \`category\` 是非個人的 curated 商品文字；\`price_usd\` 單位為 USD。

## agent_sales_daily

每列代表「銷售日期 × 商品」的每日彙總。\`sale_date\` 採 \`Asia/Taipei\` 日曆日期；\`product_id\` 可多對一連接 \`agent_products.product_id\`；\`quantity\` 單位為件；\`net_revenue_usd\` 是折扣後、不含運費的淨營收，單位為 USD。

目前 demo 銷售資料涵蓋 2026-08-21 至 2026-08-27。實際查詢前仍須讀取 \`agent_dataset_status\`，以其中的期間、時區、更新時間與完整度為準。

只在需要商品標題或分類時 join \`agent_products\`。不得將 \`agent_sales_daily\` 直接和具有不同粒度的每日快照做多對多 join。比較兩個期間時使用相同天數，並標示不完整資料。這些 curated tables 不包含個資、帳戶識別或付款資料。`,
  },
  {
    name: "voltage-inventory-data",
    description:
      "用途：理解目前庫存資料、更新時間與低庫存分析限制。何時呼叫：分析缺貨、低庫存或補貨優先順序前。觸發例子：「低庫存風險」、「優先補貨」、「庫存摘要」。不該呼叫：只需銷售趨勢時。",
    text: `# Voltage inventory data

## agent_inventory

每列代表一個商品目前可見的庫存快照。\`product_id\` 是商品鍵，可一對一連接 \`agent_products.product_id\`；\`stock\` 單位為件且不得為負數；\`updated_at\` 是含時區的 ISO 8601 更新時間。demo fixture 的更新時間為 2026-08-28T00:00:00+08:00；查詢時應以 \`agent_dataset_status\` 的動態狀態為準。

低庫存門檻不是資料本身的固定業務規則；分析時要明確揭露採用的門檻。\`stock = 0\` 應與低庫存分開呈現。若要搭配近期銷量，先將 \`agent_sales_daily\` 聚合成每個 \`product_id\` 一列，再與 inventory 一對一連接；禁止把庫存快照直接連到多日銷售明細後加總 stock，避免多對多或重複計算。

庫存資料不含供應商聯絡方式、客戶個資、帳戶識別或付款資料；不得推導或要求這些資料。`,
  },
  {
    name: "voltage-report-authoring",
    description:
      "用途：規劃可追溯且可由使用者繼續編輯的營運報表。何時呼叫：開始製作或修改報表前。觸發例子：「做本週營運報表」、「修改既有報表」、「加入證據摘要」。不該呼叫：只需回答單一資料問題時。",
    text: `# Voltage report authoring

開始分析前先查詢 \`agent_dataset_status\`。每個結論都要引用實際查詢證據，並清楚標示資料期間、\`Asia/Taipei\` 時區、更新時間、完整度及查詢結果是否截斷。資料不足或結果截斷時，不得把結果描述為完整分析。

SQL 負責探索與聚合資料；本 skill 負責報表品質與語意。只有在目前頁面實際 discovery 到報表建立或編輯 tools 時才能使用它們；未 discovery 到時，不得宣稱已建立 Report Canvas、已保存 query result 或已修改報表。

execute_readonly_sql 與 create_report 沒有固定先後，兩種順序都有效；但 add_report_widget 必須在 active report 存在後，使用同一 workspace 中成功 SQL 回傳的有效 queryId。每次報表 mutation 成功後都要再呼叫 discovery 到的唯讀 report-state verifier；只有最新 verifier 結果包含預期 report 與 widgets 時才能回報完成。

任何 tool error 都代表該動作未完成。若部分 widgets 成功、部分失敗，或 verifier 失敗／缺少，不得宣稱整份報表已建立；最終回覆必須明確標示 PARTIALLY_COMPLETED 或 FAILED，列出已確認成果與尚未確認項目，不得把「將建立」寫成「已建立」。

若目前已有 report，先讀取其 state，再更新、移動或移除既有 widgets；除非使用者明確要求重做，否則不要反覆建立新 report。報表文字只能包含營運彙總與證據，不得包含或索取個資、帳戶識別或付款資料，也不得執行任意 HTML、JavaScript 或生成程式碼。`,
  },
] as const satisfies readonly VoltageAdminSkill[]

const skillByName = new Map<string, VoltageAdminSkill>(
  skills.map((skill) => [skill.name, skill])
)

export const VOLTAGE_ADMIN_AGENT_INSTRUCTIONS =
  "目標：協助 Voltage Market 商家查閱 Dashboard、Products、Orders、Customers、Inventory 與 Reports。SQL tool 負責探索匿名化營運資料，skills 負責解釋資料語意與分析規則；使用目前 discovery 到的 report tools，引用成功 SQL 回傳的 queryId 建立可由使用者在 Report Canvas 繼續編輯的成果。任何 tool error 都代表該動作未完成；報表 mutation 必須由最新唯讀 state verifier 確認後才能宣稱完成，未驗證或部分失敗時應回報 PARTIALLY_COMPLETED 或 FAILED。可在管理者明確指定商品與非負整數存量時更新庫存。不得在 Chat 索取、接收、重述或輸出姓名、Email、地址、電話、帳戶或付款資料；不得建立、確認或取消訂單。需要流程或資料細節時，載入對應 skill；不得假設未 discovery 的能力可用。"

export const listVoltageAdminSkills = () => ({
  skills: skills.map(({ name, description }) => ({ name, description })),
})

export const loadVoltageAdminSkill = (name: unknown) => {
  if (typeof name !== "string")
    return { status: "ARGUMENT_ERROR", message: "Skill not found." }

  const skill = skillByName.get(name)
  return skill
    ? { type: "skill", name: skill.name, text: skill.text }
    : { status: "ARGUMENT_ERROR", message: "Skill not found." }
}
