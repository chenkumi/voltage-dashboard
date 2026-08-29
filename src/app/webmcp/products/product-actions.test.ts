import { describe, expect, it, vi } from "vitest"
import { archiveProducts, restoreProduct } from "./product-actions"

describe("product actions", () => {
  it("archives every selected product before reporting completion", async () => {
    const archiveMany = vi.fn(async () => [])
    const onComplete = vi.fn()

    await archiveProducts({
      productIds: [12, 13],
      repository: { archiveMany } as never,
      onComplete,
      onError: vi.fn(),
    })

    expect(archiveMany).toHaveBeenCalledWith([12, 13])
    expect(onComplete).toHaveBeenCalledOnce()
  })

  it("reports an archive failure without completing the action", async () => {
    const failure = new Error("database unavailable")
    const onComplete = vi.fn()
    const onError = vi.fn()

    await archiveProducts({
      productIds: [12],
      repository: {
        archiveMany: vi.fn(async () => Promise.reject(failure)),
      } as never,
      onComplete,
      onError,
    })

    expect(onComplete).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith(failure)
  })

  it("restores the selected product", async () => {
    const restore = vi.fn(async () => undefined)
    const onComplete = vi.fn()

    await restoreProduct({
      productId: 12,
      repository: { restore } as never,
      onComplete,
      onError: vi.fn(),
    })

    expect(restore).toHaveBeenCalledWith(12)
    expect(onComplete).toHaveBeenCalledOnce()
  })
})
