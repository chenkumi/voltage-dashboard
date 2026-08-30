import { ChevronRight, CircleAlert, Search } from "lucide-react"
import { useMemo, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  searchVoltageAdminProducts,
  voltageAdminCustomers,
  voltageAdminOrders,
} from "./voltage-admin-data"
import { useVoltageAdmin, voltageAdminPath } from "./voltage-admin"
import { GridBlock, PageLayout } from "./voltage-admin-page-layout"
import { ReportCanvas } from "./reporting/report-canvas"

const formatMoney = (value: number, language = "en") =>
  new Intl.NumberFormat(language === "zh-TW" ? "zh-TW" : "en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value)

const formatProductMoney = (
  value: number,
  currency: "USD" | "TWD",
  language = "en"
) =>
  new Intl.NumberFormat(language === "zh-TW" ? "zh-TW" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "TWD" ? 0 : 2,
  }).format(value)

const statusClass = (status: string) => {
  if (status === "Delivered") return "bg-[#e5eee7] text-[#48614c]"
  if (status === "Action needed") return "bg-[#f4e5d7] text-[#8b5d3c]"
  if (status === "Shipped") return "bg-[#e4eaed] text-[#4f6975]"
  return "bg-[#ece8d9] text-[#6e6746]"
}

const DataTable = ({ children }: { children: ReactNode }) => (
  <div className="voltage-admin-data-table overflow-x-auto border border-[#cfd3cb] bg-[#f5f6f1]">
    {children}
  </div>
)

