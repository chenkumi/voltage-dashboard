import { describe, expect, it } from "vitest"
import { createCommerceSeed } from "../commerce-data/commerce-seed"
import { createInventoryMovementSeed } from "../inventory/inventory-seed"
import { createDummyJsonProductSeed } from "../products/product-seed"
import {
  collectReportingStrings,
  createReportingDataSnapshot,
  createSafeOperationalProjection,
  REPORTING_DATASETS,
} from "./reporting-data"

const createSource = () => {
  const products = createDummyJsonProductSeed()
  return {
    products,
    inventoryMovements: createInventoryMovementSeed(products),
    commerce: createCommerceSeed(products),
  }
}

describe("unified operational reporting projection", () => {
  it("publishes eight documented datasets with 13 reproducible months", () => {
    const snapshot = createReportingDataSnapshot(createSource())

    expect(snapshot.datasetStatus.map(([name]) => name)).toEqual(
      REPORTING_DATASETS
    )
    expect(
      new Set(snapshot.orderDaily.map(([date]) => String(date).slice(0, 7)))
    ).toHaveProperty("size", 13)
    expect(
      new Set(snapshot.customerMonthly.map(([month]) => String(month)))
    ).toHaveProperty("size", 13)
    expect(
      new Set(snapshot.customerMonthly.map((row) => String(row[1]))).size
    ).toBeGreaterThan(1)
    expect(
      new Set(snapshot.customerMonthly.map((row) => String(row[2]))).size
    ).toBeGreaterThan(1)
    expect(
      snapshot.customerMonthly.some(
        (row) => row[1] !== "other"
      )
    ).toBe(true)
    expect(snapshot.customerMonthly.some((row) => row[2] !== "other")).toBe(
      true
    )
    expect(
      snapshot.datasetStatus.every((row) =>
        ["Asia/Taipei", "complete"].every((value) => row.includes(value))
      )
    ).toBe(true)
  })

  it("derives product sales and order-product facts from the same order lines", () => {
    const snapshot = createReportingDataSnapshot(createSource())
    const fromSales = new Map(
      snapshot.sales.map((row) => [
        `${row[0]}|${row[1]}|${row[4]}`,
        { quantity: row[2], amount: row[3], usd: row[5] },
      ])
    )
    const fromOrders = new Map<
      string,
      { quantity: number; amount: number; usd: number | null }
    >()
    for (const row of snapshot.orderProductDaily) {
      const key = `${row[0]}|${row[1]}|${row[7]}`
      const previous = fromOrders.get(key) ?? {
        quantity: 0,
        amount: 0,
        usd: row[7] === "USD" ? 0 : null,
      }
      fromOrders.set(key, {
        quantity: previous.quantity + Number(row[9]),
        amount: Number((previous.amount + Number(row[10])).toFixed(2)),
        usd:
          previous.usd === null
            ? null
            : Number((previous.usd + Number(row[11])).toFixed(2)),
      })
    }

    expect(fromSales).toEqual(fromOrders)
  })

  it("keeps native currencies separate and exposes USD compatibility only for USD", () => {
    const source = createSource()
    const template = source.products[0]!
    source.products = [
      ...source.products,
      {
        ...template,
        id: 999,
        sku: "TWD-TEST-999",
        title: "TWD reporting fixture",
        price: { amount: 2_500, currency: "TWD" },
      },
    ]
    source.commerce = createCommerceSeed(source.products)
    const snapshot = createReportingDataSnapshot(source)
    const currencyRows = [...snapshot.sales, ...snapshot.orderDaily]

    expect(currencyRows.some((row) => row.includes("USD"))).toBe(true)
    expect(currencyRows.some((row) => row.includes("TWD"))).toBe(true)
    for (const row of snapshot.sales) {
      expect(row[4] === "USD" ? row[5] : null).toBe(row[5])
      if (row[4] === "USD") expect(row[3]).toBe(row[5])
    }
    for (const row of snapshot.orderDaily) {
      expect(row[6] === "USD" ? row[9] : null).toBe(row[9])
      if (row[6] === "USD") expect(row[8]).toBe(row[9])
    }
  })

  it("suppresses small customer cohorts and never emits raw customer or note data", () => {
    const source = createSource()
    const secret = "private-review-note-892"
    const email = "private.person@example.test"
    const commerce = {
      ...source.commerce,
      customers: source.commerce.customers.map((customer, index) =>
        index === 0
          ? { ...customer, contact: { ...customer.contact, email } }
          : customer
      ),
      notes: [
        {
          id: "NOTE-PRIVATE",
          customerId: source.commerce.customers[0]!.id,
          text: secret,
          createdAt: "2026-08-30T00:00:00.000Z",
          updatedAt: "2026-08-30T00:00:00.000Z",
        },
      ],
    }
    const snapshot = createReportingDataSnapshot({ ...source, commerce })
    const strings = collectReportingStrings(snapshot)

    expect(snapshot.customerMonthly.length).toBeGreaterThan(0)
    expect(snapshot.customerMonthly.every((row) => Number(row[5]) >= 5)).toBe(
      true
    )
    expect(
      snapshot.customerMonthly.every(
        (row) => Number(row[5]) <= Number(row[6])
      )
    ).toBe(true)
    expect(strings.has(secret)).toBe(false)
    expect(strings.has(email)).toBe(false)
    expect(JSON.stringify(snapshot)).not.toContain("CUST-")
  })

  it("projects inventory history without movement identifiers or notes", () => {
    const source = createSource()
    const first = source.inventoryMovements[0]!
    source.inventoryMovements = [
      { ...first, id: "SECRET-MOVEMENT", note: "private stock note" },
    ]
    const projection = createSafeOperationalProjection(source)

    expect(projection.inventoryDaily).toEqual([
      [
        first.occurredAt.slice(0, 10),
        first.productId,
        first.previousStock,
        first.nextStock,
        first.type === "receipt" ? first.delta : 0,
        first.type === "issue" ? Math.abs(first.delta) : 0,
        first.type === "reconciliation" ? first.delta : 0,
        first.delta,
      ],
    ])
    expect(JSON.stringify(projection)).not.toMatch(
      /SECRET-MOVEMENT|private stock note/
    )
  })

  it("tracks an independent update watermark for each dataset", () => {
    const source = createSource()
    const base = createReportingDataSnapshot(source)
    const status = (snapshot: typeof base) =>
      new Map(snapshot.datasetStatus.map((row) => [row[0], row[1]]))
    const baseStatus = status(base)

    const customerSnapshot = createReportingDataSnapshot({
      ...source,
      commerce: {
        ...source.commerce,
        customers: source.commerce.customers.map((customer, index) =>
          index === 0
            ? {
                ...customer,
                status: "suspended" as const,
                updatedAt: "2030-01-01T00:00:00.000Z",
              }
            : customer
        ),
      },
    })
    expect(status(customerSnapshot).get("agent_customer_monthly")).toBe(
      "2030-01-01T00:00:00.000Z"
    )
    expect(status(customerSnapshot).get("agent_order_daily")).toBe(
      baseStatus.get("agent_order_daily")
    )

    const productSnapshot = createReportingDataSnapshot({
      ...source,
      products: source.products.map((product, index) =>
        index === 0
          ? { ...product, updatedAt: "2031-01-01T00:00:00.000Z" }
          : product
      ),
    })
    expect(status(productSnapshot).get("agent_products")).toBe(
      "2031-01-01T00:00:00.000Z"
    )
    expect(status(productSnapshot).get("agent_inventory")).toBe(
      "2031-01-01T00:00:00.000Z"
    )
    expect(status(productSnapshot).get("agent_sales_daily")).toBe(
      baseStatus.get("agent_sales_daily")
    )

    const inventorySnapshot = createReportingDataSnapshot({
      ...source,
      inventoryMovements: source.inventoryMovements.map((movement, index) =>
        index === 0
          ? { ...movement, occurredAt: "2032-01-01T00:00:00.000Z" }
          : movement
      ),
    })
    expect(status(inventorySnapshot).get("agent_inventory_daily")).toBe(
      "2032-01-01T00:00:00.000Z"
    )

    const orderSnapshot = createReportingDataSnapshot({
      ...source,
      commerce: {
        ...source.commerce,
        orders: source.commerce.orders.map((order, index) =>
          index === 0
            ? { ...order, updatedAt: "2033-01-01T00:00:00.000Z" }
            : order
        ),
      },
    })
    for (const dataset of [
      "agent_sales_daily",
      "agent_order_daily",
      "agent_order_product_daily",
      "agent_customer_monthly",
    ])
      expect(status(orderSnapshot).get(dataset)).toBe(
        "2033-01-01T00:00:00.000Z"
      )
  })
})
