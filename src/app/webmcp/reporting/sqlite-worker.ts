/// <reference lib="webworker" />

import type {
  ReportingWorkerRequest,
  ReportingWorkerResponse,
} from "./types"
import {
  ReportingDatabaseError,
  SqliteReportingDatabase,
} from "./sqlite-database"

declare const self: DedicatedWorkerGlobalScope

let database: SqliteReportingDatabase | null = null

const post = (response: ReportingWorkerResponse) => self.postMessage(response)

const normalizeError = (error: unknown) => ({
  category:
    error instanceof ReportingDatabaseError ? error.category : "SQLITE_ERROR",
  message:
    error instanceof ReportingDatabaseError
      ? error.message
      : "SQLite operation failed.",
})

const initialize = async () => {
  if (database) return
  database = await SqliteReportingDatabase.create()
}

const execute = (request: Extract<ReportingWorkerRequest, { type: "execute" }>) => {
  if (!database) throw new Error("SQLite reporting database is not ready.")

  return database.execute({ sql: request.sql, parameters: request.parameters })
}

self.addEventListener("message", (event: MessageEvent<ReportingWorkerRequest>) => {
  const request = event.data

  void (async () => {
    try {
      if (request.type === "init") {
        await initialize()
        post({ id: request.id, type: "ready" })
        return
      }

      if (request.type === "dispose") {
        database?.close()
        database = null
        post({ id: request.id, type: "disposed" })
        self.close()
        return
      }

      post({ id: request.id, type: "result", result: execute(request) })
    } catch (error) {
      post({ id: request.id, type: "error", error: normalizeError(error) })
    }
  })()
})
