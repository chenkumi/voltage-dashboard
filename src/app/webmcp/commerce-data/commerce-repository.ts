import { Dexie, type EntityTable } from "dexie"
import { createCommerceSeed } from "./commerce-seed"
import {
  assertPlainTextNote,
  assertValidCustomerActivity,
  assertValidCustomerNote,
  assertValidOrder,
  assertValidOrderLines,
  assertValidStoredCustomer,
  CommerceValidationError,
  CUSTOMER_ID_PATTERN,
  normalizeCustomerInput,
  normalizeEmail,
} from "./commerce-validation"
import type {
  CommerceDataSnapshot,
  CommerceMutation,
  Customer,
  CustomerActivity,
  CustomerNote,
  CustomerWriteInput,
  Order,
  OrderLine,
} from "./types"

type StoredCustomer = Customer & { normalizedEmail: string }

type CommerceMetadata = {
  key: "commerce-seed"
  version: number
  initializedAt: string
}

type CommerceDatabase = Dexie & {
  customers: EntityTable<StoredCustomer, "id">
  orders: EntityTable<Order, "id">
  orderLines: EntityTable<OrderLine, "id">
  notes: EntityTable<CustomerNote, "id">
  activities: EntityTable<CustomerActivity, "id">
  metadata: EntityTable<CommerceMetadata, "key">
}

type CommerceRepositoryOptions = {
  databaseName?: string
  seed?: CommerceDataSnapshot
  now?: () => string
  createId?: () => string
}

export const COMMERCE_SEED_VERSION = 3

export class CommerceRepositoryError extends Error {
  readonly code:
    | "CUSTOMER_NOT_FOUND"
    | "NOTE_NOT_FOUND"
    | "INVALID_IDENTIFIER"
    | "INVALID_TIMESTAMP"

  constructor(code: CommerceRepositoryError["code"], message: string) {
    super(message)
    this.name = "CommerceRepositoryError"
    this.code = code
  }
}

const createDatabase = (name: string) => {
  const database = new Dexie(name) as CommerceDatabase
  database.version(1).stores(COMMERCE_DATABASE_SCHEMA)
  return database
}

export const COMMERCE_DATABASE_SCHEMA = {
  customers:
    "id, &normalizedEmail, status, segment, region, createdAt, updatedAt",
  orders:
    "id, customerId, status, paymentStatus, fulfillmentStatus, createdAt, [customerId+createdAt]",
  orderLines: "id, orderId, productId, sku, [orderId+productId]",
  notes: "id, customerId, createdAt, updatedAt",
  activities: "id, customerId, type, occurredAt, [customerId+occurredAt]",
  metadata: "key",
} as const

const clone = <T>(value: T): T => structuredClone(value)

const toStoredCustomer = (customer: Customer): StoredCustomer => ({
  ...clone(customer),
  normalizedEmail: normalizeEmail(customer.contact.email),
})

const fromStoredCustomer = (storedCustomer: StoredCustomer) => {
  const { normalizedEmail, ...customer } = storedCustomer
  void normalizedEmail
  return clone(customer)
}

function assertValidStoredCustomerRecord(
  value: unknown
): asserts value is StoredCustomer {
  assertValidStoredCustomer(value)
  const record = value as Customer & Record<string, unknown>
  if (
    !isRecord(record) ||
    record.normalizedEmail !== normalizeEmail(record.contact.email)
  ) {
    throw new CommerceValidationError(
      "INVALID_SEED",
      "Stored customer Email index is inconsistent."
    )
  }
}

const sortedByCreatedAt = <T extends { createdAt: string }>(items: T[]) =>
  items.sort((left, right) => right.createdAt.localeCompare(left.createdAt))

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

const assertUniqueSeedIds = (
  items: readonly { id: string }[],
  label: string
) => {
  const ids = new Set(items.map((item) => item.id))
  if (ids.size !== items.length) {
    throw new CommerceValidationError(
      "INVALID_SEED",
      `Commerce seed contains duplicate ${label} IDs.`
    )
  }
}

