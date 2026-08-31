// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createMemoryRouter, RouterProvider } from "react-router-dom"
import App from "../../App"
import { demoAuthDb, DEMO_AUTH_SESSION_ID } from "./demo-auth-db"

vi.mock("../webmcp/reporting/reporting-tools", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../webmcp/reporting/reporting-tools")>()

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

const webMcpWindow = () =>
  window as typeof window & {
    __webmcpTestProvider?: unknown
  }

afterEach(() => cleanup())

describe("展示登入流程", () => {
  it("未登入時僅顯示登入頁，且不掛載 WebMCP tools", async () => {
    await demoAuthDb.sessions.delete(DEMO_AUTH_SESSION_ID)
    const router = createMemoryRouter([{ path: "*", element: <App /> }], {
      initialEntries: ["/products"],
    })

    render(<RouterProvider router={router} />)

    expect(
      await screen.findByRole("heading", { name: "登入營運後台" })
    ).toBeTruthy()
    expect(router.state.location.pathname).toBe("/login")
    expect(webMcpWindow().__webmcpTestProvider).toBeUndefined()
  })

  it("拒絕錯誤憑證，並在成功登入後啟用後台與 WebMCP", async () => {
    await demoAuthDb.sessions.delete(DEMO_AUTH_SESSION_ID)
    const user = userEvent.setup()
    const router = createMemoryRouter([{ path: "*", element: <App /> }], {
      initialEntries: ["/login"],
    })

    render(<RouterProvider router={router} />)

    await user.clear(screen.getByLabelText("帳號"))
    await user.type(screen.getByLabelText("帳號"), "invalid")
    await user.click(screen.getByRole("button", { name: "登入 Voltage" }))
    expect(
      screen.getByText("帳號或密碼不正確，請使用展示帳號登入。")
    ).toBeTruthy()

    await user.clear(screen.getByLabelText("帳號"))
    await user.type(screen.getByLabelText("帳號"), "guest")
    await user.click(screen.getByRole("button", { name: "登入 Voltage" }))

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/dashboard")
    )
    await waitFor(() =>
      expect(webMcpWindow().__webmcpTestProvider).toBeDefined()
    )

    await user.click(screen.getByTitle("Sign out"))
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"))
    await waitFor(() =>
      expect(webMcpWindow().__webmcpTestProvider).toBeUndefined()
    )
  })
})
