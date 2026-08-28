import { describe, expect, it, vi } from "vitest"
import { sendPersistedUserMessage } from "./chat-send-lifecycle"

const createDeferred = <T>() => {
  let resolve: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve: resolve! }
}

describe("sendPersistedUserMessage", () => {
  it("sends a persisted message while its controller remains active", async () => {
    const persist = vi.fn(async () => {})
    const send = vi.fn(async () => {})

    await sendPersistedUserMessage({
      persist,
      send,
      isActive: () => true,
    })

    expect(persist).toHaveBeenCalledOnce()
    expect(send).toHaveBeenCalledOnce()
  })

  it("does not start a request after persistence completes for an invalidated turn", async () => {
    const deferred = createDeferred<void>()
    const persist = vi.fn(() => deferred.promise)
    const send = vi.fn(async () => {})
    let active = true

    const request = sendPersistedUserMessage({
      persist,
      send,
      isActive: () => active,
    })

    active = false
    deferred.resolve()
    await request

    expect(send).not.toHaveBeenCalled()
  })
})
