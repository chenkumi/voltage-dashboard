import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { Outlet, useLocation, useNavigate } from "react-router-dom"
import type {
  WebMcpDocument,
  WebMcpRegisteredTool,
  WebMcpTestProvider,
  WebMcpWindow,
} from "./types"
import { executeWebMcpToolWithDebugLog } from "./tool-debug"
import {
  getVoltageAdminDashboard,
  listSafeVoltageAdminOrders,
  listVoltageAdminCustomerSegments,
  searchVoltageAdminProducts,
  toAdminProduct,
} from "./voltage-admin-data"
import {
  getVoltageAdminAgentInstructions,
  listVoltageAdminSkills,
  loadVoltageAdminSkill,
} from "./voltage-admin-skills"
import {
  executeOperationsTool,
  isOperationsTool,
  OPERATIONS_TOOLS,
} from "./operations/operations-tools"
import {
  EXECUTE_READONLY_SQL_TOOL,
  EXECUTE_READONLY_SQL_TOOL_NAME,
  ReportingRuntimeController,
} from "./reporting/reporting-tools"
import { createReportingDataSnapshot } from "./reporting/reporting-data"
import {
  isReportAuthoringTool,
  REPORT_AUTHORING_TOOLS,
} from "./reporting/report-tools"
import { OperationsController } from "./operations/operations-controller"
import type { WorkflowSnapshot } from "./operations/types"
import { ProductRepository } from "./products/product-repository"
import { ProductEditorController } from "./products/product-editor-controller"
import {
  executeProductTool,
  isProductTool,
  PRODUCT_EDITOR_TOOLS,
  PRODUCT_GLOBAL_TOOLS,
} from "./products/product-tools"
import {
  ProductStore,
  useProductStore,
  type ProductStoreSnapshot,
} from "./products/product-store"

export type VoltageAdminView =
  | "dashboard"
  | "products"
  | "orders"
  | "customers"
  | "inventory"
  | "reports"
  | "catalog-intake"
  | "operations-cases"
  | "approvals"

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

const LEGACY_CATALOG_TOOL_NAMES = new Set([
  "list_catalog_candidates",
  "get_catalog_candidate",
  "save_product_draft",
  "open_product_review",
])
const DISCOVERED_OPERATIONS_TOOLS = OPERATIONS_TOOLS.filter(
  ({ name }) => !LEGACY_CATALOG_TOOL_NAMES.has(name)
)

const isAbortError = (error: unknown) =>
  error instanceof Error && error.name === "AbortError"

// Route utilities are shared by the nested route layout and WebMCP provider.
// eslint-disable-next-line react-refresh/only-export-components
export const isVoltageAdminView = (value: unknown): value is VoltageAdminView =>
  value === "dashboard" ||
  value === "products" ||
  value === "orders" ||
  value === "customers" ||
  value === "inventory" ||
  value === "reports" ||
  value === "catalog-intake" ||
  value === "operations-cases" ||
  value === "approvals"

// eslint-disable-next-line react-refresh/only-export-components
export const voltageAdminPath = (view: VoltageAdminView) => `/${view}`

// eslint-disable-next-line react-refresh/only-export-components
export const voltageAdminViewFromPath = (
  pathname: string
): VoltageAdminView => {
  const view = pathname.split("/")[1]
  return isVoltageAdminView(view) ? view : "dashboard"
}

