import { describe, expect, it } from "vitest"
import { defaultWebMcpSite, resolveThreadSite, webMcpSites } from "./sites"

describe("resolveThreadSite", () => {
  it("only exposes Voltage Market and its admin demo", () => {
    expect(webMcpSites.map((site) => site.id)).toEqual(["shop-b", "shop-c"])
    expect(defaultWebMcpSite.id).toBe("shop-b")
  })

  it("keeps a thread's persisted URL when the registry URL has changed", () => {
    const resolved = resolveThreadSite({
      siteId: "shop-b",
      url: "/webmcp-demo/legacy-shop-b",
    })

    expect(resolved?.site.id).toBe("shop-b")
    expect(resolved?.site.url).toBe("/webmcp-demo/shop-b")
    expect(resolved?.target.url).toBe("/webmcp-demo/legacy-shop-b")
  })

  it("rejects a persisted Cinder Studio thread after removal", () => {
    expect(
      resolveThreadSite({
        siteId: "shop-a",
        url: "/webmcp-demo/shop-a",
      })
    ).toBeUndefined()
  })
})
