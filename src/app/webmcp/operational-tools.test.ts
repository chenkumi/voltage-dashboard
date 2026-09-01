import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createCommerceSeed } from "./commerce-data/commerce-seed"
import {
  executeOperationalTool,
  OPERATIONAL_TOOLS,
  OPERATIONAL_TOOL_NAMES,
} from "./operational-tools"
import { ProductRepository } from "./products/product-repository"
import { createDummyJsonProductSeed } from "./products/product-seed"

describe("operational WebMCP tools", () => {
  let repository: ProductRepository
  const commerce = createCommerceSeed()
  const paths: string[] = []

  beforeEach(async () => {
    paths.length = 0
    repository = new ProductRepository({
      databaseName: `operational-tools-${crypto.randomUUID()}`,
      seed: createDummyJsonProductSeed(),
    })
    await repository.initialize()
  })

  afterEach(async () => {
    await repository.deleteDatabaseForTests()
  })

  const execute = (
    name: (typeof OPERATIONAL_TOOL_NAMES)[number],
    args: Record<string, unknown>
  ) =>
    executeOperationalTool({
      name,
      args,
      productRepository: repository,
      commerce,
      navigate: (path) => paths.push(path),
      now: new Date("2026-08-30T00:00:00.000Z"),
    })

  it("registers exactly the nine approved operational names with exact schemas", () => {
    expect(OPERATIONAL_TOOLS.map(({ name }) => name)).toEqual(
      OPERATIONAL_TOOL_NAMES
    )
    for (const tool of OPERATIONAL_TOOLS) {
      expect(tool.inputSchema).toMatchObject({
        type: "object",
        additionalProperties: false,
      })
    }
  })

  it("returns bounded inventory overview, search, and detail projections", async () => {
    const overview = await execute("get_inventory_overview", {
      period: "month",
    })
    const search = await execute("search_inventory", {
      risk: "low_stock",
      sort: "stock_asc",
      limit: 20,
    })
    const detail = await execute("get_inventory_detail", {
      productId: 1,
      period: "year",
      limit: 20,
    })

    expect(overview).toMatchObject({
      status: "OK",
      period: "month",
      truncated: false,
    })
    expect(search).toMatchObject({ status: "OK", period: "month" })
    expect(detail).toMatchObject({ status: "OK", period: "year" })
    expect(JSON.stringify(search).length).toBeLessThanOrEqual(1500)
    expect(JSON.stringify(detail).length).toBeLessThanOrEqual(1500)
  })

  it("fails closed when a repository text value contains personal data", async () => {
    await repository.deleteDatabaseForTests()
    const seed = createDummyJsonProductSeed()
    repository = new ProductRepository({
      databaseName: `operational-tools-${crypto.randomUUID()}`,
      seed: [{ ...seed[0]!, title: "Contact owner@example.test" }],
    })
    await repository.initialize()

    await expect(execute("search_inventory", {})).resolves.toMatchObject({
      status: "DATA_SAFETY_ERROR",
    })
  })

  it("rejects unknown keys, invalid periods, ranges, dates, sort, and limits", async () => {
    await expect(
      execute("search_inventory", { surprise: true })
    ).resolves.toMatchObject({ status: "ARGUMENT_ERROR" })
    await expect(
      execute("get_inventory_overview", { period: "quarter" })
    ).resolves.toMatchObject({ status: "ARGUMENT_ERROR" })
    await expect(
      execute("search_orders", {
        dateFrom: "2026-08-30",
        dateTo: "2026-01-01",
      })
    ).resolves.toMatchObject({ status: "ARGUMENT_ERROR" })
    await expect(
      execute("search_orders", { dateFrom: "2026-02-31" })
    ).resolves.toMatchObject({ status: "ARGUMENT_ERROR" })
    await expect(
      execute("search_orders", { sort: "random", limit: 200 })
    ).resolves.toMatchObject({ status: "ARGUMENT_ERROR" })
  })

  it.each([
    { query: "owner@example.test" },
    { query: "+886 912-345-678" },
    { category: "card number 4111111111111111" },
    { query: "payment token tok_live_123" },
    { category: "authorization code AUTH-123" },
    { query: "account number 987654321" },
  ])("rejects sensitive inventory search input: %o", async (args) => {
    await expect(execute("search_inventory", args)).resolves.toMatchObject({
      status: "ARGUMENT_ERROR",
    })
  })

  it("searches only order numbers and returns no customer or payment identifiers", async () => {
    const result = await execute("search_orders", {
      query: "VM-",
      paymentStatus: "failed",
      limit: 20,
    })
    const serialized = JSON.stringify(result)

    expect(result).toMatchObject({ status: "OK" })
    expect(serialized).toContain('"paymentStatus":"failed"')
    expect(serialized).not.toMatch(
      /customerId|fullName|email|phone|address|paymentMethod|card|token|authorization|account/i
    )
    expect(serialized.length).toBeLessThanOrEqual(1500)
    await expect(
      execute("search_orders", { query: "person@example.test" })
    ).resolves.toMatchObject({ status: "ARGUMENT_ERROR" })
    await expect(
      execute("search_orders", { query: "Alice" })
    ).resolves.toMatchObject({ status: "ARGUMENT_ERROR" })
  })

  it("returns safe order detail and accepts only fixed payment status filters", async () => {
    const target = commerce.orders[0]
    const result = await execute("get_order_detail", {
      orderNumber: target.id,
    })
    const serialized = JSON.stringify(result)

    expect(result).toMatchObject({
      status: "OK",
      order: { orderNumber: target.id, paymentStatus: target.paymentStatus },
    })
    expect(serialized).not.toMatch(
      /customerId|fullName|email|phone|address|paymentMethod|card|token|authorization|account/i
    )
    expect(serialized.length).toBeLessThanOrEqual(1500)
    await expect(
      execute("search_orders", { paymentStatus: "visa" })
    ).resolves.toMatchObject({ status: "ARGUMENT_ERROR" })
  })

  it("fails closed when order detail base data alone exceeds the output cap", async () => {
    const target = commerce.orders[0]!
    const oversizedCommerce = {
      ...commerce,
      orders: commerce.orders.map((order) =>
        order.id === target.id
          ? {
              ...order,
              timeline: Array.from({ length: 20 }, (_, index) => ({
                id: `TIMELINE-${index}`,
                status: "x".repeat(120),
                occurredAt: `2026-08-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
              })),
            }
          : order
      ),
    }
    const result = await executeOperationalTool({
      name: "get_order_detail",
      args: { orderNumber: target.id },
      productRepository: repository,
      commerce: oversizedCommerce,
      navigate: (path) => paths.push(path),
    })

    expect(result).toMatchObject({ status: "OUTPUT_LIMIT_ERROR" })
    expect(JSON.stringify(result).length).toBeLessThanOrEqual(1500)
  })

  it("counts the final truncated field at item-boundary output lengths", async () => {
    const target = commerce.orders[0]!
    const sourceLine = commerce.orderLines.find(
      (line) => line.orderId === target.id
    )!

    for (const length of [400, 600, 800, 1000, 1200]) {
      const result = await executeOperationalTool({
        name: "get_order_detail",
        args: { orderNumber: target.id },
        productRepository: repository,
        commerce: {
          ...commerce,
          orderLines: [
            { ...sourceLine, title: "x".repeat(length) },
            ...commerce.orderLines.filter((line) => line.orderId !== target.id),
          ],
        },
        navigate: (path) => paths.push(path),
      })

      expect(JSON.stringify(result).length).toBeLessThanOrEqual(1500)
    }
  })

  it("suppresses customer groups smaller than five and rejects identifying keys", async () => {
    const result = (await execute("get_customer_analytics", {
      groupBy: "region",
      period: "365d",
    })) as { items: { customerCount: number }[] }

    expect(result.items.every(({ customerCount }) => customerCount >= 5)).toBe(
      true
    )
    expect(JSON.stringify(result)).not.toMatch(
      /customerId|fullName|email|phone|address|note|tag/i
    )
    await expect(
      execute("get_customer_analytics", { customerId: "CUST-1001" })
    ).resolves.toMatchObject({ status: "ARGUMENT_ERROR" })
  })

  it("distinguishes visible, partial, fully suppressed, and empty customer analytics", async () => {
    const analytics = (
      customers: typeof commerce.customers,
      args: Record<string, unknown>
    ) =>
      executeOperationalTool({
        name: "get_customer_analytics",
        args,
        productRepository: repository,
        commerce: { ...commerce, customers },
        navigate: (path) => paths.push(path),
        now: new Date("2026-08-30T00:00:00.000Z"),
      })

    const allReturning = commerce.customers.map((customer) => ({
      ...customer,
      segment: "returning" as const,
    }))
    await expect(
      analytics(allReturning, { groupBy: "segment" })
    ).resolves.toMatchObject({
      outcome: "DATA_AVAILABLE",
      reasonCode: "NONE",
      total: 1,
      visibleGroupCount: 1,
      suppressedGroupCount: 0,
    })

    const oneSmallRegion = commerce.customers.map((customer, index) => ({
      ...customer,
      region: index === 0 ? ("south" as const) : ("north" as const),
    }))
    await expect(
      analytics(oneSmallRegion, { groupBy: "region" })
    ).resolves.toMatchObject({
      outcome: "PARTIAL_PRIVACY_SUPPRESSION",
      reasonCode: "MINIMUM_GROUP_SIZE",
      total: 1,
      visibleGroupCount: 1,
      suppressedGroupCount: 1,
    })

    const fourVipRegions = commerce.customers.map((customer, index) => ({
      ...customer,
      segment: index < 4 ? ("vip" as const) : ("returning" as const),
      region:
        (["north", "central", "south", "east"] as const)[index] ??
        customer.region,
    }))
    const allSuppressed = await analytics(fourVipRegions, {
      segment: "vip",
      groupBy: "region",
    })
    expect(allSuppressed).toMatchObject({
      outcome: "ALL_GROUPS_SUPPRESSED",
      reasonCode: "MINIMUM_GROUP_SIZE",
      total: 0,
      visibleGroupCount: 0,
      suppressedGroupCount: 4,
      items: [],
    })
    expect(JSON.stringify(allSuppressed)).not.toContain("customerCount")

    await expect(
      analytics(allReturning, { segment: "new", groupBy: "region" })
    ).resolves.toMatchObject({
      outcome: "NO_MATCHING_DATA",
      reasonCode: "NO_ROWS_MATCHED",
      total: 0,
      visibleGroupCount: 0,
      suppressedGroupCount: 0,
      items: [],
    })
  })

  it("navigates only to safe detail routes and customer filters", async () => {
    const order = commerce.orders[0]
    await execute("open_inventory_detail", { productId: 1, period: "month" })
    await execute("open_order_detail", { orderNumber: order.id })
    await execute("open_customer_analysis", {
      segment: "vip",
      region: "south",
      period: "90d",
    })

    expect(paths).toEqual([
      "/inventory/1?period=month",
      `/orders/${order.id}`,
      "/customers?segment=vip&region=south&period=90d",
    ])
    expect(paths.join(" ")).not.toMatch(/dialog|edit|suspend|adjust/i)
  })

  it("marks data readers as untrusted and navigation as non-destructive", () => {
    for (const tool of OPERATIONAL_TOOLS) {
      expect(tool.annotations).toMatchObject({ openWorldHint: false })
      if (tool.name.startsWith("open_")) {
        expect(tool.annotations).toMatchObject({
          readOnlyHint: false,
          destructiveHint: false,
        })
      } else {
        expect(tool.annotations).toMatchObject({ untrustedContentHint: true })
        expect(tool.annotations).toMatchObject({ readOnlyHint: true })
      }
    }
  })
})
