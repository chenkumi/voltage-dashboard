import { ulid } from "ulid"
import type {
  CachedQueryResult,
  QueryCacheErrorCategory,
  QueryCacheStatus,
  QueryId,
  SqlQueryResult,
} from "./types"

export const MAX_QUERY_CACHE_ENTRIES = 32
export const MAX_QUERY_CACHE_BYTES = 8 * 1024 * 1024

type QueryCacheOptions = {
  maxEntries?: number
  maxTotalBytes?: number
  createId?: () => QueryId
}

type QueryCacheEntry = {
  result: CachedQueryResult
  sizeBytes: number
}

export class QueryCacheError extends Error {
  readonly category: QueryCacheErrorCategory

  constructor(category: QueryCacheErrorCategory, message: string) {
    super(message)
    this.category = category
    this.name = "QueryCacheError"
  }
}

const cloneAndFreezeResult = (result: SqlQueryResult): CachedQueryResult => {
  const columns = result.columns.map((column) => Object.freeze({ ...column }))
  const rows = result.rows.map((row) => Object.freeze({ ...row }))
  return Object.freeze({
    columns: Object.freeze(columns),
    rows: Object.freeze(rows),
    rowCount: result.rowCount,
    truncated: result.truncated,
    executionTimeMs: result.executionTimeMs,
  })
}

const serializedSize = (result: CachedQueryResult) =>
  new TextEncoder().encode(JSON.stringify(result)).byteLength

export class QueryResultCache {
  private readonly entries = new Map<QueryId, QueryCacheEntry>()
  private readonly maxEntries: number
  private readonly maxTotalBytes: number
  private readonly createId: () => QueryId
  private totalBytes = 0
  private disposed = false
  private lastRejection: QueryCacheErrorCategory | null = null

  constructor(options: QueryCacheOptions = {}) {
    this.maxEntries = options.maxEntries ?? MAX_QUERY_CACHE_ENTRIES
    this.maxTotalBytes = options.maxTotalBytes ?? MAX_QUERY_CACHE_BYTES
    this.createId = options.createId ?? ulid
  }

  add(result: SqlQueryResult): QueryId {
    this.assertActive()
    const cachedResult = cloneAndFreezeResult(result)
    const sizeBytes = serializedSize(cachedResult)
    if (sizeBytes > this.maxTotalBytes) {
      this.reject(
        "QUERY_CACHE_ENTRY_TOO_LARGE",
        "The query result is too large to cache."
      )
    }
    if (
      this.entries.size >= this.maxEntries ||
      this.totalBytes + sizeBytes > this.maxTotalBytes
    ) {
      this.reject(
        "QUERY_CACHE_LIMIT_EXCEEDED",
        "The query result cache limit has been reached."
      )
    }

    const queryId = this.createUniqueId()
    this.entries.set(queryId, { result: cachedResult, sizeBytes })
    this.totalBytes += sizeBytes
    return queryId
  }

  get(queryId: QueryId): CachedQueryResult {
    this.assertActive()
    const entry = this.entries.get(queryId)
    if (!entry) {
      throw new QueryCacheError(
        "QUERY_CACHE_NOT_FOUND",
        "The query result is not available in this workspace."
      )
    }
    return entry.result
  }

  getStatus(): QueryCacheStatus {
    return {
      state: this.disposed ? "disposed" : "active",
      entryCount: this.entries.size,
      totalBytes: this.totalBytes,
      maxEntries: this.maxEntries,
      maxTotalBytes: this.maxTotalBytes,
      limitReached:
        this.entries.size >= this.maxEntries ||
        this.totalBytes >= this.maxTotalBytes ||
        this.lastRejection !== null,
      lastRejection: this.lastRejection,
    }
  }

  dispose() {
    this.entries.clear()
    this.totalBytes = 0
    this.lastRejection = null
    this.disposed = true
  }

  private assertActive() {
    if (this.disposed) {
      throw new QueryCacheError(
        "QUERY_CACHE_DISPOSED",
        "The query result cache is no longer available."
      )
    }
  }

  private createUniqueId() {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const queryId = this.createId()
      if (!this.entries.has(queryId)) return queryId
    }
    this.reject(
      "QUERY_CACHE_LIMIT_EXCEEDED",
      "The query result cache could not allocate an identifier."
    )
  }

  private reject(category: QueryCacheErrorCategory, message: string): never {
    this.lastRejection = category
    throw new QueryCacheError(category, message)
  }
}
