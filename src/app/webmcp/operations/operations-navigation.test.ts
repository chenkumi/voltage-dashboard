import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import {
  voltageAdminPath,
  voltageAdminViewFromPath,
  type VoltageAdminView,
} from "../voltage-admin"
import { GridBlock, PageLayout } from "../voltage-admin-page-layout"

const views: VoltageAdminView[] = [
  "dashboard",
  "products",
  "orders",
  "customers",
  "inventory",
  "reports",
  "catalog-intake",
  "operations-cases",
  "approvals",
]

describe("operations navigation", () => {
  it("round-trips every existing and operations view", () => {
    for (const view of views) {
      const path = voltageAdminPath(view)
      expect(path).toBe(`/${view}`)
      expect(voltageAdminViewFromPath(path)).toBe(view)
    }
  })

  it("falls back to dashboard for unknown and nested paths", () => {
    expect(voltageAdminViewFromPath("/unknown")).toBe("dashboard")
    expect(voltageAdminViewFromPath("/")).toBe("dashboard")
    expect(voltageAdminViewFromPath("/catalog-intake/item")).toBe(
      "catalog-intake"
    )
  })

  it("keeps the shared outlet layout grid and block spacing contract", () => {
    const markup = renderToStaticMarkup(
      createElement(PageLayout, {
        ariaLabel: "Test operations page",
        eyebrow: "Operations",
        title: "Shared layout",
        detail: "Layout contract",
        children: createElement(GridBlock, null, "Content"),
      })
    )

    expect(markup).toContain('class="p-1"')
    expect(markup).toContain('class="grid grid-cols-12 gap-2"')
    expect(markup).toContain('class="p-1 col-span-12"')
  })
})
