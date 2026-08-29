import { ChevronRight, CircleAlert, Search } from "lucide-react"
import { useMemo, useState, type ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  searchVoltageAdminProducts,
  setVoltageAdminInventory,
  voltageAdminCustomers,
  voltageAdminOrders,
} from "./voltage-admin-data"
import { useVoltageAdmin, voltageAdminPath } from "./voltage-admin"
import { GridBlock, PageLayout } from "./voltage-admin-page-layout"
import { ReportCanvas } from "./reporting/report-canvas"

const formatMoney = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
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
  const navigate = useNavigate()
  const { dashboard, workflow } = useVoltageAdmin()
  const workflowMetrics = [
    [
      "Catalog drafts",
      workflow.productDrafts
        .filter(({ status }) => status !== "published")
        .length.toString(),
      "Prepared for review",
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
      ariaLabel="Voltage Dashboard Overview"
      eyebrow="Overview · last 7 days"
      title="A calm read on the store."
      detail="Built from the embedded operational dataset."
    >
      {[
        ["Revenue", formatMoney(dashboard.revenue), "+12.4% this week"],
        ["Orders", dashboard.orderCount.toString(), "2 need attention"],
        ["Customers", dashboard.customerCount.toString(), "Anonymous segments"],
        [
          "Available SKUs",
          dashboard.availableProductCount.toString(),
          `${dashboard.lowStockCount} low stock`,
        ],
      ].map(([label, value, detail]) => (
        <GridBlock
          key={label}
          className="col-span-12 sm:col-span-6 xl:col-span-3"
        >
          <article className="voltage-admin-metric">
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{detail}</small>
          </article>
        </GridBlock>
      ))}
      {workflowMetrics.map(([label, value, detail]) => (
        <GridBlock
          key={label}
          className="col-span-12 sm:col-span-6 xl:col-span-4"
        >
          <article className="voltage-admin-metric voltage-admin-workflow-metric">
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{detail}</small>
          </article>
        </GridBlock>
      ))}
      <GridBlock className="col-span-12 xl:col-span-8">
        <article className="voltage-admin-panel">
          <div className="voltage-admin-panel-heading">
            <div>
              <p>Latest activity</p>
              <h2>Order queue</h2>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="cursor-pointer"
              onClick={() => navigate(voltageAdminPath("orders"))}
            >
              All orders <ChevronRight className="size-4" />
            </Button>
          </div>
          <div className="space-y-1">
            {voltageAdminOrders.slice(0, 4).map((order) => (
              <div key={order.id} className="voltage-admin-list-row">
                <span>
                  <strong>{order.id}</strong>
                  <small>
                    {order.itemCount} items · {order.createdAt}
                  </small>
                </span>
                <span>
                  <Badge className={statusClass(order.status)}>
                    {order.status}
                  </Badge>
                  <strong>{formatMoney(order.total)}</strong>
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
              <p>Inventory signal</p>
              <h2>Low stock</h2>
            </div>
            <CircleAlert className="size-5" />
          </div>
          {dashboard.lowStockProducts.length > 0 ? (
            dashboard.lowStockProducts.slice(0, 4).map((product) => (
              <div key={product.id} className="voltage-admin-alert-row">
                <span>{product.title}</span>
                <strong>{product.stock} left</strong>
              </div>
            ))
          ) : (
            <p>Everything is comfortably stocked.</p>
          )}
          <Button
            variant="outline"
            className="mt-5 w-full cursor-pointer"
            onClick={() => navigate(voltageAdminPath("inventory"))}
          >
            Review inventory
          </Button>
        </article>
      </GridBlock>
    </PageLayout>
  )
}

export const Products = () => {
  const { inventory } = useVoltageAdmin()
  const [query, setQuery] = useState("")
  const products = useMemo(
    () => searchVoltageAdminProducts(query, inventory),
    [inventory, query]
  )

  return (
    <PageLayout
      ariaLabel="Voltage Dashboard Products"
      eyebrow="Catalog management"
      title="Products, kept focused."
      detail={`${products.length} matching products in the current preview.`}
    >
      <GridBlock>
        <div className="voltage-admin-toolbar">
          <label className="voltage-admin-search">
            <Search className="size-4" />
            <span className="sr-only">Search products</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search product, category, brand…"
            />
          </label>
        </div>
      </GridBlock>
      <GridBlock>
        <DataTable>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Price</th>
                <th>Rating</th>
                <th>Inventory</th>
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
                  <td>{formatMoney(product.price)}</td>
                  <td>{product.rating.toFixed(1)} / 5</td>
                  <td>
                    <Badge
                      className={
                        product.stock <= 12
                          ? "bg-[#f4e5d7] text-[#8b5d3c]"
                          : "bg-[#e5eee7] text-[#48614c]"
                      }
                    >
                      {product.stock} units
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

export const Orders = () => (
  <PageLayout
    ariaLabel="Voltage Dashboard Orders"
    eyebrow="Order operations"
    title="A private, clear queue."
    detail="Records are anonymized; final order actions remain outside WebMCP."
  >
    <GridBlock>
      <DataTable>
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer ref</th>
              <th>Created</th>
              <th>Status</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {voltageAdminOrders.map((order) => (
              <tr key={order.id}>
                <td>
                  <strong>{order.id}</strong>
                  <small>{order.itemCount} items</small>
                </td>
                <td>{order.customerId}</td>
                <td>{order.createdAt}</td>
                <td>
                  <Badge className={statusClass(order.status)}>
                    {order.status}
                  </Badge>
                </td>
                <td>{formatMoney(order.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DataTable>
    </GridBlock>
  </PageLayout>
)

export const Customers = () => (
  <PageLayout
    ariaLabel="Voltage Dashboard Customers"
    eyebrow="Customer intelligence"
    title="Segments without identities."
    detail="Only non-identifying demo references are available to the agent."
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
              {customer.segment}
            </Badge>
          </div>
          <strong>{formatMoney(customer.lifetimeValue)}</strong>
          <p>
            {customer.orders} orders · active {customer.lastActive}
          </p>
        </article>
      </GridBlock>
    ))}
  </PageLayout>
)

export const Inventory = () => {
  const { inventory, setInventory } = useVoltageAdmin()
  const [query, setQuery] = useState("")
  const [lowStockOnly, setLowStockOnly] = useState(false)
  const products = useMemo(
    () =>
      searchVoltageAdminProducts(query, inventory, 194).filter(
        (product) => !lowStockOnly || (product.stock > 0 && product.stock <= 12)
      ),
    [inventory, lowStockOnly, query]
  )

  return (
    <PageLayout
      ariaLabel="Voltage Dashboard Inventory"
      eyebrow="Stock control"
      title="Keep the shelf in view."
      detail="Changes update this local Demo3 workspace only."
    >
      <GridBlock>
        <div className="voltage-admin-toolbar">
          <label className="voltage-admin-search">
            <Search className="size-4" />
            <span className="sr-only">Search inventory</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search inventory…"
            />
          </label>
          <Button
            type="button"
            variant={lowStockOnly ? "default" : "outline"}
            className="voltage-admin-toolbar-action cursor-pointer"
            onClick={() => setLowStockOnly((current) => !current)}
          >
            Low stock only
          </Button>
        </div>
      </GridBlock>
      <GridBlock>
        <DataTable>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Current stock</th>
                <th>Update stock</th>
              </tr>
            </thead>
            <tbody>
              {products.slice(0, 24).map((product) => (
                <tr key={product.id}>
                  <td>
                    <strong>{product.title}</strong>
                    <small>#{product.id}</small>
                  </td>
                  <td>{product.category}</td>
                  <td>
                    <Badge
                      className={
                        product.stock <= 12
                          ? "bg-[#f4e5d7] text-[#8b5d3c]"
                          : "bg-[#e5eee7] text-[#48614c]"
                      }
                    >
                      {product.stock} units
                    </Badge>
                  </td>
                  <td>
                    <input
                      aria-label={`${product.title} inventory`}
                      type="number"
                      min="0"
                      step="1"
                      value={product.stock}
                      onChange={(event) => {
                        const next = setVoltageAdminInventory(
                          inventory,
                          product.id,
                          Number(event.target.value)
                        )
                        if (next) setInventory(next)
                      }}
                    />
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

export const Reports = () => {
  const { reportingController } = useVoltageAdmin()

  return (
    <PageLayout
      ariaLabel="Voltage Dashboard Reports"
      eyebrow="Smart Dashboard · shared workspace"
      title="Shape the report together."
      detail="Connected Agent tools and your direct edits update the same in-memory report. Query evidence stays inside this Dashboard page."
    >
      <GridBlock>
        <ReportCanvas controller={reportingController} />
      </GridBlock>
    </PageLayout>
  )
}
