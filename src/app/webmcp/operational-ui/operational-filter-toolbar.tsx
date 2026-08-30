import {
  cloneElement,
  type ChangeEvent,
  type ReactElement,
  type ReactNode,
  useId,
  useState,
} from "react"
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export interface OperationalSelectOption {
  value: string
  label: string
}

export function OperationalToolbarSearch({
  value,
  onChange,
  placeholder,
  label,
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  label: string
  className?: string
}) {
  return (
    <label className={cn("relative min-w-56 flex-1", className)}>
      <span className="sr-only">{label}</span>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <input
        type="search"
        value={value}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          onChange(event.target.value)
        }
        placeholder={placeholder}
        className="h-9 w-full rounded-lg border border-input bg-transparent pr-3 pl-9 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
    </label>
  )
}

export function OperationalToolbarSelect({
  label,
  value,
  options,
  onValueChange,
  className,
}: {
  label: string
  value: string
  options: readonly OperationalSelectOption[]
  onValueChange: (value: string) => void
  className?: string
}) {
  const selected = options.find((option) => option.value === value)

  return (
    <Select value={value} onValueChange={(next) => onValueChange(String(next))}>
      <SelectTrigger aria-label={label} className={cn("h-9 w-40", className)}>
        <SelectValue>
          <span className="truncate">
            {label}: {selected?.label ?? value}
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="start">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function OperationalFilterToolbar({
  search,
  primaryFilters,
  moreFilter,
  mobileFilter,
}: {
  search: ReactNode
  primaryFilters: ReactNode
  moreFilter: ReactNode
  mobileFilter: ReactNode
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      {search}
      <div className="hidden shrink-0 items-center gap-2 lg:flex">
        {primaryFilters}
        {moreFilter}
      </div>
      <div className="shrink-0 lg:hidden">{mobileFilter}</div>
    </div>
  )
}

export function OperationalFilterButton({
  kind,
  label,
  activeCount = 0,
  ...props
}: {
  kind: "more" | "filter"
  label: string
  activeCount?: number
} & Omit<React.ComponentProps<typeof Button>, "children">) {
  const Icon = kind === "more" ? SlidersHorizontal : Filter

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={label}
            title={label}
            {...props}
          />
        }
      >
        <Icon aria-hidden="true" />
        {activeCount > 0 ? (
          <span className="absolute -top-1 -right-1 grid size-4 place-items-center rounded-full bg-primary text-[10px] text-primary-foreground">
            {activeCount}
          </span>
        ) : null}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export type OperationalFilterErrors = Readonly<Record<string, string>>

interface OperationalFilterPopoverRenderProps<T> {
  draft: T
  setDraft: React.Dispatch<React.SetStateAction<T>>
  errors: OperationalFilterErrors
  getErrorProps: (field: string) => {
    "aria-invalid": true | undefined
    "aria-describedby": string | undefined
  }
  errorIdFor: (field: string) => string
}

export function OperationalFilterPopover<T>({
  value,
  emptyValue,
  onApply,
  validate = () => ({}),
  trigger,
  title,
  description,
  labels,
  children,
}: {
  value: T
  emptyValue: T
  onApply: (value: T) => void
  validate?: (value: T) => OperationalFilterErrors
  trigger: ReactElement
  title: string
  description?: string
  labels: { clear: string; cancel: string; apply: string }
  children: (props: OperationalFilterPopoverRenderProps<T>) => ReactNode
}) {
  const errorId = useId()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<T>(() => structuredClone(value))
  const [errors, setErrors] = useState<OperationalFilterErrors>({})

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setDraft(structuredClone(value))
      setErrors({})
    }
    setOpen(nextOpen)
  }

  const handleApply = () => {
    const nextErrors = validate(draft)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    onApply(structuredClone(draft))
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={cloneElement(trigger as ReactElement<Record<string, unknown>>, {
          "aria-expanded": open,
          "aria-controls": `${errorId}-content`,
        })}
      />
      <PopoverContent
        id={`${errorId}-content`}
        align="end"
        className="max-h-[min(36rem,var(--available-height))] w-[min(34rem,calc(100vw-1rem))] gap-0 overflow-hidden p-0"
      >
        <PopoverHeader className="border-b px-4 py-3">
          <PopoverTitle>{title}</PopoverTitle>
          {description ? (
            <PopoverDescription>{description}</PopoverDescription>
          ) : null}
        </PopoverHeader>
        <div className="max-h-[min(26rem,var(--available-height))] overflow-y-auto p-4">
          {children({
            draft,
            setDraft,
            errors,
            getErrorProps: (field) => ({
              "aria-invalid": errors[field] ? true : undefined,
              "aria-describedby": errors[field]
                ? `${errorId}-${field}`
                : undefined,
            }),
            errorIdFor: (field) => `${errorId}-${field}`,
          })}
          {Object.keys(errors).length > 0 ? (
            <div
              id={errorId}
              role="alert"
              className="mt-3 rounded-md bg-destructive/10 p-2 text-xs text-destructive"
            >
              {Object.entries(errors).map(([field, error]) => (
                <p id={`${errorId}-${field}`} key={field}>
                  {error}
                </p>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-2 border-t bg-muted/30 px-4 py-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setDraft(structuredClone(emptyValue))
              setErrors({})
            }}
          >
            {labels.clear}
          </Button>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              {labels.cancel}
            </Button>
            <Button type="button" onClick={handleApply}>
              {labels.apply}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export interface ActiveOperationalFilter {
  id: string
  label: string
  onRemove: () => void
}

export function ActiveFilterSummary({
  resultLabel,
  filters,
  clearAllLabel,
  onClearAll,
}: {
  resultLabel: string
  filters: readonly ActiveOperationalFilter[]
  clearAllLabel: string
  onClearAll: () => void
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
      <span className="mr-auto text-muted-foreground">{resultLabel}</span>
      {filters.map((filter) => (
        <span
          key={filter.id}
          className="inline-flex h-7 max-w-56 items-center gap-1 rounded-md bg-muted px-2"
        >
          <span className="truncate">{filter.label}</span>
          <button
            type="button"
            aria-label={`${filter.label} remove`}
            className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            onClick={filter.onRemove}
          >
            <X aria-hidden="true" className="size-3" />
          </button>
        </span>
      ))}
      {filters.length > 0 ? (
        <Button type="button" variant="ghost" size="sm" onClick={onClearAll}>
          {clearAllLabel}
        </Button>
      ) : null}
    </div>
  )
}

export function OperationalPagination({
  page,
  pageCount,
  ariaLabel = "Pagination",
  previousLabel,
  nextLabel,
  onPageChange,
}: {
  page: number
  pageCount: number
  ariaLabel?: string
  previousLabel: string
  nextLabel: string
  onPageChange: (page: number) => void
}) {
  return (
    <nav aria-label={ariaLabel} className="flex items-center justify-end gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        <ChevronLeft aria-hidden="true" />
        <span className="hidden sm:inline">{previousLabel}</span>
      </Button>
      <span className="min-w-16 text-center text-xs text-muted-foreground tabular-nums">
        {page} / {Math.max(pageCount, 1)}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={page >= pageCount}
        onClick={() => onPageChange(page + 1)}
      >
        <span className="hidden sm:inline">{nextLabel}</span>
        <ChevronRight aria-hidden="true" />
      </Button>
    </nav>
  )
}
