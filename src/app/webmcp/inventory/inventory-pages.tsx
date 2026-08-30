import {
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  SlidersHorizontal,
  X,
} from "lucide-react"
import {
  type Dispatch,
  type ReactNode,
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
import type { ProductRepository } from "../products/product-repository"
import type { Product } from "../products/types"
import {
  createInventoryListModel,
  type InventoryListFilters,
  type InventoryListRow,
} from "./inventory-list-model"
import {
  selectAverageDailySales,
  selectInventoryPeriodSummary,
  selectInventoryRisks,
} from "./inventory-selectors"
import type {
  InventoryAdjustmentInput,
  InventoryMovement,
  InventoryPeriod,
  InventoryRisk,
} from "./types"

const RISK_SETTINGS = {
  lowStockThreshold: 12,
  overstockThreshold: 90,
  unusualAbsoluteDelta: 25,
  reorderDaysThreshold: 21,
} as const
const PAGE_SIZE = 12

const riskLabel: Record<InventoryRisk, string> = {
  out_of_stock: "Out of stock",
  low_stock: "Low stock",
  overstock: "Overstock",
  unusual_change: "Unusual change",
  reorder_risk: "Reorder risk",
  healthy: "Healthy",
}

const riskTone = (risk: InventoryRisk) => {
  if (risk === "healthy") return "bg-emerald-50 text-emerald-800"
  if (risk === "overstock") return "bg-sky-50 text-sky-800"
  if (risk === "unusual_change") return "bg-violet-50 text-violet-800"
  return "bg-amber-50 text-amber-900"
}

const initialInventoryFilters: InventoryListFilters = {
  query: "",
  category: "all",
  risk: "all",
  sort: "updated-desc",
}

type InventoryFilterDraft = InventoryListFilters & {
  period: InventoryPeriod
}

const inventoryRiskOptions: readonly OperationalSelectOption[] = [
  { value: "all", label: "All risks" },
  ...Object.entries(riskLabel).map(([value, label]) => ({ value, label })),
]

const inventoryPeriodOptions: readonly OperationalSelectOption[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
]

const inventorySortOptions: readonly OperationalSelectOption[] = [
  { value: "updated-desc", label: "Recently updated" },
  { value: "stock-asc", label: "Stock low to high" },
  { value: "stock-desc", label: "Stock high to low" },
  { value: "change-asc", label: "Largest decline" },
  { value: "days-asc", label: "Supply days low to high" },
]

const formatDate = (value: string, language: string) =>
  new Intl.DateTimeFormat(language === "zh-TW" ? "zh-TW" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))

const useInventoryMovements = (
  repository: ProductRepository,
  productVersion: number
) => {
  const [state, setState] = useState<{
    status: "loading" | "ready" | "error"
    movements: readonly InventoryMovement[]
  }>({ status: "loading", movements: [] })
  useEffect(() => {
    let active = true
    void repository
      .listInventoryMovements()
      .then((movements) => {
        if (active) setState({ status: "ready", movements })
      })
      .catch(() => {
        if (active) setState({ status: "error", movements: [] })
      })
    return () => {
      active = false
    }
  }, [productVersion, repository])
  return state
}

const MovementBars = ({
  movements,
  label,
}: {
  movements: readonly InventoryMovement[]
  label: string
}) => {
  const values = [...movements].slice(0, 12).reverse()
  const max = Math.max(1, ...values.map((movement) => Math.abs(movement.delta)))
  return (
    <div role="img" className="flex h-20 items-end gap-1" aria-label={label}>
      {values.map((movement) => (
        <div
          key={movement.id}
          className={`min-w-1 flex-1 rounded-t ${movement.delta >= 0 ? "bg-emerald-500" : "bg-amber-500"}`}
          style={{
            height: `${Math.max(8, (Math.abs(movement.delta) / max) * 100)}%`,
          }}
          title={`${movement.delta > 0 ? "+" : ""}${movement.delta}`}
        />
      ))}
    </div>
  )
}

