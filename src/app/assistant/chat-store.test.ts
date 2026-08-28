import { beforeEach, describe, expect, it } from "vitest"
import { chatDb } from "@/app/db"
import type { ChatThread } from "@/app/types"
import { siteProfileSeeds } from "@/app/webmcp/sites"
import { initializeSiteProfiles } from "./site-profile-store"
import {
  clearStaleSiteLastThread,
  createAndActivateThread,
  getSiteThread,
} from "./chat-store"

const thread = (id: string, siteId: string, url: string): ChatThread => ({
  id,
  siteId,
  url,
  title: "New Chat",
  createdAt: 1,
  updatedAt: 1,
})

describe("chat persistence", () => {
  beforeEach(async () => {
    await chatDb.delete()
    await chatDb.open()
  })

  it("initializes profiles idempotently", async () => {
    await initializeSiteProfiles()
    await initializeSiteProfiles()

    expect(await chatDb.siteProfiles.count()).toBe(2)
    expect((await chatDb.siteProfiles.toArray()).sort((a, b) => a.siteId.localeCompare(b.siteId))).toEqual(
      [...siteProfileSeeds].sort((a, b) => a.siteId.localeCompare(b.siteId))
    )
  })

  it("atomically creates a thread and activates its site mapping", async () => {
    const created = await createAndActivateThread(
      thread("market-thread", "market", "/market")
    )

    expect(created.id).toBe("market-thread")
    expect(await chatDb.threads.get("market-thread")).toEqual(created)
    expect(await chatDb.siteLastThreads.get("market")).toMatchObject({
      siteId: "market",
      threadId: "market-thread",
    })
  })

  it("keeps site mappings isolated and reads stale mappings without writing", async () => {
    await createAndActivateThread(thread("market-thread", "market", "/market"))
    await createAndActivateThread(
      thread("dashboard-thread", "dashboard", "/dashboard")
    )

    await chatDb.siteLastThreads.put({
      siteId: "market",
      threadId: "missing-thread",
      updatedAt: 2,
    })

    const stale = await getSiteThread("market")
    expect(stale.thread).toBeUndefined()
    expect(stale.lastThread?.threadId).toBe("missing-thread")
    expect(await chatDb.siteLastThreads.get("dashboard")).toMatchObject({
      threadId: "dashboard-thread",
    })

    await clearStaleSiteLastThread("market", stale.lastThread!)
    expect(await chatDb.siteLastThreads.get("market")).toBeUndefined()
    expect(await getSiteThread("dashboard")).toMatchObject({
      thread: expect.objectContaining({ id: "dashboard-thread" }),
    })
  })

  it("uses the profile URL as the new thread target snapshot", async () => {
    const created = await createAndActivateThread(
      thread(
        "snapshot-thread",
        siteProfileSeeds[0]!.siteId,
        siteProfileSeeds[0]!.url
      )
    )

    expect(created.url).toBe("/market")
  })
})
