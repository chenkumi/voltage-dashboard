// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react"
import { createMemoryRouter, RouterProvider } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import App from "../../../App"
import i18n from "../../../i18n"
import { demoAuthDb, DEMO_AUTH_SESSION_ID } from "../../auth/demo-auth-db"

vi.mock("../reporting/reporting-tools", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../reporting/reporting-tools")>()
  class NoopReportingRuntimeController {
    private snapshot:
      { inventory: readonly (readonly [number, number, string])[] } | undefined
    async prepare(snapshot?: {
      inventory: readonly (readonly [number, number, string])[]
    }) {
      if (snapshot) this.snapshot = snapshot
    }
    async dispose() {}
    async execute() {
      const stock = this.snapshot?.inventory.find(
        ([productId]) => productId === 1
      )?.[1]
      return { rows: [{ product_id: 1, stock }] }
    }
    executeReportTool() {
      throw new Error("Reporting is outside this test.")
    }
  }
  return {
    ...actual,
    ReportingRuntimeController: NoopReportingRuntimeController,
  }
})

type Provider = {
  getTools: () => Array<{ name: string }>
  executeTool: (
    tool: { name: string },
    args: Record<string, unknown>
  ) => Promise<unknown>
}
const fallback = () =>
  window as typeof window & {
    __webmcpReady?: Promise<void>
    __webmcpTestProvider?: Provider
  }
const provider = async () => {
  await waitFor(() => expect(fallback().__webmcpReady).toBeDefined(), {
    timeout: 4_000,
  })
  await fallback().__webmcpReady
  expect(fallback().__webmcpTestProvider).toBeDefined()
  return fallback().__webmcpTestProvider!
}
const execute = async (
  current: Provider,
  name: string,
  args: Record<string, unknown> = {}
) => {
  const tool = current.getTools().find((item) => item.name === name)
  expect(tool).toBeDefined()
  return current.executeTool(tool!, args)
}

beforeEach(async () => {
  await demoAuthDb.sessions.put({
    id: DEMO_AUTH_SESSION_ID,
    username: "guest",
    signedInAt: "2026-08-31T00:00:00.000Z",
  })
  await i18n.changeLanguage("en")
})
afterEach(() => cleanup())

