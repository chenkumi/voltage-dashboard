import { useDemoAuth } from "@/app/auth/demo-auth"
import {
    BarChart3,
    Bell,
    Boxes,
    ChevronRight,
    ClipboardList,
    FileChartColumn,
    Languages,
    LayoutDashboard,
    LogOut,
    Menu,
    PackageSearch,
    Search,
    ShieldCheck,
    Undo2,
    Users,
    X,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Outlet, useLocation, useNavigate } from "react-router-dom"
import { DUMMYJSON_PRODUCTS_SOURCE } from "./products/product-seed"
import { useVoltageAdmin } from "./voltage-admin"
import "./voltage-admin.css"

type NavigationItem = {
    label: string
    path: string
    icon: typeof LayoutDashboard
    badge?: number
}

type NavigationGroup = {
    label: string
    items: readonly NavigationItem[]
}

const isActivePath = (pathname: string, target: string) =>
    pathname === target || pathname.startsWith(`${target}/`)

export const EnterpriseAdminShell = () => {
    const { t, i18n } = useTranslation()
    const navigate = useNavigate()
    const location = useLocation()
    const { signOut } = useDemoAuth()
    const { dashboard, returns } = useVoltageAdmin()
    const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false)
    const menuButtonRef = useRef<HTMLButtonElement>(null)
    const sidebarRef = useRef<HTMLElement>(null)
    const groups: readonly NavigationGroup[] = [
        {
            label: "Overview",
            items: [
                { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
            ],
        },
        {
            label: "Product management",
            items: [
                { label: "Products", path: "/products", icon: PackageSearch },
                {
                    label: "Inventory",
                    path: "/inventory",
                    icon: Boxes,
                    badge: dashboard.lowStockCount,
                },
            ],
        },
        {
            label: "Orders and customers",
            items: [
                { label: "Orders", path: "/orders", icon: ClipboardList },
                { label: "Customers", path: "/customers", icon: Users },
            ],
        },
        {
            label: "After-sales management",
            items: [
                {
                    label: "Returns",
                    path: "/returns",
                    icon: Undo2,
                    badge: returns.rmas.filter(({ status }) => status === "active")
                        .length,
                },
                {
                    label: "Refunds",
                    path: "/refund-approvals",
                    icon: ShieldCheck,
                    badge: returns.approvals.filter(({ status }) => status === "pending")
                        .length,
                },
            ],
        },
        {
            label: "Analytics",
            items: [{ label: "Reports", path: "/reports", icon: FileChartColumn }],
        },
    ]

    const openPage = (path: string) => {
        navigate(path)
        setMobileNavigationOpen(false)
    }

    useEffect(() => {
        if (!mobileNavigationOpen) return
        const previousFocus = document.activeElement
        const menuButton = menuButtonRef.current
        const sidebar = sidebarRef.current
        const focusable = sidebar?.querySelectorAll<HTMLElement>("button, a[href]")
        focusable?.[0]?.focus()

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setMobileNavigationOpen(false)
                return
            }
            if (event.key !== "Tab" || !focusable?.length) return
            const first = focusable[0]
            const last = focusable[focusable.length - 1]
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault()
                last.focus()
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault()
                first.focus()
            }
        }

        document.addEventListener("keydown", handleKeyDown)
        return () => {
            document.removeEventListener("keydown", handleKeyDown)
            if (previousFocus instanceof HTMLElement) previousFocus.focus()
            else menuButton?.focus()
        }
    }, [mobileNavigationOpen])

    return (
        <main className="voltage-admin enterprise-shell h-full overflow-hidden">
            <header className="enterprise-topbar">
                <div className="enterprise-topbar-leading">
                    <button
                        ref={menuButtonRef}
                        className="enterprise-mobile-menu"
                        type="button"
                        aria-expanded={mobileNavigationOpen}
                        aria-label={t(
                            mobileNavigationOpen ? "Close navigation" : "Open navigation"
                        )}
                        onClick={() => setMobileNavigationOpen((current) => !current)}
                    >
                        {mobileNavigationOpen ? <X /> : <Menu />}
                    </button>
                    <button
                        className="enterprise-wordmark"
                        inert={mobileNavigationOpen}
                        type="button"
                        onClick={() => openPage("/dashboard")}
                    >
                        <span>V</span>
                        <strong>Voltage</strong>
                    </button>
                </div>

                <div className="enterprise-topbar-actions" inert={mobileNavigationOpen}>
                    <button
                        className="enterprise-global-search"
                        type="button"
                        aria-label={t("Search products")}
                        onClick={() => openPage("/products")}
                    >
                        <Search />
                        <span>{t("Search products")}</span>
                        <kbd>/</kbd>
                    </button>
                    <button
                        className="enterprise-icon-button"
                        type="button"
                        aria-label={t("Notifications")}
                        title={t("Notifications")}
                        onClick={() => openPage("/refund-approvals")}
                    >
                        <Bell />
                    </button>
                    <label className="enterprise-locale-button">
                        <Languages />
                        <span className="sr-only">{t("Switch language")}</span>
                        <select
                            aria-label={t("Switch language")}
                            value={i18n.resolvedLanguage === "zh-TW" ? "zh-TW" : "en"}
                            onChange={(event) => void i18n.changeLanguage(event.target.value)}
                        >
                            <option value="en">{t("English")}</option>
                            <option value="zh-TW">{t("Traditional Chinese")}</option>
                        </select>
                    </label>
                    <button
                        className="enterprise-account-button"
                        type="button"
                        aria-label={t("Sign out")}
                        title={t("Sign out")}
                        onClick={() => void signOut()}
                    >
                        <LogOut />
                    </button>
                </div>
            </header>

            <div className="enterprise-workspace">
                <aside
                    ref={sidebarRef}
                    className="enterprise-sidebar"
                    data-open={mobileNavigationOpen ? "true" : "false"}
                    aria-label={t("Primary navigation")}
                >
                    <nav>
                        {groups.map((group) => (
                            <section key={group.label} className="enterprise-nav-group">
                                <h2>{t(group.label)}</h2>
                                <div>
                                    {group.items.map((item) => {
                                        const Icon = item.icon
                                        const active = isActivePath(location.pathname, item.path)
                                        return (
                                            <button
                                                key={item.path}
                                                type="button"
                                                className={active ? "is-active" : ""}
                                                aria-current={active ? "page" : undefined}
                                                onClick={() => openPage(item.path)}
                                            >
                                                <Icon />
                                                <span>{t(item.label)}</span>
                                                {item.badge ? <small>{item.badge}</small> : null}
                                                <ChevronRight className="enterprise-nav-chevron" />
                                            </button>
                                        )
                                    })}
                                </div>
                            </section>
                        ))}
                    </nav>
                    <footer>
                        <BarChart3 />
                        <span>
                            {t("Product sample data from")}{" "}
                            <a
                                href={DUMMYJSON_PRODUCTS_SOURCE}
                                target="_blank"
                                rel="noreferrer"
                            >
                                DummyJSON
                            </a>
                        </span>
                    </footer>
                </aside>

                {mobileNavigationOpen ? (
                    <button
                        className="enterprise-sidebar-backdrop"
                        type="button"
                        aria-label={t("Close navigation")}
                        onClick={() => setMobileNavigationOpen(false)}
                    />
                ) : null}

                <div className="enterprise-outlet" inert={mobileNavigationOpen}>
                    <Outlet />
                </div>
            </div>
        </main>
    )
}
