import {
  BarChart3,
  Boxes,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  LayoutDashboard,
  PackageSearch,
  Search,
  Sparkles,
  Users,
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useWebMcpNavigation } from "./navigation"
import type {
  WebMcpDocument,
  WebMcpRegisteredTool,
  WebMcpTestProvider,
  WebMcpWindow,
} from "./types"
import {
  createVoltageAdminInventory,
  getVoltageAdminDashboard,
  searchVoltageAdminProducts,
  setVoltageAdminInventory,
  toAdminProduct,
  voltageAdminCustomers,
  voltageAdminOrders,
  type VoltageAdminInventory,
} from "./voltage-admin-data"
import { voltageProductById } from "./voltage-market-data"
import {
  EXECUTE_READONLY_SQL_TOOL,
  EXECUTE_READONLY_SQL_TOOL_NAME,
  ReportingRuntimeController,
} from "./reporting/reporting-tools"
import "./voltage-admin.css"

type VoltageAdminView =
  "dashboard" | "products" | "orders" | "customers" | "inventory"

const schema = (
  properties: Record<string, unknown>,
  required: string[] = []
) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
})

const noInput = schema({})

const formatMoney = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value)

const isAbortError = (error: unknown) =>
  error instanceof Error && error.name === "AbortError"

const isSection = (value: unknown): value is VoltageAdminView =>
  value === "dashboard" ||
  value === "products" ||
  value === "orders" ||
  value === "customers" ||
  value === "inventory"

