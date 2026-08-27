import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const root = process.cwd()
const readSource = (path) => readFileSync(resolve(root, path), "utf8")
const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

assert(!existsSync(resolve(root, "src/app/webmcp/bridge.ts")), "Global bridge module must not be restored.")

const agent = readSource("src/app/webmcp/agent.ts")
const transport = readSource("src/app/webmcp/transport.ts")
const workspace = readSource("src/app/webmcp/workspace.tsx")
const session = readSource("src/app/webmcp/session.ts")

assert(!agent.includes("./bridge"), "Agent must receive a PreparedWebMcpTurn, not import iframe runtime.")
assert(!transport.includes("./bridge"), "Transport must receive a WebMcpSession, not import iframe runtime.")
assert(workspace.includes("./session"), "Workspace must attach the session scoped to its ChatSession.")
assert(session.includes("export type PreparedWebMcpTurn"), "Session must expose the immutable turn contract.")
assert(!session.includes("export const webMcpBridge"), "Session must not expose a module-level singleton.")

console.log("WebMCP architecture boundaries are intact.")
