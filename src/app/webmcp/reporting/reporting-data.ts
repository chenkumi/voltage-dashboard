import { createDummyJsonProductSeed } from "../products/product-seed"
import type { Product } from "../products/types"

export const REPORTING_DATASETS = [
  "agent_products",
  "agent_sales_daily",
  "agent_inventory",
  "agent_dataset_status",
] as const

export const REPORTING_SCHEMA_SQL = `
CREATE TABLE agent_products (
  product_id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  price_usd REAL CHECK (price_usd IS NULL OR price_usd >= 0),
  price_amount REAL NOT NULL CHECK (price_amount >= 0),
  currency_code TEXT NOT NULL CHECK (currency_code IN ('USD', 'TWD')),
  product_status TEXT NOT NULL CHECK (product_status IN ('draft', 'published', 'archived'))
);

CREATE TABLE agent_sales_daily (
  sale_date TEXT NOT NULL,
  product_id INTEGER NOT NULL REFERENCES agent_products(product_id),
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  net_revenue_usd REAL NOT NULL CHECK (net_revenue_usd >= 0),
  PRIMARY KEY (sale_date, product_id)
);

CREATE TABLE agent_inventory (
  product_id INTEGER PRIMARY KEY REFERENCES agent_products(product_id),
  stock INTEGER NOT NULL CHECK (stock >= 0),
  updated_at TEXT NOT NULL
);

CREATE TABLE agent_dataset_status (
  dataset_name TEXT PRIMARY KEY,
  updated_at TEXT NOT NULL,
  time_zone TEXT NOT NULL,
  period_start TEXT,
  period_end TEXT,
  completeness TEXT NOT NULL
);
`

const salesDates = [
  "2026-08-21",
  "2026-08-22",
  "2026-08-23",
  "2026-08-24",
  "2026-08-25",
  "2026-08-26",
  "2026-08-27",
] as const

const HISTORICAL_USD_SALES_FIXTURES = [
  [1, "BEA-ESS-ESS-001", 9.99],
  [2, "BEA-GLA-EYE-002", 12.5],
  [11, "FUR-ANN-ANN-011", 249],
  [12, "FUR-ANN-ANN-012", 699],
  [16, "GRO-BRD-APP-016", 14.75],
  [17, "GRO-BRD-BEE-017", 8.5],
  [93, "MEN-FAS-BRO-093", 189],
  [88, "MEN-NIK-NIK-088", 94],
  [159, "TAB-APP-IPA-159", 449],
  [99, "MOB-AMA-AMA-099", 39],
  [154, "SUN-FAS-BLA-154", 79],
  [137, "SPO-BRD-AME-137", 129],
] as const

export type ReportingDataSnapshot = {
  products: readonly (readonly [
    productId: number,
    title: string,
    category: string,
    priceUsd: number | null,
    priceAmount: number,
    currencyCode: "USD" | "TWD",
    productStatus: Product["status"],
  ])[]
  sales: readonly (readonly [
    saleDate: string,
    productId: number,
    quantity: number,
    netRevenueUsd: number,
  ])[]
  inventory: readonly (readonly [
    productId: number,
    stock: number,
    updatedAt: string,
  ])[]
  datasetStatus: readonly (readonly [
    datasetName: (typeof REPORTING_DATASETS)[number],
    updatedAt: string,
    timeZone: "Asia/Taipei",
    periodStart: string | null,
    periodEnd: string | null,
    completeness: "complete",
  ])[]
}

export const createReportingDataSnapshot = (
  sourceProducts: readonly Product[]
): ReportingDataSnapshot => {
  const products = sourceProducts.map(
    (product) =>
      [
        product.id,
        product.title,
        product.category,
        product.price.currency === "USD" ? product.price.amount : null,
        product.price.amount,
        product.price.currency,
        product.status,
      ] as const
  )
  const byId = new Map(sourceProducts.map((product) => [product.id, product]))
  const resolvedSalesProducts = HISTORICAL_USD_SALES_FIXTURES.flatMap(
    ([expectedProductId, sku, historicalPriceUsd], fixtureIndex) => {
      const product = byId.get(expectedProductId)
      return product?.sku === sku && product.price.currency === "USD"
        ? [{ product, historicalPriceUsd, fixtureIndex }]
        : []
    }
  )
  const sales = salesDates.flatMap((saleDate, dayIndex) =>
    resolvedSalesProducts.map(
      ({ product, historicalPriceUsd, fixtureIndex }) => {
        const quantity = ((dayIndex + 2) * (fixtureIndex + 3)) % 9
        return [
          saleDate,
          product.id,
          quantity,
          Number((quantity * historicalPriceUsd).toFixed(2)),
        ] as const
      }
    )
  )
  const inventory = sourceProducts.map(
    (product) => [product.id, product.stock, product.updatedAt] as const
  )
  const productUpdatedAt = sourceProducts.reduce(
    (latest, product) =>
      product.updatedAt.localeCompare(latest) > 0 ? product.updatedAt : latest,
    "2026-08-28T00:00:00+08:00"
  )
  const datasetStatus = REPORTING_DATASETS.map(
    (dataset) =>
      [
        dataset,
        dataset === "agent_sales_daily"
          ? "2026-08-28T00:00:00+08:00"
          : productUpdatedAt,
        "Asia/Taipei",
        dataset === "agent_sales_daily" ? "2026-08-21" : null,
        dataset === "agent_sales_daily" ? "2026-08-27" : null,
        "complete",
      ] as const
  )
  return { products, sales, inventory, datasetStatus }
}

export const DEFAULT_REPORTING_DATA = createReportingDataSnapshot(
  createDummyJsonProductSeed()
)

export const collectReportingStrings = (snapshot: ReportingDataSnapshot) =>
  new Set(
    (
      [
        ...snapshot.products,
        ...snapshot.sales,
        ...snapshot.inventory,
        ...snapshot.datasetStatus,
      ].flat() as unknown[]
    )
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.toLowerCase())
  )