// Exported for WebMCP capability and privacy-boundary tests.
// eslint-disable-next-line react-refresh/only-export-components
export const VOLTAGE_ADMIN_TOOLS: WebMcpRegisteredTool[] = [
  {
    name: "get_voltage_admin_dashboard",
    description:
      "用途：讀取 Voltage Market 後台的營運摘要。何時呼叫：詢問營收、訂單、客戶或低庫存時。觸發例子：「今天營運如何」、「有多少訂單」、「低庫存商品」、「後台摘要」。不該呼叫：需要查單一商品細節時。",
    inputSchema: noInput,
    annotations: { readOnlyHint: true },
  },
  EXECUTE_READONLY_SQL_TOOL,
  {
    name: "search_voltage_admin_products",
    description:
      "用途：依關鍵字搜尋後台商品與庫存。何時呼叫：需要找商品、品牌或分類時。觸發例子：「找 beauty 商品」、「查詢 mascara」、「商品庫存」、「有哪些 watches」。不該呼叫：要修改庫存時。",
    inputSchema: schema({
      query: { type: "string", description: "商品、品牌、分類或標籤關鍵字。" },
    }),
    annotations: { readOnlyHint: true, untrustedContentHint: true },
  },
  {
    name: "get_voltage_admin_product",
    description:
      "用途：取得一件商品的後台摘要與目前庫存。何時呼叫：使用者指定商品 ID 或需要確認單品時。觸發例子：「商品 12 的庫存」、「看商品詳情」、「查產品 42」、「這件商品還有多少」。不該呼叫：只需要整體低庫存摘要時。",
    inputSchema: schema(
      {
        productId: { type: "number", description: "Voltage Market 商品 ID。" },
      },
      ["productId"]
    ),
    annotations: { readOnlyHint: true, untrustedContentHint: true },
  },
  {
    name: "list_voltage_admin_orders",
    description:
      "用途：列出匿名化的後台訂單摘要。何時呼叫：詢問訂單量、處理中或需注意訂單時。觸發例子：「列出訂單」、「待處理訂單」、「有問題的訂單」、「最近訂單」。不該呼叫：要求建立、確認或取消訂單時。",
    inputSchema: schema({
      status: {
        type: "string",
        enum: ["Processing", "Shipped", "Delivered", "Action needed"],
      },
    }),
    annotations: { readOnlyHint: true },
  },
  {
    name: "list_voltage_admin_customers",
    description:
      "用途：列出匿名客戶區隔與消費摘要。何時呼叫：詢問 VIP、回訪或新客分布時。觸發例子：「列出 VIP」、「客戶區隔」、「回訪客有多少」、「新客資料」。不該呼叫：索取姓名、Email、地址或其他個資時。",
    inputSchema: schema({
      segment: { type: "string", enum: ["New", "Returning", "VIP"] },
    }),
    annotations: { readOnlyHint: true },
  },
  {
    name: "list_voltage_admin_inventory",
    description:
      "用途：列出目前庫存，或只查看低庫存商品。何時呼叫：盤點、補貨或詢問庫存風險時。觸發例子：「低庫存」、「庫存清單」、「要補哪些貨」、「列出前 10 件庫存」。不該呼叫：使用者要找訂單或客戶時。",
    inputSchema: schema({
      lowStockOnly: {
        type: "boolean",
        description: "true 時只回傳庫存 12 以下且大於 0 的商品。",
      },
    }),
    annotations: { readOnlyHint: true, untrustedContentHint: true },
  },
  {
    name: "set_voltage_admin_inventory",
    description:
      "用途：更新一件商品的後台庫存數量。何時呼叫：管理者明確要求補貨或校正存量時。觸發例子：「商品 5 改成 20 件」、「補貨到 48」、「將庫存設為 0」、「校正商品 18 存量」。不該呼叫：未指定商品與非負整數存量時。",
    inputSchema: schema(
      {
        productId: { type: "number", description: "要更新的商品 ID。" },
        stock: { type: "number", description: "新的非負整數庫存數量。" },
      },
      ["productId", "stock"]
    ),
  },
  {
    name: "open_voltage_admin_section",
    description:
      "用途：開啟後台管理區塊。何時呼叫：使用者要切換 Dashboard、Products、Orders、Customers 或 Inventory 時。觸發例子：「開啟商品管理」、「帶我到庫存」、「查看客戶」、「前往訂單」。不該呼叫：用來建立、確認或取消訂單時。",
    inputSchema: schema(
      {
        section: {
          type: "string",
          enum: ["dashboard", "products", "orders", "customers", "inventory"],
        },
      },
      ["section"]
    ),
  },
  {
    name: "navigate_state",
    description:
      "用途：讀取目前後台區塊與可用上一頁／下一頁狀態。何時呼叫：host 初始化或頁面導覽後。觸發例子：「目前在哪」、「更新導覽」、「能回上一頁嗎」。不該呼叫：不可讀取表單或個資。",
    inputSchema: noInput,
    annotations: { readOnlyHint: true },
  },
  {
    name: "navigate_back",
    description:
      "用途：返回 Voltage Market Admin 的上一個區塊。何時呼叫：使用者要求上一頁或返回時。觸發例子：「上一頁」、「返回」、「回到剛才」。不該呼叫：用來變更訂單狀態時。",
    inputSchema: noInput,
  },
  {
    name: "navigate_forward",
    description:
      "用途：前往 Voltage Market Admin 的下一個區塊。何時呼叫：使用者要求下一頁或前進時。觸發例子：「下一頁」、「前進」、「回到前進頁」。不該呼叫：沒有可前進區塊時。",
    inputSchema: noInput,
  },
  {
    name: "agent_instructions",
    description:
      "用途：取得目前後台的目標與安全限制。何時呼叫：host 在每個對話回合開始時。觸發例子：新對話、切換此頁、開始庫存查詢、開始訂單摘要。不該呼叫：不能用來修改訂單或處理個資。",
    inputSchema: noInput,
    annotations: { readOnlyHint: true },
  },
  {
    name: "skill_list",
    description:
      "用途：列出可按需載入的後台作業指引。何時呼叫：host 在每個對話回合開始時。觸發例子：盤點、查看訂單、客戶區隔、詢問權限。不該呼叫：不能用來存取個資。",
    inputSchema: noInput,
    annotations: { readOnlyHint: true },
  },
  {
    name: "load_skill",
    description:
      "用途：取得指定後台作業指引。何時呼叫：模型需要 skill_list 內的流程細節時。觸發例子：庫存更新、訂單安全、客戶區隔、營運摘要。不該呼叫：名稱不在 skill_list 時。",
    inputSchema: schema(
      { name: { type: "string", description: "skill_list 所列的技能名稱。" } },
      ["name"]
    ),
    annotations: { readOnlyHint: true },
  },
]

