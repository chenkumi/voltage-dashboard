import {
  ArrowLeft,
  ArrowRight,
  Check,
  CreditCard,
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
      "搜尋 Voltage Market 的內嵌商品目錄，可用關鍵字、分類與售價篩選。",
    inputSchema: schema({
      query: {
        type: "string",
        description: "名稱、品牌、描述、標籤或分類關鍵字。",
      },
      category: { type: "string", description: "可選的 DummyJSON 分類 slug。" },
      maxPrice: { type: "number", description: "可選的最高折後 USD 售價。" },
      sort: {
        type: "string",
        enum: ["featured", "price-asc", "price-desc", "rating"],
      },
    }),
    annotations: { readOnlyHint: true },
  },
  {
    name: "get_voltage_product",
    description: "依 ID 取得 Voltage Market 商品詳情與庫存。",
    inputSchema: schema({ productId: { type: "number" } }, ["productId"]),
    annotations: { readOnlyHint: true },
  },
  {
    name: "list_voltage_categories",
    description: "列出內嵌 DummyJSON 目錄的可用分類與商品數量。",
    inputSchema: schema({}),
    annotations: { readOnlyHint: true },
  },
  {
    name: "get_voltage_cart",
    description: "取得目前購物車、運費與合計。",
    inputSchema: schema({}),
    annotations: { readOnlyHint: true },
  },
  {
    name: "add_voltage_cart_item",
    description: "將庫存中的商品加入購物車；使用者可以後續調整或移除。",
    inputSchema: schema(
      {
        productId: { type: "number" },
        quantity: { type: "number", description: "預設為 1，且不可超過庫存。" },
      },
      ["productId"]
    ),
  },
  {
    name: "update_voltage_cart_item",
    description: "調整購物車商品數量；數量 0 會移除商品。",
    inputSchema: schema(
      { productId: { type: "number" }, quantity: { type: "number" } },
      ["productId", "quantity"]
    ),
  },
  {
    name: "remove_voltage_cart_item",
    description: "從購物車移除一件商品。",
    inputSchema: schema({ productId: { type: "number" } }, ["productId"]),
  },
  {
    name: "get_voltage_checkout_preview",
    description: "取得結帳前的商品、運費與合計，不會建立訂單。",
    inputSchema: schema({}),
    annotations: { readOnlyHint: true },
  },
  {
    name: "open_voltage_checkout",
    description:
      "開啟使用者專屬結帳頁。此工具不接受或回傳個資、付款資料，也不會建立訂單。",
    inputSchema: schema({}),
  },
  {
    name: "list_voltage_orders",
    description: "列出此瀏覽器保存的 Voltage Market 模擬訂單。",
    inputSchema: schema({}),
    annotations: { readOnlyHint: true },
  },
  {
    name: "get_voltage_order",
    description: "取得一筆模擬訂單的明細。",
    inputSchema: schema({ orderId: { type: "string" } }, ["orderId"]),
    annotations: { readOnlyHint: true },
  },
  {
    name: "open_voltage_orders",
    description:
      "開啟訂單頁供使用者自行查看或取消模擬訂單；此工具不會改變訂單。",
    inputSchema: schema({}),
  },
  {
    name: "navigate_state",
    description:
      "用途：讀取目前頁面與可用的上一頁／下一頁狀態。何時呼叫：host 初始化、頁面導覽後或需要更新導覽按鈕時。觸發例子：「目前在哪一頁？」、「上一頁按鈕能否使用？」、「更新導覽狀態」。不該呼叫：不可用來讀取表單或個資。",
    inputSchema: schema({}),
    annotations: { readOnlyHint: true },
  },
  {
    name: "navigate_back",
    description:
      "用途：返回 Voltage Market 的上一個頁面狀態。何時呼叫：使用者要求上一頁、返回或回到前一頁時。觸發例子：「上一頁」、「返回」、「回到剛才頁面」。不該呼叫：使用者只是要重新整理頁面時。",
    inputSchema: schema({}),
  },
  {
    name: "navigate_forward",
    description:
      "用途：前往 Voltage Market 的下一個頁面狀態。何時呼叫：使用者要求下一頁或前進時。觸發例子：「下一頁」、「前進」、「回到剛才前進的頁面」。不該呼叫：沒有可前進的頁面時。",
    inputSchema: schema({}),
  },
  {
    name: "agent_instructions",
    description: "取得 Voltage Market Agent 操作說明。",
    inputSchema: schema({}),
    annotations: { readOnlyHint: true },
  },
  {
    name: "skill_list",
    description: "列出可載入的 Voltage Market 操作技能。",
    inputSchema: schema({}),
    annotations: { readOnlyHint: true },
  },
  {
    name: "load_skill",
    description: "載入一項 Voltage Market 操作技能。",
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
    const registerTools = async () => {
      if (modelContext?.registerTool) {
        try {
          await Promise.all(
            toolDefinitions.map((tool) =>
              modelContext.registerTool?.(
                {
                  ...tool,
                  execute: (args: Record<string, unknown>) =>
                    executeRef.current(tool.name, args),
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
        executeTool: (tool, args) => executeRef.current(tool.name, args),
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
        aria-label={`${product.title} 的預設商品圖片`}
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
        <span>小計（{summary.itemCount} 件）</span>
        <span>{formatMoney(summary.subtotal)}</span>
      </div>
      <div className="flex justify-between text-zinc-600">
        <span>標準配送</span>
        <span>
          {summary.shipping === 0 ? "免費" : formatMoney(summary.shipping)}
        </span>
      </div>
      <div className="flex justify-between border-t-2 border-zinc-950 pt-3 text-base font-black">
        <span>合計</span>
        <span>{formatMoney(summary.total)}</span>
      </div>
      {summary.shipping > 0 ? (
        <p className="text-xs leading-5 text-zinc-500">
          再購買 {formatMoney(75 - summary.subtotal)} 即享免費配送。
        </p>
      ) : null}
    </div>
  )
}

export const VoltageMarketDemo = () => {
  const {
    view,
    setView,
    goBack,
    goForward,
    getNavigationState,
  } = useWebMcpNavigation<VoltageView>("catalog")
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
        return { error: "請選擇有效的商品數量。" }
      }
      const currentQuantity =
        storeRef.current.cart.find((item) => item.productId === product.id)
          ?.quantity ?? 0
      if (currentQuantity + amount > product.stock) {
        return { error: `庫存不足，目前最多可購買 ${product.stock} 件。` }
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
        return { error: "請提供有效商品 ID 與非負整數數量。" }
      }
      if (amount > product.stock) {
        return { error: `庫存不足，目前最多可購買 ${product.stock} 件。` }
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
      if (items.length === 0) return { error: "購物車目前是空的。" }
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
        text: "這是 Voltage Market 的模擬購物網站。194 筆商品是從 DummyJSON 下載後嵌入此網站的快照；購物車與訂單只保存於這個瀏覽器。Agent 可協助搜尋、購物車與導向結帳頁，但絕不可要求、接收、重述或保存姓名、Email、地址、卡號或任何付款資料。使用者必須在 iframe 結帳頁自行填寫資料，並自行按下確認模擬付款／建立訂單；Agent 不可透過工具建立或取消訂單。",
      }
    }
    if (name === "skill_list") {
      return {
        skills: [
          {
            name: "voltage-catalog-guide",
            description: "查找內嵌商品、庫存與購物車操作。",
          },
          {
            name: "voltage-checkout-safety",
            description: "模擬結帳與訂單確認規則。",
          },
        ],
      }
    }
    if (name === "load_skill") {
      if (args.name === "voltage-catalog-guide") {
        return {
          type: "skill",
          name: "voltage-catalog-guide",
          text: "先以 search_voltage_products 篩選商品，再用 get_voltage_product 確認庫存與折後價格。購物車操作可逆；在建議結帳前，使用 get_voltage_checkout_preview 取得最新金額。",
        }
      }
      if (args.name === "voltage-checkout-safety") {
        return {
          type: "skill",
          name: "voltage-checkout-safety",
          text: "結帳屬高風險流程。先以 get_voltage_checkout_preview 說明商品、運費與總計；若使用者要結帳，只能呼叫 open_voltage_checkout，請使用者在 iframe 內自行填寫姓名、Email、地址與付款展示資料，並自行按下確認。不得在對話中索取、接收、重述個資或付款資料，不得以工具建立或取消訂單。",
        }
      }
      return { status: "ARGUMENT_ERROR", message: "找不到指定技能。" }
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
        : { status: "ARGUMENT_ERROR", message: "找不到商品。" }
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
        return { status: "ARGUMENT_ERROR", message: "請提供有效商品 ID。" }
      }
      const result = addToCart(product, quantity)
      if ("error" in result)
        return { status: "ARGUMENT_ERROR", message: result.error }
      setView("cart")
      return {
        message: `${product.title} 已加入購物車。`,
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
          message: "請提供有效商品 ID 與非負整數數量。",
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
        return { status: "ARGUMENT_ERROR", message: "請提供商品 ID。" }
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
          message: "購物車是空的，無法開啟結帳頁。",
        }
      }
      setCheckoutError("")
      setView("checkout")
      return {
        message:
          "已開啟結帳頁。請使用者直接在頁面填寫資料並自行按下確認；不可在對話中提供個資或付款資料。",
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
        : { status: "ARGUMENT_ERROR", message: "找不到訂單。" }
    }
    if (name === "open_voltage_orders") {
      setView("orders")
      return {
        message: "已開啟訂單頁。取消操作必須由使用者直接在頁面確認。",
      }
    }
    return { status: "ERROR", message: "不支援的 Voltage Market 工具。" }
  }

  useVoltageWebMcpTools(VOLTAGE_TOOLS, executeTool)

  const applyFilters = (update: Partial<VoltageFilters>) => {
    setFilters((current) => ({ ...current, ...update }))
    setPage(0)
  }

  const handleAdd = (product: VoltageProduct) => {
    const result = addToCart(product)
    if ("error" in result) {
      setNotice(result.error ?? "無法將商品加入購物車。")
      return
    }
    setNotice(`${product.title} 已加入購物車。`)
  }

  const submitCheckout = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (
      !checkout.customerName.trim() ||
      !checkout.email.trim() ||
      !checkout.address.trim()
    ) {
      setCheckoutError("請完整填寫收件人、Email 與送貨地址。")
      return
    }
    if (!confirmed) {
      setCheckoutError("請先確認訂單內容與模擬結帳聲明。")
      return
    }
    const result = createOrder(checkout)
    if ("error" in result) {
      setCheckoutError(result.error ?? "無法建立模擬訂單。")
      return
    }
    setCardNumber("")
    setConfirmed(false)
    setCheckoutError("")
    setNotice(`模擬訂單 ${result.order.id} 已建立。`)
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
              aria-label="前往 Voltage Market 商品目錄"
            >
              <span className="grid size-11 place-items-center bg-zinc-950 text-pink-400">
                <Sparkles className="size-5" />
              </span>
              <span>
                <span className="block font-mono text-[11px] font-black tracking-[0.22em] text-pink-600 uppercase">
                  Voltage Market
                </span>
                <span className="block text-lg font-black tracking-tight sm:text-xl">
                  大膽選物，立即上線
                </span>
              </span>
            </button>
            <nav
              className="flex flex-wrap gap-2"
              aria-label="Voltage Market 導覽"
            >
              {(
                [
                  ["catalog", "商品"],
                  [
                    "cart",
                    `購物車${summary.itemCount ? ` (${summary.itemCount})` : ""}`,
                  ],
                  ["orders", "訂單"],
                ] as Array<[VoltageView, string]>
              ).map(([target, label]) => (
                <button
                  key={target}
                  type="button"
                  onClick={() => setView(target)}
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
              模擬結帳 · 無真實付款
            </Badge>
          </div>
        </header>

        <div aria-live="polite" className="sr-only">
          {notice}
        </div>

        {view === "catalog" ? (
          <section aria-label="Voltage Market 商品目錄">
            <div className="mb-5 grid overflow-hidden border-2 border-zinc-950 bg-zinc-950 text-white min-[900px]:grid-cols-[1.15fr_0.85fr]">
              <div className="p-6 sm:p-9">
                <p className="mb-4 font-mono text-xs font-black tracking-[0.2em] text-pink-400 uppercase">
                  Drop 02 · DummyJSON catalog
                </p>
                <h1 className="max-w-2xl text-4xl leading-[0.94] font-black tracking-[-0.06em] sm:text-6xl">
                  找到下一件
                  <span className="block text-amber-300">
                    讓你心跳加速的東西。
                  </span>
                </h1>
                <p className="mt-5 max-w-lg text-sm leading-6 text-[#596057]">
                  這是一個高對比、模組化的選物宇宙，
                  內含 {voltageProducts.length} 筆可搜尋、可結帳的靜態商品資料。
                </p>
              </div>
              <div className="grid gap-3 bg-pink-500 p-5 text-zinc-950 min-[900px]:grid-cols-1 min-[900px]:p-7 sm:grid-cols-2">
                <div className="border-2 border-zinc-950 bg-amber-300 p-4 shadow-[4px_4px_0_#18181b]">
                  <span className="block font-mono text-3xl font-black">
                    {voltageProducts.length}
                  </span>
                  <span className="text-xs font-bold tracking-wider uppercase">
                    嵌入式商品
                  </span>
                </div>
                <div className="border-2 border-zinc-950 bg-white p-4 shadow-[4px_4px_0_#18181b]">
                  <span className="block font-mono text-3xl font-black">
                    {voltageCategories.length}
                  </span>
                  <span className="text-xs font-bold tracking-wider uppercase">
                    商品分類
                  </span>
                </div>
                <p className="self-end text-xs leading-5 font-bold min-[900px]:mt-4">
                  免費配送門檻：{formatMoney(75)}。所有訂單都只存在此瀏覽器。
                </p>
              </div>
            </div>

            <section className="mb-5 grid gap-3 border-2 border-zinc-950 bg-white p-4 min-[700px]:grid-cols-2 min-[900px]:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(7rem,0.7fr)_minmax(8rem,0.8fr)] min-[1100px]:grid-cols-[minmax(0,1fr)_220px_150px_170px]">
              <label className="grid gap-1.5 text-xs font-black tracking-wide uppercase">
                搜尋商品
                <span className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-pink-600" />
                  <input
                    value={filters.query}
                    onChange={(event) =>
                      applyFilters({ query: event.target.value })
                    }
                    placeholder="名稱、品牌、標籤…"
                    className="h-10 w-full border-2 border-zinc-950 bg-white pr-3 pl-9 text-sm font-normal normal-case transition-colors outline-none focus:bg-pink-50 focus:ring-2 focus:ring-pink-500"
                  />
                </span>
              </label>
              <label className="grid gap-1.5 text-xs font-black tracking-wide uppercase">
                分類
                <select
                  value={filters.category}
                  onChange={(event) =>
                    applyFilters({ category: event.target.value })
                  }
                  className="h-10 border-2 border-zinc-950 bg-white px-3 text-sm font-medium normal-case transition-colors outline-none focus:bg-pink-50 focus:ring-2 focus:ring-pink-500"
                >
                  <option value="all">全部分類</option>
                  {voltageCategories.map((category) => (
                    <option key={category} value={category}>
                      {formatVoltageCategory(category)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5 text-xs font-black tracking-wide uppercase">
                最高售價
                <input
                  type="number"
                  min="0"
                  value={filters.maxPrice}
                  onChange={(event) =>
                    applyFilters({ maxPrice: event.target.value })
                  }
                  placeholder="不限"
                  className="h-10 border-2 border-zinc-950 bg-white px-3 text-sm font-normal transition-colors outline-none focus:bg-pink-50 focus:ring-2 focus:ring-pink-500"
                />
              </label>
              <label className="grid gap-1.5 text-xs font-black tracking-wide uppercase">
                排序
                <select
                  value={filters.sort}
                  onChange={(event) =>
                    applyFilters({
                      sort: event.target.value as VoltageFilters["sort"],
                    })
                  }
                  className="h-10 border-2 border-zinc-950 bg-white px-3 text-sm font-medium normal-case transition-colors outline-none focus:bg-pink-50 focus:ring-2 focus:ring-pink-500"
                >
                  <option value="featured">精選折扣</option>
                  <option value="price-asc">價格：低至高</option>
                  <option value="price-desc">價格：高至低</option>
                  <option value="rating">評分最高</option>
                </select>
              </label>
            </section>

            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="font-mono text-xs font-bold text-zinc-600">
                顯示{" "}
                {matchingProducts.length === 0
                  ? 0
                  : currentPage * PAGE_SIZE + 1}
                –
                {Math.min(
                  (currentPage + 1) * PAGE_SIZE,
                  matchingProducts.length
                )}{" "}
                / {matchingProducts.length} 件
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
                  清除篩選
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
                              已售完
                            </span>
                          ) : null}
                          <Button
                            type="button"
                            disabled={product.stock === 0}
                            className="h-10 cursor-pointer rounded-full bg-[#5d695f] px-4 font-semibold text-white hover:bg-[#4b574d] disabled:cursor-not-allowed disabled:bg-[#cfd3cb]"
                            onClick={() => handleAdd(product)}
                          >
                            <Plus className="size-4" />
                            加入
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
                  <h2 className="text-xl font-black">沒有符合的商品</h2>
                  <p className="mt-2 text-sm text-zinc-600">
                    試試其他關鍵字、分類或售價範圍。
                  </p>
                </div>
              </div>
            )}

            {matchingProducts.length > PAGE_SIZE ? (
              <nav
                className="mt-6 flex items-center justify-center gap-3"
                aria-label="商品分頁"
              >
                <Button
                  type="button"
                  variant="outline"
                  disabled={currentPage === 0}
                  className="cursor-pointer rounded-none border-2 border-zinc-950 disabled:cursor-not-allowed"
                  onClick={() => setPage((current) => Math.max(0, current - 1))}
                >
                  <ArrowLeft className="size-4" />
                  上一頁
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
                  下一頁
                  <ArrowRight className="size-4" />
                </Button>
              </nav>
            ) : null}
          </section>
        ) : null}

        {view === "cart" ? (
          <section
            className="grid gap-5 min-[900px]:grid-cols-[minmax(0,1fr)_320px]"
            aria-label="購物車"
          >
            <div>
              <div className="mb-4 flex items-end justify-between gap-3">
                <div>
                  <p className="font-mono text-xs font-black tracking-wider text-pink-600 uppercase">
                    Cart mode
                  </p>
                  <h1 className="mt-1 text-3xl font-black tracking-tight">
                    你的選物清單
                  </h1>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="cursor-pointer rounded-none font-bold hover:bg-pink-100"
                  onClick={() => setView("catalog")}
                >
                  <ArrowLeft className="size-4" />
                  繼續選購
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
                          {formatMoney(item.product.salePrice)} / 件
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
                                setNotice(result.error ?? "無法調整商品數量。")
                            }}
                            aria-label={`減少 ${item.product.title} 的數量`}
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
                                setNotice(result.error ?? "無法調整商品數量。")
                            }}
                            className="h-8 w-12 border-y-2 border-zinc-950 text-center text-sm font-bold outline-none focus:bg-pink-50"
                            aria-label={`${item.product.title} 的數量`}
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
                                setNotice(result.error ?? "無法調整商品數量。")
                            }}
                            aria-label={`增加 ${item.product.title} 的數量`}
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
                              setNotice(result.error ?? "無法調整商品數量。")
                          }}
                          aria-label={`移除 ${item.product.title}`}
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
                    <h2 className="text-xl font-black">購物車還是空的</h2>
                    <Button
                      type="button"
                      className="mt-4 cursor-pointer rounded-none border-2 border-zinc-950 bg-pink-500 font-black hover:bg-pink-600"
                      onClick={() => setView("catalog")}
                    >
                      開始選購
                    </Button>
                  </div>
                </div>
              )}
            </div>
            <aside className="h-fit border-2 border-zinc-950 bg-amber-300 p-5 shadow-[5px_5px_0_#18181b] min-[900px]:sticky min-[900px]:top-4">
              <h2 className="mb-5 flex items-center gap-2 text-lg font-black">
                <Package className="size-5" />
                訂單摘要
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
                前往結帳
                <ArrowRight className="size-4" />
              </Button>
            </aside>
          </section>
        ) : null}

        {view === "checkout" ? (
          <section className="mx-auto max-w-4xl" aria-label="模擬結帳">
            <Button
              type="button"
              variant="ghost"
              className="mb-4 cursor-pointer rounded-none font-bold hover:bg-pink-100"
              onClick={() => setView("cart")}
            >
              <ArrowLeft className="size-4" />
              返回購物車
            </Button>
            {cartItems.length === 0 ? (
              <div className="grid min-h-64 place-items-center border-2 border-dashed border-zinc-950 bg-white p-6 text-center">
                <div>
                  <h1 className="text-2xl font-black">沒有可結帳的商品</h1>
                  <Button
                    type="button"
                    className="mt-4 cursor-pointer rounded-none border-2 border-zinc-950 bg-pink-500 font-black hover:bg-pink-600"
                    onClick={() => setView("catalog")}
                  >
                    返回商品目錄
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
                    在此頁確認配送資訊
                  </h1>
                  <p className="mt-2 text-sm leading-6 text-zinc-600">
                    請由你直接填寫與確認；Agent
                    無法讀取或代填。付款欄位只展示畫面，卡號不會保存或傳送。
                  </p>
                  <fieldset className="mt-6 grid gap-4">
                    <legend className="mb-1 font-black">收件資訊</legend>
                    <label
                      className="grid gap-1.5 text-sm font-bold"
                      htmlFor="voltage-name"
                    >
                      收件人姓名
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
                      送貨地址
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
                    <legend className="mb-1 font-black">付款展示</legend>
                    <label
                      className="grid gap-1.5 text-sm font-bold"
                      htmlFor="voltage-card"
                    >
                      卡號（不保存）
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
                      我確認商品、配送資訊與合計金額；只有我按下下一步才會建立可在本機取消的
                      <strong>模擬</strong>訂單。
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
                    我確認並建立模擬訂單
                  </Button>
                </div>
                <aside className="border-t-2 border-zinc-950 bg-amber-300 p-5 min-[900px]:border-t-0 min-[900px]:border-l-2">
                  <h2 className="mb-5 text-lg font-black">本次合計</h2>
                  <CartSummary items={cartItems} />
                </aside>
              </form>
            )}
          </section>
        ) : null}

        {view === "orders" ? (
          <section aria-label="訂單紀錄">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="font-mono text-xs font-black tracking-wider text-pink-600 uppercase">
                  Local history
                </p>
                <h1 className="mt-1 text-3xl font-black tracking-tight">
                  模擬訂單紀錄
                </h1>
              </div>
              <Button
                type="button"
                className="cursor-pointer rounded-none border-2 border-zinc-950 bg-zinc-950 font-black hover:bg-zinc-800"
                onClick={() => setView("catalog")}
              >
                繼續選購
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
                        {order.status === "confirmed" ? "已建立" : "已取消"}
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
                          送往：{order.address}
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
                                    setNotice(`模擬訂單 ${order.id} 已取消。`)
                                  }}
                                >
                                  確認取消
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="cursor-pointer rounded-none border-2 border-zinc-950"
                                  onClick={() => setCancelTarget(null)}
                                >
                                  保留訂單
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
                                取消訂單
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
                  <h2 className="text-xl font-black">還沒有模擬訂單</h2>
                  <p className="mt-2 text-sm text-zinc-600">
                    完成結帳後，訂單會只保存於這個瀏覽器。
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
