import { describe, expect, it } from "vitest"
import {
  createVoltageAdminInventory,
  getVoltageAdminDashboard,
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
})
