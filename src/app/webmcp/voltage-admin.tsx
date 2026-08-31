import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  Outlet,
  useLocation,
  useNavigate,
  useNavigationType,
} from "react-router-dom"
import type {
  WebMcpDocument,
  WebMcpRegisteredTool,
  WebMcpTestProvider,
  WebMcpWindow,
} from "./types"
import { executeWebMcpToolWithDebugLog } from "./tool-debug"
import {
  createToolsetKey,
  ToolsetReadinessCoordinator,
} from "./toolset-readiness"
import type { ToolsetReadinessResult } from "./toolset-readiness"
import {
  getVoltageAdminDashboard,
  searchVoltageAdminProducts,
  toAdminProduct,
} from "./voltage-admin-data"
import {
  getVoltageAdminAgentInstructions,
  listVoltageAdminSkills,
  loadVoltageAdminSkill,
  VOLTAGE_ADMIN_UNAUTHENTICATED_AGENT_INSTRUCTIONS,
} from "./voltage-admin-skills"
import { useDemoAuth } from "../auth/demo-auth"
import {
  EXECUTE_READONLY_SQL_TOOL,
  EXECUTE_READONLY_SQL_TOOL_NAME,
  ReportingRuntimeController,
} from "./reporting/reporting-tools"
import {
  createOperationalReportingVersion,
  createReportingDataSnapshot,
} from "./reporting/reporting-data"
import {
  isReportAuthoringTool,
  REPORT_AUTHORING_TOOLS,
} from "./reporting/report-tools"
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
import { ProductDraftStore } from "./products/product-draft-store"
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
  | "refund-approvals"
  | "reports"

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

const rediscoveryRequired = () => ({
  status: "RE_DISCOVER_REQUIRED",
  retryable: true,
  message:
    "The available tools changed with navigation. Fetch the current page tools once, then retry only the intended tool.",
})

const NAVIGATION_TOOL_NAMES = new Set([
  "open_voltage_admin_section",
  "navigate_back",
  "navigate_forward",
  "open_product_create",
  "open_product_detail",
  "open_product_edit",
  "open_return_create",
  "open_return_detail",
  "open_refund_approval",
  "open_inventory_detail",
  "open_order_detail",
  "open_customer_analysis",
])

const isToolResult = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)

const completeNavigationTool = async (
  name: string,
  result: unknown,
  readiness: Promise<ToolsetReadinessResult> | undefined
) => {
  if (
    !NAVIGATION_TOOL_NAMES.has(name) ||
    !isToolResult(result) ||
    result.status !== "OK"
  )
    return result

  if (!readiness) {
    return {
      status: "TOOLSET_NOT_READY",
      ready: false,
      reasonCode: "NAVIGATION_NOT_STARTED",
      retryable: false,
      message: "The navigation tool did not start a route transition.",
    }
  }

  const nextToolset = await readiness
  if (!nextToolset.ready) return nextToolset

  return {
    ...result,
    nextToolset: {
      status: nextToolset.status,
      route: nextToolset.route,
      revision: nextToolset.revision,
      ready: true,
    },
  }
}

const AGENT_INSTRUCTIONS_TOOL: WebMcpRegisteredTool = {
  name: "agent_instructions",
  description:
    "Purpose: get the current admin scope, sign-in status, and safety limits. Call at the start of every conversation turn. Examples: a new conversation, switching to this page, checking whether sign-in is required, or starting an order summary. Do not use to modify orders or handle personal data.",
  inputSchema: noInput,
  annotations: { readOnlyHint: true },
}

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
  value === "returns" ||
  value === "refund-approvals" ||
  value === "reports"

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
      "Purpose: open a Dashboard section, including products, returns, refund approvals, inventory, or reports. Examples: ‘Open products’, ‘Take me to returns’, ‘View refund approvals’, ‘Go to reports’. Do not call to perform a final action.",
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
            "refund-approvals",
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
  AGENT_INSTRUCTIONS_TOOL,
  {
    name: "skill_list",
    description:
      "Purpose: list on-demand admin operations and data-semantic guidance. Returns { skills: [{ name, description }] }. Call at the start of every conversation turn. Examples: stocktaking, revenue analysis, report writing, or order review. Do not use to access personal data.",
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
  productRepository: ProductRepository
  productEditorController: ProductEditorController
  productDraftStore: ProductDraftStore
  products: ProductStoreSnapshot
  reportingController: ReportingRuntimeController
  returnRepository: ReturnRepository
  returnEditorController: ReturnEditorController
  returns: ReturnStoreSnapshot
}

