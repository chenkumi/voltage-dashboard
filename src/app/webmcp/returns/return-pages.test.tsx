// @vitest-environment jsdom

import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createMemoryRouter, RouterProvider } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import App from "../../../App"
import i18n from "../../../i18n"
import { createCommerceSeed } from "../commerce-data/commerce-seed"

vi.mock("../reporting/reporting-tools", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../reporting/reporting-tools")>()
  class NoopReportingRuntimeController {
    async prepare() {}
    async dispose() {}
    async execute() {
      return { rows: [] }
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

const deleteDatabase = (name: string) =>
  new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
    request.onblocked = () => resolve()
  })

beforeEach(async () => {
  await i18n.changeLanguage("en")
})

afterEach(async () => {
  cleanup()
  await deleteDatabase("webmcp-agent-returns-v1")
})

describe("return pages", () => {
  it("uses the shared desktop and mobile filter contract", async () => {
    const router = createMemoryRouter([{ path: "*", element: <App /> }], {
      initialEntries: ["/returns"],
    })
    const user = userEvent.setup()
    render(<RouterProvider router={router} />)

    expect(await screen.findByText("Active returns")).toBeTruthy()
    expect(
      screen.getByRole("searchbox", { name: "Search returns" })
    ).toBeTruthy()
    for (const name of ["Stage", "Source", "Reason"]) {
      expect(screen.getByRole("combobox", { name })).toBeTruthy()
    }
    expect(screen.getByRole("button", { name: "More filters" })).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Filter returns" }))
    const popover = document.querySelector<HTMLElement>(
      '[data-slot="popover-content"]'
    )
    expect(popover).toBeTruthy()
    for (const name of [
      "Stage",
      "Source",
      "Reason",
      "Return status",
      "Approval status",
      "Sort",
    ]) {
      expect(within(popover!).getByRole("combobox", { name })).toBeTruthy()
    }
    await user.click(within(popover!).getByRole("button", { name: "Cancel" }))
    await user.click(
      screen.getByRole("button", { name: "Select order for return" })
    )
    await waitFor(() => expect(router.state.location.pathname).toBe("/orders"))
  })

  it("creates and submits a return from an eligible order", async () => {
    const commerce = createCommerceSeed()
    const seeded = new Set(
      commerce.orders
        .filter(
          (order) =>
            order.status === "delivered" && order.paymentStatus === "paid"
        )
        .slice(0, 2)
        .map((order) => order.id)
    )
    const order = commerce.orders.find(
      (candidate) =>
        candidate.status === "delivered" &&
        candidate.paymentStatus === "paid" &&
        !seeded.has(candidate.id)
    )!
    const line = commerce.orderLines.find(
      (candidate) => candidate.orderId === order.id
    )!
    const router = createMemoryRouter([{ path: "*", element: <App /> }], {
      initialEntries: [`/returns/add?orderId=${order.id}`],
    })
    const user = userEvent.setup()
    render(<RouterProvider router={router} />)

    expect(await screen.findByText("Return items")).toBeTruthy()
    const quantity = screen.getByRole("spinbutton", {
      name: `Return quantity for ${line.title}`,
    })
    await user.clear(quantity)
    await user.type(quantity, "1")
    await user.click(screen.getByRole("button", { name: "Submit return" }))
    await waitFor(() =>
      expect(router.state.location.pathname).toMatch(/^\/returns\/RMA-/)
    )
    expect(await screen.findByRole("heading", { name: /^RMA-/ })).toBeTruthy()
    expect(document.querySelectorAll("[data-stage]")).toHaveLength(7)
    const currentTaskCard = screen
      .getByText("Current task")
      .closest("[data-slot='card']")
    expect(currentTaskCard).toBeTruthy()
    expect(
      within(currentTaskCard as HTMLElement).getByRole("button", {
        name: "Authorize return",
      })
    ).toBeTruthy()
    expect(document.querySelectorAll("details[open]")).toHaveLength(1)
    await user.click(screen.getByRole("button", { name: "Authorize return" }))
    const packageCount = await screen.findByRole("spinbutton", {
      name: "Package count",
    })
    await user.clear(packageCount)
    await user.type(packageCount, "2")
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Receipt result" }),
      "partial"
    )
    await user.click(screen.getByRole("button", { name: "Record receipt" }))
    expect(
      await screen.findByRole("button", { name: "Start inspection" })
    ).toBeTruthy()
    const logisticsText = screen
      .getAllByText("Logistics")
      .map((element) => element.closest("[data-slot='card']"))
      .find(Boolean)
      ?.textContent?.replace(/\s+/g, " ")
    expect(logisticsText).toContain("Packages received: 2")
    expect(logisticsText).toContain("Receipt result: partial")
  })

  it("offers a route back to eligible orders for an unknown order", async () => {
    const router = createMemoryRouter([{ path: "*", element: <App /> }], {
      initialEntries: ["/returns/add?orderId=VM-UNKNOWN"],
    })
    const user = userEvent.setup()
    render(<RouterProvider router={router} />)

    expect(await screen.findByText("Order was not found.")).toBeTruthy()
    await user.click(
      screen.getByRole("button", { name: "Browse eligible orders" })
    )
    await waitFor(() => expect(router.state.location.pathname).toBe("/orders"))
  })

  it.each([
    ["/returns/add", "Open an eligible order before creating a return."],
    [
      `/returns/add?orderId=${
        createCommerceSeed().orders.find(
          (order) =>
            order.status !== "delivered" || order.paymentStatus !== "paid"
        )!.id
      }`,
      "Only delivered, paid orders can start a return.",
    ],
  ])("offers an Orders exit from %s", async (entry, message) => {
    const router = createMemoryRouter([{ path: "*", element: <App /> }], {
      initialEntries: [entry],
    })
    const user = userEvent.setup()
    render(<RouterProvider router={router} />)

    expect(await screen.findByText(message)).toBeTruthy()
    await user.click(
      screen.getByRole("button", { name: "Browse eligible orders" })
    )
    await waitFor(() => expect(router.state.location.pathname).toBe("/orders"))
  })

  it("localizes timeline actions, actors, and results", async () => {
    await i18n.changeLanguage("zh-TW")
    expect(i18n.t("inspection_completed")).toBe("完成驗貨")
    expect(i18n.t("user")).toBe("使用者")
    expect(i18n.t("refund_ready")).toBe("可進行退款")
    expect(i18n.t("Eligible")).toBe("符合資格")
    expect(i18n.t("Policy decision declined.")).toBe("依政策判定不符合資格。")
    expect(i18n.t("Eligible unopened return within policy window.")).toBe(
      "未拆封商品仍在政策退貨期限內，符合資格。"
    )
    expect(i18n.t("Additional condition evidence is required.")).toBe(
      "需要補充商品狀態證據。"
    )
  })
})
