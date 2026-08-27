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
  price_usd REAL NOT NULL CHECK (price_usd >= 0)
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

export const REPORTING_PRODUCTS = [
  [1, "Essence Mascara", "Beauty", 9.99],
  [2, "Classic Red Lipstick", "Beauty", 12.5],
  [3, "Cedar Side Table", "Furniture", 249],
  [4, "Cloud Lounge Chair", "Furniture", 699],
  [5, "Daily Brew Coffee", "Groceries", 14.75],
  [6, "Citrus Sparkling Water", "Groceries", 8.5],
  [7, "Orbit Smart Watch", "Mens Watches", 189],
  [8, "Slate Running Shoes", "Mens Shoes", 94],
  [9, "Aurora Tablet", "Tablets", 449],
  [10, "Pocket Power Bank", "Mobile Accessories", 39],
  [11, "Studio Sunglasses", "Sunglasses", 79],
  [12, "Trail Helmet", "Sports Accessories", 129],
] as const

const salesDates = [
  "2026-08-21",
  "2026-08-22",
  "2026-08-23",
  "2026-08-24",
  "2026-08-25",
  "2026-08-26",
  "2026-08-27",
] as const

export const REPORTING_SALES = salesDates.flatMap((saleDate, dayIndex) =>
  REPORTING_PRODUCTS.map(([productId, , , price], productIndex) => {
    const quantity = ((dayIndex + 2) * (productIndex + 3)) % 9
    return [saleDate, productId, quantity, Number((quantity * price).toFixed(2))] as const
  })
)

export const REPORTING_INVENTORY = REPORTING_PRODUCTS.map(
  ([productId], index) =>
    [productId, (index * 7 + 3) % 42, "2026-08-28T00:00:00+08:00"] as const
)

export const REPORTING_DATASET_STATUS = REPORTING_DATASETS.map(
  (dataset) =>
    [
      dataset,
      "2026-08-28T00:00:00+08:00",
      "Asia/Taipei",
      dataset === "agent_sales_daily" ? "2026-08-21" : null,
      dataset === "agent_sales_daily" ? "2026-08-27" : null,
      "complete",
    ] as const
)
