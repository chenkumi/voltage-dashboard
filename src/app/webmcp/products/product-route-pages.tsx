import { useTranslation } from "react-i18next"
import { useParams, useSearchParams } from "react-router-dom"
import { GridBlock, PageLayout } from "../voltage-admin-page-layout"
import { useVoltageAdmin } from "../voltage-admin"
import { ProductEditor } from "./product-editor"

const ProductEditorUnavailable = ({ message }: { message: string }) => {
  const { t } = useTranslation()
  return (
    <PageLayout ariaLabel={t("Products")} pageName="Products">
      <GridBlock>
        <div
          className="voltage-admin-panel product-route-workspace"
          role="status"
        >
          {message}
        </div>
      </GridBlock>
    </PageLayout>
  )
}

export const ProductAddRoute = () => {
  const { t } = useTranslation()
  const {
    productDraftStore,
    productEditorController,
    productRepository,
    products,
  } = useVoltageAdmin()
  const [searchParams] = useSearchParams()
  const sourceId = Number(searchParams.get("copyFrom"))
  const sourceProduct = Number.isInteger(sourceId)
    ? products.products.find((item) => item.id === sourceId)
    : undefined
  if (products.state !== "ready") {
    return <ProductEditorUnavailable message={t("Loading products…")} />
  }
  return (
    <ProductEditor
      key={`create-${sourceProduct?.id ?? "blank"}`}
      mode="create"
      sourceProduct={sourceProduct}
      repository={productRepository}
      controller={productEditorController}
      draftStore={productDraftStore}
    />
  )
}

export const ProductEditRoute = () => {
  const { t } = useTranslation()
  const { productId = "" } = useParams()
  const {
    productDraftStore,
    productEditorController,
    productRepository,
    products,
  } = useVoltageAdmin()
  const numericId = Number(productId)
  if (products.state !== "ready") {
    return <ProductEditorUnavailable message={t("Loading products…")} />
  }
  const product = products.products.find((item) => item.id === numericId)
  if (!product) {
    return <ProductEditorUnavailable message={t("Product not found.")} />
  }
  return (
    <ProductEditor
      key={product.id}
      mode="edit"
      product={product}
      repository={productRepository}
      controller={productEditorController}
      draftStore={productDraftStore}
    />
  )
}