export const InventoryAdjustmentDialog = ({
  product,
  repository,
  onClose,
}: {
  product: Product
  repository: ProductRepository
  onClose: () => void
}) => {
  const { t } = useTranslation()
  const [type, setType] = useState<"receipt" | "issue" | "reconciliation">(
    "receipt"
  )
  const [value, setValue] = useState(1)
  const [reason, setReason] = useState("")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const nextStock =
    type === "receipt"
      ? product.stock + value
      : type === "issue"
        ? product.stock - value
        : value
  const changeType = (next: typeof type) => {
    setType(next)
    setReason("")
  }
  const confirm = async () => {
    setBusy(true)
    setError("")
    const input: InventoryAdjustmentInput =
      type === "receipt"
        ? {
            type,
            quantity: value,
            reasonCode: "purchase_receipt",
            note,
          }
        : type === "issue"
          ? {
              type,
              quantity: value,
              reasonCode: reason as "customer_order" | "damaged_goods",
              note,
            }
          : {
              type,
              targetStock: value,
              reasonCode: "cycle_count",
              note,
            }
    try {
      await repository.adjustInventory(product.id, input)
      onClose()
    } catch {
      setError(t("Inventory adjustment could not be saved."))
      setBusy(false)
    }
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="inventory-adjustment-title"
        className="w-full max-w-lg rounded-xl bg-background p-4 shadow-2xl ring-1 ring-foreground/10"
      >
        <header className="flex items-start justify-between gap-4 border-b pb-3">
          <div>
            <h2 id="inventory-adjustment-title" className="font-semibold">
              {t("Adjust inventory")}
            </h2>
            <p className="text-sm text-muted-foreground">{product.title}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label={t("Close")}
          >
            <X />
          </Button>
        </header>
        <div className="grid gap-3 py-4 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span>{t("Adjustment type")}</span>
            <select
              className="h-9 rounded-md border bg-background px-2"
              value={type}
              onChange={(event) =>
                changeType(event.target.value as typeof type)
              }
            >
              <option value="receipt">{t("Receipt")}</option>
              <option value="issue">{t("Issue")}</option>
              <option value="reconciliation">{t("Reconciliation")}</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span>
              {type === "reconciliation" ? t("Target stock") : t("Quantity")}
            </span>
            <input
              className="h-9 rounded-md border bg-background px-2"
              type="number"
              min={type === "reconciliation" ? 0 : 1}
              step="1"
              value={value}
              onChange={(event) => setValue(Number(event.target.value))}
            />
          </label>
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span>{t("Reason")}</span>
            <select
              className="h-9 rounded-md border bg-background px-2"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            >
              <option value="" disabled>
                {t("Select reason")}
              </option>
              {type === "receipt" ? (
                <option value="purchase_receipt">
                  {t("Purchase receipt")}
                </option>
              ) : null}
              {type === "issue" ? (
                <>
                  <option value="customer_order">{t("Customer order")}</option>
                  <option value="damaged_goods">{t("Damaged goods")}</option>
                </>
              ) : null}
              {type === "reconciliation" ? (
                <option value="cycle_count">{t("Cycle count")}</option>
              ) : null}
            </select>
          </label>
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span>{t("Internal note")}</span>
            <textarea
              className="min-h-20 rounded-md border bg-background p-2"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={500}
            />
          </label>
        </div>
        <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted p-3 text-center text-sm">
          <div>
            <span className="block text-muted-foreground">{t("Before")}</span>
            <strong>{product.stock}</strong>
          </div>
          <div>
            <span className="block text-muted-foreground">{t("Change")}</span>
            <strong>
              {nextStock - product.stock >= 0 ? "+" : ""}
              {nextStock - product.stock}
            </strong>
          </div>
          <div>
            <span className="block text-muted-foreground">{t("After")}</span>
            <strong>{nextStock}</strong>
          </div>
        </div>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <footer className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button
            disabled={
              busy ||
              !reason ||
              !Number.isInteger(value) ||
              value < (type === "reconciliation" ? 0 : 1) ||
              nextStock < 0
            }
            onClick={() => void confirm()}
          >
            {busy ? t("Saving…") : t("Confirm adjustment")}
          </Button>
        </footer>
      </section>
    </div>
  )
}

const InventoryState = ({ message }: { message: string }) => (
  <GridBlock>
    <Card>
      <CardContent className="flex min-h-40 items-center justify-center text-muted-foreground">
        {message}
      </CardContent>
    </Card>
  </GridBlock>
)

