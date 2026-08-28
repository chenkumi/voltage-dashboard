import {
  ArrowLeft,
  ArrowRight,
  Check,
  CreditCard,
  ExternalLink,
  Minus,
  Package,
  Plus,
  Search,
  ShoppingBag,
  Sparkles,
  Trash2,
  X,
} from "lucide-react"
import {
  type FormEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type {
  WebMcpDocument,
  WebMcpRegisteredTool,
  WebMcpTestProvider,
  WebMcpWindow,
} from "./types"
import { executeWebMcpToolWithDebugLog } from "./tool-debug"
import { useWebMcpNavigation } from "./navigation"
import { getPhotoCanvasStyle } from "./photo-canvas"
import {
  formatVoltageCategory,
  getVoltageCartItems,
  getVoltageCartSummary,
  productMatchesVoltageFilters,
  sortVoltageProducts,
  voltageCategories,
  voltageProductById,
  voltageProducts,
  type VoltageCartItem,
  type VoltageCartLine,
  type VoltageFilters,
  type VoltageProduct,
} from "./voltage-market-data"
import "./voltage-market.css"

const STORE_KEY = "webmcp-voltage-market-v1"
const PAGE_SIZE = 12

type VoltageView = "catalog" | "cart" | "checkout" | "orders"
type CheckoutForm = { customerName: string; email: string; address: string }
type VoltageOrder = {
  id: string
  createdAt: string
  status: "confirmed" | "cancelled"
  customerName: string
  email: string
  address: string
  items: VoltageCartItem[]
  subtotal: number
  shipping: number
  total: number
}
type VoltageStore = { cart: VoltageCartLine[]; orders: VoltageOrder[] }

const emptyStore: VoltageStore = { cart: [], orders: [] }
const emptyCheckout: CheckoutForm = { customerName: "", email: "", address: "" }
const emptyFilters: VoltageFilters = {
  query: "",
  category: "all",
  maxPrice: "",
  sort: "featured",
}

const schema = (
  properties: Record<string, unknown>,
  required: string[] = []
) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
})

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

const isAbortError = (error: unknown) => {
  return error instanceof Error && error.name === "AbortError"
}

const isCartLine = (value: unknown): value is VoltageCartLine => {
  if (!isRecord(value)) return false
  return (
    typeof value.productId === "number" &&
    typeof value.quantity === "number" &&
    Number.isInteger(value.productId) &&
    Number.isInteger(value.quantity) &&
    value.quantity > 0 &&
    voltageProductById.has(value.productId)
  )
}

const isOrder = (value: unknown): value is VoltageOrder => {
  if (!isRecord(value)) return false
  return (
    typeof value.id === "string" &&
    typeof value.createdAt === "string" &&
    (value.status === "confirmed" || value.status === "cancelled") &&
    typeof value.customerName === "string" &&
    typeof value.email === "string" &&
    typeof value.address === "string" &&
    Array.isArray(value.items) &&
    typeof value.subtotal === "number" &&
    typeof value.shipping === "number" &&
    typeof value.total === "number"
  )
}

const loadStore = (): VoltageStore => {
  try {
    const raw = window.localStorage.getItem(STORE_KEY)
    if (!raw) return emptyStore
    const parsed = JSON.parse(raw) as unknown
    if (!isRecord(parsed)) return emptyStore

    return {
      cart: Array.isArray(parsed.cart) ? parsed.cart.filter(isCartLine) : [],
      orders: Array.isArray(parsed.orders) ? parsed.orders.filter(isOrder) : [],
    }
  } catch {
    return emptyStore
  }
}

const saveStore = (store: VoltageStore) => {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(store))
  } catch {
    // Persistence is best-effort in this local demo.
  }
}

const formatMoney = (value: number) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value)
}

