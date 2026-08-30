import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Plus,
  Search,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  CUSTOMER_REGIONS,
  CUSTOMER_SAFE_TAGS,
  CUSTOMER_SEGMENTS,
  CUSTOMER_STATUSES,
  type Customer,
  type CustomerNote,
  type Money,
} from "../commerce-data/types"
import { GridBlock, PageLayout } from "../voltage-admin-page-layout"
import { useVoltageAdmin } from "../voltage-admin"
import {
  buildCustomerRows,
  createCustomerListModel,
  parseSafeCustomerUrlFilters,
  serializeSafeCustomerUrlFilters,
  type CustomerListFilters,
  type CustomerListRow,
} from "./customer-list-model"

const PAGE_SIZE = 15

const formatMoney = (money: Money, language: string) =>
  new Intl.NumberFormat(language === "zh-TW" ? "zh-TW" : "en-US", {
    style: "currency",
    currency: money.currency,
    currencyDisplay: "code",
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

const initialFilters: CustomerListFilters = {
  query: "",
  status: "all",
  segment: "all",
  region: "all",
  tag: "all",
  period: "all",
  currency: "USD",
  minimumSpend: null,
  maximumSpend: null,
  sort: "activity-desc",
}

const CustomerState = ({ message }: { message: string }) => (
  <GridBlock>
    <Card>
      <CardContent className="flex min-h-40 items-center justify-center text-muted-foreground">
        {message}
      </CardContent>
    </Card>
  </GridBlock>
)

const CustomerKpi = ({
  label,
  value,
  detail,
}: {
  label: string
  value: number
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

const CustomerQuickRow = ({
  row,
  open,
  language,
  onToggle,
  onOpen,
  t,
}: {
  row: CustomerListRow
  open: boolean
  language: string
  onToggle: () => void
  onOpen: () => void
  t: (key: string, options?: Record<string, unknown>) => string
}) => (
  <>
    <tr className="border-b transition-colors hover:bg-muted/35">
      <td className="p-3">
        <strong className="block">{row.customer.id}</strong>
        <small className="text-muted-foreground">
          {maskedName(row.customer.contact.fullName)} ·{" "}
          {maskedEmail(row.customer.contact.email)}
        </small>
      </td>
      <td>
        <Badge variant="outline">{t(row.customer.status)}</Badge>
      </td>
      <td>
        <span className="block">{t(row.customer.segment)}</span>
        <small className="text-muted-foreground">
          {t(row.customer.region)}
        </small>
      </td>
      <td>
        <div className="flex max-w-52 flex-wrap gap-1">
          {row.customer.tags
            .filter((tag) => tag.kind === "safe")
            .map((tag) => (
              <Badge key={tag.value} variant="secondary">
                {t(tag.value)}
              </Badge>
            ))}
        </div>
      </td>
      <td className="tabular-nums">{row.orderCount}</td>
      <td className="text-xs tabular-nums">
        <span className="block">
          {formatMoney(
            { amount: row.lifetimeSpend.USD, currency: "USD" },
            language
          )}
        </span>
        <span className="text-muted-foreground">
          {formatMoney(
            { amount: row.lifetimeSpend.TWD, currency: "TWD" },
            language
          )}
        </span>
      </td>
      <td className="text-xs">
        {row.lastPurchaseAt
          ? formatDate(row.lastPurchaseAt, language)
          : t("No orders")}
      </td>
      <td className="pr-3">
        <div className="flex justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={`customer-quick-${row.customer.id}`}
          >
            {open ? <ChevronUp /> : <ChevronDown />}
            {t("Quick view")}
          </Button>
          <Button size="sm" variant="outline" onClick={onOpen}>
            {t("Details")}
          </Button>
        </div>
      </td>
    </tr>
    {open ? (
      <tr className="border-b bg-muted/20">
        <td
          id={`customer-quick-${row.customer.id}`}
          colSpan={8}
          className="p-3"
        >
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <p className="text-xs font-semibold text-muted-foreground">
                {t("Masked contact")}
              </p>
              <p className="text-sm">
                {maskedPhone(row.customer.contact.phone)}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">
                {t("Recent activity")}
              </p>
              <p className="text-sm">
                {formatDate(row.lastActivityAt, language)}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">
                {t("Custom tags")}
              </p>
              <p className="text-sm text-muted-foreground">
                {row.customer.tags
                  .filter((tag) => tag.kind === "custom")
                  .map(({ value }) => value)
                  .join(", ") || t("None")}
              </p>
            </div>
          </div>
        </td>
      </tr>
    ) : null}
  </>
)

export const CustomersPage = () => {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { commerce } = useVoltageAdmin()
  const [localFilters, setLocalFilters] =
    useState<CustomerListFilters>(initialFilters)
  const safeUrlFilters = useMemo(
    () => parseSafeCustomerUrlFilters(searchParams),
    [searchParams]
  )
  const filters = useMemo(
    () => ({ ...localFilters, ...safeUrlFilters }),
    [localFilters, safeUrlFilters]
  )
  const safeFilterKey =
    serializeSafeCustomerUrlFilters(safeUrlFilters).toString()
  const [pagination, setPagination] = useState({
    page: 1,
    safeFilterKey,
  })
  const page = pagination.safeFilterKey === safeFilterKey ? pagination.page : 1
  const setPage = (next: number | ((current: number) => number)) =>
    setPagination((current) => {
      const currentPage =
        current.safeFilterKey === safeFilterKey ? current.page : 1
      return {
        page: typeof next === "function" ? next(currentPage) : next,
        safeFilterKey,
      }
    })
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const language = i18n.resolvedLanguage ?? "en"
  const rows = useMemo(
    () =>
      buildCustomerRows(
        commerce.customers,
        commerce.orders,
        commerce.activities
      ),
    [commerce.activities, commerce.customers, commerce.orders]
  )
  const invalidFilters =
    (filters.minimumSpend !== null && filters.minimumSpend < 0) ||
    (filters.maximumSpend !== null && filters.maximumSpend < 0) ||
    (filters.minimumSpend !== null &&
      filters.maximumSpend !== null &&
      filters.minimumSpend > filters.maximumSpend)
  const model = useMemo(
    () =>
      invalidFilters
        ? { items: [], total: 0, page: 1, pageCount: 1 }
        : createCustomerListModel(rows, filters, page, PAGE_SIZE),
    [filters, invalidFilters, page, rows]
  )
  const tagOptions = useMemo(
    () =>
      [
        ...new Set(
          commerce.customers.flatMap(({ tags }) =>
            tags.map(({ value }) => value)
          )
        ),
      ].sort(),
    [commerce.customers]
  )

  useEffect(() => {
    const safeParams = serializeSafeCustomerUrlFilters(safeUrlFilters)
    if (safeParams.toString() !== searchParams.toString()) {
      setSearchParams(safeParams, { replace: true })
    }
  }, [safeUrlFilters, searchParams, setSearchParams])

  const updateFilter = <K extends keyof CustomerListFilters>(
    key: K,
    value: CustomerListFilters[K]
  ) => {
    setPage(1)
    if (["status", "segment", "region", "period"].includes(key)) {
      setSearchParams(
        serializeSafeCustomerUrlFilters({
          ...safeUrlFilters,
          [key]: value,
        }),
        { replace: true }
      )
      return
    }
    setLocalFilters((current) => ({ ...current, [key]: value }))
  }
  const activeFilterCount = [
    filters.query,
    filters.status !== "all",
    filters.segment !== "all",
    filters.region !== "all",
    filters.tag !== "all",
    filters.period !== "all",
    filters.minimumSpend !== null,
    filters.maximumSpend !== null,
  ].filter(Boolean).length
  const hasError = commerce.state === "error"
  const isLoading = !hasError && commerce.state !== "ready"

  return (
    <PageLayout
      ariaLabel={t("Customers")}
      pageName="Customers"
      status={
        <Badge variant="outline">
          {t("{{count}} customers", { count: commerce.customers.length })}
        </Badge>
      }
      actions={
        <Button onClick={() => navigate("/customers/add")}>
          <Plus /> {t("Add customer")}
        </Button>
      }
    >
      <GridBlock className="col-span-6 lg:col-span-3">
        <CustomerKpi
          label={t("Total customers")}
          value={rows.length}
          detail={t("All customer records")}
        />
      </GridBlock>
      <GridBlock className="col-span-6 lg:col-span-3">
        <CustomerKpi
          label={t("Active customers")}
          value={
            rows.filter(({ customer }) => customer.status === "active").length
          }
          detail={t("Available for service")}
        />
      </GridBlock>
      <GridBlock className="col-span-6 lg:col-span-3">
        <CustomerKpi
          label={t("VIP customers")}
          value={
            rows.filter(({ customer }) => customer.segment === "vip").length
          }
          detail={t("High-value segment")}
        />
      </GridBlock>
      <GridBlock className="col-span-6 lg:col-span-3">
        <CustomerKpi
          label={t("Suspended customers")}
          value={
            rows.filter(({ customer }) => customer.status === "suspended")
              .length
          }
          detail={t("Excluded from active totals")}
        />
      </GridBlock>
      <GridBlock>
        <Card size="sm">
          <CardContent className="grid gap-2 pt-1 md:grid-cols-2 xl:grid-cols-5">
            <label className="relative xl:col-span-2">
              <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
              <span className="sr-only">{t("Search customers")}</span>
              <input
                type="search"
                className="h-9 w-full rounded-md border bg-background pr-2 pl-8"
                placeholder={t("Name, Email, or customer ID")}
                value={filters.query}
                onChange={(event) => updateFilter("query", event.target.value)}
              />
            </label>
            <select
              aria-label={t("Customer status")}
              className="h-9 rounded-md border bg-background px-2"
              value={filters.status}
              onChange={(event) =>
                updateFilter(
                  "status",
                  event.target.value as CustomerListFilters["status"]
                )
              }
            >
              <option value="all">{t("All customer statuses")}</option>
              {CUSTOMER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(status)}
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
                  event.target.value as CustomerListFilters["segment"]
                )
              }
            >
              <option value="all">{t("All customer segments")}</option>
              {CUSTOMER_SEGMENTS.map((segment) => (
                <option key={segment} value={segment}>
                  {t(segment)}
                </option>
              ))}
            </select>
            <select
              aria-label={t("Region")}
              className="h-9 rounded-md border bg-background px-2"
              value={filters.region}
              onChange={(event) =>
                updateFilter(
                  "region",
                  event.target.value as CustomerListFilters["region"]
                )
              }
            >
              <option value="all">{t("All regions")}</option>
              {CUSTOMER_REGIONS.map((region) => (
                <option key={region} value={region}>
                  {t(region)}
                </option>
              ))}
            </select>
            <select
              aria-label={t("Tag")}
              className="h-9 rounded-md border bg-background px-2"
              value={filters.tag}
              onChange={(event) =>
                updateFilter(
                  "tag",
                  event.target.value as CustomerListFilters["tag"]
                )
              }
            >
              <option value="all">{t("All tags")}</option>
              {tagOptions.map((tag) => (
                <option key={tag} value={tag}>
                  {(CUSTOMER_SAFE_TAGS as readonly string[]).includes(tag)
                    ? t(tag)
                    : tag}
                </option>
              ))}
            </select>
            <select
              aria-label={t("Recent activity")}
              className="h-9 rounded-md border bg-background px-2"
              value={filters.period}
              onChange={(event) =>
                updateFilter(
                  "period",
                  event.target.value as CustomerListFilters["period"]
                )
              }
            >
              <option value="all">{t("All activity periods")}</option>
              <option value="30d">{t("Last 30 days")}</option>
              <option value="90d">{t("Last 90 days")}</option>
              <option value="365d">{t("Last 365 days")}</option>
            </select>
            <select
              aria-label={t("Spend currency")}
              className="h-9 rounded-md border bg-background px-2"
              value={filters.currency}
              onChange={(event) =>
                updateFilter(
                  "currency",
                  event.target.value as CustomerListFilters["currency"]
                )
              }
            >
              <option value="USD">USD</option>
              <option value="TWD">TWD</option>
            </select>
            <label className="grid gap-1 text-xs">
              <span>{t("Minimum spend")}</span>
              <input
                type="number"
                min="0"
                className="h-9 rounded-md border bg-background px-2"
                value={filters.minimumSpend ?? ""}
                onChange={(event) =>
                  updateFilter(
                    "minimumSpend",
                    event.target.value ? Number(event.target.value) : null
                  )
                }
              />
            </label>
            <label className="grid gap-1 text-xs">
              <span>{t("Maximum spend")}</span>
              <input
                type="number"
                min="0"
                className="h-9 rounded-md border bg-background px-2"
                value={filters.maximumSpend ?? ""}
                onChange={(event) =>
                  updateFilter(
                    "maximumSpend",
                    event.target.value ? Number(event.target.value) : null
                  )
                }
              />
            </label>
            <select
              aria-label={t("Sort")}
              className="h-9 rounded-md border bg-background px-2"
              value={filters.sort}
              onChange={(event) =>
                updateFilter(
                  "sort",
                  event.target.value as CustomerListFilters["sort"]
                )
              }
            >
              <option value="activity-desc">
                {t("Recent activity first")}
              </option>
              <option value="created-desc">{t("Newest customers")}</option>
              <option value="spend-desc">{t("Highest spend")}</option>
              <option value="orders-desc">{t("Most orders")}</option>
              <option value="id-asc">{t("Customer ID")}</option>
            </select>
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
                  setLocalFilters(initialFilters)
                  setSearchParams(new URLSearchParams(), { replace: true })
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
        <CustomerState message={t("Customer data is unavailable.")} />
      ) : null}
      {isLoading ? <CustomerState message={t("Loading customers…")} /> : null}
      {commerce.state === "ready" && invalidFilters ? (
        <CustomerState message={t("Customer filters are invalid.")} />
      ) : null}
      {commerce.state === "ready" && !invalidFilters ? (
        <GridBlock>
          <Card size="sm" className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1240px] text-left text-sm">
                <thead className="border-b bg-muted/60 text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3">{t("Customer")}</th>
                    <th>{t("Status")}</th>
                    <th>{t("Segment and region")}</th>
                    <th>{t("Safe tags")}</th>
                    <th>{t("Orders")}</th>
                    <th>{t("Lifetime spend")}</th>
                    <th>{t("Last purchase")}</th>
                    <th className="pr-3 text-right">{t("Actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {model.items.map((row) => (
                    <CustomerQuickRow
                      key={row.customer.id}
                      row={row}
                      open={expandedId === row.customer.id}
                      language={language}
                      onToggle={() =>
                        setExpandedId(
                          expandedId === row.customer.id
                            ? null
                            : row.customer.id
                        )
                      }
                      onOpen={() => navigate(`/customers/${row.customer.id}`)}
                      t={t}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {model.total === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                {t("No customers match the current filters.")}
              </div>
            ) : null}
            <footer className="flex items-center justify-between border-t p-3 text-sm">
              <span>{t("{{count}} results", { count: model.total })}</span>
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  aria-label={t("Previous page")}
                  disabled={model.page <= 1}
                  onClick={() => setPage((current) => current - 1)}
                >
                  <ChevronLeft />
                </Button>
                <span>
                  {model.page} / {model.pageCount}
                </span>
                <Button
                  size="icon"
                  variant="outline"
                  aria-label={t("Next page")}
                  disabled={model.page >= model.pageCount}
                  onClick={() => setPage((current) => current + 1)}
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

const CustomerNoteEditor = ({ note }: { note: CustomerNote }) => {
  const { t } = useTranslation()
  const { commerceRepository } = useVoltageAdmin()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(note.text)
  const [error, setError] = useState("")
  const save = async () => {
    setError("")
    try {
      await commerceRepository.updateNote(note.id, text)
      setEditing(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("Save failed."))
    }
  }
  return (
    <li className="rounded-md border p-3 text-sm">
      {editing ? (
        <textarea
          aria-label={t("Edit note")}
          className="min-h-20 w-full rounded-md border bg-background p-2"
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={2000}
        />
      ) : (
        <p className="whitespace-pre-wrap">{note.text}</p>
      )}
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
      <div className="mt-2 flex items-center justify-between gap-2">
        <small className="text-muted-foreground">{note.updatedAt}</small>
        {editing ? (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setText(note.text)
                setEditing(false)
              }}
            >
              {t("Cancel")}
            </Button>
            <Button size="sm" onClick={() => void save()}>
              {t("Save note")}
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            {t("Edit note")}
          </Button>
        )}
      </div>
    </li>
  )
}

const CustomerStatusDialog = ({
  customer,
  onClose,
}: {
  customer: Customer
  onClose: () => void
}) => {
  const { t } = useTranslation()
  const { commerceRepository } = useVoltageAdmin()
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const suspending = customer.status === "active"
  const confirm = async () => {
    setBusy(true)
    setError("")
    try {
      if (suspending)
        await commerceRepository.suspendCustomer(customer.id, reason)
      else await commerceRepository.restoreCustomer(customer.id, reason)
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("Save failed."))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-label={t(suspending ? "Suspend customer" : "Restore customer")}
        className="w-full max-w-md rounded-xl border bg-background p-4 shadow-xl"
      >
        <h2 className="font-semibold">
          {t(suspending ? "Suspend customer" : "Restore customer")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("Historical orders will remain unchanged.")}
        </p>
        <label className="mt-4 grid gap-1 text-sm">
          <span>{t("Reason")}</span>
          <select
            className="h-9 rounded-md border bg-background px-2"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          >
            <option value="">{t("Select reason")}</option>
            {suspending ? (
              <>
                <option value="manual_review">{t("Manual review")}</option>
                <option value="policy_violation">
                  {t("Policy violation")}
                </option>
                <option value="customer_request">
                  {t("Customer request")}
                </option>
              </>
            ) : (
              <option value="review_completed">{t("Review completed")}</option>
            )}
          </select>
        </label>
        {error ? (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <footer className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button disabled={!reason || busy} onClick={() => void confirm()}>
            {busy
              ? t("Saving…")
              : t(suspending ? "Confirm suspension" : "Confirm restoration")}
          </Button>
        </footer>
      </section>
    </div>
  )
}

export const CustomerDetailPage = () => {
  const { customerId } = useParams()
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { commerce, commerceRepository } = useVoltageAdmin()
  const [noteText, setNoteText] = useState("")
  const [noteError, setNoteError] = useState("")
  const [statusOpen, setStatusOpen] = useState(false)
  const language = i18n.resolvedLanguage ?? "en"
  const customer = commerce.customers.find(({ id }) => id === customerId)
  if (commerce.state === "error") {
    return (
      <PageLayout ariaLabel={t("Customer details")} pageName="Customers">
        <CustomerState message={t("Customer data is unavailable.")} />
      </PageLayout>
    )
  }
  if (commerce.state !== "ready") {
    return (
      <PageLayout ariaLabel={t("Customer details")} pageName="Customers">
        <CustomerState message={t("Loading customer…")} />
      </PageLayout>
    )
  }
  if (!customer) {
    return (
      <PageLayout
        ariaLabel={t("Customer details")}
        pageName="Customer detail"
        breadcrumb={[
          { label: "Customers", to: "/customers" },
          { label: "Not found" },
        ]}
      >
        <CustomerState message={t("Customer was not found.")} />
      </PageLayout>
    )
  }
  const rows = buildCustomerRows(
    [customer],
    commerce.orders.filter(({ customerId: id }) => id === customer.id),
    commerce.activities.filter(({ customerId: id }) => id === customer.id)
  )
  const row = rows[0]
  const notes = commerce.notes.filter(
    ({ customerId: id }) => id === customer.id
  )
  const activities = commerce.activities.filter(
    ({ customerId: id }) => id === customer.id
  )
  const addNote = async () => {
    setNoteError("")
    try {
      await commerceRepository.addNote(customer.id, noteText)
      setNoteText("")
    } catch (caught) {
      setNoteError(caught instanceof Error ? caught.message : t("Save failed."))
    }
  }
  return (
    <PageLayout
      ariaLabel={t("Customer details")}
      pageName={customer.id}
      translatePageName={false}
      breadcrumb={[
        { label: "Customers", to: "/customers" },
        { label: customer.id, translate: false },
      ]}
      status={<Badge variant="outline">{t(customer.status)}</Badge>}
      actions={
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ChevronLeft /> {t("Back")}
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate(`/customers/edit/${customer.id}`)}
          >
            {t("Edit customer")}
          </Button>
          <Button
            variant={customer.status === "active" ? "destructive" : "default"}
            onClick={() => setStatusOpen(true)}
          >
            {t(
              customer.status === "active"
                ? "Suspend customer"
                : "Restore customer"
            )}
          </Button>
        </div>
      }
    >
      <GridBlock className="col-span-6 lg:col-span-3">
        <CustomerKpi
          label={t("Orders")}
          value={row.orderCount}
          detail={t("Historical orders retained")}
        />
      </GridBlock>
      <GridBlock className="col-span-6 lg:col-span-3">
        <CustomerKpi
          label={t("Notes")}
          value={notes.length}
          detail={t("UI-only internal notes")}
        />
      </GridBlock>
      <GridBlock className="col-span-6 lg:col-span-3">
        <CustomerKpi
          label={t("Activities")}
          value={activities.length}
          detail={t("Lifecycle history")}
        />
      </GridBlock>
      <GridBlock className="col-span-6 lg:col-span-3">
        <CustomerKpi
          label={t("Safe tags")}
          value={customer.tags.filter(({ kind }) => kind === "safe").length}
          detail={t("Reporting-eligible tags")}
        />
      </GridBlock>
      <GridBlock className="col-span-12 lg:col-span-5">
        <Card className="h-full">
          <CardHeader>
            <CardTitle>{t("Customer information")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <strong>{customer.contact.fullName}</strong>
            <span>{customer.contact.email}</span>
            <span>{customer.contact.phone}</span>
            <span>
              {customer.contact.addressLine}, {customer.contact.city}{" "}
              {customer.contact.postalCode}, {customer.contact.countryCode}
            </span>
            <span>
              {t(customer.segment)} · {t(customer.region)}
            </span>
            <small className="text-muted-foreground">
              {t("Updated")} {formatDate(customer.updatedAt, language)}
            </small>
          </CardContent>
        </Card>
      </GridBlock>
      <GridBlock className="col-span-12 lg:col-span-3">
        <Card className="h-full">
          <CardHeader>
            <CardTitle>{t("Tags")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {customer.tags.map((tag) => (
              <Badge
                key={`${tag.kind}-${tag.value}`}
                variant={tag.kind === "safe" ? "secondary" : "outline"}
              >
                {tag.kind === "safe" ? t(tag.value) : tag.value}
              </Badge>
            ))}
            {!customer.tags.length ? (
              <span className="text-sm text-muted-foreground">{t("None")}</span>
            ) : null}
          </CardContent>
        </Card>
      </GridBlock>
      <GridBlock className="col-span-12 lg:col-span-4">
        <Card className="h-full">
          <CardHeader>
            <CardTitle>{t("Lifetime spend")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            <strong>
              {formatMoney(
                { amount: row.lifetimeSpend.USD, currency: "USD" },
                language
              )}
            </strong>
            <strong>
              {formatMoney(
                { amount: row.lifetimeSpend.TWD, currency: "TWD" },
                language
              )}
            </strong>
            <small className="text-muted-foreground">
              {t("Native currencies are not combined.")}
            </small>
          </CardContent>
        </Card>
      </GridBlock>
      <GridBlock className="col-span-12 lg:col-span-7">
        <Card>
          <CardHeader className="border-b">
            <CardTitle>{t("Customer orders")}</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="border-b bg-muted/60 text-xs">
                <tr>
                  <th className="p-3">{t("Order")}</th>
                  <th>{t("Created")}</th>
                  <th>{t("Status")}</th>
                  <th>{t("Payment")}</th>
                  <th>{t("Total")}</th>
                </tr>
              </thead>
              <tbody>
                {row.orders.map((order) => (
                  <tr key={order.id} className="border-b">
                    <td className="p-3">
                      <Button
                        variant="link"
                        className="h-auto p-0"
                        onClick={() => navigate(`/orders/${order.id}`)}
                      >
                        {order.id}
                      </Button>
                    </td>
                    <td>{formatDate(order.createdAt, language)}</td>
                    <td>{t(order.status)}</td>
                    <td>{t(order.paymentStatus)}</td>
                    <td>{formatMoney(order.amounts.total, language)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!row.orders.length ? (
            <CardContent className="text-muted-foreground">
              {t("No orders")}
            </CardContent>
          ) : null}
        </Card>
      </GridBlock>
      <GridBlock className="col-span-12 lg:col-span-5">
        <Card>
          <CardHeader className="border-b">
            <CardTitle>{t("Customer notes")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 pt-4">
            <label className="grid gap-1 text-sm">
              <span>{t("New note")}</span>
              <textarea
                className="min-h-24 rounded-md border bg-background p-2"
                value={noteText}
                onChange={(event) => setNoteText(event.target.value)}
                maxLength={2000}
              />
            </label>
            {noteError ? (
              <p role="alert" className="text-sm text-destructive">
                {noteError}
              </p>
            ) : null}
            <Button disabled={!noteText.trim()} onClick={() => void addNote()}>
              {t("Add note")}
            </Button>
            <ul className="grid gap-2">
              {notes.map((note) => (
                <CustomerNoteEditor key={note.id} note={note} />
              ))}
            </ul>
          </CardContent>
        </Card>
      </GridBlock>
      <GridBlock>
        <Card>
          <CardHeader className="border-b">
            <CardTitle>{t("Activity history")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="grid gap-2">
              {activities.map((activity) => (
                <li
                  key={activity.id}
                  className="flex justify-between gap-3 border-b py-2 text-sm"
                >
                  <span>
                    {t(activity.type)}
                    {activity.reasonCode ? ` · ${t(activity.reasonCode)}` : ""}
                  </span>
                  <time>{formatDate(activity.occurredAt, language)}</time>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </GridBlock>
      {statusOpen ? (
        <CustomerStatusDialog
          customer={customer}
          onClose={() => setStatusOpen(false)}
        />
      ) : null}
    </PageLayout>
  )
}
