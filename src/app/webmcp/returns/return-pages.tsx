import { ChevronLeft, ClipboardCheck, Plus, RotateCcw } from "lucide-react"
import {
  type Dispatch,
  type FormEvent,
  type SetStateAction,
  useEffect,
  useMemo,
  useState,
} from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { Order, OrderLine } from "../commerce-data/types"
import {
  createReturnFormEditorState,
  type ReturnFormDraft,
} from "./return-editor-controller"
import {
  ActiveFilterSummary,
  OperationalFilterButton,
  OperationalFilterPopover,
  OperationalFilterToolbar,
  OperationalListPanel,
  OperationalListState,
  OperationalMetricCard,
  OperationalPagination,
  OperationalToolbarSearch,
  OperationalToolbarSelect,
  useOperationalPagination,
  type ActiveOperationalFilter,
  type OperationalSelectOption,
} from "../operational-ui"
import { GridBlock, PageLayout } from "../voltage-admin-page-layout"
import { useVoltageAdmin } from "../voltage-admin"
import {
  createReturnListModel,
  createReturnListRows,
  type ReturnListFilters,
  type ReturnStage,
} from "./return-list-model"
import type {
  EligibilityDecisionInput,
  InspectionItemInput,
  ReturnDraftInput,
} from "./return-repository"
import type { ReturnStoreSnapshot } from "./return-store"
import { ReturnNoteEditor } from "./return-note-editor"
import {
  createReturnWorkflow,
  currentReturnWorkflowStage,
  ReturnWorkflowProgress,
} from "./return-workflow"
import {
  APPROVAL_STATUSES,
  RETURN_REASONS,
  RETURN_REVIEW_STAGES,
  RETURN_SOURCES,
  type ReturnItem,
  type Rma,
} from "./types"

const PAGE_SIZE = 15
const fieldClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
const textAreaClass = `${fieldClass} min-h-24 py-2`

const initialFilters: ReturnListFilters = {
  query: "",
  status: "all",
  source: "all",
  reason: "all",
  stage: "all",
  approvalStatus: "all",
  sort: "updated-desc",
}

const stageOptions: readonly OperationalSelectOption[] = [
  { value: "all", label: "All stages" },
  ...RETURN_REVIEW_STAGES.map((value) => ({ value, label: value })),
]
const sourceOptions: readonly OperationalSelectOption[] = [
  { value: "all", label: "All sources" },
  ...RETURN_SOURCES.map((value) => ({ value, label: value })),
]
const reasonOptions: readonly OperationalSelectOption[] = [
  { value: "all", label: "All reasons" },
  ...RETURN_REASONS.map((value) => ({ value, label: value })),
]
const statusOptions: readonly OperationalSelectOption[] = [
  { value: "all", label: "All statuses" },
  ...["draft", "active", "completed", "rejected", "cancelled"].map((value) => ({
    value,
    label: value,
  })),
]
const approvalOptions: readonly OperationalSelectOption[] = [
  { value: "all", label: "All approval states" },
  ...APPROVAL_STATUSES.map((value) => ({ value, label: value })),
]
const sortOptions: readonly OperationalSelectOption[] = [
  { value: "updated-desc", label: "Recently updated" },
  { value: "created-desc", label: "Recently created" },
  { value: "sla-asc", label: "SLA due first" },
]

const toneFor = (value: string) => {
  if (["completed", "authorized", "approved", "succeeded"].includes(value)) {
    return "bg-emerald-50 text-emerald-800"
  }
  if (["rejected", "failed", "cancelled"].includes(value)) {
    return "bg-rose-50 text-rose-800"
  }
  if (["pending", "needs_information", "awaiting_return"].includes(value)) {
    return "bg-amber-50 text-amber-900"
  }
  return "bg-sky-50 text-sky-800"
}

const formatDate = (value: string, language: string) =>
  new Intl.DateTimeFormat(language === "zh-TW" ? "zh-TW" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))

const PageState = ({
  message,
  error = false,
}: {
  message: string
  error?: boolean
}) => (
  <GridBlock>
    <OperationalListState kind={error ? "error" : "loading"}>
      {message}
    </OperationalListState>
  </GridBlock>
)

const ReturnFilterFields = ({
  value,
  setValue,
  t,
  includePrimary = false,
}: {
  value: ReturnListFilters
  setValue: Dispatch<SetStateAction<ReturnListFilters>>
  t: (key: string) => string
  includePrimary?: boolean
}) => (
  <div className="grid gap-3 sm:grid-cols-2">
    {(
      [
        ...(includePrimary
          ? ([
              ["stage", "Stage", stageOptions],
              ["source", "Source", sourceOptions],
              ["reason", "Reason", reasonOptions],
            ] as const)
          : []),
        ["status", "Return status", statusOptions],
        ["approvalStatus", "Approval status", approvalOptions],
        ["sort", "Sort", sortOptions],
      ] as const
    ).map(([key, label, options]) => (
      <label key={String(key)} className="grid gap-1 text-xs font-medium">
        {t(String(label))}
        <select
          className={fieldClass}
          value={String(value[key as keyof ReturnListFilters] ?? "")}
          onChange={(event) =>
            setValue((current) => ({
              ...current,
              [key as keyof ReturnListFilters]: event.target.value,
            }))
          }
        >
          {(options as readonly OperationalSelectOption[]).map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.label)}
            </option>
          ))}
        </select>
      </label>
    ))}
  </div>
)