const VoltageAdminContext = createContext<VoltageAdminContextValue | null>(null)

type NativeToolRegistration = {
  controller: AbortController
  promise: Promise<void>
}

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
  tools: readonly WebMcpRegisteredTool[],
  shouldPrepareProvider: boolean,
  toolsetRoute: string,
  readinessCoordinator: ToolsetReadinessCoordinator
) => {
  const executeRef = useRef(executeTool)
  const publishedToolsRef = useRef(tools)
  const registrationsRef = useRef(new Map<string, NativeToolRegistration>())

  useLayoutEffect(() => {
    executeRef.current = executeTool
  }, [executeTool])

  useLayoutEffect(() => {
    if (tools.length === 0) {
      readinessCoordinator.cancelPending()
      publishedToolsRef.current = []
      for (const registration of registrationsRef.current.values()) {
        registration.controller.abort()
      }
      registrationsRef.current.clear()
      delete (window as WebMcpWindow).__webmcpReady
      return
    }

    readinessCoordinator.activate()
    if (!shouldPrepareProvider) readinessCoordinator.cancelPending()
    const publication = readinessCoordinator.preparePublish(
      toolsetRoute,
      createToolsetKey(
        toolsetRoute,
        tools.map((tool) => tool.name)
      )
    )

    const modelContext = (document as WebMcpDocument).modelContext
    let active = true
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
      if (shouldPrepareProvider) await prepareProvider()
      if (!active) return

      if (modelContext?.registerTool) {
        const desiredTools = new Map(tools.map((tool) => [tool.name, tool]))
        for (const [toolName, registration] of registrationsRef.current) {
          if (!desiredTools.has(toolName)) {
            registration.controller.abort()
            registrationsRef.current.delete(toolName)
          }
        }
        await Promise.all(
          [...desiredTools.values()].map((tool) => {
            const existing = registrationsRef.current.get(tool.name)
            if (existing) return existing.promise

            const controller = new AbortController()
            const registration = {} as NativeToolRegistration
            registration.controller = controller
            registration.promise = Promise.resolve().then(async () => {
              try {
                await modelContext.registerTool?.(
                  {
                    ...tool,
                    execute: (args: Record<string, unknown>) =>
                      executeWithDebugLog(tool.name, args),
                  } as WebMcpRegisteredTool & {
                    execute: (
                      args: Record<string, unknown>
                    ) => Promise<unknown>
                  },
                  { signal: controller.signal }
                )
              } catch (error) {
                if (registrationsRef.current.get(tool.name) === registration) {
                  registrationsRef.current.delete(tool.name)
                }
                if (!controller.signal.aborted) throw error
              }
            })
            registrationsRef.current.set(tool.name, registration)
            return registration.promise
          })
        )
        if (active) {
          publishedToolsRef.current = tools
          readinessCoordinator.publish(publication)
        }
        return
      }

      publishedToolsRef.current = tools
      ;(window as WebMcpWindow).__webmcpTestProvider = {
        // Keep the fallback discovery snapshot aligned with native registration:
        // it changes only after the destination route and its editor controller
        // have had a chance to finish mounting.
        getTools: () => [...publishedToolsRef.current],
        executeTool: (tool, args) => executeWithDebugLog(tool.name, args),
      } satisfies WebMcpTestProvider
      if (active) readinessCoordinator.publish(publication)
    }

    const currentWindow = window as WebMcpWindow
    const readyPromise = registerTools()
    currentWindow.__webmcpReady = readyPromise
    void readyPromise.catch((error) => {
      if (active && !isAbortError(error)) {
        console.error(
          "Voltage Dashboard WebMCP tool registration failed.",
          error
        )
      }
    })

    return () => {
      active = false
    }
  }, [
    prepareProvider,
    readinessCoordinator,
    shouldPrepareProvider,
    tools,
    toolsetRoute,
  ])

  useEffect(
    () => () => {
      for (const registration of registrationsRef.current.values()) {
        registration.controller.abort()
      }
      registrationsRef.current.clear()
      const currentWindow = window as WebMcpWindow
      delete currentWindow.__webmcpReady
      delete currentWindow.__webmcpTestProvider
      readinessCoordinator.dispose()
    },
    [readinessCoordinator]
  )
}

