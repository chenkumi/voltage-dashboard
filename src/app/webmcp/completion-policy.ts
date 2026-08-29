import type { WebMcpRegisteredTool } from "./types"

export type CompletionVerifierMap = Readonly<Record<string, string>>
export const COMPLETION_VERIFIER_SCHEMA_KEY =
  "x-webmcp-completion-verifier" as const

const normalizeSchema = (schema: unknown) => {
  if (typeof schema !== "string") return schema
  try {
    return JSON.parse(schema) as unknown
  } catch {
    return null
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

const hasNoInput = (tool: WebMcpRegisteredTool) => {
  const schema = normalizeSchema(tool.inputSchema)
  if (!isRecord(schema) || schema.type !== "object") return false
  const properties = schema.properties
  const required = schema.required
  return (
    isRecord(properties) &&
    Object.keys(properties).length === 0 &&
    schema.additionalProperties === false &&
    (required === undefined ||
      (Array.isArray(required) && required.length === 0))
  )
}

export const createCompletionVerifierMap = (
  tools: readonly WebMcpRegisteredTool[]
): CompletionVerifierMap => {
  const toolByName = new Map(tools.map((tool) => [tool.name, tool]))
  const entries: Array<[string, string]> = []

  for (const mutation of tools) {
    const mutationSchema = normalizeSchema(mutation.inputSchema)
    const schemaVerifier = isRecord(mutationSchema)
      ? mutationSchema[COMPLETION_VERIFIER_SCHEMA_KEY]
      : undefined
    const verifierName =
      typeof mutation.annotations?.completionVerifier === "string"
        ? mutation.annotations.completionVerifier
        : schemaVerifier
    if (typeof verifierName !== "string" || verifierName === mutation.name)
      continue
    const verifier = toolByName.get(verifierName)
    if (
      !verifier ||
      verifier.annotations?.readOnlyHint !== true ||
      !hasNoInput(verifier)
    )
      continue
    entries.push([mutation.name, verifierName])
  }

  return Object.freeze(Object.fromEntries(entries))
}
