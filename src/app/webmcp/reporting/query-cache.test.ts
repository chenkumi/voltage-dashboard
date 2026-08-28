import { describe, expect, it } from "vitest"
import {
  MAX_QUERY_CACHE_BYTES,
  MAX_QUERY_CACHE_ENTRIES,
  QueryCacheError,
  QueryResultCache,
} from "./query-cache"
import type { SqlQueryResult } from "./types"

const createResult = (value = "Beauty"): SqlQueryResult => ({
  columns: [{ name: "category", type: "string" }],
  rows: [{ category: value }],
  rowCount: 1,
  truncated: false,
  executionTimeMs: 1,
})

describe("QueryResultCache", () => {
  it("stores a result under a ULID and returns an immutable snapshot", () => {
    const source = createResult()
    const cache = new QueryResultCache()
    const queryId = cache.add(source)
    source.rows[0].category = "Furniture"
    const actual = cache.get(queryId)

    expect(queryId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    expect(actual.rows).toEqual([{ category: "Beauty" }])
    expect(Object.isFrozen(actual)).toBe(true)
    expect(Object.isFrozen(actual.columns)).toBe(true)
    expect(Object.isFrozen(actual.rows[0])).toBe(true)
  })

  it("allows exactly 32 entries and safely refuses the next result", () => {
    const cache = new QueryResultCache()
    for (let index = 0; index < MAX_QUERY_CACHE_ENTRIES; index += 1)
      cache.add(createResult())

    expect(cache.getStatus().entryCount).toBe(32)
    expect(cache.getStatus()).toMatchObject({
      limitReached: true,
      lastRejection: null,
    })
    expect(() => cache.add(createResult())).toThrow(
      new QueryCacheError(
        "QUERY_CACHE_LIMIT_EXCEEDED",
        "The query result cache limit has been reached."
      )
    )
    expect(cache.getStatus().entryCount).toBe(32)
    expect(cache.getStatus().lastRejection).toBe("QUERY_CACHE_LIMIT_EXCEEDED")
  })

  it("enforces the 8 MiB default and distinguishes one oversized entry", () => {
    expect(MAX_QUERY_CACHE_BYTES).toBe(8 * 1024 * 1024)
    const cache = new QueryResultCache({ maxTotalBytes: 128 })

    expect(() => cache.add(createResult("x".repeat(128)))).toThrow(
      new QueryCacheError(
        "QUERY_CACHE_ENTRY_TOO_LARGE",
        "The query result is too large to cache."
      )
    )
    expect(cache.getStatus()).toMatchObject({
      entryCount: 0,
      totalBytes: 0,
      limitReached: true,
      lastRejection: "QUERY_CACHE_ENTRY_TOO_LARGE",
    })
  })

  it("refuses cumulative capacity overflow without evicting prior results", () => {
    const firstId = "01K00000000000000000000000"
    const secondId = "01K00000000000000000000001"
    const ids = [firstId, secondId]
    const cache = new QueryResultCache({
      maxTotalBytes: 260,
      createId: () => ids.shift() ?? secondId,
    })
    cache.add(createResult("Beauty"))

    expect(() => cache.add(createResult("Furniture"))).toThrowError(
      expect.objectContaining({ category: "QUERY_CACHE_LIMIT_EXCEEDED" })
    )
    expect(cache.get(firstId).rows).toEqual([{ category: "Beauty" }])
    expect(cache.getStatus().entryCount).toBe(1)
    expect(cache.getStatus()).toMatchObject({
      limitReached: true,
      lastRejection: "QUERY_CACHE_LIMIT_EXCEEDED",
    })
  })

  it("returns one fixed safe error for an unknown query ID", () => {
    const cache = new QueryResultCache()

    expect(() => cache.get("01K00000000000000000000000")).toThrow(
      new QueryCacheError(
        "QUERY_CACHE_NOT_FOUND",
        "The query result is not available in this workspace."
      )
    )
  })

  it("clears entries on dispose and invalidates every prior query ID", () => {
    const cache = new QueryResultCache()
    const queryId = cache.add(createResult())
    cache.dispose()

    expect(cache.getStatus()).toMatchObject({
      state: "disposed",
      entryCount: 0,
      totalBytes: 0,
      limitReached: false,
      lastRejection: null,
    })
    expect(() => cache.get(queryId)).toThrowError(
      expect.objectContaining({ category: "QUERY_CACHE_DISPOSED" })
    )
  })

  it("keeps identical IDs isolated between iframe-local cache instances", () => {
    const queryId = "01K00000000000000000000000"
    const first = new QueryResultCache({ createId: () => queryId })
    const second = new QueryResultCache({ createId: () => queryId })
    first.add(createResult("Beauty"))
    second.add(createResult("Furniture"))

    expect(first.get(queryId).rows).toEqual([{ category: "Beauty" }])
    expect(second.get(queryId).rows).toEqual([{ category: "Furniture" }])
  })

  it("exports selected evidence and restores it under the original query ID", () => {
    const queryId = "01K00000000000000000000000"
    const first = new QueryResultCache({ createId: () => queryId })
    first.add(createResult())
    const second = new QueryResultCache()

    second.restore(first.getEntries([queryId]))

    expect(second.get(queryId).rows).toEqual([{ category: "Beauty" }])
  })
})
