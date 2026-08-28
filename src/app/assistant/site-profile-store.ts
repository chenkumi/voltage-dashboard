import { chatDb } from "@/app/db"
import type { SiteProfile, ThreadSiteTarget } from "@/app/types"
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

export const getMostRecentlyActiveSiteProfile = async () => {
  const lastThreads = await chatDb.siteLastThreads
    .orderBy("updatedAt")
    .reverse()
    .toArray()

  for (const lastThread of lastThreads) {
    const thread = await chatDb.threads.get(lastThread.threadId)
    if (!thread || thread.siteId !== lastThread.siteId) continue

    const profile = await chatDb.siteProfiles.get(lastThread.siteId)
    if (profile) return profile
  }

  return undefined
}

export const createThreadTargetFromProfile = (
  profile: SiteProfile
): ThreadSiteTarget => ({
  siteId: profile.siteId,
  url: profile.url,
})
