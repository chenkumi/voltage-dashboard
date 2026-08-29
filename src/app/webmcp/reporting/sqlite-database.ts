import sqlite3InitModule from "@sqlite.org/sqlite-wasm"
import {
  DEFAULT_REPORTING_DATA,
  REPORTING_SCHEMA_SQL,
  type ReportingDataSnapshot,
} from "./reporting-data"
import {
  ALLOWED_REPORTING_FUNCTIONS,
  ALLOWED_REPORTING_TABLES,
  MAX_QUERY_TIME_MS,
  MAX_QUERY_VM_STEPS,
  MAX_RESULT_COLUMNS,
  MAX_RESULT_ROWS,
  MAX_RESULT_STRING_LENGTH,
  SqlPolicyError,
  validateReadonlySql,
} from "./sql-policy"
import type {
  SqlColumn,
  SqlQueryInput,
  SqlQueryResult,
  SqlScalar,
} from "./types"

type Sqlite3 = Awaited<ReturnType<typeof sqlite3InitModule>>
type Database = InstanceType<Sqlite3["oo1"]["DB"]>

export class ReportingDatabaseError extends Error {
  readonly category: string

  constructor(category: string, message: string) {
    super(message)
    this.category = category
    this.name = "ReportingDatabaseError"
  }
}

const normalizeValue = (value: unknown) => {
  let normalized: SqlScalar
  if (value === null) normalized = null
  else if (typeof value === "string") normalized = value
  else if (typeof value === "number")
    normalized = Number.isFinite(value) ? value : String(value)
  else if (typeof value === "bigint") normalized = value.toString()
  else if (typeof value === "boolean") normalized = value
  else if (value instanceof Uint8Array)
    normalized = Array.from(value, (byte) =>
      byte.toString(16).padStart(2, "0")
    ).join("")
  else normalized = String(value)

  if (
    typeof normalized === "string" &&
    normalized.length > MAX_RESULT_STRING_LENGTH
  ) {
    return {
      value: normalized.slice(0, MAX_RESULT_STRING_LENGTH),
      truncated: true,
    }
  }
  return { value: normalized, truncated: false }
}

const inferColumnType = (values: SqlScalar[]): SqlColumn["type"] => {
  const value = values.find((candidate) => candidate !== null)
  if (value === undefined) return "null"
  if (typeof value === "number") return "number"
  if (typeof value === "boolean") return "boolean"
  return "string"
}

const insertRows = (
  database: Database,
  sql: string,
  rows: readonly (readonly unknown[])[]
) => {
  const statement = database.prepare(sql)
  try {
    for (const row of rows) {
      statement
        .bind([...row] as never)
        .stepReset()
        .clearBindings()
    }
  } finally {
    statement.finalize()
  }
}

export class SqliteReportingDatabase {
  private readonly sqlite3: Sqlite3
  private readonly database: Database

  private constructor(sqlite3: Sqlite3, database: Database) {
    this.sqlite3 = sqlite3
    this.database = database
  }

  static async create(
    snapshot: ReportingDataSnapshot = DEFAULT_REPORTING_DATA
  ) {
    const sqlite3 = await sqlite3InitModule()
    const database = new sqlite3.oo1.DB(":memory:", "c")
    try {
      database.exec("PRAGMA foreign_keys = ON")
      database.exec(REPORTING_SCHEMA_SQL)
      insertRows(
        database,
        "INSERT INTO agent_products VALUES (?, ?, ?, ?, ?, ?, ?)",
        snapshot.products
      )
      insertRows(
        database,
        "INSERT INTO agent_sales_daily VALUES (?, ?, ?, ?)",
        snapshot.sales
      )
      insertRows(
        database,
        "INSERT INTO agent_inventory VALUES (?, ?, ?)",
        snapshot.inventory
      )
      insertRows(
        database,
        "INSERT INTO agent_dataset_status VALUES (?, ?, ?, ?, ?, ?)",
        snapshot.datasetStatus
      )
      database.exec("PRAGMA query_only = ON")
      const reportingDatabase = new SqliteReportingDatabase(sqlite3, database)
      reportingDatabase.installAuthorizer()
      return reportingDatabase
    } catch (error) {
      database.close()
      throw error
    }
  }

