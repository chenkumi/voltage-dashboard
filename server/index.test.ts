import { describe, expect, it, vi } from "vitest"

import worker from "./index"

function createEnv(fetch: (request: Request) => Promise<Response>) {
  return { ASSETS: { fetch } }
}

describe("Sites SPA worker", () => {
  it("returns an existing static asset without a fallback request", async () => {
    const fetch = vi.fn(async () => new Response("asset", { status: 200 }))
    const request = new Request("https://example.test/assets/app.js")

    const response = await worker.fetch(request, createEnv(fetch))

    expect(response.status).toBe(200)
    expect(await response.text()).toBe("asset")
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("serves the root document when an HTML route is missing", async () => {
    const fetch = vi.fn(async (request: Request) => {
      if (new URL(request.url).pathname === "/") {
        return new Response("<div id=\"root\"></div>", {
          status: 200,
          headers: { "content-type": "text/html" },
        })
      }

      return new Response("Not found", { status: 404 })
    })
    const request = new Request("https://example.test/returns/RMA-2011", {
      headers: { accept: "text/html,application/xhtml+xml" },
    })

    const response = await worker.fetch(request, createEnv(fetch))

    expect(response.status).toBe(200)
    expect(await response.text()).toContain('id="root"')
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(new URL(fetch.mock.calls[1][0].url).pathname).toBe("/")
  })

  it("preserves missing non-document responses", async () => {
    const fetch = vi.fn(async () => new Response("Not found", { status: 404 }))
    const request = new Request("https://example.test/assets/missing.png", {
      headers: { accept: "image/avif,image/webp" },
    })

    const response = await worker.fetch(request, createEnv(fetch))

    expect(response.status).toBe(404)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("does not turn a missing mutation endpoint into HTML", async () => {
    const fetch = vi.fn(async () => new Response("Not found", { status: 404 }))
    const request = new Request("https://example.test/api/items", {
      method: "POST",
      headers: { accept: "text/html" },
    })

    const response = await worker.fetch(request, createEnv(fetch))

    expect(response.status).toBe(404)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
