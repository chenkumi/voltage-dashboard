import type { WebMcpSite } from "./types"

export const webMcpSites: WebMcpSite[] = [
  {
    id: "shop-a",
    name: "Cinder Studio",
    url: "/webmcp-demo/shop-a",
  },
  {
    id: "shop-b",
    name: "Field Market",
    url: "/webmcp-demo/shop-b",
  },
]

export const defaultWebMcpSite = webMcpSites[0]

export const getWebMcpSite = (siteId: string) => {
  return webMcpSites.find((site) => site.id === siteId)
}
