import { describe, expect, it } from "vitest"
import { createDummyJsonProductSeed } from "./products/product-seed"
import {
  getVoltageAdminDashboard,
  listSafeVoltageAdminOrders,
  listVoltageAdminCustomerSegments,
  searchVoltageAdminProducts,
} from "./voltage-admin-data"

describe("Voltage Dashboard data", () => {
  const products = createDummyJsonProductSeed()

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

    expect(getVoltageAdminDashboard(updated).lowStockProducts).toEqual(
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
      getVoltageAdminDashboard(archived).lowStockProducts.some(
        ({ id }) => id === 1
      )
    ).toBe(false)
  })

  it("returns order summaries without stable customer identifiers", () => {
    const orders = listSafeVoltageAdminOrders("Action needed")

    expect(orders).toHaveLength(1)
    expect(orders[0]).toMatchObject({ id: "VM-24079" })
    expect(JSON.stringify(orders)).not.toMatch(/customerId|CUST-/i)
  })

  it("returns aggregate customer segments without individual records", () => {
    expect(listVoltageAdminCustomerSegments("VIP")).toEqual([
      {
        segment: "VIP",
        customerCount: 2,
        orderCount: 21,
        lifetimeValue: 3160,
      },
    ])
    expect(JSON.stringify(listVoltageAdminCustomerSegments())).not.toMatch(
      /customerId|CUST-|lastActive/i
    )
  })
})
