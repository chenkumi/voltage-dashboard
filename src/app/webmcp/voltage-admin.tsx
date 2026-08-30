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
  searchVoltageAdminProducts,
  toAdminProduct,
} from "./voltage-admin-data"
import {
  getVoltageAdminAgentInstructions,
  listVoltageAdminSkills,
  loadVoltageAdminSkill,
} from "./voltage-admin-skills"
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
import {
  COMMERCE_SEED_VERSION,
  CommerceRepository,
} from "./commerce-data/commerce-repository"
import { createCommerceSeed } from "./commerce-data/commerce-seed"
import {
  CommerceStore,
  useCommerceStore,
  type CommerceStoreSnapshot,
} from "./commerce-data/commerce-store"
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
import {
  executeOperationalTool,
  isOperationalTool,
  OPERATIONAL_TOOLS,
} from "./operational-tools"
import { ReturnRepository } from "./returns/return-repository"
import { ReturnEditorController } from "./returns/return-editor-controller"
import {
  executeReturnTool,
  isReturnTool,
  REFUND_APPROVAL_DETAIL_TOOLS,
  RETURN_DETAIL_TOOLS,
  RETURN_FORM_TOOLS,
  RETURN_GLOBAL_TOOLS,
} from "./returns/return-tools"
import {
  ReturnStore,
  useReturnStore,
  type ReturnStoreSnapshot,
} from "./returns/return-store"

export type VoltageAdminView =
  | "dashboard"
  | "products"
  | "orders"
  | "customers"
  | "inventory"
  | "returns"
  | "reports"
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

const isAbortError = (error: unknown) =>
  error instanceof Error && error.name === "AbortError"

const operationalReportingVersion = (
  productVersion: number,
  commerceVersion: number
) => {
  const sum = productVersion + commerceVersion
  return (sum * (sum + 1)) / 2 + commerceVersion
}

