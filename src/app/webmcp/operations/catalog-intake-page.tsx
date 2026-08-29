import { Check, Eye, FilePenLine, ShieldCheck } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { GridBlock, PageLayout } from "../voltage-admin-page-layout"
import { useVoltageAdmin } from "../voltage-admin"
import { PRODUCT_CATEGORIES } from "./types"
import type {
  CatalogCandidate,
  ProductCategory,
  ProductDraft,
  ProductDraftInput,
} from "./types"

const specificationFields = [
  ["material", "Material"],
  ["capacity", "Capacity"],
  ["origin", "Origin"],
  ["power", "Power"],
  ["runtime", "Runtime"],
  ["warranty", "Warranty"],
] as const

const fieldLabel: Record<CatalogCandidate["missingFields"][number], string> = {
  title: "Title",
  category: "Category",
  description: "Description",
  specifications: "Specifications",
}

const CatalogCandidateCard = ({
  candidate,
  active,
  draft,
  onSelect,
}: {
  candidate: CatalogCandidate
  active: boolean
  draft?: ProductDraft
  onSelect: () => void
}) => {
  const { t } = useTranslation()

  return (
    <button
      type="button"
      className={`voltage-admin-candidate ${active ? "is-active" : ""}`}
      onClick={onSelect}
      aria-pressed={active}
    >
      <span className="voltage-admin-candidate-heading">
        <span>
          <small>{candidate.id}</small>
          <strong>{candidate.sourceTitle}</strong>
        </span>
        <Badge
          className={
            candidate.sourceTrust === "verified"
              ? "bg-[#e5eee7] text-[#48614c]"
              : "bg-[#ece8d9] text-[#6e6746]"
          }
        >
          {candidate.sourceTrust === "verified"
            ? t("Verified")
            : t("Review source")}
        </Badge>
      </span>
      <span className="voltage-admin-candidate-meta">
        {candidate.sourceLabel} · {candidate.sourceUpdatedAt.slice(0, 10)}
      </span>
      <span className="voltage-admin-chip-row">
        {candidate.missingFields.map((field) => (
          <span key={field}>
            {t("{{field}} missing", { field: t(fieldLabel[field]) })}
          </span>
        ))}
      </span>
      {draft ? (
        <span className="voltage-admin-candidate-status">
          <Check className="size-3.5" /> {t("Draft")} {t(draft.status)}
        </span>
      ) : null}
    </button>
  )
}