export const ReturnsPage = () => {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { commerce, returns } = useVoltageAdmin()
  const { page, setPage, applyAndReset } = useOperationalPagination()
  const [filters, setFilters] = useState(initialFilters)
  const rows = useMemo(
    () => createReturnListRows(returns.rmas, returns.items, commerce.orders),
    [commerce.orders, returns.items, returns.rmas]
  )
  const model = useMemo(
    () => createReturnListModel(rows, filters, page, PAGE_SIZE),
    [filters, page, rows]
  )
  const updateFilter = <K extends keyof ReturnListFilters>(
    key: K,
    value: ReturnListFilters[K]
  ) =>
    applyAndReset(() => setFilters((current) => ({ ...current, [key]: value })))
  const localized = (options: readonly OperationalSelectOption[]) =>
    options.map((option) => ({ ...option, label: t(option.label) }))
  const activeFilters: ActiveOperationalFilter[] = []
  for (const [key, reset] of [
    ["query", ""],
    ["stage", "all"],
    ["source", "all"],
    ["reason", "all"],
    ["status", "all"],
    ["approvalStatus", "all"],
  ] as const) {
    if (filters[key] !== reset) {
      activeFilters.push({
        id: key,
        label: `${t(key)}: ${filters[key]}`,
        onRemove: () => updateFilter(key, reset as never),
      })
    }
  }
  const filterPopover = (kind: "more" | "filter") => (
    <OperationalFilterPopover
      value={filters}
      emptyValue={initialFilters}
      onApply={(next) => applyAndReset(() => setFilters(next))}
      trigger={
        <OperationalFilterButton
          kind={kind}
          label={t(kind === "more" ? "More filters" : "Filter returns")}
          activeCount={activeFilters.filter(({ id }) => id !== "query").length}
        />
      }
      title={t("Filter returns")}
      labels={{ clear: t("Clear"), cancel: t("Cancel"), apply: t("Apply") }}
    >
      {({ draft, setDraft }) => (
        <ReturnFilterFields
          value={draft}
          setValue={setDraft}
          t={t}
          includePrimary={kind === "filter"}
        />
      )}
    </OperationalFilterPopover>
  )
  const metrics = [
    [
      "Active returns",
      returns.rmas.filter(({ status }) => status === "active").length,
    ],
    [
      "Eligibility review",
      rows.filter(({ stage }) => stage === "eligibility").length,
    ],
    [
      "Awaiting inspection",
      rows.filter(({ stage }) => ["receipt", "inspection"].includes(stage))
        .length,
    ],
    [
      "Refund follow-up",
      rows.filter(({ stage }) =>
        ["refund_calculation", "refund_approval", "refund_execution"].includes(
          stage
        )
      ).length,
    ],
  ] as const

  return (
    <PageLayout
      ariaLabel={t("Voltage Dashboard Returns")}
      pageName="Returns"
      actions={
        <Button onClick={() => navigate("/orders")}>
          <Plus /> {t("Select order for return")}
        </Button>
      }
    >
      {metrics.map(([label, value], index) => (
        <GridBlock
          key={label}
          className="col-span-12 md:col-span-6 lg:col-span-3"
        >
          <OperationalMetricCard
            label={t(label)}
            value={returns.state === "ready" ? value : undefined}
            loading={["idle", "loading"].includes(returns.state)}
            unavailableDetail={t("Returns data is unavailable.")}
            tone={index === 1 || index === 2 ? "warning" : "neutral"}
          />
        </GridBlock>
      ))}
      <GridBlock>
        <OperationalListPanel
          toolbar={
            <OperationalFilterToolbar
              search={
                <OperationalToolbarSearch
                  label={t("Search returns")}
                  placeholder={t("Search RMA or order ID")}
                  value={filters.query}
                  onChange={(value) => updateFilter("query", value)}
                />
              }
              primaryFilters={
                <>
                  <OperationalToolbarSelect
                    label={t("Stage")}
                    value={filters.stage}
                    options={localized(stageOptions)}
                    onValueChange={(value) =>
                      updateFilter("stage", value as ReturnStage | "all")
                    }
                  />
                  <OperationalToolbarSelect
                    label={t("Source")}
                    value={filters.source}
                    options={localized(sourceOptions)}
                    onValueChange={(value) =>
                      updateFilter(
                        "source",
                        value as ReturnListFilters["source"]
                      )
                    }
                  />
                  <OperationalToolbarSelect
                    label={t("Reason")}
                    value={filters.reason}
                    options={localized(reasonOptions)}
                    onValueChange={(value) =>
                      updateFilter(
                        "reason",
                        value as ReturnListFilters["reason"]
                      )
                    }
                  />
                </>
              }
              moreFilter={filterPopover("more")}
              mobileFilter={filterPopover("filter")}
            />
          }
          summary={
            <ActiveFilterSummary
              resultLabel={t("{{count}} returns", { count: model.total })}
              filters={activeFilters}
              clearAllLabel={t("Clear all")}
              onClearAll={() => applyAndReset(() => setFilters(initialFilters))}
            />
          }
          pagination={
            <OperationalPagination
              page={model.page}
              pageCount={model.pageCount}
              ariaLabel={t("Return pagination")}
              previousLabel={t("Previous page")}
              nextLabel={t("Next page")}
              onPageChange={setPage}
            />
          }
        >
          {returns.state === "error" || commerce.state === "error" ? (
            <OperationalListState kind="error">
              {t("Returns data is unavailable.")}
            </OperationalListState>
          ) : returns.state !== "ready" || commerce.state !== "ready" ? (
            <OperationalListState kind="loading">
              {t("Loading returns…")}
            </OperationalListState>
          ) : model.items.length === 0 ? (
            <OperationalListState kind="empty">
              {t("No matching returns")}
            </OperationalListState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="border-b bg-muted/60 text-xs">
                  <tr>
                    {[
                      "RMA",
                      "Order",
                      "Stage",
                      "Reason",
                      "Source",
                      "Items",
                      "Updated",
                      "Actions",
                    ].map((label) => (
                      <th key={label} className="p-3">
                        {t(label)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {model.items.map(({ rma, items, stage }) => (
                    <tr key={rma.id} className="border-b hover:bg-muted/30">
                      <td className="p-3 font-semibold">{rma.id}</td>
                      <td>{rma.orderId}</td>
                      <td>
                        <Badge className={toneFor(stage)}>{t(stage)}</Badge>
                      </td>
                      <td>{t(rma.reason)}</td>
                      <td>{t(rma.source)}</td>
                      <td>
                        {items.reduce(
                          (sum, item) => sum + item.requestedQuantity,
                          0
                        )}
                      </td>
                      <td>
                        {formatDate(
                          rma.updatedAt,
                          i18n.resolvedLanguage ?? "en"
                        )}
                      </td>
                      <td className="p-3">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate(`/returns/${rma.id}`)}
                        >
                          {t("Details")}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </OperationalListPanel>
      </GridBlock>
    </PageLayout>
  )
}

const remainingForLine = (line: OrderLine, returns: ReturnStoreSnapshot) => {
  const activeIds = new Set(
    returns.rmas
      .filter((rma) => ["draft", "active"].includes(rma.status))
      .map((rma) => rma.id)
  )
  const reserved = returns.items
    .filter((item) => item.orderLineId === line.id && activeIds.has(item.rmaId))
    .reduce((sum, item) => sum + item.requestedQuantity, 0)
  const approvalById = new Map(
    returns.approvals.map((approval) => [approval.id, approval])
  )
  const calculationById = new Map(
    returns.calculations.map((calculation) => [calculation.id, calculation])
  )
  const refundedUnitIndexes = new Set<number>()
  for (const attempt of returns.executionAttempts) {
    if (attempt.result !== "succeeded") continue
    const approval = approvalById.get(attempt.approvalId)
    const calculation = approval
      ? calculationById.get(approval.calculationId)
      : undefined
    calculation?.items
      .find((item) => item.orderLineId === line.id)
      ?.refundedUnitIndexes.forEach((index) => refundedUnitIndexes.add(index))
  }
  return Math.max(0, line.quantity - reserved - refundedUnitIndexes.size)
}

const OrderSummary = ({
  order,
  lines,
}: {
  order: Order
  lines: readonly OrderLine[]
}) => {
  const { t } = useTranslation()
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Order summary")}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm sm:grid-cols-3">
        <p>
          <span className="block text-muted-foreground">{t("Order")}</span>
          <strong>{order.id}</strong>
        </p>
        <p>
          <span className="block text-muted-foreground">{t("Status")}</span>
          <strong>{t(order.status)}</strong>
        </p>
        <p>
          <span className="block text-muted-foreground">{t("Items")}</span>
          <strong>{lines.reduce((sum, line) => sum + line.quantity, 0)}</strong>
        </p>
      </CardContent>
    </Card>
  )
}

export const ReturnAddPage = () => {
  const [searchParams] = useSearchParams()
  const orderId = searchParams.get("orderId") ?? ""
  return <ReturnAddPageForOrder key={orderId} orderId={orderId} />
}

const ReturnAddPageForOrder = ({ orderId }: { orderId: string }) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { commerce, returnEditorController, returnRepository, returns } =
    useVoltageAdmin()
  const order = commerce.orders.find((candidate) => candidate.id === orderId)
  const lines = commerce.orderLines.filter((line) => line.orderId === orderId)
  const [form, setForm] = useState(() =>
    createReturnFormEditorState({
      orderId,
      source: "internal",
      reason: "defective",
      customerStatement: "Item stopped working after delivery.",
      items: [],
    })
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  useEffect(
    () => returnEditorController.attachForm(form, setForm),
    [form, returnEditorController]
  )
  const updateForm = (patch: Partial<Omit<ReturnFormDraft, "orderId">>) =>
    setForm((current) =>
      createReturnFormEditorState(
        { ...current.draft, ...patch },
        current.version + 1,
        true
      )
    )
  if (commerce.state === "error" || returns.state === "error") {
    return (
      <PageLayout ariaLabel={t("Add return")} pageName="Returns">
        <PageState error message={t("Returns data is unavailable.")} />
      </PageLayout>
    )
  }
  if (commerce.state !== "ready" || returns.state !== "ready") {
    return (
      <PageLayout ariaLabel={t("Add return")} pageName="Returns">
        <PageState message={t("Loading returns…")} />
      </PageLayout>
    )
  }
  if (!orderId) {
    return (
      <PageLayout
        ariaLabel={t("Add return")}
        pageName="Add return"
        actions={
          <Button onClick={() => navigate("/orders")}>
            {t("Browse eligible orders")}
          </Button>
        }
      >
        <PageState
          error
          message={t("Open an eligible order before creating a return.")}
        />
      </PageLayout>
    )
  }
  if (!order) {
    return (
      <PageLayout
        ariaLabel={t("Add return")}
        pageName="Add return"
        actions={
          <Button onClick={() => navigate("/orders")}>
            {t("Browse eligible orders")}
          </Button>
        }
      >
        <PageState error message={t("Order was not found.")} />
      </PageLayout>
    )
  }
  if (order.status !== "delivered" || order.paymentStatus !== "paid") {
    return (
      <PageLayout
        ariaLabel={t("Add return")}
        pageName="Add return"
        actions={
          <Button onClick={() => navigate("/orders")}>
            {t("Browse eligible orders")}
          </Button>
        }
      >
        <PageState
          error
          message={t("Only delivered, paid orders can start a return.")}
        />
      </PageLayout>
    )
  }
  const selected = form.draft.items
  const complete = form.valid
  const persist = async (submit: boolean) => {
    setBusy(true)
    setError("")
    try {
      const created = await returnRepository.createDraft(
        {
          orderId: order.id,
          source: form.draft.source,
          reason: form.draft.reason,
          customerStatement: form.draft.customerStatement,
          items: selected,
        },
        "user"
      )
      if (submit)
        await returnRepository.submit(
          created.rma.id,
          created.rma.version,
          "user"
        )
      navigate(`/returns/${created.rma.id}`)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : t("Return could not be saved.")
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <PageLayout
      ariaLabel={t("Add return")}
      pageName="Add return"
      breadcrumb={[
        { label: "Returns", to: "/returns" },
        { label: "Add return" },
      ]}
      actions={
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ChevronLeft />
          {t("Back")}
        </Button>
      }
    >
      <GridBlock>
        <OrderSummary order={order} lines={lines} />
      </GridBlock>
      <GridBlock className="col-span-12 lg:col-span-8">
        <Card>
          <CardHeader>
            <CardTitle>{t("Return items")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {lines.map((line) => {
              const remaining = remainingForLine(line, returns)
              return (
                <label
                  key={line.id}
                  className="grid grid-cols-[1fr_7rem] items-center gap-3 rounded-md border p-3 text-sm"
                >
                  <span>
                    <strong className="block">{line.title}</strong>
                    <small className="text-muted-foreground">
                      {line.sku} ·{" "}
                      {t("{{count}} available to return", { count: remaining })}
                    </small>
                  </span>
                  <input
                    aria-label={t("Return quantity for {{title}}", {
                      title: line.title,
                    })}
                    className={fieldClass}
                    type="number"
                    min={0}
                    max={remaining}
                    value={
                      selected.find((item) => item.orderLineId === line.id)
                        ?.requestedQuantity ?? 0
                    }
                    onChange={(event) => {
                      const requestedQuantity = Number(event.target.value)
                      updateForm({
                        items:
                          requestedQuantity > 0
                            ? [
                                ...selected.filter(
                                  (item) => item.orderLineId !== line.id
                                ),
                                { orderLineId: line.id, requestedQuantity },
                              ]
                            : selected.filter(
                                (item) => item.orderLineId !== line.id
                              ),
                      })
                    }}
                  />
                </label>
              )
            })}
          </CardContent>
        </Card>
      </GridBlock>
      <GridBlock className="col-span-12 lg:col-span-4">
        <Card className="h-full">
          <CardHeader>
            <CardTitle>{t("Return details")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <label className="grid gap-1 text-sm">
              {t("Source")}
              <select
                className={fieldClass}
                value={form.draft.source}
                onChange={(event) =>
                  updateForm({
                    source: event.target.value as ReturnDraftInput["source"],
                  })
                }
              >
                {RETURN_SOURCES.map((value) => (
                  <option key={value} value={value}>
                    {t(value)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              {t("Reason")}
              <select
                className={fieldClass}
                value={form.draft.reason}
                onChange={(event) =>
                  updateForm({
                    reason: event.target.value as ReturnDraftInput["reason"],
                  })
                }
              >
                {RETURN_REASONS.map((value) => (
                  <option key={value} value={value}>
                    {t(value)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              {t("Safe customer statement")}
              <textarea
                className={textAreaClass}
                value={form.draft.customerStatement}
                onChange={(event) =>
                  updateForm({ customerStatement: event.target.value })
                }
              />
              <small className="text-muted-foreground">
                {t(
                  "Use operational ASCII text only; do not enter names, contact, address or payment data."
                )}
              </small>
            </label>
            <div
              aria-label={t("Draft completeness")}
              className="rounded-md bg-muted p-3 text-sm"
            >
              <strong>
                {complete
                  ? t("Ready to save")
                  : t("Select an item and add a statement")}
              </strong>
            </div>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                variant="outline"
                disabled={!complete || busy}
                onClick={() => void persist(false)}
              >
                {t("Save draft")}
              </Button>
              <Button
                disabled={!complete || busy}
                onClick={() => void persist(true)}
              >
                {t("Submit return")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </GridBlock>
    </PageLayout>
  )
}

const DetailCard = ({
  title,
  children,
  collapsible = false,
  defaultOpen = false,
}: {
  title: string
  children: React.ReactNode
  collapsible?: boolean
  defaultOpen?: boolean
}) => {
  if (collapsible)
    return (
      <Card className="h-full">
        <details open={defaultOpen || undefined}>
          <summary className="cursor-pointer list-none">
            <CardHeader>
              <CardTitle>{title}</CardTitle>
            </CardHeader>
          </summary>
          <CardContent className="grid gap-2 text-sm">{children}</CardContent>
        </details>
      </Card>
    )
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm">{children}</CardContent>
    </Card>
  )
}

export const ReturnDetailPage = () => {
  const { returnId } = useParams()
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const {
    productRepository,
    returnRepository,
    returnReviewNotes,
    returns,
  } = useVoltageAdmin()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [packageCount, setPackageCount] = useState(1)
  const [receiptResult, setReceiptResult] = useState<
    "complete" | "partial" | "damaged"
  >("complete")
  const [executionResult, setExecutionResult] = useState<
    "succeeded" | "failed"
  >("succeeded")
  const [resultCode, setResultCode] = useState("recorded_success")
  const [executionNote, setExecutionNote] = useState("")
  const [facts, setFacts] = useState<EligibilityDecisionInput["facts"]>({
    daysSinceDelivery: 4,
    packageOpened: true,
    condition: "damaged",
    finalSale: false,
  })
  const currentRma = returns.rmas.find((candidate) => candidate.id === returnId)
  if (returns.state === "error")
    return (
      <PageLayout ariaLabel={t("Return details")} pageName="Returns">
        <PageState error message={t("Returns data is unavailable.")} />
      </PageLayout>
    )
  if (returns.state !== "ready")
    return (
      <PageLayout ariaLabel={t("Return details")} pageName="Returns">
        <PageState message={t("Loading returns…")} />
      </PageLayout>
    )
  const rma = currentRma
  if (!rma)
    return (
      <PageLayout ariaLabel={t("Return details")} pageName="Returns">
        <PageState error message={t("Return was not found.")} />
      </PageLayout>
    )
  const items = returns.items.filter((item) => item.rmaId === rma.id)
  const calculations = returns.calculations
    .filter((item) => item.rmaId === rma.id)
    .sort((a, b) => b.version - a.version)
  const rmaApprovals = returns.approvals.filter((item) => item.rmaId === rma.id)
  const workflow = createReturnWorkflow({
    rma,
    items,
    calculations,
    approvals: rmaApprovals,
  })
  const currentWorkflowStage = currentReturnWorkflowStage(workflow)
  const latestApproval =
    rmaApprovals.find(
      (item) =>
        item.calculationId === calculations[0]?.id &&
        item.status === rma.approvalStatus
    ) ??
    [...rmaApprovals].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  const timeline = returns.timeline
    .filter((item) => item.rmaId === rma.id)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setError("")
    try {
      await action()
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t("Action could not be completed.")
      )
    } finally {
      setBusy(false)
    }
  }
  const decide = (decision: EligibilityDecisionInput["decision"]) =>
    run(() =>
      returnRepository.decideEligibility(
        rma.id,
        rma.version,
        {
          facts,
          decision,
          reason:
            decision === "authorized"
              ? "Eligible"
              : decision === "rejected"
                ? "Policy decision declined."
                : "Additional evidence requested.",
        },
        "user"
      )
    )
  const action =
    rma.status === "draft" ? (
      <Button
        disabled={busy}
        onClick={() =>
          void run(() => returnRepository.submit(rma.id, rma.version, "user"))
        }
      >
        {t("Submit return")}
      </Button>
    ) : rma.status === "active" &&
      ["pending", "needs_information"].includes(
        rma.eligibility.status
      ) ? null : rma.logistics.status === "awaiting_return" ? null : rma
        .logistics.status === "received" &&
      rma.inspection.status === "not_started" ? (
      <Button
        disabled={busy}
        onClick={() =>
          void run(async () => {
            await returnRepository.startInspection(rma.id, "user")
            navigate(`/returns/${rma.id}/inspection`)
          })
        }
      >
        {t("Start inspection")}
      </Button>
    ) : rma.inspection.status === "in_progress" ? (
      <Button onClick={() => navigate(`/returns/${rma.id}/inspection`)}>
        {t("Continue inspection")}
      </Button>
    ) : rma.inspection.status === "completed" &&
      ["not_ready", "returned", "invalidated"].includes(rma.approvalStatus) &&
      calculations[0]?.rmaVersion !== rma.version ? (
      <Button
        disabled={busy}
        onClick={() =>
          void run(() =>
            returnRepository.generateRefundCalculation(rma.id, "user")
          )
        }
      >
        {t("Generate refund calculation")}
      </Button>
    ) : rma.status === "active" &&
      rma.inspection.status === "completed" &&
      ["not_ready", "returned", "invalidated"].includes(rma.approvalStatus) &&
      calculations[0]?.rmaVersion === rma.version ? (
      <Button
        disabled={busy}
        onClick={() =>
          void run(async () => {
            const approval = await returnRepository.submitForApproval(
              rma.id,
              calculations[0].id,
              "user"
            )
            navigate(`/refund-approvals/${approval.id}`)
          })
        }
      >
        {t("Submit for refund approval")}
      </Button>
    ) : null
  const restock = async (item: ReturnItem) => {
    setBusy(true)
    setError("")
    try {
      const result = await productRepository.receiveCustomerReturn(
        item.productId,
        {
          quantity: item.acceptedQuantity ?? 0,
          returnItemId: item.id,
        }
      )
      await returnRepository.recordRestockCompletion(
        item.id,
        result.movement,
        "user"
      )
    } catch (cause) {
      try {
        await returnRepository.recordRestockFailure(item.id, "user")
      } catch {
        // Preserve the original operational error when failure recording is unavailable.
      }
      setError(
        cause instanceof Error
          ? cause.message
          : t("Inventory receipt could not be completed.")
      )
    } finally {
      setBusy(false)
    }
  }
  const recordRefundResult = () => {
    if (!latestApproval) return Promise.resolve()
    return run(() =>
      returnRepository.recordRefundResult(
        latestApproval.id,
        {
          result: executionResult,
          resultCode: resultCode as
            | "recorded_success"
            | "provider_declined"
            | "provider_unavailable"
            | "manual_reconciliation_required",
          note: executionNote,
          executedBy: "finance-user",
        },
        "user"
      )
    )
  }
  const currentTaskControl =
    currentWorkflowStage.id === "eligibility" &&
    ["pending", "needs_information"].includes(rma.eligibility.status) ? (
      <div className="grid gap-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <label>
            {t("Days since delivery")}
            <input
              className={fieldClass}
              type="number"
              min={0}
              value={facts.daysSinceDelivery ?? ""}
              onChange={(event) =>
                setFacts((current) => ({
                  ...current,
                  daysSinceDelivery: Number(event.target.value),
                }))
              }
            />
          </label>
          <label>
            {t("Condition")}
            <select
              className={fieldClass}
              value={facts.condition}
              onChange={(event) =>
                setFacts((current) => ({
                  ...current,
                  condition: event.target.value as
                    | "unused"
                    | "used"
                    | "damaged",
                }))
              }
            >
              {(["unused", "used", "damaged"] as const).map((value) => (
                <option key={value} value={value}>
                  {t(value)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={facts.packageOpened ?? false}
              onChange={(event) =>
                setFacts((current) => ({
                  ...current,
                  packageOpened: event.target.checked,
                }))
              }
            />
            {t("Package opened")}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={facts.finalSale ?? false}
              onChange={(event) =>
                setFacts((current) => ({
                  ...current,
                  finalSale: event.target.checked,
                }))
              }
            />
            {t("Final sale")}
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void decide("authorized")}>
            {t("Authorize return")}
          </Button>
          <Button
            disabled={busy}
            variant="outline"
            onClick={() => void decide("needs_information")}
          >
            {t("Request information")}
          </Button>
          <Button
            disabled={busy}
            variant="destructive"
            onClick={() => void decide("rejected")}
          >
            {t("Reject return")}
          </Button>
        </div>
      </div>
    ) : currentWorkflowStage.id === "receipt" &&
      rma.logistics.status === "awaiting_return" ? (
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          {t("Package count")}
          <input
            className={fieldClass}
            type="number"
            min={1}
            value={packageCount}
            onChange={(event) => setPackageCount(Number(event.target.value))}
          />
        </label>
        <label>
          {t("Receipt result")}
          <select
            className={fieldClass}
            value={receiptResult}
            onChange={(event) =>
              setReceiptResult(
                event.target.value as "complete" | "partial" | "damaged"
              )
            }
          >
            {(["complete", "partial", "damaged"] as const).map((value) => (
              <option key={value} value={value}>
                {t(value)}
              </option>
            ))}
          </select>
        </label>
        <Button
          className="sm:col-span-2 sm:justify-self-start"
          disabled={busy || !Number.isInteger(packageCount) || packageCount < 1}
          onClick={() =>
            void run(() =>
              returnRepository.recordReceipt(
                rma.id,
                { packageCount, result: receiptResult },
                "user"
              )
            )
          }
        >
          {t("Record receipt")}
        </Button>
      </div>
    ) : currentWorkflowStage.id === "refund_approval" && latestApproval ? (
      <Button
        variant="outline"
        onClick={() => navigate(`/refund-approvals/${latestApproval.id}`)}
      >
        {t("Open refund approval")}
      </Button>
    ) : currentWorkflowStage.id === "refund_execution" &&
      latestApproval?.status === "approved" &&
      ["pending_execution", "failed"].includes(rma.refundStatus) ? (
      <div className="grid gap-3">
        <label>
          {t("Execution result")}
          <select
            className={fieldClass}
            value={executionResult}
            onChange={(event) => {
              const result = event.target.value as "succeeded" | "failed"
              setExecutionResult(result)
              setResultCode(
                result === "succeeded" ? "recorded_success" : "provider_declined"
              )
            }}
          >
            <option value="succeeded">{t("succeeded")}</option>
            <option value="failed">{t("failed")}</option>
          </select>
        </label>
        <label>
          {t("Result code")}
          <select
            className={fieldClass}
            value={resultCode}
            onChange={(event) => setResultCode(event.target.value)}
          >
            {(executionResult === "succeeded"
              ? ["recorded_success"]
              : [
                  "provider_declined",
                  "provider_unavailable",
                  "manual_reconciliation_required",
                ]
            ).map((value) => (
              <option key={value} value={value}>
                {t(value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Operational note")}
          <textarea
            className={textAreaClass}
            value={executionNote}
            onChange={(event) => setExecutionNote(event.target.value)}
          />
        </label>
        <Button disabled={busy} onClick={() => void recordRefundResult()}>
          {rma.refundStatus === "failed"
            ? t("Record retry result")
            : t("Record refund result")}
        </Button>
      </div>
    ) : (
      action
    )
  return (
    <PageLayout
      ariaLabel={t("Return details")}
      pageName={rma.id}
      translatePageName={false}
      breadcrumb={[
        { label: "Returns", to: "/returns" },
        { label: rma.id, translate: false },
      ]}
      status={<Badge className={toneFor(rma.status)}>{t(rma.status)}</Badge>}
      actions={
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ChevronLeft />
            {t("Back")}
          </Button>
        </div>
      }
    >
      {error ? (
        <GridBlock>
          <p
            role="alert"
            className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
          </p>
        </GridBlock>
      ) : null}
      <GridBlock>
        <Card>
          <CardHeader>
            <CardTitle>{t("Return workflow")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ReturnWorkflowProgress
              workflow={workflow}
              labelFor={(label) => t(label)}
            />
          </CardContent>
        </Card>
      </GridBlock>
      <GridBlock className="col-span-12 lg:col-span-8">
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle>{t("Current task")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <p>
              {t(`current_task_${currentWorkflowStage.id}`)}
            </p>
            {currentTaskControl}
          </CardContent>
        </Card>
      </GridBlock>
      <GridBlock className="col-span-12 lg:col-span-4">
        <DetailCard title={t("Case summary")}>
          <p>{t(rma.reason)}</p>
          <p>
            {t("Requested quantity")}: {items.reduce(
              (sum, item) => sum + item.requestedQuantity,
              0
            )}
          </p>
          <p>
            {t("Updated")}: {formatDate(
              rma.updatedAt,
              i18n.resolvedLanguage ?? "en"
            )}
          </p>
        </DetailCard>
      </GridBlock>
      <GridBlock className="col-span-12 md:col-span-6 lg:col-span-3">
        <OperationalMetricCard
          label={t("Stage")}
          value={t(currentWorkflowStage.id)}
          detail={t(rma.source)}
        />
      </GridBlock>
      <GridBlock className="col-span-12 md:col-span-6 lg:col-span-3">
        <OperationalMetricCard
          label={t("Requested quantity")}
          value={items.reduce((sum, item) => sum + item.requestedQuantity, 0)}
          detail={t(rma.reason)}
        />
      </GridBlock>
      <GridBlock className="col-span-12 md:col-span-6 lg:col-span-3">
        <OperationalMetricCard
          label={t("Eligibility")}
          value={t(rma.eligibility.status)}
          detail={rma.eligibility.policyVersion}
          tone={
            rma.eligibility.status === "authorized" ? "positive" : "warning"
          }
        />
      </GridBlock>
      <GridBlock className="col-span-12 md:col-span-6 lg:col-span-3">
        <OperationalMetricCard
          label={t("Approval status")}
          value={t(rma.approvalStatus)}
          detail={t(rma.refundStatus)}
        />
      </GridBlock>
      <GridBlock className="col-span-12 lg:col-span-6">
        <DetailCard title={t("Overview")}>
          <p>
            <span className="text-muted-foreground">{t("Order")}</span>{" "}
            <Button
              variant="link"
              className="h-auto p-0"
              onClick={() => navigate(`/orders/${rma.orderId}`)}
            >
              {rma.orderId}
            </Button>
          </p>
          <p>
            <span className="block text-muted-foreground">
              {t("Safe customer statement")}
            </span>
            {rma.customerStatement}
          </p>
          <p>
            {t("SLA due")}:{" "}
            {formatDate(rma.slaDueAt, i18n.resolvedLanguage ?? "en")}
          </p>
        </DetailCard>
      </GridBlock>
      <GridBlock className="col-span-12 lg:col-span-6">
        <DetailCard title={t("Items")}>
          {items.map((item) => (
            <div
              key={item.id}
              className="flex justify-between gap-2 border-b pb-2"
            >
              <span>
                {item.title}
                <small className="block text-muted-foreground">
                  {item.sku}
                </small>
              </span>
              <strong>
                {item.acceptedQuantity ?? "—"} / {item.requestedQuantity}
              </strong>
            </div>
          ))}
        </DetailCard>
      </GridBlock>
      <GridBlock className="col-span-12 lg:col-span-6">
        <DetailCard
          title={t("Eligibility")}
          collapsible
          defaultOpen={currentWorkflowStage.id === "eligibility"}
        >
          <p>
            {t("Decision")}: <strong>{t(rma.eligibility.status)}</strong>
          </p>
          <p>
            {rma.eligibility.decisionReason
              ? t(rma.eligibility.decisionReason)
              : t("Not decided")}
          </p>
        </DetailCard>
      </GridBlock>
      <GridBlock className="col-span-12 lg:col-span-6">
        <DetailCard
          title={t("Logistics")}
          collapsible
          defaultOpen={currentWorkflowStage.id === "receipt"}
        >
          <div className="flex items-center gap-2">
            <span>{t("Status")}:</span>
            <Badge className={toneFor(rma.logistics.status)}>
              {t(rma.logistics.status)}
            </Badge>
          </div>
          <p>
            {t("Packages received")}:{" "}
            {rma.logistics.receivedPackageCount ?? "—"}
          </p>
          <p>
            {t("Receipt result")}:{" "}
            {rma.logistics.receiptResult ? t(rma.logistics.receiptResult) : "—"}
          </p>
        </DetailCard>
      </GridBlock>
      <GridBlock className="col-span-12 lg:col-span-6">
        <DetailCard
          title={t("Inspection")}
          collapsible
          defaultOpen={currentWorkflowStage.id === "inspection"}
        >
          <p>
            {t("Status")}: {t(rma.inspection.status)}
          </p>
          <p>
            {t("Inspection version")}: {rma.inspection.version}
          </p>
          {rma.status === "active" &&
          rma.inspection.status === "completed" &&
          rma.refundStatus !== "succeeded" &&
          !items.some(
            (item) => item.inventoryDispositionStatus === "completed"
          ) ? (
            <div className="grid gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-950">
              <p>
                {t(
                  "Reopening inspection invalidates the current refund calculation and approval."
                )}
              </p>
              <Button
                variant="outline"
                onClick={() =>
                  void run(() =>
                    returnRepository.reopenInspection(rma.id, "user")
                  )
                }
              >
                <RotateCcw />
                {t("Reopen inspection")}
              </Button>
            </div>
          ) : null}
        </DetailCard>
      </GridBlock>
      <GridBlock className="col-span-12 lg:col-span-6">
        <DetailCard
          title={t("Refund calculation")}
          collapsible
          defaultOpen={currentWorkflowStage.id === "refund_calculation"}
        >
          {calculations[0] ? (
            <>
              <p>
                {t("Version")}: {calculations[0].version}
              </p>
              <p>
                {t("Item refund")}:{" "}
                {calculations[0].items
                  .reduce((sum, item) => sum + item.amount.amount, 0)
                  .toFixed(2)}{" "}
                {calculations[0].total.currency}
              </p>
              <p>
                {t("Shipping refund")}:{" "}
                {calculations[0].shippingAmount.amount.toFixed(2)}{" "}
                {calculations[0].shippingAmount.currency}
              </p>
              <p className="font-semibold">
                {t("Total")}: {calculations[0].total.amount.toFixed(2)}{" "}
                {calculations[0].total.currency}
              </p>
              {latestApproval ? (
                <p>
                  {t("Refund approval")}: {latestApproval.id} ·{" "}
                  {t(latestApproval.status)}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-muted-foreground">
              {t("No refund calculation yet.")}
            </p>
          )}
        </DetailCard>
      </GridBlock>
      <GridBlock className="col-span-12 lg:col-span-6">
        <DetailCard title={t("Inventory disposition")}>
          {items.map((item) => (
            <div
              key={item.id}
              className="grid gap-2 border-b pb-2 sm:grid-cols-[1fr_auto] sm:items-center"
            >
              <span>
                <strong>{item.title}</strong>
                <small className="block text-muted-foreground">
                  {item.inventoryDisposition
                    ? t(item.inventoryDisposition)
                    : t("Not inspected")}{" "}
                  · {t(item.inventoryDispositionStatus)}
                </small>
              </span>
              {item.inventoryDisposition === "restock" &&
              ["pending", "failed"].includes(
                item.inventoryDispositionStatus
              ) ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void restock(item)}
                >
                  {item.inventoryDispositionStatus === "failed"
                    ? t("Retry restock")
                    : t("Confirm restock")}
                </Button>
              ) : item.inventoryMovementId ? (
                <span className="text-xs text-muted-foreground">
                  {item.inventoryMovementId}
                </span>
              ) : null}
            </div>
          ))}
        </DetailCard>
      </GridBlock>
      <GridBlock className="col-span-12 lg:col-span-6">
        <DetailCard
          title={t("Refund execution")}
          collapsible
          defaultOpen={currentWorkflowStage.id === "refund_execution"}
        >
          <p className="text-muted-foreground">
            {t("Status")}: {t(rma.refundStatus)}
          </p>
          {latestApproval
            ? returns.executionAttempts
                .filter((attempt) => attempt.approvalId === latestApproval.id)
                .map((attempt) => (
                  <div key={attempt.id} className="border-t pt-2">
                    <strong>
                      {t("Attempt")} {attempt.sequence}: {t(attempt.result)}
                    </strong>
                    <p>
                      {t(attempt.resultCode)} · {attempt.executedAt}
                    </p>
                  </div>
                ))
            : null}
        </DetailCard>
      </GridBlock>
      <GridBlock>
        <DetailCard title={t("Review notes")}>
          {returnReviewNotes ? (
            <ReturnNoteEditor
              rmaId={rma.id}
              currentStage={currentWorkflowStage.id}
              notes={returns.notes}
              session={returnReviewNotes}
            />
          ) : (
            <p className="text-muted-foreground">{t("Sign in is required.")}</p>
          )}
        </DetailCard>
      </GridBlock>
      <GridBlock>
        <DetailCard title={t("Timeline")}>
          <ol className="grid gap-2">
            {timeline.map((event) => (
              <li
                key={event.id}
                className="grid gap-1 border-b pb-2 sm:grid-cols-[1fr_auto]"
              >
                <span>
                  <strong>{t(event.action)}</strong>
                  <small className="block text-muted-foreground">
                    {t(event.actor)} · {t(event.result)}
                  </small>
                </span>
                <time>
                  {formatDate(event.occurredAt, i18n.resolvedLanguage ?? "en")}
                </time>
              </li>
            ))}
          </ol>
        </DetailCard>
      </GridBlock>
    </PageLayout>
  )
}

type InspectionDraft = Omit<InspectionItemInput, "returnItemId"> & {
  returnItemId: string
}

const InspectionForm = ({
  rma,
  items,
}: {
  rma: Rma
  items: readonly ReturnItem[]
}) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { returnRepository } = useVoltageAdmin()
  const [drafts, setDrafts] = useState<InspectionDraft[]>(() =>
    items.map((item) => ({
      returnItemId: item.id,
      receivedQuantity: item.requestedQuantity,
      acceptedQuantity: item.requestedQuantity,
      condition: "opened",
      packaging: "intact",
      missingContents: false,
      rejectionReason: null,
      inventoryDisposition: "restock",
      inspectionNote: "Verified against order line.",
      inspectedBy: "ops-user",
    }))
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const update = <K extends keyof InspectionDraft>(
    index: number,
    key: K,
    value: InspectionDraft[K]
  ) =>
    setDrafts((current) =>
      current.map((draft, position) =>
        position === index ? { ...draft, [key]: value } : draft
      )
    )
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError("")
    try {
      await returnRepository.completeInspection(rma.id, drafts, "user")
      navigate(`/returns/${rma.id}`)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t("Inspection could not be completed.")
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="contents" onSubmit={(event) => void submit(event)}>
      {items.map((item, index) => (
        <GridBlock key={item.id}>
          <Card>
            <CardHeader>
              <CardTitle>{item.title}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="grid gap-1 text-sm">
                {t("Received quantity")}
                <input
                  className={fieldClass}
                  type="number"
                  min={0}
                  max={item.requestedQuantity}
                  value={drafts[index].receivedQuantity}
                  onChange={(event) =>
                    update(
                      index,
                      "receivedQuantity",
                      Number(event.target.value)
                    )
                  }
                />
              </label>
              <label className="grid gap-1 text-sm">
                {t("Accepted quantity")}
                <input
                  className={fieldClass}
                  type="number"
                  min={0}
                  max={drafts[index].receivedQuantity}
                  value={drafts[index].acceptedQuantity}
                  onChange={(event) =>
                    update(
                      index,
                      "acceptedQuantity",
                      Number(event.target.value)
                    )
                  }
                />
              </label>
              <label className="grid gap-1 text-sm">
                {t("Condition")}
                <select
                  className={fieldClass}
                  value={drafts[index].condition}
                  onChange={(event) =>
                    update(
                      index,
                      "condition",
                      event.target.value as InspectionDraft["condition"]
                    )
                  }
                >
                  {["sealed", "opened", "used", "damaged"].map((value) => (
                    <option key={value} value={value}>
                      {t(value)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                {t("Packaging")}
                <select
                  className={fieldClass}
                  value={drafts[index].packaging}
                  onChange={(event) =>
                    update(
                      index,
                      "packaging",
                      event.target.value as InspectionDraft["packaging"]
                    )
                  }
                >
                  {["intact", "damaged", "missing"].map((value) => (
                    <option key={value} value={value}>
                      {t(value)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={drafts[index].missingContents}
                  onChange={(event) =>
                    update(index, "missingContents", event.target.checked)
                  }
                />
                {t("Missing contents")}
              </label>
              <label className="grid gap-1 text-sm">
                {t("Rejection reason")}
                <select
                  className={fieldClass}
                  value={drafts[index].rejectionReason ?? "none"}
                  onChange={(event) =>
                    update(
                      index,
                      "rejectionReason",
                      event.target.value === "none"
                        ? null
                        : (event.target
                            .value as InspectionDraft["rejectionReason"])
                    )
                  }
                >
                  <option value="none">{t("None")}</option>
                  {[
                    "not_received",
                    "outside_policy",
                    "used_or_altered",
                    "serial_mismatch",
                  ].map((value) => (
                    <option key={value} value={value}>
                      {t(value)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                {t("Inventory disposition")}
                <select
                  className={fieldClass}
                  value={drafts[index].inventoryDisposition}
                  onChange={(event) =>
                    update(
                      index,
                      "inventoryDisposition",
                      event.target
                        .value as InspectionDraft["inventoryDisposition"]
                    )
                  }
                >
                  {[
                    "restock",
                    "defective",
                    "discard",
                    "return_to_customer",
                  ].map((value) => (
                    <option key={value} value={value}>
                      {t(value)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                {t("Inspected by")}
                <input
                  className={fieldClass}
                  value={drafts[index].inspectedBy}
                  onChange={(event) =>
                    update(index, "inspectedBy", event.target.value)
                  }
                />
              </label>
              <label className="grid gap-1 text-sm md:col-span-2 xl:col-span-4">
                {t("Inspection note")}
                <textarea
                  className={textAreaClass}
                  value={drafts[index].inspectionNote}
                  onChange={(event) =>
                    update(index, "inspectionNote", event.target.value)
                  }
                />
              </label>
            </CardContent>
          </Card>
        </GridBlock>
      ))}
      {error ? (
        <GridBlock>
          <p
            role="alert"
            className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
          </p>
        </GridBlock>
      ) : null}
      <GridBlock>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(`/returns/${rma.id}`)}
          >
            {t("Cancel")}
          </Button>
          <Button type="submit" disabled={busy}>
            <ClipboardCheck />
            {t("Complete inspection")}
          </Button>
        </div>
      </GridBlock>
    </form>
  )
}

export const ReturnInspectionPage = () => {
  const { returnId } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { returnRepository, returns } = useVoltageAdmin()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  if (returns.state === "error")
    return (
      <PageLayout ariaLabel={t("Return inspection")} pageName="Returns">
        <PageState error message={t("Returns data is unavailable.")} />
      </PageLayout>
    )
  if (returns.state !== "ready")
    return (
      <PageLayout ariaLabel={t("Return inspection")} pageName="Returns">
        <PageState message={t("Loading returns…")} />
      </PageLayout>
    )
  const rma = returns.rmas.find((candidate) => candidate.id === returnId)
  if (!rma)
    return (
      <PageLayout ariaLabel={t("Return inspection")} pageName="Returns">
        <PageState error message={t("Return was not found.")} />
      </PageLayout>
    )
  const items = returns.items.filter((item) => item.rmaId === rma.id)
  if (
    rma.inspection.status === "completed" ||
    rma.logistics.status !== "received"
  )
    return (
      <PageLayout
        ariaLabel={t("Return inspection")}
        pageName="Return inspection"
        breadcrumb={[
          { label: "Returns", to: "/returns" },
          { label: rma.id, to: `/returns/${rma.id}`, translate: false },
          { label: "Inspection" },
        ]}
      >
        <PageState
          error
          message={t(
            "Inspection is not available in the current return state."
          )}
        />
      </PageLayout>
    )
  if (rma.inspection.status === "not_started")
    return (
      <PageLayout
        ariaLabel={t("Return inspection")}
        pageName="Return inspection"
        actions={
          <Button
            variant="outline"
            onClick={() => navigate(`/returns/${rma.id}`)}
          >
            <ChevronLeft />
            {t("Back")}
          </Button>
        }
      >
        <GridBlock>
          <Card>
            <CardContent className="grid min-h-48 place-items-center gap-3 p-6 text-center">
              <p>
                {t("Start inspection only after the return has been received.")}
              </p>
              {error ? (
                <p role="alert" className="text-destructive">
                  {error}
                </p>
              ) : null}
              <Button
                disabled={busy}
                onClick={() => {
                  setBusy(true)
                  setError("")
                  void returnRepository
                    .startInspection(rma.id, "user")
                    .catch((cause) =>
                      setError(
                        cause instanceof Error
                          ? cause.message
                          : t("Action could not be completed.")
                      )
                    )
                    .finally(() => setBusy(false))
                }}
              >
                {t("Start inspection")}
              </Button>
            </CardContent>
          </Card>
        </GridBlock>
      </PageLayout>
    )
  return (
    <PageLayout
      ariaLabel={t("Return inspection")}
      pageName="Return inspection"
      breadcrumb={[
        { label: "Returns", to: "/returns" },
        { label: rma.id, to: `/returns/${rma.id}`, translate: false },
        { label: "Inspection" },
      ]}
      actions={
        <Button
          variant="outline"
          onClick={() => navigate(`/returns/${rma.id}`)}
        >
          <ChevronLeft />
          {t("Back")}
        </Button>
      }
    >
      <InspectionForm rma={rma} items={items} />
    </PageLayout>
  )
}
