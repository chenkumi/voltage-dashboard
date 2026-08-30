import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Search,
} from "lucide-react"
import { useMemo, useState, type ReactNode } from "react"
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
import { GridBlock, PageLayout } from "../voltage-admin-page-layout"
import { useVoltageAdmin } from "../voltage-admin"
import {
  createOrderListModel,
  type OrderListFilters,
  type OrderListRow,
} from "./order-list-model"
import { relatedCasesFor } from "./order-relations"

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

const OrderKpi = ({
  label,
  value,
  detail,
}: {
  label: string
  value: ReactNode
  detail: string
}) => (
  <Card size="sm" className="h-full">
    <CardHeader>
      <CardTitle className="text-muted-foreground">{label}</CardTitle>
    </CardHeader>
    <CardContent>
      <strong className="text-2xl tabular-nums">{value}</strong>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </CardContent>
  </Card>
)

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
  onCase,
  t,
}: {
  row: OrderListRow
  open: boolean
  language: string
  onToggle: () => void
  onDetail: () => void
  onCase: (caseId: string) => void
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
                {t("Related cases")}
              </p>
              {row.relatedCaseIds.length ? (
                <div className="flex flex-wrap gap-2">
                  {row.relatedCaseIds.map((caseId) => (
                    <Button
                      key={caseId}
                      size="sm"
                      variant="outline"
                      onClick={() => onCase(caseId)}
                    >
                      {caseId}
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("No related operations case.")}
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

export const OrdersPage = () => {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { commerce, workflow } = useVoltageAdmin()
  const [filters, setFilters] = useState(initialFilters)
  const [page, setPage] = useState(1)
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
      relatedCaseIds: relatedCasesFor(order.id, workflow.cases).map(
        (item) => item.id
      ),
    }))
  }, [commerce, workflow.cases])
  const invalidFilters =
    (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) ||
    (filters.minimumAmount !== null && filters.minimumAmount < 0) ||
    (filters.maximumAmount !== null && filters.maximumAmount < 0) ||
    (filters.minimumAmount !== null &&
      filters.maximumAmount !== null &&
      filters.minimumAmount > filters.maximumAmount)
  const model = useMemo(
    () =>
      invalidFilters
        ? { items: [], total: 0, page: 1, pageCount: 1 }
        : createOrderListModel(rows, filters, page, PAGE_SIZE),
    [filters, invalidFilters, page, rows]
  )
  const updateFilter = <K extends keyof OrderListFilters>(
    key: K,
    value: OrderListFilters[K]
  ) => {
    setPage(1)
    setFilters((current) => ({ ...current, [key]: value }))
  }
  const activeFilterCount = [
    filters.query,
    filters.dateFrom,
    filters.dateTo,
    filters.status !== "all",
    filters.paymentStatus !== "all",
    filters.fulfillmentStatus !== "all",
    filters.segment !== "all",
    filters.region !== "all",
    filters.currency !== "all",
    filters.minimumAmount !== null,
    filters.maximumAmount !== null,
  ].filter(Boolean).length
  const hasError = commerce.state === "error"
  const isLoading = !hasError && commerce.state !== "ready"

  return (
    <PageLayout
      ariaLabel={t("Orders")}
      pageName="Orders"
      status={
        <Badge variant="outline">
          {t("{{count}} orders", { count: commerce.orders.length })}
        </Badge>
      }
    >
      <GridBlock className="col-span-6 lg:col-span-3">
        <OrderKpi
          label={t("Total orders")}
          value={rows.length}
          detail={t("Historical order snapshots")}
        />
      </GridBlock>
      <GridBlock className="col-span-6 lg:col-span-3">
        <OrderKpi
          label={t("Processing orders")}
          value={
            rows.filter(({ order }) => order.status === "processing").length
          }
          detail={t("Currently being prepared")}
        />
      </GridBlock>
      <GridBlock className="col-span-6 lg:col-span-3">
        <OrderKpi
          label={t("Action needed")}
          value={
            rows.filter(({ order }) => order.status === "action_needed").length
          }
          detail={t("Requires operational review")}
        />
      </GridBlock>
      <GridBlock className="col-span-6 lg:col-span-3">
        <OrderKpi
          label={t("Failed payments")}
          value={
            rows.filter(({ order }) => order.paymentStatus === "failed").length
          }
          detail={t("Status only; no payment identifiers")}
        />
      </GridBlock>
      <GridBlock>
        <Card size="sm">
          <CardContent className="grid gap-2 pt-1 md:grid-cols-2 xl:grid-cols-5">
            <label className="relative xl:col-span-2">
              <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
              <span className="sr-only">{t("Search orders")}</span>
              <input
                type="search"
                className="h-9 w-full rounded-md border bg-background pr-2 pl-8"
                placeholder={t("Search order number")}
                value={filters.query}
                onChange={(event) => updateFilter("query", event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-xs">
              <span>{t("From date")}</span>
              <input
                type="date"
                className="h-9 rounded-md border bg-background px-2"
                value={filters.dateFrom}
                onChange={(event) =>
                  updateFilter("dateFrom", event.target.value)
                }
              />
            </label>
            <label className="grid gap-1 text-xs">
              <span>{t("To date")}</span>
              <input
                type="date"
                className="h-9 rounded-md border bg-background px-2"
                value={filters.dateTo}
                onChange={(event) => updateFilter("dateTo", event.target.value)}
              />
            </label>
            <select
              aria-label={t("Order status")}
              className="h-9 self-end rounded-md border bg-background px-2"
              value={filters.status}
              onChange={(event) =>
                updateFilter(
                  "status",
                  event.target.value as OrderListFilters["status"]
                )
              }
            >
              <option value="all">{t("All order statuses")}</option>
              {Object.entries(orderStatusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {t(label)}
                </option>
              ))}
            </select>
            <select
              aria-label={t("Payment status")}
              className="h-9 rounded-md border bg-background px-2"
              value={filters.paymentStatus}
              onChange={(event) =>
                updateFilter(
                  "paymentStatus",
                  event.target.value as OrderListFilters["paymentStatus"]
                )
              }
            >
              <option value="all">{t("All payment statuses")}</option>
              {Object.entries(paymentStatusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {t(label)}
                </option>
              ))}
            </select>
            <select
              aria-label={t("Fulfillment status")}
              className="h-9 rounded-md border bg-background px-2"
              value={filters.fulfillmentStatus}
              onChange={(event) =>
                updateFilter(
                  "fulfillmentStatus",
                  event.target.value as OrderListFilters["fulfillmentStatus"]
                )
              }
            >
              <option value="all">{t("All fulfillment statuses")}</option>
              {Object.entries(fulfillmentLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {t(label)}
                </option>
              ))}
            </select>
            <select
              aria-label={t("Customer segment")}
              className="h-9 rounded-md border bg-background px-2"
              value={filters.segment}
              onChange={(event) =>
                updateFilter(
                  "segment",
                  event.target.value as OrderListFilters["segment"]
                )
              }
            >
              <option value="all">{t("All customer segments")}</option>
              <option value="new">{t("new")}</option>
              <option value="returning">{t("returning")}</option>
              <option value="vip">{t("vip")}</option>
            </select>
            <select
              aria-label={t("Region")}
              className="h-9 rounded-md border bg-background px-2"
              value={filters.region}
              onChange={(event) =>
                updateFilter(
                  "region",
                  event.target.value as OrderListFilters["region"]
                )
              }
            >
              <option value="all">{t("All regions")}</option>
              {(["north", "central", "south", "east"] as const).map(
                (region) => (
                  <option key={region} value={region}>
                    {t(region)}
                  </option>
                )
              )}
            </select>
            <select
              aria-label={t("Currency")}
              className="h-9 rounded-md border bg-background px-2"
              value={filters.currency}
              onChange={(event) =>
                updateFilter(
                  "currency",
                  event.target.value as OrderListFilters["currency"]
                )
              }
            >
              <option value="all">{t("All currencies")}</option>
              <option value="TWD">TWD</option>
              <option value="USD">USD</option>
            </select>
            <select
              aria-label={t("Sort")}
              className="h-9 rounded-md border bg-background px-2"
              value={filters.sort}
              onChange={(event) =>
                updateFilter(
                  "sort",
                  event.target.value as OrderListFilters["sort"]
                )
              }
            >
              <option value="updated-desc">{t("Recently updated")}</option>
              <option value="created-desc">{t("Newest orders")}</option>
              <option value="amount-asc">{t("Amount low to high")}</option>
              <option value="amount-desc">{t("Amount high to low")}</option>
            </select>
            <label className="grid gap-1 text-xs">
              <span>{t("Minimum amount")}</span>
              <input
                type="number"
                min="0"
                className="h-9 rounded-md border bg-background px-2"
                value={filters.minimumAmount ?? ""}
                onChange={(event) =>
                  updateFilter(
                    "minimumAmount",
                    event.target.value ? Number(event.target.value) : null
                  )
                }
              />
            </label>
            <label className="grid gap-1 text-xs">
              <span>{t("Maximum amount")}</span>
              <input
                type="number"
                min="0"
                className="h-9 rounded-md border bg-background px-2"
                value={filters.maximumAmount ?? ""}
                onChange={(event) =>
                  updateFilter(
                    "maximumAmount",
                    event.target.value ? Number(event.target.value) : null
                  )
                }
              />
            </label>
          </CardContent>
          {activeFilterCount ? (
            <div className="flex items-center gap-2 border-t px-3 py-2 text-xs">
              <span className="text-muted-foreground">
                {t("Active filters")}
              </span>
              <Badge variant="secondary">{activeFilterCount}</Badge>
              <Button
                size="sm"
                variant="ghost"
                className="h-7"
                onClick={() => {
                  setFilters(initialFilters)
                  setPage(1)
                }}
              >
                {t("Clear filters")}
              </Button>
            </div>
          ) : null}
        </Card>
      </GridBlock>
      {hasError ? (
        <OrderState message={t("Order data is unavailable.")} />
      ) : null}
      {isLoading ? <OrderState message={t("Loading orders…")} /> : null}
      {commerce.state === "ready" && invalidFilters ? (
        <OrderState message={t("Order filters are invalid.")} />
      ) : null}
      {commerce.state === "ready" && !invalidFilters ? (
        <GridBlock>
          <Card size="sm" className="overflow-hidden">
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
                      onCase={(caseId) =>
                        navigate(`/operations-cases?caseId=${caseId}`)
                      }
                      t={t}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {model.total === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                {t("No orders match the current filters.")}
              </div>
            ) : null}
            <footer className="flex items-center justify-between border-t p-3 text-sm">
              <span>{t("{{count}} results", { count: model.total })}</span>
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  disabled={model.page <= 1}
                  onClick={() => setPage((value) => value - 1)}
                  aria-label={t("Previous page")}
                >
                  <ChevronLeft />
                </Button>
                <span>
                  {model.page} / {model.pageCount}
                </span>
                <Button
                  size="icon"
                  variant="outline"
                  disabled={model.page >= model.pageCount}
                  onClick={() => setPage((value) => value + 1)}
                  aria-label={t("Next page")}
                >
                  <ChevronRight />
                </Button>
              </div>
            </footer>
          </Card>
        </GridBlock>
      ) : null}
    </PageLayout>
  )
}

