import { beforeEach, describe, expect, it, vi } from "vitest"
import type { UIMessage } from "ai"
import { chatDb } from "@/app/db"
import type { ChatThread } from "@/app/types"
import { siteProfileSeeds } from "@/app/webmcp/sites"
import {
  createThreadTargetFromProfile,
  getSiteProfileByUrl,
  initializeSiteProfiles,
} from "./site-profile-store"
import {
  clearStaleSiteLastThread,
  createAndActivateThread,
  getSiteThread,
  saveUserMessage,
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

  it("rolls back the thread when activating its site mapping fails", async () => {
    const put = vi
      .spyOn(chatDb.siteLastThreads, "put")
      .mockRejectedValueOnce(new Error("mapping write failed"))

    await expect(
      createAndActivateThread(thread("rollback-thread", "market", "/market"))
    ).rejects.toThrow("mapping write failed")
    expect(await chatDb.threads.get("rollback-thread")).toBeUndefined()
    put.mockRestore()
  })

  it("does not overwrite a thread target owned by another site", async () => {
    await createAndActivateThread(thread("shared-id", "market", "/market"))

    await expect(
      createAndActivateThread(thread("shared-id", "dashboard", "/dashboard"))
    ).rejects.toThrow("another site target")
    expect(await chatDb.threads.get("shared-id")).toMatchObject({
      siteId: "market",
      url: "/market",
    })
  })

  it("does not overwrite a thread when its site target URL changes", async () => {
    await createAndActivateThread(thread("url-collision", "market", "/market"))

    await expect(
      createAndActivateThread(
        thread("url-collision", "market", "/market-renamed")
      )
    ).rejects.toThrow("another site target")
    expect(await chatDb.threads.get("url-collision")).toMatchObject({
      siteId: "market",
      url: "/market",
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
    expect(await chatDb.siteLastThreads.get("market")).toEqual(stale.lastThread)
    expect(await chatDb.siteLastThreads.get("dashboard")).toMatchObject({
      threadId: "dashboard-thread",
    })

    await clearStaleSiteLastThread("market", stale.lastThread!)
    expect(await chatDb.siteLastThreads.get("market")).toBeUndefined()
    expect(await getSiteThread("dashboard")).toMatchObject({
      thread: expect.objectContaining({ id: "dashboard-thread" }),
    })
  })

  it("treats a mapping to another site's thread as stale", async () => {
    await createAndActivateThread(
      thread("dashboard-thread", "dashboard", "/dashboard")
    )
    await chatDb.siteLastThreads.put({
      siteId: "market",
      threadId: "dashboard-thread",
      updatedAt: 2,
    })

    const stale = await getSiteThread("market")
    expect(stale.thread).toBeUndefined()
    expect(await chatDb.siteLastThreads.get("market")).toEqual(stale.lastThread)
  })

  it("updates only the owning site's active mapping when saving a message", async () => {
    await createAndActivateThread(thread("market-thread", "market", "/market"))
    await createAndActivateThread(
      thread("dashboard-thread", "dashboard", "/dashboard")
    )
    const message: UIMessage = {
      id: "user-message",
      role: "user",
      parts: [{ type: "text", text: "Hello" }],
    }

    await saveUserMessage("market-thread", message)

    expect(await chatDb.messages.get("user-message")).toMatchObject({
      threadId: "market-thread",
    })
    expect(await chatDb.siteLastThreads.get("market")).toMatchObject({
      threadId: "market-thread",
    })
    expect(await chatDb.siteLastThreads.get("dashboard")).toMatchObject({
      threadId: "dashboard-thread",
    })
  })

  it("uses the profile URL as the new thread target snapshot", async () => {
    await initializeSiteProfiles()
    const profile = await getSiteProfileByUrl("/market")
    expect(profile).toEqual(siteProfileSeeds[0])

    const target = createThreadTargetFromProfile(profile!)
    expect(target).toEqual({ siteId: "market", url: "/market" })
  })
})
