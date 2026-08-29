import { GridBlock, PageLayout } from "../voltage-admin-page-layout"
import { useVoltageAdmin } from "../voltage-admin"

export const CatalogIntakePage = () => {
  const { workflow } = useVoltageAdmin()
  const unfinished = workflow.candidates.filter((candidate) => {
    const draft = workflow.productDrafts.find(
      ({ candidateId }) => candidateId === candidate.id
    )
    return !draft || draft.status === "draft"
  }).length

  return (
    <PageLayout
      ariaLabel="Catalog Intake"
      eyebrow="Catalog operations"
      title="Prepare product drafts for review."
      detail={`${unfinished} catalog candidates still need a complete draft.`}
    >
      <GridBlock>
        <article className="voltage-admin-panel">
          <p>
            Candidate sources, missing fields, draft editing, and publish review
            will appear in this workspace.
          </p>
        </article>
      </GridBlock>
    </PageLayout>
  )
}
