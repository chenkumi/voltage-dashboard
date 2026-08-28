import type { WebMcpRegisteredTool } from "./types"

export type CompletionVerifierMap = Readonly<Record<string, string>>
export const COMPLETION_VERIFIER_SCHEMA_KEY =
  "x-webmcp-completion-verifier" as const

type CompletionPart = {
  type: string
  toolName?: string
}

export type CompletionStep = {
  content?: readonly CompletionPart[]
  toolResults?: readonly { toolName: string }[]
}

export type CompletionState = Readonly<{
  pendingVerifiers: readonly string[]
  failedVerifiers: readonly string[]
  failedTools: readonly string[]
  unverified: boolean
}>

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

export const evaluateCompletionState = (
  steps: readonly CompletionStep[],
  verifierMap: CompletionVerifierMap
): CompletionState => {
  const pending = new Set<string>()
  const failed = new Set<string>()
  const unresolvedFailures = new Set<string>()
  const verifierNames = new Set(Object.values(verifierMap))

  for (const step of steps) {
    const successfulTools = new Set(
      (step.toolResults ?? []).map((result) => result.toolName)
    )
    const stepFailedTools = new Set(
      (step.content ?? [])
        .filter((part) => part.type === "tool-error")
        .map((part) => part.toolName)
        .filter((name): name is string => typeof name === "string")
    )

    for (const verifier of successfulTools) {
      pending.delete(verifier)
      failed.delete(verifier)
    }
    for (const verifier of stepFailedTools) {
      if (
        verifierNames.has(verifier) &&
        (pending.delete(verifier) || failed.has(verifier))
      )
        failed.add(verifier)
      else unresolvedFailures.add(verifier)
    }
    for (const mutation of successfulTools) {
      const verifier = verifierMap[mutation]
      if (verifier) pending.add(verifier)
    }
  }

  const pendingVerifiers = Object.freeze([...pending].sort())
  const failedVerifiers = Object.freeze([...failed].sort())
  const unresolvedFailedTools = Object.freeze([...unresolvedFailures].sort())
  return Object.freeze({
    pendingVerifiers,
    failedVerifiers,
    failedTools: unresolvedFailedTools,
    unverified: pendingVerifiers.length > 0 || failedVerifiers.length > 0,
  })
}
