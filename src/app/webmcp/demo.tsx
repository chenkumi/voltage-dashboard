import { useEffect, useMemo, useRef, useState } from "react"
import { useParams } from "react-router"
import { ShoppingBag, Sparkles, WandSparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getWebMcpSite } from "./sites"
import type { WebMcpDocument, WebMcpRegisteredTool, WebMcpTestProvider, WebMcpWindow } from "./types"

type Product = { id: string; name: string; category: string; price: number; accent: string }
type DemoSkill = { name: string; description: string; text: string }
type DemoSiteDefinition = {
  id: string
  name: string
  eyebrow: string
  title: string
  description: string
  addLabel: string
  instructions: string
  products: Product[]
  skills: DemoSkill[]
  tools: { search: string; add: string; summary: string }
}

const demoSites: Record<string, DemoSiteDefinition> = {
  "shop-a": {
    id: "shop-a",
    name: "Cinder Studio",
    eyebrow: "Ceramics and paper goods",
    title: "Small rituals,\nbetter tools.",
    description: "這是 Cinder Studio 同源測試網站。右側 Agent 可以搜尋陶器與紙品、加入購物車並讀取摘要。",
    addLabel: "Add to studio cart",
    instructions: "This page is Cinder Studio, a small catalog of ceramics and paper goods. Use the catalog tools to help users search and manage the studio cart.",
    products: [
      { id: "cinder-mug", name: "Cinder mug", category: "Stoneware", price: 28, accent: "#d97757" },
      { id: "field-notebook", name: "Field notebook", category: "Paper goods", price: 16, accent: "#6b8f71" },
      { id: "night-tea", name: "Night tea", category: "Small batch", price: 22, accent: "#6d6a9f" },
    ],
    skills: [
      { name: "studio-catalog-guide", description: "Explains Cinder Studio categories and product selection.", text: "Search by product name or category. Use the product id returned by the catalog when adding an item to the studio cart." },
      { name: "studio-cart-safety", description: "Explains confirmation rules for studio cart actions.", text: "Adding a studio item is reversible. Before checkout or any irreversible action, confirm the exact items and total." },
    ],
    tools: { search: "search_studio_catalog", add: "add_to_studio_cart", summary: "get_studio_cart_summary" },
  },
  "shop-b": {
    id: "shop-b",
    name: "Field Market",
    eyebrow: "Groceries for the weekend",
    title: "A market\nthat remembers.",
    description: "這是 Field Market 同源測試網站。右側 Agent 可以搜尋食材、建立採買清單並讀取配送摘要。",
    addLabel: "Reserve for pickup",
    instructions: "This page is Field Market, a grocery market for weekend cooking. Use the market tools to help users search inventory and reserve items for pickup.",
    products: [
      { id: "heirloom-tomato", name: "Heirloom tomato", category: "Produce", price: 8, accent: "#c85d4d" },
      { id: "wild-honey", name: "Wildflower honey", category: "Pantry", price: 14, accent: "#d99d42" },
      { id: "rye-sourdough", name: "Rye sourdough", category: "Bakery", price: 11, accent: "#8c6a4f" },
    ],
    skills: [
      { name: "market-inventory-guide", description: "Explains Field Market departments and inventory searches.", text: "Search by ingredient or department. Use the inventory id returned by the market before reserving an item." },
      { name: "pickup-policy", description: "Explains pickup timing and reservation confirmation rules.", text: "Reservations can be changed before pickup. Confirm the item names and pickup total before submitting a final order." },
    ],
    tools: { search: "search_market_inventory", add: "reserve_market_item", summary: "get_market_pickup_summary" },
  },
}

const schema = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
})

const createToolDefinitions = (site: DemoSiteDefinition): WebMcpRegisteredTool[] => [
  {
    name: site.tools.search,
    description: `Search ${site.name} inventory by product name or category and update the visible product list.`,
    inputSchema: schema({ query: { type: "string", description: "Product name, ingredient, or category to search for." } }, ["query"]),
  },
  {
    name: site.tools.add,
    description: `Add one item from ${site.name} to the current reservation or cart.`,
    inputSchema: schema({ productId: { type: "string", description: "The product id to add or reserve." } }, ["productId"]),
  },
  {
    name: site.tools.summary,
    description: `Return the current ${site.name} cart or pickup summary and total price.`,
    inputSchema: schema({}),
    annotations: { readOnlyHint: true },
  },
  {
    name: "agent_instructions",
    description: `Return the operating instructions for ${site.name}.`,
    inputSchema: schema({}),
    annotations: { readOnlyHint: true },
  },
  {
    name: "skill_list",
    description: `Return the optional skills available for ${site.name}.`,
    inputSchema: schema({}),
    annotations: { readOnlyHint: true },
  },
  {
    name: "load_skill",
    description: `Read one optional ${site.name} skill by name.`,
    inputSchema: schema({ name: { type: "string", description: "The skill name to read." } }, ["name"]),
    annotations: { readOnlyHint: true },
  },
]

