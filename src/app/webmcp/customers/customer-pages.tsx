import { ChevronDown, ChevronLeft, ChevronUp, Plus } from "lucide-react"
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
  type OperationalFilterErrors,
  type OperationalSelectOption,
} from "../operational-ui"
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

const customerStatusOptions: OperationalSelectOption[] = [
  { value: "all", label: "All customer statuses" },
  ...CUSTOMER_STATUSES.map((value) => ({ value, label: value })),
]

const customerSegmentOptions: OperationalSelectOption[] = [
  { value: "all", label: "All customer segments" },
  ...CUSTOMER_SEGMENTS.map((value) => ({ value, label: value })),
]

const customerRegionOptions: OperationalSelectOption[] = [
  { value: "all", label: "All regions" },
  ...CUSTOMER_REGIONS.map((value) => ({ value, label: value })),
]

const customerPeriodOptions: OperationalSelectOption[] = [
  { value: "all", label: "All activity periods" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "365d", label: "Last 365 days" },
]

const customerCurrencyOptions: OperationalSelectOption[] = [
  { value: "USD", label: "USD" },
  { value: "TWD", label: "TWD" },
]

const customerSortOptions: OperationalSelectOption[] = [
  { value: "activity-desc", label: "Recent activity first" },
  { value: "created-desc", label: "Newest customers" },
  { value: "spend-desc", label: "Highest spend" },
  { value: "orders-desc", label: "Most orders" },
  { value: "id-asc", label: "Customer ID" },
]

