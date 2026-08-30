import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import {
  voltageAdminPath,
  voltageAdminViewFromPath,
  type VoltageAdminView,
} from "../voltage-admin"
import { GridBlock, PageLayout } from "../voltage-admin-page-layout"
import { LEGACY_OPERATIONS_REDIRECTS } from "../operations-redirects"

const views: VoltageAdminView[] = [
  "dashboard",
  "products",
  "orders",
  "customers",
  "inventory",
  "returns",
  "refund-approvals",
  "reports",
]

describe("operations navigation", () => {
  it("round-trips every current admin view", () => {
    for (const view of views) {
      const path = voltageAdminPath(view)
      expect(path).toBe(`/${view}`)
      expect(voltageAdminViewFromPath(path)).toBe(view)
    }
  })

  it("redirects legacy operations routes into the RMA workflow", () => {
    expect(LEGACY_OPERATIONS_REDIRECTS).toEqual([
      { path: "operations", to: "/returns" },
      { path: "operations-cases", to: "/returns" },
      { path: "approvals", to: "/refund-approvals" },
    ])
  })

  it("falls back to dashboard for unknown and nested paths", () => {
    expect(voltageAdminViewFromPath("/unknown")).toBe("dashboard")
    expect(voltageAdminViewFromPath("/")).toBe("dashboard")
    expect(voltageAdminViewFromPath("/catalog-intake/item")).toBe("dashboard")
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
