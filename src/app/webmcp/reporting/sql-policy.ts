import { REPORTING_DATASETS } from "./reporting-data"
import type { SqlQueryInput, SqlScalar } from "./types"

export const MAX_SQL_LENGTH = 8_000
export const MAX_SQL_PARAMETERS = 50
export const MAX_RESULT_ROWS = 100
export const MAX_RESULT_COLUMNS = 32
export const MAX_RESULT_STRING_LENGTH = 4_000
export const MAX_QUERY_VM_STEPS = 250_000
export const MAX_QUERY_TIME_MS = 250

export const ALLOWED_REPORTING_TABLES = new Set<string>([
  ...REPORTING_DATASETS,
  "sqlite_schema",
  "sqlite_master",
])

export const ALLOWED_REPORTING_FUNCTIONS = new Set([
  "abs",
  "avg",
  "coalesce",
  "count",
  "date",
  "datetime",
  "ifnull",
  "julianday",
  "length",
  "lower",
  "max",
  "min",
  "nullif",
  "printf",
  "round",
  "strftime",
  "substr",
  "sum",
  "time",
  "total",
  "trim",
  "typeof",
  "upper",
])

const PROHIBITED_SQL_TOKENS = new Set([
  "alter",
  "analyze",
  "attach",
  "begin",
  "commit",
  "create",
  "delete",
  "detach",
  "drop",
  "insert",
  "load_extension",
  "pragma",
  "reindex",
  "release",
  "replace",
  "rollback",
  "savepoint",
  "update",
  "vacuum",
])

export class SqlPolicyError extends Error {
  readonly category = "SQL_POLICY_ERROR"

  constructor(message: string) {
    super(message)
    this.name = "SqlPolicyError"
  }
}

const isSqlScalar = (value: unknown): value is SqlScalar =>
  value === null ||
  typeof value === "string" ||
  (typeof value === "number" && Number.isFinite(value)) ||
  typeof value === "boolean"

const maskSqlLiteralsAndComments = (sql: string) => {
  let masked = ""
  let index = 0

  while (index < sql.length) {
    const char = sql[index]
    const next = sql[index + 1]

    if (char === "-" && next === "-") {
      index += 2
      while (index < sql.length && sql[index] !== "\n") index += 1
      masked += " "
      continue
    }

    if (char === "/" && next === "*") {
      const end = sql.indexOf("*/", index + 2)
      if (end < 0) throw new SqlPolicyError("SQL contains an unterminated comment.")
      index = end + 2
      masked += " "
      continue
    }

    if (char === "'" || char === '"' || char === "`") {
      const quote = char
      masked += " "
      index += 1
      let closed = false
      while (index < sql.length) {
        if (sql[index] === quote) {
          if (sql[index + 1] === quote) {
            index += 2
            continue
          }
          index += 1
          closed = true
          break
        }
        index += 1
      }
      if (!closed) throw new SqlPolicyError("SQL contains an unterminated literal.")
      continue
    }

    if (char === "[") {
      const end = sql.indexOf("]", index + 1)
      if (end < 0)
        throw new SqlPolicyError("SQL contains an unterminated identifier.")
      index = end + 1
      masked += " "
      continue
    }

    masked += char
    index += 1
  }

  return masked
}

export const hasPositionalSqlPlaceholder = (sql: string) =>
  maskSqlLiteralsAndComments(sql).includes("?")

export const validateReadonlySql = (input: SqlQueryInput) => {
  const sql = input.sql.trim()
  if (!sql) throw new SqlPolicyError("SQL query is required.")
  if (sql.length > MAX_SQL_LENGTH)
    throw new SqlPolicyError(`SQL exceeds ${MAX_SQL_LENGTH} characters.`)

  const parameters = input.parameters ?? []
  if (parameters.length > MAX_SQL_PARAMETERS)
    throw new SqlPolicyError(
      `SQL accepts at most ${MAX_SQL_PARAMETERS} parameters.`
    )
  if (!parameters.every(isSqlScalar))
    throw new SqlPolicyError("SQL parameters must be JSON scalar values.")

  const masked = maskSqlLiteralsAndComments(sql)
  const semicolons = [...masked.matchAll(/;/g)].map((match) => match.index ?? -1)
  if (semicolons.length > 1)
    throw new SqlPolicyError("Only one SQL statement is allowed.")
  if (semicolons.length === 1 && masked.slice(semicolons[0] + 1).trim())
    throw new SqlPolicyError("Only one SQL statement is allowed.")

  const tokens = masked.toLowerCase().match(/[a-z_][a-z0-9_]*/g) ?? []
  if (tokens[0] !== "select" && tokens[0] !== "with")
    throw new SqlPolicyError("Only SELECT or WITH queries are allowed.")
  const prohibited = tokens.find((token) => PROHIBITED_SQL_TOKENS.has(token))
  if (prohibited)
    throw new SqlPolicyError(`SQL token '${prohibited}' is not allowed.`)

  return { sql, parameters }
}
