import { CheckCircle2, FileCheck2, Save, ShieldAlert } from "lucide-react"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useSearchParams } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { GridBlock, PageLayout } from "../voltage-admin-page-layout"
import { useVoltageAdmin } from "../voltage-admin"
import { checkReturnEligibility } from "./return-policy"
import type {
  CaseDraft,
  CaseDraftInput,
  EligibilityResult,
  OpsCase,
  OpsCaseType,
} from "./types"

const typeLabels: Record<OpsCaseType, string> = {
  fulfillment: "Fulfillment",
  payment_check: "Payment check",
  address_validation: "Address validation",
  return_request: "Return request",
}

const categoryForCase: Record<OpsCaseType, CaseDraft["category"]> = {
  fulfillment: "fulfillment_follow_up",
  payment_check: "payment_review",
  address_validation: "address_review",
  return_request: "return_review",
}

const categoryLabels: Record<CaseDraft["category"], string> = {
  fulfillment_follow_up: "Fulfillment follow-up",
  payment_review: "Payment status review",
  address_review: "Address validation review",
  return_review: "Return policy review",
}

const statusTone = (status: OpsCase["status"]) => {
  if (status === "resolved") return "bg-[#e5eee7] text-[#48614c]"
  if (status === "pending_review") return "bg-[#ece8d9] text-[#6e6746]"
  if (status === "drafted") return "bg-[#e4eaed] text-[#4f6975]"
  return "bg-[#f4e5d7] text-[#8b5d3c]"
}

const CaseCard = ({
  opsCase,
  active,
  onSelect,
}: {
  opsCase: OpsCase
  active: boolean
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
          <small>{opsCase.id}</small>
          <strong>{t(typeLabels[opsCase.type])}</strong>
        </span>
        <Badge className={statusTone(opsCase.status)}>
          {t(opsCase.status)}
        </Badge>
      </span>
      <span className="voltage-admin-candidate-meta">
        {t("Reason code · {{code}}", { code: opsCase.reasonCode })}
      </span>
      <span className="voltage-admin-chip-row">
        <span>
          {t("{{priority}} priority", { priority: t(opsCase.priority) })}
        </span>
        {opsCase.facts.slice(0, 2).map((fact) => (
          <span key={fact}>{fact}</span>
        ))}
      </span>
    </button>
  )
}

const EligibilityPanel = ({ result }: { result: EligibilityResult }) => {
  const { t } = useTranslation()

  return (
    <section
      className="voltage-admin-eligibility"
      aria-label={t("Return eligibility")}
    >
      <div>
        <p>{t("Deterministic policy result")}</p>
        <strong>{t(result.decision)}</strong>
      </div>
      <dl>
        <div>
          <dt>{t("Matched rules")}</dt>
          <dd>{result.matchedRules.join(", ") || t("None")}</dd>
        </div>
        <div>
          <dt>{t("Missing evidence")}</dt>
          <dd>{result.missingEvidence.join(", ") || t("None")}</dd>
        </div>
      </dl>
    </section>
  )
}

