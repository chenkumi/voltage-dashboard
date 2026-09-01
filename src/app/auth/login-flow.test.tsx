// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createMemoryRouter, RouterProvider } from "react-router-dom"
import App from "../../App"
import { DemoAuthProvider, useDemoAuth } from "./demo-auth"
import { demoAuthDb, DEMO_AUTH_SESSION_ID } from "./demo-auth-db"
import type { WebMcpTestProvider } from "../webmcp/types"

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
    __webmcpTestProvider?: WebMcpTestProvider
  }

afterEach(() => cleanup())

describe("展示登入流程", () => {
  it("向業務功能提供目前登入帳號識別", async () => {
    await demoAuthDb.sessions.put({
      id: DEMO_AUTH_SESSION_ID,
      username: "guest",
      signedInAt: "2026-08-31T08:00:00.000Z",
    })
    const Probe = () => {
      const { currentUserId } = useDemoAuth()
      return <span>{currentUserId ?? "none"}</span>
    }

    render(
      <DemoAuthProvider>
        <Probe />
      </DemoAuthProvider>
    )

    expect(await screen.findByText("guest")).toBeTruthy()
  })

  it("未登入時僅暴露登入說明的 WebMCP 工具", async () => {
    await demoAuthDb.sessions.delete(DEMO_AUTH_SESSION_ID)
    const router = createMemoryRouter([{ path: "*", element: <App /> }], {
      initialEntries: ["/products"],
    })

    render(<RouterProvider router={router} />)

    expect(
      await screen.findByRole("heading", { name: "登入營運後台" })
    ).toBeTruthy()
    expect(router.state.location.pathname).toBe("/login")
    await waitFor(() =>
      expect(webMcpWindow().__webmcpTestProvider?.getTools()).toHaveLength(1)
    )
    const provider = webMcpWindow().__webmcpTestProvider!
    expect(provider.getTools().map((tool) => tool.name)).toEqual([
      "agent_instructions",
    ])
    await expect(
      provider.executeTool(provider.getTools()[0], {})
    ).resolves.toMatchObject({
      text: expect.stringMatching(/尚未登入[\s\S]*登入/),
    })
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

    await waitFor(() => expect(screen.getByTitle("Sign out")).toBeTruthy())

    await user.click(screen.getByTitle("Sign out"))
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"))
    await waitFor(() =>
      expect(
        webMcpWindow()
          .__webmcpTestProvider?.getTools()
          .map((tool) => tool.name)
      ).toEqual(["agent_instructions"])
    )
  })
})
