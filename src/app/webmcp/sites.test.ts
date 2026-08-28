import { describe, expect, it } from "vitest"
import {
  defaultWebMcpSite,
  getSiteProfileByUrl,
  resolveThreadSite,
  webMcpSites,
} from "./sites"

describe("resolveThreadSite", () => {
  it("exposes the market and dashboard demos", () => {
    expect(webMcpSites.map((site) => site.id)).toEqual(["market", "dashboard"])
    expect(defaultWebMcpSite.id).toBe("market")
    expect(getSiteProfileByUrl("/market")?.siteId).toBe("market")
    expect(getSiteProfileByUrl("/dashboard")?.siteId).toBe("dashboard")
  })

  it("keeps a thread's persisted URL when the registry URL has changed", () => {
    const resolved = resolveThreadSite({
      siteId: "market",
      url: "/webmcp-demo/legacy-shop-b",
    })

    expect(resolved?.site.id).toBe("market")
    expect(resolved?.site.url).toBe("/market")
    expect(resolved?.target.url).toBe("/webmcp-demo/legacy-shop-b")
  })

  it("rejects an unknown persisted site thread", () => {
    expect(
      resolveThreadSite({
        siteId: "unknown",
        url: "/unknown",
      })
    ).toBeUndefined()
  })
})
