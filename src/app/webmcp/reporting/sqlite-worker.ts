/// <reference lib="webworker" />

import sqlite3InitModule from "@sqlite.org/sqlite-wasm"
import type {
  ReportingWorkerRequest,
  ReportingWorkerResponse,
  SqlColumn,
  SqlScalar,
} from "./types"

declare const self: DedicatedWorkerGlobalScope

let database: InstanceType<
  Awaited<ReturnType<typeof sqlite3InitModule>>["oo1"]["DB"]
> | null = null

const post = (response: ReportingWorkerResponse) => self.postMessage(response)

const normalizeError = (error: unknown) => ({
  category: "SQLITE_ERROR",
  message: error instanceof Error ? error.message : "SQLite operation failed.",
})

const normalizeValue = (value: unknown): SqlScalar => {
  if (value === null) return null
  if (typeof value === "string" || typeof value === "number") return value
  if (typeof value === "bigint") return value.toString()
  if (typeof value === "boolean") return value
  if (value instanceof Uint8Array)
    return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("")
  return String(value)
}

const columnType = (value: SqlScalar): SqlColumn["type"] => {
  if (value === null) return "null"
  if (typeof value === "number") return "number"
  if (typeof value === "boolean") return "boolean"
  return "string"
}

const initialize = async () => {
  if (database) return
  const sqlite3 = await sqlite3InitModule()
  database = new sqlite3.oo1.DB(":memory:", "c")
}

const execute = (request: Extract<ReportingWorkerRequest, { type: "execute" }>) => {
  if (!database) throw new Error("SQLite reporting database is not ready.")

  const startedAt = performance.now()
  const rows = database.exec({
    sql: request.sql,
    bind: request.parameters,
    rowMode: "object",
    returnValue: "resultRows",
  }) as Array<Record<string, unknown>>
  const normalizedRows = rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, normalizeValue(value)])
    )
  )
  const firstRow = normalizedRows[0]
  const columns = firstRow
    ? Object.entries(firstRow).map(([name, value]) => ({
        name,
        type: columnType(value),
      }))
    : []

  return {
    columns,
    rows: normalizedRows,
    rowCount: normalizedRows.length,
    truncated: false,
    executionTimeMs: Math.max(0, performance.now() - startedAt),
  }
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
