import { afterEach, describe, expect, it } from "vitest"
import {
  getVoltageAdminDashboard,
  searchVoltageAdminProducts,
} from "../voltage-admin-data"
import { createReportingDataSnapshot } from "../reporting/reporting-data"
import { ReportingRuntimeController } from "../reporting/reporting-tools"
import { SqliteReportingDatabase } from "../reporting/sqlite-database"
import type { ReportingDataSnapshot } from "../reporting/reporting-data"
import type { SqlQueryInput } from "../reporting/types"
import { ProductEditorController } from "./product-editor-controller"
import { createDummyJsonProductSeed } from "./product-seed"
import { ProductRepository } from "./product-repository"
import { executeProductTool } from "./product-tools"
import type { ProductWriteInput } from "./types"

class InProcessReportingRuntime {
  private database: SqliteReportingDatabase | null = null

  async initialize(snapshot?: ReportingDataSnapshot) {
    if (!this.database) {
      this.database = await SqliteReportingDatabase.create(snapshot)
    }
  }

  async execute(input: SqlQueryInput) {
    if (!this.database) throw new Error("Reporting database is not ready.")
    return this.database.execute(input)
  }

  async dispose() {
    this.database?.close()
    this.database = null
  }
}

const repositories: ProductRepository[] = []

afterEach(async () => {
  await Promise.all(
    repositories
      .splice(0)
      .map((repository) => repository.deleteDatabaseForTests())
  )
})

const createInput = (): ProductWriteInput => ({
  sku: "PCHOME-TWD-001",
  title: "External TWD Product",
  brand: "Example Brand",
  category: "mobile-accessories",
  price: { amount: 1999, currency: "TWD" },
  stock: 9,
  description: "A product researched by the external Agent.",
  shortAdCopy: "Compact and practical.",
  longAdCopy: "A longer product message prepared for human review.",
  images: [
    {
      id: "image-1",
      url: "https://example.com/product.jpg",
      alt: "Product",
      position: 0,
      isPrimary: true,
    },
  ],
  specifications: [],
})

describe("shared product data across admin modules", () => {
  it("keeps dashboard, inventory, WebMCP, and SQL on one repository version", async () => {
    const repository = new ProductRepository({
      databaseName: `product-cross-module-${crypto.randomUUID()}`,
      seed: createDummyJsonProductSeed(),
    })
    repositories.push(repository)
    await repository.initialize()
    const reporting = new ReportingRuntimeController(
      () => new InProcessReportingRuntime()
    )
    const initialProducts = await repository.list({ includeArchived: true })
    const initialSnapshot = createReportingDataSnapshot(initialProducts)
    await reporting.prepare(initialSnapshot, 1)
    const oldQuery = await reporting.execute({
      sql: "SELECT product_id FROM agent_products ORDER BY product_id LIMIT 1",
    })
    reporting.createNewReport()
    expect(reporting.getReportSnapshot()).not.toBeNull()
    const staleReport = reporting.createSavedReportSnapshot()
    expect(staleReport).not.toBeNull()

    const created = await repository.create(createInput(), "draft")
    const afterCreate = await repository.list({ includeArchived: true })
    expect(searchVoltageAdminProducts("PCHOME-TWD-001", afterCreate)).toEqual([
      expect.objectContaining({ id: created.id, stock: 9, status: "draft" }),
    ])
    expect(getVoltageAdminDashboard(afterCreate).availableProductCount).toBe(
      getVoltageAdminDashboard(initialProducts).availableProductCount + 1
    )
    const webMcpSearch = await executeProductTool({
      name: "search_admin_products",
      args: { query: "PCHOME-TWD-001" },
      repository,
      editor: new ProductEditorController(),
      navigate: () => undefined,
    })
    expect(webMcpSearch).toMatchObject({
      status: "OK",
      items: [expect.objectContaining({ id: created.id, stock: 9 })],
    })

    await reporting.prepare(createReportingDataSnapshot(afterCreate), 2)
    expect(() => reporting.getQueryResult(oldQuery.queryId)).toThrow()
    expect(reporting.getReportSnapshot()).toBeNull()
    expect(() => reporting.loadSavedReport(staleReport!)).toThrow(
      /different reporting context/i
    )
    await expect(
      reporting.execute({
        sql: `SELECT price_usd, price_amount, currency_code, product_status
              FROM agent_products WHERE product_id = ?`,
        parameters: [created.id],
      })
    ).resolves.toMatchObject({
      rows: [
        {
          price_usd: null,
          price_amount: 1999,
          currency_code: "TWD",
          product_status: "draft",
        },
      ],
    })
    await expect(
      reporting.execute({
        sql: "SELECT COUNT(*) AS sales_count FROM agent_sales_daily WHERE product_id = ?",
        parameters: [created.id],
      })
    ).resolves.toMatchObject({ rows: [{ sales_count: 0 }] })

    await repository.setStock(created.id, 3)
    await repository.archive(created.id)
    const afterArchive = await repository.list({ includeArchived: true })
    expect(
      getVoltageAdminDashboard(afterArchive).lowStockProducts.some(
        ({ id }) => id === created.id
      )
    ).toBe(false)
    await reporting.prepare(createReportingDataSnapshot(afterArchive), 3)
    await expect(
      reporting.execute({
        sql: `SELECT p.product_status, i.stock
              FROM agent_products AS p
              JOIN agent_inventory AS i ON i.product_id = p.product_id
              WHERE p.product_id = ?`,
        parameters: [created.id],
      })
    ).resolves.toMatchObject({
      rows: [{ product_status: "archived", stock: 3 }],
    })

    await reporting.dispose()
  })
})
