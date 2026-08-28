import {
  BarChart3,
  Boxes,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  FileChartColumn,
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
import { executeWebMcpToolWithDebugLog } from "./tool-debug"
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
  listVoltageAdminSkills,
  loadVoltageAdminSkill,
  VOLTAGE_ADMIN_AGENT_INSTRUCTIONS,
} from "./voltage-admin-skills"
import {
  EXECUTE_READONLY_SQL_TOOL,
  EXECUTE_READONLY_SQL_TOOL_NAME,
  ReportingRuntimeController,
} from "./reporting/reporting-tools"
import {
  isReportAuthoringTool,
  REPORT_AUTHORING_TOOLS,
} from "./reporting/report-tools"
import { ReportCanvas } from "./reporting/report-canvas"
import "./voltage-admin.css"

type VoltageAdminView =
  "dashboard" | "products" | "orders" | "customers" | "inventory" | "reports"

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
  value === "inventory" ||
  value === "reports"

// Exported for WebMCP capability and privacy-boundary tests.
// eslint-disable-next-line react-refresh/only-export-components
export const VOLTAGE_ADMIN_TOOLS: WebMcpRegisteredTool[] = [
  {
    name: "get_voltage_admin_dashboard",
    description:
      "Purpose: read the Voltage Market operations summary. Call when asked about revenue, orders, customers, or low stock. Examples: ‘How is today’s operation?’, ‘How many orders?’, ‘Low-stock products’, ‘Admin summary’. Do not call when a single product’s details are needed.",
    inputSchema: noInput,
    annotations: { readOnlyHint: true },
  },
  EXECUTE_READONLY_SQL_TOOL,
  ...REPORT_AUTHORING_TOOLS,
  {
    name: "search_voltage_admin_products",
    description:
      "Purpose: search admin products and inventory by keyword. Call when looking for products, brands, or categories. Examples: ‘Find beauty products’, ‘Search mascara’, ‘Product inventory’, ‘Which watches are available?’. Do not call to modify inventory.",
    inputSchema: schema({
      query: {
        type: "string",
        description: "A product, brand, category, or tag keyword.",
      },
    }),
    annotations: { readOnlyHint: true, untrustedContentHint: true },
  },
  {
    name: "get_voltage_admin_product",
    description:
      "Purpose: get an admin summary and current stock for one product. Call when the user specifies a product ID or needs to verify one item. Examples: ‘Stock for product 12’, ‘Show product details’, ‘Check product 42’, ‘How many remain?’. Do not call when only an overall low-stock summary is needed.",
    inputSchema: schema(
      {
        productId: {
          type: "number",
          description: "Voltage Market product ID.",
        },
      },
      ["productId"]
    ),
    annotations: { readOnlyHint: true, untrustedContentHint: true },
  },
  {
    name: "list_voltage_admin_orders",
    description:
      "Purpose: list anonymized admin order summaries. Call when asked about order volume, processing orders, or orders needing attention. Examples: ‘List orders’, ‘Orders in progress’, ‘Problem orders’, ‘Recent orders’. Do not call to create, confirm, or cancel an order.",
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
      "Purpose: list anonymized customer segments and spending summaries. Call when asked about VIP, returning, or new-customer distribution. Examples: ‘List VIPs’, ‘Customer segments’, ‘How many returning customers?’, ‘New customer data’. Do not call to request names, contact details, locations, or other personal data.",
    inputSchema: schema({
      segment: { type: "string", enum: ["New", "Returning", "VIP"] },
    }),
    annotations: { readOnlyHint: true },
  },
  {
    name: "list_voltage_admin_inventory",
    description:
      "Purpose: list current inventory, optionally limited to low-stock products. Call for stocktaking, restocking, or inventory-risk questions. Examples: ‘Low stock’, ‘Inventory list’, ‘What needs restocking?’, ‘Top 10 inventory items’. Do not call when the user wants orders or customers.",
    inputSchema: schema({
      lowStockOnly: {
        type: "boolean",
        description:
          "When true, return only products with stock at most 12 and greater than 0.",
      },
    }),
    annotations: { readOnlyHint: true, untrustedContentHint: true },
  },
  {
    name: "set_voltage_admin_inventory",
    description:
      "Purpose: update the admin inventory quantity for one product. Call when an administrator explicitly requests restocking or a stock correction. Examples: ‘Set product 5 to 20’, ‘Restock to 48’, ‘Set inventory to 0’, ‘Correct product 18 stock’. Do not call without a product and a non-negative integer quantity.",
    inputSchema: schema(
      {
        productId: { type: "number", description: "Product ID to update." },
        stock: {
          type: "number",
          description: "The new non-negative integer stock quantity.",
        },
      },
      ["productId", "stock"]
    ),
  },
  {
    name: "open_voltage_admin_section",
    description:
      "Purpose: open an admin section. Call when the user wants Dashboard, Products, Orders, Customers, Inventory, or Reports. Examples: ‘Open product management’, ‘Take me to inventory’, ‘View reports’, ‘Go to orders’. Do not call to create, confirm, or cancel orders.",
    inputSchema: schema(
      {
        section: {
          type: "string",
          enum: [
            "dashboard",
            "products",
            "orders",
            "customers",
            "inventory",
            "reports",
          ],
        },
      },
      ["section"]
    ),
  },
  {
    name: "navigate_state",
    description:
      "Purpose: read the current admin section and available back/forward state. Call after host initialization or navigation. Examples: ‘Where am I?’, ‘Refresh navigation’, ‘Can I go back?’. Do not use to read forms or personal data.",
    inputSchema: noInput,
    annotations: { readOnlyHint: true },
  },
  {
    name: "navigate_back",
    description:
      "Purpose: return to the previous Voltage Dashboard section. Call when the user asks to go back or return. Examples: ‘Back’, ‘Return’, ‘Go back to the previous section’. Do not use to change order status.",
    inputSchema: noInput,
  },
  {
    name: "navigate_forward",
    description:
      "Purpose: move to the next Voltage Dashboard section. Call when the user asks to go forward. Examples: ‘Next’, ‘Forward’, ‘Return to the section I moved forward from’. Do not call when no forward section is available.",
    inputSchema: noInput,
  },
  {
    name: "agent_instructions",
    description:
      "Purpose: get the current admin scope and safety limits. Call at the start of every conversation turn. Examples: a new conversation, switching to this page, starting inventory lookup, or starting an order summary. Do not use to modify orders or handle personal data.",
    inputSchema: noInput,
    annotations: { readOnlyHint: true },
  },
  {
    name: "skill_list",
    description:
      "Purpose: list on-demand admin operations and data-semantic guidance. Call at the start of every conversation turn. Examples: stocktaking, revenue analysis, report writing, or order review. Do not use to access personal data.",
    inputSchema: noInput,
    annotations: { readOnlyHint: true },
  },
  {
    name: "load_skill",
    description:
      "Purpose: get guidance for a specified admin operation or data semantic. Call when the model needs granularity, joins, analysis, or safety details from skill_list. Examples: sales data, inventory risk, report writing, or order safety. Do not call for a name absent from skill_list.",
    inputSchema: schema(
      {
        name: {
          type: "string",
          description: "A skill name listed by skill_list.",
        },
      },
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
    const executeWithDebugLog = (
      toolName: string,
      args: Record<string, unknown>
    ) =>
      executeWebMcpToolWithDebugLog({
        site: "voltage-admin",
        toolName,
        args,
        execute: () => executeRef.current(toolName, args),
      })
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
                    executeWithDebugLog(tool.name, args),
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
        executeTool: (tool, args) => executeWithDebugLog(tool.name, args),
      } satisfies WebMcpTestProvider
    }

    const currentWindow = window as WebMcpWindow
    const readyPromise = registerTools()
    currentWindow.__webmcpReady = readyPromise
    void readyPromise.catch((error) => {
      if (!controller.signal.aborted && !isAbortError(error)) {
        console.error(
          "Voltage Dashboard WebMCP tool registration failed.",
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
  const [reportingController] = useState(() => new ReportingRuntimeController())
  const prepareReportingRuntime = useCallback(async () => {
    await reportingController.prepare()
  }, [reportingController])

  useEffect(() => {
    return () => {
      void reportingController.dispose()
    }
  }, [reportingController])

  const { view, setView, goBack, goForward, getNavigationState } =
    useWebMcpNavigation<VoltageAdminView>("reports")
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
      return reportingController.execute(args)
    }
    if (isReportAuthoringTool(name)) {
      return reportingController.executeReportTool(name, args)
    }
    if (name === "agent_instructions") {
      return { text: VOLTAGE_ADMIN_AGENT_INSTRUCTIONS }
    }
    if (name === "skill_list") {
      return listVoltageAdminSkills()
    }
    if (name === "load_skill") {
      return loadVoltageAdminSkill(args.name)
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
    ["reports", "Reports", FileChartColumn],
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
              <strong>Voltage Dashboard</strong>
            </span>
          </button>
          <Badge className="hidden border-0 bg-[#e2e5df] text-[#4c574e] sm:inline-flex">
            Demo workspace · local data
          </Badge>
        </header>

        <div className="grid gap-6 lg:grid-cols-[13.5rem_minmax(0,1fr)]">
          <nav
            className="voltage-admin-nav"
            aria-label="Voltage Dashboard navigation"
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
              <section aria-label="Voltage Dashboard Overview">
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
              <section aria-label="Voltage Dashboard Products">
                <SectionTitle
                  eyebrow="Catalog management"
                  title="Products, kept focused."
                  detail={`${products.length} matching products in the current preview.`}
                />
                <label className="voltage-admin-search">
                  <Search className="size-4" />
                  <span className="sr-only">Search products</span>
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
              <section aria-label="Voltage Dashboard Orders">
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
              <section aria-label="Voltage Dashboard Customers">
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
              <section aria-label="Voltage Dashboard Inventory">
                <SectionTitle
                  eyebrow="Stock control"
                  title="Keep the shelf in view."
                  detail="Changes update this local Demo3 workspace only."
                />
                <div className="mb-4 flex flex-col gap-3 sm:flex-row">
                  <label className="voltage-admin-search flex-1">
                    <Search className="size-4" />
                    <span className="sr-only">Search inventory</span>
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
                              aria-label={`${product.title} inventory`}
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

            {view === "reports" ? (
              <section aria-label="Voltage Dashboard Reports">
                <SectionTitle
                  eyebrow="Smart Dashboard · shared workspace"
                  title="Shape the report together."
                  detail="Agent tools and your direct edits update the same in-memory report. Query evidence stays inside this Admin iframe."
                />
                <ReportCanvas controller={reportingController} />
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  )
}