const useVoltageAdminWebMcpTools = (
  toolDefinitions: WebMcpRegisteredTool[],
  executeTool: (
    name: string,
    args: Record<string, unknown>
  ) => Promise<unknown>,
  prepareProvider?: () => Promise<void>
) => {
  const executeRef = useRef(executeTool)

  useEffect(() => {
    executeRef.current = executeTool
  }, [executeTool])

  useLayoutEffect(() => {
    const modelContext = (document as WebMcpDocument).modelContext
    const controller = new AbortController()
    const registerTools = async () => {
      await prepareProvider?.()
      if (controller.signal.aborted) return

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
        } catch (error) {
          if (controller.signal.aborted || isAbortError(error)) return
          throw error
        }
        return
      }

      ;(window as WebMcpWindow).__webmcpTestProvider = {
        getTools: () => toolDefinitions,
        executeTool: (tool, args) => executeRef.current(tool.name, args),
      } satisfies WebMcpTestProvider
    }

    const currentWindow = window as WebMcpWindow
    const readyPromise = registerTools()
    currentWindow.__webmcpReady = readyPromise
    void readyPromise.catch((error) => {
      if (!controller.signal.aborted && !isAbortError(error)) {
        console.error(
          "Voltage Market Admin WebMCP tool registration failed.",
          error
        )
      }
    })

    return () => {
      controller.abort()
      delete currentWindow.__webmcpReady
      delete currentWindow.__webmcpTestProvider
    }
  }, [prepareProvider, toolDefinitions])
}

const statusClass = (status: string) => {
  if (status === "Delivered") return "bg-[#e5eee7] text-[#48614c]"
  if (status === "Action needed") return "bg-[#f4e5d7] text-[#8b5d3c]"
  if (status === "Shipped") return "bg-[#e4eaed] text-[#4f6975]"
  return "bg-[#ece8d9] text-[#6e6746]"
}

const SectionTitle = ({
  eyebrow,
  title,
  detail,
}: {
  eyebrow: string
  title: string
  detail: string
}) => (
  <div className="voltage-admin-title">
    <p>{eyebrow}</p>
    <h1>{title}</h1>
    <span>{detail}</span>
  </div>
)

const DataTable = ({ children }: { children: React.ReactNode }) => (
  <div className="overflow-x-auto rounded-2xl border border-[#cfd3cb] bg-[#f5f6f1]">
    {children}
  </div>
)

