import { ChevronLeft } from "lucide-react"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, useParams } from "react-router-dom"
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
import {
  approvalWaitingHours,
  createRefundApprovalListModel,
  createRefundApprovalRows,
  type RefundApprovalListFilters,
} from "./refund-approval-list-model"
import { APPROVAL_STATUSES, REFUND_STATUSES } from "./types"

const PAGE_SIZE = 15
const fieldClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
const textAreaClass = `${fieldClass} min-h-24 py-2`
const initialFilters: RefundApprovalListFilters = {
  query: "",
  status: "all",
  refundStatus: "all",
  currency: "all",
  waiting: "all",
  sort: "newest",
}

const formatMoney = (amount: number, currency: string, language: string) =>
  new Intl.NumberFormat(language, { style: "currency", currency }).format(
    amount
  )

const formatWaitingTime = (
  hours: number,
  t: (key: string, options?: object) => string
) =>
  hours < 24
    ? t("{{count}} hours", { count: Math.floor(hours) })
    : t("{{count}} days", { count: Math.floor(hours / 24) })

const toneFor = (status: string) =>
  status === "approved" || status === "succeeded"
    ? "bg-emerald-100 text-emerald-800"
    : status === "rejected" || status === "failed" || status === "invalidated"
      ? "bg-red-100 text-red-800"
      : status === "returned"
        ? "bg-amber-100 text-amber-800"
        : "bg-slate-100 text-slate-700"

const options = (
  values: readonly string[],
  allLabel: string,
  t: (key: string) => string
): readonly OperationalSelectOption[] => [
  { value: "all", label: t(allLabel) },
  ...values.map((value) => ({ value, label: t(value) })),
]