const CustomerFilterField = ({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) => (
  <label className="grid gap-1.5 text-xs font-medium">
    <span>{label}</span>
    {children}
  </label>
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
  const { page, setPage, applyAndReset } = useOperationalPagination()
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
  const model = useMemo(
    () => createCustomerListModel(rows, filters, page, PAGE_SIZE),
    [filters, page, rows]
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

  const commitFilters = (next: CustomerListFilters) => {
    applyAndReset(() => {
      setLocalFilters(next)
      setSearchParams(
        serializeSafeCustomerUrlFilters({
          status: next.status,
          segment: next.segment,
          region: next.region,
          period: next.period,
        }),
        { replace: true }
      )
    })
  }
  const updateFilter = <K extends keyof CustomerListFilters>(
    key: K,
    value: CustomerListFilters[K]
  ) => {
    commitFilters({ ...filters, [key]: value })
  }
  const hasError = commerce.state === "error"
  const isLoading = !hasError && commerce.state !== "ready"

  const localizeOptions = (options: readonly OperationalSelectOption[]) =>
    options.map((option) => ({ ...option, label: t(option.label) }))
  const statusOptions = localizeOptions(customerStatusOptions)
  const segmentOptions = localizeOptions(customerSegmentOptions)
  const regionOptions = localizeOptions(customerRegionOptions)
  const periodOptions = localizeOptions(customerPeriodOptions)
  const currencyOptions = localizeOptions(customerCurrencyOptions)
  const sortOptions = localizeOptions(customerSortOptions)
  const localizedTagOptions = [
    { value: "all", label: t("All tags") },
    ...tagOptions.map((value) => ({
      value,
      label: (CUSTOMER_SAFE_TAGS as readonly string[]).includes(value)
        ? t(value)
        : value,
    })),
  ]
  const optionLabel = (
    options: readonly OperationalSelectOption[],
    value: string
  ) => options.find((option) => option.value === value)?.label ?? value

  const validateFilters = (
    draft: CustomerListFilters
  ): OperationalFilterErrors => {
    if (
      (draft.minimumSpend !== null && draft.minimumSpend < 0) ||
      (draft.maximumSpend !== null && draft.maximumSpend < 0)
    ) {
      return { spendRange: t("Spend amounts must be zero or greater.") }
    }
    if (
      draft.minimumSpend !== null &&
      draft.maximumSpend !== null &&
      draft.minimumSpend > draft.maximumSpend
    ) {
      return {
        spendRange: t("Minimum spend must not exceed maximum spend."),
      }
    }
    return {}
  }

  const resultStart = model.total === 0 ? 0 : (model.page - 1) * PAGE_SIZE + 1
  const resultEnd = model.total === 0 ? 0 : resultStart + model.items.length - 1
  const activeFilters: ActiveOperationalFilter[] = []
  const addFilter = <K extends keyof CustomerListFilters>(
    id: string,
    label: string,
    key: K,
    resetValue: CustomerListFilters[K]
  ) =>
    activeFilters.push({
      id,
      label,
      onRemove: () => updateFilter(key, resetValue),
    })
  if (filters.query) addFilter("query", `${t("Search")}: •••`, "query", "")
  if (filters.status !== "all")
    addFilter(
      "status",
      `${t("Customer status")}: ${optionLabel(statusOptions, filters.status)}`,
      "status",
      "all"
    )
  if (filters.segment !== "all")
    addFilter(
      "segment",
      `${t("Customer segment")}: ${optionLabel(segmentOptions, filters.segment)}`,
      "segment",
      "all"
    )
  if (filters.region !== "all")
    addFilter(
      "region",
      `${t("Region")}: ${optionLabel(regionOptions, filters.region)}`,
      "region",
      "all"
    )
  if (filters.tag !== "all")
    addFilter(
      "tag",
      `${t("Tag")}: ${optionLabel(localizedTagOptions, filters.tag)}`,
      "tag",
      "all"
    )
  if (filters.period !== "all")
    addFilter(
      "period",
      `${t("Recent activity")}: ${optionLabel(periodOptions, filters.period)}`,
      "period",
      "all"
    )
  if (filters.currency !== "USD")
    activeFilters.push({
      id: "currency",
      label: `${t("Spend currency")}: ${filters.currency}`,
      onRemove: () =>
        commitFilters({
          ...filters,
          currency: "USD",
          minimumSpend: null,
          maximumSpend: null,
        }),
    })
  if (filters.minimumSpend !== null || filters.maximumSpend !== null)
    activeFilters.push({
      id: "spend",
      label: `${t("Spend range")}: ${filters.minimumSpend ?? "…"} – ${filters.maximumSpend ?? "…"}`,
      onRemove: () =>
        commitFilters({
          ...filters,
          minimumSpend: null,
          maximumSpend: null,
        }),
    })
  if (filters.sort !== "activity-desc")
    addFilter(
      "sort",
      `${t("Sort")}: ${optionLabel(sortOptions, filters.sort)}`,
      "sort",
      "activity-desc"
    )

  const clearAllFilters = () => commitFilters(initialFilters)
  const desktopEmpty = {
    ...filters,
    tag: "all" as const,
    period: "all" as const,
    currency: "USD" as const,
    minimumSpend: null,
    maximumSpend: null,
    sort: "activity-desc" as const,
  }
  const mobileEmpty = { ...initialFilters, query: filters.query }

  const renderFilterFields = (
    draft: CustomerListFilters,
    setDraft: Dispatch<SetStateAction<CustomerListFilters>>,
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
          <CustomerFilterField label={t("Customer status")}>
            <OperationalToolbarSelect
              label={t("Customer status")}
              value={draft.status}
              options={statusOptions}
              className="w-full"
              onValueChange={(status) =>
                setDraft((current) => ({
                  ...current,
                  status: status as CustomerListFilters["status"],
                }))
              }
            />
          </CustomerFilterField>
          <CustomerFilterField label={t("Customer segment")}>
            <OperationalToolbarSelect
              label={t("Customer segment")}
              value={draft.segment}
              options={segmentOptions}
              className="w-full"
              onValueChange={(segment) =>
                setDraft((current) => ({
                  ...current,
                  segment: segment as CustomerListFilters["segment"],
                }))
              }
            />
          </CustomerFilterField>
          <CustomerFilterField label={t("Region")}>
            <OperationalToolbarSelect
              label={t("Region")}
              value={draft.region}
              options={regionOptions}
              className="w-full"
              onValueChange={(region) =>
                setDraft((current) => ({
                  ...current,
                  region: region as CustomerListFilters["region"],
                }))
              }
            />
          </CustomerFilterField>
        </>
      ) : null}
      <CustomerFilterField label={t("Tag")}>
        <OperationalToolbarSelect
          label={t("Tag")}
          value={draft.tag}
          options={localizedTagOptions}
          className="w-full"
          onValueChange={(tag) => setDraft((current) => ({ ...current, tag }))}
        />
      </CustomerFilterField>
      <CustomerFilterField label={t("Recent activity")}>
        <OperationalToolbarSelect
          label={t("Recent activity")}
          value={draft.period}
          options={periodOptions}
          className="w-full"
          onValueChange={(period) =>
            setDraft((current) => ({
              ...current,
              period: period as CustomerListFilters["period"],
            }))
          }
        />
      </CustomerFilterField>
      <CustomerFilterField label={t("Spend currency")}>
        <OperationalToolbarSelect
          label={t("Spend currency")}
          value={draft.currency}
          options={currencyOptions}
          className="w-full"
          onValueChange={(currency) =>
            setDraft((current) => ({
              ...current,
              currency: currency as CustomerListFilters["currency"],
            }))
          }
        />
      </CustomerFilterField>
      <CustomerFilterField label={t("Minimum spend")}>
        <input
          aria-label={t("Minimum spend")}
          type="number"
          min="0"
          className="h-9 rounded-md border bg-background px-2"
          value={draft.minimumSpend ?? ""}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              minimumSpend: event.target.value
                ? Number(event.target.value)
                : null,
            }))
          }
          {...getErrorProps("spendRange")}
        />
      </CustomerFilterField>
      <CustomerFilterField label={t("Maximum spend")}>
        <input
          aria-label={t("Maximum spend")}
          type="number"
          min="0"
          className="h-9 rounded-md border bg-background px-2"
          value={draft.maximumSpend ?? ""}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              maximumSpend: event.target.value
                ? Number(event.target.value)
                : null,
            }))
          }
          {...getErrorProps("spendRange")}
        />
      </CustomerFilterField>
      {errors.spendRange ? (
        <p
          id={getErrorProps("spendRange")["aria-describedby"]}
          className={`text-xs text-destructive ${includePrimary ? "" : "sm:col-span-2"}`}
        >
          {errors.spendRange}
        </p>
      ) : null}
      <CustomerFilterField label={t("Sort")}>
        <OperationalToolbarSelect
          label={t("Sort")}
          value={draft.sort}
          options={sortOptions}
          className="w-full"
          onValueChange={(sort) =>
            setDraft((current) => ({
              ...current,
              sort: sort as CustomerListFilters["sort"],
            }))
          }
        />
      </CustomerFilterField>
    </div>
  )

  return (
    <PageLayout
      ariaLabel={t("Customers")}
      pageName="Customers"
      status={
        <Badge variant="outline">
          {isLoading
            ? t("Loading…")
            : hasError
              ? "—"
              : t("{{count}} customers", { count: commerce.customers.length })}
        </Badge>
      }
      actions={
        <Button onClick={() => navigate("/customers/add")}>
          <Plus /> {t("Add customer")}
        </Button>
      }
    >
      <GridBlock className="col-span-12 md:col-span-6 lg:col-span-3">
        <OperationalMetricCard
          loading={isLoading}
          label={t("Total customers")}
          value={hasError ? undefined : rows.length}
          detail={t("All customer records")}
          unavailableDetail={t("Data unavailable")}
        />
      </GridBlock>
      <GridBlock className="col-span-12 md:col-span-6 lg:col-span-3">
        <OperationalMetricCard
          loading={isLoading}
          tone="positive"
          label={t("Active customers")}
          value={
            hasError
              ? undefined
              : rows.filter(({ customer }) => customer.status === "active")
                  .length
          }
          detail={t("Available for service")}
          unavailableDetail={t("Data unavailable")}
        />
      </GridBlock>
      <GridBlock className="col-span-12 md:col-span-6 lg:col-span-3">
        <OperationalMetricCard
          loading={isLoading}
          label={t("VIP customers")}
          value={
            hasError
              ? undefined
              : rows.filter(({ customer }) => customer.segment === "vip").length
          }
          detail={t("High-value segment")}
          unavailableDetail={t("Data unavailable")}
        />
      </GridBlock>
      <GridBlock className="col-span-12 md:col-span-6 lg:col-span-3">
        <OperationalMetricCard
          loading={isLoading}
          tone="warning"
          label={t("Suspended customers")}
          value={
            hasError
              ? undefined
              : rows.filter(({ customer }) => customer.status === "suspended")
                  .length
          }
          detail={t("Excluded from active totals")}
          unavailableDetail={t("Data unavailable")}
        />
      </GridBlock>
      <GridBlock>
        <section aria-label={t("Customer list")}>
          <OperationalListPanel
            toolbar={
              <OperationalFilterToolbar
                search={
                  <OperationalToolbarSearch
                    label={t("Search customers")}
                    value={filters.query}
                    placeholder={t("Name, Email, or customer ID")}
                    onChange={(query) => updateFilter("query", query)}
                  />
                }
                primaryFilters={
                  <>
                    <OperationalToolbarSelect
                      label={t("Customer status")}
                      value={filters.status}
                      options={statusOptions}
                      onValueChange={(status) =>
                        updateFilter(
                          "status",
                          status as CustomerListFilters["status"]
                        )
                      }
                    />
                    <OperationalToolbarSelect
                      label={t("Customer segment")}
                      value={filters.segment}
                      options={segmentOptions}
                      onValueChange={(segment) =>
                        updateFilter(
                          "segment",
                          segment as CustomerListFilters["segment"]
                        )
                      }
                    />
                    <OperationalToolbarSelect
                      label={t("Region")}
                      value={filters.region}
                      options={regionOptions}
                      onValueChange={(region) =>
                        updateFilter(
                          "region",
                          region as CustomerListFilters["region"]
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
                    onApply={commitFilters}
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
                                "segment",
                                "region",
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
                    onApply={commitFilters}
                    trigger={
                      <OperationalFilterButton
                        kind="filter"
                        label={t("Filter customers")}
                        activeCount={
                          activeFilters.filter(({ id }) => id !== "query")
                            .length
                        }
                      />
                    }
                    title={t("Filter customers")}
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
                  ariaLabel={t("Customer pagination")}
                  previousLabel={t("Previous page")}
                  nextLabel={t("Next page")}
                  onPageChange={setPage}
                />
              ) : undefined
            }
          >
            {hasError ? (
              <OperationalListState kind="error">
                {t("Customer data is unavailable.")}
              </OperationalListState>
            ) : isLoading ? (
              <OperationalListState kind="loading">
                {t("Loading customers…")}
              </OperationalListState>
            ) : model.total === 0 ? (
              <OperationalListState kind="empty">
                {t("No customers match the current filters.")}
              </OperationalListState>
            ) : (
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
            )}
          </OperationalListPanel>
        </section>
      </GridBlock>
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
      <GridBlock className="col-span-12 md:col-span-6 lg:col-span-3">
        <OperationalMetricCard
          label={t("Orders")}
          value={row.orderCount}
          detail={t("Historical orders retained")}
        />
      </GridBlock>
      <GridBlock className="col-span-12 md:col-span-6 lg:col-span-3">
        <OperationalMetricCard
          label={t("Notes")}
          value={notes.length}
          detail={t("UI-only internal notes")}
        />
      </GridBlock>
      <GridBlock className="col-span-12 md:col-span-6 lg:col-span-3">
        <OperationalMetricCard
          label={t("Activities")}
          value={activities.length}
          detail={t("Lifecycle history")}
        />
      </GridBlock>
      <GridBlock className="col-span-12 md:col-span-6 lg:col-span-3">
        <OperationalMetricCard
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
