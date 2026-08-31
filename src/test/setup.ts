import "fake-indexeddb/auto"
import { configure } from "@testing-library/react"
import { beforeEach } from "vitest"
import { demoAuthDb, DEMO_AUTH_SESSION_ID } from "@/app/auth/demo-auth-db"

configure({ asyncUtilTimeout: 4_000 })

beforeEach(async () => {
  if (typeof window === "undefined") return
  await demoAuthDb.sessions.put({
    id: DEMO_AUTH_SESSION_ID,
    username: "guest",
    signedInAt: "2026-08-31T00:00:00.000Z",
  })
})