export const RefundApprovalsPage = () => {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { returns } = useVoltageAdmin()
  const [now] = useState(() => new Date().toISOString())
  const [filters, setFilters] = useState(initialFilters)
  const { page, setPage, applyAndReset } = useOperationalPagination()
  const rows = useMemo(
    () =>
      createRefundApprovalRows(
        returns.approvals,
        returns.rmas,
        returns.calculations
      ),
    [returns.approvals, returns.calculations, returns.rmas]
  )
  const model = useMemo(
    () => createRefundApprovalListModel(rows, filters, page, PAGE_SIZE, now),
    [filters, now, page, rows]
  )
  const currencies = [
    ...new Set(rows.map(({ calculation }) => calculation.total.currency)),
  ]
  const update = <K extends keyof RefundApprovalListFilters>(
    key: K,
    value: RefundApprovalListFilters[K]
  ) =>
    applyAndReset(() => setFilters((current) => ({ ...current, [key]: value })))
  const filterFields = (mode: "more" | "filter") => (
    <OperationalFilterPopover
      title={t("Filter refund approvals")}
      description={t("Refine the approval queue.")}
      value={filters}
      emptyValue={initialFilters}
      onApply={(values) => applyAndReset(() => setFilters(values))}
      trigger={
        <OperationalFilterButton
          kind={mode}
          label={t(
            mode === "more" ? "More filters" : "Filter refund approvals"
          )}
          activeCount={activeFilters.filter(({ id }) => id !== "query").length}
        />
      }
      labels={{ clear: t("Clear"), cancel: t("Cancel"), apply: t("Apply") }}
    >
      {({ draft, setDraft }) => (
        <div className="grid gap-3 sm:grid-cols-2">
          {mode === "filter" ? (
            <>
              <OperationalToolbarSelect
                label={t("Approval status")}
                value={draft.status}
                options={options(APPROVAL_STATUSES, "All approval states", t)}
                onValueChange={(value) =>
                  setDraft({ ...draft, status: value as typeof draft.status })
                }
              />
              <OperationalToolbarSelect
                label={t("Waiting time")}
                value={draft.waiting}
                options={options(
                  ["under-24h", "24-48h", "over-48h"],
                  "All waiting times",
                  t
                )}
                onValueChange={(value) =>
                  setDraft({
                    ...draft,
                    waiting: value as typeof draft.waiting,
                  })
                }
              />
              <OperationalToolbarSelect
                label={t("Currency")}
                value={draft.currency}
                options={options(currencies, "All currencies", t)}
                onValueChange={(value) =>
                  setDraft({ ...draft, currency: value })
                }
              />
            </>
          ) : null}
          <OperationalToolbarSelect
            label={t("Refund status")}
            value={draft.refundStatus}
            options={options(REFUND_STATUSES, "All refund states", t)}
            onValueChange={(value) =>
              setDraft({
                ...draft,
                refundStatus: value as typeof draft.refundStatus,
              })
            }
          />
          <OperationalToolbarSelect
            label={t("Sort")}
            value={draft.sort}
            options={options(
              ["newest", "oldest", "amount-desc", "amount-asc"],
              "Sort",
              t
            ).slice(1)}
            onValueChange={(value) =>
              setDraft({ ...draft, sort: value as typeof draft.sort })
            }
          />
        </div>
      )}
    </OperationalFilterPopover>
  )
  const activeFilters: ActiveOperationalFilter[] = [
    filters.query
      ? {
          id: "query",
          label: `${t("Search")}: ${filters.query}`,
          onRemove: () => update("query", ""),
        }
      : null,
    ...(["status", "refundStatus", "currency", "waiting"] as const).flatMap(
      (key) =>
        filters[key] === "all"
          ? []
          : [
              {
                id: key,
                label: `${t(
                  key === "status"
                    ? "Approval status"
                    : key === "refundStatus"
                      ? "Refund status"
                      : key === "waiting"
                        ? "Waiting time"
                        : "Currency"
                )}: ${t(filters[key])}`,
                onRemove: () => update(key, "all"),
              },
            ]
    ),
  ].filter(Boolean) as ActiveOperationalFilter[]
  const pending = rows.filter(
    ({ approval }) => approval.status === "pending"
  ).length
  const returned = rows.filter(
    ({ approval }) => approval.status === "returned"
  ).length
  const today = new Date().toISOString().slice(0, 10)
  const approvedToday = rows.filter(
    ({ approval }) =>
      approval.status === "approved" && approval.decidedAt?.startsWith(today)
  ).length
  const pendingExecution = rows.filter(
    ({ rma }) =>
      rma.refundStatus === "pending_execution" || rma.refundStatus === "failed"
  ).length
  const totals = Object.entries(
    rows
      .filter(({ approval }) => approval.status === "pending")
      .reduce<Record<string, number>>((result, { calculation }) => {
        result[calculation.total.currency] =
          (result[calculation.total.currency] ?? 0) + calculation.total.amount
        return result
      }, {})
  )
    .map(([currency, amount]) =>
      formatMoney(amount, currency, i18n.resolvedLanguage ?? "en")
    )
    .join(" · ")

  return (
    <PageLayout ariaLabel={t("Refund approvals")} pageName="Refund approvals">
      {[
        ["Pending approval", pending],
        ["Returned", returned],
        ["Approved today", approvedToday],
        ["Awaiting execution", pendingExecution],
      ].map(([label, value]) => (
        <GridBlock
          key={label}
          className="col-span-12 sm:col-span-6 lg:col-span-3"
        >
          <OperationalMetricCard
            label={t(String(label))}
            value={returns.state === "ready" ? value : undefined}
            loading={["idle", "loading"].includes(returns.state)}
            unavailableDetail={t("Returns data is unavailable.")}
            detail={
              label === "Pending approval"
                ? totals || t("No pending amount")
                : t("RMA records")
            }
          />
        </GridBlock>
      ))}
      <GridBlock>
        <OperationalListPanel
          toolbar={
            <OperationalFilterToolbar
              search={
                <OperationalToolbarSearch
                  label={t("Search refund approvals")}
                  placeholder={t("Search approval, RMA or order ID")}
                  value={filters.query}
                  onChange={(value) => update("query", value)}
                />
              }
              primaryFilters={
                <>
                  <OperationalToolbarSelect
                    label={t("Approval status")}
                    value={filters.status}
                    options={options(
                      APPROVAL_STATUSES,
                      "All approval states",
                      t
                    )}
                    onValueChange={(value) =>
                      update("status", value as typeof filters.status)
                    }
                  />
                  <OperationalToolbarSelect
                    label={t("Currency")}
                    value={filters.currency}
                    options={options(currencies, "All currencies", t)}
                    onValueChange={(value) => update("currency", value)}
                  />
                  <OperationalToolbarSelect
                    label={t("Waiting time")}
                    value={filters.waiting}
                    options={options(
                      ["under-24h", "24-48h", "over-48h"],
                      "All waiting times",
                      t
                    )}
                    onValueChange={(value) =>
                      update("waiting", value as typeof filters.waiting)
                    }
                  />
                </>
              }
              moreFilter={filterFields("more")}
              mobileFilter={filterFields("filter")}
            />
          }
          summary={
            <ActiveFilterSummary
              resultLabel={t("{{count}} approvals", { count: model.total })}
              filters={activeFilters}
              clearAllLabel={t("Clear all")}
              onClearAll={() => applyAndReset(() => setFilters(initialFilters))}
            />
          }
          pagination={
            <OperationalPagination
              page={model.page}
              pageCount={model.pageCount}
              ariaLabel={t("Refund approval pagination")}
              previousLabel={t("Previous page")}
              nextLabel={t("Next page")}
              onPageChange={setPage}
            />
          }
        >
          {returns.state === "error" ? (
            <OperationalListState kind="error">
              {t("Returns data is unavailable.")}
            </OperationalListState>
          ) : returns.state !== "ready" ? (
            <OperationalListState kind="loading">
              {t("Loading refund approvals…")}
            </OperationalListState>
          ) : model.items.length === 0 ? (
            <OperationalListState kind="empty">
              {t("No matching approvals")}
            </OperationalListState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] text-left text-sm">
                <thead className="border-b bg-muted/60 text-xs">
                  <tr>
                    {[
                      "Approval",
                      "RMA / Order",
                      "Accepted items",
                      "Refund total",
                      "Currency",
                      "Policy result",
                      "Waiting time",
                      "Calculation version",
                      "Status",
                      "Actions",
                    ].map((label) => (
                      <th key={label} className="p-3">
                        {t(label)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {model.items.map(({ approval, calculation, rma }) => (
                    <tr
                      key={approval.id}
                      className="border-b hover:bg-muted/30"
                    >
                      <td className="p-3 font-semibold">{approval.id}</td>
                      <td className="p-3">
                        <span className="block font-medium">{rma.id}</span>
                        <span className="text-xs text-muted-foreground">
                          {rma.orderId}
                        </span>
                      </td>
                      <td className="p-3">
                        {t("{{items}} items / {{units}} units", {
                          items: calculation.items.length,
                          units: calculation.items.reduce(
                            (sum, item) => sum + item.acceptedQuantity,
                            0
                          ),
                        })}
                      </td>
                      <td className="p-3">
                        {formatMoney(
                          calculation.total.amount,
                          calculation.total.currency,
                          i18n.resolvedLanguage ?? "en"
                        )}
                      </td>
                      <td className="p-3">{calculation.total.currency}</td>
                      <td className="p-3">
                        {t(
                          rma.eligibility.systemResult?.decision ??
                            rma.eligibility.status
                        )}
                      </td>
                      <td className="p-3">
                        {formatWaitingTime(
                          approvalWaitingHours(approval, now),
                          t
                        )}
                      </td>
                      <td className="p-3">v{calculation.version}</td>
                      <td className="p-3">
                        <Badge className={toneFor(approval.status)}>
                          {t(approval.status)}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            navigate(`/refund-approvals/${approval.id}`)
                          }
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

const DetailCard = ({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) => (
  <Card className="h-full">
    <CardHeader>
      <CardTitle>{title}</CardTitle>
    </CardHeader>
    <CardContent className="grid gap-3 text-sm">{children}</CardContent>
  </Card>
)

export const RefundApprovalDetailPage = () => {
  const { approvalId } = useParams()
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { commerce, returnRepository, returns } = useVoltageAdmin()
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  if (returns.state === "error")
    return (
      <PageLayout
        ariaLabel={t("Refund approval details")}
        pageName="Refund approvals"
      >
        <OperationalListState kind="error">
          {t("Returns data is unavailable.")}
        </OperationalListState>
      </PageLayout>
    )
  if (returns.state !== "ready")
    return (
      <PageLayout
        ariaLabel={t("Refund approval details")}
        pageName="Refund approvals"
      >
        <OperationalListState kind="loading">
          {t("Loading refund approvals…")}
        </OperationalListState>
      </PageLayout>
    )
  const approval = returns.approvals.find((item) => item.id === approvalId)
  const rma = approval
    ? returns.rmas.find((item) => item.id === approval.rmaId)
    : undefined
  const calculation = approval
    ? returns.calculations.find((item) => item.id === approval.calculationId)
    : undefined
  if (!approval || !rma || !calculation)
    return (
      <PageLayout
        ariaLabel={t("Refund approval details")}
        pageName="Refund approvals"
      >
        <OperationalListState kind="error">
          {t("Refund approval was not found.")}
        </OperationalListState>
      </PageLayout>
    )
  const items = returns.items.filter((item) => item.rmaId === rma.id)
  const order = commerce.orders.find((item) => item.id === rma.orderId)
  const attempts = returns.executionAttempts.filter(
    (item) => item.approvalId === approval.id
  )
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
  const decide = (decision: "approved" | "returned" | "rejected") =>
    run(() =>
      returnRepository.decideApproval(
        approval.id,
        decision,
        decision === "approved" ? "" : reason,
        "finance-user",
        "user"
      )
    )
  return (
    <PageLayout
      ariaLabel={t("Refund approval details")}
      pageName={approval.id}
      translatePageName={false}
      breadcrumb={[
        { label: "Refund approvals", to: "/refund-approvals" },
        { label: approval.id, translate: false },
      ]}
      status={
        <Badge className={toneFor(approval.status)}>{t(approval.status)}</Badge>
      }
      actions={
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ChevronLeft />
            {t("Back")}
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate(`/returns/${rma.id}`)}
          >
            {t("Open return")}
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
      <GridBlock className="col-span-12 md:col-span-6 lg:col-span-3">
        <OperationalMetricCard
          label={t("Approval status")}
          value={t(approval.status)}
          detail={t("Single-level approval")}
        />
      </GridBlock>
      <GridBlock className="col-span-12 md:col-span-6 lg:col-span-3">
        <OperationalMetricCard
          label={t("Refund status")}
          value={t(rma.refundStatus)}
          detail={t("Execution is recorded separately")}
        />
      </GridBlock>
      <GridBlock className="col-span-12 md:col-span-6 lg:col-span-3">
        <OperationalMetricCard
          label={t("Refund total")}
          value={formatMoney(
            calculation.total.amount,
            calculation.total.currency,
            i18n.resolvedLanguage ?? "en"
          )}
          detail={calculation.total.currency}
        />
      </GridBlock>
      <GridBlock className="col-span-12 md:col-span-6 lg:col-span-3">
        <OperationalMetricCard
          label={t("Calculation version")}
          value={calculation.version}
          detail={`${t("RMA version")} ${calculation.rmaVersion}`}
        />
      </GridBlock>
      <GridBlock className="col-span-12 lg:col-span-7">
        <DetailCard title={t("Refund calculation")}>
          {calculation.items.map((line) => {
            const item = items.find(
              (candidate) => candidate.id === line.returnItemId
            )
            return (
              <div
                key={line.returnItemId}
                className="grid grid-cols-[1fr_auto] gap-3 border-b pb-2"
              >
                <span>
                  {item?.title ?? line.returnItemId}
                  <small className="block text-muted-foreground">
                    {t("Requested quantity")}: {item?.requestedQuantity ?? "—"}
                    {" · "}
                    {t("Received quantity")}: {item?.receivedQuantity ?? "—"}
                    {" · "}
                    {t("Accepted quantity")}: {line.acceptedQuantity}
                  </small>
                  <small className="block text-muted-foreground">
                    {t("Original paid unit amounts")}:{" "}
                    {item?.paidUnitAmounts.length
                      ? item.paidUnitAmounts
                          .map((amount) =>
                            formatMoney(
                              amount.amount,
                              amount.currency,
                              i18n.resolvedLanguage ?? "en"
                            )
                          )
                          .join(" · ")
                      : "—"}
                  </small>
                </span>
                <strong>
                  {formatMoney(
                    line.amount.amount,
                    line.amount.currency,
                    i18n.resolvedLanguage ?? "en"
                  )}
                </strong>
              </div>
            )
          })}
          <div className="flex justify-between">
            <span>{t("Shipping refund")}</span>
            <strong>
              {formatMoney(
                calculation.shippingAmount.amount,
                calculation.shippingAmount.currency,
                i18n.resolvedLanguage ?? "en"
              )}
            </strong>
          </div>
          <div className="flex justify-between text-base">
            <span>{t("Total")}</span>
            <strong>
              {formatMoney(
                calculation.total.amount,
                calculation.total.currency,
                i18n.resolvedLanguage ?? "en"
              )}
            </strong>
          </div>
          <p className="text-muted-foreground">
            {t("Amounts are immutable and cannot be edited during approval.")}
          </p>
        </DetailCard>
      </GridBlock>
      <GridBlock className="col-span-12 lg:col-span-5">
        <DetailCard title={t("Approval decision")}>
          {approval.status === "pending" ? (
            <>
              <label>
                {t("Reason for return or rejection")}
                <textarea
                  className={textAreaClass}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy} onClick={() => void decide("approved")}>
                  {t("Approve full refund")}
                </Button>
                <Button
                  disabled={busy || !reason.trim()}
                  variant="outline"
                  onClick={() => void decide("returned")}
                >
                  {t("Return for revision")}
                </Button>
                <Button
                  disabled={busy || !reason.trim()}
                  variant="destructive"
                  onClick={() => void decide("rejected")}
                >
                  {t("Reject refund")}
                </Button>
              </div>
            </>
          ) : (
            <>
              <p>
                {t("Decided by")}: {approval.decidedBy ?? "—"}
              </p>
              <p>
                {t("Decision reason")}: {approval.reason || "—"}
              </p>
            </>
          )}
        </DetailCard>
      </GridBlock>
      <GridBlock className="col-span-12 lg:col-span-6">
        <DetailCard title={t("Refund execution")}>
          <p className="text-muted-foreground">
            {approval.status === "approved" &&
            ["pending_execution", "failed"].includes(rma.refundStatus)
              ? t("Record the execution result from the RMA detail page.")
              : t("Refund execution is available only after approval.")}
          </p>
          <Button
            variant="outline"
            onClick={() => navigate(`/returns/${rma.id}`)}
          >
            {t("Open return")}
          </Button>
          {attempts.map((attempt) => (
            <div key={attempt.id} className="border-t pt-2">
              <strong>
                {t("Attempt")} {attempt.sequence}: {t(attempt.result)}
              </strong>
              <p>
                {t(attempt.resultCode)} · {attempt.executedAt}
              </p>
            </div>
          ))}
        </DetailCard>
      </GridBlock>
      <GridBlock className="col-span-12 lg:col-span-6">
        <DetailCard title={t("Original order paid summary")}>
          {commerce.state === "ready" && order ? (
            <>
              {(
                ["subtotal", "discount", "shipping", "tax", "total"] as const
              ).map((key) => (
                <div key={key} className="flex justify-between gap-3">
                  <span>{t(`Order ${key}`)}</span>
                  <strong>
                    {formatMoney(
                      order.amounts[key].amount,
                      order.amounts[key].currency,
                      i18n.resolvedLanguage ?? "en"
                    )}
                  </strong>
                </div>
              ))}
            </>
          ) : commerce.state === "error" ? (
            <p className="text-muted-foreground">
              {t("Order paid summary is unavailable.")}
            </p>
          ) : (
            <p className="text-muted-foreground">
              {t("Loading order paid summary…")}
            </p>
          )}
        </DetailCard>
      </GridBlock>
      <GridBlock className="col-span-12 lg:col-span-6">
        <DetailCard title={t("Policy and inspection evidence")}>
          <p>
            {t("Policy result")}:{" "}
            {t(
              rma.eligibility.systemResult?.decision ?? rma.eligibility.status
            )}
          </p>
          <p>
            {t("Shipping refund eligibility")}:{" "}
            {rma.eligibility.systemResult
              ? t(
                  rma.eligibility.systemResult.shippingRefundEligible
                    ? "Eligible"
                    : "Not eligible"
                )
              : t("Not assessed")}
          </p>
          <p>
            {t("Policy version")}: {rma.eligibility.policyVersion}
          </p>
          <p>
            {t("Calculation version")}: {approval.calculationVersion}
          </p>
          <p>
            {t("Inspection version")}: {calculation.inspectionVersion}
          </p>
          <p>
            {t("Order snapshot version")}: {calculation.orderSnapshotVersion}
          </p>
          {items.map((item) => (
            <div key={item.id} className="border-t pt-2">
              <strong>{item.title}</strong>
              <p>
                {t("Condition")}: {item.condition ? t(item.condition) : "—"}
                {" · "}
                {t("Packaging")}: {item.packaging ? t(item.packaging) : "—"}
              </p>
              <p>
                {t("Inspection result")}:{" "}
                {item.inspectionResult ? t(item.inspectionResult) : "—"}
                {" · "}
                {t("Inventory disposition")}:{" "}
                {item.inventoryDisposition ? t(item.inventoryDisposition) : "—"}
              </p>
            </div>
          ))}
        </DetailCard>
      </GridBlock>
      <GridBlock>
        <DetailCard title={t("Agent safe summary")}>
          <p className="text-muted-foreground">
            {t("No Agent summary has been prepared.")}
          </p>
        </DetailCard>
      </GridBlock>
      <GridBlock>
        <DetailCard title={t("Timeline")}>
          <ol className="grid gap-2">
            {returns.timeline
              .filter((event) => event.rmaId === rma.id)
              .map((event) => (
                <li
                  key={event.id}
                  className="grid gap-1 border-b pb-2 sm:grid-cols-[1fr_auto]"
                >
                  <span>
                    {t(event.action)} · {t(event.actor)} · {t(event.result)}
                  </span>
                  <time>{event.occurredAt}</time>
                </li>
              ))}
          </ol>
        </DetailCard>
      </GridBlock>
    </PageLayout>
  )
}
