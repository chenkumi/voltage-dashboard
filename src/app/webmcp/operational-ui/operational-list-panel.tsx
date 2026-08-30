import type { ReactNode } from "react"

import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export interface OperationalListPanelProps {
  toolbar: ReactNode
  summary?: ReactNode
  children: ReactNode
  pagination?: ReactNode
  className?: string
  contentClassName?: string
}

export function OperationalListPanel({
  toolbar,
  summary,
  children,
  pagination,
  className,
  contentClassName,
}: OperationalListPanelProps) {
  return (
    <Card className={cn("gap-0 py-0", className)}>
      <div className="border-b p-3">{toolbar}</div>
      {summary ? <div className="border-b px-3 py-2">{summary}</div> : null}
      <CardContent className={cn("min-w-0 px-0", contentClassName)}>
        {children}
      </CardContent>
      {pagination ? (
        <div className="border-t px-3 py-2">{pagination}</div>
      ) : null}
    </Card>
  )
}

export function OperationalListState({
  kind,
  children,
}: {
  kind: "loading" | "empty" | "error"
  children: ReactNode
}) {
  const role = kind === "error" ? "alert" : "status"

  return (
    <div
      role={role}
      className="grid min-h-40 place-items-center p-6 text-center text-sm text-muted-foreground"
    >
      {children}
    </div>
  )
}
