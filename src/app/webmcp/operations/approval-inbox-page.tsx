import { GridBlock, PageLayout } from "../voltage-admin-page-layout"
import { useVoltageAdmin } from "../voltage-admin"

export const ApprovalInboxPage = () => {
  const { workflow } = useVoltageAdmin()
  const pendingReviews = workflow.reviews.filter(
    ({ state }) => state === "pending"
  ).length

  return (
    <PageLayout
      ariaLabel="Approval Inbox"
      eyebrow="Human review"
      title="Keep final actions in human hands."
      detail={`${pendingReviews} review items require a page-level decision.`}
    >
      <GridBlock>
        <article className="voltage-admin-panel">
          <p>
            Product publication and case resolution controls will appear here;
            WebMCP tools cannot perform these final actions.
          </p>
        </article>
      </GridBlock>
    </PageLayout>
  )
}
