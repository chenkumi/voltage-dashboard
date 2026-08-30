import type { ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export type OperationalMetricTone =
  "neutral" | "positive" | "warning" | "critical"

const toneTitleClasses: Record<OperationalMetricTone, string> = {
  neutral: "text-muted-foreground",
  positive: "text-emerald-700",
  warning: "text-amber-700",
  critical: "text-destructive",
}

export interface OperationalMetricCardProps {
  label: string
  value?: ReactNode
  detail?: ReactNode
  badge?: ReactNode
  headerAction?: ReactNode
  children?: ReactNode
  tone?: OperationalMetricTone
  loading?: boolean
  unavailableLabel?: string
  unavailableDetail?: ReactNode
  className?: string
}

export function OperationalMetricCard({
  label,
  value,
  detail,
  badge,
  headerAction,
  children,
  tone = "neutral",
  loading = false,
  unavailableLabel = "—",
  unavailableDetail = "Unavailable",
  className,
}: OperationalMetricCardProps) {
  return (
    <Card size="sm" className={cn("gap-0 bg-[rgb(245,246,241)]", className)}>
      <CardContent className="grid gap-2">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <span
            className={cn(
              "truncate text-xs font-medium",
              toneTitleClasses[tone]
            )}
          >
            {label}
          </span>
          {headerAction}
          {badge ? <Badge variant="outline">{badge}</Badge> : null}
        </div>
        {children ??
          (loading ? (
            <>
              <Skeleton className="h-7 w-24" aria-label={`${label} loading`} />
              <Skeleton className="h-4 w-32" />
            </>
          ) : (
            <>
              <strong className="text-2xl leading-none font-semibold tracking-tight tabular-nums">
                {value ?? unavailableLabel}
              </strong>
              {detail || value == null ? (
                <span className="line-clamp-2 text-xs text-muted-foreground">
                  {value == null ? unavailableDetail : detail}
                </span>
              ) : null}
            </>
          ))}
      </CardContent>
    </Card>
  )
}