const ProductDraftEditor = ({
  candidate,
  draft,
}: {
  candidate: CatalogCandidate
  draft?: ProductDraft
}) => {
  const { t } = useTranslation()
  const { operationsController } = useVoltageAdmin()
  const [title, setTitle] = useState(draft?.title ?? candidate.sourceTitle)
  const [category, setCategory] = useState(
    draft?.category ?? candidate.suggestedCategory
  )
  const [description, setDescription] = useState(
    draft?.description ?? candidate.sourceSummary
  )
  const [specifications, setSpecifications] = useState<Record<string, string>>(
    draft?.specifications ?? candidate.specifications
  )
  const [preview, setPreview] = useState(false)
  const [message, setMessage] = useState("")
  const published = draft?.status === "published"

  const input = (): ProductDraftInput => ({
    candidateId: candidate.id,
    title: title.trim(),
    category,
    description: description.trim(),
    specifications: Object.fromEntries(
      Object.entries(specifications).filter(([, value]) => value.trim())
    ),
  })

  const save = () => {
    try {
      operationsController.saveProductDraft(input(), "user")
      setMessage(t("Draft saved to the local review workspace."))
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : t("Draft was not saved.")
      )
    }
  }

  const publish = () => {
    try {
      operationsController.publishProduct(input(), "user")
      setPreview(false)
      setMessage(t("Product published in the demo workspace."))
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : t("Product was not published.")
      )
    }
  }

  return (
    <article className="voltage-admin-panel">
      <div className="voltage-admin-panel-heading">
        <div>
          <p>{t("Product draft")}</p>
          <h2>
            {published ? t("Published record") : t("Prepare for human review")}
          </h2>
        </div>
        <Badge className="bg-[#e4eaed] text-[#4f6975]">
          {draft
            ? `v${draft.version} · ${t(draft.lastEditedBy)}`
            : t("Not saved")}
        </Badge>
      </div>

      <div className="voltage-admin-form-grid">
        <label className="voltage-admin-field sm:col-span-2">
          <span>{t("Product title")}</span>
          <input
            value={title}
            maxLength={120}
            disabled={published}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label className="voltage-admin-field sm:col-span-2">
          <span>{t("Category")}</span>
          <select
            value={category}
            disabled={published}
            onChange={(event) =>
              setCategory(event.target.value as ProductCategory)
            }
          >
            {PRODUCT_CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {t(item)}
              </option>
            ))}
          </select>
        </label>
        <label className="voltage-admin-field sm:col-span-2">
          <span>{t("Description")}</span>
          <textarea
            value={description}
            maxLength={600}
            rows={5}
            disabled={published}
            onChange={(event) => setDescription(event.target.value)}
          />
          <small>
            {t("{{count}}/600 characters", { count: description.length })}
          </small>
        </label>
        {specificationFields.map(([key, label]) => (
          <label key={key} className="voltage-admin-field">
            <span>{t(label)}</span>
            <input
              value={specifications[key] ?? ""}
              maxLength={120}
              disabled={published}
              onChange={(event) =>
                setSpecifications((current) => ({
                  ...current,
                  [key]: event.target.value,
                }))
              }
            />
          </label>
        ))}
      </div>

      <div className="voltage-admin-action-row">
        <span role="status">{message}</span>
        <div>
          <Button
            type="button"
            variant="outline"
            className="cursor-pointer"
            disabled={published}
            onClick={save}
          >
            <FilePenLine className="size-4" /> {t("Save draft")}
          </Button>
          <Button
            type="button"
            className="cursor-pointer"
            disabled={published}
            onClick={() => setPreview(true)}
          >
            <Eye className="size-4" /> {t("Preview")}
          </Button>
        </div>
      </div>

      {preview ? (
        <section
          className="voltage-admin-preview"
          aria-label={t("Publish preview")}
        >
          <div className="voltage-admin-panel-heading">
            <div>
              <p>{t("Human-only final action")}</p>
              <h2>{title || t("Untitled product")}</h2>
            </div>
            <ShieldCheck className="size-5" />
          </div>
          <p>{description || t("No description supplied.")}</p>
          <dl>
            <div>
              <dt>{t("Category")}</dt>
              <dd>{t(category)}</dd>
            </div>
            {Object.entries(input().specifications).map(([key, value]) => (
              <div key={key}>
                <dt>
                  {t(
                    specificationFields.find(([name]) => name === key)?.[1] ??
                      key
                  )}
                </dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <div className="voltage-admin-action-row">
            <span>
              {t(
                "This publishes only to local demo state. No external service is called."
              )}
            </span>
            <div>
              <Button
                type="button"
                variant="ghost"
                className="cursor-pointer"
                onClick={() => setPreview(false)}
              >
                {t("Keep editing")}
              </Button>
              <Button
                type="button"
                className="cursor-pointer"
                onClick={publish}
              >
                {t("Publish product")}
              </Button>
            </div>
          </div>
        </section>
      ) : null}
    </article>
  )
}

export const CatalogIntakePage = () => {
  const { t } = useTranslation()
  const { workflow } = useVoltageAdmin()
  const [selectedId, setSelectedId] = useState(workflow.candidates[0]?.id ?? "")
  const selected = workflow.candidates.find(({ id }) => id === selectedId)
  const selectedDraft = workflow.productDrafts.find(
    ({ candidateId }) => candidateId === selectedId
  )
  const unfinished = workflow.candidates.filter((candidate) => {
    const draft = workflow.productDrafts.find(
      ({ candidateId }) => candidateId === candidate.id
    )
    return !draft || draft.status === "draft"
  }).length

  return (
    <PageLayout
      ariaLabel={t("Catalog Intake")}
      pageName="Catalog Intake"
      eyebrow={t("Catalog operations")}
      title={t("Prepare product drafts for review.")}
      detail={t("{{count}} catalog candidates still need a complete draft.", {
        count: unfinished,
      })}
    >
      <GridBlock className="col-span-12 lg:col-span-4">
        <section
          className="voltage-admin-panel"
          aria-label={t("Catalog candidates")}
        >
          <div className="voltage-admin-panel-heading">
            <div>
              <p>{t("Source queue")}</p>
              <h2>{t("Catalog candidates")}</h2>
            </div>
            <Badge className="bg-[#e2e5df] text-[#4c574e]">
              {workflow.candidates.length}
            </Badge>
          </div>
          <div className="voltage-admin-candidate-list">
            {workflow.candidates.map((candidate) => (
              <CatalogCandidateCard
                key={candidate.id}
                candidate={candidate}
                active={candidate.id === selectedId}
                draft={workflow.productDrafts.find(
                  ({ candidateId }) => candidateId === candidate.id
                )}
                onSelect={() => setSelectedId(candidate.id)}
              />
            ))}
          </div>
        </section>
      </GridBlock>

      <GridBlock className="col-span-12 lg:col-span-8">
        {selected ? (
          <ProductDraftEditor
            key={`${selected.id}:${selectedDraft?.version ?? 0}`}
            candidate={selected}
            draft={selectedDraft}
          />
        ) : null}
      </GridBlock>

      {selected ? (
        <GridBlock>
          <article className="voltage-admin-panel">
            <div className="voltage-admin-panel-heading">
              <div>
                <p>{t("Untrusted source · display only")}</p>
                <h2>{t("Manufacturer data")}</h2>
              </div>
              <Badge className="bg-[#f4e5d7] text-[#8b5d3c]">
                {t("Never rendered as HTML")}
              </Badge>
            </div>
            <p className="voltage-admin-source-copy">
              {selected.sourceSummary}
            </p>
            <dl className="voltage-admin-source-specs">
              {Object.entries(selected.specifications).map(([key, value]) => (
                <div key={key}>
                  <dt>
                    {t(
                      specificationFields.find(([name]) => name === key)?.[1] ??
                        key
                    )}
                  </dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </article>
        </GridBlock>
      ) : null}
    </PageLayout>
  )
}
