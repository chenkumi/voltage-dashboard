import type { ReactNode } from "react"

const SectionTitle = ({
  eyebrow,
  title,
  detail,
}: {
  eyebrow: string
  title: string
  detail: string
}) => (
  <div className="voltage-admin-title">
    <p>{eyebrow}</p>
    <h1>{title}</h1>
    <span>{detail}</span>
  </div>
)

export const PageLayout = ({
  ariaLabel,
  eyebrow,
  title,
  detail,
  children,
}: {
  ariaLabel: string
  eyebrow: string
  title: string
  detail: string
  children: ReactNode
}) => (
  <section className="grid gap-2 px-1.5" aria-label={ariaLabel}>
    <div className="p-1">
      <SectionTitle eyebrow={eyebrow} title={title} detail={detail} />
    </div>
    <div className="grid grid-cols-12 gap-2">{children}</div>
  </section>
)

export const GridBlock = ({
  children,
  className = "col-span-12",
}: {
  children: ReactNode
  className?: string
}) => <div className={`p-1 ${className}`}>{children}</div>
