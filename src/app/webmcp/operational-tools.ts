import type { CommerceDataSnapshot } from "./commerce-data/types"
import {
  CUSTOMER_REGIONS,
  CUSTOMER_SEGMENTS,
  CUSTOMER_STATUSES,
  FULFILLMENT_STATUSES,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
} from "./commerce-data/types"
import { buildCustomerRows } from "./customers/customer-list-model"
import {
  selectAverageDailySales,
  selectInventoryPeriodSummary,
  selectInventoryRisks,
} from "./inventory/inventory-selectors"
import type { InventoryPeriod, InventoryRisk } from "./inventory/types"
import type { ProductRepository } from "./products/product-repository"
import type { ProductCurrency } from "./products/types"
import type { WebMcpRegisteredTool } from "./types"

const schema = (
  properties: Record<string, unknown>,
  required: string[] = []
) => ({ type: "object", properties, required, additionalProperties: false })

const periodSchema = { type: "string", enum: ["week", "month", "year"] }
const customerPeriodSchema = {
  type: "string",
  enum: ["all", "30d", "90d", "365d"],
}
const limitSchema = { type: "integer", minimum: 1, maximum: 20 }
const readAnnotations = {
  readOnlyHint: true,
  openWorldHint: false,
  untrustedContentHint: true,
}
const navigationAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
}

export const OPERATIONAL_TOOL_NAMES = [
  "get_inventory_overview",
  "search_inventory",
  "get_inventory_detail",
  "open_inventory_detail",
  "search_orders",
  "get_order_detail",
  "open_order_detail",
  "get_customer_analytics",
  "open_customer_analysis",
] as const

export type OperationalToolName = (typeof OPERATIONAL_TOOL_NAMES)[number]

