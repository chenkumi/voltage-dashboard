import { dynamicTool, jsonSchema } from "ai"

export const MAX_WAIT_FOR_MS = 60_000

const waitForSchema = {
  type: "object",
  properties: {
    timeMs: {
      type: "number",
      minimum: 0,
      maximum: MAX_WAIT_FOR_MS,
      description: "The number of milliseconds to wait, up to 60 seconds.",
    },
  },
  required: ["timeMs"],
  additionalProperties: false,
}

const isValidWaitTime = (value: unknown): value is number => {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= MAX_WAIT_FOR_MS
  )
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

const waitFor = (timeMs: number, signal?: AbortSignal) => {
  return new Promise<boolean>((resolve) => {
    if (signal?.aborted) {
      resolve(false)
      return
    }

    const timeout = globalThis.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve(true)
    }, timeMs)
    const onAbort = () => {
      globalThis.clearTimeout(timeout)
      resolve(false)
    }

    signal?.addEventListener("abort", onAbort, { once: true })
  })
}

export const createWaitForTool = () => {
  return dynamicTool({
    description:
      "Wait for a specified time before continuing. Use only when the embedded website needs time to update.",
    inputSchema: jsonSchema(waitForSchema as never),
    metadata: { source: "agent", toolName: "wait_for" },
    execute: async (input, { abortSignal }) => {
      const timeMs = isRecord(input) ? input.timeMs : null

      if (!isValidWaitTime(timeMs)) {
        return {
          status: "ERROR",
          message: `timeMs must be a finite number from 0 to ${MAX_WAIT_FOR_MS}.`,
        }
      }

      const completed = await waitFor(timeMs, abortSignal)

      return completed
        ? { status: "OK", waitedMs: timeMs }
        : { status: "ERROR", message: "Waiting was aborted." }
    },
  })
}
