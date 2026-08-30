import { ChevronRight, CircleAlert } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
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

const statusClass = (status: string) => {
  if (status === "delivered") return "bg-[#e5eee7] text-[#48614c]"
  if (status === "action_needed") return "bg-[#f4e5d7] text-[#8b5d3c]"
  if (status === "shipped") return "bg-[#e4eaed] text-[#4f6975]"
  return "bg-[#ece8d9] text-[#6e6746]"
}

export const Dashboard = () => {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { commerce, dashboard, workflow, products } = useVoltageAdmin()
  const commerceLoading = ["idle", "loading"].includes(commerce.state)
  const productLoading = ["idle", "loading"].includes(products.state)
  const commerceUnavailable = commerce.state === "error"
  const productUnavailable = products.state === "error"
  const workflowMetrics = [
    [
      "Draft products",
      products.products
        .filter(({ status }) => status === "draft")
        .length.toString(),
      "Awaiting publication",
    ],
    [
      "Exception cases",
      workflow.cases
        .filter(({ status }) => status !== "resolved")
        .length.toString(),
      "Safe operational cases",
    ],
    [
      "Human approvals",
      workflow.reviews
        .filter(({ state }) => state === "pending" || state === "approved")
        .length.toString(),
      "Final actions stay in UI",
    ],
  ]

  return (
    <PageLayout
      ariaLabel={t("Voltage Dashboard Overview")}
      pageName="Dashboard"
      eyebrow={t("Operational snapshot")}
      title={t("A calm read on the store.")}
      detail={t("Built from the embedded operational dataset.")}
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
          detail: "Order totals by currency",
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
      {workflowMetrics.map(([label, value, detail]) => (
        <GridBlock
          key={label}
          className="col-span-12 md:col-span-6 lg:col-span-4"
        >
          <OperationalMetricCard
            label={t(label)}
            value={
              productUnavailable && label === "Draft products"
                ? undefined
                : value
            }
            detail={t(detail)}
            loading={productLoading && label === "Draft products"}
            tone={label === "Exception cases" ? "critical" : "neutral"}
            unavailableDetail={t("Data unavailable")}
          />
        </GridBlock>
      ))}
      <GridBlock className="col-span-12 xl:col-span-8">
        <article className="voltage-admin-panel">
          <div className="voltage-admin-panel-heading">
            <div>
              <p>{t("Latest activity")}</p>
              <h2>{t("Order queue")}</h2>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="cursor-pointer"
              onClick={() => navigate(voltageAdminPath("orders"))}
            >
              {t("All orders")} <ChevronRight className="size-4" />
            </Button>
          </div>
          <div className="space-y-1">
            {dashboard.latestOrders.map((order) => (
              <div key={order.id} className="voltage-admin-list-row">
                <span>
                  <strong>{order.id}</strong>
                  <small>
                    {t("{{count}} items", { count: order.itemCount })} ·{" "}
                    {new Intl.DateTimeFormat(
                      i18n.resolvedLanguage === "zh-TW" ? "zh-TW" : "en-US",
                      { dateStyle: "medium" }
                    ).format(new Date(order.createdAt))}
                  </small>
                </span>
                <span>
                  <Badge className={statusClass(order.status)}>
                    {t(order.status)}
                  </Badge>
                  <strong>
                    {formatMoney(
                      order.total.amount,
                      order.total.currency,
                      i18n.resolvedLanguage
                    )}
                  </strong>
                </span>
              </div>
            ))}
          </div>
        </article>
      </GridBlock>
      <GridBlock className="col-span-12 xl:col-span-4">
        <article className="voltage-admin-panel voltage-admin-alert">
          <div className="voltage-admin-panel-heading">
            <div>
              <p>{t("Inventory signal")}</p>
              <h2>{t("Low stock")}</h2>
            </div>
            <CircleAlert className="size-5" />
          </div>
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
        </article>
      </GridBlock>
    </PageLayout>
  )
}

export const Reports = () => {
  const { t } = useTranslation()
  const { reportingController } = useVoltageAdmin()

  return (
    <PageLayout
      ariaLabel={t("Voltage Dashboard Reports")}
      pageName="Reports"
      eyebrow={t("Smart Dashboard · shared workspace")}
      title={t("Shape the report together.")}
      detail={t(
        "Connected Agent tools and your direct edits update the same in-memory report. Query evidence stays inside this Dashboard page."
      )}
    >
      <GridBlock>
        <ReportCanvas controller={reportingController} />
      </GridBlock>
    </PageLayout>
  )
}