  execute(input: SqlQueryInput): SqlQueryResult {
    let validated: ReturnType<typeof validateReadonlySql>
    try {
      validated = validateReadonlySql(input)
    } catch (error) {
      if (error instanceof SqlPolicyError)
        throw new ReportingDatabaseError(error.category, error.message)
      throw error
    }

    const startedAt = performance.now()
    let vmSteps = 0
    let outputTruncated = false
    let statement: ReturnType<Database["prepare"]> | undefined
    try {
      statement = this.database.prepare(validated.sql)
      const columnNames = statement.getColumnNames()
      if (columnNames.length > MAX_RESULT_COLUMNS) {
        throw new ReportingDatabaseError(
          "SQL_RESULT_LIMIT",
          `Query returns more than ${MAX_RESULT_COLUMNS} columns.`
        )
      }

      this.sqlite3.capi.sqlite3_progress_handler(
        this.database,
        1_000,
        () => {
          vmSteps += 1_000
          return vmSteps > MAX_QUERY_VM_STEPS ||
            performance.now() - startedAt > MAX_QUERY_TIME_MS
            ? 1
            : 0
        },
        0 as never
      )

      if (validated.parameters.length) statement.bind(validated.parameters)
      const rows: Array<Record<string, SqlScalar>> = []
      while (statement.step()) {
        if (rows.length >= MAX_RESULT_ROWS) {
          outputTruncated = true
          break
        }
        const raw = statement.get({}) as Record<string, unknown>
        const row: Record<string, SqlScalar> = {}
        for (const [name, value] of Object.entries(raw)) {
          const normalized = normalizeValue(value)
          row[name] = normalized.value
          outputTruncated ||= normalized.truncated
        }
        rows.push(row)
      }

      const columns = columnNames.map((name) => ({
        name,
        type: inferColumnType(rows.map((row) => row[name])),
      }))
      return {
        columns,
        rows,
        rowCount: rows.length,
        truncated: outputTruncated,
        executionTimeMs: Math.max(0, performance.now() - startedAt),
      }
    } catch (error) {
      if (error instanceof ReportingDatabaseError) throw error
      throw new ReportingDatabaseError(
        "SQL_EXECUTION_ERROR",
        "The read-only SQL query could not be executed."
      )
    } finally {
      this.sqlite3.capi.sqlite3_progress_handler(
        this.database,
        0,
        0 as never,
        0 as never
      )
      statement?.finalize()
    }
  }

  close() {
    this.database.close()
  }

  private installAuthorizer() {
    const { capi } = this.sqlite3
    const result = capi.sqlite3_set_authorizer(
      this.database,
      (_context, action, arg1, arg2, databaseName) => {
        if (action === capi.SQLITE_SELECT || action === capi.SQLITE_RECURSIVE)
          return capi.SQLITE_OK
        if (action === capi.SQLITE_READ) {
          const table = typeof arg1 === "string" ? arg1.toLowerCase() : ""
          const schema =
            typeof databaseName === "string" ? databaseName.toLowerCase() : ""
          // sqlite-wasm may report an empty schema for main-table reads. ATTACH,
          // temp schema creation, and every non-allowlisted table remain denied.
          return (schema === "main" || schema === "") &&
            ALLOWED_REPORTING_TABLES.has(table)
            ? capi.SQLITE_OK
            : capi.SQLITE_DENY
        }
        if (action === capi.SQLITE_FUNCTION) {
          const name =
            typeof arg2 === "string"
              ? arg2.toLowerCase()
              : typeof arg1 === "string"
                ? arg1.toLowerCase()
                : ""
          return ALLOWED_REPORTING_FUNCTIONS.has(name)
            ? capi.SQLITE_OK
            : capi.SQLITE_DENY
        }
        return capi.SQLITE_DENY
      },
      0 as never
    )
    if (result !== capi.SQLITE_OK)
      throw new Error("Failed to install the reporting SQL authorizer.")
  }
}
