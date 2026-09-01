interface Env {
  ASSETS: {
    fetch(request: Request): Promise<Response>
  }
}

export default {
  async fetch(request: Request, env: Env) {
    const response = await env.ASSETS.fetch(request)

    if (response.status !== 404) {
      return response
    }

    const acceptsHtml = request.headers.get("accept")?.includes("text/html")
    const isDocumentRequest = request.method === "GET" || request.method === "HEAD"

    if (!acceptsHtml || !isDocumentRequest) {
      return response
    }

    const indexRequest = new Request(new URL("/", request.url), request)
    return env.ASSETS.fetch(indexRequest)
  },
}
