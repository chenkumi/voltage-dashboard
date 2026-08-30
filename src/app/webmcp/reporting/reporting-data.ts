import { createCommerceSeed } from "../commerce-data/commerce-seed"
import type { CommerceDataSnapshot } from "../commerce-data/types"
import { createInventoryMovementSeed } from "../inventory/inventory-seed"
import type { InventoryMovement } from "../inventory/types"
import { createDummyJsonProductSeed } from "../products/product-seed"
import type { Product, ProductCurrency } from "../products/types"

export const REPORTING_DATASETS = [
  "agent_products",
  "agent_sales_daily",
  "agent_inventory",
  "agent_inventory_daily",
  "agent_order_daily",
  "agent_order_product_daily",
  "agent_customer_monthly",
  "agent_dataset_status",
] as const

export const REPORTING_SCHEMA_SQL = `
CREATE TABLE agent_products (product_id INTEGER PRIMARY KEY,title TEXT NOT NULL,category TEXT NOT NULL,price_usd REAL CHECK(price_usd IS NULL OR price_usd>=0),price_amount REAL NOT NULL CHECK(price_amount>=0),currency_code TEXT NOT NULL CHECK(currency_code IN('USD','TWD')),product_status TEXT NOT NULL CHECK(product_status IN('draft','published','archived')));
CREATE TABLE agent_sales_daily (sale_date TEXT NOT NULL,product_id INTEGER NOT NULL REFERENCES agent_products(product_id),quantity INTEGER NOT NULL CHECK(quantity>=0),net_revenue_amount REAL NOT NULL CHECK(net_revenue_amount>=0),currency_code TEXT NOT NULL CHECK(currency_code IN('USD','TWD')),net_revenue_usd REAL CHECK(net_revenue_usd IS NULL OR net_revenue_usd>=0),PRIMARY KEY(sale_date,product_id,currency_code));
CREATE TABLE agent_inventory (product_id INTEGER PRIMARY KEY REFERENCES agent_products(product_id),stock INTEGER NOT NULL CHECK(stock>=0),updated_at TEXT NOT NULL);
CREATE TABLE agent_inventory_daily (inventory_date TEXT NOT NULL,product_id INTEGER NOT NULL REFERENCES agent_products(product_id),opening_stock INTEGER NOT NULL CHECK(opening_stock>=0),closing_stock INTEGER NOT NULL CHECK(closing_stock>=0),received_quantity INTEGER NOT NULL CHECK(received_quantity>=0),issued_quantity INTEGER NOT NULL CHECK(issued_quantity>=0),reconciliation_delta INTEGER NOT NULL,net_change INTEGER NOT NULL,PRIMARY KEY(inventory_date,product_id));
CREATE TABLE agent_order_daily (order_date TEXT NOT NULL,region_code TEXT NOT NULL,segment_code TEXT NOT NULL,order_status_code TEXT NOT NULL,payment_status_code TEXT NOT NULL CHECK(payment_status_code IN('paid','pending','failed','refunded')),fulfillment_status_code TEXT NOT NULL,currency_code TEXT NOT NULL CHECK(currency_code IN('USD','TWD')),order_count INTEGER NOT NULL CHECK(order_count>=0),net_revenue_amount REAL NOT NULL CHECK(net_revenue_amount>=0),net_revenue_usd REAL CHECK(net_revenue_usd IS NULL OR net_revenue_usd>=0),PRIMARY KEY(order_date,region_code,segment_code,order_status_code,payment_status_code,fulfillment_status_code,currency_code));
CREATE TABLE agent_order_product_daily (order_date TEXT NOT NULL,product_id INTEGER NOT NULL REFERENCES agent_products(product_id),region_code TEXT NOT NULL,segment_code TEXT NOT NULL,order_status_code TEXT NOT NULL,payment_status_code TEXT NOT NULL CHECK(payment_status_code IN('paid','pending','failed','refunded')),fulfillment_status_code TEXT NOT NULL,currency_code TEXT NOT NULL CHECK(currency_code IN('USD','TWD')),order_count INTEGER NOT NULL CHECK(order_count>=0),quantity INTEGER NOT NULL CHECK(quantity>=0),net_revenue_amount REAL NOT NULL CHECK(net_revenue_amount>=0),net_revenue_usd REAL CHECK(net_revenue_usd IS NULL OR net_revenue_usd>=0),PRIMARY KEY(order_date,product_id,region_code,segment_code,order_status_code,payment_status_code,fulfillment_status_code,currency_code));
CREATE TABLE agent_customer_monthly (month_start TEXT NOT NULL,region_code TEXT NOT NULL,segment_code TEXT NOT NULL,customer_status_code TEXT NOT NULL,currency_code TEXT NOT NULL CHECK(currency_code IN('USD','TWD')),customer_count INTEGER NOT NULL CHECK(customer_count>=5),order_count INTEGER NOT NULL CHECK(order_count>=0),net_revenue_amount REAL NOT NULL CHECK(net_revenue_amount>=0),net_revenue_usd REAL CHECK(net_revenue_usd IS NULL OR net_revenue_usd>=0),PRIMARY KEY(month_start,region_code,segment_code,customer_status_code,currency_code));
CREATE TABLE agent_dataset_status (dataset_name TEXT PRIMARY KEY,updated_at TEXT NOT NULL,time_zone TEXT NOT NULL,period_start TEXT,period_end TEXT,completeness TEXT NOT NULL);
`

