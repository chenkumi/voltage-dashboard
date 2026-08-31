export type ToolsetReady = {
  status: "READY"
  ready: true
  route: string
  revision: number
  toolsetKey: string
}

export type ToolsetNotReadyReason = "DISPOSED" | "SUPERSEDED" | "TIMEOUT"

export type ToolsetNotReady = {
  status: "TOOLSET_NOT_READY"
  ready: false
  route: string
  revision: number
  toolsetKey: null
  reasonCode: ToolsetNotReadyReason
  retryable: boolean
  message: string
}

export type ToolsetReadinessResult = ToolsetReady | ToolsetNotReady

type PendingReadiness = {
  route: string
  revision: number
  resolve: (result: ToolsetReadinessResult) => void
  timeoutId: ReturnType<typeof setTimeout>
}

export type ToolsetPublication = {
  route: string
  revision: number
  toolsetKey: string
}

const DEFAULT_TIMEOUT_MS = 2_000

export function normalizeToolsetRoute(route: string) {
  const url = new URL(route, "https://webmcp.local")
  return `${url.pathname}${url.search}`
}

export function createToolsetKey(route: string, toolNames: readonly string[]) {
  const pathname = new URL(route, "https://webmcp.local").pathname
  return `${pathname}|${[...toolNames].sort().join(",")}`
}

export class ToolsetReadinessCoordinator {
  private current: ToolsetReady | null = null
  private disposed = false
  private pending: PendingReadiness | null = null
  private revision = 0

  constructor(private readonly timeoutMs = DEFAULT_TIMEOUT_MS) {}

  activate() {
    this.disposed = false
  }

  waitFor(route: string): Promise<ToolsetReadinessResult> {
    const normalizedRoute = normalizeToolsetRoute(route)

    if (this.disposed) {
      return Promise.resolve(
        this.notReady(normalizedRoute, this.revision, "DISPOSED")
      )
    }

    if (this.current?.route === normalizedRoute) {
      return Promise.resolve(this.current)
    }

    this.settlePending("SUPERSEDED")
    const revision = ++this.revision

    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        if (this.pending?.revision !== revision) return
        this.pending = null
        resolve(this.notReady(normalizedRoute, revision, "TIMEOUT"))
      }, this.timeoutMs)

      this.pending = {
        route: normalizedRoute,
        revision,
        resolve,
        timeoutId,
      }
    })
  }

  preparePublish(route: string, toolsetKey: string): ToolsetPublication {
    const normalizedRoute = normalizeToolsetRoute(route)

    if (
      this.current?.route === normalizedRoute &&
      this.current.toolsetKey === toolsetKey
    ) {
      return {
        route: normalizedRoute,
        revision: this.current.revision,
        toolsetKey,
      }
    }

    if (this.pending && this.pending.route !== normalizedRoute) {
      this.settlePending("SUPERSEDED")
    }

    const revision =
      this.pending?.route === normalizedRoute
        ? this.pending.revision
        : ++this.revision

    return { route: normalizedRoute, revision, toolsetKey }
  }

  publish(publication: ToolsetPublication): ToolsetReady | null {
    if (this.disposed || publication.revision < this.revision) return null

    if (
      this.current?.route === publication.route &&
      this.current.revision === publication.revision &&
      this.current.toolsetKey === publication.toolsetKey
    ) {
      return this.current
    }

    const { revision, route, toolsetKey } = publication
    const ready: ToolsetReady = {
      status: "READY",
      ready: true,
      route,
      revision,
      toolsetKey,
    }

    this.current = ready
    if (
      this.pending?.route === route &&
      this.pending.revision === revision
    ) {
      const matchingPending = this.pending
      this.pending = null
      clearTimeout(matchingPending.timeoutId)
      matchingPending.resolve(ready)
    }
    return ready
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.current = null
    this.settlePending("DISPOSED")
  }

  cancelPending() {
    this.current = null
    this.settlePending("DISPOSED")
  }

  private settlePending(reasonCode: ToolsetNotReadyReason) {
    const pending = this.pending
    if (!pending) return
    clearTimeout(pending.timeoutId)
    this.pending = null
    pending.resolve(this.notReady(pending.route, pending.revision, reasonCode))
  }

  private notReady(
    route: string,
    revision: number,
    reasonCode: ToolsetNotReadyReason
  ): ToolsetNotReady {
    const retryable = reasonCode === "TIMEOUT"
    const message =
      reasonCode === "TIMEOUT"
        ? "The destination toolset was not published before the readiness timeout."
        : reasonCode === "SUPERSEDED"
          ? "A newer navigation replaced this pending toolset."
          : "The WebMCP provider was disposed before the toolset became ready."

    return {
      status: "TOOLSET_NOT_READY",
      ready: false,
      route,
      revision,
      toolsetKey: null,
      reasonCode,
      retryable,
      message,
    }
  }
}
