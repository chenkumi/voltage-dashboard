import type { ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export type OperationalMetricTone =
  "neutral" | "positive" | "warning" | "critical"

const toneClasses: Record<OperationalMetricTone, string> = {
  neutral: "before:bg-muted-foreground/45",
  positive: "before:bg-emerald-500",
  warning: "before:bg-amber-500",
  critical: "before:bg-destructive",
}

export interface OperationalMetricCardProps {
  label: string
  value?: ReactNode
  detail?: ReactNode
  badge?: ReactNode
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
  tone = "neutral",
  loading = false,
  unavailableLabel = "—",
  unavailableDetail = "Unavailable",
  className,
}: OperationalMetricCardProps) {
  return (
    <Card
      size="sm"
      className={cn(
        "relative gap-0 before:absolute before:inset-y-3 before:left-0 before:w-0.5 before:rounded-full",
        toneClasses[tone],
        className
      )}
    >
      <CardContent className="grid gap-2 pl-4">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <span className="truncate text-xs font-medium text-muted-foreground">
            {label}
          </span>
          {badge ? <Badge variant="outline">{badge}</Badge> : null}
        </div>
        {loading ? (
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
        )}
      </CardContent>
    </Card>
  )
}