const CaseDraftEditor = ({
  opsCase,
  draft,
}: {
  opsCase: OpsCase
  draft?: CaseDraft
}) => {
  const { t } = useTranslation()
  const { operationsController } = useVoltageAdmin()
  const [category, setCategory] = useState<CaseDraft["category"]>(
    draft?.category ?? categoryForCase[opsCase.type]
  )
  const [priority, setPriority] = useState<CaseDraft["priority"]>(
    draft?.priority ?? opsCase.priority
  )
  const [evidence, setEvidence] = useState<string[]>(
    draft?.evidence ?? opsCase.facts
  )
  const [recommendation, setRecommendation] = useState(
    draft?.recommendation ?? "Review the safe status codes and route this case."
  )
  const [supportDraft, setSupportDraft] = useState(
    draft?.supportDraft ??
      "The request is under operational review. A final decision has not been made."
  )
  const [eligibility, setEligibility] = useState<EligibilityResult | undefined>(
    draft?.eligibility
  )
  const [message, setMessage] = useState("")
  const resolved = opsCase.status === "resolved"

  const input = (): CaseDraftInput => ({
    caseId: opsCase.id,
    category,
    priority,
    evidence,
    recommendation: recommendation.trim(),
    supportDraft: supportDraft.trim(),
    eligibility,
  })

  const save = () => {
    try {
      operationsController.saveCaseDraft(input(), "user")
      setMessage(t("Case draft saved without changing the underlying order."))
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Draft was not saved."
      )
    }
  }

  const queueReview = () => {
    try {
      operationsController.saveCaseDraft(input(), "user")
      operationsController.openCaseReview(opsCase.id, "user")
      setMessage(t("Case queued for a human final decision."))
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : t("Review was not opened.")
      )
    }
  }

  const resolve = () => {
    try {
      operationsController.resolveCase(input(), "user")
      setMessage(t("Case completed. No order action was performed."))
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : t("Case was not completed.")
      )
    }
  }

  return (
    <article className="voltage-admin-panel">
      <div className="voltage-admin-panel-heading">
        <div>
          <p>{t("Classification draft")}</p>
          <h2>{opsCase.id}</h2>
        </div>
        <Badge className={statusTone(opsCase.status)}>
          {draft
            ? `v${draft.version} · ${t(draft.lastEditedBy)}`
            : t("Not saved")}
        </Badge>
      </div>

      <div className="voltage-admin-form-grid">
        <label className="voltage-admin-field">
          <span>{t("Category")}</span>
          <select
            value={category}
            disabled={resolved}
            onChange={(event) =>
              setCategory(event.target.value as CaseDraft["category"])
            }
          >
            {Object.entries(categoryLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {t(label)}
              </option>
            ))}
          </select>
        </label>
        <label className="voltage-admin-field">
          <span>{t("Priority")}</span>
          <select
            value={priority}
            disabled={resolved}
            onChange={(event) =>
              setPriority(event.target.value as CaseDraft["priority"])
            }
          >
            <option value="low">{t("Low")}</option>
            <option value="medium">{t("Medium")}</option>
            <option value="high">{t("High")}</option>
          </select>
        </label>
        <fieldset className="voltage-admin-field sm:col-span-2">
          <legend>{t("Evidence status codes")}</legend>
          <div className="voltage-admin-check-grid">
            {opsCase.facts.map((fact) => (
              <label key={fact}>
                <input
                  type="checkbox"
                  checked={evidence.includes(fact)}
                  disabled={resolved}
                  onChange={(event) =>
                    setEvidence((current) =>
                      event.target.checked
                        ? [...current, fact]
                        : current.filter((item) => item !== fact)
                    )
                  }
                />
                {fact}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="voltage-admin-field sm:col-span-2">
          <span>{t("Recommended next step")}</span>
          <textarea
            value={recommendation}
            rows={3}
            maxLength={600}
            disabled={resolved}
            onChange={(event) => setRecommendation(event.target.value)}
          />
        </label>
        <label className="voltage-admin-field sm:col-span-2">
          <span>{t("Customer support draft")}</span>
          <textarea
            value={supportDraft}
            rows={4}
            maxLength={600}
            disabled={resolved}
            onChange={(event) => setSupportDraft(event.target.value)}
          />
        </label>
      </div>

      {opsCase.type === "return_request" ? (
        <div className="voltage-admin-policy-action">
          <Button
            type="button"
            variant="outline"
            className="cursor-pointer"
            disabled={resolved}
            onClick={() => setEligibility(checkReturnEligibility(opsCase))}
          >
            <ShieldAlert className="size-4" /> {t("Check return eligibility")}
          </Button>
          {eligibility ? <EligibilityPanel result={eligibility} /> : null}
        </div>
      ) : null}

      <div className="voltage-admin-action-row">
        <span role="status">{message}</span>
        <div>
          <Button
            type="button"
            variant="outline"
            className="cursor-pointer"
            disabled={resolved}
            onClick={save}
          >
            <Save className="size-4" /> {t("Save draft")}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="cursor-pointer"
            disabled={resolved}
            onClick={queueReview}
          >
            <FileCheck2 className="size-4" /> {t("Queue review")}
          </Button>
          <Button
            type="button"
            className="cursor-pointer"
            disabled={resolved}
            onClick={resolve}
          >
            <CheckCircle2 className="size-4" />
            {t("Complete case")}
          </Button>
        </div>
      </div>
      <p className="voltage-admin-safety-note">
        {t(
          "Completing this case does not refund, cancel, pay, or modify an order."
        )}
      </p>
    </article>
  )
}

export const OperationsCasesPage = () => {
  const { t } = useTranslation()
  const { workflow } = useVoltageAdmin()
  const [searchParams] = useSearchParams()
  const [typeFilter, setTypeFilter] = useState<OpsCaseType | "all">("all")
  const [statusFilter, setStatusFilter] = useState<OpsCase["status"] | "all">(
    "all"
  )
  const [priorityFilter, setPriorityFilter] = useState<
    OpsCase["priority"] | "all"
  >("all")
  const requestedCaseId = searchParams.get("caseId")
  const [selectedId, setSelectedId] = useState(
    workflow.cases.some(({ id }) => id === requestedCaseId)
      ? (requestedCaseId ?? "")
      : (workflow.cases[0]?.id ?? "")
  )
  const filteredCases = useMemo(
    () =>
      workflow.cases.filter(
        (opsCase) =>
          (typeFilter === "all" || opsCase.type === typeFilter) &&
          (statusFilter === "all" || opsCase.status === statusFilter) &&
          (priorityFilter === "all" || opsCase.priority === priorityFilter)
      ),
    [priorityFilter, statusFilter, typeFilter, workflow.cases]
  )
  const selected =
    filteredCases.find(({ id }) => id === selectedId) ?? filteredCases[0]
  const selectedDraft = workflow.caseDrafts.find(
    ({ caseId }) => caseId === selected?.id
  )
  const openCases = workflow.cases.filter(
    ({ status }) => status === "open"
  ).length

  return (
    <PageLayout
      ariaLabel={t("Operations Cases")}
      pageName="Operations Cases"
      eyebrow={t("Exception operations")}
      title={t("Triage cases without changing orders.")}
      detail={t("{{count}} cases are waiting for a classification draft.", {
        count: openCases,
      })}
    >
      <GridBlock>
        <div className="voltage-admin-filter-bar">
          <label className="voltage-admin-field">
            <span>{t("Case type")}</span>
            <select
              value={typeFilter}
              onChange={(event) =>
                setTypeFilter(event.target.value as OpsCaseType | "all")
              }
            >
              <option value="all">{t("All types")}</option>
              {Object.entries(typeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {t(label)}
                </option>
              ))}
            </select>
          </label>
          <label className="voltage-admin-field">
            <span>{t("Status")}</span>
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as OpsCase["status"] | "all")
              }
            >
              <option value="all">{t("All statuses")}</option>
              <option value="open">{t("Open")}</option>
              <option value="drafted">{t("Drafted")}</option>
              <option value="pending_review">{t("Pending review")}</option>
              <option value="resolved">{t("Resolved")}</option>
            </select>
          </label>
          <label className="voltage-admin-field">
            <span>{t("Priority")}</span>
            <select
              value={priorityFilter}
              onChange={(event) =>
                setPriorityFilter(
                  event.target.value as OpsCase["priority"] | "all"
                )
              }
            >
              <option value="all">{t("All priorities")}</option>
              <option value="low">{t("Low")}</option>
              <option value="medium">{t("Medium")}</option>
              <option value="high">{t("High")}</option>
            </select>
          </label>
          <span>
            {t("{{count}} matching cases", { count: filteredCases.length })}
          </span>
        </div>
      </GridBlock>

      <GridBlock className="col-span-12 lg:col-span-4">
        <section
          className="voltage-admin-panel"
          aria-label={t("Operations case list")}
        >
          <div className="voltage-admin-candidate-list">
            {filteredCases.map((opsCase) => (
              <CaseCard
                key={opsCase.id}
                opsCase={opsCase}
                active={opsCase.id === selected?.id}
                onSelect={() => setSelectedId(opsCase.id)}
              />
            ))}
            {filteredCases.length === 0 ? (
              <p className="voltage-admin-empty-state">
                {t("No cases match all three filters.")}
              </p>
            ) : null}
          </div>
        </section>
      </GridBlock>

      <GridBlock className="col-span-12 lg:col-span-8">
        {selected ? (
          <CaseDraftEditor
            key={`${selected.id}:${selectedDraft?.version ?? 0}`}
            opsCase={selected}
            draft={selectedDraft}
          />
        ) : (
          <article className="voltage-admin-panel">
            {t("Select a case to begin a safe classification draft.")}
          </article>
        )}
      </GridBlock>
    </PageLayout>
  )
}
