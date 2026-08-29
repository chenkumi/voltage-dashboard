import { describe, expect, it } from "vitest"
import { VOLTAGE_ADMIN_TOOLS } from "./voltage-admin"

describe("commerce privacy boundaries", () => {
  it("keeps admin order operations read-only while allowing inventory control", () => {
    const names = VOLTAGE_ADMIN_TOOLS.map((tool) => tool.name)

    expect(names).toEqual(
      expect.arrayContaining([
        "get_voltage_admin_dashboard",
        "execute_readonly_sql",
        "list_voltage_admin_orders",
        "set_voltage_admin_inventory",
      ])
    )
    expect(names).not.toEqual(
      expect.arrayContaining([
        "create_voltage_admin_order",
        "confirm_voltage_admin_order",
        "cancel_voltage_admin_order",
      ])
    )
  })

  it("keeps the reporting tool generic, read-only, and free of personal fields", () => {
    const reportingTool = VOLTAGE_ADMIN_TOOLS.find(
      (tool) => tool.name === "execute_readonly_sql"
    )

    expect(reportingTool).toBeDefined()
    expect(reportingTool?.annotations).toEqual({
      readOnlyHint: true,
      untrustedContentHint: true,
    })
    expect(JSON.stringify(reportingTool?.inputSchema)).not.toMatch(
      /customerName|email|address|phone|account|cardNumber|payment/i
    )
  })

  it("keeps report authoring local, reversible, and free of sensitive fields", () => {
    const reportToolNames = [
      "create_report",
      "get_report_state",
      "add_report_widget",
      "update_report_widget",
      "move_report_widget",
      "remove_report_widget",
    ]
    const reportTools = VOLTAGE_ADMIN_TOOLS.filter((tool) =>
      reportToolNames.includes(tool.name)
    )

    expect(reportTools.map((tool) => tool.name)).toEqual(reportToolNames)
    expect(
      reportTools.find((tool) => tool.name === "get_report_state")?.annotations
    ).toMatchObject({ readOnlyHint: true, openWorldHint: false })
    for (const tool of reportTools.filter(
      (tool) => tool.name !== "get_report_state"
    )) {
      expect(tool.annotations).toMatchObject({
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      })
    }
    expect(
      JSON.stringify(reportTools.map((tool) => tool.inputSchema))
    ).not.toMatch(
      /"(?:customerName|email|address|phone|account|cardNumber|payment|html|script)"/i
    )
  })
})