function assertEntityId(
  value: unknown,
  pattern: RegExp,
  label: string
): asserts value is string {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new CommerceRepositoryError(
      "INVALID_IDENTIFIER",
      `${label} identifier is invalid.`
    )
  }
}

export class CommerceRepository {
  private readonly database: CommerceDatabase
  private readonly seed: CommerceDataSnapshot
  private readonly now: () => string
  private readonly createId: () => string
  private readonly listeners = new Set<
    (mutation: CommerceMutation) => void | Promise<void>
  >()
  private mutationVersion = 0

  constructor(options: CommerceRepositoryOptions = {}) {
    this.database = createDatabase(
      options.databaseName ?? "webmcp-agent-commerce-v1"
    )
    this.seed = options.seed ?? createCommerceSeed()
    this.now = options.now ?? (() => new Date().toISOString())
    this.createId = options.createId ?? (() => crypto.randomUUID())
  }

  async initialize() {
    this.assertValidSnapshot(this.seed)
    let inserted = false
    let existingDatabase = false
    await this.database.transaction(
      "rw",
      [
        this.database.customers,
        this.database.orders,
        this.database.orderLines,
        this.database.notes,
        this.database.activities,
        this.database.metadata,
      ],
      async () => {
        const metadata = await this.database.metadata.get("commerce-seed")
        if (metadata) {
          this.assertValidMetadata(metadata)
          existingDatabase = true
          if (metadata.version < COMMERCE_SEED_VERSION) {
            await Promise.all([
              this.database.orders.bulkPut(this.seed.orders.map(clone)),
              this.database.orderLines.bulkPut(this.seed.orderLines.map(clone)),
              this.database.activities.bulkPut(this.seed.activities.map(clone)),
            ])
            await this.database.metadata.put({
              ...metadata,
              version: COMMERCE_SEED_VERSION,
            })
            inserted = true
          }
          return
        }
        const counts = await Promise.all([
          this.database.customers.count(),
          this.database.orders.count(),
          this.database.orderLines.count(),
          this.database.notes.count(),
          this.database.activities.count(),
        ])
        if (counts.some((count) => count > 0)) {
          throw new CommerceValidationError(
            "INVALID_SEED",
            "Commerce database is partially initialized without seed metadata."
          )
        }
        if (counts.every((count) => count === 0)) {
          await Promise.all([
            this.database.customers.bulkAdd(
              this.seed.customers.map(toStoredCustomer)
            ),
            this.database.orders.bulkAdd(this.seed.orders.map(clone)),
            this.database.orderLines.bulkAdd(this.seed.orderLines.map(clone)),
            this.database.notes.bulkAdd(this.seed.notes.map(clone)),
            this.database.activities.bulkAdd(this.seed.activities.map(clone)),
          ])
          inserted = true
        }
        await this.database.metadata.put({
          key: "commerce-seed",
          version: COMMERCE_SEED_VERSION,
          initializedAt: this.getTimestamp(),
        })
      }
    )
    if (existingDatabase) await this.getSnapshot()
    if (inserted) await this.emit({ type: "initialize" })
  }

  async getSnapshot(): Promise<CommerceDataSnapshot> {
    return this.database.transaction(
      "r",
      this.database.customers,
      this.database.orders,
      this.database.orderLines,
      this.database.notes,
      this.database.activities,
      async () => {
        const [customers, orders, orderLines, notes, activities] =
          await Promise.all([
            this.database.customers.toArray(),
            this.database.orders.toArray(),
            this.database.orderLines.toArray(),
            this.database.notes.toArray(),
            this.database.activities.toArray(),
          ])
        const snapshot = {
          customers,
          orders,
          orderLines,
          notes,
          activities,
        }
        this.assertValidSnapshot(snapshot, true)
        this.assertBaselinePresent(snapshot)
        return {
          customers: customers
            .map(fromStoredCustomer)
            .sort((left, right) => left.id.localeCompare(right.id)),
          orders: sortedByCreatedAt(orders.map(clone)),
          orderLines: orderLines
            .map(clone)
            .sort((left, right) => left.id.localeCompare(right.id)),
          notes: sortedByCreatedAt(notes.map(clone)),
          activities: activities
            .map(clone)
            .sort((left, right) =>
              right.occurredAt.localeCompare(left.occurredAt)
            ),
        }
      }
    )
  }