type Row = readonly (string | number | null)[]
export type OperationalReportingSource = {
  products: readonly Product[]
  inventoryMovements: readonly InventoryMovement[]
  commerce: CommerceDataSnapshot
}
export type ReportingDataSnapshot = {
  products: readonly Row[]
  sales: readonly Row[]
  inventory: readonly Row[]
  inventoryDaily: readonly Row[]
  orderDaily: readonly Row[]
  orderProductDaily: readonly Row[]
  customerMonthly: readonly Row[]
  datasetStatus: readonly Row[]
}
export type SafeOperationalProjection = Omit<
  ReportingDataSnapshot,
  "datasetStatus"
> & {
  updatedAtByDataset: Readonly<
    Record<(typeof REPORTING_DATASETS)[number], string>
  >
}
const money = (amount: number, currency: ProductCurrency) =>
  [
    Number(amount.toFixed(2)),
    currency === "USD" ? Number(amount.toFixed(2)) : null,
  ] as const
const toReportingDate = (timestamp: string) =>
  new Date(new Date(timestamp).getTime() + 8 * 60 * 60 * 1_000)
    .toISOString()
    .slice(0, 10)
const groups = <T>(items: readonly T[], key: (item: T) => string) => {
  const map = new Map<string, T[]>()
  for (const item of items)
    map.set(key(item), [...(map.get(key(item)) ?? []), item])
  return [...map.values()]
}
const period = (rows: readonly Row[]) => {
  const dates = rows.map((row) => String(row[0])).sort()
  return [dates[0] ?? null, dates.at(-1) ?? null] as const
}
const latestTimestamp = (timestamps: readonly string[]) =>
  timestamps.reduce(
    (latest, candidate) =>
      Date.parse(candidate) > Date.parse(latest) ? candidate : latest,
    timestamps[0] ?? "1970-01-01T00:00:00.000Z"
  )