const formatDate = (value: string) => {
  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

const productPayload = (product: VoltageProduct) => ({
  id: product.id,
  title: product.title,
  category: product.category,
  categoryLabel: formatVoltageCategory(product.category),
  description: product.description,
  brand: product.brand,
  price: product.price,
  salePrice: product.salePrice,
  discountPercentage: product.discountPercentage,
  rating: product.rating,
  stock: product.stock,
  tags: product.tags,
})

const cartPayload = (lines: VoltageCartLine[]) => {
  const items = getVoltageCartItems(lines)
  return {
    ...getVoltageCartSummary(items),
    items: items.map((item) => ({
      ...productPayload(item.product),
      quantity: item.quantity,
      lineTotal: item.lineTotal,
    })),
  }
}

const orderPayload = (order: VoltageOrder) => ({
  id: order.id,
  createdAt: order.createdAt,
  status: order.status,
  subtotal: order.subtotal,
  shipping: order.shipping,
  total: order.total,
  items: order.items.map((item) => ({
    ...productPayload(item.product),
    quantity: item.quantity,
    lineTotal: item.lineTotal,
  })),
})

const cloneCartItems = (items: VoltageCartItem[]) => {
  return items.map((item) => ({
    ...item,
    product: { ...item.product, tags: [...item.product.tags] },
  }))
}

// Exported only for the WebMCP capability-boundary test.
// eslint-disable-next-line react-refresh/only-export-components
export const VOLTAGE_TOOLS: WebMcpRegisteredTool[] = [
  {
    name: "search_voltage_products",
    description:
      "Search the embedded Voltage Market catalog with keyword, category, and price filters.",
    inputSchema: schema({
      query: {
        type: "string",
        description:
          "A keyword matching product names, brands, descriptions, tags, or categories.",
      },
      category: {
        type: "string",
        description: "Optional DummyJSON category slug.",
      },
      maxPrice: {
        type: "number",
        description: "Optional maximum sale price in USD.",
      },
      sort: {
        type: "string",
        enum: ["featured", "price-asc", "price-desc", "rating"],
      },
    }),
    annotations: { readOnlyHint: true },
  },
  {
    name: "get_voltage_product",
    description: "Get Voltage Market product details and stock by ID.",
    inputSchema: schema({ productId: { type: "number" } }, ["productId"]),
    annotations: { readOnlyHint: true },
  },
  {
    name: "list_voltage_categories",
    description:
      "List available categories and product counts in the embedded DummyJSON catalog.",
    inputSchema: schema({}),
    annotations: { readOnlyHint: true },
  },
  {
    name: "get_voltage_cart",
    description: "Get the current cart, shipping cost, and total.",
    inputSchema: schema({}),
    annotations: { readOnlyHint: true },
  },
  {
    name: "add_voltage_cart_item",
    description:
      "Add an in-stock product to the cart; the user can adjust or remove it later.",
    inputSchema: schema(
      {
        productId: { type: "number" },
        quantity: {
          type: "number",
          description: "Defaults to 1 and cannot exceed available stock.",
        },
      },
      ["productId"]
    ),
  },
  {
    name: "update_voltage_cart_item",
    description:
      "Adjust a cart item quantity; a quantity of 0 removes the item.",
    inputSchema: schema(
      { productId: { type: "number" }, quantity: { type: "number" } },
      ["productId", "quantity"]
    ),
  },
  {
    name: "remove_voltage_cart_item",
    description: "Remove one product from the cart.",
    inputSchema: schema({ productId: { type: "number" } }, ["productId"]),
  },
  {
    name: "get_voltage_checkout_preview",
    description:
      "Get the pre-checkout items, shipping, and total without creating an order.",
    inputSchema: schema({}),
    annotations: { readOnlyHint: true },
  },
  {
    name: "open_voltage_checkout",
    description:
      "Open the user's dedicated checkout page. This tool does not accept or return personal or payment data and never creates an order.",
    inputSchema: schema({}),
  },
  {
    name: "list_voltage_orders",
    description: "List simulated Voltage Market orders saved in this browser.",
    inputSchema: schema({}),
    annotations: { readOnlyHint: true },
  },
  {
    name: "get_voltage_order",
    description: "Get the details of one simulated order.",
    inputSchema: schema({ orderId: { type: "string" } }, ["orderId"]),
    annotations: { readOnlyHint: true },
  },
  {
    name: "open_voltage_orders",
    description:
      "Open the orders page so the user can view or cancel simulated orders; this tool does not change orders.",
    inputSchema: schema({}),
  },
  {
    name: "navigate_state",
    description:
      "Purpose: read the current page and available back/forward state. Call after host initialization, navigation, or when navigation controls need refreshing. Examples: ‘Which page am I on?’, ‘Can I go back?’, ‘Refresh navigation state’. Do not use to read forms or personal data.",
    inputSchema: schema({}),
    annotations: { readOnlyHint: true },
  },
  {
    name: "navigate_back",
    description:
      "Purpose: return to the previous Voltage Market page state. Call when the user asks to go back or return. Examples: ‘Back’, ‘Return’, ‘Go to the previous page’. Do not call when the user only wants to refresh.",
    inputSchema: schema({}),
  },
  {
    name: "navigate_forward",
    description:
      "Purpose: move to the next Voltage Market page state. Call when the user asks to go forward. Examples: ‘Next’, ‘Forward’, ‘Return to the page I just left’. Do not call when no forward state is available.",
    inputSchema: schema({}),
  },
  {
    name: "agent_instructions",
    description: "Get operating instructions for the Voltage Market agent.",
    inputSchema: schema({}),
    annotations: { readOnlyHint: true },
  },
  {
    name: "skill_list",
    description: "List loadable Voltage Market operating skills.",
    inputSchema: schema({}),
    annotations: { readOnlyHint: true },
  },
  {
    name: "load_skill",
    description: "Load one Voltage Market operating skill.",
    inputSchema: schema({ name: { type: "string" } }, ["name"]),
    annotations: { readOnlyHint: true },
  },
]

const useVoltageWebMcpTools = (
  toolDefinitions: WebMcpRegisteredTool[],
  executeTool: (name: string, args: Record<string, unknown>) => Promise<unknown>
) => {
  const executeRef = useRef(executeTool)

  useEffect(() => {
    executeRef.current = executeTool
  }, [executeTool])

  useLayoutEffect(() => {
    const modelContext = (document as WebMcpDocument).modelContext
    const controller = new AbortController()
    const executeWithDebugLog = (
      toolName: string,
      args: Record<string, unknown>
    ) =>
      executeWebMcpToolWithDebugLog({
        site: "voltage-market",
        toolName,
        args,
        execute: () => executeRef.current(toolName, args),
      })
    const registerTools = async () => {
      if (modelContext?.registerTool) {
        try {
          await Promise.all(
            toolDefinitions.map((tool) =>
              modelContext.registerTool?.(
                {
                  ...tool,
                  execute: (args: Record<string, unknown>) =>
                    executeWithDebugLog(tool.name, args),
                } as WebMcpRegisteredTool & {
                  execute: (args: Record<string, unknown>) => Promise<unknown>
                },
                { signal: controller.signal }
              )
            )
          )
          if (import.meta.env.DEV) {
            console.info("[Voltage Market WebMCP] native tools registered", {
              toolNames: toolDefinitions.map((tool) => tool.name),
            })
          }
        } catch (error) {
          if (controller.signal.aborted || isAbortError(error)) return
          throw error
        }
        return
      }

      const provider: WebMcpTestProvider = {
        getTools: () => toolDefinitions,
        executeTool: (tool, args) => executeWithDebugLog(tool.name, args),
      }
      ;(window as WebMcpWindow).__webmcpTestProvider = provider
      if (import.meta.env.DEV) {
        console.info("[Voltage Market WebMCP] test provider registered", {
          toolNames: toolDefinitions.map((tool) => tool.name),
        })
      }
    }

    const currentWindow = window as WebMcpWindow
    const readyPromise = registerTools()
    currentWindow.__webmcpReady = readyPromise
    void readyPromise.catch((error) => {
      if (!controller.signal.aborted && !isAbortError(error)) {
        console.error("WebMCP tool registration failed.", error)
      }
    })

    return () => {
      controller.abort()
      delete currentWindow.__webmcpReady
      if (currentWindow.__webmcpTestProvider) {
        delete currentWindow.__webmcpTestProvider
      }
    }
  }, [toolDefinitions])
}

const ProductImage = ({
  product,
  className,
}: {
  product: VoltageProduct
  className: string
}) => {
  if (!product.image) {
    return (
      <div
        className={`bg-[linear-gradient(135deg,#ec4899_0%,#fb7185_46%,#fbbf24_100%)] ${className}`}
        aria-label={`${product.title} default product image`}
      />
    )
  }

  return (
    <img
      src={product.image}
      alt={product.title}
      className={`object-cover ${className}`}
      onError={(event) => {
        event.currentTarget.style.display = "none"
      }}
    />
  )
}

const ProductPhotoCanvas = ({
  product,
  index,
}: {
  product: VoltageProduct
  index: number
}) => {
  const { canvasClass, patternClass } = getPhotoCanvasStyle(index)

  return (
    <div
      className={`relative aspect-[1/1.08] overflow-hidden rounded-md p-[4%] ${canvasClass} ${patternClass}`}
    >
      <ProductImage
        product={product}
        className="relative z-10 size-full !object-contain"
      />
    </div>
  )
}

const CartSummary = ({ items }: { items: VoltageCartItem[] }) => {
  const summary = getVoltageCartSummary(items)
  return (
    <div className="space-y-3 text-sm">
      <div className="flex justify-between text-zinc-600">
        <span>Subtotal ({summary.itemCount} items)</span>
        <span>{formatMoney(summary.subtotal)}</span>
      </div>
      <div className="flex justify-between text-zinc-600">
        <span>Standard shipping</span>
        <span>
          {summary.shipping === 0 ? "Free" : formatMoney(summary.shipping)}
        </span>
      </div>
      <div className="flex justify-between border-t-2 border-zinc-950 pt-3 text-base font-black">
        <span>Total</span>
        <span>{formatMoney(summary.total)}</span>
      </div>
      {summary.shipping > 0 ? (
        <p className="text-xs leading-5 text-zinc-500">
          Spend {formatMoney(75 - summary.subtotal)} more to unlock free
          shipping.
        </p>
      ) : null}
    </div>
  )
}

export const VoltageMarketDemo = () => {
  const { view, setView, goBack, goForward, getNavigationState } =
    useWebMcpNavigation<VoltageView>("catalog")
  const [filters, setFilters] = useState<VoltageFilters>(emptyFilters)
  const [page, setPage] = useState(0)
  const [store, setStore] = useState<VoltageStore>(loadStore)
  const [checkout, setCheckout] = useState<CheckoutForm>(emptyCheckout)
  const [checkoutError, setCheckoutError] = useState("")
  const [cardNumber, setCardNumber] = useState("")
  const [confirmed, setConfirmed] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [cancelTarget, setCancelTarget] = useState<string | null>(null)
  const storeRef = useRef(store)

  const cartItems = useMemo(() => getVoltageCartItems(store.cart), [store.cart])
  const summary = useMemo(() => getVoltageCartSummary(cartItems), [cartItems])
  const matchingProducts = useMemo(() => {
    return sortVoltageProducts(
      voltageProducts.filter((product) =>
        productMatchesVoltageFilters(product, filters)
      ),
      filters.sort
    )
  }, [filters])
  const pageCount = Math.max(1, Math.ceil(matchingProducts.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const visibleProducts = useMemo(() => {
    const start = currentPage * PAGE_SIZE
    return matchingProducts.slice(start, start + PAGE_SIZE)
  }, [currentPage, matchingProducts])

  const commit = useCallback(
    (update: (current: VoltageStore) => VoltageStore) => {
      const next = update(storeRef.current)
      storeRef.current = next
      saveStore(next)
      setStore(next)
      return next
    },
    []
  )

  const addToCart = useCallback(
    (product: VoltageProduct, quantity = 1) => {
      const amount = Math.floor(quantity)
      if (!Number.isFinite(amount) || amount < 1) {
        return { error: "Please choose a valid product quantity." }
      }
      const currentQuantity =
        storeRef.current.cart.find((item) => item.productId === product.id)
          ?.quantity ?? 0
      if (currentQuantity + amount > product.stock) {
        return {
          error: `Insufficient stock. You can purchase up to ${product.stock} items.`,
        }
      }
      const next = commit((current) => {
        const found = current.cart.find((item) => item.productId === product.id)
        const cart = found
          ? current.cart.map((item) =>
              item.productId === product.id
                ? { ...item, quantity: item.quantity + amount }
                : item
            )
          : [...current.cart, { productId: product.id, quantity: amount }]
        return { ...current, cart }
      })
      return { state: next }
    },
    [commit]
  )

  const setQuantity = useCallback(
    (productId: number, quantity: number) => {
      const product = voltageProductById.get(productId)
      const amount = Math.floor(quantity)
      if (!product || !Number.isFinite(amount) || amount < 0) {
        return {
          error:
            "Provide a valid product ID and a non-negative integer quantity.",
        }
      }
      if (amount > product.stock) {
        return {
          error: `Insufficient stock. You can purchase up to ${product.stock} items.`,
        }
      }
      const next = commit((current) => ({
        ...current,
        cart:
          amount === 0
            ? current.cart.filter((item) => item.productId !== productId)
            : current.cart.map((item) =>
                item.productId === productId
                  ? { ...item, quantity: amount }
                  : item
              ),
      }))
      return { state: next }
    },
    [commit]
  )

  const createOrder = useCallback(
    (form: CheckoutForm) => {
      const items = getVoltageCartItems(storeRef.current.cart)
      if (items.length === 0) return { error: "The cart is currently empty." }
      const orderSummary = getVoltageCartSummary(items)
      const order: VoltageOrder = {
        id: `VOLT-${Date.now().toString().slice(-7)}-${Math.random()
          .toString(36)
          .slice(2, 6)
          .toUpperCase()}`,
        createdAt: new Date().toISOString(),
        status: "confirmed",
        customerName: form.customerName.trim(),
        email: form.email.trim(),
        address: form.address.trim(),
        items: cloneCartItems(items),
        subtotal: orderSummary.subtotal,
        shipping: orderSummary.shipping,
        total: orderSummary.total,
      }
      commit((current) => ({ cart: [], orders: [order, ...current.orders] }))
      return { order }
    },
    [commit]
  )

  const cancelOrder = useCallback(
    (orderId: string) => {
      let cancelled: VoltageOrder | undefined
      commit((current) => ({
        ...current,
        orders: current.orders.map((order) => {
          if (order.id !== orderId || order.status === "cancelled") return order
          cancelled = { ...order, status: "cancelled" }
          return cancelled
        }),
      }))
      return cancelled
    },
    [commit]
  )

  const executeTool = async (name: string, args: Record<string, unknown>) => {
    if (name === "navigate_state") {
      return { status: "OK", ...getNavigationState() }
    }
    if (name === "navigate_back") {
      const moved = goBack()
      return { status: "OK", moved, ...getNavigationState() }
    }
    if (name === "navigate_forward") {
      const moved = goForward()
      return { status: "OK", moved, ...getNavigationState() }
    }
    if (name === "agent_instructions") {
      return {
        text: "This is the Voltage Market simulated storefront. Its 194 products are an embedded snapshot downloaded from DummyJSON; cart and orders are stored only in this browser. The agent may help with search, cart actions, and opening checkout, but must never request, receive, repeat, or store names, contact details, physical locations, card numbers, or other payment data. The user must enter details and press the final action button directly in the iframe checkout page; the agent cannot create or cancel orders through tools.",
      }
    }
    if (name === "skill_list") {
      return {
        skills: [
          {
            name: "voltage-catalog-guide",
            description: "Find embedded products, stock, and cart actions.",
          },
          {
            name: "voltage-checkout-safety",
            description: "Simulated checkout and order confirmation rules.",
          },
        ],
      }
    }
    if (name === "load_skill") {
      if (args.name === "voltage-catalog-guide") {
        return {
          type: "skill",
          name: "voltage-catalog-guide",
          text: "First filter products with search_voltage_products, then use get_voltage_product to confirm stock and sale pricing. Cart actions are reversible; before suggesting checkout, use get_voltage_checkout_preview to obtain the latest amount.",
        }
      }
      if (args.name === "voltage-checkout-safety") {
        return {
          type: "skill",
          name: "voltage-checkout-safety",
          text: "Checkout is a high-risk flow. Use get_voltage_checkout_preview first to explain items, shipping, and the total. If the user wants checkout, only call open_voltage_checkout and ask them to enter their recipient, contact, location, and payment display data in the iframe and press the final action themselves. Never request, receive, or repeat personal or payment data in chat, and never create or cancel orders through tools.",
        }
      }
      return {
        status: "ARGUMENT_ERROR",
        message: "The requested skill was not found.",
      }
    }
    if (name === "search_voltage_products") {
      const category =
        typeof args.category === "string" &&
        voltageCategories.includes(args.category)
          ? args.category
          : "all"
      const sort =
        args.sort === "price-asc" ||
        args.sort === "price-desc" ||
        args.sort === "rating" ||
        args.sort === "featured"
          ? args.sort
          : "featured"
      const nextFilters: VoltageFilters = {
        query: typeof args.query === "string" ? args.query : "",
        category,
        maxPrice:
          typeof args.maxPrice === "number" ? String(args.maxPrice) : "",
        sort,
      }
      const results = sortVoltageProducts(
        voltageProducts.filter((product) =>
          productMatchesVoltageFilters(product, nextFilters)
        ),
        sort
      )
      setFilters(nextFilters)
      setPage(0)
      setView("catalog")
      return {
        total: results.length,
        products: results.slice(0, 40).map(productPayload),
      }
    }
    if (name === "get_voltage_product") {
      const product =
        typeof args.productId === "number"
          ? voltageProductById.get(args.productId)
          : undefined
      return product
        ? productPayload(product)
        : { status: "ARGUMENT_ERROR", message: "Product not found." }
    }
    if (name === "list_voltage_categories") {
      return {
        categories: voltageCategories.map((category) => ({
          id: category,
          name: formatVoltageCategory(category),
          productCount: voltageProducts.filter(
            (product) => product.category === category
          ).length,
        })),
      }
    }
    if (
      name === "get_voltage_cart" ||
      name === "get_voltage_checkout_preview"
    ) {
      return cartPayload(storeRef.current.cart)
    }
    if (name === "add_voltage_cart_item") {
      const product =
        typeof args.productId === "number"
          ? voltageProductById.get(args.productId)
          : undefined
      const quantity = typeof args.quantity === "number" ? args.quantity : 1
      if (!product) {
        return {
          status: "ARGUMENT_ERROR",
          message: "Provide a valid product ID.",
        }
      }
      const result = addToCart(product, quantity)
      if ("error" in result)
        return { status: "ARGUMENT_ERROR", message: result.error }
      setView("cart")
      return {
        message: `${product.title} was added to the cart.`,
        ...cartPayload(result.state.cart),
      }
    }
    if (name === "update_voltage_cart_item") {
      if (
        typeof args.productId !== "number" ||
        typeof args.quantity !== "number"
      ) {
        return {
          status: "ARGUMENT_ERROR",
          message:
            "Provide a valid product ID and a non-negative integer quantity.",
        }
      }
      const result = setQuantity(args.productId, args.quantity)
      if ("error" in result)
        return { status: "ARGUMENT_ERROR", message: result.error }
      setView("cart")
      return cartPayload(result.state.cart)
    }
    if (name === "remove_voltage_cart_item") {
      if (typeof args.productId !== "number") {
        return { status: "ARGUMENT_ERROR", message: "Provide a product ID." }
      }
      const result = setQuantity(args.productId, 0)
      if ("error" in result)
        return { status: "ARGUMENT_ERROR", message: result.error }
      setView("cart")
      return cartPayload(result.state.cart)
    }
    if (name === "open_voltage_checkout") {
      if (storeRef.current.cart.length === 0) {
        return {
          status: "ERROR",
          message: "The cart is empty, so checkout cannot be opened.",
        }
      }
      setCheckoutError("")
      setView("checkout")
      return {
        message:
          "Checkout is open. The user must enter details and press confirmation directly on the page; personal or payment data must not be provided in chat.",
      }
    }
    if (name === "list_voltage_orders") {
      return { orders: storeRef.current.orders.map(orderPayload) }
    }
    if (name === "get_voltage_order") {
      const order = storeRef.current.orders.find(
        (item) => item.id === args.orderId
      )
      return order
        ? orderPayload(order)
        : { status: "ARGUMENT_ERROR", message: "Order not found." }
    }
    if (name === "open_voltage_orders") {
      setView("orders")
      return {
        message:
          "The orders page is open. Cancellation must be confirmed directly by the user on the page.",
      }
    }
    return { status: "ERROR", message: "Unsupported Voltage Market tool." }
  }

  useVoltageWebMcpTools(VOLTAGE_TOOLS, executeTool)

  const applyFilters = (update: Partial<VoltageFilters>) => {
    setFilters((current) => ({ ...current, ...update }))
    setPage(0)
  }

  const handleAdd = (product: VoltageProduct) => {
    const result = addToCart(product)
    if ("error" in result) {
      setNotice(result.error ?? "Unable to add the product to the cart.")
      return
    }
    setNotice(`${product.title} was added to the cart.`)
  }

  const submitCheckout = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (
      !checkout.customerName.trim() ||
      !checkout.email.trim() ||
      !checkout.address.trim()
    ) {
      setCheckoutError(
        "Please complete the recipient name, email, and shipping address."
      )
      return
    }
    if (!confirmed) {
      setCheckoutError(
        "Please confirm the order details and simulated checkout notice first."
      )
      return
    }
    const result = createOrder(checkout)
    if ("error" in result) {
      setCheckoutError(result.error ?? "Unable to create the simulated order.")
      return
    }
    setCardNumber("")
    setConfirmed(false)
    setCheckoutError("")
    setNotice(`Simulated order ${result.order.id} was created.`)
    setView("orders")
  }

  return (
    <main className="voltage-market min-h-full px-4 py-5 sm:px-6 sm:py-7">
      <div className="mx-auto max-w-7xl">
        <header className="mb-4 border-2 border-zinc-950 bg-white p-3 shadow-[6px_6px_0_#ec4899] sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => setView("catalog")}
              className="flex cursor-pointer items-center gap-3 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-pink-500"
              aria-label="Go to the Voltage Market catalog"
            >
              <span className="grid size-11 place-items-center bg-zinc-950 text-pink-400">
                <Sparkles className="size-5" />
              </span>
              <span>
                <span className="block font-mono text-[11px] font-black tracking-[0.22em] text-pink-600 uppercase">
                  Voltage Market
                </span>
                <span className="block text-lg font-black tracking-tight sm:text-xl">
                  Curated goods, ready to launch
                </span>
              </span>
            </button>
            <nav
              className="flex flex-wrap gap-2"
              aria-label="Voltage Market navigation"
            >
              {(
                [
                  ["catalog", "Catalog"],
                  [
                    "cart",
                    `Cart${summary.itemCount ? ` (${summary.itemCount})` : ""}`,
                  ],
                  ["orders", "Orders"],
                ] as Array<[VoltageView, string]>
              ).map(([target, label]) => (
                <button
                  key={target}
                  type="button"
                  onClick={() => setView(target)}
                  aria-current={view === target ? "page" : undefined}
                  className={`cursor-pointer border-2 border-zinc-950 px-3 py-2 text-xs font-black uppercase transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-500 ${
                    view === target
                      ? "bg-zinc-950 text-white"
                      : "bg-white hover:bg-pink-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </nav>
            <Badge className="hidden rounded-none border-2 border-zinc-950 bg-amber-300 px-3 py-1.5 text-zinc-950 sm:inline-flex">
              Simulated checkout · No real payment
            </Badge>
          </div>
        </header>

        <div aria-live="polite" className="sr-only">
          {notice}
        </div>

        {view === "catalog" ? (
          <section aria-label="Voltage Market catalog">
            <div className="mb-5 grid overflow-hidden border-2 border-zinc-950 bg-zinc-950 text-white min-[900px]:grid-cols-[1.15fr_0.85fr]">
              <div className="p-6 sm:p-9">
                <p className="mb-4 font-mono text-xs font-black tracking-[0.2em] text-pink-400 uppercase">
                  Drop 02 · DummyJSON catalog
                </p>
                <h1 className="max-w-2xl text-4xl leading-[0.94] font-black tracking-[-0.06em] sm:text-6xl">
                  Find your next
                  <span className="block text-amber-300">obsession.</span>
                </h1>
                <p className="mt-5 max-w-lg text-sm leading-6 text-[#596057]">
                  A high-contrast, modular shopping universe with{" "}
                  {voltageProducts.length} searchable products ready for
                  checkout.
                </p>
                <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-zinc-600">
                  Test data source:
                  <a
                    href="https://dummyjson.com/"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex cursor-pointer items-center gap-1 font-semibold text-zinc-950 underline decoration-zinc-400 underline-offset-4 transition-colors duration-200 hover:text-pink-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-500"
                  >
                    DummyJSON
                    <ExternalLink className="size-3" aria-hidden="true" />
                  </a>
                </p>
              </div>
              <div className="grid gap-3 bg-pink-500 p-5 text-zinc-950 min-[900px]:grid-cols-1 min-[900px]:p-7 sm:grid-cols-2">
                <div className="border-2 border-zinc-950 bg-amber-300 p-4 shadow-[4px_4px_0_#18181b]">
                  <span className="block font-mono text-3xl font-black">
                    {voltageProducts.length}
                  </span>
                  <span className="text-xs font-bold tracking-wider uppercase">
                    Embedded products
                  </span>
                </div>
                <div className="border-2 border-zinc-950 bg-white p-4 shadow-[4px_4px_0_#18181b]">
                  <span className="block font-mono text-3xl font-black">
                    {voltageCategories.length}
                  </span>
                  <span className="text-xs font-bold tracking-wider uppercase">
                    Categories
                  </span>
                </div>
                <p className="self-end text-xs leading-5 font-bold min-[900px]:mt-4">
                  Free shipping over {formatMoney(75)}. All orders stay in this
                  browser.
                </p>
              </div>
            </div>

            <section className="mb-5 grid gap-3 border-2 border-zinc-950 bg-white p-4 min-[700px]:grid-cols-2 min-[900px]:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(7rem,0.7fr)_minmax(8rem,0.8fr)] min-[1100px]:grid-cols-[minmax(0,1fr)_220px_150px_170px]">
              <label className="grid gap-1.5 text-xs font-black tracking-wide uppercase">
                Search products
                <span className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-pink-600" />
                  <input
                    value={filters.query}
                    onChange={(event) =>
                      applyFilters({ query: event.target.value })
                    }
                    placeholder="Name, brand, tag…"
                    className="h-10 w-full border-2 border-zinc-950 bg-white pr-3 pl-9 text-sm font-normal normal-case transition-colors outline-none focus:bg-pink-50 focus:ring-2 focus:ring-pink-500"
                  />
                </span>
              </label>
              <label className="grid gap-1.5 text-xs font-black tracking-wide uppercase">
                Category
                <select
                  value={filters.category}
                  onChange={(event) =>
                    applyFilters({ category: event.target.value })
                  }
                  className="h-10 border-2 border-zinc-950 bg-white px-3 text-sm font-medium normal-case transition-colors outline-none focus:bg-pink-50 focus:ring-2 focus:ring-pink-500"
                >
                  <option value="all">All categories</option>
                  {voltageCategories.map((category) => (
                    <option key={category} value={category}>
                      {formatVoltageCategory(category)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5 text-xs font-black tracking-wide uppercase">
                Max price
                <input
                  type="number"
                  min="0"
                  value={filters.maxPrice}
                  onChange={(event) =>
                    applyFilters({ maxPrice: event.target.value })
                  }
                  placeholder="Any"
                  className="h-10 border-2 border-zinc-950 bg-white px-3 text-sm font-normal transition-colors outline-none focus:bg-pink-50 focus:ring-2 focus:ring-pink-500"
                />
              </label>
              <label className="grid gap-1.5 text-xs font-black tracking-wide uppercase">
                Sort
                <select
                  value={filters.sort}
                  onChange={(event) =>
                    applyFilters({
                      sort: event.target.value as VoltageFilters["sort"],
                    })
                  }
                  className="h-10 border-2 border-zinc-950 bg-white px-3 text-sm font-medium normal-case transition-colors outline-none focus:bg-pink-50 focus:ring-2 focus:ring-pink-500"
                >
                  <option value="featured">Featured discounts</option>
                  <option value="price-asc">Price: low to high</option>
                  <option value="price-desc">Price: high to low</option>
                  <option value="rating">Highest rated</option>
                </select>
              </label>
            </section>

            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="font-mono text-xs font-bold text-zinc-600">
                Showing{" "}
                {matchingProducts.length === 0
                  ? 0
                  : currentPage * PAGE_SIZE + 1}
                –
                {Math.min(
                  (currentPage + 1) * PAGE_SIZE,
                  matchingProducts.length
                )}{" "}
                / {matchingProducts.length} items
              </p>
              {filters.category !== "all" ||
              filters.query ||
              filters.maxPrice ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="cursor-pointer rounded-none font-bold hover:bg-pink-100"
                  onClick={() => {
                    setFilters(emptyFilters)
                    setPage(0)
                  }}
                >
                  <X className="size-4" />
                  Clear filters
                </Button>
              ) : null}
            </div>

            {visibleProducts.length > 0 ? (
              <div className="voltage-product-grid grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {visibleProducts.map((product, index) => (
                  <article
                    key={product.id}
                    className="group min-w-0 [content-visibility:auto]"
                  >
                    <ProductPhotoCanvas product={product} index={index} />
                    <div className="px-1 pt-3">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-semibold tracking-[0.12em] text-[#7b8078] uppercase">
                            {formatVoltageCategory(product.category)}
                          </p>
                          <h2 className="mt-1 font-serif text-xl leading-[0.95] tracking-[-0.045em]">
                            {product.title}
                          </h2>
                        </div>
                        <span className="shrink-0 rounded-full bg-[#dfe3dc] px-2 py-0.5 text-[10px] font-semibold text-[#596057]">
                          {product.rating.toFixed(1)} / 5
                        </span>
                      </div>
                      <p className="min-h-10 text-xs leading-5 text-[#747872]">
                        {product.description.slice(0, 96)}
                        {product.description.length > 96 ? "…" : ""}
                      </p>
                      <div className="mt-4 flex items-end justify-between gap-3">
                        <div>
                          <span className="block font-serif text-xl tracking-[-0.04em]">
                            {formatMoney(product.salePrice)}
                          </span>
                          <span className="text-xs text-[#8b9189] line-through">
                            {formatMoney(product.price)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-semibold text-[#7b8078]">
                            -{product.discountPercentage.toFixed(0)}%
                          </span>
                          {product.stock === 0 ? (
                            <span className="text-[10px] font-semibold text-[#a85b4b]">
                              Sold out
                            </span>
                          ) : null}
                          <Button
                            type="button"
                            disabled={product.stock === 0}
                            className="h-10 cursor-pointer rounded-full bg-[#5d695f] px-4 font-semibold text-white hover:bg-[#4b574d] disabled:cursor-not-allowed disabled:bg-[#cfd3cb]"
                            onClick={() => handleAdd(product)}
                          >
                            <Plus className="size-4" />
                            Add
                          </Button>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="grid min-h-64 place-items-center border-2 border-dashed border-zinc-950 bg-white p-6 text-center">
                <div>
                  <Search className="mx-auto mb-3 size-7 text-pink-600" />
                  <h2 className="text-xl font-black">No products found</h2>
                  <p className="mt-2 text-sm text-zinc-600">
                    Try another keyword, category, or price range.
                  </p>
                </div>
              </div>
            )}

            {matchingProducts.length > PAGE_SIZE ? (
              <nav
                className="mt-6 flex items-center justify-center gap-3"
                aria-label="Product pagination"
              >
                <Button
                  type="button"
                  variant="outline"
                  disabled={currentPage === 0}
                  className="cursor-pointer rounded-none border-2 border-zinc-950 disabled:cursor-not-allowed"
                  onClick={() => setPage((current) => Math.max(0, current - 1))}
                >
                  <ArrowLeft className="size-4" />
                  Previous
                </Button>
                <span className="font-mono text-xs font-bold">
                  {currentPage + 1} / {pageCount}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  disabled={currentPage + 1 >= pageCount}
                  className="cursor-pointer rounded-none border-2 border-zinc-950 disabled:cursor-not-allowed"
                  onClick={() =>
                    setPage((current) => Math.min(pageCount - 1, current + 1))
                  }
                >
                  Next
                  <ArrowRight className="size-4" />
                </Button>
              </nav>
            ) : null}
          </section>
        ) : null}

        {view === "cart" ? (
          <section
            className="grid gap-5 min-[900px]:grid-cols-[minmax(0,1fr)_320px]"
            aria-label="Shopping cart"
          >
            <div>
              <div className="mb-4 flex items-end justify-between gap-3">
                <div>
                  <p className="font-mono text-xs font-black tracking-wider text-pink-600 uppercase">
                    Cart mode
                  </p>
                  <h1 className="mt-1 text-3xl font-black tracking-tight">
                    Your picks
                  </h1>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="cursor-pointer rounded-none font-bold hover:bg-pink-100"
                  onClick={() => setView("catalog")}
                >
                  <ArrowLeft className="size-4" />
                  Continue shopping
                </Button>
              </div>
              {cartItems.length > 0 ? (
                <div className="space-y-3">
                  {cartItems.map((item) => (
                    <article
                      key={item.product.id}
                      className="grid gap-4 border-2 border-zinc-950 bg-white p-3 shadow-[4px_4px_0_#18181b] sm:grid-cols-[112px_minmax(0,1fr)_auto]"
                    >
                      <ProductImage
                        product={item.product}
                        className="h-28 w-full bg-zinc-100"
                      />
                      <div>
                        <p className="font-mono text-[10px] font-bold tracking-wider text-pink-600 uppercase">
                          {formatVoltageCategory(item.product.category)}
                        </p>
                        <h2 className="mt-1 font-bold">{item.product.title}</h2>
                        <p className="mt-1 text-sm text-zinc-600">
                          {formatMoney(item.product.salePrice)} / item
                        </p>
                        <div className="mt-3 flex items-center gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="size-8 cursor-pointer rounded-none border-2 border-zinc-950"
                            onClick={() => {
                              const result = setQuantity(
                                item.product.id,
                                item.quantity - 1
                              )
                              if ("error" in result)
                                setNotice(
                                  result.error ?? "Unable to update quantity."
                                )
                            }}
                            aria-label={`Decrease ${item.product.title} quantity`}
                          >
                            <Minus className="size-3" />
                          </Button>
                          <input
                            type="number"
                            min="1"
                            max={item.product.stock}
                            value={item.quantity}
                            onChange={(event) => {
                              const result = setQuantity(
                                item.product.id,
                                Number(event.target.value)
                              )
                              if ("error" in result)
                                setNotice(
                                  result.error ?? "Unable to update quantity."
                                )
                            }}
                            className="h-8 w-12 border-y-2 border-zinc-950 text-center text-sm font-bold outline-none focus:bg-pink-50"
                            aria-label={`${item.product.title} quantity`}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            disabled={item.quantity >= item.product.stock}
                            className="size-8 cursor-pointer rounded-none border-2 border-zinc-950 disabled:cursor-not-allowed"
                            onClick={() => {
                              const result = setQuantity(
                                item.product.id,
                                item.quantity + 1
                              )
                              if ("error" in result)
                                setNotice(
                                  result.error ?? "Unable to update quantity."
                                )
                            }}
                            aria-label={`Increase ${item.product.title} quantity`}
                          >
                            <Plus className="size-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-start justify-between gap-4 sm:flex-col sm:items-end">
                        <span className="font-mono font-black">
                          {formatMoney(item.lineTotal)}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="cursor-pointer rounded-none text-pink-600 hover:bg-pink-100 hover:text-pink-700"
                          onClick={() => {
                            const result = setQuantity(item.product.id, 0)
                            if ("error" in result)
                              setNotice(
                                result.error ?? "Unable to update quantity."
                              )
                          }}
                          aria-label={`Remove ${item.product.title}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="grid min-h-64 place-items-center border-2 border-dashed border-zinc-950 bg-white p-6 text-center">
                  <div>
                    <ShoppingBag className="mx-auto mb-3 size-7 text-pink-600" />
                    <h2 className="text-xl font-black">Your cart is empty</h2>
                    <Button
                      type="button"
                      className="mt-4 cursor-pointer rounded-none border-2 border-zinc-950 bg-pink-500 font-black hover:bg-pink-600"
                      onClick={() => setView("catalog")}
                    >
                      Start shopping
                    </Button>
                  </div>
                </div>
              )}
            </div>
            <aside className="h-fit border-2 border-zinc-950 bg-amber-300 p-5 shadow-[5px_5px_0_#18181b] min-[900px]:sticky min-[900px]:top-4">
              <h2 className="mb-5 flex items-center gap-2 text-lg font-black">
                <Package className="size-5" />
                Order summary
              </h2>
              <CartSummary items={cartItems} />
              <Button
                type="button"
                disabled={cartItems.length === 0}
                className="mt-6 w-full cursor-pointer rounded-none border-2 border-zinc-950 bg-zinc-950 font-black text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-500"
                onClick={() => {
                  setCheckoutError("")
                  setView("checkout")
                }}
              >
                Go to checkout
                <ArrowRight className="size-4" />
              </Button>
            </aside>
          </section>
        ) : null}

        {view === "checkout" ? (
          <section
            className="mx-auto max-w-4xl"
            aria-label="Simulated checkout"
          >
            <Button
              type="button"
              variant="ghost"
              className="mb-4 cursor-pointer rounded-none font-bold hover:bg-pink-100"
              onClick={() => setView("cart")}
            >
              <ArrowLeft className="size-4" />
              Back to cart
            </Button>
            {cartItems.length === 0 ? (
              <div className="grid min-h-64 place-items-center border-2 border-dashed border-zinc-950 bg-white p-6 text-center">
                <div>
                  <h1 className="text-2xl font-black">
                    No items available for checkout
                  </h1>
                  <Button
                    type="button"
                    className="mt-4 cursor-pointer rounded-none border-2 border-zinc-950 bg-pink-500 font-black hover:bg-pink-600"
                    onClick={() => setView("catalog")}
                  >
                    Back to catalog
                  </Button>
                </div>
              </div>
            ) : (
              <form
                className="grid overflow-hidden border-2 border-zinc-950 bg-white min-[900px]:grid-cols-[minmax(0,1fr)_300px]"
                onSubmit={submitCheckout}
              >
                <div className="p-5 sm:p-7">
                  <p className="font-mono text-xs font-black tracking-wider text-pink-600 uppercase">
                    Checkout / demo only
                  </p>
                  <h1 className="mt-2 text-3xl font-black tracking-tight">
                    Confirm shipping details here
                  </h1>
                  <p className="mt-2 text-sm leading-6 text-zinc-600">
                    Enter and confirm these details yourself; the agent cannot
                    read or fill them in. Payment fields are display-only, and
                    card numbers are never saved or transmitted.
                  </p>
                  <fieldset className="mt-6 grid gap-4">
                    <legend className="mb-1 font-black">
                      Recipient details
                    </legend>
                    <label
                      className="grid gap-1.5 text-sm font-bold"
                      htmlFor="voltage-name"
                    >
                      Recipient name
                      <input
                        id="voltage-name"
                        required
                        value={checkout.customerName}
                        autoComplete="name"
                        onChange={(event) =>
                          setCheckout((current) => ({
                            ...current,
                            customerName: event.target.value,
                          }))
                        }
                        className="h-10 border-2 border-zinc-950 px-3 text-sm font-normal outline-none focus:bg-pink-50 focus:ring-2 focus:ring-pink-500"
                      />
                    </label>
                    <label
                      className="grid gap-1.5 text-sm font-bold"
                      htmlFor="voltage-email"
                    >
                      Email
                      <input
                        id="voltage-email"
                        type="email"
                        required
                        value={checkout.email}
                        autoComplete="email"
                        onChange={(event) =>
                          setCheckout((current) => ({
                            ...current,
                            email: event.target.value,
                          }))
                        }
                        className="h-10 border-2 border-zinc-950 px-3 text-sm font-normal outline-none focus:bg-pink-50 focus:ring-2 focus:ring-pink-500"
                      />
                    </label>
                    <label
                      className="grid gap-1.5 text-sm font-bold"
                      htmlFor="voltage-address"
                    >
                      Shipping address
                      <textarea
                        id="voltage-address"
                        required
                        rows={3}
                        value={checkout.address}
                        autoComplete="street-address"
                        onChange={(event) =>
                          setCheckout((current) => ({
                            ...current,
                            address: event.target.value,
                          }))
                        }
                        className="border-2 border-zinc-950 p-3 text-sm font-normal outline-none focus:bg-pink-50 focus:ring-2 focus:ring-pink-500"
                      />
                    </label>
                  </fieldset>
                  <fieldset className="mt-6 grid gap-2 border-t-2 border-zinc-950 pt-5">
                    <legend className="mb-1 font-black">Payment display</legend>
                    <label
                      className="grid gap-1.5 text-sm font-bold"
                      htmlFor="voltage-card"
                    >
                      Card number (not saved)
                      <span className="relative">
                        <CreditCard className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-pink-600" />
                        <input
                          id="voltage-card"
                          inputMode="numeric"
                          value={cardNumber}
                          onChange={(event) =>
                            setCardNumber(event.target.value)
                          }
                          placeholder="•••• •••• •••• ••••"
                          className="h-10 w-full border-2 border-zinc-950 py-2 pr-3 pl-9 text-sm font-normal outline-none focus:bg-pink-50 focus:ring-2 focus:ring-pink-500"
                        />
                      </span>
                    </label>
                  </fieldset>
                  <label className="mt-6 flex cursor-pointer items-start gap-3 border-2 border-zinc-950 bg-pink-50 p-3 text-sm leading-5">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(event) => setConfirmed(event.target.checked)}
                      className="mt-1 size-4 accent-pink-600"
                    />
                    <span>
                      I confirm the items, shipping details, and total. A{" "}
                      <strong>simulated</strong> order that can be canceled
                      locally is created only when I press the button below.
                    </span>
                  </label>
                  {checkoutError ? (
                    <p
                      className="mt-4 border-2 border-pink-700 bg-pink-100 p-3 text-sm font-medium text-pink-900"
                      role="alert"
                    >
                      {checkoutError}
                    </p>
                  ) : null}
                  <Button
                    type="submit"
                    className="mt-5 w-full cursor-pointer rounded-none border-2 border-zinc-950 bg-pink-500 font-black hover:bg-pink-600"
                  >
                    <Check className="size-4" />
                    Confirm and create simulated order
                  </Button>
                </div>
                <aside className="border-t-2 border-zinc-950 bg-amber-300 p-5 min-[900px]:border-t-0 min-[900px]:border-l-2">
                  <h2 className="mb-5 text-lg font-black">Current total</h2>
                  <CartSummary items={cartItems} />
                </aside>
              </form>
            )}
          </section>
        ) : null}

        {view === "orders" ? (
          <section aria-label="Order history">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="font-mono text-xs font-black tracking-wider text-pink-600 uppercase">
                  Local history
                </p>
                <h1 className="mt-1 text-3xl font-black tracking-tight">
                  Simulated order history
                </h1>
              </div>
              <Button
                type="button"
                className="cursor-pointer rounded-none border-2 border-zinc-950 bg-zinc-950 font-black hover:bg-zinc-800"
                onClick={() => setView("catalog")}
              >
                Continue shopping
                <ArrowRight className="size-4" />
              </Button>
            </div>
            {store.orders.length > 0 ? (
              <div className="space-y-4">
                {store.orders.map((order) => (
                  <article
                    key={order.id}
                    className="border-2 border-zinc-950 bg-white p-5 shadow-[5px_5px_0_#18181b]"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-zinc-950 pb-4">
                      <div>
                        <p className="font-mono text-xs font-bold text-zinc-500">
                          {order.id}
                        </p>
                        <h2 className="mt-1 font-black">
                          {formatDate(order.createdAt)}
                        </h2>
                        <p className="mt-1 text-sm text-zinc-600">
                          {order.customerName} · {order.email}
                        </p>
                      </div>
                      <Badge
                        className={`rounded-none border-2 border-zinc-950 px-3 py-1 ${
                          order.status === "confirmed"
                            ? "bg-amber-300 text-zinc-950"
                            : "bg-zinc-200 text-zinc-700"
                        }`}
                      >
                        {order.status === "confirmed" ? "Created" : "Canceled"}
                      </Badge>
                    </div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <ul className="space-y-2 text-sm">
                        {order.items.map((item) => (
                          <li
                            key={item.product.id}
                            className="flex justify-between gap-4"
                          >
                            <span>
                              {item.product.title} × {item.quantity}
                            </span>
                            <span className="font-mono font-bold">
                              {formatMoney(item.lineTotal)}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <div className="min-w-40 border-l-0 border-zinc-950 pt-3 sm:border-l-2 sm:pt-0 sm:pl-4">
                        <p className="text-xs text-zinc-600">
                          Ship to: {order.address}
                        </p>
                        <p className="mt-3 text-lg font-black">
                          {formatMoney(order.total)}
                        </p>
                        {order.status === "confirmed" ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {cancelTarget === order.id ? (
                              <>
                                <Button
                                  type="button"
                                  size="sm"
                                  className="cursor-pointer rounded-none border-2 border-zinc-950 bg-pink-500 font-black hover:bg-pink-600"
                                  onClick={() => {
                                    cancelOrder(order.id)
                                    setCancelTarget(null)
                                    setNotice(
                                      `Simulated order ${order.id} was canceled.`
                                    )
                                  }}
                                >
                                  Confirm cancellation
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="cursor-pointer rounded-none border-2 border-zinc-950"
                                  onClick={() => setCancelTarget(null)}
                                >
                                  Keep order
                                </Button>
                              </>
                            ) : (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="cursor-pointer rounded-none border-2 border-zinc-950 text-pink-700 hover:bg-pink-100"
                                onClick={() => setCancelTarget(order.id)}
                              >
                                Cancel order
                              </Button>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="grid min-h-64 place-items-center border-2 border-dashed border-zinc-950 bg-white p-6 text-center">
                <div>
                  <Package className="mx-auto mb-3 size-7 text-pink-600" />
                  <h2 className="text-xl font-black">
                    No simulated orders yet
                  </h2>
                  <p className="mt-2 text-sm text-zinc-600">
                    Orders are stored only in this browser after checkout.
                  </p>
                </div>
              </div>
            )}
          </section>
        ) : null}
      </div>
    </main>
  )
}
