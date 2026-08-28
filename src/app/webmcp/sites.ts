import type { SiteProfile, ThreadSiteTarget } from "@/app/types"
import type { WebMcpSite } from "./types"

export const siteProfileSeeds: SiteProfile[] = [
  {
    siteId: "market",
    name: "Voltage Market",
    url: "/market",
  },
  {
    siteId: "dashboard",
    name: "Voltage Dashboard",
    url: "/dashboard",
  },
]

export const webMcpSites: WebMcpSite[] = siteProfileSeeds.map((profile) => ({
  id: profile.siteId,
  name: profile.name,
  url: profile.url,
}))

export const defaultWebMcpSite = webMcpSites[0]!

export const getSiteProfileByUrl = (url: string) =>
  siteProfileSeeds.find((profile) => profile.url === url)

export const getSiteProfile = (siteId: string) =>
  siteProfileSeeds.find((profile) => profile.siteId === siteId)

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
