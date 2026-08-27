export type SqlScalar = string | number | boolean | null

export type SqlQueryInput = {
  sql: string
  parameters?: SqlScalar[]
}

export type SqlColumn = {
  name: string
  type: "string" | "number" | "boolean" | "null"
}

export type SqlQueryResult = {
  columns: SqlColumn[]
  rows: Array<Record<string, SqlScalar>>
  rowCount: number
  truncated: boolean
  executionTimeMs: number
}

export type QueryId = string

export type CachedQueryResult = Readonly<SqlQueryResult> & {
  readonly columns: readonly Readonly<SqlColumn>[]
  readonly rows: readonly Readonly<Record<string, SqlScalar>>[]
}

export type SqlQueryResultWithId = SqlQueryResult & {
  queryId: QueryId
}

export type QueryCacheState = "active" | "disposed"

export type QueryCacheStatus = {
  state: QueryCacheState
  entryCount: number
  totalBytes: number
  maxEntries: number
  maxTotalBytes: number
}

export type QueryCacheErrorCategory =
  | "QUERY_CACHE_DISPOSED"
  | "QUERY_CACHE_ENTRY_TOO_LARGE"
  | "QUERY_CACHE_LIMIT_EXCEEDED"
  | "QUERY_CACHE_NOT_FOUND"

export type ReportingWorkerRequest =
  | { id: string; type: "init" }
  | ({ id: string; type: "execute" } & SqlQueryInput)
  | { id: string; type: "dispose" }

export type ReportingWorkerResponse =
  | { id: string; type: "ready" }
  | { id: string; type: "result"; result: SqlQueryResult }
  | { id: string; type: "disposed" }
  | {
      id: string
      type: "error"
      error: { category: string; message: string }
    }

export interface ReportingWorkerPort {
  postMessage(message: ReportingWorkerRequest): void
  terminate(): void
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<ReportingWorkerResponse>) => void
  ): void
  addEventListener(type: "error", listener: (event: ErrorEvent) => void): void
  removeEventListener(
    type: "message",
    listener: (event: MessageEvent<ReportingWorkerResponse>) => void
  ): void
  removeEventListener(
    type: "error",
    listener: (event: ErrorEvent) => void
  ): void
}
