// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import {
  createMemoryRouter,
  MemoryRouter,
  RouterProvider,
} from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import i18n from "../../../i18n"
import { createCommerceSeed } from "../commerce-data/commerce-seed"
import type { ReturnStoreSnapshot } from "./return-store"
import { ReturnRepository } from "./return-repository"
import {
  ReturnDetailPage,
  ReturnInspectionPage,
  ReturnsPage,
} from "./return-pages"

let context: {
  returnRepository: ReturnRepository
  returns: ReturnStoreSnapshot
  commerce: ReturnType<typeof createCommerceSeed> & {
    state: "ready" | "error"
  }
}

vi.mock("../voltage-admin", () => ({ useVoltageAdmin: () => context }))

let repository: ReturnRepository

beforeEach(async () => {
  await i18n.changeLanguage("en")
  const commerce = createCommerceSeed()
  repository = new ReturnRepository({
    databaseName: `return-inspection-${crypto.randomUUID()}`,
    commerceSnapshot: commerce,
    orderSnapshotVersion: 3,
    now: () => "2026-08-31T08:00:00.000Z",
  })
  await repository.initialize()
  const seededOrders = new Set(
    commerce.orders
      .filter(
        (order) =>
          order.status === "delivered" && order.paymentStatus === "paid"
      )
      .slice(0, 2)
      .map((order) => order.id)
  )
  const order = commerce.orders.find(
    (candidate) =>
      candidate.status === "delivered" &&
      candidate.paymentStatus === "paid" &&
      !seededOrders.has(candidate.id)
  )!
  const line = commerce.orderLines.find(
    (candidate) => candidate.orderId === order.id
  )!
  const created = await repository.createDraft(
    {
      orderId: order.id,
      source: "internal",
      reason: "defective",
      customerStatement: "Item stopped working after delivery.",
      items: [{ orderLineId: line.id, requestedQuantity: 1 }],
    },
    "user"
  )
  await repository.submit(created.rma.id, created.rma.version, "user")
  await repository.decideEligibility(
    created.rma.id,
    created.rma.version,
    {
      facts: {
        daysSinceDelivery: 4,
        packageOpened: true,
        condition: "damaged",
        finalSale: false,
      },
      decision: "authorized",
      reason: "Eligible",
    },
    "user"
  )
  await repository.recordReceipt(
    created.rma.id,
    { packageCount: 1, result: "complete" },
    "user"
  )
  await repository.startInspection(created.rma.id, "user")
  context = {
    returnRepository: repository,
    returns: {
      ...(await repository.getSnapshot()),
      state: "ready",
      error: null,
    },
    commerce: { ...commerce, state: "ready" },
  }
})

afterEach(async () => {
  cleanup()
  await repository.deleteDatabaseForTests()
})

describe("return inspection", () => {
  it("requires structured rejection data and completes every item", async () => {
    const rma = context.returns.rmas.find((candidate) =>
      candidate.id.startsWith("RMA-")
    )!
    const router = createMemoryRouter(
      [
        {
          path: "/returns/:returnId/inspection",
          element: <ReturnInspectionPage />,
        },
        { path: "/returns/:returnId", element: <div>return detail</div> },
      ],
      { initialEntries: [`/returns/${rma.id}/inspection`] }
    )
    const user = userEvent.setup()
    const view = render(<RouterProvider router={router} />)

    const accepted = screen.getByRole("spinbutton", {
      name: "Accepted quantity",
    })
    await user.clear(accepted)
    await user.type(accepted, "0")
    await user.click(
      screen.getByRole("button", { name: "Complete inspection" })
    )
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Rejected inspection quantity requires a fixed reason."
    )

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Rejection reason" }),
      "not_received"
    )
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Inventory disposition" }),
      "return_to_customer"
    )
    await user.click(
      screen.getByRole("button", { name: "Complete inspection" })
    )
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/returns/${rma.id}`)
    )
    const snapshot = await repository.getSnapshot()
    expect(
      snapshot.rmas.find((candidate) => candidate.id === rma.id)
    ).toMatchObject({
      status: "completed",
      inspection: { status: "completed" },
    })
    view.unmount()
    context = {
      returnRepository: repository,
      returns: { ...snapshot, state: "ready", error: null },
      commerce: context.commerce,
    }
    const detailRouter = createMemoryRouter(
      [
        {
          path: "/returns/:returnId",
          element: <ReturnDetailPage />,
        },
      ],
      { initialEntries: [`/returns/${rma.id}`] }
    )
    render(<RouterProvider router={detailRouter} />)
    expect(
      screen.queryByRole("button", { name: "Reopen inspection" })
    ).toBeNull()
  })

  it("renders a Returns list error when Commerce data is unavailable", () => {
    context = {
      ...context,
      commerce: { ...context.commerce, state: "error" },
    }
    render(
      <MemoryRouter>
        <ReturnsPage />
      </MemoryRouter>
    )

    expect(screen.getByText("Returns data is unavailable.")).toBeTruthy()
    expect(screen.queryByText("Loading returns…")).toBeNull()
  })
})
