import { ulid } from "ulid"
import type {
  ReportingWorkerPort,
  ReportingWorkerRequest,
  ReportingWorkerResponse,
  SqlQueryInput,
  SqlQueryResult,
} from "./types"

type PendingRequest = {
  resolve: (response: ReportingWorkerResponse) => void
  reject: (error: Error) => void
  removeAbortListener?: () => void
}

type WorkerFactory = () => ReportingWorkerPort

export class SqliteReportingRuntimeError extends Error {
  readonly category: string

  constructor(category: string, message: string) {
    super(message)
    this.category = category
    this.name = "SqliteReportingRuntimeError"
  }
}

const createWorker: WorkerFactory = () =>
  new Worker(new URL("./sqlite-worker.ts", import.meta.url), {
    type: "module",
  })

const createAbortError = () => {
  const error = new Error("SQLite reporting request was aborted.")
  error.name = "AbortError"
  return error
}

export class SqliteReportingRuntime {
  private readonly worker: ReportingWorkerPort
  private readonly pending = new Map<string, PendingRequest>()
  private readyPromise: Promise<void> | null = null
  private disposePromise: Promise<void> | null = null
  private failure: Error | null = null
  private disposed = false
  private terminated = false

  constructor(workerFactory: WorkerFactory = createWorker) {
    this.worker = workerFactory()
    this.worker.addEventListener("message", this.handleMessage)
    this.worker.addEventListener("error", this.handleError)
  }

  initialize() {
    if (this.failure) return Promise.reject(this.failure)
    if (this.disposed)
      return Promise.reject(new Error("SQLite reporting runtime is disposed."))
    if (this.readyPromise) return this.readyPromise

    this.readyPromise = this.request({ id: ulid(), type: "init" }).then(
      (response) => {
        if (response.type !== "ready")
          throw new Error(
            "SQLite reporting runtime returned an invalid init response."
          )
      }
    )
    return this.readyPromise
  }

  async execute(input: SqlQueryInput, signal?: AbortSignal) {
    await this.waitFor(this.initialize(), signal)
    const response = await this.request(
      { id: ulid(), type: "execute", ...input },
      signal
    )
    if (response.type !== "result")
      throw new Error(
        "SQLite reporting runtime returned an invalid query response."
      )
    return response.result satisfies SqlQueryResult
  }

  dispose() {
    if (this.disposePromise) return this.disposePromise
    this.disposed = true

    this.disposePromise = Promise.resolve().then(() => {
      if (!this.failure)
        this.worker.postMessage({ id: ulid(), type: "dispose" })
      this.rejectPending(new Error("SQLite reporting runtime was disposed."))
      this.worker.removeEventListener("message", this.handleMessage)
      this.worker.removeEventListener("error", this.handleError)
      this.terminateWorker()
    })
    return this.disposePromise
  }

  private request(request: ReportingWorkerRequest, signal?: AbortSignal) {
    if (this.disposed && request.type !== "dispose")
      return Promise.reject(new Error("SQLite reporting runtime is disposed."))
    if (this.failure) return Promise.reject(this.failure)
    if (signal?.aborted) return Promise.reject(createAbortError())

    return new Promise<ReportingWorkerResponse>((resolve, reject) => {
      const pending: PendingRequest = { resolve, reject }
      if (signal) {
        const abort = () => {
          this.pending.delete(request.id)
          reject(createAbortError())
        }
        signal.addEventListener("abort", abort, { once: true })
        pending.removeAbortListener = () =>
          signal.removeEventListener("abort", abort)
      }
      this.pending.set(request.id, pending)
      this.worker.postMessage(request)
    })
  }

  private handleMessage = (event: MessageEvent<ReportingWorkerResponse>) => {
    const response = event.data
    const pending = this.pending.get(response.id)
    if (!pending) return

    this.pending.delete(response.id)
    pending.removeAbortListener?.()
    if (response.type === "error") {
      pending.reject(
        new SqliteReportingRuntimeError(
          response.error.category,
          response.error.message
        )
      )
      return
    }
    pending.resolve(response)
  }

  private handleError = (event: ErrorEvent) => {
    event.preventDefault?.()
    this.failure = new SqliteReportingRuntimeError(
      "SQLITE_WORKER_ERROR",
      "SQLite reporting worker failed."
    )
    this.rejectPending(this.failure)
    this.worker.removeEventListener("message", this.handleMessage)
    this.worker.removeEventListener("error", this.handleError)
    this.terminateWorker()
  }

  private rejectPending(error: Error) {
    for (const pending of this.pending.values()) {
      pending.removeAbortListener?.()
      pending.reject(error)
    }
    this.pending.clear()
  }

  private waitFor<T>(promise: Promise<T>, signal?: AbortSignal) {
    if (!signal) return promise
    if (signal.aborted) return Promise.reject<T>(createAbortError())

    return new Promise<T>((resolve, reject) => {
      const abort = () => reject(createAbortError())
      signal.addEventListener("abort", abort, { once: true })
      promise
        .then(resolve, reject)
        .finally(() => signal.removeEventListener("abort", abort))
    })
  }

  private terminateWorker() {
    if (this.terminated) return
    this.terminated = true
    this.worker.terminate()
  }
}
