import { afterEach, describe, expect, it, vi } from "vitest"
import {
  createToolsetKey,
  ToolsetReadinessCoordinator,
} from "./toolset-readiness"

afterEach(() => {
  vi.useRealTimers()
})

describe("ToolsetReadinessCoordinator", () => {
  it("publishes a route and completes its pending revision exactly once", async () => {
    const coordinator = new ToolsetReadinessCoordinator()
    const pending = coordinator.waitFor("/products/1/edit")
    const publication = coordinator.preparePublish(
      "/products/1/edit",
      createToolsetKey("/products/1/edit", ["get_product_editor_state"])
    )
    const ready = coordinator.publish(publication)

    await expect(pending).resolves.toEqual(ready)
    expect(ready).toMatchObject({
      status: "READY",
      ready: true,
      route: "/products/1/edit",
      revision: 1,
    })
  })

  it("settles a replaced route without letting it consume the new publish", async () => {
    const coordinator = new ToolsetReadinessCoordinator()
    const oldPending = coordinator.waitFor("/products/1/edit")
    const newPending = coordinator.waitFor("/refund-approvals/APR-2006")

    await expect(oldPending).resolves.toMatchObject({
      status: "TOOLSET_NOT_READY",
      reasonCode: "SUPERSEDED",
      revision: 1,
    })

    coordinator.publish(
      coordinator.preparePublish(
        "/refund-approvals/APR-2006",
        "refund-approval-detail"
      )
    )
    await expect(newPending).resolves.toMatchObject({
      status: "READY",
      route: "/refund-approvals/APR-2006",
      revision: 2,
    })
  })

  it("returns a bounded timeout result instead of leaving a promise pending", async () => {
    vi.useFakeTimers()
    const coordinator = new ToolsetReadinessCoordinator(25)
    const pending = coordinator.waitFor("/inventory")

    await vi.advanceTimersByTimeAsync(25)

    await expect(pending).resolves.toMatchObject({
      status: "TOOLSET_NOT_READY",
      reasonCode: "TIMEOUT",
      retryable: true,
    })
  })

  it("does not increase the revision for a duplicate publish", () => {
    const coordinator = new ToolsetReadinessCoordinator()
    const first = coordinator.publish(
      coordinator.preparePublish("/reports", "reports|execute_readonly_sql")
    )
    const duplicate = coordinator.publish(
      coordinator.preparePublish("/reports", "reports|execute_readonly_sql")
    )

    expect(duplicate).toBe(first)
    expect(duplicate?.revision).toBe(1)
  })

  it("settles a pending route when a different route is prepared", async () => {
    const coordinator = new ToolsetReadinessCoordinator()
    const pending = coordinator.waitFor("/products/1/edit")

    const other = coordinator.preparePublish("/inventory", "inventory-tools")

    await expect(pending).resolves.toMatchObject({
      status: "TOOLSET_NOT_READY",
      reasonCode: "SUPERSEDED",
      revision: 1,
    })
    expect(coordinator.publish(other)).toMatchObject({
      status: "READY",
      route: "/inventory",
      revision: 2,
    })
  })

  it("ignores a stale publication that finishes after a newer route", async () => {
    const coordinator = new ToolsetReadinessCoordinator()
    const oldPublication = coordinator.preparePublish(
      "/products",
      "product-list"
    )
    const pending = coordinator.waitFor("/refund-approvals/APR-2006")
    const newPublication = coordinator.preparePublish(
      "/refund-approvals/APR-2006",
      "refund-detail"
    )

    expect(coordinator.publish(oldPublication)).toBeNull()
    const ready = coordinator.publish(newPublication)

    await expect(pending).resolves.toEqual(ready)
    expect(ready?.revision).toBe(2)
  })

  it("settles pending readiness on dispose and stays safely disposed", async () => {
    const coordinator = new ToolsetReadinessCoordinator()
    const pending = coordinator.waitFor("/returns/RMA-2005")
    coordinator.dispose()
    coordinator.dispose()

    await expect(pending).resolves.toMatchObject({
      status: "TOOLSET_NOT_READY",
      reasonCode: "DISPOSED",
      retryable: false,
    })
    await expect(coordinator.waitFor("/inventory")).resolves.toMatchObject({
      status: "TOOLSET_NOT_READY",
      reasonCode: "DISPOSED",
    })
  })

  it("can cancel a login-bound pending route without permanently disposing", async () => {
    const coordinator = new ToolsetReadinessCoordinator()
    const pending = coordinator.waitFor("/products/1/edit")
    coordinator.cancelPending()

    await expect(pending).resolves.toMatchObject({
      status: "TOOLSET_NOT_READY",
      reasonCode: "DISPOSED",
    })

    const publication = coordinator.preparePublish("/login", "instructions")
    expect(coordinator.publish(publication)).toMatchObject({
      status: "READY",
      route: "/login",
    })
  })

  it("includes the query in route identity and sorts tools in the key", () => {
    expect(
      createToolsetKey("/customers?segment=vip", ["z_tool", "a_tool"])
    ).toBe("/customers|a_tool,z_tool")
  })
})
