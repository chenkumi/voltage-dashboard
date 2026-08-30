import { describe, expect, it } from "vitest"
import { VOLTAGE_ADMIN_TOOLS } from "./voltage-admin"
import { OperationsController } from "./operations/operations-controller"
import {
  executeOperationsTool,
  OPERATIONS_TOOLS,
} from "./operations/operations-tools"

describe("commerce privacy boundaries", () => {
  it("exposes nine operational readers and no inventory/order/customer mutations", () => {
    const names = VOLTAGE_ADMIN_TOOLS.map((tool) => tool.name)

    expect(names).toEqual(
      expect.arrayContaining([
        "get_voltage_admin_dashboard",
        "execute_readonly_sql",
        "get_inventory_overview",
        "search_inventory",
        "get_inventory_detail",
        "open_inventory_detail",
        "search_orders",
        "get_order_detail",
        "open_order_detail",
        "get_customer_analytics",
        "open_customer_analysis",
      ])
    )
    expect(names).not.toEqual(
      expect.arrayContaining([
        "list_voltage_admin_orders",
        "list_voltage_admin_customers",
        "list_voltage_admin_inventory",
        "set_voltage_admin_inventory",
        "create_voltage_admin_order",
        "confirm_voltage_admin_order",
        "cancel_voltage_admin_order",
        "update_customer",
        "suspend_customer",
      ])
    )
  })

  it("allows only fixed payment result status codes in operational schemas", () => {
    const orderSchema = VOLTAGE_ADMIN_TOOLS.find(
      ({ name }) => name === "search_orders"
    )?.inputSchema as {
      properties: Record<string, { enum?: readonly string[] }>
    }
    expect(orderSchema.properties.paymentStatus.enum).toEqual([
      "paid",
      "pending",
      "failed",
      "refunded",
    ])
    expect(JSON.stringify(orderSchema)).not.toMatch(
      /paymentMethod|card|token|authorization|account/i
    )
  })

  it("marks dashboard product content as untrusted", () => {
    const dashboardTool = VOLTAGE_ADMIN_TOOLS.find(
      ({ name }) => name === "get_voltage_admin_dashboard"
    )

    expect(dashboardTool?.annotations).toMatchObject({
      readOnlyHint: true,
      untrustedContentHint: true,
    })
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

  it("never exposes high-risk commerce final actions as operations tools", () => {
    const names = VOLTAGE_ADMIN_TOOLS.map(({ name }) => name)

    expect(names).toEqual(
      expect.arrayContaining(
        OPERATIONS_TOOLS.map(({ name }) => name).filter(
          (name) =>
            ![
              "list_catalog_candidates",
              "get_catalog_candidate",
              "save_product_draft",
              "open_product_review",
            ].includes(name)
        )
      )
    )
    expect(names).not.toEqual(
      expect.arrayContaining([
        "approve_review",
        "complete_review",
        "publish_product",
        "save_product_draft",
        "open_product_review",
        "resolve_case",
        "refund_order",
        "submit_payment",
      ])
    )
  })

  it("keeps operations schema property names free of personal data fields", () => {
    const propertyNames: string[] = []
    const visit = (value: unknown) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return
      const record = value as Record<string, unknown>
      if (record.properties && typeof record.properties === "object") {
        propertyNames.push(...Object.keys(record.properties))
      }
      Object.values(record).forEach(visit)
    }
    OPERATIONS_TOOLS.forEach(({ inputSchema }) => visit(inputSchema))

    expect(propertyNames.join(" ")).not.toMatch(
      /customerName|email|address|phone|account|card|paymentId|token/i
    )
  })

  it("returns only safe status facts from Agent-visible case readers", () => {
    const controller = new OperationsController()
    const result = executeOperationsTool(controller, "get_ops_case", {
      caseId: "CASE-2003",
    })
    const serialized = JSON.stringify(result)

    expect(serialized).toContain("address_unverified")
    expect(serialized).not.toMatch(
      /customerId|CUST-|@|phone|street|postal|cardNumber|paymentToken/i
    )
  })
})
