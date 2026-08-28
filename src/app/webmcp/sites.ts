import type { ThreadSiteTarget } from "@/app/types"
import type { WebMcpSite } from "./types"

export const webMcpSites: WebMcpSite[] = [
  {
    id: "shop-b",
    name: "Voltage Market",
    url: "/webmcp-demo/shop-b",
  },
  {
    id: "shop-c",
    name: "Voltage Dashboard",
    url: "/webmcp-demo/shop-c",
  },
]

export const defaultWebMcpSite = webMcpSites[0]

export const getWebMcpSite = (siteId: string) => {
  return webMcpSites.find((site) => site.id === siteId)
}

export const createThreadSiteTarget = (site: WebMcpSite): ThreadSiteTarget => {
  return { siteId: site.id, url: site.url }
}

export const resolveThreadSite = (target: ThreadSiteTarget) => {
  const site = getWebMcpSite(target.siteId)
  if (!site) return undefined

  return { site, target: { ...target } }
}