export const Dashboard = () => {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { dashboard, workflow, products } = useVoltageAdmin()
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
      eyebrow={t("Overview · last 7 days")}
      title={t("A calm read on the store.")}
      detail={t("Built from the embedded operational dataset.")}
    >
      {[
        [
          "Revenue",
          formatMoney(dashboard.revenue, i18n.resolvedLanguage),
          "+12.4% this week",
        ],
        ["Orders", dashboard.orderCount.toString(), "2 need attention"],
        ["Customers", dashboard.customerCount.toString(), "Anonymous segments"],
        [
          "Available SKUs",
          dashboard.availableProductCount.toString(),
          t("{{count}} low stock", { count: dashboard.lowStockCount }),
        ],
      ].map(([label, value, detail]) => (
        <GridBlock
          key={label}
          className="col-span-12 sm:col-span-6 xl:col-span-3"
        >
          <article className="voltage-admin-metric">
            <span>{t(label)}</span>
            <strong>{value}</strong>
            <small>{t(detail)}</small>
          </article>
        </GridBlock>
      ))}
      {workflowMetrics.map(([label, value, detail]) => (
        <GridBlock
          key={label}
          className="col-span-12 sm:col-span-6 xl:col-span-4"
        >
          <article className="voltage-admin-metric voltage-admin-workflow-metric">
            <span>{t(label)}</span>
            <strong>{value}</strong>
            <small>{t(detail)}</small>
          </article>
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
            {voltageAdminOrders.slice(0, 4).map((order) => (
              <div key={order.id} className="voltage-admin-list-row">
                <span>
                  <strong>{order.id}</strong>
                  <small>
                    {t("{{count}} items", { count: order.itemCount })} ·{" "}
                    {order.createdAt}
                  </small>
                </span>
                <span>
                  <Badge className={statusClass(order.status)}>
                    {t(order.status)}
                  </Badge>
                  <strong>
                    {formatMoney(order.total, i18n.resolvedLanguage)}
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

export const Products = () => {
  const { t, i18n } = useTranslation()
  const { products: productStore } = useVoltageAdmin()
  const [query, setQuery] = useState("")
  const products = useMemo(
    () => searchVoltageAdminProducts(query, productStore.products),
    [productStore.products, query]
  )

  return (
    <PageLayout
      ariaLabel={t("Voltage Dashboard Products")}
      pageName="Products"
      eyebrow={t("Catalog management")}
      title={t("Products, kept focused.")}
      detail={t("{{count}} matching products in the current preview.", {
        count: products.length,
      })}
    >
      <GridBlock>
        <div className="voltage-admin-toolbar">
          <label className="voltage-admin-search">
            <Search className="size-4" />
            <span className="sr-only">{t("Search products")}</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("Search product, category, brand…")}
            />
          </label>
        </div>
      </GridBlock>
      <GridBlock>
        <DataTable>
          <table>
            <thead>
              <tr>
                <th>{t("Product")}</th>
                <th>{t("Category")}</th>
                <th>{t("Price")}</th>
                <th>{t("Rating")}</th>
                <th>{t("Inventory")}</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <td>
                    <strong>{product.title}</strong>
                    <small>#{product.id}</small>
                  </td>
                  <td>{product.category}</td>
                  <td>
                    {formatProductMoney(
                      product.price.amount,
                      product.price.currency,
                      i18n.resolvedLanguage
                    )}
                  </td>
                  <td>
                    {product.rating === null
                      ? t("No reviews")
                      : `${product.rating.toFixed(1)} / 5`}
                  </td>
                  <td>
                    <Badge
                      className={
                        product.stock <= 12
                          ? "bg-[#f4e5d7] text-[#8b5d3c]"
                          : "bg-[#e5eee7] text-[#48614c]"
                      }
                    >
                      {t("{{count}} units", { count: product.stock })}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      </GridBlock>
    </PageLayout>
  )
}

export const Orders = () => {
  const { t, i18n } = useTranslation()

  return (
    <PageLayout
      ariaLabel={t("Voltage Dashboard Orders")}
      pageName="Orders"
      eyebrow={t("Order operations")}
      title={t("A private, clear queue.")}
      detail={t(
        "Records are anonymized; final order actions remain outside WebMCP."
      )}
    >
      <GridBlock>
        <DataTable>
          <table>
            <thead>
              <tr>
                <th>{t("Order")}</th>
                <th>{t("Customer ref")}</th>
                <th>{t("Created")}</th>
                <th>{t("Status")}</th>
                <th>{t("Total")}</th>
              </tr>
            </thead>
            <tbody>
              {voltageAdminOrders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <strong>{order.id}</strong>
                    <small>
                      {t("{{count}} items", { count: order.itemCount })}
                    </small>
                  </td>
                  <td>{order.customerId}</td>
                  <td>{order.createdAt}</td>
                  <td>
                    <Badge className={statusClass(order.status)}>
                      {t(order.status)}
                    </Badge>
                  </td>
                  <td>{formatMoney(order.total, i18n.resolvedLanguage)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      </GridBlock>
    </PageLayout>
  )
}

export const Customers = () => {
  const { t, i18n } = useTranslation()

  return (
    <PageLayout
      ariaLabel={t("Voltage Dashboard Customers")}
      pageName="Customers"
      eyebrow={t("Customer intelligence")}
      title={t("Segments without identities.")}
      detail={t(
        "Only non-identifying demo references are available to the agent."
      )}
    >
      {voltageAdminCustomers.map((customer) => (
        <GridBlock
          key={customer.id}
          className="col-span-12 sm:col-span-6 xl:col-span-4"
        >
          <article className="voltage-admin-customer">
            <div>
              <span>{customer.id}</span>
              <Badge
                className={
                  customer.segment === "VIP"
                    ? "bg-[#e4eaed] text-[#4f6975]"
                    : "bg-[#e5eee7] text-[#48614c]"
                }
              >
                {t(customer.segment)}
              </Badge>
            </div>
            <strong>
              {formatMoney(customer.lifetimeValue, i18n.resolvedLanguage)}
            </strong>
            <p>
              {t("{{count}} orders · active {{time}}", {
                count: customer.orders,
                time: customer.lastActive,
              })}
            </p>
          </article>
        </GridBlock>
      ))}
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