const InventoryFilterField = ({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) => (
  <div className="grid gap-1.5 text-xs font-medium">
    <span>{label}</span>
    {children}
  </div>
)

export const InventoryPage = () => {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { commerce, productRepository, products } = useVoltageAdmin()
  const inventory = useInventoryMovements(productRepository, products.version)
  const [period, setPeriod] = useState<InventoryPeriod>("month")
  const [filters, setFilters] = useState<InventoryListFilters>(
    initialInventoryFilters
  )
  const { page, setPage, applyAndReset } = useOperationalPagination()
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [adjusting, setAdjusting] = useState<Product | null>(null)
  const now = useMemo(() => new Date(), [])
  const rows = useMemo<InventoryListRow[]>(
    () =>
      products.products.map((product) => {
        const movements = inventory.movements.filter(
          (movement) => movement.productId === product.id
        )
        const summary = selectInventoryPeriodSummary(
          product.id,
          inventory.movements,
          period,
          now
        )
        const sales = selectAverageDailySales(
          product.id,
          commerce.orders,
          commerce.orderLines,
          now
        )
        const risk = selectInventoryRisks(
          product.stock,
          summary.netChange,
          sales.unitsPerDay,
          RISK_SETTINGS
        )
        return {
          product,
          movement: movements[0] ?? null,
          periodDelta: summary.netChange,
          changeRate: summary.changeRate,
          estimatedDaysOfSupply: risk.estimatedDaysOfSupply,
          risks: risk.risks,
        }
      }),
    [
      commerce.orderLines,
      commerce.orders,
      inventory.movements,
      now,
      period,
      products.products,
    ]
  )
  const model = useMemo(
    () => createInventoryListModel(rows, filters, page, PAGE_SIZE),
    [filters, page, rows]
  )
  const categories = useMemo(
    () =>
      [
        ...new Set(
          products.products
            .filter((product) => product.status !== "archived")
            .map((product) => product.category)
        ),
      ].sort(),
    [products.products]
  )
  const categoryOptions = useMemo<readonly OperationalSelectOption[]>(
    () => [
      { value: "all", label: t("All categories") },
      ...categories.map((category) => ({ value: category, label: category })),
    ],
    [categories, t]
  )
  const localizedRiskOptions = inventoryRiskOptions.map((option) => ({
    ...option,
    label: t(option.label),
  }))
  const localizedPeriodOptions = inventoryPeriodOptions.map((option) => ({
    ...option,
    label: t(option.label),
  }))
  const localizedSortOptions = inventorySortOptions.map((option) => ({
    ...option,
    label: t(option.label),
  }))
  const activeRows = rows.filter(({ product }) => product.status !== "archived")
  const hasDataError =
    products.state === "error" ||
    inventory.status === "error" ||
    commerce.state === "error"
  const isDataLoading =
    !hasDataError &&
    (products.state === "loading" ||
      inventory.status === "loading" ||
      commerce.state === "loading")
  const isDataReady =
    !hasDataError &&
    products.state === "ready" &&
    inventory.status === "ready" &&
    commerce.state === "ready"
  const updateFilter = <K extends keyof InventoryListFilters>(
    key: K,
    value: InventoryListFilters[K]
  ) => {
    applyAndReset(() =>
      setFilters((current) => ({ ...current, [key]: value }))
    )
  }
  const updatePeriod = (value: InventoryPeriod) =>
    applyAndReset(() => setPeriod(value))
  const applyFilterDraft = (next: InventoryFilterDraft) =>
    applyAndReset(() => {
      const { period: nextPeriod, ...nextFilters } = next
      setPeriod(nextPeriod)
      setFilters(nextFilters)
    })

  const resultStart = model.total === 0 ? 0 : (model.page - 1) * PAGE_SIZE + 1
  const resultEnd = model.total === 0 ? 0 : resultStart + model.items.length - 1
  const activeFilters: ActiveOperationalFilter[] = []
  const addActiveFilter = <K extends keyof InventoryListFilters>(
    id: string,
    label: string,
    key: K,
    resetValue: InventoryListFilters[K]
  ) =>
    activeFilters.push({
      id,
      label,
      onRemove: () => updateFilter(key, resetValue),
    })
  if (filters.query) {
    addActiveFilter("query", `${t("Search")}: ${filters.query}`, "query", "")
  }
  if (filters.category !== "all") {
    addActiveFilter(
      "category",
      `${t("Category")}: ${filters.category}`,
      "category",
      "all"
    )
  }
  if (filters.risk !== "all") {
    addActiveFilter(
      "risk",
      `${t("Risk")}: ${t(riskLabel[filters.risk])}`,
      "risk",
      "all"
    )
  }
  if (period !== "month") {
    activeFilters.push({
      id: "period",
      label: `${t("Period")}: ${t(period === "week" ? "Week" : "Year")}`,
      onRemove: () => updatePeriod("month"),
    })
  }
  if (filters.sort !== "updated-desc") {
    const sortLabel = localizedSortOptions.find(
      (option) => option.value === filters.sort
    )?.label
    addActiveFilter(
      "sort",
      `${t("Sort")}: ${sortLabel ?? filters.sort}`,
      "sort",
      "updated-desc"
    )
  }

  const clearAllFilters = () =>
    applyAndReset(() => {
      setFilters(initialInventoryFilters)
      setPeriod("month")
    })
  const currentDraft: InventoryFilterDraft = { ...filters, period }
  const desktopEmptyDraft: InventoryFilterDraft = {
    ...currentDraft,
    sort: "updated-desc",
  }
  const mobileEmptyDraft: InventoryFilterDraft = {
    ...initialInventoryFilters,
    query: filters.query,
    period: "month",
  }

  const renderFilterFields = (
    draft: InventoryFilterDraft,
    setDraft: Dispatch<SetStateAction<InventoryFilterDraft>>,
    includePrimary: boolean
  ) => (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {includePrimary ? (
        <>
          <InventoryFilterField label={t("Category")}>
            <OperationalToolbarSelect
              label={t("Category")}
              value={draft.category}
              options={categoryOptions}
              className="w-full"
              onValueChange={(category) =>
                setDraft((current) => ({ ...current, category }))
              }
            />
          </InventoryFilterField>
          <InventoryFilterField label={t("Risk")}>
            <OperationalToolbarSelect
              label={t("Risk")}
              value={draft.risk}
              options={localizedRiskOptions}
              className="w-full"
              onValueChange={(risk) =>
                setDraft((current) => ({
                  ...current,
                  risk: risk as InventoryListFilters["risk"],
                }))
              }
            />
          </InventoryFilterField>
          <InventoryFilterField label={t("Period")}>
            <OperationalToolbarSelect
              label={t("Period")}
              value={draft.period}
              options={localizedPeriodOptions}
              className="w-full"
              onValueChange={(nextPeriod) =>
                setDraft((current) => ({
                  ...current,
                  period: nextPeriod as InventoryPeriod,
                }))
              }
            />
          </InventoryFilterField>
        </>
      ) : null}
      <InventoryFilterField label={t("Sort")}>
        <OperationalToolbarSelect
          label={t("Sort")}
          value={draft.sort}
          options={localizedSortOptions}
          className="w-full"
          onValueChange={(sort) =>
            setDraft((current) => ({
              ...current,
              sort: sort as InventoryListFilters["sort"],
            }))
          }
        />
      </InventoryFilterField>
    </div>
  )

  return (
    <PageLayout
      ariaLabel={t("Inventory")}
      pageName="Inventory"
      status={
        <Badge variant="outline">
          {t("{{count}} products", { count: activeRows.length })}
        </Badge>
      }
    >
      <GridBlock className="col-span-12 md:col-span-6 lg:col-span-3">
        <OperationalMetricCard
          label={t("Total units")}
          value={activeRows.reduce((sum, row) => sum + row.product.stock, 0)}
          detail={t("Across active products")}
        />
      </GridBlock>
      <GridBlock className="col-span-12 md:col-span-6 lg:col-span-3">
        <OperationalMetricCard
          tone="critical"
          label={t("Out of stock")}
          value={
            activeRows.filter((row) => row.risks.includes("out_of_stock"))
              .length
          }
          detail={t("Needs immediate review")}
        />
      </GridBlock>
      <GridBlock className="col-span-12 md:col-span-6 lg:col-span-3">
        <OperationalMetricCard
          tone="warning"
          label={t("Low stock")}
          value={
            activeRows.filter((row) => row.risks.includes("low_stock")).length
          }
          detail={t("At or below 12 units")}
        />
      </GridBlock>
      <GridBlock className="col-span-12 md:col-span-6 lg:col-span-3">
        <OperationalMetricCard
          tone="warning"
          label={t("Reorder risk")}
          value={
            activeRows.filter((row) => row.risks.includes("reorder_risk"))
              .length
          }
          detail={t("21 days of supply or less")}
        />
      </GridBlock>
      <GridBlock>
        <section aria-label={t("Inventory list")}>
          <OperationalListPanel
            toolbar={
              <OperationalFilterToolbar
                search={
                  <OperationalToolbarSearch
                    label={t("Search inventory")}
                    value={filters.query}
                    placeholder={t("Search title, SKU, brand or category")}
                    onChange={(query) => updateFilter("query", query)}
                  />
                }
                primaryFilters={
                  <>
                    <OperationalToolbarSelect
                      label={t("Category")}
                      value={filters.category}
                      options={categoryOptions}
                      onValueChange={(category) =>
                        updateFilter("category", category)
                      }
                    />
                    <OperationalToolbarSelect
                      label={t("Risk")}
                      value={filters.risk}
                      options={localizedRiskOptions}
                      onValueChange={(risk) =>
                        updateFilter(
                          "risk",
                          risk as InventoryListFilters["risk"]
                        )
                      }
                    />
                    <OperationalToolbarSelect
                      label={t("Period")}
                      value={period}
                      options={localizedPeriodOptions}
                      onValueChange={(nextPeriod) =>
                        updatePeriod(nextPeriod as InventoryPeriod)
                      }
                    />
                  </>
                }
                moreFilter={
                  <OperationalFilterPopover
                    value={currentDraft}
                    emptyValue={desktopEmptyDraft}
                    onApply={applyFilterDraft}
                    trigger={
                      <OperationalFilterButton
                        kind="more"
                        label={t("More filters")}
                        activeCount={
                          filters.sort === "updated-desc" ? 0 : 1
                        }
                      />
                    }
                    title={t("More filters")}
                    labels={{
                      clear: t("Clear"),
                      cancel: t("Cancel"),
                      apply: t("Apply"),
                    }}
                  >
                    {({ draft, setDraft }) =>
                      renderFilterFields(draft, setDraft, false)
                    }
                  </OperationalFilterPopover>
                }
                mobileFilter={
                  <OperationalFilterPopover
                    value={currentDraft}
                    emptyValue={mobileEmptyDraft}
                    onApply={applyFilterDraft}
                    trigger={
                      <OperationalFilterButton
                        kind="filter"
                        label={t("Filter inventory")}
                        activeCount={
                          activeFilters.filter(({ id }) => id !== "query")
                            .length
                        }
                      />
                    }
                    title={t("Filter inventory")}
                    labels={{
                      clear: t("Clear"),
                      cancel: t("Cancel"),
                      apply: t("Apply"),
                    }}
                  >
                    {({ draft, setDraft }) =>
                      renderFilterFields(draft, setDraft, true)
                    }
                  </OperationalFilterPopover>
                }
              />
            }
            summary={
              <ActiveFilterSummary
                resultLabel={t("Showing {{start}}–{{end}} / {{total}}", {
                  start: resultStart,
                  end: resultEnd,
                  total: model.total,
                })}
                filters={activeFilters}
                clearAllLabel={t("Clear all")}
                onClearAll={clearAllFilters}
              />
            }
            pagination={
              isDataReady && model.total > 0 ? (
                <OperationalPagination
                  page={model.page}
                  pageCount={model.pageCount}
                  ariaLabel={t("Inventory pagination")}
                  previousLabel={t("Previous page")}
                  nextLabel={t("Next page")}
                  onPageChange={setPage}
                />
              ) : undefined
            }
          >
            {isDataLoading ? (
              <OperationalListState kind="loading">
                {t("Loading inventory…")}
              </OperationalListState>
            ) : hasDataError ? (
              <OperationalListState kind="error">
                {t("Inventory data is unavailable.")}
              </OperationalListState>
            ) : model.total === 0 ? (
              <OperationalListState kind="empty">
                {t("No inventory matches the current filters.")}
              </OperationalListState>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="border-b bg-muted/60 text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3">{t("Product")}</th>
                    <th>{t("Stock")}</th>
                    <th>{t("Period change")}</th>
                    <th>{t("Change rate")}</th>
                    <th>{t("Supply days")}</th>
                    <th>{t("Risk")}</th>
                    <th>{t("Updated")}</th>
                    <th className="pr-3 text-right">{t("Actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {model.items.map((row) => {
                    const open = expandedId === row.product.id
                    const movements = inventory.movements.filter(
                      (movement) => movement.productId === row.product.id
                    )
                    const summary = selectInventoryPeriodSummary(
                      row.product.id,
                      inventory.movements,
                      period,
                      now
                    )
                    return (
                      <FragmentRow
                        key={row.product.id}
                        row={row}
                        open={open}
                        movements={movements}
                        summary={summary}
                        language={i18n.resolvedLanguage ?? "en"}
                        onToggle={() =>
                          setExpandedId(open ? null : row.product.id)
                        }
                        onDetail={() =>
                          navigate(
                            `/inventory/${row.product.id}?period=${period}`
                          )
                        }
                        onAdjust={() => setAdjusting(row.product)}
                        t={t}
                      />
                    )
                  })}
                </tbody>
              </table>
              </div>
            )}
          </OperationalListPanel>
        </section>
      </GridBlock>
      {adjusting ? (
        <InventoryAdjustmentDialog
          product={adjusting}
          repository={productRepository}
          onClose={() => setAdjusting(null)}
        />
      ) : null}
    </PageLayout>
  )
}

