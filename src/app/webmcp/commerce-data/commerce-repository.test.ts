import Dexie from "dexie"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createDummyJsonProductSeed } from "../products/product-seed"
import { createCommerceSeed } from "./commerce-seed"
import {
  COMMERCE_DATABASE_SCHEMA,
  CommerceRepository,
} from "./commerce-repository"
import { CommerceValidationError } from "./commerce-validation"
import type { CustomerWriteInput } from "./types"

const repositories: CommerceRepository[] = []

const createRepository = (
  databaseName = `commerce-${crypto.randomUUID()}`,
  seed = createCommerceSeed()
) => {
  let id = 0
  const repository = new CommerceRepository({
    databaseName,
    seed,
    now: () => "2026-08-30T08:00:00.000Z",
    createId: () => `test-${++id}`,
  })
  repositories.push(repository)
  return repository
}

const createCustomerInput = (
  email = "new.customer@example.test"
): CustomerWriteInput => ({
  segment: "new",
  region: "north",
  contact: {
    fullName: "新增測試客戶",
    email,
    phone: "0912345678",
    addressLine: "測試路 99 號",
    city: "台北市",
    postalCode: "100",
    countryCode: "TW",
  },
  tags: [
    { kind: "safe", value: "new_customer" },
    { kind: "custom", value: " 活動名單 " },
  ],
})

afterEach(async () => {
  await Promise.all(
    repositories
      .splice(0)
      .map((repository) => repository.deleteDatabaseForTests())
  )
})

