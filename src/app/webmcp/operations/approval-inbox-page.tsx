import {
  Check,
  CheckCircle2,
  PackageCheck,
  RotateCcw,
  ShieldCheck,
} from "lucide-react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { GridBlock, PageLayout } from "../voltage-admin-page-layout"
import { useVoltageAdmin } from "../voltage-admin"
import type { ReviewItem, WorkflowSnapshot } from "./types"

const reviewTone = (state: ReviewItem["state"]) => {
  if (state === "completed") return "bg-[#e5eee7] text-[#48614c]"
  if (state === "approved") return "bg-[#e4eaed] text-[#4f6975]"
  if (state === "returned") return "bg-[#f4e5d7] text-[#8b5d3c]"
  return "bg-[#ece8d9] text-[#6e6746]"
}

const ReviewSummary = ({
  review,
  workflow,
}: {
  review: ReviewItem
  workflow: WorkflowSnapshot
}) => {
  if (review.workflowType === "product") {
    const draft = workflow.productDrafts.find(
      ({ candidateId }) => candidateId === review.workflowId
    )
    const candidate = workflow.candidates.find(
      ({ id }) => id === review.workflowId
    )
    return (
      <div className="voltage-admin-review-copy">
        <strong>{draft?.title ?? review.workflowId}</strong>
        <p>{draft?.description ?? "Product draft details unavailable."}</p>
        <dl>
          <div>
            <dt>Agent suggestion</dt>
            <dd>
              Publish in {draft?.category ?? "the reviewed category"} after a
              human checks the draft.
            </dd>
          </div>
          <div>
            <dt>Evidence source</dt>
            <dd>{candidate?.sourceLabel ?? "Catalog candidate"}</dd>
          </div>
          <div>
            <dt>Human final action</dt>
            <dd>Publish the product to local demo state.</dd>
          </div>
        </dl>
      </div>
    )
  }

  const draft = workflow.caseDrafts.find(
    ({ caseId }) => caseId === review.workflowId
  )
  const opsCase = workflow.cases.find(({ id }) => id === review.workflowId)
  return (
    <div className="voltage-admin-review-copy">
      <strong>
        {review.workflowId} · {opsCase?.reasonCode ?? "operations case"}
      </strong>
      <p>{draft?.supportDraft ?? "Case recommendation unavailable."}</p>
      <dl>
        <div>
          <dt>Agent suggestion</dt>
          <dd>{draft?.recommendation ?? "Review this operations case."}</dd>
        </div>
        <div>
          <dt>Source / selected evidence</dt>
          <dd>
            Source: {opsCase?.facts.join(", ") || "None"}
            <br />
            Selected: {draft?.evidence.join(", ") || "None"}
          </dd>
        </div>
        <div>
          <dt>Human final action</dt>
          <dd>Complete the case in demo state without changing an order.</dd>
        </div>
      </dl>
    </div>
  )
}