const getDemoSite = (siteId?: string) => {
  const requestedSite = siteId ? getWebMcpSite(siteId) : undefined
  return demoSites[requestedSite?.id ?? "shop-a"]
}

export const WebMcpDemo = () => {
  const { siteId } = useParams()
  const site = getDemoSite(siteId)
  const [query, setQuery] = useState("")
  const [cart, setCart] = useState<string[]>([])
  const [lastAction, setLastAction] = useState("Ready for a WebMCP tool call")
  const liveState = useRef({ cart, visibleProductCount: 0 })

  const visibleProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return site.products
    return site.products.filter((product) => `${product.name} ${product.category}`.toLowerCase().includes(normalizedQuery))
  }, [query, site])

  useEffect(() => {
    liveState.current = { cart, visibleProductCount: visibleProducts.length }
  }, [cart, visibleProducts.length])

  const toolDefinitions = useMemo(() => createToolDefinitions(site), [site])

  useEffect(() => {
    const modelContext = (document as WebMcpDocument).modelContext
    const controller = new AbortController()

    const executeTool = async (name: string, args: Record<string, unknown>) => {
      if (name === "agent_instructions") return { text: site.instructions }
      if (name === "skill_list") return { skills: site.skills.map(({ name, description }) => ({ name, description })) }

      if (name === "load_skill") {
        const skill = site.skills.find((item) => item.name === args.name)
        return skill ? { type: "skill", name: skill.name, text: skill.text } : { status: "ARGUMENT_ERROR", message: "Skill not found." }
      }

      if (name === site.tools.search) {
        const value = typeof args.query === "string" ? args.query : ""
        const normalizedQuery = value.trim().toLowerCase()
        const count = normalizedQuery
          ? site.products.filter((product) => `${product.name} ${product.category}`.toLowerCase().includes(normalizedQuery)).length
          : site.products.length
        setQuery(value)
        setLastAction(`Filtered ${site.name} for “${value || "all items"}”`)
        return { content: [{ type: "text", text: `Showing ${count} matching items.` }] }
      }

      if (name === site.tools.add) {
        const product = site.products.find((item) => item.id === args.productId)
        if (!product) return { status: "ARGUMENT_ERROR", message: "Product not found." }
        setCart((currentCart) => [...currentCart, product.id])
        setLastAction(`${product.name} added to ${site.name}`)
        return { content: [{ type: "text", text: `${product.name} was added to ${site.name}.` }] }
      }

      const items = liveState.current.cart
        .map((id) => site.products.find((product) => product.id === id))
        .filter(Boolean) as Product[]
      return {
        items: items.map((product) => ({ id: product.id, name: product.name, price: product.price })),
        total: items.reduce((sum, product) => sum + product.price, 0),
      }
    }

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
  }, [site, toolDefinitions])

  return (
    <main className="min-h-full bg-[#f5f0e8] px-6 py-8 text-[#29302a] sm:px-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-10 flex items-end justify-between gap-4 border-b border-[#29302a]/15 pb-6">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#b45e43]"><Sparkles className="size-4" /> {site.name} · {site.eyebrow}</div>
            <h1 className="whitespace-pre-line font-serif text-4xl tracking-tight sm:text-5xl">{site.title}</h1>
            <p className="mt-4 max-w-md text-sm leading-6 text-[#29302a]/65">{site.description}</p>
          </div>
          <div className="hidden rounded-full border border-[#29302a]/15 bg-white/50 px-4 py-2 text-xs sm:block"><ShoppingBag className="mr-2 inline size-4" /> {cart.length} reserved</div>
        </header>

        <div className="mb-6 flex items-center justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#29302a]/45">Catalog</p><p className="mt-1 text-sm text-[#29302a]/65">{lastAction}</p></div>
          <Badge className="bg-[#29302a] text-[#f5f0e8]">{site.name} WebMCP</Badge>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {visibleProducts.map((product) => (
            <Card key={product.id} className="overflow-hidden border-[#29302a]/10 bg-white/65 shadow-none">
              <div className="h-36" style={{ background: `linear-gradient(135deg, ${product.accent}, #f5f0e8)` }} />
              <CardHeader className="pb-2"><CardTitle className="font-serif text-2xl font-normal">{product.name}</CardTitle></CardHeader>
              <CardContent><div className="flex items-center justify-between text-sm text-[#29302a]/60"><span>{product.category}</span><span>${product.price}</span></div><Button className="mt-5 w-full bg-[#29302a] text-[#f5f0e8] hover:bg-[#475548]" onClick={() => { setCart((currentCart) => [...currentCart, product.id]); setLastAction(`${product.name} added to ${site.name}`) }}>{site.addLabel}</Button></CardContent>
            </Card>
          ))}
        </div>

        {visibleProducts.length === 0 ? <div className="rounded-2xl border border-dashed border-[#29302a]/20 py-16 text-center text-sm text-[#29302a]/55"><WandSparkles className="mx-auto mb-3 size-5" />No items match this search.</div> : null}
      </div>
    </main>
  )
}