const VOLTAGE_ADMIN_COMMON_TOOLS: WebMcpRegisteredTool[] = [
  {
    name: "get_voltage_admin_dashboard",
    description:
      "Purpose: read the Voltage Dashboard operations summary. Call when asked about revenue, orders, customers, or low stock. Examples: ‘How is today’s operation?’, ‘How many orders?’, ‘Low-stock products’, ‘Admin summary’. Do not call when a single product’s details are needed.",
    inputSchema: noInput,
    annotations: { readOnlyHint: true },
  },
  EXECUTE_READONLY_SQL_TOOL,
  ...REPORT_AUTHORING_TOOLS,
  ...DISCOVERED_OPERATIONS_TOOLS,
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
          description: "Voltage Dashboard product ID.",
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
      "Purpose: open a Dashboard section, including catalog intake, operations cases, approvals, inventory, or reports. Examples: ‘Open catalog intake’, ‘Take me to operations cases’, ‘View approvals’, ‘Go to reports’. Do not call to perform a final action.",
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
            "catalog-intake",
            "operations-cases",
            "approvals",
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

// Exported for WebMCP capability and privacy-boundary tests.
// eslint-disable-next-line react-refresh/only-export-components
export const VOLTAGE_ADMIN_TOOLS: WebMcpRegisteredTool[] = [
  ...VOLTAGE_ADMIN_COMMON_TOOLS,
  ...PRODUCT_GLOBAL_TOOLS,
]

type VoltageAdminContextValue = {
  dashboard: ReturnType<typeof getVoltageAdminDashboard>
  operationsController: OperationsController
  productRepository: ProductRepository
  productEditorController: ProductEditorController
  products: ProductStoreSnapshot
  reportingController: ReportingRuntimeController
  workflow: WorkflowSnapshot
}

const VoltageAdminContext = createContext<VoltageAdminContextValue | null>(null)

// eslint-disable-next-line react-refresh/only-export-components
export const useVoltageAdmin = () => {
  const context = useContext(VoltageAdminContext)
  if (!context) {
    throw new Error("useVoltageAdmin must be used inside VoltageAdminProvider.")
  }
  return context
}

const useVoltageAdminWebMcpTools = (
  executeTool: (
    name: string,
    args: Record<string, unknown>
  ) => Promise<unknown>,
  prepareProvider: () => Promise<void>,
  tools: readonly WebMcpRegisteredTool[]
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
      await prepareProvider()
      if (controller.signal.aborted) return

      if (modelContext?.registerTool) {
        await Promise.all(
          tools.map((tool) =>
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
        return
      }

      ;(window as WebMcpWindow).__webmcpTestProvider = {
        getTools: () => [...tools],
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
  }, [prepareProvider, tools])
}

export const VoltageAdminProvider = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [reportingController] = useState(() => new ReportingRuntimeController())
  const [operationsController] = useState(() => new OperationsController())
  const [productRepository] = useState(() => new ProductRepository())
  const [productEditorController] = useState(
    () => new ProductEditorController()
  )
  const [productStore] = useState(() => new ProductStore(productRepository))
  const products = useProductStore(productStore)
  const dashboard = useMemo(
    () => getVoltageAdminDashboard(products.products),
    [products.products]
  )
  const workflow = useSyncExternalStore(
    operationsController.subscribe,
    operationsController.getSnapshot,
    operationsController.getSnapshot
  )
  const sectionRef = useRef(voltageAdminViewFromPath(location.pathname))
  const routeTools = useMemo(
    () => [
      ...VOLTAGE_ADMIN_TOOLS,
      ...(/^\/products\/(?:add|edit\/\d+)$/.test(location.pathname)
        ? PRODUCT_EDITOR_TOOLS
        : []),
    ],
    [location.pathname]
  )

  useEffect(() => {
    sectionRef.current = voltageAdminViewFromPath(location.pathname)
  }, [location.pathname])

  useEffect(() => {
    return productRepository.subscribe(async (mutation) => {
      const currentProducts = await productRepository.list({
        includeArchived: true,
      })
      await reportingController.prepare(
        createReportingDataSnapshot(currentProducts),
        mutation.version
      )
    })
  }, [productRepository, reportingController])

  useEffect(() => {
    void productStore.initialize()
    return () => productStore.dispose()
  }, [productStore])

  useEffect(() => {
    return () => {
      void reportingController.dispose()
      operationsController.dispose()
    }
  }, [operationsController, reportingController])

  const prepareProvider = useCallback(async () => {
    await productStore.initialize()
    const snapshot = productStore.getSnapshot()
    await reportingController.prepare(
      createReportingDataSnapshot(snapshot.products),
      productRepository.getVersion()
    )
  }, [productRepository, productStore, reportingController])

  const getNavigationState = useCallback(() => {
    const historyIndex = window.history.state?.idx
    return {
      page: sectionRef.current,
      canGoBack: typeof historyIndex === "number" && historyIndex > 0,
      canGoForward: false,
    }
  }, [])

  const executeTool = async (name: string, args: Record<string, unknown>) => {
    if (!routeTools.some((tool) => tool.name === name)) {
      return {
        status: "NOT_FOUND",
        message: "Tool is not available on this route.",
      }
    }
    if (isProductTool(name)) {
      return executeProductTool({
        name,
        args,
        repository: productRepository,
        editor: productEditorController,
        navigate: (path) => navigate(path),
      })
    }
    if (name === EXECUTE_READONLY_SQL_TOOL_NAME) {
      return reportingController.execute(args)
    }
    if (isReportAuthoringTool(name)) {
      return reportingController.executeReportTool(name, args)
    }
    if (isOperationsTool(name)) {
      return executeOperationsTool(operationsController, name, args, (view) =>
        navigate(voltageAdminPath(view))
      )
    }
    if (name === "agent_instructions") {
      return { text: getVoltageAdminAgentInstructions(sectionRef.current) }
    }
    if (name === "skill_list") return listVoltageAdminSkills()
    if (name === "load_skill") return loadVoltageAdminSkill(args.name)
    if (name === "get_voltage_admin_dashboard") {
      return getVoltageAdminDashboard(
        await productRepository.list({ includeArchived: true })
      )
    }
    if (name === "search_voltage_admin_products") {
      const query = typeof args.query === "string" ? args.query : ""
      return {
        items: searchVoltageAdminProducts(
          query,
          await productRepository.list({ includeArchived: true })
        ),
      }
    }
    if (name === "get_voltage_admin_product") {
      const productId = args.productId
      const product =
        typeof productId === "number"
          ? await productRepository.get(productId)
          : null
      return product
        ? { status: "OK", product: toAdminProduct(product) }
        : { status: "ARGUMENT_ERROR", message: "Product not found." }
    }
    if (name === "list_voltage_admin_orders") {
      const status =
        typeof args.status === "string"
          ? (args.status as Parameters<typeof listSafeVoltageAdminOrders>[0])
          : undefined
      return {
        items: listSafeVoltageAdminOrders(status),
      }
    }
    if (name === "list_voltage_admin_customers") {
      const segment =
        typeof args.segment === "string"
          ? (args.segment as Parameters<
              typeof listVoltageAdminCustomerSegments
            >[0])
          : undefined
      return {
        items: listVoltageAdminCustomerSegments(segment),
      }
    }
    if (name === "list_voltage_admin_inventory") {
      const lowStock = args.lowStockOnly === true
      const items = searchVoltageAdminProducts(
        "",
        await productRepository.list({ includeArchived: true }),
        194
      ).filter(
        (product) =>
          product.status !== "archived" &&
          (!lowStock || (product.stock > 0 && product.stock <= 12))
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
      if (!Number.isInteger(stock) || stock < 0) {
        return {
          status: "ARGUMENT_ERROR",
          message:
            "Use an existing product ID and a non-negative integer stock value.",
        }
      }
      try {
        const product = await productRepository.setStock(productId, stock)
        return { status: "OK", product: toAdminProduct(product) }
      } catch {
        return {
          status: "ARGUMENT_ERROR",
          message:
            "Use an existing product ID and a non-negative integer stock value.",
        }
      }
    }
    if (name === "open_voltage_admin_section") {
      if (!isVoltageAdminView(args.section)) {
        return { status: "ARGUMENT_ERROR", message: "Unknown admin section." }
      }
      navigate(voltageAdminPath(args.section))
      return { status: "OK", section: args.section }
    }
    if (name === "navigate_state") {
      return { status: "OK", ...getNavigationState() }
    }
    if (name === "navigate_back") {
      navigate(-1)
      return { status: "OK", ...getNavigationState() }
    }
    if (name === "navigate_forward") {
      navigate(1)
      return { status: "OK", ...getNavigationState() }
    }
    return { status: "NOT_FOUND", message: "Unknown tool." }
  }

  useVoltageAdminWebMcpTools(executeTool, prepareProvider, routeTools)

  const value = useMemo<VoltageAdminContextValue>(
    () => ({
      dashboard,
      operationsController,
      productRepository,
      productEditorController,
      products,
      reportingController,
      workflow,
    }),
    [
      dashboard,
      operationsController,
      productRepository,
      productEditorController,
      products,
      reportingController,
      workflow,
    ]
  )

  return (
    <VoltageAdminContext.Provider value={value}>
      <Outlet />
    </VoltageAdminContext.Provider>
  )
}
