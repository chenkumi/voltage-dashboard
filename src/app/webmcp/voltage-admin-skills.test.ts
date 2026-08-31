import { describe, expect, it } from "vitest"
import {
  getVoltageAdminAgentInstructions,
  listVoltageAdminSkills,
  loadVoltageAdminSkill,
  VOLTAGE_ADMIN_AGENT_INSTRUCTIONS,
} from "./voltage-admin-skills"

const smartDashboardSkillNames = [
  "voltage-sales-data",
  "voltage-inventory-data",
  "voltage-returns-data",
  "voltage-report-authoring",
]

const operationsSkillNames = [
  "catalog-onboarding",
  "return-intake-assistant",
  "return-policy-review",
  "refund-review-preparation",
]

describe("Voltage Admin skills", () => {
  it("discovers the four Smart Dashboard skills alongside existing safety skills", () => {
    const actualNames = listVoltageAdminSkills().skills.map(
      (skill) => skill.name
    )

    expect(actualNames).toEqual(
      expect.arrayContaining([
        "voltage-admin-inventory",
        "voltage-admin-order-safety",
        ...smartDashboardSkillNames,
        ...operationsSkillNames,
      ])
    )
  })

  it.each(smartDashboardSkillNames)(
    "loads %s by its exact discovered name",
    (name) => {
      const actual = loadVoltageAdminSkill(name)

      expect(actual).toEqual({
        type: "skill",
        name,
        text: expect.any(String),
      })
    }
  )

  it("rejects unknown and invalid skill names without leaking the registry", () => {
    const expected = {
      status: "ARGUMENT_ERROR",
      message: "Skill not found.",
    }

    expect(loadVoltageAdminSkill("voltage-missing")).toEqual(expected)
    expect(loadVoltageAdminSkill(undefined)).toEqual(expected)
  })

  it("documents sales grain, units, timezone, period, status, and joins", () => {
    const actual = loadVoltageAdminSkill("voltage-sales-data")

    expect(actual).toMatchObject({ type: "skill" })
    expect("text" in actual ? actual.text : "").toMatch(
      /agent_products[\s\S]*agent_sales_daily[\s\S]*銷售日期 × 商品/
    )
    expect("text" in actual ? actual.text : "").toMatch(
      /USD[\s\S]*TWD[\s\S]*agent_dataset_status[\s\S]*實際期間[\s\S]*Asia\/Taipei/
    )
    expect("text" in actual ? actual.text : "").toMatch(
      /agent_sales_daily[\s\S]*agent_order_product_daily[\s\S]*同一批訂單明細[\s\S]*不可.*join/
    )
    expect("text" in actual ? actual.text : "").toMatch(
      /agent_customer_monthly[\s\S]*customer_count[\s\S]*至少為 5/
    )
  })

  it("documents inventory units, freshness, and safe sales aggregation", () => {
    const actual = loadVoltageAdminSkill("voltage-inventory-data")
    const text = "text" in actual ? actual.text : ""

    expect(text).toMatch(/agent_inventory[\s\S]*stock[\s\S]*單位為件/)
    expect(text).toMatch(/agent_dataset_status[\s\S]*queryId 失效/)
    expect(text).toMatch(/先將.*agent_sales_daily.*聚合[\s\S]*禁止.*重複計算/)
    expect(text).toMatch(
      /agent_products[\s\S]*JOIN agent_products[\s\S]*i\.stock <= \?/
    )
  })

  it("documents safe return grains, joins, currencies, and cohort privacy", () => {
    const actual = loadVoltageAdminSkill("voltage-returns-data")
    const text = "text" in actual ? actual.text : ""

    expect(text).toMatch(
      /agent_return_product_daily[\s\S]*agent_sales_daily[\s\S]*不得直接.*join/
    )
    expect(text).toMatch(
      /inventory_disposition_status_code[\s\S]*completed[\s\S]*pending\/failed/
    )
    expect(text).toMatch(
      /agent_return_operational_daily[\s\S]*cycle_time_hours_total[\s\S]*completed_count/
    )
    expect(text).toMatch(
      /sla_breached_count_as_of_snapshot[\s\S]*agent_dataset_status\.updated_at[\s\S]*不是即時/
    )
    expect(text).toMatch(
      /agent_refund_daily[\s\S]*currency_code[\s\S]*refund_usd/
    )
    expect(text).toMatch(
      /agent_return_cohort_monthly[\s\S]*至少 5 位[\s\S]*不得反推/
    )
    expect(text).toMatch(/Return Repository[\s\S]*queryId/)
  })

  it("documents native product currencies without invented conversion", () => {
    const actual = loadVoltageAdminSkill("voltage-sales-data")
    const text = "text" in actual ? actual.text : ""

    expect(text).toMatch(
      /price_amount[\s\S]*currency_code[\s\S]*price_usd[\s\S]*TWD 商品為 NULL[\s\S]*不得自行推測匯率/
    )
    expect(text).toMatch(/draft[\s\S]*published[\s\S]*archived/)
  })

  it("requires evidence and honest report capability discovery", () => {
    const actual = loadVoltageAdminSkill("voltage-report-authoring")
    const text = "text" in actual ? actual.text : ""

    expect(text).toMatch(
      /先查詢 `agent_dataset_status`[\s\S]*資料期間[\s\S]*Asia\/Taipei[\s\S]*更新時間[\s\S]*截斷/
    )
    expect(text).toMatch(/實際 discovery[\s\S]*不得宣稱已建立 Report Canvas/)
    expect(text).toMatch(
      /execute_readonly_sql[\s\S]*create_report[\s\S]*沒有固定先後/
    )
    expect(text).toMatch(/add_report_widget[\s\S]*active report[\s\S]*queryId/)
    expect(text).toMatch(/tool error[\s\S]*PARTIALLY_COMPLETED[\s\S]*FAILED/)
    expect(text).toMatch(/最新 verifier 結果[\s\S]*才能回報完成/)
    expect(text).toMatch(/先讀取其 state[\s\S]*不要反覆建立新 report/)
    expect(text).toMatch(
      /agent_dataset_status[\s\S]*categoryColumn[\s\S]*不得把 table 的 `columns` 用於 bar/
    )
    expect(text).toMatch(
      /6 欄構成[\s\S]*xSpace[\s\S]*ySpace[\s\S]*最小高度為 5rem/
    )
    expect(text).toMatch(
      /一般報表的預設是 `ySpace: 1`[\s\S]*同一排並列[\s\S]*避免/
    )
    expect(text).toMatch(/兩個左側小 widgets 垂直堆疊[\s\S]*右側 Bar 恰好等高/)
  })

  it("requires verifier-backed completion in shared Admin instructions", () => {
    expect(VOLTAGE_ADMIN_AGENT_INSTRUCTIONS).toMatch(
      /tool error[\s\S]*未完成[\s\S]*state verifier[\s\S]*(?:PARTIALLY_COMPLETED|FAILED)/
    )
    expect(VOLTAGE_ADMIN_AGENT_INSTRUCTIONS).toMatch(
      /nextToolset\.ready: true[\s\S]*重新 discovery 一次[\s\S]*不可沿用上一頁/
    )
    expect(VOLTAGE_ADMIN_AGENT_INSTRUCTIONS).toMatch(
      /TOOLSET_NOT_READY[\s\S]*停止下一步[\s\S]*不得重試舊 handle/
    )
  })

  it.each(operationsSkillNames)(
    "loads operations skill %s with workflow and safety guidance",
    (name) => {
      const skill = loadVoltageAdminSkill(name)
      const text =
        "text" in skill && typeof skill.text === "string" ? skill.text : ""

      expect(skill).toMatchObject({ type: "skill", name })
      expect(text.length).toBeGreaterThan(120)
    }
  )

  it("provides route-aware return boundaries", () => {
    expect(getVoltageAdminAgentInstructions("returns")).toMatch(
      /Returns[\s\S]*可逆[\s\S]*使用者操作/
    )
    expect(
      getVoltageAdminAgentInstructions(
        "refund-approvals",
        "目前頁面：退款核准 APR-2008，這是第 6 階段 refund_approval 的核准記錄；RMA 流程目前階段為 refund_execution。"
      )
    ).toMatch(
      /APR-2008[\s\S]*refund_approval[\s\S]*發布[\s\S]*rediscoveryRequired[\s\S]*RE_DISCOVER_REQUIRED/
    )
  })

  it("documents verifier use, untrusted sources, and human final actions", () => {
    const catalog = loadVoltageAdminSkill("catalog-onboarding")
    const intake = loadVoltageAdminSkill("return-intake-assistant")
    const returns = loadVoltageAdminSkill("return-policy-review")
    const approvals = loadVoltageAdminSkill("refund-review-preparation")
    const text = [catalog, intake, returns, approvals]
      .map((skill) => ("text" in skill ? skill.text : ""))
      .join("\n")

    expect(text).toMatch(
      /untrustedContentHint[\s\S]*get_product_editor_state[\s\S]*頁面按鈕/
    )
    expect(text).toMatch(/get_return_form_state[\s\S]*使用者/)
    expect(text).toMatch(
      /get_my_return_note_draft[\s\S]*apply_my_return_note_draft[\s\S]*不得承諾退款/
    )
    expect(text).toMatch(/get_refund_approval[\s\S]*不得修改退款金額/)
    expect(text).not.toMatch(
      /apply_return_review_draft|get_return_review_state|Agent 專屬|客服回覆|客服草稿/
    )
    expect(text).not.toMatch(/payment_token|card_number|shipping_address/i)
  })

  it("keeps instructions and skills free of personal or payment data capabilities", () => {
    const serialized = JSON.stringify({
      instructions: VOLTAGE_ADMIN_AGENT_INSTRUCTIONS,
      skills: smartDashboardSkillNames.map(loadVoltageAdminSkill),
    })

    expect(serialized).toMatch(/不得.*個資|不得.*姓名/)
    expect(serialized).not.toMatch(
      /customer_name|email_address|shipping_address|phone_number|account_id|card_number|payment_token/i
    )
  })
})
