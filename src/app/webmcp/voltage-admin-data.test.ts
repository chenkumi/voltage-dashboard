import { describe, expect, it } from "vitest"
import {
  createVoltageAdminInventory,
  getVoltageAdminDashboard,
  listSafeVoltageAdminOrders,
  listVoltageAdminCustomerSegments,
  searchVoltageAdminProducts,
  setVoltageAdminInventory,
} from "./voltage-admin-data"

describe("Voltage Dashboard data", () => {
  it("uses the embedded product catalog for product search", () => {
    const inventory = createVoltageAdminInventory()

    expect(searchVoltageAdminProducts("mascara", inventory)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 1,
          title: "Essence Mascara Lash Princess",
        }),
      ])
    )
  })

  it("includes a newly low-stock product in the dashboard signal", () => {
    const inventory = createVoltageAdminInventory()
    const nextInventory = setVoltageAdminInventory(inventory, 1, 3)

    expect(nextInventory).not.toBeNull()
    expect(
      getVoltageAdminDashboard(nextInventory ?? inventory).lowStockProducts
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 1, stock: 3 })])
    )
  })

  it("rejects inventory updates with an unknown product or invalid stock", () => {
    const inventory = createVoltageAdminInventory()

    expect(setVoltageAdminInventory(inventory, 9999, 10)).toBeNull()
    expect(setVoltageAdminInventory(inventory, 1, -1)).toBeNull()
    expect(setVoltageAdminInventory(inventory, 1, 1.5)).toBeNull()
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
