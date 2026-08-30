import { describe, expect, it } from "vitest"
import { createCommerceSeed } from "./commerce-data/commerce-seed"
import { createDummyJsonProductSeed } from "./products/product-seed"
import {
  getVoltageAdminDashboard,
  searchVoltageAdminProducts,
} from "./voltage-admin-data"

describe("Voltage Dashboard data", () => {
  const products = createDummyJsonProductSeed()
  const commerce = createCommerceSeed(products)

  it("uses the embedded product catalog for product search", () => {
    expect(searchVoltageAdminProducts("mascara", products)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 1,
          title: "Essence Mascara Lash Princess",
        }),
      ])
    )
  })

  it("includes a newly low-stock product in the dashboard signal", () => {
    const updated = products.map((product) =>
      product.id === 1 ? { ...product, stock: 3 } : product
    )

    expect(
      getVoltageAdminDashboard(updated, commerce).lowStockProducts
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 1, stock: 3 })])
    )
  })

  it("excludes archived products from dashboard and inventory selectors", () => {
    const archived = products.map((product) =>
      product.id === 1 ? { ...product, status: "archived" as const } : product
    )
    expect(searchVoltageAdminProducts("mascara", archived)[0]?.status).toBe(
      "archived"
    )
    expect(
      getVoltageAdminDashboard(archived, commerce).lowStockProducts.some(
        ({ id }) => id === 1
      )
    ).toBe(false)
  })

  it("derives safe order and customer KPIs from the commerce snapshot", () => {
    const dashboard = getVoltageAdminDashboard(products, commerce)

    expect(dashboard.orderCount).toBe(commerce.orders.length)
    expect(dashboard.customerCount).toBe(commerce.customers.length)
    expect(dashboard.latestOrders).toHaveLength(4)
    expect(dashboard.revenueByCurrency).toEqual([
      expect.objectContaining({ currency: "USD" }),
    ])
    expect(JSON.stringify(dashboard)).not.toMatch(
      /customerId|CUST-|fullName|email|phone|address/i
    )
  })
})