const ReviewCard = ({
  review,
  workflow,
  onMessage,
}: {
  review: ReviewItem
  workflow: WorkflowSnapshot
  onMessage: (message: string) => void
}) => {
  const { operationsController } = useVoltageAdmin()

  const run = (action: () => void, success: string) => {
    try {
      action()
      onMessage(success)
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Action failed.")
    }
  }

  return (
    <article className="voltage-admin-review-card">
      <div className="voltage-admin-panel-heading">
        <div>
          <p>{review.workflowType} review</p>
          <h2>{review.workflowId}</h2>
        </div>
        <Badge className={reviewTone(review.state)}>
          {review.state.replace("_", " ")}
        </Badge>
      </div>
      <ReviewSummary review={review} workflow={workflow} />
      {review.state === "pending" || review.state === "approved" ? (
        <div className="voltage-admin-action-row">
          <span>
            Buttons require a direct page interaction; URL or tool input cannot
            replace them.
          </span>
          <div>
            <Button
              type="button"
              variant="outline"
              className="cursor-pointer"
              onClick={() =>
                run(
                  () => operationsController.returnReview(review.id, "user"),
                  `${review.workflowId} returned for revision.`
                )
              }
            >
              <RotateCcw className="size-4" /> Return for changes
            </Button>
            {review.state === "pending" ? (
              <Button
                type="button"
                className="cursor-pointer"
                onClick={() =>
                  run(
                    () => operationsController.approveReview(review.id, "user"),
                    `${review.workflowId} recommendation approved.`
                  )
                }
              >
                <Check className="size-4" /> Approve recommendation
              </Button>
            ) : (
              <Button
                type="button"
                className="cursor-pointer"
                onClick={() =>
                  run(
                    () =>
                      operationsController.completeReview(review.id, "user"),
                    `${review.workflowId} final demo action completed.`
                  )
                }
              >
                {review.workflowType === "product" ? (
                  <PackageCheck className="size-4" />
                ) : (
                  <CheckCircle2 className="size-4" />
                )}
                {review.requiredAction === "publish_product"
                  ? "Publish product"
                  : "Complete case"}
              </Button>
            )}
          </div>
        </div>
      ) : null}
    </article>
  )
}

export const ApprovalInboxPage = () => {
  const { workflow } = useVoltageAdmin()
  const [message, setMessage] = useState("")
  const reviews = [...workflow.reviews].sort((left, right) => {
    const rank = { pending: 0, approved: 1, returned: 2, completed: 3 }
    return rank[left.state] - rank[right.state]
  })
  const actionable = workflow.reviews.filter(
    ({ state }) => state === "pending" || state === "approved"
  ).length

  return (
    <PageLayout
      ariaLabel="Approval Inbox"
      eyebrow="Human review"
      title="Keep final actions in human hands."
      detail={`${actionable} review items still require a page-level decision.`}
    >
      <GridBlock className="col-span-12 xl:col-span-8">
        <section
          className="voltage-admin-review-list"
          aria-label="Review queue"
        >
          <div className="voltage-admin-panel-heading">
            <div>
              <p>Cross-module queue</p>
              <h2>Product and case reviews</h2>
            </div>
            <Badge className="bg-[#e2e5df] text-[#4c574e]">{actionable}</Badge>
          </div>
          <span className="voltage-admin-inbox-message" role="status">
            {message}
          </span>
          {reviews.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              workflow={workflow}
              onMessage={setMessage}
            />
          ))}
          {reviews.length === 0 ? (
            <div className="voltage-admin-empty-state">
              <ShieldCheck className="mx-auto size-5" />
              Agent-created product and case reviews will appear here.
            </div>
          ) : null}
        </section>
      </GridBlock>

      <GridBlock className="col-span-12 xl:col-span-4">
        <aside className="voltage-admin-panel">
          <div className="voltage-admin-panel-heading">
            <div>
              <p>Structured activity</p>
              <h2>Audit trail</h2>
            </div>
            <Badge className="bg-[#e4eaed] text-[#4f6975]">
              {workflow.audit.length}
            </Badge>
          </div>
          <div className="voltage-admin-audit-list">
            {[...workflow.audit]
              .reverse()
              .slice(0, 12)
              .map((entry) => (
                <div key={entry.id}>
                  <span>
                    <strong>{entry.action.replaceAll("_", " ")}</strong>
                    <small>{entry.workflowId}</small>
                  </span>
                  <span>
                    <Badge className="bg-[#e2e5df] text-[#4c574e]">
                      {entry.actor}
                    </Badge>
                    <small>
                      {entry.result} · {entry.occurredAt.slice(0, 16)}
                    </small>
                  </span>
                </div>
              ))}
          </div>
          <p className="voltage-admin-safety-note">
            Audit entries contain only actor, action, workflow ID, time, and
            result. Draft text and prompts are never copied here.
          </p>
        </aside>
      </GridBlock>
    </PageLayout>
  )
}