const FragmentRow = ({
  row,
  open,
  movements,
  summary,
  language,
  onToggle,
  onDetail,
  onAdjust,
  t,
}: {
  row: InventoryListRow
  open: boolean
  movements: readonly InventoryMovement[]
  summary: ReturnType<typeof selectInventoryPeriodSummary>
  language: string
  onToggle: () => void
  onDetail: () => void
  onAdjust: () => void
  t: (key: string, options?: Record<string, unknown>) => string
}) => (
  <>
    <tr className="border-b transition-colors hover:bg-muted/35">
      <td className="p-3">
        <strong className="block">{row.product.title}</strong>
        <small className="text-muted-foreground">
          {row.product.sku} · {row.product.category}
        </small>
      </td>
      <td className="font-semibold tabular-nums">{row.product.stock}</td>
      <td
        className={`tabular-nums ${row.periodDelta < 0 ? "text-amber-700" : "text-emerald-700"}`}
      >
        {row.periodDelta > 0 ? "+" : ""}
        {row.periodDelta}
      </td>
      <td className="tabular-nums">
        {row.changeRate === null
          ? "—"
          : `${row.changeRate >= 0 ? "+" : ""}${(row.changeRate * 100).toFixed(1)}%`}
      </td>
      <td>
        {row.estimatedDaysOfSupply === null
          ? t("Insufficient data")
          : t("{{count}} days", {
              count: Math.round(row.estimatedDaysOfSupply),
            })}
      </td>
      <td>
        <div className="flex max-w-56 flex-wrap gap-1">
          {row.risks.map((risk) => (
            <Badge key={risk} className={riskTone(risk)}>
              {t(riskLabel[risk])}
            </Badge>
          ))}
        </div>
      </td>
      <td className="text-xs text-muted-foreground">
        {row.movement ? formatDate(row.movement.occurredAt, language) : "—"}
      </td>
      <td className="pr-3">
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={onToggle}>
            {open ? <ChevronUp /> : <ChevronDown />}
            {t("Quick view")}
          </Button>
          <Button size="sm" variant="outline" onClick={onDetail}>
            {t("Details")}
          </Button>
          <Button size="sm" onClick={onAdjust}>
            {t("Adjust")}
          </Button>
        </div>
      </td>
    </tr>
    {open ? (
      <tr className="border-b bg-muted/20">
        <td colSpan={8} className="p-3">
          <div className="grid gap-4 lg:grid-cols-3">
            <div>
              <p className="mb-2 text-xs font-semibold text-muted-foreground">
                {t("Period summary")}
              </p>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt>{t("Opening")}</dt>
                  <dd className="font-semibold">{summary.openingStock}</dd>
                </div>
                <div>
                  <dt>{t("Closing")}</dt>
                  <dd className="font-semibold">{summary.closingStock}</dd>
                </div>
                <div>
                  <dt>{t("Received")}</dt>
                  <dd>+{summary.received}</dd>
                </div>
                <div>
                  <dt>{t("Issued")}</dt>
                  <dd>-{summary.issued}</dd>
                </div>
                <div>
                  <dt>{t("Previous closing")}</dt>
                  <dd>{summary.previousClosingStock ?? "—"}</dd>
                </div>
                <div>
                  <dt>{t("Previous net change")}</dt>
                  <dd>{summary.previousNetChange ?? "—"}</dd>
                </div>
              </dl>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold text-muted-foreground">
                {t("Trend")}
              </p>
              <MovementBars
                movements={movements.filter(
                  (movement) =>
                    movement.occurredAt >= summary.startAt &&
                    movement.occurredAt < summary.endAt
                )}
                label={t("Inventory trend")}
              />
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold text-muted-foreground">
                {t("Recent movements")}
              </p>
              <ul className="grid gap-1 text-sm">
                {movements.slice(0, 3).map((movement) => (
                  <li key={movement.id} className="flex justify-between">
                    <span>{t(movement.reasonCode)}</span>
                    <strong>
                      {movement.delta > 0 ? "+" : ""}
                      {movement.delta}
                    </strong>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </td>
      </tr>
    ) : null}
  </>
)

export const InventoryDetailPage = () => {
  const { productId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { commerce, productRepository, products } = useVoltageAdmin()
  const inventory = useInventoryMovements(productRepository, products.version)
  const [adjusting, setAdjusting] = useState(false)
  const requestedPeriod = searchParams.get("period")
  const period: InventoryPeriod =
    requestedPeriod === "week" ||
    requestedPeriod === "month" ||
    requestedPeriod === "year"
      ? requestedPeriod
      : "month"
  const id = Number(productId)
  const product = products.products.find((item) => item.id === id)
  const now = useMemo(() => new Date(), [])
  if (
    products.state === "error" ||
    inventory.status === "error" ||
    commerce.state === "error"
  )
    return (
      <PageLayout ariaLabel={t("Inventory details")} pageName="Inventory">
        <InventoryState message={t("Inventory data is unavailable.")} />
      </PageLayout>
    )
  if (
    products.state === "loading" ||
    inventory.status === "loading" ||
    commerce.state === "loading"
  )
    return (
      <PageLayout ariaLabel={t("Inventory details")} pageName="Inventory">
        <InventoryState message={t("Loading inventory…")} />
      </PageLayout>
    )
  if (!Number.isInteger(id) || !product)
    return (
      <PageLayout
        ariaLabel={t("Inventory details")}
        pageName="Inventory detail"
        breadcrumb={[
          { label: "Inventory", to: "/inventory" },
          { label: "Not found" },
        ]}
      >
        <InventoryState message={t("Inventory product was not found.")} />
      </PageLayout>
    )
  const movements = inventory.movements.filter(
    (movement) => movement.productId === id
  )
  const summary = selectInventoryPeriodSummary(
    id,
    inventory.movements,
    period,
    now
  )
  const sales = selectAverageDailySales(
    id,
    commerce.orders,
    commerce.orderLines,
    now
  )
  const risk = selectInventoryRisks(
    product.stock,
    summary.netChange,
    sales.unitsPerDay,
    RISK_SETTINGS
  )
  return (
    <PageLayout
      ariaLabel={t("Inventory details")}
      pageName={product.title}
      translatePageName={false}
      breadcrumb={[
        { label: "Inventory", to: "/inventory" },
        { label: product.title, translate: false },
      ]}
      status={
        <div className="flex gap-1">
          {risk.risks.map((item) => (
            <Badge key={item} className={riskTone(item)}>
              {t(riskLabel[item])}
            </Badge>
          ))}
        </div>
      }
      actions={
        <>
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ChevronLeft />
            {t("Back")}
          </Button>
          <Button onClick={() => setAdjusting(true)}>
            <SlidersHorizontal />
            {t("Adjust inventory")}
          </Button>
        </>
      }
    >
      <GridBlock className="col-span-12 md:col-span-6 lg:col-span-3">
        <OperationalMetricCard
          label={t("Current stock")}
          value={product.stock}
          detail={product.sku}
        />
      </GridBlock>
      <GridBlock className="col-span-12 md:col-span-6 lg:col-span-3">
        <OperationalMetricCard
          label={t("Period change")}
          value={`${summary.netChange > 0 ? "+" : ""}${summary.netChange}`}
          detail={`${summary.openingStock} → ${summary.closingStock}`}
        />
      </GridBlock>
      <GridBlock className="col-span-12 md:col-span-6 lg:col-span-3">
        <OperationalMetricCard
          label={t("Average daily sales")}
          value={
            sales.unitsPerDay === null ? "—" : sales.unitsPerDay.toFixed(2)
          }
          detail={
            sales.status === "ready"
              ? t("Trailing 90 days")
              : t("Insufficient data")
          }
        />
      </GridBlock>
      <GridBlock className="col-span-12 md:col-span-6 lg:col-span-3">
        <OperationalMetricCard
          label={t("Supply days")}
          value={
            risk.estimatedDaysOfSupply === null
              ? "—"
              : Math.round(risk.estimatedDaysOfSupply)
          }
          detail={t("Estimated from recent sales")}
        />
      </GridBlock>
      <GridBlock className="col-span-12 lg:col-span-8">
        <Card>
          <CardHeader className="border-b">
            <div className="flex items-center justify-between gap-3">
              <CardTitle>{t("Inventory trend")}</CardTitle>
              <select
                aria-label={t("Period")}
                className="h-9 rounded-md border bg-background px-2"
                value={period}
                onChange={(event) =>
                  setSearchParams(
                    { period: event.target.value as InventoryPeriod },
                    { replace: true }
                  )
                }
              >
                <option value="week">{t("Week")}</option>
                <option value="month">{t("Month")}</option>
                <option value="year">{t("Year")}</option>
              </select>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <MovementBars
              movements={movements.filter(
                (movement) =>
                  movement.occurredAt >= summary.startAt &&
                  movement.occurredAt < summary.endAt
              )}
              label={t("Inventory trend")}
            />
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
              <div>
                <span className="block text-muted-foreground">
                  {t("Received")}
                </span>
                <strong>+{summary.received}</strong>
              </div>
              <div>
                <span className="block text-muted-foreground">
                  {t("Issued")}
                </span>
                <strong>-{summary.issued}</strong>
              </div>
              <div>
                <span className="block text-muted-foreground">
                  {t("Reconciled")}
                </span>
                <strong>{summary.reconciled}</strong>
              </div>
            </div>
          </CardContent>
        </Card>
      </GridBlock>
      <GridBlock className="col-span-12 lg:col-span-4">
        <Card className="h-full">
          <CardHeader>
            <CardTitle>{t("Period comparison")}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 text-sm">
              <div className="flex justify-between">
                <dt>{t("Previous closing")}</dt>
                <dd>{summary.previousClosingStock ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt>{t("Previous net change")}</dt>
                <dd>{summary.previousNetChange ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt>{t("Change rate")}</dt>
                <dd>
                  {summary.changeRate === null
                    ? "—"
                    : `${(summary.changeRate * 100).toFixed(1)}%`}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </GridBlock>
      <GridBlock>
        <Card size="sm" className="overflow-hidden">
          <CardHeader className="border-b">
            <CardTitle>{t("Movement history")}</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b bg-muted/60 text-xs">
                <tr>
                  <th className="p-3">{t("Time")}</th>
                  <th>{t("Type")}</th>
                  <th>{t("Reason")}</th>
                  <th>{t("Before")}</th>
                  <th>{t("Change")}</th>
                  <th>{t("After")}</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((movement) => (
                  <tr key={movement.id} className="border-b">
                    <td className="p-3">
                      {formatDate(
                        movement.occurredAt,
                        i18n.resolvedLanguage ?? "en"
                      )}
                    </td>
                    <td>{t(movement.type)}</td>
                    <td>{t(movement.reasonCode)}</td>
                    <td>{movement.previousStock}</td>
                    <td
                      className={
                        movement.delta < 0
                          ? "text-amber-700"
                          : "text-emerald-700"
                      }
                    >
                      {movement.delta > 0 ? "+" : ""}
                      {movement.delta}
                    </td>
                    <td>{movement.nextStock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </GridBlock>
      {adjusting ? (
        <InventoryAdjustmentDialog
          product={product}
          repository={productRepository}
          onClose={() => setAdjusting(false)}
        />
      ) : null}
    </PageLayout>
  )
}
