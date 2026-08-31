import { describe, expect, it } from "vitest"
import { createCommerceSeed } from "../commerce-data/commerce-seed"
import { createInventoryMovementSeed } from "../inventory/inventory-seed"
import { createDummyJsonProductSeed } from "../products/product-seed"
import { createReturnSeed } from "../returns/return-seed"
import type { ReturnRepositorySnapshot } from "../returns/types"
import {
  collectReportingStrings,
  createOperationalReportingVersion,
  createReportingDataSnapshot,
  createSafeOperationalProjection,
  REPORTING_DATASETS,
} from "./reporting-data"

const createSource = () => {
  const products = createDummyJsonProductSeed()
  const commerce = createCommerceSeed(products)
  return {
    products,
    inventoryMovements: createInventoryMovementSeed(products),
    commerce,
    returns: createReturnSeed(commerce),
  }
}

describe("unified operational reporting projection", () => {
  it("keeps private return notes outside every reporting projection", () => {
    const source = createSource()
    const snapshot = createReportingDataSnapshot({
      ...source,
      returns: {
        ...source.returns,
        version: source.returns.version + 1,
        notes: [
          {
            id: "NOTE-PRIVATE",
            rmaId: source.returns.rmas[0].id,
            stage: "eligibility",
            category: "internal_note",
            content: "PRIVATE NOTE CONTENT",
            recommendation: null,
            evidenceCodes: [],
            authorUserId: "private-user",
            status: "draft",
            createdAt: "2026-08-31T08:00:00.000Z",
            updatedAt: "2026-08-31T08:00:00.000Z",
            publishedAt: null,
            version: 1,
            inputSource: "ui",
            supersedesNoteId: null,
          },
        ],
      },
    })

    expect(JSON.stringify(snapshot)).not.toMatch(
      /NOTE-PRIVATE|PRIVATE NOTE CONTENT|private-user/
    )
  })

  it("uses all three repository versions in the reporting context version", () => {
    const baseline = createOperationalReportingVersion(1, 2, 3)

    expect(createOperationalReportingVersion(2, 2, 3)).not.toBe(baseline)
    expect(createOperationalReportingVersion(1, 3, 3)).not.toBe(baseline)
    expect(createOperationalReportingVersion(1, 2, 4)).not.toBe(baseline)
    expect(
      new Set(
        Array.from({ length: 4 }, (_, productVersion) =>
          Array.from({ length: 4 }, (_, commerceVersion) =>
            Array.from({ length: 4 }, (_, returnVersion) =>
              createOperationalReportingVersion(
                productVersion,
                commerceVersion,
                returnVersion
              )
            )
          )
        ).flat(2)
      ).size
    ).toBe(64)
  })

  it("publishes twelve documented datasets with 13 reproducible months", () => {
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
    expect(snapshot.customerMonthly.some((row) => row[1] !== "other")).toBe(
      true
    )
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
      snapshot.customerMonthly.every((row) => Number(row[5]) <= Number(row[6]))
    ).toBe(true)
    expect(strings.has(secret)).toBe(false)
    expect(strings.has(email)).toBe(false)
    expect(JSON.stringify(snapshot)).not.toContain("CUST-")
  })

  it("projects RMA facts without IDs, free text, or raw timeline content", () => {
    const source = createSource()
    const orders = source.commerce.orders.filter(
      (order, index, all) =>
        order.amounts.total.currency === "USD" &&
        all.findIndex(
          (candidate) => candidate.customerId === order.customerId
        ) === index
    )
    expect(orders.length).toBeGreaterThanOrEqual(5)
    const templateRma = source.returns.rmas[0]!
    const templateItem = source.returns.items[0]!
    const cohortOrders = orders.slice(0, 5)
    const rmas = cohortOrders.map((order, index) => ({
      ...templateRma,
      id: `PRIVATE-RMA-${index}`,
      orderId: order.id,
      customerStatement: "private return statement",
      createdAt: `2026-08-${String(20 + index).padStart(2, "0")}T01:00:00.000Z`,
      updatedAt: `2026-08-${String(20 + index).padStart(2, "0")}T02:00:00.000Z`,
    }))
    const items = cohortOrders.map((order, index) => {
      const line = source.commerce.orderLines.find(
        (candidate) => candidate.orderId === order.id
      )!
      return {
        ...templateItem,
        id: `PRIVATE-ITEM-${index}`,
        rmaId: rmas[index]!.id,
        orderLineId: line.id,
        productId: line.productId,
        sku: line.sku,
        title: line.title,
        paidAmount: line.paidAmount,
        paidUnitAmounts: line.paidUnitAmounts,
      }
    })
    const snapshot = createReportingDataSnapshot({
      ...source,
      returns: {
        ...source.returns,
        rmas,
        items,
        calculations: [],
        approvals: [],
        executionAttempts: [],
        timeline: rmas.map((rma, index) => ({
          id: `PRIVATE-TIMELINE-${index}`,
          rmaId: rma.id,
          actor: "user" as const,
          action: "private_action",
          entityId: `PRIVATE-ENTITY-${index}`,
          occurredAt: rma.updatedAt,
          result: "private timeline result",
          version: 1,
        })),
      },
    })
    const serialized = JSON.stringify(snapshot)

    expect(snapshot.returnProductDaily.length).toBeGreaterThan(0)
    expect(snapshot.returnOperationalDaily.length).toBeGreaterThan(0)
    expect(snapshot.returnCohortMonthly.length).toBeGreaterThan(0)
    expect(
      snapshot.returnCohortMonthly.every((row) => Number(row[6]) >= 5)
    ).toBe(true)
    expect(serialized).not.toMatch(
      /PRIVATE-RMA|PRIVATE-ITEM|PRIVATE-TIMELINE|PRIVATE-ENTITY|private return statement|private timeline result|CUST-|ORD-/
    )
  })

  it("keeps refund reporting in native currencies and excludes execution identifiers", () => {
    const source = createSource()
    const templateRma = source.returns.rmas[0]!
    const templateItem = source.returns.items[0]!
    const usdOrder = source.commerce.orders[0]!
    const usdLine = source.commerce.orderLines.find(
      (candidate) => candidate.orderId === usdOrder.id
    )!
    const twdMoney = (amount: number) => ({
      amount,
      currency: "TWD" as const,
    })
    const twdOrder = {
      ...usdOrder,
      id: "PRIVATE-ORDER-TWD",
      amounts: {
        subtotal: twdMoney(1_000),
        discount: twdMoney(0),
        shipping: twdMoney(0),
        tax: twdMoney(0),
        total: twdMoney(1_000),
      },
    }
    const twdLine = {
      ...usdLine,
      id: "PRIVATE-LINE-TWD",
      orderId: twdOrder.id,
      unitPrice: twdMoney(1_000),
      discount: twdMoney(0),
      subtotal: twdMoney(1_000),
      paidAmount: twdMoney(1_000),
      paidUnitAmounts: [twdMoney(1_000)],
    }
    source.commerce = {
      ...source.commerce,
      orders: [...source.commerce.orders, twdOrder],
      orderLines: [...source.commerce.orderLines, twdLine],
    }
    const fixtures = (["USD", "TWD"] as const).map((currency, index) => {
      const order = source.commerce.orders.find(
        (candidate) => candidate.amounts.total.currency === currency
      )!
      const line = source.commerce.orderLines.find(
        (candidate) => candidate.orderId === order.id
      )!
      const rmaId = `PRIVATE-RMA-${currency}`
      const itemId = `PRIVATE-ITEM-${currency}`
      const calculationId = `PRIVATE-CALC-${currency}`
      const approvalId = `PRIVATE-APPROVAL-${currency}`
      const amount = line.paidUnitAmounts[0]!
      return {
        rma: {
          ...templateRma,
          id: rmaId,
          orderId: order.id,
          status: "completed" as const,
          approvalStatus: "approved" as const,
          refundStatus: "succeeded" as const,
          completedAt: `2026-08-2${index + 1}T04:00:00.000Z`,
        },
        item: {
          ...templateItem,
          id: itemId,
          rmaId,
          orderLineId: line.id,
          productId: line.productId,
          sku: line.sku,
          title: line.title,
          requestedQuantity: 1,
          acceptedQuantity: 1,
          paidAmount: amount,
          paidUnitAmounts: [amount],
        },
        calculation: {
          id: calculationId,
          rmaId,
          orderId: order.id,
          rmaVersion: 1,
          inspectionVersion: 1,
          orderSnapshotVersion: source.returns.orderSnapshotVersion,
          version: 1,
          items: [
            {
              returnItemId: itemId,
              orderLineId: line.id,
              acceptedQuantity: 1,
              refundedUnitIndexes: [0],
              amount,
            },
          ],
          shippingAmount: { amount: 0, currency },
          total: amount,
          createdAt: `2026-08-2${index + 1}T02:00:00.000Z`,
        },
        approval: {
          id: approvalId,
          rmaId,
          calculationId,
          calculationVersion: 1,
          status: "approved" as const,
          decidedBy: "private approver",
          reason: "private approval reason",
          createdAt: `2026-08-2${index + 1}T02:30:00.000Z`,
          decidedAt: `2026-08-2${index + 1}T03:00:00.000Z`,
          version: 1,
        },
        attempt: {
          id: `PRIVATE-ATTEMPT-${currency}`,
          approvalId,
          calculationVersion: 1,
          sequence: 1,
          result: "succeeded" as const,
          resultCode: "recorded_success" as const,
          note: "private execution note",
          executedBy: "private executor",
          executedAt: `2026-08-2${index + 1}T04:00:00.000Z`,
        },
      }
    })
    const returns: ReturnRepositorySnapshot = {
      ...source.returns,
      rmas: fixtures.map(({ rma }) => rma),
      items: fixtures.map(({ item }) => item),
      calculations: fixtures.map(({ calculation }) => calculation),
      approvals: fixtures.map(({ approval }) => approval),
      executionAttempts: fixtures.map(({ attempt }) => attempt),
      timeline: [],
    }
    const snapshot = createReportingDataSnapshot({ ...source, returns })

    expect(snapshot.refundDaily.map((row) => row[3]).sort()).toEqual([
      "TWD",
      "USD",
    ])
    for (const row of snapshot.refundDaily) {
      expect(row[3] === "USD" ? row[5] : null).toBe(row[6])
      expect(row[7]).toBe(1)
      expect(row[8]).toBe(0)
      expect(row[9]).toBe(1)
    }
    expect(JSON.stringify(snapshot)).not.toMatch(
      /PRIVATE-RMA|PRIVATE-ORDER|PRIVATE-LINE|PRIVATE-CALC|PRIVATE-APPROVAL|PRIVATE-ATTEMPT|private approver|private approval reason|private execution note|private executor/
    )
  })

  it("separates inventory disposition execution states", () => {
    const source = createSource()
    const rma = source.returns.rmas[0]!
    const item = source.returns.items.find(
      (candidate) => candidate.rmaId === rma.id
    )!
    const common = {
      ...item,
      condition: "opened" as const,
      packaging: "intact" as const,
      missingContents: false,
      inspectionResult: "accepted" as const,
      inventoryDisposition: "restock" as const,
      receivedQuantity: 1,
      acceptedQuantity: 1,
    }
    const projection = createSafeOperationalProjection({
      ...source,
      returns: {
        ...source.returns,
        rmas: [rma],
        items: [
          {
            ...common,
            id: "PRIVATE-PENDING-ITEM",
            inventoryDispositionStatus: "pending",
          },
          {
            ...common,
            id: "PRIVATE-COMPLETED-ITEM",
            inventoryDispositionStatus: "completed",
          },
        ],
      },
    })

    expect(projection.returnProductDaily.map((row) => row[7]).sort()).toEqual([
      "completed",
      "pending",
    ])
    expect(
      projection.returnProductDaily
        .filter((row) => row[6] === "restock" && row[7] === "completed")
        .reduce((sum, row) => sum + Number(row[12]), 0)
    ).toBe(1)
  })

  it("uses reporting as-of time for active RMA SLA breaches", () => {
    const source = createSource()
    const rma = {
      ...source.returns.rmas[0]!,
      status: "active" as const,
      slaDueAt: "2026-08-29T00:00:00.000Z",
      updatedAt: "2026-08-28T00:00:00.000Z",
      completedAt: null,
    }
    const projectAt = (asOf: string) =>
      createSafeOperationalProjection({
        ...source,
        asOf,
        returns: {
          ...source.returns,
          rmas: [rma],
          items: source.returns.items.filter((item) => item.rmaId === rma.id),
        },
      }).returnOperationalDaily[0]!

    expect(projectAt("2026-08-28T23:59:59.000Z")[10]).toBe(0)
    expect(projectAt("2026-08-29T00:00:01.000Z")[10]).toBe(1)
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
