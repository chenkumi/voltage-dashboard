import { describe, expect, it, vi } from "vitest"
import { createDummyJsonProductSeed } from "../products/product-seed"
import { createReportingDataSnapshot } from "./reporting-data"
import {
  SqliteReportingRuntime,
  SqliteReportingRuntimeError,
} from "./sqlite-runtime"
import type {
  ReportingWorkerPort,
  ReportingWorkerRequest,
  ReportingWorkerResponse,
} from "./types"

class FakeWorker implements ReportingWorkerPort {
  requests: ReportingWorkerRequest[] = []
  terminateCalls = 0
  private messageListeners = new Set<
    (event: MessageEvent<ReportingWorkerResponse>) => void
  >()
  private errorListeners = new Set<(event: ErrorEvent) => void>()

  postMessage(message: ReportingWorkerRequest) {
    this.requests.push(message)
  }

  terminate() {
    this.terminateCalls += 1
  }

  addEventListener(
    type: "message" | "error",
    listener:
      | ((event: MessageEvent<ReportingWorkerResponse>) => void)
      | ((event: ErrorEvent) => void)
  ) {
    if (type === "message")
      this.messageListeners.add(
        listener as (event: MessageEvent<ReportingWorkerResponse>) => void
      )
    else this.errorListeners.add(listener as (event: ErrorEvent) => void)
  }

  removeEventListener(
    type: "message" | "error",
    listener:
      | ((event: MessageEvent<ReportingWorkerResponse>) => void)
      | ((event: ErrorEvent) => void)
  ) {
    if (type === "message")
      this.messageListeners.delete(
        listener as (event: MessageEvent<ReportingWorkerResponse>) => void
      )
    else this.errorListeners.delete(listener as (event: ErrorEvent) => void)
  }

  respond(response: ReportingWorkerResponse) {
    const event = { data: response } as MessageEvent<ReportingWorkerResponse>
    for (const listener of this.messageListeners) listener(event)
  }

  fail(message: string) {
    const event = { message } as ErrorEvent
    for (const listener of this.errorListeners) listener(event)
  }
}

const nextRequest = (
  worker: FakeWorker,
  type: ReportingWorkerRequest["type"]
) => {
  const request = worker.requests.find((item) => item.type === type)
  if (!request) throw new Error(`Missing ${type} request.`)
  return request
}

