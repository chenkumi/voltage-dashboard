import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import type { ReturnReviewNoteSession } from "./return-repository"
import type {
  ReturnReviewCategory,
  ReturnReviewNote,
  ReturnReviewRecommendation,
  ReturnReviewStage,
} from "./types"
import {
  RETURN_REVIEW_CATEGORIES,
  RETURN_REVIEW_RECOMMENDATIONS,
  RETURN_REVIEW_STAGES,
} from "./types"

type NoteDraft = {
  category: ReturnReviewCategory
  recommendation: ReturnReviewRecommendation | null
  evidenceCodes: string
  content: string
}

const emptyDraft = (): NoteDraft => ({
  category: "internal_note",
  recommendation: null,
  evidenceCodes: "",
  content: "",
})

const toDraft = (note: ReturnReviewNote | null): NoteDraft =>
  note
    ? {
        category: note.category,
        recommendation: note.recommendation,
        evidenceCodes: note.evidenceCodes.join(", "),
        content: note.content,
      }
    : emptyDraft()

const parseEvidenceCodes = (value: string) =>
  value
    .split(",")
    .map((code) => code.trim())
    .filter(Boolean)

export const ReturnNoteEditor = ({
  rmaId,
  currentStage,
  notes,
  session,
}: {
  rmaId: string
  currentStage: ReturnReviewStage
  notes: readonly ReturnReviewNote[]
  session: ReturnReviewNoteSession
}) => {
  const [stage, setStage] = useState(currentStage)
  const [saved, setSaved] = useState<ReturnReviewNote | null>(null)
  const [draft, setDraft] = useState<NoteDraft>(emptyDraft)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("Loading draft…")
  const otherDrafts = useMemo(
    () =>
      notes.filter(
        (note) =>
          note.rmaId === rmaId && note.status === "draft" && note.stage !== stage
      ),
    [notes, rmaId, stage]
  )
  const published = useMemo(
    () =>
      notes.filter(
        (note) => note.rmaId === rmaId && note.status === "published"
      ),
    [notes, rmaId]
  )
  const editableStages = useMemo(
    () =>
      Array.from(
        new Set<ReturnReviewStage>([
          currentStage,
          ...notes
            .filter((note) => note.rmaId === rmaId && note.status === "draft")
            .map((note) => note.stage),
        ])
      ).sort(
        (left, right) =>
          RETURN_REVIEW_STAGES.indexOf(left) - RETURN_REVIEW_STAGES.indexOf(right)
      ),
    [currentStage, notes, rmaId]
  )

  useEffect(() => {
    let active = true
    setDirty(false)
    setMessage("Loading draft…")
    void session
      .getDraft(rmaId, stage)
      .then((note) => {
        if (!active) return
        setSaved(note)
        setDraft(toDraft(note))
        setMessage(note ? `Draft restored · version ${note.version}` : "No draft yet")
      })
      .catch(() => {
        if (active) setMessage("Draft could not be loaded.")
      })
    return () => {
      active = false
    }
  }, [rmaId, session, stage])

  useEffect(() => {
    if (!dirty || !draft.content.trim()) return
    const timeout = window.setTimeout(() => {
      setBusy(true)
      void session
        .saveDraft(
          {
            rmaId,
            stage,
            category: draft.category,
            content: draft.content,
            recommendation:
              draft.category === "review_recommendation"
                ? draft.recommendation
                : null,
            evidenceCodes: parseEvidenceCodes(draft.evidenceCodes),
            supersedesNoteId: saved?.supersedesNoteId ?? null,
          },
          saved?.version ?? 0,
          "ui"
        )
        .then((note) => {
          setSaved(note)
          setDirty(false)
          setMessage(`Automatically saved · version ${note.version}`)
        })
        .catch(async (error: unknown) => {
          if (
            error &&
            typeof error === "object" &&
            "code" in error &&
            error.code === "VERSION_CONFLICT"
          ) {
            const current = await session.getDraft(rmaId, stage)
            setSaved(current)
            setDraft(toDraft(current))
            setDirty(false)
            setMessage("A newer draft was loaded. Review it before continuing.")
            return
          }
          setMessage("Draft could not be saved.")
        })
        .finally(() => setBusy(false))
    }, 500)
    return () => window.clearTimeout(timeout)
  }, [dirty, draft, rmaId, saved, session, stage])

  const update = (patch: Partial<NoteDraft>) => {
    setDraft((current) => ({ ...current, ...patch }))
    setDirty(true)
    setMessage("Unsaved changes")
  }
  const reloadAfterConflict = async (targetStage = stage) => {
    const current = await session.getDraft(rmaId, targetStage)
    if (targetStage === stage) {
      setSaved(current)
      setDraft(toDraft(current))
      setDirty(false)
    }
    setMessage("A newer draft was loaded. Review it before continuing.")
  }
  const isVersionConflict = (error: unknown) =>
    Boolean(
      error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "VERSION_CONFLICT"
    )
  const discard = async () => {
    if (!saved) return
    setBusy(true)
    try {
      await session.discardDraft(rmaId, stage, saved.version)
      setSaved(null)
      setDraft(emptyDraft())
      setDirty(false)
      setMessage("Draft discarded")
    } catch (error) {
      if (isVersionConflict(error)) await reloadAfterConflict()
      else setMessage("Draft could not be discarded.")
    } finally {
      setBusy(false)
    }
  }
  const publish = async () => {
    if (!saved || dirty) return
    setBusy(true)
    try {
      await session.publishDraft(rmaId, stage, saved.version)
      setSaved(null)
      setDraft(emptyDraft())
      setMessage("Added to review notes")
    } catch (error) {
      if (isVersionConflict(error)) await reloadAfterConflict()
      else setMessage("Draft could not be published.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="grid gap-4" aria-label="Review notes">
      {otherDrafts.length > 0 ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          {otherDrafts.map((note) => (
            <p key={note.id}>
              You have an unpublished draft in {note.stage}.{" "}
              <Button variant="link" onClick={() => setStage(note.stage)}>
                Continue editing
              </Button>
              <Button
                variant="link"
                onClick={() => {
                  setBusy(true)
                  void session
                    .discardDraft(rmaId, note.stage, note.version)
                    .then(() => setMessage("Older draft discarded"))
                    .catch(async (error: unknown) => {
                      if (isVersionConflict(error))
                        await reloadAfterConflict(note.stage)
                      else setMessage("Draft could not be discarded.")
                    })
                    .finally(() => setBusy(false))
                }}
              >
                Discard
              </Button>
            </p>
          ))}
        </div>
      ) : null}
      <div className="grid gap-3 rounded-md border p-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1 text-sm">
            Stage
            <select
              className="h-9 rounded-md border border-input bg-transparent px-3"
              value={stage}
              onChange={(event) => setStage(event.target.value as ReturnReviewStage)}
            >
              {editableStages.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Type
            <select
              className="h-9 rounded-md border border-input bg-transparent px-3"
              value={draft.category}
              onChange={(event) =>
                update({
                  category: event.target.value as ReturnReviewCategory,
                  recommendation: null,
                })
              }
            >
              {RETURN_REVIEW_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          {draft.category === "review_recommendation" ? (
            <label className="grid gap-1 text-sm">
              Recommendation
              <select
                className="h-9 rounded-md border border-input bg-transparent px-3"
                value={draft.recommendation ?? ""}
                onChange={(event) =>
                  update({
                    recommendation:
                      event.target.value as ReturnReviewRecommendation,
                  })
                }
              >
                <option value="">Select recommendation</option>
                {RETURN_REVIEW_RECOMMENDATIONS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        <label className="grid gap-1 text-sm">
          Evidence codes (comma separated)
          <input
            className="h-9 rounded-md border border-input bg-transparent px-3"
            value={draft.evidenceCodes}
            onChange={(event) => update({ evidenceCodes: event.target.value })}
          />
        </label>
        <label className="grid gap-1 text-sm">
          Note
          <textarea
            className="min-h-28 rounded-md border border-input bg-transparent p-3"
            maxLength={1_000}
            value={draft.content}
            onChange={(event) => update({ content: event.target.value })}
          />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p role="status" className="text-xs text-muted-foreground">
            {message}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" disabled={busy || !saved} onClick={() => void discard()}>
              Discard draft
            </Button>
            <Button disabled={busy || !saved || dirty} onClick={() => void publish()}>
              Add to review notes
            </Button>
          </div>
        </div>
      </div>
      <div className="grid gap-2">
        <h3 className="font-semibold">Published notes</h3>
        {published.length > 0 ? (
          published.map((note) => (
            <article key={note.id} className="rounded-md border p-3 text-sm">
              <strong>
                {note.stage} · {note.category}
                {note.recommendation ? `: ${note.recommendation}` : ""}
              </strong>
              <p>{note.content}</p>
              <small className="text-muted-foreground">
                {note.authorUserId} · {note.publishedAt}
              </small>
            </article>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No published notes.</p>
        )}
      </div>
    </section>
  )
}
