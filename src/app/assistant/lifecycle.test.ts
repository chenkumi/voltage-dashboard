import { describe, expect, it } from "vitest"
import {
  resolveAssistantSiteUrl,
  shouldReportAssistantLifecycleError,
  shouldCreateAssistantThread,
} from "./lifecycle"

describe("assistant lifecycle decisions", () => {
  it("waits for the latest profile query before creating the default thread", () => {
    expect(
      shouldCreateAssistantThread({
        activeSiteUrl: "/market",
        isCreating: false,
        latestProfileLoaded: false,
        latestProfileUrl: undefined,
        hasThread: false,
      })
    ).toBe(false)
  })

  it("restores the latest active site and honors a manual selection", () => {
    expect(resolveAssistantSiteUrl(null, "/dashboard", "/market")).toBe(
      "/dashboard"
    )
    expect(resolveAssistantSiteUrl("/market", "/dashboard", "/dashboard")).toBe(
      "/market"
    )
  })

  it("creates only when the loaded latest profile matches the active URL", () => {
    expect(
      shouldCreateAssistantThread({
        activeSiteUrl: "/market",
        isCreating: false,
        latestProfileLoaded: true,
        latestProfileUrl: "/dashboard",
        hasThread: false,
      })
    ).toBe(false)
    expect(
      shouldCreateAssistantThread({
        activeSiteUrl: "/dashboard",
        isCreating: false,
        latestProfileLoaded: true,
        latestProfileUrl: "/dashboard",
        hasThread: false,
      })
    ).toBe(true)
  })

  it("reports lifecycle errors only for the current request", () => {
    expect(shouldReportAssistantLifecycleError(1, 2)).toBe(false)
    expect(shouldReportAssistantLifecycleError(2, 2)).toBe(true)
  })
})
