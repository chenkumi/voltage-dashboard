import { ChevronDown, ChevronLeft, ChevronUp } from "lucide-react"
import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useMemo,
  useState,
} from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, useParams } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type {
  FulfillmentStatus,
  Money,
  Order,
  OrderStatus,
  PaymentStatus,
} from "../commerce-data/types"
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
  type OperationalFilterErrors,
  type OperationalSelectOption,
} from "../operational-ui"
import { GridBlock, PageLayout } from "../voltage-admin-page-layout"
import { useVoltageAdmin } from "../voltage-admin"
import {
  createOrderListModel,
  type OrderListFilters,
  type OrderListRow,
} from "./order-list-model"
import { relatedReturnsFor } from "./order-relations"

const PAGE_SIZE = 15

const orderStatusLabels: Record<OrderStatus, string> = {
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  action_needed: "Action needed",
}

const paymentStatusLabels: Record<PaymentStatus, string> = {
  paid: "Paid",
  pending: "Pending",
  failed: "Failed",
  refunded: "Refunded",
}

const fulfillmentLabels: Record<FulfillmentStatus, string> = {
  unfulfilled: "Unfulfilled",
  picking: "Picking",
  in_transit: "In transit",
  fulfilled: "Fulfilled",
  exception: "Exception",
}

const statusTone = (value: string) => {
  if (["paid", "delivered", "fulfilled"].includes(value)) {
    return "bg-emerald-50 text-emerald-800"
  }
  if (["failed", "action_needed", "exception"].includes(value)) {
    return "bg-rose-50 text-rose-800"
  }
  if (["pending", "processing", "picking"].includes(value)) {
    return "bg-amber-50 text-amber-900"
  }
  return "bg-sky-50 text-sky-800"
}

const formatMoney = (money: Money, language: string) =>
  new Intl.NumberFormat(language === "zh-TW" ? "zh-TW" : "en-US", {
    style: "currency",
    currency: money.currency,
  }).format(money.amount)

const formatDate = (value: string, language: string) =>
  new Intl.DateTimeFormat(language === "zh-TW" ? "zh-TW" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))

const maskedName = (name: string) => `${name.slice(0, 1)}•••`

const maskedEmail = (email: string) => {
  const [local = "", domain = ""] = email.split("@")
  return `${local.slice(0, 1)}•••@${domain}`
}

const maskedPhone = (phone: string) => `••••••${phone.slice(-4)}`

const OrderState = ({ message }: { message: string }) => (
  <GridBlock>
    <Card>
      <CardContent className="flex min-h-40 items-center justify-center text-muted-foreground">
        {message}
      </CardContent>
    </Card>
  </GridBlock>
)

const MoneyBreakdown = ({
  order,
  language,
  t,
}: {
  order: Order
  language: string
  t: (key: string) => string
}) => (
  <dl className="grid gap-2 text-sm">
    {(["subtotal", "discount", "shipping", "tax", "total"] as const).map(
      (key) => (
        <div
          key={key}
          className={`flex justify-between ${key === "total" ? "border-t pt-2 font-semibold" : ""}`}
        >
          <dt>{t(key[0].toUpperCase() + key.slice(1))}</dt>
          <dd className="tabular-nums">
            {formatMoney(order.amounts[key], language)}
          </dd>
        </div>
      )
    )}
  </dl>
)

