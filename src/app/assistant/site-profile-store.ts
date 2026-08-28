import { chatDb } from "@/app/db"
import type { SiteProfile } from "@/app/types"
import { siteProfileSeeds } from "@/app/webmcp/sites"

export const initializeSiteProfiles = async () => {
  await chatDb.transaction("rw", chatDb.siteProfiles, async () => {
    await chatDb.siteProfiles.bulkPut(siteProfileSeeds)
  })
}

export const getSiteProfileByUrl = async (url: string) => {
  return chatDb.siteProfiles.where("url").equals(url).first()
}

export const getSiteProfileById = async (siteId: string) => {
  return chatDb.siteProfiles.get(siteId)
}

export const getSiteProfiles = async (): Promise<SiteProfile[]> => {
  return chatDb.siteProfiles.toArray()
}