describe("fallback product authoring workflow", () => {
  it("navigates, rediscovers editor tools, fills a draft, and leaves repository unchanged", async () => {
    const router = createMemoryRouter([{ path: "*", element: <App /> }], {
      initialEntries: ["/products"],
    })
    render(<RouterProvider router={router} />)
    const initial = await provider()
    expect(initial.getTools().map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "get_inventory_overview",
        "search_inventory",
        "get_inventory_detail",
        "open_inventory_detail",
        "search_orders",
        "get_order_detail",
        "open_order_detail",
        "get_customer_analytics",
        "open_customer_analysis",
      ])
    )
    expect(initial.getTools().map(({ name }) => name)).not.toContain(
      "set_voltage_admin_inventory"
    )
    expect(await execute(initial, "search_orders", { limit: 1 })).toMatchObject(
      { status: "OK" }
    )
    const seeded = await execute(initial, "search_admin_products", {
      query: "Essence Mascara",
    })
    expect(seeded).toMatchObject({ status: "OK", total: 1 })
    expect(initial.getTools().map(({ name }) => name)).not.toContain(
      "apply_product_editor_draft"
    )

    expect(await execute(initial, "open_product_create")).toMatchObject({
      status: "OK",
      nextToolset: {
        status: "READY",
        route: "/products/add",
        ready: true,
        revision: expect.any(Number),
      },
    })
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/products/add")
    )
    await waitFor(() =>
      expect(
        fallback()
          .__webmcpTestProvider?.getTools()
          .map(({ name }) => name)
      ).toContain("apply_product_editor_draft")
    )
    const editorProvider = await provider()
    const applied = await execute(
      editorProvider,
      "apply_product_editor_draft",
      {
        sku: "PCHOME-EXTERNAL-1",
        title: "Externally researched product",
        category: "Electronics",
        price: { amount: 1999, currency: "TWD" },
        stock: 5,
        description: "Plain product description.",
        shortAdCopy: "Short copy.",
        longAdCopy: "Long copy prepared from external research.",
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
      }
    )
    expect(applied).toMatchObject({ status: "OK", dirty: true, valid: true })
    const verified = await execute(editorProvider, "get_product_editor_state")
    expect(verified).toMatchObject({
      status: "OK",
      mode: "create",
      dirty: true,
      valid: true,
      draft: { sku: "PCHOME-EXTERNAL-1" },
    })
    const search = await execute(editorProvider, "search_admin_products", {
      query: "PCHOME-EXTERNAL-1",
    })
    expect(search).toMatchObject({ status: "OK", items: [] })
  })

  it("reattaches the editor controller when navigating edit to edit", async () => {
    const router = createMemoryRouter([{ path: "*", element: <App /> }], {
      initialEntries: ["/products/edit/1"],
    })
    render(<RouterProvider router={router} />)
    const firstProvider = await provider()
    await waitFor(async () => {
      const state = await execute(firstProvider, "get_product_editor_state")
      expect(state).toMatchObject({ status: "OK", productId: 1 })
    })

    expect(
      await execute(firstProvider, "open_product_edit", { productId: 2 })
    ).toMatchObject({
      status: "OK",
      nextToolset: {
        status: "READY",
        route: "/products/edit/2",
        ready: true,
        revision: expect.any(Number),
      },
    })
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/products/edit/2")
    )
    const secondProvider = await provider()
    await waitFor(async () => {
      const state = await execute(secondProvider, "get_product_editor_state")
      expect(state).toMatchObject({ status: "OK", productId: 2 })
      expect(JSON.stringify(state)).not.toContain("Essence Mascara")
    })
  })

  it("publishes product editor tools before navigation returns ready", async () => {
    const router = createMemoryRouter([{ path: "*", element: <App /> }], {
      initialEntries: ["/products"],
    })
    render(<RouterProvider router={router} />)
    const initial = await provider()

    expect(
      await execute(initial, "open_product_edit", { productId: 1 })
    ).toMatchObject({
      status: "OK",
      nextToolset: {
        status: "READY",
        route: "/products/edit/1",
        ready: true,
        revision: expect.any(Number),
      },
    })

    const freshSnapshot = await provider()
    expect(
      await execute(freshSnapshot, "get_product_editor_state")
    ).toMatchObject({ status: "OK", productId: 1 })
  })

  it("reports app-local back and forward state consistently", async () => {
    const router = createMemoryRouter([{ path: "*", element: <App /> }], {
      initialEntries: ["/dashboard"],
    })
    render(<RouterProvider router={router} />)
    let current = await provider()

    expect(await execute(current, "navigate_state")).toMatchObject({
      status: "OK",
      page: "dashboard",
      canGoBack: false,
      canGoForward: false,
    })
    await execute(current, "open_voltage_admin_section", {
      section: "products",
    })
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/products")
    )
    await waitFor(async () => {
      current = await provider()
      expect(await execute(current, "navigate_state")).toMatchObject({
        status: "OK",
        page: "products",
        canGoBack: true,
        canGoForward: false,
      })
    })

    expect(await execute(current, "navigate_back")).toMatchObject({
      status: "OK",
      page: "dashboard",
      canGoBack: false,
      canGoForward: true,
    })
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/dashboard")
    )
    await waitFor(async () => {
      current = await provider()
      expect(await execute(current, "navigate_state")).toMatchObject({
        page: "dashboard",
        canGoBack: false,
        canGoForward: true,
      })
    })

    expect(await execute(current, "navigate_forward")).toMatchObject({
      status: "OK",
      page: "products",
      canGoBack: true,
      canGoForward: false,
    })
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/products")
    )
  })

  it("changes native discovery when the route tool set changes", async () => {
    const registered = new Map<
      string,
      {
        name: string
        execute?: (args: Record<string, unknown>) => Promise<unknown>
      }
    >()
    const events = new EventTarget()
    let toolChanges = 0
    events.addEventListener("toolchange", () => {
      toolChanges += 1
    })
    const modelContext = {
      registerTool: async (
        tool: {
          name: string
          execute?: (args: Record<string, unknown>) => Promise<unknown>
        },
        options?: { signal?: AbortSignal }
      ) => {
        registered.set(tool.name, tool)
        events.dispatchEvent(new Event("toolchange"))
        options?.signal?.addEventListener(
          "abort",
          () => {
            registered.delete(tool.name)
            events.dispatchEvent(new Event("toolchange"))
          },
          { once: true }
        )
      },
      getTools: async () => [...registered.values()],
      executeTool: async (
        tool: {
          execute?: (args: Record<string, unknown>) => Promise<unknown>
        },
        args: Record<string, unknown>
      ) => tool.execute?.(args),
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events),
    }
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: modelContext,
    })

    try {
      const router = createMemoryRouter([{ path: "*", element: <App /> }], {
        initialEntries: ["/products"],
      })
      render(<RouterProvider router={router} />)
      await waitFor(() =>
        expect(registered.has("open_product_create")).toBe(true)
      )
      expect(registered.has("get_customer_analytics")).toBe(true)
      expect(registered.has("set_voltage_admin_inventory")).toBe(false)
      expect(registered.has("apply_product_editor_draft")).toBe(false)
      const stableNavigateStateTool = registered.get("navigate_state")
      const stableCustomerAnalyticsTool = registered.get(
        "get_customer_analytics"
      )
      const before = toolChanges
      const sectionNavigation = await registered
        .get("open_voltage_admin_section")!
        .execute?.({ section: "products" })

      await registered.get("open_product_create")!.execute?.({})
      await waitFor(() =>
        expect(router.state.location.pathname).toBe("/products/add")
      )
      await waitFor(() =>
        expect(registered.has("apply_product_editor_draft")).toBe(true)
      )
      expect(toolChanges).toBeGreaterThan(before)
      expect(registered.get("navigate_state")).toBe(stableNavigateStateTool)
      expect(registered.get("get_customer_analytics")).toBe(
        stableCustomerAnalyticsTool
      )
      expect(sectionNavigation).toMatchObject({
        status: "OK",
        nextToolset: {
          status: "READY",
          route: "/products",
          ready: true,
          revision: expect.any(Number),
        },
      })
    } finally {
      delete (document as Document & { modelContext?: unknown }).modelContext
    }
  })
})
