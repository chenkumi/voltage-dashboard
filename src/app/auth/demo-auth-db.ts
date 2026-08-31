import { Dexie, type EntityTable } from "dexie"

export const DEMO_AUTH_DATABASE_NAME = "voltage-demo-auth-v1"
export const DEMO_AUTH_SESSION_ID = "current"

export type DemoAuthSession = {
  id: typeof DEMO_AUTH_SESSION_ID
  username: "guest"
  signedInAt: string
}

export const demoAuthDb = new Dexie(DEMO_AUTH_DATABASE_NAME) as Dexie & {
  sessions: EntityTable<DemoAuthSession, "id">
}

demoAuthDb.version(1).stores({
  sessions: "id, username, signedInAt",
})