export const createSafeOperationalProjection = (
  input: OperationalReportingSource | readonly Product[]
): SafeOperationalProjection => {
  const source: OperationalReportingSource = Array.isArray(input)
    ? (() => {
        const commerce = createCommerceSeed()
        const productIds = new Set(input.map((product) => product.id))
        const orderLines = commerce.orderLines.filter((line) =>
          productIds.has(line.productId)
        )
        const orderIds = new Set(orderLines.map((line) => line.orderId))
        return {
          products: input,
          inventoryMovements: createInventoryMovementSeed(input),
          commerce: {
            ...commerce,
            orders: commerce.orders.filter((order) => orderIds.has(order.id)),
            orderLines,
          },
        }
      })()
    : (input as OperationalReportingSource)
  const products = source.products.map(
    (p) =>
      [
        p.id,
        p.title,
        p.category,
        p.price.currency === "USD" ? p.price.amount : null,
        p.price.amount,
        p.price.currency,
        p.status,
      ] as const
  )
  const inventory = source.products.map(
    (p) => [p.id, p.stock, p.updatedAt] as const
  )
  const byOrder = new Map(
    source.commerce.orders.map((order) => [order.id, order])
  )
  const facts = source.commerce.orderLines.flatMap((line) => {
    const order = byOrder.get(line.orderId)
    return order ? [{ order, line }] : []
  })
  const sales = groups(
    facts,
    ({ order, line }) =>
      `${toReportingDate(order.createdAt)}|${line.productId}|${line.subtotal.currency}`
  ).map((set) => {
    const { order, line } = set[0]!
    const amount = set.reduce((sum, x) => sum + x.line.subtotal.amount, 0)
    return [
      toReportingDate(order.createdAt),
      line.productId,
      set.reduce((sum, x) => sum + x.line.quantity, 0),
      ...money(amount, line.subtotal.currency).slice(0, 1),
      line.subtotal.currency,
      ...money(amount, line.subtotal.currency).slice(1),
    ] as const
  })
  const orderProductDaily = groups(facts, ({ order, line }) =>
    [
      toReportingDate(order.createdAt),
      line.productId,
      order.customerSnapshot.region,
      order.customerSnapshot.segment,
      order.status,
      order.paymentStatus,
      order.fulfillmentStatus,
      line.subtotal.currency,
    ].join("|")
  ).map((set) => {
    const { order, line } = set[0]!
    const amount = set.reduce((sum, x) => sum + x.line.subtotal.amount, 0)
    return [
      toReportingDate(order.createdAt),
      line.productId,
      order.customerSnapshot.region,
      order.customerSnapshot.segment,
      order.status,
      order.paymentStatus,
      order.fulfillmentStatus,
      line.subtotal.currency,
      new Set(set.map((x) => x.order.id)).size,
      set.reduce((sum, x) => sum + x.line.quantity, 0),
      ...money(amount, line.subtotal.currency),
    ] as const
  })
  const orderDaily = groups(source.commerce.orders, (o) =>
    [
      toReportingDate(o.createdAt),
      o.customerSnapshot.region,
      o.customerSnapshot.segment,
      o.status,
      o.paymentStatus,
      o.fulfillmentStatus,
      o.amounts.total.currency,
    ].join("|")
  ).map((set) => {
    const o = set[0]!
    const amount = set.reduce((sum, x) => sum + x.amounts.total.amount, 0)
    return [
      toReportingDate(o.createdAt),
      o.customerSnapshot.region,
      o.customerSnapshot.segment,
      o.status,
      o.paymentStatus,
      o.fulfillmentStatus,
      o.amounts.total.currency,
      set.length,
      ...money(amount, o.amounts.total.currency),
    ] as const
  })
  const inventoryDaily = groups(
    source.inventoryMovements,
    (x) => `${toReportingDate(x.occurredAt)}|${x.productId}`
  ).map((set) => {
    const sorted = [...set].sort((a, b) =>
      a.occurredAt.localeCompare(b.occurredAt)
    )
    const first = sorted[0]!
    const last = sorted.at(-1)!
    return [
      toReportingDate(first.occurredAt),
      first.productId,
      first.previousStock,
      last.nextStock,
      sorted
        .filter((x) => x.type === "receipt")
        .reduce((n, x) => n + x.delta, 0),
      sorted
        .filter((x) => x.type === "issue")
        .reduce((n, x) => n + Math.abs(x.delta), 0),
      sorted
        .filter((x) => x.type === "reconciliation")
        .reduce((n, x) => n + x.delta, 0),
      last.nextStock - first.previousStock,
    ] as const
  })
  const months = [
    ...new Set(
      source.commerce.orders.map(
        (order) => `${toReportingDate(order.createdAt).slice(0, 7)}-01`
      )
    ),
  ].sort()
  const customerStatusById = new Map(
    source.commerce.customers.map((customer) => [customer.id, customer.status])
  )
  const customerMonthly = months.flatMap((month) =>
    (["USD", "TWD"] as const).flatMap((currency) => {
      const orders = source.commerce.orders.filter(
        (o) =>
          toReportingDate(o.createdAt).slice(0, 7) === month.slice(0, 7) &&
          o.amounts.total.currency === currency
      )
      if (orders.length === 0) return []
      const grouped = groups(orders, (order) =>
        [
          order.customerSnapshot.region,
          order.customerSnapshot.segment,
          customerStatusById.get(order.customerId) ?? "active",
        ].join("|")
      )
      const safeGroups = grouped.filter(
        (set) => new Set(set.map((order) => order.customerId)).size >= 5
      )
      const suppressedOrders = grouped
        .filter((set) => !safeGroups.includes(set))
        .flat()
      const createCustomerRow = (
        customerOrders: typeof suppressedOrders,
        region: string,
        segment: string,
        status: string
      ) => {
        const amount = customerOrders.reduce(
          (sum, order) => sum + order.amounts.total.amount,
          0
        )
        return [
          month,
          region,
          segment,
          status,
          currency,
          new Set(customerOrders.map((order) => order.customerId)).size,
          customerOrders.length,
          ...money(amount, currency),
        ] as const
      }
      const projected = safeGroups.map((set) => {
        const first = set[0]!
        return createCustomerRow(
          set,
          first.customerSnapshot.region,
          first.customerSnapshot.segment,
          customerStatusById.get(first.customerId) ?? "active"
        )
      })
      if (
        new Set(suppressedOrders.map((order) => order.customerId)).size >= 5
      ) {
        const regions = new Set(
          suppressedOrders.map((order) => order.customerSnapshot.region)
        )
        const segments = new Set(
          suppressedOrders.map((order) => order.customerSnapshot.segment)
        )
        const statuses = new Set(
          suppressedOrders.map(
            (order) => customerStatusById.get(order.customerId) ?? "active"
          )
        )
        projected.push(
          createCustomerRow(
            suppressedOrders,
            regions.size === 1 ? [...regions][0]! : "other",
            segments.size === 1 ? [...segments][0]! : "other",
            statuses.size === 1 ? [...statuses][0]! : "suppressed"
          )
        )
      }
      return projected
    })
  )
  const productUpdates = source.products.map((item) => item.updatedAt)
  const orderUpdates = source.commerce.orders.map((item) => item.updatedAt)
  const movementUpdates = source.inventoryMovements.map(
    (item) => item.occurredAt
  )
  const customerUpdates = source.commerce.customers.map(
    (item) => item.updatedAt
  )
  const allUpdates = [
    ...productUpdates,
    ...orderUpdates,
    ...movementUpdates,
    ...customerUpdates,
  ]
  const updatedAtByDataset = {
    agent_products: latestTimestamp(productUpdates),
    agent_sales_daily: latestTimestamp(orderUpdates),
    agent_inventory: latestTimestamp(productUpdates),
    agent_inventory_daily: latestTimestamp(movementUpdates),
    agent_order_daily: latestTimestamp(orderUpdates),
    agent_order_product_daily: latestTimestamp(orderUpdates),
    agent_customer_monthly: latestTimestamp([
      ...orderUpdates,
      ...customerUpdates,
    ]),
    agent_dataset_status: latestTimestamp(allUpdates),
  } satisfies SafeOperationalProjection["updatedAtByDataset"]
  return {
    products,
    sales,
    inventory,
    inventoryDaily,
    orderDaily,
    orderProductDaily,
    customerMonthly,
    updatedAtByDataset,
  }
}