describe("SqliteReportingRuntime", () => {
  it("sends the current product projection in the worker init payload", async () => {
    const worker = new FakeWorker()
    const runtime = new SqliteReportingRuntime(() => worker)
    const snapshot = createReportingDataSnapshot(
      createDummyJsonProductSeed().slice(0, 1)
    )
    const initialized = runtime.initialize(snapshot)
    const init = nextRequest(worker, "init")

    expect(init).toMatchObject({ type: "init", snapshot })
    worker.respond({ id: init.id, type: "ready" })
    await initialized
    await runtime.dispose()
  })

  it("initializes once and correlates concurrent query responses", async () => {
    const worker = new FakeWorker()
    const runtime = new SqliteReportingRuntime(() => worker)
    const first = runtime.execute({ sql: "SELECT 1 AS value" })
    const second = runtime.execute({ sql: "SELECT 2 AS value" })
    const init = nextRequest(worker, "init")

    worker.respond({ id: init.id, type: "ready" })
    await vi.waitFor(() =>
      expect(
        worker.requests.filter((item) => item.type === "execute")
      ).toHaveLength(2)
    )
    const queries = worker.requests.filter((item) => item.type === "execute")
    const result = (value: number) => ({
      columns: [{ name: "value", type: "number" as const }],
      rows: [{ value }],
      rowCount: 1,
      truncated: false,
      executionTimeMs: 1,
    })
    worker.respond({ id: queries[1].id, type: "result", result: result(2) })
    worker.respond({ id: queries[0].id, type: "result", result: result(1) })

    await expect(first).resolves.toEqual(result(1))
    await expect(second).resolves.toEqual(result(2))
    expect(worker.requests.filter((item) => item.type === "init")).toHaveLength(
      1
    )
  })

  it("rejects an aborted query without resolving a later worker response", async () => {
    const worker = new FakeWorker()
    const runtime = new SqliteReportingRuntime(() => worker)
    const initialized = runtime.initialize()
    const init = nextRequest(worker, "init")
    worker.respond({ id: init.id, type: "ready" })
    await initialized

    const controller = new AbortController()
    const query = runtime.execute({ sql: "SELECT 1" }, controller.signal)
    await vi.waitFor(() =>
      expect(worker.requests.some((item) => item.type === "execute")).toBe(true)
    )
    controller.abort()

    await expect(query).rejects.toMatchObject({ name: "AbortError" })
  })

  it("rejects an execute aborted while initialization is still pending", async () => {
    const worker = new FakeWorker()
    const runtime = new SqliteReportingRuntime(() => worker)
    const controller = new AbortController()
    const query = runtime.execute({ sql: "SELECT 1" }, controller.signal)

    controller.abort()

    await expect(query).rejects.toMatchObject({ name: "AbortError" })
    expect(
      worker.requests.filter((item) => item.type === "execute")
    ).toHaveLength(0)
  })

  it("rejects pending work and terminates exactly once on dispose", async () => {
    const worker = new FakeWorker()
    const runtime = new SqliteReportingRuntime(() => worker)
    const initialized = runtime.initialize()
    const init = nextRequest(worker, "init")
    worker.respond({ id: init.id, type: "ready" })
    await initialized
    const pendingQuery = runtime.execute({ sql: "SELECT 1" })
    const disposing = runtime.dispose()
    const concurrentDispose = runtime.dispose()

    await Promise.all([disposing, concurrentDispose])
    await expect(pendingQuery).rejects.toThrow("disposed")
    await runtime.dispose()
    expect(
      worker.requests.filter((item) => item.type === "dispose")
    ).toHaveLength(1)
    expect(worker.terminateCalls).toBe(1)
    await expect(runtime.execute({ sql: "SELECT 2" })).rejects.toThrow(
      "disposed"
    )
  })

  it("normalizes worker initialization failures without exposing internals", async () => {
    const worker = new FakeWorker()
    const runtime = new SqliteReportingRuntime(() => worker)
    const initialized = runtime.initialize()
    worker.fail("WASM asset failed to load")

    await expect(initialized).rejects.toEqual(
      new SqliteReportingRuntimeError(
        "SQLITE_WORKER_ERROR",
        "SQLite reporting worker failed."
      )
    )
    await runtime.dispose()
    expect(worker.terminateCalls).toBe(1)
    await expect(runtime.execute({ sql: "SELECT 1" })).rejects.toEqual(
      new SqliteReportingRuntimeError(
        "SQLITE_WORKER_ERROR",
        "SQLite reporting worker failed."
      )
    )
  })

  it("preserves safe worker query error categories", async () => {
    const worker = new FakeWorker()
    const runtime = new SqliteReportingRuntime(() => worker)
    const query = runtime.execute({ sql: "DELETE FROM agent_inventory" })
    const init = nextRequest(worker, "init")
    worker.respond({ id: init.id, type: "ready" })
    await vi.waitFor(() =>
      expect(worker.requests.some((item) => item.type === "execute")).toBe(true)
    )
    const execute = nextRequest(worker, "execute")
    worker.respond({
      id: execute.id,
      type: "error",
      error: {
        category: "SQL_POLICY_ERROR",
        message: "Only SELECT or WITH queries are allowed.",
      },
    })

    await expect(query).rejects.toEqual(
      new SqliteReportingRuntimeError(
        "SQL_POLICY_ERROR",
        "Only SELECT or WITH queries are allowed."
      )
    )
  })
})
