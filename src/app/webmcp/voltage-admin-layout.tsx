import {
  BarChart3,
  Boxes,
  ClipboardList,
  FileChartColumn,
  LayoutDashboard,
  ListChecks,
  PackagePlus,
  PackageSearch,
  Sparkles,
  TriangleAlert,
  Users,
} from "lucide-react"
import { Outlet, useLocation, useNavigate } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import {
  type VoltageAdminView,
  useVoltageAdmin,
  voltageAdminPath,
  voltageAdminViewFromPath,
} from "./voltage-admin"
import "./voltage-admin.css"

const navigation: ReadonlyArray<
  readonly [VoltageAdminView, string, typeof LayoutDashboard]
> = [
  ["dashboard", "Dashboard", LayoutDashboard],
  ["products", "Products", PackageSearch],
  ["orders", "Orders", ClipboardList],
  ["customers", "Customers", Users],
  ["inventory", "Inventory", Boxes],
  ["reports", "Reports", FileChartColumn],
  ["catalog-intake", "Catalog Intake", PackagePlus],
  ["operations-cases", "Operations Cases", TriangleAlert],
  ["approvals", "Approval Inbox", ListChecks],
]

export const MainLayout = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { dashboard, workflow } = useVoltageAdmin()
  const activeView = voltageAdminViewFromPath(location.pathname)
  const pendingCounts: Partial<Record<VoltageAdminView, number>> = {
    inventory: dashboard.lowStockCount,
    "catalog-intake": workflow.candidates.filter((candidate) => {
      const draft = workflow.productDrafts.find(
        ({ candidateId }) => candidateId === candidate.id
      )
      return !draft || draft.status === "draft"
    }).length,
    "operations-cases": workflow.cases.filter(({ status }) => status === "open")
      .length,
    approvals: workflow.reviews.filter(
      ({ state }) => state === "pending" || state === "approved"
    ).length,
  }

  return (
    <main className="voltage-admin h-full overflow-hidden px-4 sm:px-6">
      <div className="mx-auto flex h-full max-w-7xl flex-col">
        <header className="voltage-admin-header pt-4 sm:pt-6">
          <button
            type="button"
            onClick={() => navigate(voltageAdminPath("dashboard"))}
            className="voltage-admin-brand"
          >
            <span>
              <Sparkles className="size-5" />
            </span>
            <span>
              <small>Operations workspace</small>
              <strong>Voltage Dashboard</strong>
            </span>
          </button>
          <Badge className="hidden border-0 bg-[#e2e5df] text-[#4c574e] sm:inline-flex">
            Demo workspace · local data
          </Badge>
        </header>

        <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[13.5rem_minmax(0,1fr)]">
          <nav
            className="voltage-admin-nav min-h-0 pt-4 pb-4 sm:pt-6 sm:pb-6"
            aria-label="Voltage Dashboard navigation"
          >
            <p>Workspace</p>
            <div>
              {navigation.map(([target, label, Icon]) => (
                <button
                  key={target}
                  type="button"
                  onClick={() => navigate(voltageAdminPath(target))}
                  className={activeView === target ? "is-active" : ""}
                >
                  <Icon className="size-4" />
                  {label}
                  {(pendingCounts[target] ?? 0) > 0 ? (
                    <span>{pendingCounts[target]}</span>
                  ) : null}
                </button>
              ))}
            </div>
            <aside>
              <BarChart3 className="size-4" />
              <p>
                Data is sourced from an embedded, anonymous product catalog.
              </p>
            </aside>
          </nav>

          <div className="voltage-admin-outlet min-h-0 min-w-0 overflow-y-auto overscroll-contain pt-4 pb-4 sm:pt-6 sm:pb-6">
            <Outlet />
          </div>
        </div>
      </div>
    </main>
  )
}