export const VoltageAdminProvider = () => {
  const { isAuthenticated, status: authenticationStatus } = useDemoAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const navigationType = useNavigationType()
  const [reportingController] = useState(() => new ReportingRuntimeController())
  const [toolsetReadiness] = useState(() => new ToolsetReadinessCoordinator())
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
  const [productDraftStore] = useState(() => new ProductDraftStore())
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
  const sectionRef = useRef(voltageAdminViewFromPath(location.pathname))
  const navigationHistoryRef = useRef([
    {
      key: location.key,
      page: voltageAdminViewFromPath(location.pathname),
      route: `${location.pathname}${location.search}`,
    },
  ])
  const navigationIndexRef = useRef(0)
  const routeTools = useMemo(
    () =>
      authenticationStatus === "loading"
        ? []
        : isAuthenticated
          ? [
              ...VOLTAGE_ADMIN_TOOLS,
              ...(/^\/products\/(?:add|edit\/\d+)$/.test(location.pathname)
                ? PRODUCT_EDITOR_TOOLS
                : []),
              ...(location.pathname === "/returns/add"
                ? RETURN_FORM_TOOLS
                : []),
              ...(location.pathname !== "/returns/add" &&
              /^\/returns\/[^/]+$/.test(location.pathname)
                ? RETURN_DETAIL_TOOLS
                : []),
              ...(/^\/refund-approvals\/[^/]+$/.test(location.pathname)
                ? REFUND_APPROVAL_DETAIL_TOOLS
                : []),
            ]
          : [AGENT_INSTRUCTIONS_TOOL],
    [authenticationStatus, isAuthenticated, location.pathname]
  )

  useLayoutEffect(() => {
    const page = voltageAdminViewFromPath(location.pathname)
    const route = `${location.pathname}${location.search}`
    const history = navigationHistoryRef.current
    const knownIndex = history.findIndex(({ key }) => key === location.key)

    if (knownIndex >= 0) {
      navigationIndexRef.current = knownIndex
      history[knownIndex] = { key: location.key, page, route }
    } else if (navigationType === "REPLACE") {
      history[navigationIndexRef.current] = { key: location.key, page, route }
    } else {
      history.splice(navigationIndexRef.current + 1)
      history.push({ key: location.key, page, route })
      navigationIndexRef.current = history.length - 1
    }
    sectionRef.current = page
  }, [location.key, location.pathname, location.search, navigationType])

  useEffect(() => {
    if (
      !isAuthenticated ||
      products.state !== "ready" ||
      commerce.state !== "ready" ||
      returns.state !== "ready"
    )
      return
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
            returns,
          }),
          createOperationalReportingVersion(
            products.version,
            commerce.version,
            returns.version
          )
        )
      })
      .catch((error) => {
        if (!cancelled)
          console.error("Operational reporting refresh failed.", error)
      })
    return () => {
      cancelled = true
    }
  }, [
    commerce,
    isAuthenticated,
    productRepository,
    products,
    reportingController,
    returns,
  ])

  useEffect(() => {
    if (!isAuthenticated) return
    void productStore.initialize()
    void commerceStore.initialize()
    void returnStore.initialize()
    return () => {
      productStore.dispose()
      commerceStore.dispose()
      returnStore.dispose()
    }
  }, [commerceStore, isAuthenticated, productStore, returnStore])

  useEffect(() => {
    return () => {
      void reportingController.dispose()
    }
  }, [reportingController])

  const prepareProvider = useCallback(async () => {
    await Promise.all([
      productStore.initialize(),
      commerceStore.initialize(),
      returnStore.initialize(),
    ])
    const productSnapshot = productStore.getSnapshot()
    const commerceSnapshot = commerceStore.getSnapshot()
    const returnSnapshot = returnStore.getSnapshot()
    const movements = await productRepository.listInventoryMovements()
    await reportingController.prepare(
      createReportingDataSnapshot({
        products: productSnapshot.products,
        inventoryMovements: movements,
        commerce: commerceSnapshot,
        returns: returnSnapshot,
      }),
      createOperationalReportingVersion(
        productSnapshot.version,
        commerceSnapshot.version,
        returnSnapshot.version
      )
    )
  }, [
    commerceStore,
    productRepository,
    productStore,
    reportingController,
    returnStore,
  ])

  const getNavigationState = useCallback(
    (index = navigationIndexRef.current) => {
      const history = navigationHistoryRef.current
      const entry = history[index]
      return {
        page: entry?.page ?? sectionRef.current,
        route: entry?.route ?? `${location.pathname}${location.search}`,
        canGoBack: index > 0,
        canGoForward: index < history.length - 1,
      }
    },
    [location.pathname, location.search]
  )

  const executeTool = async (name: string, args: Record<string, unknown>) => {
    if (!isAuthenticated) {
      return name === "agent_instructions"
        ? { text: VOLTAGE_ADMIN_UNAUTHENTICATED_AGENT_INSTRUCTIONS }
        : {
            status: "NOT_FOUND",
            message: "Sign in is required before this tool is available.",
          }
    }
    if (!routeTools.some((tool) => tool.name === name)) {
      return {
        ...rediscoveryRequired(),
        message:
          "This tool is not available on the current route. Fetch the current page tools once before choosing the next tool.",
      }
    }
    let navigationReadiness: Promise<ToolsetReadinessResult> | undefined
    const navigateForTool = (path: string) => {
      navigationReadiness = toolsetReadiness.waitFor(path)
      navigate(path, { flushSync: true })
    }
    const completeNavigation = (result: unknown) =>
      completeNavigationTool(name, result, navigationReadiness)

    if (isProductTool(name)) {
      return completeNavigation(
        await executeProductTool({
          name,
          args,
          repository: productRepository,
          editor: productEditorController,
          navigate: navigateForTool,
        })
      )
    }
    if (name === EXECUTE_READONLY_SQL_TOOL_NAME) {
      return reportingController.execute(args)
    }
    if (isReportAuthoringTool(name)) {
      return reportingController.executeReportTool(name, args)
    }
    if (isReturnTool(name)) {
      return completeNavigation(
        await executeReturnTool({
          name,
          args,
          repository: returnRepository,
          commerce: await commerceRepository.getSnapshot(),
          editor: returnEditorController,
          navigate: navigateForTool,
        })
      )
    }
    if (isOperationalTool(name)) {
      return completeNavigation(
        await executeOperationalTool({
          name,
          args,
          productRepository,
          commerce: await commerceRepository.getSnapshot(),
          navigate: navigateForTool,
        })
      )
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
      navigateForTool(voltageAdminPath(args.section))
      return completeNavigation({
        status: "OK",
        section: args.section,
      })
    }
    if (name === "navigate_state") {
      return { status: "OK", ...getNavigationState() }
    }
    if (name === "navigate_back") {
      const current = getNavigationState()
      if (!current.canGoBack)
        return { status: "ARGUMENT_ERROR", message: "Cannot navigate back." }
      const target = getNavigationState(navigationIndexRef.current - 1)
      navigationReadiness = toolsetReadiness.waitFor(target.route)
      navigate(-1)
      return completeNavigation({ status: "OK", ...target })
    }
    if (name === "navigate_forward") {
      const current = getNavigationState()
      if (!current.canGoForward)
        return {
          status: "ARGUMENT_ERROR",
          message: "Cannot navigate forward.",
        }
      const target = getNavigationState(navigationIndexRef.current + 1)
      navigationReadiness = toolsetReadiness.waitFor(target.route)
      navigate(1)
      return completeNavigation({ status: "OK", ...target })
    }
    return { status: "NOT_FOUND", message: "Unknown tool." }
  }

  useVoltageAdminWebMcpTools(
    executeTool,
    prepareProvider,
    routeTools,
    isAuthenticated,
    `${location.pathname}${location.search}`,
    toolsetReadiness
  )

  const value = useMemo<VoltageAdminContextValue>(
    () => ({
      commerce,
      commerceRepository,
      dashboard,
      productRepository,
      productEditorController,
      productDraftStore,
      products,
      reportingController,
      returnRepository,
      returnEditorController,
      returns,
    }),
    [
      commerce,
      commerceRepository,
      dashboard,
      productRepository,
      productEditorController,
      productDraftStore,
      products,
      reportingController,
      returnRepository,
      returnEditorController,
      returns,
    ]
  )

  return (
    <VoltageAdminContext.Provider value={value}>
      <Outlet />
    </VoltageAdminContext.Provider>
  )
}