const OrderQuickRow = ({
  row,
  open,
  language,
  onToggle,
  onDetail,
  onReturn,
  returnsState,
  t,
}: {
  row: OrderListRow
  open: boolean
  language: string
  onToggle: () => void
  onDetail: () => void
  onReturn: (returnId: string) => void
  returnsState: "idle" | "loading" | "ready" | "error"
  t: (key: string, options?: Record<string, unknown>) => string
}) => (
  <>
    <tr className="border-b transition-colors hover:bg-muted/35">
      <td className="p-3">
        <strong className="block">{row.order.id}</strong>
        <small className="text-muted-foreground">
          {t("{{count}} items", { count: row.lines.length })}
        </small>
      </td>
      <td>{formatDate(row.order.createdAt, language)}</td>
      <td>
        <span className="block">{t(row.order.customerSnapshot.segment)}</span>
        <small className="text-muted-foreground">
          {t(row.order.customerSnapshot.region)}
        </small>
      </td>
      <td>
        <Badge className={statusTone(row.order.status)}>
          {t(orderStatusLabels[row.order.status])}
        </Badge>
      </td>
      <td>
        <Badge className={statusTone(row.order.paymentStatus)}>
          {t(paymentStatusLabels[row.order.paymentStatus])}
        </Badge>
      </td>
      <td>
        <Badge className={statusTone(row.order.fulfillmentStatus)}>
          {t(fulfillmentLabels[row.order.fulfillmentStatus])}
        </Badge>
      </td>
      <td className="font-semibold tabular-nums">
        {formatMoney(row.order.amounts.total, language)}
      </td>
      <td className="pr-3">
        <div className="flex justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={`order-quick-${row.order.id}`}
          >
            {open ? <ChevronUp /> : <ChevronDown />}
            {t("Quick view")}
          </Button>
          <Button size="sm" variant="outline" onClick={onDetail}>
            {t("Details")}
          </Button>
        </div>
      </td>
    </tr>
    {open ? (
      <tr className="border-b bg-muted/20">
        <td id={`order-quick-${row.order.id}`} colSpan={8} className="p-3">
          <div className="grid gap-4 lg:grid-cols-4">
            <div>
              <p className="mb-2 text-xs font-semibold text-muted-foreground">
                {t("Exception signals")}
              </p>
              {row.order.status === "action_needed" ||
              row.order.paymentStatus === "failed" ||
              row.order.fulfillmentStatus === "exception" ? (
                <div className="flex flex-wrap gap-2">
                  {row.order.status === "action_needed" ? (
                    <Badge className={statusTone(row.order.status)}>
                      {t(orderStatusLabels[row.order.status])}
                    </Badge>
                  ) : null}
                  {row.order.paymentStatus === "failed" ? (
                    <Badge className={statusTone(row.order.paymentStatus)}>
                      {t(paymentStatusLabels[row.order.paymentStatus])}
                    </Badge>
                  ) : null}
                  {row.order.fulfillmentStatus === "exception" ? (
                    <Badge className={statusTone(row.order.fulfillmentStatus)}>
                      {t(fulfillmentLabels[row.order.fulfillmentStatus])}
                    </Badge>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("No exception signals.")}
                </p>
              )}
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold text-muted-foreground">
                {t("Historical items")}
              </p>
              <ul className="grid gap-1 text-sm">
                {row.lines.map((line) => (
                  <li key={line.id} className="flex justify-between gap-2">
                    <span className="truncate">
                      {line.title} × {line.quantity}
                    </span>
                    <strong>{formatMoney(line.subtotal, language)}</strong>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold text-muted-foreground">
                {t("Amount breakdown")}
              </p>
              <MoneyBreakdown order={row.order} language={language} t={t} />
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold text-muted-foreground">
                {t("Related returns")}
              </p>
              {returnsState === "error" ? (
                <p className="text-sm text-muted-foreground">
                  {t("Returns data is unavailable.")}
                </p>
              ) : returnsState !== "ready" ? (
                <p className="text-sm text-muted-foreground">
                  {t("Loading returns…")}
                </p>
              ) : row.relatedReturnIds.length ? (
                <div className="flex flex-wrap gap-2">
                  {row.relatedReturnIds.map((returnId) => (
                    <Button
                      key={returnId}
                      size="sm"
                      variant="outline"
                      onClick={() => onReturn(returnId)}
                    >
                      {returnId}
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("No related return.")}
                </p>
              )}
            </div>
          </div>
        </td>
      </tr>
    ) : null}
  </>
)

const initialFilters: OrderListFilters = {
  query: "",
  dateFrom: "",
  dateTo: "",
  status: "all",
  paymentStatus: "all",
  fulfillmentStatus: "all",
  segment: "all",
  region: "all",
  currency: "all",
  minimumAmount: null,
  maximumAmount: null,
  sort: "updated-desc",
}

const toOptions = (
  labels: Record<string, string>,
  allLabel: string
): readonly OperationalSelectOption[] => [
  { value: "all", label: allLabel },
  ...Object.entries(labels).map(([value, label]) => ({ value, label })),
]

const segmentOptions: readonly OperationalSelectOption[] = [
  { value: "all", label: "All customer segments" },
  { value: "new", label: "new" },
  { value: "returning", label: "returning" },
  { value: "vip", label: "vip" },
]
const regionOptions: readonly OperationalSelectOption[] = [
  { value: "all", label: "All regions" },
  { value: "north", label: "north" },
  { value: "central", label: "central" },
  { value: "south", label: "south" },
  { value: "east", label: "east" },
]
const currencyOptions: readonly OperationalSelectOption[] = [
  { value: "all", label: "All currencies" },
  { value: "TWD", label: "TWD" },
  { value: "USD", label: "USD" },
]
const orderSortOptions: readonly OperationalSelectOption[] = [
  { value: "updated-desc", label: "Recently updated" },
  { value: "created-desc", label: "Newest orders" },
  { value: "amount-asc", label: "Amount low to high" },
  { value: "amount-desc", label: "Amount high to low" },
]

const OrderFilterField = ({
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

export const OrdersPage = () => {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { commerce, returns } = useVoltageAdmin()
  const [filters, setFilters] = useState(initialFilters)
  const { page, setPage, applyAndReset } = useOperationalPagination()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const language = i18n.resolvedLanguage ?? "en"
  const rows = useMemo<OrderListRow[]>(() => {
    const customers = new Map(
      commerce.customers.map((customer) => [customer.id, customer])
    )
    const lines = new Map<string, typeof commerce.orderLines>()
    for (const line of commerce.orderLines) {
      lines.set(line.orderId, [...(lines.get(line.orderId) ?? []), line])
    }
    return commerce.orders.map((order) => ({
      order,
      customer: customers.get(order.customerId) ?? null,
      lines: lines.get(order.id) ?? [],
      relatedReturnIds: relatedReturnsFor(order.id, returns.rmas).map(
        (item) => item.id
      ),
    }))
  }, [commerce, returns.rmas])
  const model = useMemo(
    () => createOrderListModel(rows, filters, page, PAGE_SIZE),
    [filters, page, rows]
  )
  const updateFilter = <K extends keyof OrderListFilters>(
    key: K,
    value: OrderListFilters[K]
  ) => {
    applyAndReset(() => setFilters((current) => ({ ...current, [key]: value })))
  }
  const hasError = commerce.state === "error"
  const isLoading = !hasError && commerce.state !== "ready"

  const localizeOptions = (options: readonly OperationalSelectOption[]) =>
    options.map((option) => ({ ...option, label: t(option.label) }))
  const statusOptions = localizeOptions(
    toOptions(orderStatusLabels, "All order statuses")
  )
  const paymentOptions = localizeOptions(
    toOptions(paymentStatusLabels, "All payment statuses")
  )
  const fulfillmentOptions = localizeOptions(
    toOptions(fulfillmentLabels, "All fulfillment statuses")
  )
  const localizedSegmentOptions = localizeOptions(segmentOptions)
  const localizedRegionOptions = localizeOptions(regionOptions)
  const localizedCurrencyOptions = localizeOptions(currencyOptions)
  const localizedSortOptions = localizeOptions(orderSortOptions)

  const validateFilters = (
    draft: OrderListFilters
  ): OperationalFilterErrors => {
    const errors: Record<string, string> = {}
    if (draft.dateFrom && draft.dateTo && draft.dateFrom > draft.dateTo) {
      errors.dateRange = t("Start date must not be after end date.")
    }
    if (
      draft.currency === "all" &&
      (draft.minimumAmount !== null || draft.maximumAmount !== null)
    ) {
      errors.amountRange = t("Select a currency before setting amount range.")
    } else if (
      (draft.minimumAmount !== null && draft.minimumAmount < 0) ||
      (draft.maximumAmount !== null && draft.maximumAmount < 0)
    ) {
      errors.amountRange = t("Amounts must be zero or greater.")
    } else if (
      draft.minimumAmount !== null &&
      draft.maximumAmount !== null &&
      draft.minimumAmount > draft.maximumAmount
    ) {
      errors.amountRange = t("Minimum amount must not exceed maximum amount.")
    }
    return errors
  }

  const resultStart = model.total === 0 ? 0 : (model.page - 1) * PAGE_SIZE + 1
  const resultEnd = model.total === 0 ? 0 : resultStart + model.items.length - 1
  const activeFilters: ActiveOperationalFilter[] = []
  const addFilter = <K extends keyof OrderListFilters>(
    id: string,
    label: string,
    key: K,
    resetValue: OrderListFilters[K]
  ) =>
    activeFilters.push({
      id,
      label,
      onRemove: () => updateFilter(key, resetValue),
    })
  const optionLabel = (
    options: readonly OperationalSelectOption[],
    value: string
  ) => options.find((option) => option.value === value)?.label ?? value
  if (filters.query)
    addFilter("query", `${t("Search")}: ${filters.query}`, "query", "")
  if (filters.status !== "all")
    addFilter(
      "status",
      `${t("Order status")}: ${optionLabel(statusOptions, filters.status)}`,
      "status",
      "all"
    )
  if (filters.paymentStatus !== "all")
    addFilter(
      "payment",
      `${t("Payment status")}: ${optionLabel(paymentOptions, filters.paymentStatus)}`,
      "paymentStatus",
      "all"
    )
  if (filters.fulfillmentStatus !== "all")
    addFilter(
      "fulfillment",
      `${t("Fulfillment status")}: ${optionLabel(fulfillmentOptions, filters.fulfillmentStatus)}`,
      "fulfillmentStatus",
      "all"
    )
  if (filters.dateFrom || filters.dateTo)
    activeFilters.push({
      id: "dates",
      label: `${t("Date range")}: ${filters.dateFrom || "…"} – ${filters.dateTo || "…"}`,
      onRemove: () =>
        applyAndReset(() =>
          setFilters((current) => ({ ...current, dateFrom: "", dateTo: "" }))
        ),
    })
  if (filters.segment !== "all")
    addFilter(
      "segment",
      `${t("Customer segment")}: ${optionLabel(localizedSegmentOptions, filters.segment)}`,
      "segment",
      "all"
    )
  if (filters.region !== "all")
    addFilter(
      "region",
      `${t("Region")}: ${optionLabel(localizedRegionOptions, filters.region)}`,
      "region",
      "all"
    )
  if (filters.currency !== "all")
    activeFilters.push({
      id: "currency",
      label: `${t("Currency")}: ${filters.currency}`,
      onRemove: () =>
        applyAndReset(() =>
          setFilters((current) => ({
            ...current,
            currency: "all",
            minimumAmount: null,
            maximumAmount: null,
          }))
        ),
    })
  if (filters.minimumAmount !== null || filters.maximumAmount !== null)
    activeFilters.push({
      id: "amount",
      label: `${t("Amount range")}: ${filters.minimumAmount ?? "…"} – ${filters.maximumAmount ?? "…"}`,
      onRemove: () =>
        applyAndReset(() =>
          setFilters((current) => ({
            ...current,
            minimumAmount: null,
            maximumAmount: null,
          }))
        ),
    })
  if (filters.sort !== "updated-desc")
    addFilter(
      "sort",
      `${t("Sort")}: ${optionLabel(localizedSortOptions, filters.sort)}`,
      "sort",
      "updated-desc"
    )

  const clearAllFilters = () => applyAndReset(() => setFilters(initialFilters))
  const desktopEmpty = {
    ...filters,
    dateFrom: "",
    dateTo: "",
    segment: "all" as const,
    region: "all" as const,
    currency: "all" as const,
    minimumAmount: null,
    maximumAmount: null,
    sort: "updated-desc" as const,
  }
  const mobileEmpty = { ...initialFilters, query: filters.query }

  const renderFilterFields = (
    draft: OrderListFilters,
    setDraft: Dispatch<SetStateAction<OrderListFilters>>,
    includePrimary: boolean,
    errors: OperationalFilterErrors,
    getErrorProps: (field: string) => {
      "aria-invalid": true | undefined
      "aria-describedby": string | undefined
    }
  ) => (
    <div
      className={`grid grid-cols-1 gap-3 ${includePrimary ? "" : "sm:grid-cols-2"}`}
    >
      {includePrimary ? (
        <>
          <OrderFilterField label={t("Order status")}>
            <OperationalToolbarSelect
              label={t("Order status")}
              value={draft.status}
              options={statusOptions}
              className="w-full"
              onValueChange={(status) =>
                setDraft((current) => ({
                  ...current,
                  status: status as OrderListFilters["status"],
                }))
              }
            />
          </OrderFilterField>
          <OrderFilterField label={t("Payment status")}>
            <OperationalToolbarSelect
              label={t("Payment status")}
              value={draft.paymentStatus}
              options={paymentOptions}
              className="w-full"
              onValueChange={(paymentStatus) =>
                setDraft((current) => ({
                  ...current,
                  paymentStatus:
                    paymentStatus as OrderListFilters["paymentStatus"],
                }))
              }
            />
          </OrderFilterField>
          <OrderFilterField label={t("Fulfillment status")}>
            <OperationalToolbarSelect
              label={t("Fulfillment status")}
              value={draft.fulfillmentStatus}
              options={fulfillmentOptions}
              className="w-full"
              onValueChange={(fulfillmentStatus) =>
                setDraft((current) => ({
                  ...current,
                  fulfillmentStatus:
                    fulfillmentStatus as OrderListFilters["fulfillmentStatus"],
                }))
              }
            />
          </OrderFilterField>
        </>
      ) : null}
      <OrderFilterField label={t("From date")}>
        <input
          aria-label={t("From date")}
          type="date"
          className="h-9 rounded-md border bg-background px-2"
          value={draft.dateFrom}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              dateFrom: event.target.value,
            }))
          }
          {...getErrorProps("dateRange")}
        />
      </OrderFilterField>
      <OrderFilterField label={t("To date")}>
        <input
          aria-label={t("To date")}
          type="date"
          className="h-9 rounded-md border bg-background px-2"
          value={draft.dateTo}
          onChange={(event) =>
            setDraft((current) => ({ ...current, dateTo: event.target.value }))
          }
          {...getErrorProps("dateRange")}
        />
      </OrderFilterField>
      {errors.dateRange ? (
        <p
          id={getErrorProps("dateRange")["aria-describedby"]}
          className={`text-xs text-destructive ${includePrimary ? "" : "sm:col-span-2"}`}
        >
          {errors.dateRange}
        </p>
      ) : null}
      <OrderFilterField label={t("Customer segment")}>
        <OperationalToolbarSelect
          label={t("Customer segment")}
          value={draft.segment}
          options={localizedSegmentOptions}
          className="w-full"
          onValueChange={(segment) =>
            setDraft((current) => ({
              ...current,
              segment: segment as OrderListFilters["segment"],
            }))
          }
        />
      </OrderFilterField>
      <OrderFilterField label={t("Region")}>
        <OperationalToolbarSelect
          label={t("Region")}
          value={draft.region}
          options={localizedRegionOptions}
          className="w-full"
          onValueChange={(region) =>
            setDraft((current) => ({
              ...current,
              region: region as OrderListFilters["region"],
            }))
          }
        />
      </OrderFilterField>
      <OrderFilterField label={t("Currency")}>
        <OperationalToolbarSelect
          label={t("Currency")}
          value={draft.currency}
          options={localizedCurrencyOptions}
          className="w-full"
          onValueChange={(currency) =>
            setDraft((current) => ({
              ...current,
              currency: currency as OrderListFilters["currency"],
            }))
          }
        />
      </OrderFilterField>
      <OrderFilterField label={t("Minimum amount")}>
        <input
          aria-label={t("Minimum amount")}
          type="number"
          min="0"
          className="h-9 rounded-md border bg-background px-2"
          value={draft.minimumAmount ?? ""}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              minimumAmount: event.target.value
                ? Number(event.target.value)
                : null,
            }))
          }
          {...getErrorProps("amountRange")}
        />
      </OrderFilterField>
      <OrderFilterField label={t("Maximum amount")}>
        <input
          aria-label={t("Maximum amount")}
          type="number"
          min="0"
          className="h-9 rounded-md border bg-background px-2"
          value={draft.maximumAmount ?? ""}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              maximumAmount: event.target.value
                ? Number(event.target.value)
                : null,
            }))
          }
          {...getErrorProps("amountRange")}
        />
      </OrderFilterField>
      {errors.amountRange ? (
        <p
          id={getErrorProps("amountRange")["aria-describedby"]}
          className={`text-xs text-destructive ${includePrimary ? "" : "sm:col-span-2"}`}
        >
          {errors.amountRange}
        </p>
      ) : null}
      <OrderFilterField label={t("Sort")}>
        <OperationalToolbarSelect
          label={t("Sort")}
          value={draft.sort}
          options={localizedSortOptions}
          className="w-full"
          onValueChange={(sort) =>
            setDraft((current) => ({
              ...current,
              sort: sort as OrderListFilters["sort"],
            }))
          }
        />
      </OrderFilterField>
    </div>
  )

  return (
    <PageLayout
      ariaLabel={t("Orders")}
      pageName="Orders"
      status={
        <Badge variant="outline">
          {isLoading
            ? t("Loading…")
            : hasError
              ? "—"
              : t("{{count}} orders", { count: commerce.orders.length })}
        </Badge>
      }
    >
      <GridBlock className="col-span-12 md:col-span-6 lg:col-span-3">
        <OperationalMetricCard
          loading={isLoading}
          label={t("Total orders")}
          value={hasError ? undefined : rows.length}
          detail={t("Historical order snapshots")}
          unavailableDetail={t("Data unavailable")}
        />
      </GridBlock>
      <GridBlock className="col-span-12 md:col-span-6 lg:col-span-3">
        <OperationalMetricCard
          loading={isLoading}
          label={t("Processing orders")}
          value={
            hasError
              ? undefined
              : rows.filter(({ order }) => order.status === "processing").length
          }
          detail={t("Currently being prepared")}
          unavailableDetail={t("Data unavailable")}
        />
      </GridBlock>
      <GridBlock className="col-span-12 md:col-span-6 lg:col-span-3">
        <OperationalMetricCard
          loading={isLoading}
          tone="critical"
          label={t("Action needed")}
          value={
            hasError
              ? undefined
              : rows.filter(({ order }) => order.status === "action_needed")
                  .length
          }
          detail={t("Requires operational review")}
          unavailableDetail={t("Data unavailable")}
        />
      </GridBlock>
      <GridBlock className="col-span-12 md:col-span-6 lg:col-span-3">
        <OperationalMetricCard
          loading={isLoading}
          tone="critical"
          label={t("Failed payments")}
          value={
            hasError
              ? undefined
              : rows.filter(({ order }) => order.paymentStatus === "failed")
                  .length
          }
          detail={t("Status only; no payment identifiers")}
          unavailableDetail={t("Data unavailable")}
        />
      </GridBlock>
      <GridBlock>
        <section aria-label={t("Order list")}>
          <OperationalListPanel
            toolbar={
              <OperationalFilterToolbar
                search={
                  <OperationalToolbarSearch
                    label={t("Search orders")}
                    value={filters.query}
                    placeholder={t("Search order number")}
                    onChange={(query) => updateFilter("query", query)}
                  />
                }
                primaryFilters={
                  <>
                    <OperationalToolbarSelect
                      label={t("Order status")}
                      value={filters.status}
                      options={statusOptions}
                      onValueChange={(value) =>
                        updateFilter(
                          "status",
                          value as OrderListFilters["status"]
                        )
                      }
                    />
                    <OperationalToolbarSelect
                      label={t("Payment status")}
                      value={filters.paymentStatus}
                      options={paymentOptions}
                      onValueChange={(value) =>
                        updateFilter(
                          "paymentStatus",
                          value as OrderListFilters["paymentStatus"]
                        )
                      }
                    />
                    <OperationalToolbarSelect
                      label={t("Fulfillment status")}
                      value={filters.fulfillmentStatus}
                      options={fulfillmentOptions}
                      onValueChange={(value) =>
                        updateFilter(
                          "fulfillmentStatus",
                          value as OrderListFilters["fulfillmentStatus"]
                        )
                      }
                    />
                  </>
                }
                moreFilter={
                  <OperationalFilterPopover
                    value={filters}
                    emptyValue={desktopEmpty}
                    validate={validateFilters}
                    showErrorSummary={false}
                    onApply={(next) => applyAndReset(() => setFilters(next))}
                    trigger={
                      <OperationalFilterButton
                        kind="more"
                        label={t("More filters")}
                        activeCount={
                          activeFilters.filter(
                            ({ id }) =>
                              ![
                                "query",
                                "status",
                                "payment",
                                "fulfillment",
                              ].includes(id)
                          ).length
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
                    {({ draft, setDraft, errors, getErrorProps }) =>
                      renderFilterFields(
                        draft,
                        setDraft,
                        false,
                        errors,
                        getErrorProps
                      )
                    }
                  </OperationalFilterPopover>
                }
                mobileFilter={
                  <OperationalFilterPopover
                    value={filters}
                    emptyValue={mobileEmpty}
                    validate={validateFilters}
                    showErrorSummary={false}
                    onApply={(next) => applyAndReset(() => setFilters(next))}
                    trigger={
                      <OperationalFilterButton
                        kind="filter"
                        label={t("Filter orders")}
                        activeCount={
                          activeFilters.filter(({ id }) => id !== "query")
                            .length
                        }
                      />
                    }
                    title={t("Filter orders")}
                    labels={{
                      clear: t("Clear"),
                      cancel: t("Cancel"),
                      apply: t("Apply"),
                    }}
                  >
                    {({ draft, setDraft, errors, getErrorProps }) =>
                      renderFilterFields(
                        draft,
                        setDraft,
                        true,
                        errors,
                        getErrorProps
                      )
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
              commerce.state === "ready" && model.total > 0 ? (
                <OperationalPagination
                  page={model.page}
                  pageCount={model.pageCount}
                  ariaLabel={t("Order pagination")}
                  previousLabel={t("Previous page")}
                  nextLabel={t("Next page")}
                  onPageChange={setPage}
                />
              ) : undefined
            }
          >
            {hasError ? (
              <OperationalListState kind="error">
                {t("Order data is unavailable.")}
              </OperationalListState>
            ) : isLoading ? (
              <OperationalListState kind="loading">
                {t("Loading orders…")}
              </OperationalListState>
            ) : model.total === 0 ? (
              <OperationalListState kind="empty">
                {t("No orders match the current filters.")}
              </OperationalListState>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1180px] text-left text-sm">
                  <thead className="border-b bg-muted/60 text-xs text-muted-foreground">
                    <tr>
                      <th className="p-3">{t("Order")}</th>
                      <th>{t("Created")}</th>
                      <th>{t("Customer")}</th>
                      <th>{t("Status")}</th>
                      <th>{t("Payment")}</th>
                      <th>{t("Fulfillment")}</th>
                      <th>{t("Total")}</th>
                      <th className="pr-3 text-right">{t("Actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {model.items.map((row) => (
                      <OrderQuickRow
                        key={row.order.id}
                        row={row}
                        open={expandedId === row.order.id}
                        language={language}
                        onToggle={() =>
                          setExpandedId(
                            expandedId === row.order.id ? null : row.order.id
                          )
                        }
                        onDetail={() => navigate(`/orders/${row.order.id}`)}
                        onReturn={(returnId) =>
                          navigate(`/returns/${returnId}`)
                        }
                        returnsState={returns.state}
                        t={t}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </OperationalListPanel>
        </section>
      </GridBlock>
    </PageLayout>
  )
}

export const OrderDetailPage = () => {
  const { orderId } = useParams()
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { commerce, products, returns } = useVoltageAdmin()
  const language = i18n.resolvedLanguage ?? "en"
  if (commerce.state === "error")
    return (
      <PageLayout ariaLabel={t("Order details")} pageName="Orders">
        <OrderState message={t("Order data is unavailable.")} />
      </PageLayout>
    )
  if (commerce.state !== "ready")
    return (
      <PageLayout ariaLabel={t("Order details")} pageName="Orders">
        <OrderState message={t("Loading orders…")} />
      </PageLayout>
    )
  const order = commerce.orders.find((item) => item.id === orderId)
  if (!order)
    return (
      <PageLayout
        ariaLabel={t("Order details")}
        pageName="Order detail"
        breadcrumb={[
          { label: "Orders", to: "/orders" },
          { label: "Not found" },
        ]}
      >
        <OrderState message={t("Order was not found.")} />
      </PageLayout>
    )
  const lines = commerce.orderLines.filter((line) => line.orderId === order.id)
  const customer = commerce.customers.find(
    (item) => item.id === order.customerId
  )
  const relatedReturns =
    returns.state === "ready" ? relatedReturnsFor(order.id, returns.rmas) : []
  const currentProductIds = new Set(
    products.products.map((product) => product.id)
  )
  return (
    <PageLayout
      ariaLabel={t("Order details")}
      pageName={order.id}
      translatePageName={false}
      breadcrumb={[
        { label: "Orders", to: "/orders" },
        { label: order.id, translate: false },
      ]}
      status={
        <Badge className={statusTone(order.status)}>
          {t(orderStatusLabels[order.status])}
        </Badge>
      }
      actions={
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ChevronLeft />
            {t("Back")}
          </Button>
          {order.status === "delivered" && order.paymentStatus === "paid" ? (
            <Button
              onClick={() =>
                navigate(`/returns/add?orderId=${encodeURIComponent(order.id)}`)
              }
            >
              {t("Create return")}
            </Button>
          ) : null}
        </div>
      }
    >
      <GridBlock className="col-span-12 md:col-span-6 lg:col-span-3">
        <OperationalMetricCard
          label={t("Order total")}
          value={formatMoney(order.amounts.total, language)}
          detail={order.amounts.total.currency}
        />
      </GridBlock>
      <GridBlock className="col-span-12 md:col-span-6 lg:col-span-3">
        <OperationalMetricCard
          label={t("Item quantity")}
          value={lines.reduce((sum, line) => sum + line.quantity, 0)}
          detail={t("Historical snapshot")}
        />
      </GridBlock>
      <GridBlock className="col-span-12 md:col-span-6 lg:col-span-3">
        <OperationalMetricCard
          label={t("Timeline events")}
          value={order.timeline.length}
          detail={formatDate(order.updatedAt, language)}
        />
      </GridBlock>
      <GridBlock className="col-span-12 md:col-span-6 lg:col-span-3">
        <OperationalMetricCard
          label={t("Related returns")}
          value={returns.state === "ready" ? relatedReturns.length : undefined}
          loading={["idle", "loading"].includes(returns.state)}
          unavailableDetail={t("Returns data is unavailable.")}
          detail={t("RMA records")}
        />
      </GridBlock>
      <GridBlock className="col-span-12 lg:col-span-8">
        <Card>
          <CardHeader className="border-b">
            <CardTitle>{t("Historical items")}</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b bg-muted/60 text-xs">
                <tr>
                  <th className="p-3">{t("Product")}</th>
                  <th>{t("SKU")}</th>
                  <th>{t("Unit price")}</th>
                  <th>{t("Quantity")}</th>
                  <th>{t("Discount")}</th>
                  <th>{t("Subtotal")}</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.id} className="border-b">
                    <td className="p-3">
                      <Button
                        variant="link"
                        className="h-auto p-0"
                        disabled={!currentProductIds.has(line.productId)}
                        onClick={() => navigate(`/products/${line.productId}`)}
                      >
                        {line.title}
                      </Button>
                      {!currentProductIds.has(line.productId) ? (
                        <small className="block text-muted-foreground">
                          {t("Current product unavailable; snapshot retained.")}
                        </small>
                      ) : null}
                    </td>
                    <td>{line.sku}</td>
                    <td>{formatMoney(line.unitPrice, language)}</td>
                    <td>{line.quantity}</td>
                    <td>{formatMoney(line.discount, language)}</td>
                    <td className="font-semibold">
                      {formatMoney(line.subtotal, language)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </GridBlock>
      <GridBlock className="col-span-12 lg:col-span-4">
        <Card className="h-full">
          <CardHeader>
            <CardTitle>{t("Amount breakdown")}</CardTitle>
          </CardHeader>
          <CardContent>
            <MoneyBreakdown order={order} language={language} t={t} />
          </CardContent>
        </Card>
      </GridBlock>
      <GridBlock className="col-span-12 lg:col-span-4">
        <Card className="h-full">
          <CardHeader>
            <CardTitle>{t("Masked customer")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {customer ? (
              <>
                <p>
                  <strong>{maskedName(customer.contact.fullName)}</strong>
                </p>
                <p>{maskedEmail(customer.contact.email)}</p>
                <p>{maskedPhone(customer.contact.phone)}</p>
                <p>{t(customer.region)} · TW</p>
                <Button
                  variant="outline"
                  onClick={() => navigate(`/customers/${customer.id}`)}
                >
                  {t("Open customer")}
                </Button>
              </>
            ) : (
              <p className="text-muted-foreground">
                {t("Customer record is unavailable.")}
              </p>
            )}
          </CardContent>
        </Card>
      </GridBlock>
      <GridBlock className="col-span-12 lg:col-span-4">
        <Card className="h-full">
          <CardHeader>
            <CardTitle>{t("Payment and fulfillment")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <div>
              <span className="block text-muted-foreground">
                {t("Payment status")}
              </span>
              <Badge className={statusTone(order.paymentStatus)}>
                {t(paymentStatusLabels[order.paymentStatus])}
              </Badge>
            </div>
            <div>
              <span className="block text-muted-foreground">
                {t("Payment method")}
              </span>
              <strong>
                {t(order.paymentMethodCategory)} · {t("Masked")}
              </strong>
            </div>
            <div>
              <span className="block text-muted-foreground">
                {t("Fulfillment status")}
              </span>
              <Badge className={statusTone(order.fulfillmentStatus)}>
                {t(fulfillmentLabels[order.fulfillmentStatus])}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </GridBlock>
      <GridBlock className="col-span-12 lg:col-span-4">
        <Card className="h-full">
          <CardHeader>
            <CardTitle>{t("Related returns")}</CardTitle>
          </CardHeader>
          <CardContent>
            {returns.state === "error" ? (
              <p className="text-muted-foreground">
                {t("Returns data is unavailable.")}
              </p>
            ) : returns.state !== "ready" ? (
              <p className="text-muted-foreground">{t("Loading returns…")}</p>
            ) : relatedReturns.length ? (
              <div className="flex flex-wrap gap-2">
                {relatedReturns.map((item) => (
                  <Button
                    key={item.id}
                    variant="outline"
                    onClick={() => navigate(`/returns/${item.id}`)}
                  >
                    {item.id} · {t(item.reason)}
                  </Button>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">{t("No related return.")}</p>
            )}
          </CardContent>
        </Card>
      </GridBlock>
      <GridBlock>
        <Card>
          <CardHeader className="border-b">
            <CardTitle>{t("Order timeline")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="grid gap-3">
              {order.timeline.map((event) => (
                <li
                  key={event.id}
                  className="flex items-center justify-between border-b pb-2 text-sm"
                >
                  <span>{t(event.status)}</span>
                  <time>{formatDate(event.occurredAt, language)}</time>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </GridBlock>
    </PageLayout>
  )
}