describe("CommerceRepository", () => {
  it("seeds once without overwriting customer mutations", async () => {
    const databaseName = `commerce-${crypto.randomUUID()}`
    const first = createRepository(databaseName)
    await first.initialize()
    const customer = await first.createCustomer(createCustomerInput())
    await first.updateCustomer(customer.id, {
      ...createCustomerInput(),
      segment: "returning",
    })
    first.close()

    const second = createRepository(databaseName)
    await second.initialize()

    expect(await second.getCustomer(customer.id)).toMatchObject({
      segment: "returning",
    })
    expect((await second.getSnapshot()).customers).toHaveLength(29)
  })

  it("migrates legacy reporting facts without overwriting customer mutations", async () => {
    const databaseName = `commerce-${crypto.randomUUID()}`
    const first = createRepository(databaseName)
    await first.initialize()
    const baselineCustomer = (await first.getSnapshot()).customers[0]!
    await first.updateCustomer(baselineCustomer.id, {
      ...createCustomerInput(baselineCustomer.contact.email),
      segment: "returning",
    })
    first.close()

    const legacyDatabase = new Dexie(databaseName)
    legacyDatabase.version(1).stores(COMMERCE_DATABASE_SCHEMA)
    await legacyDatabase.table("orders").update("VM-25001", {
      customerSnapshot: { region: "east", segment: "vip" },
    })
    await legacyDatabase.table("metadata").update("commerce-seed", {
      version: 1,
    })
    legacyDatabase.close()

    const migrated = createRepository(databaseName)
    await migrated.initialize()
    const snapshot = await migrated.getSnapshot()
    const expectedOrder = createCommerceSeed().orders.find(
      ({ id }) => id === "VM-25001"
    )!

    expect(
      snapshot.orders.find(({ id }) => id === expectedOrder.id)
        ?.customerSnapshot
    ).toEqual(expectedOrder.customerSnapshot)
    expect(await migrated.getCustomer(baselineCustomer.id)).toMatchObject({
      segment: "returning",
    })

    migrated.close()
    const migratedDatabase = new Dexie(databaseName)
    migratedDatabase.version(1).stores(COMMERCE_DATABASE_SCHEMA)
    await expect(
      migratedDatabase.table("metadata").get("commerce-seed")
    ).resolves.toMatchObject({ version: 2 })
    migratedDatabase.close()
  })

  it("validates and normalizes customer Email uniqueness", async () => {
    const repository = createRepository()
    await repository.initialize()
    const created = await repository.createCustomer(
      createCustomerInput("  UNIQUE@Example.Test ")
    )

    expect(created.contact.email).toBe("unique@example.test")
    expect(created.tags).toContainEqual({ kind: "custom", value: "活動名單" })
    await expect(
      repository.createCustomer(createCustomerInput("unique@example.test"))
    ).rejects.toEqual(expect.objectContaining({ code: "DUPLICATE_EMAIL" }))
    await expect(
      repository.createCustomer(createCustomerInput("not-an-email"))
    ).rejects.toBeInstanceOf(CommerceValidationError)
  })

  it("suspends and restores customers while retaining historical orders", async () => {
    const repository = createRepository()
    await repository.initialize()
    const before = await repository.getSnapshot()
    const order = before.orders[0]
    const customer = before.customers.find(
      (item) => item.id === order.customerId
    )!

    await repository.suspendCustomer(customer.id, "manual_review")
    expect(await repository.getCustomer(customer.id)).toMatchObject({
      status: "suspended",
      suspendedAt: "2026-08-30T08:00:00.000Z",
    })
    expect(
      (await repository.getSnapshot()).orders.find(
        (item) => item.id === order.id
      )
    ).toEqual(order)
    await expect(
      repository.suspendCustomer(customer.id, "manual_review")
    ).rejects.toEqual(expect.objectContaining({ code: "INVALID_STATUS" }))
    await repository.restoreCustomer(customer.id, "review_completed")
    expect(await repository.getCustomer(customer.id)).toMatchObject({
      status: "active",
      suspendedAt: null,
    })
  })

  it("keeps order customer and product snapshots immutable after edits", async () => {
    const repository = createRepository()
    await repository.initialize()
    const before = await repository.getSnapshot()
    const order = before.orders[0]
    const line = before.orderLines.find((item) => item.orderId === order.id)!
    const customer = before.customers.find(
      (item) => item.id === order.customerId
    )!

    await repository.updateCustomer(customer.id, {
      segment: customer.segment === "vip" ? "new" : "vip",
      region: customer.region === "north" ? "south" : "north",
      contact: { ...customer.contact, fullName: "已變更姓名" },
      tags: [],
    })
    line.title = "呼叫端修改"
    const after = await repository.getSnapshot()

    expect(
      after.orders.find((item) => item.id === order.id)?.customerSnapshot
    ).toEqual(order.customerSnapshot)
    expect(
      after.orderLines.find((item) => item.id === line.id)?.title
    ).not.toBe("呼叫端修改")
  })

  it("stores only plain-text notes and emits versioned mutations", async () => {
    const repository = createRepository()
    await repository.initialize()
    const listener = vi.fn()
    repository.subscribe(listener)
    const customer = (await repository.getSnapshot()).customers[0]

    const note = await repository.addNote(customer.id, "  需要電話回訪  ")
    expect(note.text).toBe("需要電話回訪")
    expect(listener).toHaveBeenCalledWith({
      type: "note_add",
      customerId: customer.id,
      version: 2,
    })
    await expect(
      repository.addNote(customer.id, "<script>alert(1)</script>")
    ).rejects.toEqual(expect.objectContaining({ code: "INVALID_NOTE" }))
  })

  it("rejects orphan seed records and rolls back initialization metadata", async () => {
    const databaseName = `commerce-${crypto.randomUUID()}`
    const seed = createCommerceSeed()
    const invalid = createRepository(databaseName, {
      ...seed,
      orderLines: [
        ...seed.orderLines,
        { ...seed.orderLines[0], id: "ORPHAN-LINE", orderId: "MISSING" },
      ],
    })

    await expect(invalid.initialize()).rejects.toEqual(
      expect.objectContaining({ code: "INVALID_SEED" })
    )
    invalid.close()
    const valid = createRepository(databaseName, seed)
    await expect(valid.initialize()).resolves.toBeUndefined()
    expect((await valid.getSnapshot()).orders).toHaveLength(seed.orders.length)
  })

  it("does not mark a partially populated database as initialized", async () => {
    const databaseName = `commerce-${crypto.randomUUID()}`
    const seed = createCommerceSeed()
    const rawDatabase = new Dexie(databaseName)
    rawDatabase.version(1).stores(COMMERCE_DATABASE_SCHEMA)
    const customer = seed.customers[0]
    await rawDatabase.table("customers").add({
      ...customer,
      normalizedEmail: customer.contact.email,
    })
    rawDatabase.close()
    const repository = createRepository(databaseName, seed)

    await expect(repository.initialize()).rejects.toEqual(
      expect.objectContaining({
        code: "INVALID_SEED",
        message: expect.stringContaining("partially initialized"),
      })
    )
  })

  it("rejects HTML notes and negative line subtotals in seed data", async () => {
    const seed = createCommerceSeed()
    const customer = seed.customers[0]
    const withHtmlNote = createRepository(undefined, {
      ...seed,
      notes: [
        {
          id: "NOTE-HTML",
          customerId: customer.id,
          text: "<strong>unsafe</strong>",
          createdAt: customer.createdAt,
          updatedAt: customer.updatedAt,
        },
      ],
    })
    await expect(withHtmlNote.initialize()).rejects.toEqual(
      expect.objectContaining({ code: "INVALID_NOTE" })
    )

    const target = seed.orderLines[0]
    const withNegativeSubtotal = createRepository(undefined, {
      ...seed,
      orderLines: seed.orderLines.map((line) =>
        line.id === target.id
          ? {
              ...line,
              discount: {
                ...line.discount,
                amount: line.unitPrice.amount * line.quantity + 1,
              },
              subtotal: { ...line.subtotal, amount: -1 },
            }
          : line
      ),
    })
    await expect(withNegativeSubtotal.initialize()).rejects.toEqual(
      expect.objectContaining({ code: "INVALID_SEED" })
    )
  })

  it("allocates customer IDs numerically across the five-digit boundary", async () => {
    const seed = createCommerceSeed()
    const source = seed.customers[0]
    const repository = createRepository(undefined, {
      ...seed,
      customers: [
        ...seed.customers,
        {
          ...source,
          id: "CUST-9999",
          contact: { ...source.contact, email: "customer9999@example.test" },
        },
        {
          ...source,
          id: "CUST-10000",
          contact: { ...source.contact, email: "customer10000@example.test" },
        },
      ],
      activities: [
        ...seed.activities,
        {
          id: "ACT-CREATE-9999",
          customerId: "CUST-9999",
          type: "customer_created",
          occurredAt: source.createdAt,
          reasonCode: null,
        },
        {
          id: "ACT-CREATE-10000",
          customerId: "CUST-10000",
          type: "customer_created",
          occurredAt: source.createdAt,
          reasonCode: null,
        },
      ],
    })
    await repository.initialize()

    await expect(
      repository.createCustomer(createCustomerInput())
    ).resolves.toMatchObject({ id: "CUST-10001" })
  })

  it("rejects invalid tag kinds and excessive order discounts", async () => {
    const repository = createRepository()
    await repository.initialize()
    await expect(
      repository.createCustomer({
        ...createCustomerInput(),
        tags: [{ kind: "unexpected", value: "unsafe" }] as never,
      })
    ).rejects.toEqual(expect.objectContaining({ code: "INVALID_CUSTOMER" }))

    const seed = createCommerceSeed()
    const target = seed.orders[0]
    const discountAmount = target.amounts.subtotal.amount + 1
    const invalidOrderSeed = createRepository(undefined, {
      ...seed,
      orders: seed.orders.map((order) =>
        order.id === target.id
          ? {
              ...order,
              amounts: {
                ...order.amounts,
                discount: { ...order.amounts.discount, amount: discountAmount },
                total: {
                  ...order.amounts.total,
                  amount:
                    order.amounts.subtotal.amount -
                    discountAmount +
                    order.amounts.shipping.amount +
                    order.amounts.tax.amount,
                },
              },
            }
          : order
      ),
    })
    await expect(invalidOrderSeed.initialize()).rejects.toEqual(
      expect.objectContaining({ code: "INVALID_SEED" })
    )
  })

  it("rejects unknown stored lifecycle, order, and currency enums", async () => {
    const seed = createCommerceSeed()
    const invalidCustomer = createRepository(undefined, {
      ...seed,
      customers: seed.customers.map((customer, index) =>
        index === 0 ? { ...customer, status: "unknown" as never } : customer
      ),
    })
    await expect(invalidCustomer.initialize()).rejects.toEqual(
      expect.objectContaining({ code: "INVALID_SEED" })
    )

    const invalidOrder = createRepository(undefined, {
      ...seed,
      orders: seed.orders.map((order, index) =>
        index === 0
          ? {
              ...order,
              paymentStatus: "unknown" as never,
              amounts: Object.fromEntries(
                Object.entries(order.amounts).map(([key, value]) => [
                  key,
                  { ...value, currency: "EUR" },
                ])
              ) as never,
            }
          : order
      ),
    })
    await expect(invalidOrder.initialize()).rejects.toEqual(
      expect.objectContaining({ code: "INVALID_SEED" })
    )
  })

  it("accepts valid high-precision native unit prices without rewriting them", async () => {
    const product = {
      ...createDummyJsonProductSeed()[0],
      price: { amount: 1.005, currency: "USD" as const },
    }
    const repository = createRepository(
      undefined,
      createCommerceSeed([product])
    )

    await expect(repository.initialize()).resolves.toBeUndefined()
    expect((await repository.getSnapshot()).orderLines[0].unitPrice).toEqual(
      product.price
    )
  })

  it("returns structured validation errors for malformed runtime inputs", async () => {
    const repository = createRepository()
    await repository.initialize()
    const customer = (await repository.getSnapshot()).customers[0]

    await expect(repository.createCustomer(null as never)).rejects.toEqual(
      expect.objectContaining({ code: "INVALID_CUSTOMER" })
    )
    await expect(
      repository.addNote(customer.id, null as never)
    ).rejects.toEqual(expect.objectContaining({ code: "INVALID_NOTE" }))
    await expect(
      repository.suspendCustomer(customer.id, null as never)
    ).rejects.toEqual(expect.objectContaining({ code: "INVALID_STATUS" }))

    const seed = createCommerceSeed()
    const malformedSeed = createRepository(undefined, {
      ...seed,
      orders: [
        { ...seed.orders[0], amounts: null } as never,
        ...seed.orders.slice(1),
      ],
    })
    await expect(malformedSeed.initialize()).rejects.toEqual(
      expect.objectContaining({ code: "INVALID_SEED" })
    )

    for (const malformed of [
      { ...seed, customers: [null, ...seed.customers.slice(1)] as never },
      { ...seed, orders: [null, ...seed.orders.slice(1)] as never },
      { ...seed, notes: [null] as never },
      { ...seed, activities: [null] as never },
      {
        ...seed,
        activities: [
          { ...seed.activities[0], occurredAt: null } as never,
          ...seed.activities.slice(1),
        ],
      },
      { ...seed, orders: [], orderLines: [null] as never },
      {
        ...seed,
        orders: [
          {
            ...seed.orders[0],
            amounts: { ...seed.orders[0].amounts, unexpected: null },
          } as never,
          ...seed.orders.slice(1),
        ],
      },
    ]) {
      await expect(
        createRepository(undefined, malformed).initialize()
      ).rejects.toBeInstanceOf(CommerceValidationError)
    }
  })

  it("rejects derived money values with sub-cent precision", async () => {
    const seed = createCommerceSeed()
    const targetOrder = seed.orders[0]
    const targetLine = seed.orderLines.find(
      (line) => line.orderId === targetOrder.id
    )!
    const delta = 0.00000000001
    const malformedSeed = createRepository(undefined, {
      ...seed,
      orderLines: seed.orderLines.map((line) =>
        line.id === targetLine.id
          ? {
              ...line,
              subtotal: {
                ...line.subtotal,
                amount: line.subtotal.amount + delta,
              },
            }
          : line
      ),
      orders: seed.orders.map((order) =>
        order.id === targetOrder.id
          ? {
              ...order,
              amounts: {
                ...order.amounts,
                subtotal: {
                  ...order.amounts.subtotal,
                  amount: order.amounts.subtotal.amount + delta,
                },
                total: {
                  ...order.amounts.total,
                  amount: order.amounts.total.amount + delta,
                },
              },
            }
          : order
      ),
    })

    await expect(malformedSeed.initialize()).rejects.toEqual(
      expect.objectContaining({ code: "INVALID_SEED" })
    )
  })

  it("rejects unexpected persisted fields that could carry sensitive data", async () => {
    const seed = createCommerceSeed()
    for (const malformed of [
      {
        ...seed,
        orders: [
          { ...seed.orders[0], paymentToken: "tok_test" } as never,
          ...seed.orders.slice(1),
        ],
      },
      {
        ...seed,
        orders: [
          {
            ...seed.orders[0],
            customerSnapshot: {
              ...seed.orders[0].customerSnapshot,
              email: "snapshot@example.test",
            },
          } as never,
          ...seed.orders.slice(1),
        ],
      },
      {
        ...seed,
        customers: [
          {
            ...seed.customers[0],
            contact: {
              ...seed.customers[0].contact,
              paymentAccount: "account-test",
            },
          } as never,
          ...seed.customers.slice(1),
        ],
      },
      {
        ...seed,
        orderLines: [
          { ...seed.orderLines[0], cardLastFour: "4242" } as never,
          ...seed.orderLines.slice(1),
        ],
      },
    ]) {
      await expect(
        createRepository(undefined, malformed).initialize()
      ).rejects.toBeInstanceOf(CommerceValidationError)
    }

    const databaseName = `commerce-${crypto.randomUUID()}`
    const repository = createRepository(databaseName)
    await repository.initialize()
    repository.close()
    const rawDatabase = new Dexie(databaseName)
    rawDatabase.version(1).stores(COMMERCE_DATABASE_SCHEMA)
    await rawDatabase.table("orders").update(seed.orders[0].id, {
      paymentToken: "tok_corrupt",
    })
    rawDatabase.close()

    await expect(
      createRepository(databaseName).initialize()
    ).rejects.toBeInstanceOf(CommerceValidationError)
  })

  it("returns domain errors for malformed entity identifiers", async () => {
    const repository = createRepository()
    await repository.initialize()

    await expect(repository.getCustomer(null as never)).rejects.toEqual(
      expect.objectContaining({ code: "INVALID_IDENTIFIER" })
    )
    await expect(
      repository.updateCustomer(undefined as never, createCustomerInput())
    ).rejects.toEqual(expect.objectContaining({ code: "INVALID_IDENTIFIER" }))
    await expect(
      repository.addNote(null as never, "valid note")
    ).rejects.toEqual(expect.objectContaining({ code: "INVALID_IDENTIFIER" }))
    await expect(
      repository.updateNote(undefined as never, "valid note")
    ).rejects.toEqual(expect.objectContaining({ code: "INVALID_IDENTIFIER" }))
  })

  it("accepts historical customer snapshots that differ from current data", async () => {
    const seed = createCommerceSeed()
    const targetOrder = seed.orders[0]
    const repository = createRepository(undefined, {
      ...seed,
      customers: seed.customers.map((customer) =>
        customer.id === targetOrder.customerId
          ? {
              ...customer,
              segment:
                customer.segment === "vip"
                  ? ("new" as const)
                  : ("vip" as const),
              region:
                customer.region === "north"
                  ? ("south" as const)
                  : ("north" as const),
            }
          : customer
      ),
    })

    await expect(repository.initialize()).resolves.toBeUndefined()
    expect(
      (await repository.getSnapshot()).orders.find(
        (order) => order.id === targetOrder.id
      )?.customerSnapshot
    ).toEqual(targetOrder.customerSnapshot)
  })

  it("rejects seed IDs and timestamps outside the repository contract", async () => {
    const seed = createCommerceSeed()
    const invalidCustomerId = createRepository(undefined, {
      ...seed,
      customers: seed.customers.map((customer, index) =>
        index === 0 ? { ...customer, id: "customer-legacy" } : customer
      ),
    })
    await expect(invalidCustomerId.initialize()).rejects.toBeInstanceOf(
      CommerceValidationError
    )

    const target = seed.orders[0]
    const invalidTimeline = createRepository(undefined, {
      ...seed,
      orders: seed.orders.map((order) =>
        order.id === target.id
          ? {
              ...order,
              createdAt: "Aug 30 2026",
              timeline: [order.timeline[0], order.timeline[0]],
            }
          : order
      ),
    })
    await expect(invalidTimeline.initialize()).rejects.toBeInstanceOf(
      CommerceValidationError
    )

    const invalidNote = createRepository(undefined, {
      ...seed,
      notes: [
        {
          id: "NOTE_bad",
          customerId: seed.customers[0].id,
          text: "valid note",
          createdAt: "2026-08-31T00:00:00.000Z",
          updatedAt: "2026-08-30T00:00:00.000Z",
        },
      ],
    })
    await expect(invalidNote.initialize()).rejects.toBeInstanceOf(
      CommerceValidationError
    )
  })

  it("rejects line and timeline IDs that do not belong to their order", async () => {
    const seed = createCommerceSeed()
    const targetLine = seed.orderLines[0]
    const invalidLine = createRepository(undefined, {
      ...seed,
      orderLines: seed.orderLines.map((line) =>
        line.id === targetLine.id ? { ...line, id: "VM-99999-L1" } : line
      ),
    })
    await expect(invalidLine.initialize()).rejects.toBeInstanceOf(
      CommerceValidationError
    )

    const targetOrder = seed.orders[0]
    const otherTimelineId = seed.orders[1].timeline[0].id
    const invalidTimeline = createRepository(undefined, {
      ...seed,
      orders: seed.orders.map((order) =>
        order.id === targetOrder.id
          ? {
              ...order,
              timeline: [
                { ...order.timeline[0], id: otherTimelineId },
                ...order.timeline.slice(1),
              ],
            }
          : order
      ),
    })
    await expect(invalidTimeline.initialize()).rejects.toBeInstanceOf(
      CommerceValidationError
    )
  })

  it("rejects unsafe customer number ranges before ID generation can corrupt data", async () => {
    const seed = createCommerceSeed()
    const originalId = seed.customers[0].id
    const oversizedId = "CUST-999999999999999999999999"
    const oversizedSeed = {
      ...seed,
      customers: seed.customers.map((customer) =>
        customer.id === originalId ? { ...customer, id: oversizedId } : customer
      ),
      orders: seed.orders.map((order) =>
        order.customerId === originalId
          ? { ...order, customerId: oversizedId }
          : order
      ),
      notes: seed.notes.map((note) =>
        note.customerId === originalId
          ? { ...note, customerId: oversizedId }
          : note
      ),
      activities: seed.activities.map((activity) =>
        activity.customerId === originalId
          ? { ...activity, customerId: oversizedId }
          : activity
      ),
    }

    await expect(
      createRepository(undefined, oversizedSeed).initialize()
    ).rejects.toBeInstanceOf(CommerceValidationError)
  })

  it("requires lifecycle activities to alternate and match customer status", async () => {
    const seed = createCommerceSeed()
    const suspended = seed.customers.find(
      (customer) => customer.status === "suspended"
    )!
    const suspendedActivity = seed.activities.find(
      (activity) =>
        activity.customerId === suspended.id &&
        activity.type === "customer_suspended"
    )!
    const inconsistentSeeds = [
      {
        ...seed,
        customers: seed.customers.map((customer) =>
          customer.id === suspended.id
            ? { ...customer, status: "active" as const, suspendedAt: null }
            : customer
        ),
      },
      {
        ...seed,
        activities: [
          ...seed.activities,
          {
            id: "ACT-CORRUPT-RESTORE",
            customerId: suspended.id,
            type: "customer_restored" as const,
            occurredAt: suspended.updatedAt,
            reasonCode: "review_completed",
          },
        ],
      },
      {
        ...seed,
        activities: seed.activities.map((activity) =>
          activity.id === suspendedActivity.id
            ? { ...activity, type: "customer_restored" as const }
            : activity
        ),
      },
      {
        ...seed,
        activities: seed.activities.map((activity) =>
          activity.id === suspendedActivity.id
            ? { ...activity, reasonCode: null }
            : activity
        ),
      },
      {
        ...seed,
        activities: [
          ...seed.activities,
          {
            id: "ACT-SAME-TIME-SUSPEND",
            customerId: seed.customers[0].id,
            type: "customer_suspended" as const,
            occurredAt: seed.customers[0].createdAt,
            reasonCode: "manual_review",
          },
          {
            id: "ACT-SAME-TIME-RESTORE",
            customerId: seed.customers[0].id,
            type: "customer_restored" as const,
            occurredAt: seed.customers[0].createdAt,
            reasonCode: "review_completed",
          },
        ],
      },
    ]

    for (const inconsistentSeed of inconsistentSeeds) {
      await expect(
        createRepository(undefined, inconsistentSeed).initialize()
      ).rejects.toBeInstanceOf(CommerceValidationError)
    }
  })

  it("rejects clock rollback and invalid generated identifiers", async () => {
    let currentTime = "2026-08-30T08:00:00.000Z"
    const clockRepository = new CommerceRepository({
      databaseName: `commerce-${crypto.randomUUID()}`,
      seed: createCommerceSeed(),
      now: () => currentTime,
      createId: () => "valid-1",
    })
    repositories.push(clockRepository)
    await clockRepository.initialize()
    const customer = (await clockRepository.getSnapshot()).customers[0]
    currentTime = "2020-01-01T00:00:00.000Z"
    await expect(
      clockRepository.updateCustomer(customer.id, createCustomerInput())
    ).rejects.toEqual(expect.objectContaining({ code: "INVALID_TIMESTAMP" }))

    const idRepository = new CommerceRepository({
      databaseName: `commerce-${crypto.randomUUID()}`,
      seed: createCommerceSeed(),
      now: () => "2026-08-30T08:00:00.000Z",
      createId: () => "bad_id",
    })
    repositories.push(idRepository)
    await idRepository.initialize()
    const idCustomer = (await idRepository.getSnapshot()).customers[0]
    await expect(
      idRepository.addNote(idCustomer.id, "valid note")
    ).rejects.toEqual(expect.objectContaining({ code: "INVALID_IDENTIFIER" }))
  })

  it("validates an existing database before returning readback data", async () => {
    const databaseName = `commerce-${crypto.randomUUID()}`
    const repository = createRepository(databaseName)
    await repository.initialize()
    repository.close()

    const rawDatabase = new Dexie(databaseName)
    rawDatabase.version(1).stores(COMMERCE_DATABASE_SCHEMA)
    const activityId = createCommerceSeed().activities[0].id
    await rawDatabase.table("activities").update(activityId, {
      occurredAt: "not-an-iso-timestamp",
    })
    rawDatabase.close()

    const reloaded = createRepository(databaseName)
    await expect(reloaded.initialize()).rejects.toBeInstanceOf(
      CommerceValidationError
    )
  })

  it("rejects a corrupted stored Email index", async () => {
    const databaseName = `commerce-${crypto.randomUUID()}`
    const repository = createRepository(databaseName)
    await repository.initialize()
    repository.close()

    const rawDatabase = new Dexie(databaseName)
    rawDatabase.version(1).stores(COMMERCE_DATABASE_SCHEMA)
    await rawDatabase.table("customers").update("CUST-1001", {
      normalizedEmail: "wrong-index@example.test",
    })
    rawDatabase.close()

    const reloaded = createRepository(databaseName)
    await expect(reloaded.initialize()).rejects.toBeInstanceOf(
      CommerceValidationError
    )
  })

  it("uses customer updatedAt as the lower bound for note activity", async () => {
    let currentTime = "2026-08-30T08:00:00.000Z"
    const repository = new CommerceRepository({
      databaseName: `commerce-${crypto.randomUUID()}`,
      seed: createCommerceSeed(),
      now: () => currentTime,
      createId: () => "valid-1",
    })
    repositories.push(repository)
    await repository.initialize()
    const customer = (await repository.getSnapshot()).customers[0]
    await repository.updateCustomer(customer.id, createCustomerInput())
    currentTime = "2025-01-01T00:00:00.000Z"

    await expect(repository.addNote(customer.id, "valid note")).rejects.toEqual(
      expect.objectContaining({ code: "INVALID_TIMESTAMP" })
    )
  })

  it("keeps customer mutations after every existing note and activity", async () => {
    let currentTime = "2026-08-30T08:00:00.000Z"
    const repository = new CommerceRepository({
      databaseName: `commerce-${crypto.randomUUID()}`,
      seed: createCommerceSeed(),
      now: () => currentTime,
      createId: () => "monotonic-1",
    })
    repositories.push(repository)
    await repository.initialize()
    const customer = (await repository.getSnapshot()).customers.find(
      (candidate) => candidate.status === "active"
    )!
    const note = await repository.addNote(customer.id, "latest customer event")
    currentTime = "2026-08-29T08:00:00.000Z"

    await expect(
      repository.updateCustomer(customer.id, createCustomerInput())
    ).rejects.toEqual(expect.objectContaining({ code: "INVALID_TIMESTAMP" }))
    await expect(
      repository.suspendCustomer(customer.id, "manual_review")
    ).rejects.toEqual(expect.objectContaining({ code: "INVALID_TIMESTAMP" }))
    await expect(
      repository.updateNote(note.id, "rolled back edit")
    ).rejects.toEqual(expect.objectContaining({ code: "INVALID_TIMESTAMP" }))
  })

  it("rejects invalid metadata and missing baseline records", async () => {
    const invalidMetadataName = `commerce-${crypto.randomUUID()}`
    const metadataRepository = createRepository(invalidMetadataName)
    await metadataRepository.initialize()
    metadataRepository.close()
    const metadataDatabase = new Dexie(invalidMetadataName)
    metadataDatabase.version(1).stores(COMMERCE_DATABASE_SCHEMA)
    await metadataDatabase.table("metadata").update("commerce-seed", {
      version: 99,
    })
    metadataDatabase.close()
    await expect(
      createRepository(invalidMetadataName).initialize()
    ).rejects.toBeInstanceOf(CommerceValidationError)

    const emptyName = `commerce-${crypto.randomUUID()}`
    const emptyRepository = createRepository(emptyName)
    await emptyRepository.initialize()
    emptyRepository.close()
    const emptyDatabase = new Dexie(emptyName)
    emptyDatabase.version(1).stores(COMMERCE_DATABASE_SCHEMA)
    await emptyDatabase.transaction(
      "rw",
      [
        emptyDatabase.table("customers"),
        emptyDatabase.table("orders"),
        emptyDatabase.table("orderLines"),
        emptyDatabase.table("notes"),
        emptyDatabase.table("activities"),
      ],
      async () => {
        await Promise.all(
          ["customers", "orders", "orderLines", "notes", "activities"].map(
            (table) => emptyDatabase.table(table).clear()
          )
        )
      }
    )
    emptyDatabase.close()
    await expect(
      createRepository(emptyName).initialize()
    ).rejects.toBeInstanceOf(CommerceValidationError)

    const noteName = `commerce-${crypto.randomUUID()}`
    const baseSeed = createCommerceSeed()
    const noteSeed = {
      ...baseSeed,
      notes: [
        {
          id: "NOTE-BASELINE-1",
          customerId: baseSeed.customers[0].id,
          text: "Baseline note",
          createdAt: baseSeed.customers[0].createdAt,
          updatedAt: baseSeed.customers[0].createdAt,
        },
      ],
    }
    const noteRepository = createRepository(noteName, noteSeed)
    await noteRepository.initialize()
    noteRepository.close()
    const noteDatabase = new Dexie(noteName)
    noteDatabase.version(1).stores(COMMERCE_DATABASE_SCHEMA)
    await noteDatabase.table("notes").delete("NOTE-BASELINE-1")
    noteDatabase.close()

    await expect(
      createRepository(noteName, noteSeed).initialize()
    ).rejects.toBeInstanceOf(CommerceValidationError)
  })
})