  async getCustomer(customerId: string) {
    assertEntityId(customerId, CUSTOMER_ID_PATTERN, "Customer")
    const customer = await this.database.customers.get(customerId)
    if (customer) assertValidStoredCustomerRecord(customer)
    return customer ? fromStoredCustomer(customer) : null
  }

  async createCustomer(input: CustomerWriteInput) {
    const normalized = normalizeCustomerInput(input)
    const timestamp = this.getTimestamp()
    const customer = await this.database.transaction(
      "rw",
      this.database.customers,
      this.database.activities,
      async () => {
        await this.assertEmailAvailable(normalized.contact.email)
        const customerIds = await this.database.customers
          .toCollection()
          .primaryKeys()
        const lastNumber = customerIds.reduce((highest, id) => {
          const match = CUSTOMER_ID_PATTERN.exec(String(id))
          return match ? Math.max(highest, Number(match[1])) : highest
        }, 1000)
        const created: Customer = {
          ...clone(normalized),
          id: `CUST-${lastNumber + 1}`,
          status: "active",
          createdAt: timestamp,
          updatedAt: timestamp,
          suspendedAt: null,
        }
        assertEntityId(created.id, CUSTOMER_ID_PATTERN, "Customer")
        await this.database.customers.add(toStoredCustomer(created))
        await this.addActivity(created.id, "customer_created", null, timestamp)
        return created
      }
    )
    await this.emit({ type: "customer_create", customerId: customer.id })
    return clone(customer)
  }

  async updateCustomer(customerId: string, input: CustomerWriteInput) {
    assertEntityId(customerId, CUSTOMER_ID_PATTERN, "Customer")
    const normalized = normalizeCustomerInput(input)
    const customer = await this.database.transaction(
      "rw",
      this.database.customers,
      this.database.notes,
      this.database.activities,
      async () => {
        const existing = await this.requireCustomer(customerId)
        await this.assertEmailAvailable(normalized.contact.email, customerId)
        const timestamp = this.getTimestamp(
          await this.getCustomerMutationLowerBound(
            customerId,
            existing.updatedAt
          )
        )
        const updated: Customer = {
          ...fromStoredCustomer(existing),
          ...clone(normalized),
          updatedAt: timestamp,
        }
        await this.database.customers.put(toStoredCustomer(updated))
        await this.addActivity(
          customerId,
          "customer_updated",
          null,
          updated.updatedAt
        )
        return updated
      }
    )
    await this.emit({ type: "customer_update", customerId })
    return clone(customer)
  }

  async suspendCustomer(customerId: string, reasonCode: string) {
    return this.changeCustomerStatus(customerId, "suspended", reasonCode)
  }

  async restoreCustomer(customerId: string, reasonCode: string) {
    return this.changeCustomerStatus(customerId, "active", reasonCode)
  }

  async addNote(customerId: string, text: string) {
    assertEntityId(customerId, CUSTOMER_ID_PATTERN, "Customer")
    const normalized = assertPlainTextNote(text)
    const note = await this.database.transaction(
      "rw",
      this.database.customers,
      this.database.notes,
      this.database.activities,
      async () => {
        const customer = await this.requireCustomer(customerId)
        const timestamp = this.getTimestamp(
          await this.getCustomerMutationLowerBound(
            customerId,
            customer.updatedAt
          )
        )
        const noteId = `NOTE-${this.createId()}`
        assertEntityId(noteId, /^NOTE-[A-Za-z0-9-]+$/, "Note")
        const created: CustomerNote = {
          id: noteId,
          customerId,
          text: normalized,
          createdAt: timestamp,
          updatedAt: timestamp,
        }
        await this.database.notes.add(created)
        await this.addActivity(customerId, "note_added", null, timestamp)
        return created
      }
    )
    await this.emit({ type: "note_add", customerId })
    return clone(note)
  }

