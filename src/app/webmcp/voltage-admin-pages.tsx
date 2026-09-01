import { ChevronRight, CircleAlert } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { OperationalMetricCard } from "./operational-ui"
import { useVoltageAdmin, voltageAdminPath } from "./voltage-admin"
import { GridBlock, PageLayout } from "./voltage-admin-page-layout"
import { ReportCanvas } from "./reporting/report-canvas"

const formatMoney = (value: number, currency: "USD" | "TWD", language = "en") =>
  new Intl.NumberFormat(language === "zh-TW" ? "zh-TW" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "TWD" ? 0 : 2,
  }).format(value)

export const Dashboard = () => {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { commerce, dashboard, products, returns } = useVoltageAdmin()
  const commerceLoading = ["idle", "loading"].includes(commerce.state)
  const productLoading = ["idle", "loading"].includes(products.state)
  const returnsLoading = ["idle", "loading"].includes(returns.state)
  const commerceUnavailable = commerce.state === "error"
  const productUnavailable = products.state === "error"
  const returnsUnavailable = returns.state === "error"
  const operationalMetrics = [
    {
      label: "Draft products",
      value: products.products
        .filter(({ status }) => status === "draft")
        .length.toString(),
      detail: "Awaiting publication",
      loading: productLoading,
      unavailable: productUnavailable,
      tone: "neutral" as const,
    },
    {
      label: "Active returns",
      value: returns.rmas
        .filter(({ status }) => status === "active")
        .length.toString(),
      detail: "Awaiting return processing",
      loading: returnsLoading,
      unavailable: returnsUnavailable,
      tone: returns.rmas.some(({ status }) => status === "active")
        ? ("warning" as const)
        : ("neutral" as const),
    },
    {
      label: "Pending refunds",
      value: returns.approvals
        .filter(({ status }) => status === "pending")
        .length.toString(),
      detail: "Awaiting refund approval",
      loading: returnsLoading,
      unavailable: returnsUnavailable,
      tone: returns.approvals.some(({ status }) => status === "pending")
        ? ("critical" as const)
        : ("neutral" as const),
    },
  ]
  const latestReturnActivity = [...returns.timeline]
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    .slice(0, 5)

  return (
    <PageLayout
      ariaLabel={t("Voltage Dashboard Overview")}
      pageName="Dashboard"
    >
      {[
        {
          label: "Revenue",
          value: commerceUnavailable
            ? undefined
            : dashboard.revenueByCurrency
                .map(({ amount, currency }) =>
                  formatMoney(amount, currency, i18n.resolvedLanguage)
                )
                .join(" · "),
          detail: "Paid order totals by currency",
          loading: commerceLoading,
          tone: "positive" as const,
        },
        {
          label: "Orders",
          value: commerceUnavailable
            ? undefined
            : dashboard.orderCount.toString(),
          detail: t("{{count}} need attention", {
            count: dashboard.attentionOrderCount,
          }),
          loading: commerceLoading,
          tone: dashboard.attentionOrderCount
            ? ("warning" as const)
            : ("neutral" as const),
        },
        {
          label: "Customers",
          value: commerceUnavailable
            ? undefined
            : dashboard.customerCount.toString(),
          detail: t("{{count}} active", {
            count: dashboard.activeCustomerCount,
          }),
          loading: commerceLoading,
          tone: "neutral" as const,
        },
        {
          label: "Available SKUs",
          value: productUnavailable
            ? undefined
            : dashboard.availableProductCount.toString(),
          detail: t("{{count}} low stock", { count: dashboard.lowStockCount }),
          loading: productLoading,
          tone: dashboard.lowStockCount
            ? ("warning" as const)
            : ("positive" as const),
        },
      ].map(({ label, value, detail, loading, tone }) => (
        <GridBlock
          key={label}
          className="col-span-12 md:col-span-6 lg:col-span-3"
        >
          <OperationalMetricCard
            label={t(label)}
            value={value}
            detail={t(detail)}
            loading={loading}
            tone={tone}
            unavailableDetail={t("Data unavailable")}
          />
        </GridBlock>
      ))}
      {operationalMetrics.map(
        ({ label, value, detail, loading, unavailable, tone }) => (
          <GridBlock
            key={label}
            className="col-span-12 md:col-span-6 lg:col-span-4"
          >
            <OperationalMetricCard
              label={t(label)}
              value={unavailable ? undefined : value}
              detail={t(detail)}
              loading={loading}
              tone={tone}
              unavailableDetail={t("Data unavailable")}
            />
          </GridBlock>
        )
      )}
      <GridBlock className="col-span-12 xl:col-span-8">
        <OperationalMetricCard
          className="h-full"
          label={t("Latest activity")}
          headerAction={
            <Button
              variant="ghost"
              size="sm"
              className="cursor-pointer"
              onClick={() => navigate(voltageAdminPath("returns"))}
            >
              {t("All returns")} <ChevronRight className="size-4" />
            </Button>
          }
        >
          <h2 className="font-heading text-xl leading-tight font-medium tracking-tight">
            {t("Return activity")}
          </h2>
          <div className="space-y-1">
            {returnsLoading ? (
              <p className="py-6 text-sm text-muted-foreground">
                {t("Loading returns…")}
              </p>
            ) : returnsUnavailable ? (
              <p className="py-6 text-sm text-muted-foreground">
                {t("Returns data is unavailable.")}
              </p>
            ) : latestReturnActivity.length > 0 ? (
              latestReturnActivity.map((activity) => (
                <div key={activity.id} className="voltage-admin-list-row">
                  <span>
                    <strong>{activity.rmaId}</strong>
                    <small>
                      {t(activity.action, {
                        defaultValue: activity.action.replaceAll("_", " "),
                      })}{" "}
                      ·{" "}
                      {new Intl.DateTimeFormat(
                        i18n.resolvedLanguage === "zh-TW" ? "zh-TW" : "en-US",
                        { dateStyle: "medium", timeStyle: "short" }
                      ).format(new Date(activity.occurredAt))}
                    </small>
                  </span>
                  <strong className="capitalize">{t(activity.actor)}</strong>
                </div>
              ))
            ) : (
              <p className="py-6 text-sm text-muted-foreground">
                {t("No return activity yet.")}
              </p>
            )}
          </div>
        </OperationalMetricCard>
      </GridBlock>
      <GridBlock className="col-span-12 xl:col-span-4">
        <OperationalMetricCard
          className="h-full bg-[#edf0ea]"
          label={t("Inventory signal")}
          tone="warning"
          headerAction={<CircleAlert className="size-5 text-amber-700" />}
        >
          <h2 className="font-heading text-xl leading-tight font-medium tracking-tight">
            {t("Low stock")}
          </h2>
          {dashboard.lowStockProducts.length > 0 ? (
            dashboard.lowStockProducts.slice(0, 4).map((product) => (
              <div key={product.id} className="voltage-admin-alert-row">
                <span>{product.title}</span>
                <strong>{t("{{count}} left", { count: product.stock })}</strong>
              </div>
            ))
          ) : (
            <p>{t("Everything is comfortably stocked.")}</p>
          )}
          <Button
            variant="outline"
            className="mt-5 w-full cursor-pointer"
            onClick={() => navigate(voltageAdminPath("inventory"))}
          >
            {t("Review inventory")}
          </Button>
        </OperationalMetricCard>
      </GridBlock>
    </PageLayout>
  )
}

export const Reports = () => {
  const { t } = useTranslation()
  const { reportingController } = useVoltageAdmin()

  return (
    <PageLayout ariaLabel={t("Voltage Dashboard Reports")} pageName="Reports">
      <GridBlock>
        <ReportCanvas controller={reportingController} />
      </GridBlock>
    </PageLayout>
  )
}
