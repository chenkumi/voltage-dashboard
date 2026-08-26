import { useEffect, useMemo, useRef, useState } from "react"
import { ShoppingBag, Sparkles, WandSparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { WebMcpDocument, WebMcpRegisteredTool, WebMcpTestProvider, WebMcpWindow } from "./types"

type Product = { id: string; name: string; category: string; price: number; accent: string }

const products: Product[] = [
  { id: "p1", name: "Cinder mug", category: "Stoneware", price: 28, accent: "#d97757" },
  { id: "p2", name: "Field notebook", category: "Paper goods", price: 16, accent: "#6b8f71" },
  { id: "p3", name: "Night tea", category: "Small batch", price: 22, accent: "#6d6a9f" },
]

const demoSkills = [
  { name: "catalog-guide", description: "Explains the catalog categories and product selection criteria." },
  { name: "checkout-safety", description: "Lists the confirmation rules for cart and checkout actions." },
]

export const WebMcpDemo = () => {
  const [query, setQuery] = useState("")
  const [cart, setCart] = useState<string[]>([])
  const [lastAction, setLastAction] = useState("Ready for a WebMCP tool call")
  const liveState = useRef({ cart, visibleProductCount: 0 })

  const visibleProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return products
    return products.filter((product) => `${product.name} ${product.category}`.toLowerCase().includes(normalizedQuery))
  }, [query])

  liveState.current = { cart, visibleProductCount: visibleProducts.length }

  useEffect(() => {
    const toolDefinitions: WebMcpRegisteredTool[] = [
      {
        name: "search_catalog",
        description: "Search the embedded catalog by product name or category and update the visible product list.",
        inputSchema: {
          type: "object",
          properties: { query: { type: "string", description: "Product name or category to search for." } },
          required: ["query"],
          additionalProperties: false,
        },
      },
      {
        name: "add_product_to_cart",
        description: "Add one product from the embedded catalog to the shopping cart.",
        inputSchema: {
          type: "object",
          properties: { productId: { type: "string", description: "The product id to add." } },
          required: ["productId"],
          additionalProperties: false,
        },
      },
      {
        name: "get_cart_summary",
        description: "Return the current embedded shopping cart contents and total price.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true },
      },
      {
        name: "agent_instructions",
        description: "Return the embedded page instructions that explain the page purpose and safe operating rules.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true },
      },
      {
        name: "skill_list",
        description: "Return the optional skills available for this embedded page.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true },
      },
      {
        name: "load_skill",
        description: "Read the content of one optional embedded-page skill by name.",
        inputSchema: {
          type: "object",
          properties: { name: { type: "string", description: "The skill name to read." } },
          required: ["name"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true },
      },
    ]

    const modelContext = (document as WebMcpDocument).modelContext
    const controller = new AbortController()

    const registerTools = async () => {
      if (modelContext?.registerTool) {
        await Promise.all(toolDefinitions.map((tool) => modelContext.registerTool?.({
          ...tool,
          execute: async (args: Record<string, unknown>) => executeTool(tool.name, args),
        } as WebMcpRegisteredTool & { execute: (args: Record<string, unknown>) => Promise<unknown> }, { signal: controller.signal })))
        return
      }

      const provider: WebMcpTestProvider = {
        getTools: () => toolDefinitions,
        executeTool: (tool, args) => executeTool(tool.name, args),
      }
      ;(window as WebMcpWindow).__webmcpTestProvider = provider
    }

    const currentWindow = window as WebMcpWindow
    currentWindow.__webmcpReady = registerTools()

    return () => {
      controller.abort()
      delete currentWindow.__webmcpReady
      if (currentWindow.__webmcpTestProvider) delete currentWindow.__webmcpTestProvider
    }

    async function executeTool(name: string, args: Record<string, unknown>) {
      if (name === "agent_instructions") {
        return {
          text: "This embedded page is a small catalog. Help the user discover products and manage the cart. Show the result in the page UI after every action.",
        }
      }

      if (name === "skill_list") {
        return { skills: demoSkills }
      }

      if (name === "load_skill") {
        const skill = demoSkills.find((item) => item.name === args.name)
        if (!skill) return { status: "ARGUMENT_ERROR", message: "Skill not found." }
        return {
          type: "skill",
          name: skill.name,
          text: skill.name === "catalog-guide"
            ? "Prefer product names or categories when searching. Use the product id returned by the page when adding an item to the cart."
            : "Adding an item is reversible. Before checkout or any irreversible action, ask the user to confirm the exact items and total.",
        }
      }

      if (name === "search_catalog") {
        setQuery(typeof args.query === "string" ? args.query : "")
        setLastAction(`Filtered catalog for “${String(args.query ?? "") || "all products"}”`)
        return { content: [{ type: "text", text: `Showing ${liveState.current.visibleProductCount} matching products.` }] }
      }

      if (name === "add_product_to_cart") {
        const product = products.find((item) => item.id === args.productId)
        if (!product) return { status: "ARGUMENT_ERROR", message: "Product not found." }
        setCart((currentCart) => [...currentCart, product.id])
        setLastAction(`Added ${product.name} to cart`)
        return { content: [{ type: "text", text: `${product.name} was added to the cart.` }] }
      }

      const cartProducts = liveState.current.cart.map((id) => products.find((product) => product.id === id)).filter(Boolean) as Product[]
      return {
        items: cartProducts.map((product) => ({ id: product.id, name: product.name, price: product.price })),
        total: cartProducts.reduce((sum, product) => sum + product.price, 0),
      }
    }
  }, [])

  return (
    <main className="min-h-full bg-[#f5f0e8] px-6 py-8 text-[#29302a] sm:px-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-10 flex items-end justify-between gap-4 border-b border-[#29302a]/15 pb-6">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#b45e43]"><Sparkles className="size-4" /> WebMCP demo surface</div>
            <h1 className="font-serif text-4xl tracking-tight sm:text-5xl">Small rituals,<br /><em>better tools.</em></h1>
            <p className="mt-4 max-w-md text-sm leading-6 text-[#29302a]/65">這是一個同源測試網站。右側 Agent 可以透過 WebMCP 工具搜尋商品、加入購物車與讀取摘要。</p>
          </div>
          <div className="hidden rounded-full border border-[#29302a]/15 bg-white/50 px-4 py-2 text-xs sm:block"><ShoppingBag className="mr-2 inline size-4" /> {cart.length} in cart</div>
        </header>

        <div className="mb-6 flex items-center justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#29302a]/45">Catalog</p><p className="mt-1 text-sm text-[#29302a]/65">{lastAction}</p></div>
          <Badge className="bg-[#29302a] text-[#f5f0e8]">iframe provider</Badge>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {visibleProducts.map((product) => (
            <Card key={product.id} className="overflow-hidden border-[#29302a]/10 bg-white/65 shadow-none">
              <div className="h-36" style={{ background: `linear-gradient(135deg, ${product.accent}, #f5f0e8)` }} />
              <CardHeader className="pb-2"><CardTitle className="font-serif text-2xl font-normal">{product.name}</CardTitle></CardHeader>
              <CardContent><div className="flex items-center justify-between text-sm text-[#29302a]/60"><span>{product.category}</span><span>${product.price}</span></div><Button className="mt-5 w-full bg-[#29302a] text-[#f5f0e8] hover:bg-[#475548]" onClick={() => { setCart((currentCart) => [...currentCart, product.id]); setLastAction(`Added ${product.name} to cart`) }}>Add to cart</Button></CardContent>
            </Card>
          ))}
        </div>

        {visibleProducts.length === 0 ? <div className="rounded-2xl border border-dashed border-[#29302a]/20 py-16 text-center text-sm text-[#29302a]/55"><WandSparkles className="mx-auto mb-3 size-5" />No products match this search.</div> : null}
      </div>
    </main>
  )
}