  async updateNote(noteId: string, text: string) {
    assertEntityId(noteId, /^NOTE-[A-Za-z0-9-]+$/, "Note")
    const normalized = assertPlainTextNote(text)
    const note = await this.database.transaction(
      "rw",
      this.database.customers,
      this.database.notes,
      this.database.activities,
      async () => {
        const existing = await this.database.notes.get(noteId)
        if (!existing) {
          throw new CommerceRepositoryError(
            "NOTE_NOT_FOUND",
            "Customer note was not found."
          )
        }
        assertValidCustomerNote(existing)
        const customer = await this.requireCustomer(existing.customerId)
        const timestamp = this.getTimestamp(
          await this.getCustomerMutationLowerBound(
            existing.customerId,
            customer.updatedAt
          )
        )
        const updated = {
          ...existing,
          text: normalized,
          updatedAt: timestamp,
        }
        await this.database.notes.put(updated)
        return updated
      }
    )
    await this.emit({ type: "note_update", customerId: note.customerId })
    return clone(note)
  }

  subscribe(listener: (mutation: CommerceMutation) => void | Promise<void>) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  close() {
    this.database.close()
  }

  async deleteDatabaseForTests() {
    this.close()
    await Dexie.delete(this.database.name)
  }

  private assertValidSnapshot(
    snapshot: CommerceDataSnapshot,
    storedCustomers = false
  ) {
    if (
      !snapshot ||
      !Array.isArray(snapshot.customers) ||
      !Array.isArray(snapshot.orders) ||
      !Array.isArray(snapshot.orderLines) ||
      !Array.isArray(snapshot.notes) ||
      !Array.isArray(snapshot.activities)
    ) {
      throw new CommerceValidationError(
        "INVALID_SEED",
        "Commerce seed must contain all required collections."
      )
    }
    const emails = new Set<string>()
    for (const customer of snapshot.customers) {
      if (storedCustomers) assertValidStoredCustomerRecord(customer)
      else assertValidStoredCustomer(customer)
      const normalizedEmail = normalizeEmail(customer.contact.email)
      if (emails.has(normalizedEmail)) {
        throw new CommerceValidationError(
          "INVALID_SEED",
          "Commerce seed contains duplicate customer Emails."
        )
      }
      emails.add(normalizedEmail)
    }
    assertUniqueSeedIds(snapshot.customers, "customer")
    const customersById = new Map(
      snapshot.customers.map((customer) => [customer.id, customer])
    )
    for (const order of snapshot.orders) {
      if (!isRecord(order) || typeof order.customerId !== "string") {
        throw new CommerceValidationError(
          "INVALID_SEED",
          "Commerce seed contains an invalid order."
        )
      }
      const customer = customersById.get(order.customerId)
      if (!customer) {
        throw new CommerceValidationError(
          "INVALID_SEED",
          `Order ${order.id} references a missing customer.`
        )
      }
      assertValidOrder(order, snapshot.orderLines, customer)
    }
    assertValidOrderLines(snapshot.orderLines)
    assertUniqueSeedIds(snapshot.orders, "order")
    assertUniqueSeedIds(snapshot.orderLines, "order line")
    for (const note of snapshot.notes) assertValidCustomerNote(note)
    assertUniqueSeedIds(snapshot.notes, "note")
    for (const activity of snapshot.activities) {
      assertValidCustomerActivity(activity)
    }
    assertUniqueSeedIds(snapshot.activities, "activity")
    const orderIds = new Set(snapshot.orders.map((order) => order.id))
    for (const line of snapshot.orderLines) {
      if (!orderIds.has(line.orderId)) {
        throw new CommerceValidationError(
          "INVALID_SEED",
          `Order line ${line.id} references a missing order.`
        )
      }
    }
    for (const item of [...snapshot.notes, ...snapshot.activities]) {
      if (!customersById.has(item.customerId)) {
        throw new CommerceValidationError(
          "INVALID_SEED",
          `Commerce record ${item.id} references a missing customer.`
        )
      }
    }
    const timelineIds = snapshot.orders.flatMap((order) =>
      order.timeline.map((entry: Order["timeline"][number]) => entry.id)
    )
    if (new Set(timelineIds).size !== timelineIds.length) {
      throw new CommerceValidationError(
        "INVALID_SEED",
        "Commerce seed contains duplicate timeline IDs."
      )
    }
    for (const customer of snapshot.customers) {
      const lifecycle = snapshot.activities
        .filter(
          (activity) =>
            activity.customerId === customer.id &&
            [
              "customer_created",
              "customer_suspended",
              "customer_restored",
            ].includes(activity.type)
        )
        .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
      let lifecycleStatus: Customer["status"] | "missing" = "missing"
      let lastSuspendedAt: string | null = null
      let previousOccurredAt: string | null = null
      for (const activity of lifecycle) {
        const validTransition =
          (lifecycleStatus === "missing" &&
            activity.type === "customer_created" &&
            activity.occurredAt === customer.createdAt) ||
          (lifecycleStatus === "active" &&
            activity.type === "customer_suspended") ||
          (lifecycleStatus === "suspended" &&
            activity.type === "customer_restored")
        if (
          !validTransition ||
          activity.occurredAt > customer.updatedAt ||
          (previousOccurredAt !== null &&
            activity.occurredAt <= previousOccurredAt)
        ) {
          throw new CommerceValidationError(
            "INVALID_SEED",
            `Customer ${customer.id} has an invalid lifecycle activity.`
          )
        }
        previousOccurredAt = activity.occurredAt
        if (activity.type === "customer_created") lifecycleStatus = "active"
        if (activity.type === "customer_suspended") {
          lifecycleStatus = "suspended"
          lastSuspendedAt = activity.occurredAt
        }
        if (activity.type === "customer_restored") lifecycleStatus = "active"
      }
      if (
        lifecycleStatus !== customer.status ||
        (customer.status === "suspended" &&
          customer.suspendedAt !== lastSuspendedAt)
      ) {
        throw new CommerceValidationError(
          "INVALID_SEED",
          `Customer ${customer.id} lifecycle does not match its status.`
        )
      }
    }
  }