export const createReportingDataSnapshot = (
  input: OperationalReportingSource | readonly Product[]
): ReportingDataSnapshot => {
  // This is the privacy boundary: only the explicitly projected, anonymous
  // operational facts below are allowed to enter the page-local SQLite VM.
  const projection = createSafeOperationalProjection(input)
  const rows: Record<string, readonly Row[]> = {
    agent_products: projection.products,
    agent_sales_daily: projection.sales,
    agent_inventory: projection.inventory,
    agent_inventory_daily: projection.inventoryDaily,
    agent_order_daily: projection.orderDaily,
    agent_order_product_daily: projection.orderProductDaily,
    agent_customer_monthly: projection.customerMonthly,
    agent_dataset_status: [],
  }
  const datasetStatus = REPORTING_DATASETS.map((name) => {
    const [start, end] = [
      "agent_products",
      "agent_inventory",
      "agent_dataset_status",
    ].includes(name)
      ? [null, null]
      : period(rows[name]!)
    return [
      name,
      projection.updatedAtByDataset[name],
      "Asia/Taipei",
      start,
      end,
      "complete",
    ] as const
  })
  return {
    products: projection.products,
    sales: projection.sales,
    inventory: projection.inventory,
    inventoryDaily: projection.inventoryDaily,
    orderDaily: projection.orderDaily,
    orderProductDaily: projection.orderProductDaily,
    customerMonthly: projection.customerMonthly,
    datasetStatus,
  }
}

const defaults = createDummyJsonProductSeed()
export const DEFAULT_REPORTING_DATA = createReportingDataSnapshot({
  products: defaults,
  inventoryMovements: createInventoryMovementSeed(defaults),
  commerce: createCommerceSeed(defaults),
})
export const collectReportingStrings = (snapshot: ReportingDataSnapshot) =>
  new Set(
    (Object.values(snapshot).flat(2) as unknown[])
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.toLowerCase())
  )
