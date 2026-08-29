import { useParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { GridBlock, PageLayout } from "../voltage-admin-page-layout"

const RouteWorkspace = ({ message }: { message: string }) => (
  <GridBlock>
    <div className="voltage-admin-panel product-route-workspace" role="status">
      {message}
    </div>
  </GridBlock>
)

export const ProductAddRoute = () => {
  const { t } = useTranslation()
  return (
    <PageLayout
      ariaLabel={t("Add product")}
      pageName="Add product"
      breadcrumb={[
        { label: "Products", to: "/products" },
        { label: "Add product" },
      ]}
    >
      <RouteWorkspace message={t("Preparing product editor…")} />
    </PageLayout>
  )
}

export const ProductDetailRoute = () => {
  const { t } = useTranslation()
  const { productId = "" } = useParams()
  const productLabel = t("Product #{{id}}", { id: productId })
  return (
    <PageLayout
      ariaLabel={productLabel}
      pageName={productLabel}
      breadcrumb={[
        { label: "Products", to: "/products" },
        { label: productLabel },
      ]}
    >
      <RouteWorkspace message={t("Loading product details…")} />
    </PageLayout>
  )
}

export const ProductEditRoute = () => {
  const { t } = useTranslation()
  const { productId = "" } = useParams()
  const productLabel = t("Product #{{id}}", { id: productId })
  const editLabel = t("Edit product #{{id}}", { id: productId })
  return (
    <PageLayout
      ariaLabel={editLabel}
      pageName={editLabel}
      breadcrumb={[
        { label: "Products", to: "/products" },
        { label: productLabel, to: `/products/${productId}` },
        { label: "Edit" },
      ]}
    >
      <RouteWorkspace message={t("Preparing product editor…")} />
    </PageLayout>
  )
}