  private assertBaselinePresent(snapshot: CommerceDataSnapshot) {
    for (const [label, required, actual] of [
      ["customer", this.seed.customers, snapshot.customers],
      ["order", this.seed.orders, snapshot.orders],
      ["order line", this.seed.orderLines, snapshot.orderLines],
      ["note", this.seed.notes, snapshot.notes],
      ["activity", this.seed.activities, snapshot.activities],
    ] as const) {
      const actualIds = new Set(actual.map((item) => item.id))
      if (required.some((item) => !actualIds.has(item.id))) {
        throw new CommerceValidationError(
          "INVALID_SEED",
          `Commerce database is missing a baseline ${label} record.`
        )
      }
    }
  }

  private assertValidMetadata(value: unknown) {
    if (
      !isRecord(value) ||
      value.key !== "commerce-seed" ||
      !Number.isInteger(value.version) ||
      Number(value.version) < 1 ||
      Number(value.version) > COMMERCE_SEED_VERSION ||
      typeof value.initializedAt !== "string" ||
      !Number.isFinite(Date.parse(value.initializedAt)) ||
      new Date(Date.parse(value.initializedAt)).toISOString() !==
        value.initializedAt
    ) {
      throw new CommerceValidationError(
        "INVALID_SEED",
        "Commerce seed metadata is invalid."
      )
    }
  }