export const OPERATIONAL_TOOLS: WebMcpRegisteredTool[] = [
  {
    name: "get_inventory_overview",
    description:
      "Purpose: summarize stock health and period movement. Call for inventory KPIs or restock risk. Examples: ‘Inventory overview’, ‘Monthly stock risk’. Do not call to change stock.",
    inputSchema: schema({ period: periodSchema }),
    annotations: readAnnotations,
  },
  {
    name: "search_inventory",
    description:
      "Purpose: search and sort inventory using product text, category, and risk filters. Call for a bounded inventory list. Examples: ‘Low-stock beauty items’, ‘Sort stock ascending’. Do not call to adjust inventory.",
    inputSchema: schema({
      query: { type: "string", maxLength: 80 },
      category: { type: "string", maxLength: 60 },
      risk: {
        type: "string",
        enum: [
          "out_of_stock",
          "low_stock",
          "overstock",
          "unusual_change",
          "reorder_risk",
          "healthy",
        ],
      },
      period: periodSchema,
      sort: {
        type: "string",
        enum: [
          "stock_asc",
          "stock_desc",
          "change_asc",
          "days_asc",
          "updated_desc",
        ],
      },
      limit: limitSchema,
    }),
    annotations: readAnnotations,
  },
  {
    name: "get_inventory_detail",
    description:
      "Purpose: read one product’s stock, period comparison, risks, and recent movement reasons. Call after identifying a product ID. Do not call to mutate stock.",
    inputSchema: schema(
      {
        productId: { type: "integer", minimum: 1 },
        period: periodSchema,
        limit: limitSchema,
      },
      ["productId"]
    ),
    annotations: readAnnotations,
  },
  {
    name: "open_inventory_detail",
    description:
      "Purpose: navigate to an inventory detail page for human review. Call when the user wants to inspect one product. Do not open an adjustment dialog or change stock.",
    inputSchema: schema(
      {
        productId: { type: "integer", minimum: 1 },
        period: periodSchema,
      },
      ["productId"]
    ),
    annotations: navigationAnnotations,
  },
  {
    name: "search_orders",
    description:
      "Purpose: search anonymized orders by order number and safe operational filters. Call for order triage and status analysis. Do not search names or contact data and do not mutate orders.",
    inputSchema: schema({
      query: {
        type: "string",
        maxLength: 40,
        pattern: "^(?:VM-[0-9]*|[0-9]+)$",
      },
      dateFrom: { type: "string", format: "date" },
      dateTo: { type: "string", format: "date" },
      status: { type: "string", enum: [...ORDER_STATUSES] },
      paymentStatus: { type: "string", enum: [...PAYMENT_STATUSES] },
      fulfillmentStatus: {
        type: "string",
        enum: [...FULFILLMENT_STATUSES],
      },
      segment: { type: "string", enum: [...CUSTOMER_SEGMENTS] },
      region: { type: "string", enum: [...CUSTOMER_REGIONS] },
      currency: { type: "string", enum: ["USD", "TWD"] },
      minimumAmount: { type: "number", minimum: 0, maximum: 10000000 },
      maximumAmount: { type: "number", minimum: 0, maximum: 10000000 },
      sort: {
        type: "string",
        enum: ["updated_desc", "created_desc", "amount_asc", "amount_desc"],
      },
      limit: limitSchema,
    }),
    annotations: readAnnotations,
  },
  {
    name: "get_order_detail",
    description:
      "Purpose: read one anonymized order’s statuses, amount breakdown, lines, and timeline. Call with an exact order number. Do not request customer or payment identifiers.",
    inputSchema: schema(
      { orderNumber: { type: "string", pattern: "^VM-[0-9]+$" } },
      ["orderNumber"]
    ),
    annotations: readAnnotations,
  },
  {
    name: "open_order_detail",
    description:
      "Purpose: navigate to a read-only order detail page. Call when a human wants to inspect one order. Do not open a mutation flow.",
    inputSchema: schema(
      { orderNumber: { type: "string", pattern: "^VM-[0-9]+$" } },
      ["orderNumber"]
    ),
    annotations: navigationAnnotations,
  },
  {
    name: "get_customer_analytics",
    description:
      "Purpose: return anonymous customer group statistics with a minimum group size of five. Call for segment, region, status, or activity-period analysis. Do not request an individual customer or arbitrary tags.",
    inputSchema: schema({
      status: { type: "string", enum: [...CUSTOMER_STATUSES] },
      segment: { type: "string", enum: [...CUSTOMER_SEGMENTS] },
      region: { type: "string", enum: [...CUSTOMER_REGIONS] },
      period: customerPeriodSchema,
      groupBy: {
        type: "string",
        enum: ["status", "segment", "region"],
      },
    }),
    annotations: readAnnotations,
  },
  {
    name: "open_customer_analysis",
    description:
      "Purpose: navigate to the customer list with only safe analytics filters. Call when a user wants to inspect the aggregate cohort in the UI. Do not identify a customer or start a mutation.",
    inputSchema: schema({
      status: { type: "string", enum: [...CUSTOMER_STATUSES] },
      segment: { type: "string", enum: [...CUSTOMER_SEGMENTS] },
      region: { type: "string", enum: [...CUSTOMER_REGIONS] },
      period: customerPeriodSchema,
    }),
    annotations: navigationAnnotations,
  },
]

export const isOperationalTool = (name: string): name is OperationalToolName =>
  (OPERATIONAL_TOOL_NAMES as readonly string[]).includes(name)

const RISK_SETTINGS = {
  lowStockThreshold: 12,
  overstockThreshold: 90,
  unusualAbsoluteDelta: 25,
  reorderDaysThreshold: 21,
} as const
const MAX_SERIALIZED_LENGTH = 1500
const MINIMUM_CUSTOMER_GROUP_SIZE = 5

