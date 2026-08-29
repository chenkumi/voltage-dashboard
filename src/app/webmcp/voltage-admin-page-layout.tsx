import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

export type PageBreadcrumb = { label: string; to?: string }

const derivePageName = (ariaLabel: string) =>
  ariaLabel.replace(/^Voltage Dashboard\s+/i, "").trim()

const pageNameFromAriaLabel = (ariaLabel: string) => {
  const derived = derivePageName(ariaLabel)
  return derived === "Overview" ? "Dashboard" : derived
}

export const PageLayout = ({
  ariaLabel,
  pageName,
  breadcrumb,
  status,
  actions,
  children,
}: {
  ariaLabel: string
  pageName?: string
  breadcrumb?: readonly PageBreadcrumb[]
  status?: ReactNode
  actions?: ReactNode
  /** Legacy display copy is accepted but intentionally not rendered. */
  eyebrow?: string
  /** Legacy display copy is accepted but intentionally not rendered. */
  title?: string
  /** Legacy display copy is accepted but intentionally not rendered. */
  detail?: string
  children: ReactNode
}) => {
  const { t } = useTranslation()
  const rawPageName = pageName ?? pageNameFromAriaLabel(ariaLabel)
  const resolvedPageName = t(rawPageName)
  const resolvedBreadcrumb =
    breadcrumb ??
    (rawPageName === "Dashboard"
      ? [{ label: "Dashboard" }]
      : [{ label: "Dashboard" }, { label: resolvedPageName }])

  return (
    <section className="grid gap-2 px-1" aria-label={ariaLabel}>
      <div className="p-1">
        <header className="enterprise-page-header">
          <div>
            <nav aria-label="Breadcrumb">
              <ol>
                {resolvedBreadcrumb.map((item, index) => (
                  <li key={`${item.label}-${index}`}>
                    {item.to ? (
                      <Link to={item.to}>{t(item.label)}</Link>
                    ) : (
                      t(item.label)
                    )}
                  </li>
                ))}
              </ol>
            </nav>
            <div className="enterprise-page-title-row">
              <h1>{resolvedPageName}</h1>
              {status ? <div>{status}</div> : null}
            </div>
          </div>
          {actions ? (
            <div className="enterprise-page-actions">{actions}</div>
          ) : null}
        </header>
      </div>
      <div className="grid grid-cols-12 gap-2">{children}</div>
    </section>
  )
}

export const GridBlock = ({
  children,
  className = "col-span-12",
}: {
  children: ReactNode
  className?: string
}) => <div className={`p-1 ${className}`}>{children}</div>