  private async changeCustomerStatus(
    customerId: string,
    status: Customer["status"],
    reasonCode: unknown
  ) {
    assertEntityId(customerId, CUSTOMER_ID_PATTERN, "Customer")
    if (typeof reasonCode !== "string") {
      throw new CommerceValidationError(
        "INVALID_STATUS",
        "A fixed reason code is required."
      )
    }
    const normalizedReason = reasonCode.trim()
    if (!normalizedReason || !/^[a-z0-9_]+$/.test(normalizedReason)) {
      throw new CommerceValidationError(
        "INVALID_STATUS",
        "A fixed reason code is required."
      )
    }
    const customer = await this.database.transaction(
      "rw",
      this.database.customers,
      this.database.notes,
      this.database.activities,
      async () => {
        const existing = await this.requireCustomer(customerId)
        if (existing.status === status) {
          throw new CommerceValidationError(
            "INVALID_STATUS",
            `Customer is already ${status}.`
          )
        }
        const timestamp = this.getTimestamp(
          await this.getCustomerMutationLowerBound(
            customerId,
            existing.updatedAt
          )
        )
        const updated: Customer = {
          ...fromStoredCustomer(existing),
          status,
          suspendedAt: status === "suspended" ? timestamp : null,
          updatedAt: timestamp,
        }
        await this.database.customers.put(toStoredCustomer(updated))
        await this.addActivity(
          customerId,
          status === "suspended" ? "customer_suspended" : "customer_restored",
          normalizedReason,
          timestamp
        )
        return updated
      }
    )
    await this.emit({
      type: status === "suspended" ? "customer_suspend" : "customer_restore",
      customerId,
    })
    return clone(customer)
  }

  private async requireCustomer(customerId: string) {
    assertEntityId(customerId, CUSTOMER_ID_PATTERN, "Customer")
    const customer = await this.database.customers.get(customerId)
    if (!customer) {
      throw new CommerceRepositoryError(
        "CUSTOMER_NOT_FOUND",
        "Customer was not found."
      )
    }
    assertValidStoredCustomerRecord(customer)
    return customer
  }

  private async getCustomerMutationLowerBound(
    customerId: string,
    customerUpdatedAt: string
  ) {
    const [notes, activities] = await Promise.all([
      this.database.notes.where("customerId").equals(customerId).toArray(),
      this.database.activities.where("customerId").equals(customerId).toArray(),
    ])
    for (const note of notes) assertValidCustomerNote(note)
    for (const activity of activities) assertValidCustomerActivity(activity)
    return [
      customerUpdatedAt,
      ...notes.map((note) => note.updatedAt),
      ...activities.map((activity) => activity.occurredAt),
    ].reduce((latest, timestamp) => (timestamp > latest ? timestamp : latest))
  }

  private async assertEmailAvailable(email: string, customerId?: string) {
    const existing = await this.database.customers.get({
      normalizedEmail: normalizeEmail(email),
    })
    if (existing && existing.id !== customerId) {
      throw new CommerceValidationError(
        "DUPLICATE_EMAIL",
        "Customer Email already exists."
      )
    }
  }

  private addActivity(
    customerId: string,
    type: CustomerActivity["type"],
    reasonCode: string | null,
    occurredAt: string
  ) {
    const activityId = `ACT-${this.createId()}`
    assertEntityId(activityId, /^ACT-[A-Za-z0-9-]+$/, "Activity")
    return this.database.activities.add({
      id: activityId,
      customerId,
      type,
      occurredAt,
      reasonCode,
    })
  }

  private getTimestamp(minimum?: string) {
    const timestamp = this.now()
    const parsed = typeof timestamp === "string" ? Date.parse(timestamp) : NaN
    if (
      !Number.isFinite(parsed) ||
      new Date(parsed).toISOString() !== timestamp ||
      (minimum !== undefined && timestamp < minimum)
    ) {
      throw new CommerceRepositoryError(
        "INVALID_TIMESTAMP",
        "Repository clock returned an invalid timestamp."
      )
    }
    if (minimum !== undefined && timestamp === minimum) {
      return new Date(parsed + 1).toISOString()
    }
    return timestamp
  }

  private async emit(mutation: Omit<CommerceMutation, "version">) {
    this.mutationVersion += 1
    const event = { ...mutation, version: this.mutationVersion }
    const results = await Promise.allSettled(
      [...this.listeners].map((listener) => listener(event))
    )
    for (const result of results) {
      if (result.status === "rejected") {
        console.error("Commerce repository listener failed.", result.reason)
      }
    }
  }
}