// Route utilities are shared by the nested route layout and WebMCP provider.
// eslint-disable-next-line react-refresh/only-export-components
export const isVoltageAdminView = (value: unknown): value is VoltageAdminView =>
  value === "dashboard" ||
  value === "products" ||
  value === "orders" ||
  value === "customers" ||
  value === "inventory" ||
  value === "returns" ||
  value === "reports" ||
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
    annotations: { readOnlyHint: true, untrustedContentHint: true },
  },
  EXECUTE_READONLY_SQL_TOOL,
  ...REPORT_AUTHORING_TOOLS,
  ...RETURN_GLOBAL_TOOLS,
  ...OPERATIONAL_TOOLS,
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
    name: "open_voltage_admin_section",
    description:
      "Purpose: open a Dashboard section, including products, operations cases, approvals, inventory, or reports. Examples: ‘Open products’, ‘Take me to operations cases’, ‘View approvals’, ‘Go to reports’. Do not call to perform a final action.",
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
            "returns",
            "reports",
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
  commerce: CommerceStoreSnapshot
  commerceRepository: CommerceRepository
  dashboard: ReturnType<typeof getVoltageAdminDashboard>
  operationsController: OperationsController
  productRepository: ProductRepository
  productEditorController: ProductEditorController
  products: ProductStoreSnapshot
  reportingController: ReportingRuntimeController
  returnRepository: ReturnRepository
  returnEditorController: ReturnEditorController
  returns: ReturnStoreSnapshot
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
  const [commerceSeed] = useState(() => createCommerceSeed())
  const [commerceRepository] = useState(
    () => new CommerceRepository({ seed: commerceSeed })
  )
  const [returnRepository] = useState(
    () =>
      new ReturnRepository({
        commerceSnapshot: commerceSeed,
        orderSnapshotVersion: COMMERCE_SEED_VERSION,
      })
  )
  const [returnEditorController] = useState(() => new ReturnEditorController())
  const [productEditorController] = useState(
    () => new ProductEditorController()
  )
  const [productStore] = useState(() => new ProductStore(productRepository))
  const [commerceStore] = useState(() => new CommerceStore(commerceRepository))
  const [returnStore] = useState(() => new ReturnStore(returnRepository))
  const products = useProductStore(productStore)
  const commerce = useCommerceStore(commerceStore)
  const returns = useReturnStore(returnStore)
  const dashboard = useMemo(
    () => getVoltageAdminDashboard(products.products, commerce),
    [commerce, products.products]
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
      ...(location.pathname === "/returns/add" ? RETURN_FORM_TOOLS : []),
      ...(location.pathname !== "/returns/add" &&
      /^\/returns\/[^/]+$/.test(location.pathname)
        ? RETURN_DETAIL_TOOLS
        : []),
      ...(/^\/refund-approvals\/[^/]+$/.test(location.pathname)
        ? REFUND_APPROVAL_DETAIL_TOOLS
        : []),
    ],
    [location.pathname]
  )

  useEffect(() => {
    sectionRef.current = voltageAdminViewFromPath(location.pathname)
  }, [location.pathname])

  useEffect(() => {
    if (products.state !== "ready" || commerce.state !== "ready") return
    let cancelled = false
    void productRepository
      .listInventoryMovements()
      .then((movements) => {
        if (cancelled) return
        return reportingController.prepare(
          createReportingDataSnapshot({
            products: products.products,
            inventoryMovements: movements,
            commerce,
          }),
          operationalReportingVersion(products.version, commerce.version)
        )
      })
      .catch((error) => {
        if (!cancelled)
          console.error("Operational reporting refresh failed.", error)
      })
    return () => {
      cancelled = true
    }
  }, [commerce, productRepository, products, reportingController])

  useEffect(() => {
    void productStore.initialize()
    void commerceStore.initialize()
    void returnStore.initialize()
    return () => {
      productStore.dispose()
      commerceStore.dispose()
      returnStore.dispose()
    }
  }, [commerceStore, productStore, returnStore])

  useEffect(() => {
    return () => {
      void reportingController.dispose()
      operationsController.dispose()
      returnRepository.close()
    }
  }, [operationsController, reportingController, returnRepository])

  const prepareProvider = useCallback(async () => {
    await Promise.all([
      productStore.initialize(),
      commerceStore.initialize(),
      returnStore.initialize(),
    ])
    const productSnapshot = productStore.getSnapshot()
    const commerceSnapshot = commerceStore.getSnapshot()
    const movements = await productRepository.listInventoryMovements()
    await reportingController.prepare(
      createReportingDataSnapshot({
        products: productSnapshot.products,
        inventoryMovements: movements,
        commerce: commerceSnapshot,
      }),
      operationalReportingVersion(
        productSnapshot.version,
        commerceSnapshot.version
      )
    )
  }, [
    commerceStore,
    productRepository,
    productStore,
    reportingController,
    returnStore,
  ])

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
    if (isReturnTool(name)) {
      return executeReturnTool({
        name,
        args,
        repository: returnRepository,
        commerce: await commerceRepository.getSnapshot(),
        editor: returnEditorController,
        navigate: (path) => navigate(path),
      })
    }
    if (isOperationalTool(name)) {
      return executeOperationalTool({
        name,
        args,
        productRepository,
        commerce: await commerceRepository.getSnapshot(),
        navigate: (path) => navigate(path),
      })
    }
    if (name === "agent_instructions") {
      return { text: getVoltageAdminAgentInstructions(sectionRef.current) }
    }
    if (name === "skill_list") return listVoltageAdminSkills()
    if (name === "load_skill") return loadVoltageAdminSkill(args.name)
    if (name === "get_voltage_admin_dashboard") {
      const [currentProducts, currentCommerce] = await Promise.all([
        productRepository.list({ includeArchived: true }),
        commerceRepository.getSnapshot(),
      ])
      return getVoltageAdminDashboard(currentProducts, currentCommerce)
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
      commerce,
      commerceRepository,
      dashboard,
      operationsController,
      productRepository,
      productEditorController,
      products,
      reportingController,
      returnRepository,
      returnEditorController,
      returns,
      workflow,
    }),
    [
      commerce,
      commerceRepository,
      dashboard,
      operationsController,
      productRepository,
      productEditorController,
      products,
      reportingController,
      returnRepository,
      returnEditorController,
      returns,
      workflow,
    ]
  )

  return (
    <VoltageAdminContext.Provider value={value}>
      <Outlet />
    </VoltageAdminContext.Provider>
  )
}
