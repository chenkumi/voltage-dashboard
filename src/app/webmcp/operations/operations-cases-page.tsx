import { GridBlock, PageLayout } from "../voltage-admin-page-layout"
import { useVoltageAdmin } from "../voltage-admin"

export const OperationsCasesPage = () => {
  const { workflow } = useVoltageAdmin()
  const openCases = workflow.cases.filter(
    ({ status }) => status === "open"
  ).length

  return (
    <PageLayout
      ariaLabel="Operations Cases"
      eyebrow="Exception operations"
      title="Triage cases without changing orders."
      detail={`${openCases} cases are waiting for a classification draft.`}
    >
      <GridBlock>
        <article className="voltage-admin-panel">
          <p>
            Safe status codes, return eligibility, and support recommendations
            will appear in this workspace.
          </p>
        </article>
      </GridBlock>
    </PageLayout>
  )
}
