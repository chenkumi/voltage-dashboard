import { useEffect, useEffectEvent, useId, useRef } from "react"
import { createPortal } from "react-dom"
import { TriangleAlert } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"

export const ConfirmationDialog = ({
  open,
  title,
  description,
  confirmLabel,
  error,
  busy = false,
  onCancel,
  onConfirm,
}: {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  error?: string
  busy?: boolean
  onCancel: () => void
  onConfirm: () => void
}) => {
  const { t } = useTranslation()
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const busyStatusRef = useRef<HTMLParagraphElement>(null)
  const cancelIfIdle = useEffectEvent(() => {
    if (!busy) onCancel()
  })

  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement
    const application = document.querySelector<HTMLElement>(".enterprise-shell")
    if (application) application.inert = true
    cancelRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancelIfIdle()
      if (event.key !== "Tab") return
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        "button:not(:disabled)"
      )
      if (!focusable?.length) return
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
      if (application) application.inert = false
      if (previousFocus instanceof HTMLElement) previousFocus.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    if (busy) busyStatusRef.current?.focus()
    else if (document.activeElement === document.body)
      cancelRef.current?.focus()
  }, [busy, open])

  if (!open) return null

  return createPortal(
    <div className="product-confirmation-backdrop">
      <div
        ref={dialogRef}
        className="product-confirmation-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <span className="product-confirmation-icon">
          <TriangleAlert />
        </span>
        <div>
          <h2 id={titleId}>{title}</h2>
          <p id={descriptionId}>{description}</p>
          {error ? (
            <p className="product-confirmation-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        {busy ? (
          <p
            ref={busyStatusRef}
            className="product-confirmation-status"
            role="status"
            tabIndex={-1}
          >
            {t("Working…")}
          </p>
        ) : null}
        <div className="product-confirmation-actions">
          <Button
            ref={cancelRef}
            type="button"
            variant="outline"
            aria-disabled={busy}
            onClick={() => {
              if (!busy) onCancel()
            }}
          >
            {t("Cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