const argumentError = (message: string) => ({
  status: "ARGUMENT_ERROR" as const,
  message,
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

const exactKeys = (args: Record<string, unknown>, allowed: readonly string[]) =>
  Object.keys(args).every((key) => allowed.includes(key))

const isEnum = <T extends string>(
  value: unknown,
  values: readonly T[]
): value is T => typeof value === "string" && values.includes(value as T)

const isDate = (value: unknown) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value

const isLimit = (value: unknown) =>
  value === undefined ||
  (typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 20)

const dataPeriod = (timestamps: readonly string[]) => ({
  startAt: timestamps.length ? [...timestamps].sort()[0] : null,
  endAt: timestamps.length ? [...timestamps].sort().at(-1) : null,
  timeZone: "Asia/Taipei",
})

const hasSensitiveOperationalData = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(hasSensitiveOperationalData)
  if (value && typeof value === "object") {
    return Object.entries(value).some(
      ([key, entry]) =>
        /customerId|fullName|email|phone|address|paymentMethod|card|token|authorization|account/i.test(
          key
        ) || hasSensitiveOperationalData(entry)
    )
  }
  if (typeof value !== "string") return false
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return false
  return (
    /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/i.test(value) ||
    /\b(?:customer\s*id|account\s*(?:id|number)|card\s*(?:number|no)|cvv|iban|swift|wallet\s*id|payment\s*(?:id|token)|authorization\s*code)\b/i.test(
      value
    ) ||
    /(?:\+?\d[\s().-]*){7,}/.test(value)
  )
}

const boundedItems = <T>(
  base: Record<string, unknown>,
  items: readonly T[]
) => {
  if (
    hasSensitiveOperationalData(base) ||
    items.some(hasSensitiveOperationalData)
  ) {
    return {
      status: "DATA_SAFETY_ERROR" as const,
      message: "The safe operational projection could not be produced.",
    }
  }
  if (
    JSON.stringify({ ...base, items: [], truncated: items.length > 0 }).length >
    MAX_SERIALIZED_LENGTH
  ) {
    return {
      status: "OUTPUT_LIMIT_ERROR" as const,
      message: "The bounded operational response could not be produced.",
    }
  }
  const accepted: T[] = []
  for (const item of items) {
    const candidateItems = [...accepted, item]
    const candidate = {
      ...base,
      items: candidateItems,
      truncated:
        candidateItems.length < items.length ||
        (typeof base.total === "number" && candidateItems.length < base.total),
    }
    if (JSON.stringify(candidate).length > MAX_SERIALIZED_LENGTH) break
    accepted.push(item)
  }
  return {
    ...base,
    items: accepted,
    truncated:
      accepted.length < items.length ||
      (typeof base.total === "number" && accepted.length < base.total),
  }
}

const inventoryRows = async (
  repository: ProductRepository,
  commerce: CommerceDataSnapshot,
  period: InventoryPeriod,
  now: Date
) => {
  const [products, movements] = await Promise.all([
    repository.list({ includeArchived: false }),
    repository.listInventoryMovements(),
  ])
  return {
    products,
    movements,
    rows: products.map((product) => {
      const summary = selectInventoryPeriodSummary(
        product.id,
        movements,
        period,
        now
      )
      const sales = selectAverageDailySales(
        product.id,
        commerce.orders,
        commerce.orderLines,
        now
      )
      const risk = selectInventoryRisks(
        product.stock,
        summary.netChange,
        sales.unitsPerDay,
        RISK_SETTINGS
      )
      return { product, summary, ...risk }
    }),
  }
}

type ExecuteOperationalToolOptions = {
  name: OperationalToolName
  args: Record<string, unknown>
  productRepository: ProductRepository
  commerce: CommerceDataSnapshot
  navigate: (path: string) => void
  now?: Date
}

export const executeOperationalTool = async ({
  name,
  args,
  productRepository,
  commerce,
  navigate,
  now = new Date(),
}: ExecuteOperationalToolOptions): Promise<unknown> => {
  if (!isRecord(args)) return argumentError("Arguments must be an object.")

  if (name === "get_inventory_overview") {
    if (!exactKeys(args, ["period"])) return argumentError("Unknown argument.")
    const period = args.period ?? "month"
    if (!isEnum(period, ["week", "month", "year"])) {
      return argumentError("period must be week, month, or year.")
    }
    const snapshot = await inventoryRows(
      productRepository,
      commerce,
      period,
      now
    )
    const counts = Object.fromEntries(
      [
        "out_of_stock",
        "low_stock",
        "overstock",
        "unusual_change",
        "reorder_risk",
        "healthy",
      ].map((risk) => [
        risk,
        snapshot.rows.filter((row) => row.risks.includes(risk as InventoryRisk))
          .length,
      ])
    )
    return {
      status: "OK",
      total: snapshot.rows.length,
      truncated: false,
      dataPeriod: dataPeriod(snapshot.movements.map((item) => item.occurredAt)),
      period,
      stockUnits: snapshot.rows.reduce(
        (sum, row) => sum + row.product.stock,
        0
      ),
      risks: counts,
    }
  }

  if (name === "search_inventory") {
    const keys = ["query", "category", "risk", "period", "sort", "limit"]
    if (!exactKeys(args, keys)) return argumentError("Unknown argument.")
    if (
      args.query !== undefined &&
      (typeof args.query !== "string" || args.query.length > 80)
    )
      return argumentError("query is invalid.")
    if (
      args.category !== undefined &&
      (typeof args.category !== "string" || args.category.length > 60)
    )
      return argumentError("category is invalid.")
    if (
      hasSensitiveOperationalData(args.query) ||
      hasSensitiveOperationalData(args.category)
    )
      return argumentError(
        "query and category must not contain personal or payment data."
      )
    if (
      args.risk !== undefined &&
      !isEnum(args.risk, [
        "out_of_stock",
        "low_stock",
        "overstock",
        "unusual_change",
        "reorder_risk",
        "healthy",
      ])
    )
      return argumentError("risk is invalid.")
    const period = args.period ?? "month"
    if (!isEnum(period, ["week", "month", "year"]))
      return argumentError("period is invalid.")
    const sort = args.sort ?? "updated_desc"
    if (
      !isEnum(sort, [
        "stock_asc",
        "stock_desc",
        "change_asc",
        "days_asc",
        "updated_desc",
      ])
    )
      return argumentError("sort is invalid.")
    if (!isLimit(args.limit))
      return argumentError("limit must be an integer from 1 to 20.")
    const snapshot = await inventoryRows(
      productRepository,
      commerce,
      period,
      now
    )
    const query =
      typeof args.query === "string"
        ? args.query.trim().toLocaleLowerCase()
        : ""
    const category =
      typeof args.category === "string" ? args.category.trim() : ""
    let rows = snapshot.rows.filter(
      ({ product, risks }) =>
        (!query ||
          [product.title, product.sku, product.brand ?? "", product.category]
            .join(" ")
            .toLocaleLowerCase()
            .includes(query)) &&
        (!category || product.category === category) &&
        (!args.risk || risks.includes(args.risk as InventoryRisk))
    )
    rows = [...rows].sort((a, b) => {
      if (sort === "stock_asc") return a.product.stock - b.product.stock
      if (sort === "stock_desc") return b.product.stock - a.product.stock
      if (sort === "change_asc")
        return a.summary.netChange - b.summary.netChange
      if (sort === "days_asc")
        return (
          (a.estimatedDaysOfSupply ?? Infinity) -
          (b.estimatedDaysOfSupply ?? Infinity)
        )
      return b.product.updatedAt.localeCompare(a.product.updatedAt)
    })
    const total = rows.length
    const items = rows
      .slice(0, (args.limit as number | undefined) ?? 10)
      .map(({ product, summary, risks, estimatedDaysOfSupply }) => ({
        productId: product.id,
        sku: product.sku,
        title: product.title,
        category: product.category,
        stock: product.stock,
        netChange: summary.netChange,
        estimatedDaysOfSupply,
        risks,
        updatedAt: product.updatedAt,
      }))
    return boundedItems(
      {
        status: "OK",
        total,
        dataPeriod: dataPeriod(
          snapshot.movements.map((item) => item.occurredAt)
        ),
        period,
      },
      items
    )
  }

  if (name === "get_inventory_detail") {
    if (!exactKeys(args, ["productId", "period", "limit"]))
      return argumentError("Unknown argument.")
    if (
      typeof args.productId !== "number" ||
      !Number.isInteger(args.productId) ||
      args.productId < 1
    )
      return argumentError("productId must be a positive integer.")
    const period = args.period ?? "month"
    if (!isEnum(period, ["week", "month", "year"]) || !isLimit(args.limit))
      return argumentError("period or limit is invalid.")
    const snapshot = await inventoryRows(
      productRepository,
      commerce,
      period,
      now
    )
    const row = snapshot.rows.find(
      ({ product }) => product.id === args.productId
    )
    if (!row)
      return {
        status: "NOT_FOUND",
        message: "Inventory product was not found.",
      }
    const movements = snapshot.movements
      .filter((item) => item.productId === args.productId)
      .slice(0, (args.limit as number | undefined) ?? 8)
      .map(
        ({
          type,
          reasonCode,
          previousStock,
          nextStock,
          delta,
          occurredAt,
          source,
        }) => ({
          type,
          reasonCode,
          previousStock,
          nextStock,
          delta,
          occurredAt,
          source,
        })
      )
    return boundedItems(
      {
        status: "OK",
        total: snapshot.movements.filter(
          (item) => item.productId === args.productId
        ).length,
        dataPeriod: dataPeriod(
          snapshot.movements
            .filter((item) => item.productId === args.productId)
            .map((item) => item.occurredAt)
        ),
        period,
        product: {
          productId: row.product.id,
          sku: row.product.sku,
          title: row.product.title,
          category: row.product.category,
          stock: row.product.stock,
          risks: row.risks,
          estimatedDaysOfSupply: row.estimatedDaysOfSupply,
        },
        comparison: row.summary,
      },
      movements
    )
  }

  if (name === "open_inventory_detail") {
    if (
      !exactKeys(args, ["productId", "period"]) ||
      typeof args.productId !== "number" ||
      !Number.isInteger(args.productId) ||
      args.productId < 1
    )
      return argumentError("productId must be a positive integer.")
    if (
      args.period !== undefined &&
      !isEnum(args.period, ["week", "month", "year"])
    )
      return argumentError("period is invalid.")
    const product = await productRepository.get(args.productId)
    if (!product || product.status === "archived")
      return {
        status: "NOT_FOUND",
        message: "Inventory product was not found.",
      }
    const query = args.period ? `?period=${args.period}` : ""
    navigate(`/inventory/${args.productId}${query}`)
    return { status: "OK", path: `/inventory/${args.productId}${query}` }
  }

  if (name === "search_orders") {
    const keys = [
      "query",
      "dateFrom",
      "dateTo",
      "status",
      "paymentStatus",
      "fulfillmentStatus",
      "segment",
      "region",
      "currency",
      "minimumAmount",
      "maximumAmount",
      "sort",
      "limit",
    ]
    if (!exactKeys(args, keys)) return argumentError("Unknown argument.")
    if (
      args.query !== undefined &&
      (typeof args.query !== "string" ||
        args.query.length > 40 ||
        !/^(?:VM-\d*|\d+)$/.test(args.query))
    )
      return argumentError("query may contain only an order number.")
    if (args.dateFrom !== undefined && !isDate(args.dateFrom))
      return argumentError("dateFrom is invalid.")
    if (args.dateTo !== undefined && !isDate(args.dateTo))
      return argumentError("dateTo is invalid.")
    if (
      typeof args.dateFrom === "string" &&
      typeof args.dateTo === "string" &&
      args.dateFrom > args.dateTo
    )
      return argumentError("dateFrom must not be after dateTo.")
    const enums: [unknown, readonly string[], string][] = [
      [args.status, ORDER_STATUSES, "status"],
      [args.paymentStatus, PAYMENT_STATUSES, "paymentStatus"],
      [args.fulfillmentStatus, FULFILLMENT_STATUSES, "fulfillmentStatus"],
      [args.segment, CUSTOMER_SEGMENTS, "segment"],
      [args.region, CUSTOMER_REGIONS, "region"],
      [args.currency, ["USD", "TWD"], "currency"],
    ]
    for (const [value, values, key] of enums)
      if (value !== undefined && !isEnum(value, values))
        return argumentError(`${key} is invalid.`)
    for (const key of ["minimumAmount", "maximumAmount"] as const)
      if (
        args[key] !== undefined &&
        (typeof args[key] !== "number" ||
          !Number.isFinite(args[key]) ||
          args[key] < 0 ||
          args[key] > 10000000)
      )
        return argumentError(`${key} is invalid.`)
    if (
      typeof args.minimumAmount === "number" &&
      typeof args.maximumAmount === "number" &&
      args.minimumAmount > args.maximumAmount
    )
      return argumentError("minimumAmount must not exceed maximumAmount.")
    const sort = args.sort ?? "updated_desc"
    if (
      !isEnum(sort, [
        "updated_desc",
        "created_desc",
        "amount_asc",
        "amount_desc",
      ]) ||
      !isLimit(args.limit)
    )
      return argumentError("sort or limit is invalid.")
    const query =
      typeof args.query === "string" ? args.query.toLocaleLowerCase() : ""
    const minimumAmount =
      typeof args.minimumAmount === "number" ? args.minimumAmount : undefined
    const maximumAmount =
      typeof args.maximumAmount === "number" ? args.maximumAmount : undefined
    let orders = commerce.orders.filter(
      (order) =>
        (!query || order.id.toLocaleLowerCase().includes(query)) &&
        (!args.dateFrom || order.createdAt >= `${args.dateFrom}T00:00:00`) &&
        (!args.dateTo || order.createdAt <= `${args.dateTo}T23:59:59.999`) &&
        (!args.status || order.status === args.status) &&
        (!args.paymentStatus || order.paymentStatus === args.paymentStatus) &&
        (!args.fulfillmentStatus ||
          order.fulfillmentStatus === args.fulfillmentStatus) &&
        (!args.segment || order.customerSnapshot.segment === args.segment) &&
        (!args.region || order.customerSnapshot.region === args.region) &&
        (!args.currency || order.amounts.total.currency === args.currency) &&
        (minimumAmount === undefined ||
          order.amounts.total.amount >= minimumAmount) &&
        (maximumAmount === undefined ||
          order.amounts.total.amount <= maximumAmount)
    )
    orders = [...orders].sort((a, b) =>
      sort === "created_desc"
        ? b.createdAt.localeCompare(a.createdAt)
        : sort === "amount_asc"
          ? a.amounts.total.amount - b.amounts.total.amount
          : sort === "amount_desc"
            ? b.amounts.total.amount - a.amounts.total.amount
            : b.updatedAt.localeCompare(a.updatedAt)
    )
    const total = orders.length
    const items = orders
      .slice(0, (args.limit as number | undefined) ?? 10)
      .map((order) => ({
        orderNumber: order.id,
        status: order.status,
        paymentStatus: order.paymentStatus,
        fulfillmentStatus: order.fulfillmentStatus,
        segment: order.customerSnapshot.segment,
        region: order.customerSnapshot.region,
        total: order.amounts.total,
        lineCount: commerce.orderLines.filter(
          (line) => line.orderId === order.id
        ).length,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      }))
    return boundedItems(
      {
        status: "OK",
        total,
        dataPeriod: dataPeriod(commerce.orders.map((order) => order.createdAt)),
      },
      items
    )
  }

  if (name === "get_order_detail" || name === "open_order_detail") {
    if (
      !exactKeys(args, ["orderNumber"]) ||
      typeof args.orderNumber !== "string" ||
      !/^VM-\d+$/.test(args.orderNumber)
    )
      return argumentError("orderNumber must use the VM-123 format.")
    const order = commerce.orders.find((item) => item.id === args.orderNumber)
    if (!order) return { status: "NOT_FOUND", message: "Order was not found." }
    if (name === "open_order_detail") {
      navigate(`/orders/${encodeURIComponent(order.id)}`)
      return { status: "OK", path: `/orders/${order.id}` }
    }
    const lines = commerce.orderLines
      .filter((line) => line.orderId === order.id)
      .map(({ sku, title, unitPrice, quantity, discount, subtotal }) => ({
        sku,
        title,
        unitPrice,
        quantity,
        discount,
        subtotal,
      }))
    return boundedItems(
      {
        status: "OK",
        total: lines.length,
        dataPeriod: dataPeriod(order.timeline.map((item) => item.occurredAt)),
        order: {
          orderNumber: order.id,
          status: order.status,
          paymentStatus: order.paymentStatus,
          fulfillmentStatus: order.fulfillmentStatus,
          segment: order.customerSnapshot.segment,
          region: order.customerSnapshot.region,
          amounts: order.amounts,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
          timeline: order.timeline.map(({ status, occurredAt }) => ({
            status,
            occurredAt,
          })),
        },
      },
      lines
    )
  }

  if (name === "get_customer_analytics" || name === "open_customer_analysis") {
    const allowed =
      name === "get_customer_analytics"
        ? ["status", "segment", "region", "period", "groupBy"]
        : ["status", "segment", "region", "period"]
    if (!exactKeys(args, allowed))
      return argumentError("Unknown or identifying customer argument.")
    const customerEnums: [unknown, readonly string[], string][] = [
      [args.status, CUSTOMER_STATUSES, "status"],
      [args.segment, CUSTOMER_SEGMENTS, "segment"],
      [args.region, CUSTOMER_REGIONS, "region"],
      [args.period, ["all", "30d", "90d", "365d"], "period"],
    ]
    for (const [value, values, key] of customerEnums)
      if (value !== undefined && !isEnum(value, values))
        return argumentError(`${key} is invalid.`)
    if (name === "open_customer_analysis") {
      const params = new URLSearchParams()
      for (const key of ["status", "segment", "region", "period"] as const)
        if (typeof args[key] === "string" && args[key] !== "all")
          params.set(key, args[key])
      const path = `/customers${params.size ? `?${params}` : ""}`
      navigate(path)
      return { status: "OK", path }
    }
    const groupBy = args.groupBy ?? "segment"
    if (!isEnum(groupBy, ["status", "segment", "region"]))
      return argumentError("groupBy is invalid.")
    const days =
      args.period === "30d"
        ? 30
        : args.period === "90d"
          ? 90
          : args.period === "365d"
            ? 365
            : null
    const cutoff = days
      ? new Date(now.getTime() - days * 86400000).toISOString()
      : null
    const rows = buildCustomerRows(
      commerce.customers,
      commerce.orders,
      commerce.activities
    ).filter(
      ({ customer, lastActivityAt }) =>
        (!args.status || customer.status === args.status) &&
        (!args.segment || customer.segment === args.segment) &&
        (!args.region || customer.region === args.region) &&
        (!cutoff || lastActivityAt >= cutoff)
    )
    const grouped = new Map<string, typeof rows>()
    for (const row of rows)
      grouped.set(row.customer[groupBy], [
        ...(grouped.get(row.customer[groupBy]) ?? []),
        row,
      ])
    const allGroups = [...grouped.entries()]
    const groups = allGroups
      .filter(([, members]) => members.length >= MINIMUM_CUSTOMER_GROUP_SIZE)
      .map(([key, members]) => ({
        key,
        customerCount: members.length,
        activeCount: members.filter(
          ({ customer }) => customer.status === "active"
        ).length,
        orderCount: members.reduce((sum, row) => sum + row.orderCount, 0),
        revenue: (["USD", "TWD"] as ProductCurrency[]).map((currency) => ({
          currency,
          amount: members.reduce(
            (sum, row) => sum + row.lifetimeSpend[currency],
            0
          ),
        })),
      }))
    return boundedItems(
      {
        status: "OK",
        total: groups.length,
        dataPeriod: dataPeriod(
          commerce.activities.map((item) => item.occurredAt)
        ),
        groupBy,
        minimumGroupSize: MINIMUM_CUSTOMER_GROUP_SIZE,
        suppressedGroupCount: allGroups.length - groups.length,
      },
      groups
    )
  }

  return { status: "NOT_FOUND", message: "Unknown operational tool." }
}
