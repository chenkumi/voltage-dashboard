import { describe, expect, it, vi } from "vitest"
import { MAX_WAIT_FOR_MS, createWaitForTool } from "./wait-for"

const executeWaitFor = (timeMs: unknown, abortSignal?: AbortSignal) => {
  const execute = createWaitForTool().execute
  if (!execute) throw new Error("wait_for must be executable.")

  return execute(
    { timeMs },
    {
      toolCallId: "wait-for-test",
      messages: [],
      context: {},
      abortSignal,
    }
  )
}

describe("wait_for", () => {
  it("waits for the requested duration", async () => {
    vi.useFakeTimers()
    const waiting = executeWaitFor(250)

    await vi.advanceTimersByTimeAsync(249)
    expect(await Promise.race([waiting, Promise.resolve("pending")])).toBe(
      "pending"
    )

    await vi.advanceTimersByTimeAsync(1)
    await expect(waiting).resolves.toEqual({ status: "OK", waitedMs: 250 })
    vi.useRealTimers()
  })

  it("rejects invalid wait durations without scheduling a timer", async () => {
    await expect(executeWaitFor(MAX_WAIT_FOR_MS + 1)).resolves.toEqual({
      status: "ERROR",
      message: `timeMs must be a finite number from 0 to ${MAX_WAIT_FOR_MS}.`,
    })
  })

  it("stops waiting when the turn is aborted", async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const waiting = executeWaitFor(250, controller.signal)

    controller.abort()
    await expect(waiting).resolves.toEqual({
      status: "ERROR",
      message: "Waiting was aborted.",
    })
    vi.useRealTimers()
  })
})