export const OrderDetailPage = () => {
  const { orderId } = useParams()
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { commerce, products, workflow } = useVoltageAdmin()
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
  const cases = relatedCasesFor(order.id, workflow.cases)
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
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ChevronLeft />
          {t("Back")}
        </Button>
      }
    >
      <GridBlock className="col-span-6 lg:col-span-3">
        <OrderKpi
          label={t("Order total")}
          value={formatMoney(order.amounts.total, language)}
          detail={order.amounts.total.currency}
        />
      </GridBlock>
      <GridBlock className="col-span-6 lg:col-span-3">
        <OrderKpi
          label={t("Item quantity")}
          value={lines.reduce((sum, line) => sum + line.quantity, 0)}
          detail={t("Historical snapshot")}
        />
      </GridBlock>
      <GridBlock className="col-span-6 lg:col-span-3">
        <OrderKpi
          label={t("Timeline events")}
          value={order.timeline.length}
          detail={formatDate(order.updatedAt, language)}
        />
      </GridBlock>
      <GridBlock className="col-span-6 lg:col-span-3">
        <OrderKpi
          label={t("Related cases")}
          value={cases.length}
          detail={t("Operations references")}
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
            <CardTitle>{t("Related cases")}</CardTitle>
          </CardHeader>
          <CardContent>
            {cases.length ? (
              <div className="flex flex-wrap gap-2">
                {cases.map((item) => (
                  <Button
                    key={item.id}
                    variant="outline"
                    onClick={() =>
                      navigate(`/operations-cases?caseId=${item.id}`)
                    }
                  >
                    {item.id} · {t(item.reasonCode)}
                  </Button>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">
                {t("No related operations case.")}
              </p>
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