export const VoltageAdminDemo = () => {
  const reportingControllerRef = useRef<ReportingRuntimeController | null>(null)
  if (reportingControllerRef.current == null) {
    reportingControllerRef.current = new ReportingRuntimeController()
  }
  const prepareReportingRuntime = useCallback(async () => {
    await reportingControllerRef.current?.prepare()
  }, [])

  useEffect(() => {
    return () => {
      const controller = reportingControllerRef.current
      void controller?.dispose()
    }
  }, [])

  const { view, setView, goBack, goForward, getNavigationState } =
    useWebMcpNavigation<VoltageAdminView>("dashboard")
  const [inventory, setInventory] = useState<VoltageAdminInventory>(
    createVoltageAdminInventory
  )
  const [productQuery, setProductQuery] = useState("")
  const [inventoryQuery, setInventoryQuery] = useState("")
  const [lowStockOnly, setLowStockOnly] = useState(false)
  const dashboard = useMemo(
    () => getVoltageAdminDashboard(inventory),
    [inventory]
  )
  const products = useMemo(
    () => searchVoltageAdminProducts(productQuery, inventory),
    [inventory, productQuery]
  )
  const inventoryProducts = useMemo(
    () =>
      searchVoltageAdminProducts(inventoryQuery, inventory, 194).filter(
        (product) => !lowStockOnly || (product.stock > 0 && product.stock <= 12)
      ),
    [inventory, inventoryQuery, lowStockOnly]
  )

  const executeTool = async (name: string, args: Record<string, unknown>) => {
    if (name === EXECUTE_READONLY_SQL_TOOL_NAME) {
      const controller = reportingControllerRef.current
      if (!controller) {
        throw new Error("SQLite reporting runtime is not ready.")
      }
      return controller.execute(args)
    }
    if (name === "agent_instructions") {
      return {
        text: "目標：協助 Voltage Market 商家查閱 Dashboard、Products、Orders、Customers 與 Inventory。可查詢匿名化營運資料，並在管理者明確指定商品與非負整數存量時更新庫存。不得在 Chat 索取、接收、重述或輸出姓名、Email、地址、電話、帳戶或付款資料；不得建立、確認或取消訂單。需要流程細節時，載入對應 skill。",
      }
    }
    if (name === "skill_list") {
      return {
        skills: [
          {
            name: "voltage-admin-inventory",
            description:
              "用途：安全更新後台庫存。何時呼叫：管理者明確要求補貨或校正時。觸發例子：「補貨」、「庫存改為 20」、「盤點」、「缺貨商品」。不該呼叫：未指定商品和數量時。",
          },
          {
            name: "voltage-admin-order-safety",
            description:
              "用途：說明匿名訂單查閱的安全邊界。何時呼叫：詢問訂單處理或客戶資料限制時。觸發例子：「訂單怎麼處理」、「取消訂單」、「客戶資料」、「付款狀態」。不該呼叫：僅需商品庫存時。",
          },
        ],
      }
    }
    if (name === "load_skill") {
      if (args.name === "voltage-admin-inventory") {
        return {
          type: "skill",
          name: "voltage-admin-inventory",
          text: "先用 get_voltage_admin_product 或 list_voltage_admin_inventory 確認目前庫存。只有當管理者明確提供商品 ID 與新的非負整數存量時，才可使用 set_voltage_admin_inventory。回覆更新後的商品與庫存摘要；不要推測或自行調整存量。",
        }
      }
      if (args.name === "voltage-admin-order-safety") {
        return {
          type: "skill",
          name: "voltage-admin-order-safety",
          text: "訂單工具只提供匿名化摘要，不能回傳或索取姓名、Email、地址、電話或付款資料。不得以任何 WebMCP tool 建立、確認或取消訂單；需要這些高風險操作時，請使用者直接在安全的管理頁面完成最終動作。",
        }
      }
      return { status: "ARGUMENT_ERROR", message: "Skill not found." }
    }
    if (name === "get_voltage_admin_dashboard")
      return getVoltageAdminDashboard(inventory)
    if (name === "search_voltage_admin_products") {
      const query = typeof args.query === "string" ? args.query : ""
      return { items: searchVoltageAdminProducts(query, inventory) }
    }
    if (name === "get_voltage_admin_product") {
      const productId = args.productId
      const product =
        typeof productId === "number"
          ? voltageProductById.get(productId)
          : undefined
      return product
        ? { status: "OK", product: toAdminProduct(product, inventory) }
        : { status: "ARGUMENT_ERROR", message: "Product not found." }
    }
    if (name === "list_voltage_admin_orders") {
      const status = typeof args.status === "string" ? args.status : undefined
      return {
        items: voltageAdminOrders.filter(
          (order) => !status || order.status === status
        ),
      }
    }
    if (name === "list_voltage_admin_customers") {
      const segment =
        typeof args.segment === "string" ? args.segment : undefined
      return {
        items: voltageAdminCustomers.filter(
          (customer) => !segment || customer.segment === segment
        ),
      }
    }
    if (name === "list_voltage_admin_inventory") {
      const lowStock = args.lowStockOnly === true
      const items = searchVoltageAdminProducts("", inventory, 194).filter(
        (product) => !lowStock || (product.stock > 0 && product.stock <= 12)
      )
      return { items: items.slice(0, 20), total: items.length }
    }
    if (name === "set_voltage_admin_inventory") {
      const productId = args.productId
      const stock = args.stock
      if (typeof productId !== "number" || typeof stock !== "number") {
        return {
          status: "ARGUMENT_ERROR",
          message: "productId and stock are required.",
        }
      }
      const nextInventory = setVoltageAdminInventory(
        inventory,
        productId,
        stock
      )
      const product = voltageProductById.get(productId)
      if (!nextInventory || !product) {
        return {
          status: "ARGUMENT_ERROR",
          message:
            "Use an existing product ID and a non-negative integer stock value.",
        }
      }
      setInventory(nextInventory)
      return { status: "OK", product: toAdminProduct(product, nextInventory) }
    }
    if (name === "open_voltage_admin_section") {
      if (!isSection(args.section))
        return { status: "ARGUMENT_ERROR", message: "Unknown admin section." }
      setView(args.section)
      return { status: "OK", section: args.section }
    }
    if (name === "navigate_state")
      return { status: "OK", ...getNavigationState() }
    if (name === "navigate_back") {
      goBack()
      return { status: "OK", ...getNavigationState() }
    }
    if (name === "navigate_forward") {
      goForward()
      return { status: "OK", ...getNavigationState() }
    }
    return { status: "NOT_FOUND", message: "Unknown tool." }
  }

  useVoltageAdminWebMcpTools(
    VOLTAGE_ADMIN_TOOLS,
    executeTool,
    prepareReportingRuntime
  )

  const navigation = [
    ["dashboard", "Dashboard", LayoutDashboard],
    ["products", "Products", PackageSearch],
    ["orders", "Orders", ClipboardList],
    ["customers", "Customers", Users],
    ["inventory", "Inventory", Boxes],
  ] as const

  return (
    <main className="voltage-admin min-h-full p-4 sm:p-6">
      <div className="mx-auto max-w-7xl">
        <header className="voltage-admin-header">
          <button
            type="button"
            onClick={() => setView("dashboard")}
            className="voltage-admin-brand"
          >
            <span>
              <Sparkles className="size-5" />
            </span>
            <span>
              <small>Voltage Market</small>
              <strong>Merchant Console</strong>
            </span>
          </button>
          <Badge className="hidden border-0 bg-[#e2e5df] text-[#4c574e] sm:inline-flex">
            Demo workspace · local data
          </Badge>
        </header>

        <div className="grid gap-6 lg:grid-cols-[13.5rem_minmax(0,1fr)]">
          <nav
            className="voltage-admin-nav"
            aria-label="Voltage Market Admin 導覽"
          >
            <p>Workspace</p>
            <div>
              {navigation.map(([target, label, Icon]) => (
                <button
                  key={target}
                  type="button"
                  onClick={() => setView(target)}
                  className={view === target ? "is-active" : ""}
                >
                  <Icon className="size-4" />
                  {label}
                  {target === "inventory" && dashboard.lowStockCount > 0 ? (
                    <span>{dashboard.lowStockCount}</span>
                  ) : null}
                </button>
              ))}
            </div>
            <aside>
              <BarChart3 className="size-4" />
              <p>
                Data is shared in spirit with Voltage Market’s embedded catalog.
              </p>
            </aside>
          </nav>

          <div className="min-w-0">
            {view === "dashboard" ? (
              <section aria-label="Voltage Market Admin Dashboard">
                <SectionTitle
                  eyebrow="Overview · last 7 days"
                  title="A calm read on the store."
                  detail="Built from the same embedded catalog as Voltage Market."
                />
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    [
                      "Revenue",
                      formatMoney(dashboard.revenue),
                      "+12.4% this week",
                    ],
                    [
                      "Orders",
                      dashboard.orderCount.toString(),
                      "2 need attention",
                    ],
                    [
                      "Customers",
                      dashboard.customerCount.toString(),
                      "Anonymous segments",
                    ],
                    [
                      "Available SKUs",
                      dashboard.availableProductCount.toString(),
                      `${dashboard.lowStockCount} low stock`,
                    ],
                  ].map(([label, value, detail]) => (
                    <article key={label} className="voltage-admin-metric">
                      <span>{label}</span>
                      <strong>{value}</strong>
                      <small>{detail}</small>
                    </article>
                  ))}
                </div>
                <div className="mt-6 grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
                  <article className="voltage-admin-panel">
                    <div className="voltage-admin-panel-heading">
                      <div>
                        <p>Latest activity</p>
                        <h2>Order queue</h2>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="cursor-pointer"
                        onClick={() => setView("orders")}
                      >
                        All orders <ChevronRight className="size-4" />
                      </Button>
                    </div>
                    <div className="space-y-1">
                      {voltageAdminOrders.slice(0, 4).map((order) => (
                        <div key={order.id} className="voltage-admin-list-row">
                          <span>
                            <strong>{order.id}</strong>
                            <small>
                              {order.itemCount} items · {order.createdAt}
                            </small>
                          </span>
                          <span>
                            <Badge className={statusClass(order.status)}>
                              {order.status}
                            </Badge>
                            <strong>{formatMoney(order.total)}</strong>
                          </span>
                        </div>
                      ))}
                    </div>
                  </article>
                  <article className="voltage-admin-panel voltage-admin-alert">
                    <div className="voltage-admin-panel-heading">
                      <div>
                        <p>Inventory signal</p>
                        <h2>Low stock</h2>
                      </div>
                      <CircleAlert className="size-5" />
                    </div>
                    {dashboard.lowStockProducts.length > 0 ? (
                      dashboard.lowStockProducts.slice(0, 4).map((product) => (
                        <div
                          key={product.id}
                          className="voltage-admin-alert-row"
                        >
                          <span>{product.title}</span>
                          <strong>{product.stock} left</strong>
                        </div>
                      ))
                    ) : (
                      <p>Everything is comfortably stocked.</p>
                    )}
                    <Button
                      variant="outline"
                      className="mt-5 w-full cursor-pointer"
                      onClick={() => setView("inventory")}
                    >
                      Review inventory
                    </Button>
                  </article>
                </div>
              </section>
            ) : null}

            {view === "products" ? (
              <section aria-label="Voltage Market Admin Products">
                <SectionTitle
                  eyebrow="Catalog management"
                  title="Products, kept focused."
                  detail={`${products.length} matching products in the current preview.`}
                />
                <label className="voltage-admin-search">
                  <Search className="size-4" />
                  <span className="sr-only">搜尋商品</span>
                  <input
                    value={productQuery}
                    onChange={(event) => setProductQuery(event.target.value)}
                    placeholder="Search product, category, brand…"
                  />
                </label>
                <DataTable>
                  <table>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Category</th>
                        <th>Price</th>
                        <th>Rating</th>
                        <th>Inventory</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((product) => (
                        <tr key={product.id}>
                          <td>
                            <strong>{product.title}</strong>
                            <small>#{product.id}</small>
                          </td>
                          <td>{product.category}</td>
                          <td>{formatMoney(product.price)}</td>
                          <td>{product.rating.toFixed(1)} / 5</td>
                          <td>
                            <Badge
                              className={
                                product.stock <= 12
                                  ? "bg-[#f4e5d7] text-[#8b5d3c]"
                                  : "bg-[#e5eee7] text-[#48614c]"
                              }
                            >
                              {product.stock} units
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </DataTable>
              </section>
            ) : null}

            {view === "orders" ? (
              <section aria-label="Voltage Market Admin Orders">
                <SectionTitle
                  eyebrow="Order operations"
                  title="A private, clear queue."
                  detail="Records are anonymized; final order actions remain outside WebMCP."
                />
                <DataTable>
                  <table>
                    <thead>
                      <tr>
                        <th>Order</th>
                        <th>Customer ref</th>
                        <th>Created</th>
                        <th>Status</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {voltageAdminOrders.map((order) => (
                        <tr key={order.id}>
                          <td>
                            <strong>{order.id}</strong>
                            <small>{order.itemCount} items</small>
                          </td>
                          <td>{order.customerId}</td>
                          <td>{order.createdAt}</td>
                          <td>
                            <Badge className={statusClass(order.status)}>
                              {order.status}
                            </Badge>
                          </td>
                          <td>{formatMoney(order.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </DataTable>
              </section>
            ) : null}

            {view === "customers" ? (
              <section aria-label="Voltage Market Admin Customers">
                <SectionTitle
                  eyebrow="Customer intelligence"
                  title="Segments without identities."
                  detail="Only non-identifying demo references are available to the agent."
                />
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {voltageAdminCustomers.map((customer) => (
                    <article
                      key={customer.id}
                      className="voltage-admin-customer"
                    >
                      <div>
                        <span>{customer.id}</span>
                        <Badge
                          className={
                            customer.segment === "VIP"
                              ? "bg-[#e4eaed] text-[#4f6975]"
                              : "bg-[#e5eee7] text-[#48614c]"
                          }
                        >
                          {customer.segment}
                        </Badge>
                      </div>
                      <strong>{formatMoney(customer.lifetimeValue)}</strong>
                      <p>
                        {customer.orders} orders · active {customer.lastActive}
                      </p>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            {view === "inventory" ? (
              <section aria-label="Voltage Market Admin Inventory">
                <SectionTitle
                  eyebrow="Stock control"
                  title="Keep the shelf in view."
                  detail="Changes update this local Demo3 workspace only."
                />
                <div className="mb-4 flex flex-col gap-3 sm:flex-row">
                  <label className="voltage-admin-search flex-1">
                    <Search className="size-4" />
                    <span className="sr-only">搜尋庫存</span>
                    <input
                      value={inventoryQuery}
                      onChange={(event) =>
                        setInventoryQuery(event.target.value)
                      }
                      placeholder="Search inventory…"
                    />
                  </label>
                  <Button
                    type="button"
                    variant={lowStockOnly ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => setLowStockOnly((current) => !current)}
                  >
                    Low stock only
                  </Button>
                </div>
                <DataTable>
                  <table>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Category</th>
                        <th>Current stock</th>
                        <th>Update stock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inventoryProducts.slice(0, 24).map((product) => (
                        <tr key={product.id}>
                          <td>
                            <strong>{product.title}</strong>
                            <small>#{product.id}</small>
                          </td>
                          <td>{product.category}</td>
                          <td>
                            <Badge
                              className={
                                product.stock <= 12
                                  ? "bg-[#f4e5d7] text-[#8b5d3c]"
                                  : "bg-[#e5eee7] text-[#48614c]"
                              }
                            >
                              {product.stock} units
                            </Badge>
                          </td>
                          <td>
                            <input
                              aria-label={`${product.title} 庫存`}
                              type="number"
                              min="0"
                              step="1"
                              value={product.stock}
                              onChange={(event) => {
                                const next = setVoltageAdminInventory(
                                  inventory,
                                  product.id,
                                  Number(event.target.value)
                                )
                                if (next) setInventory(next)
                              }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </DataTable>
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  )
}
