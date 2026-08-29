import {
  Archive,
  ArrowLeft,
  Copy,
  ImageOff,
  Pencil,
  RotateCcw,
  Star,
} from "lucide-react"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, useParams } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { GridBlock, PageLayout } from "../voltage-admin-page-layout"
import { useVoltageAdmin } from "../voltage-admin"
import { archiveProducts, restoreProduct } from "./product-actions"
import { ConfirmationDialog } from "./confirmation-dialog"
import { createProductContentModel } from "./product-content-model"
import type { ProductRepository } from "./product-repository"
import type { Product } from "./types"

const formatPrice = (product: Product, locale: string) =>
  new Intl.NumberFormat(locale === "zh-TW" ? "zh-TW" : "en-US", {
    style: "currency",
    currency: product.price.currency,
    maximumFractionDigits: product.price.currency === "TWD" ? 0 : 2,
  }).format(product.price.amount)

const statusTone = (status: Product["status"]) => {
  if (status === "published") return "bg-[#e5eee7] text-[#48614c]"
  if (status === "archived") return "bg-[#ece8e5] text-[#70645c]"
  return "bg-[#ece8d9] text-[#6e6746]"
}

const ProductGallery = ({ product }: { product: Product }) => {
  const { t } = useTranslation()
  const images = useMemo(
    () =>
      [...product.images].sort((left, right) => left.position - right.position),
    [product.images]
  )
  const primary = images.find(({ isPrimary }) => isPrimary) ?? images[0]
  const [selectedId, setSelectedId] = useState(primary?.id ?? "")
  const [failedIds, setFailedIds] = useState<ReadonlySet<string>>(new Set())
  const selected = images.find(({ id }) => id === selectedId) ?? primary

  return (
    <div className="product-detail-gallery">
      {!selected || failedIds.has(selected.id) ? (
        <div className="product-detail-image-fallback">
          <ImageOff />
          <span>{t("Image unavailable")}</span>
        </div>
      ) : (
        <div className="product-detail-primary-image">
          <img
            src={selected.url}
            alt={selected.alt || product.title}
            onError={() =>
              setFailedIds((current) => new Set(current).add(selected.id))
            }
          />
        </div>
      )}
      {images.length > 1 ? (
        <div
          className="product-detail-thumbnails"
          aria-label={t("Product images")}
        >
          {images.map((image) => (
            <button
              key={image.id}
              type="button"
              aria-current={image.id === selected.id ? "true" : undefined}
              aria-label={t("Show image {{position}}", {
                position: image.position + 1,
              })}
              onClick={() => setSelectedId(image.id)}
            >
              {failedIds.has(image.id) ? (
                <ImageOff />
              ) : (
                <img
                  src={image.url}
                  alt=""
                  loading="lazy"
                  onError={() =>
                    setFailedIds((current) => new Set(current).add(image.id))
                  }
                />
              )}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export const ProductDetailContent = ({
  product,
  repository,
}: {
  product: Product
  repository: Pick<ProductRepository, "archiveMany" | "restore">
}) => {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [archiveError, setArchiveError] = useState("")
  const content = useMemo(() => createProductContentModel(product), [product])

  const archive = async () => {
    setBusy(true)
    setArchiveError("")
    await archiveProducts({
      productIds: [product.id],
      repository,
      onComplete: () => {
        setConfirmArchive(false)
        setMessage(t("Product archived."))
      },
      onError: () => setArchiveError(t("Product could not be archived.")),
    })
    setBusy(false)
  }

  const restore = async () => {
    setBusy(true)
    await restoreProduct({
      productId: product.id,
      repository,
      onComplete: () => setMessage(t("Product restored.")),
      onError: () => setMessage(t("Product could not be restored.")),
    })
    setBusy(false)
  }

  return (
    <PageLayout
      ariaLabel={product.title}
      pageName={product.title}
      translatePageName={false}
      breadcrumb={[
        { label: "Products", to: "/products" },
        { label: product.title, translate: false },
      ]}
      status={
        <Badge className={statusTone(product.status)}>
          {t(product.status)}
        </Badge>
      }
      actions={
        <>
          <Button
            type="button"
            variant="outline"
            disabled={product.status === "archived"}
            onClick={() => navigate(`/products/edit/${product.id}`)}
          >
            <Pencil /> {t("Edit")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(`/products/add?copyFrom=${product.id}`)}
          >
            <Copy /> {t("Duplicate")}
          </Button>
          {product.status === "archived" ? (
            <Button
              type="button"
              disabled={busy}
              onClick={() => void restore()}
            >
              <RotateCcw /> {t("Restore")}
            </Button>
          ) : (
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setArchiveError("")
                setConfirmArchive(true)
              }}
            >
              <Archive /> {t("Archive")}
            </Button>
          )}
        </>
      }
    >
      {message ? (
        <GridBlock>
          <p className="product-detail-message" role="status">
            {message}
          </p>
        </GridBlock>
      ) : null}

      <GridBlock className="col-span-12 lg:col-span-5">
        <section
          className="product-detail-panel"
          aria-label={t("Product gallery")}
        >
          <ProductGallery product={product} />
        </section>
      </GridBlock>
      <GridBlock className="col-span-12 lg:col-span-7">
        <section className="product-detail-panel product-detail-summary">
          <div>
            <span>{product.brand ?? t("Unbranded")}</span>
            <h2>{product.title}</h2>
            <p>{content.shortAdCopy}</p>
          </div>
          <strong>{formatPrice(product, i18n.resolvedLanguage ?? "en")}</strong>
          <dl>
            <div>
              <dt>{t("SKU")}</dt>
              <dd>{product.sku}</dd>
            </div>
            <div>
              <dt>{t("Category")}</dt>
              <dd>{product.category}</dd>
            </div>
            <div>
              <dt>{t("Stock")}</dt>
              <dd>{product.stock}</dd>
            </div>
            <div>
              <dt>{t("Updated")}</dt>
              <dd>
                {new Date(product.updatedAt).toLocaleString(
                  i18n.resolvedLanguage === "zh-TW" ? "zh-TW" : "en-US"
                )}
              </dd>
            </div>
          </dl>
        </section>
      </GridBlock>

      <GridBlock className="col-span-12 lg:col-span-7">
        <section className="product-detail-panel product-detail-copy">
          <h2>{t("Product content")}</h2>
          <p>{content.description}</p>
        </section>
      </GridBlock>
      <GridBlock className="col-span-12 lg:col-span-5">
        <section className="product-detail-panel">
          <h2>{t("Specifications")}</h2>
          {content.specifications.length === 0 ? (
            <p className="product-detail-empty">
              {t("No specifications provided.")}
            </p>
          ) : (
            <dl className="product-specification-list">
              {content.specifications.map((specification) => (
                <div key={specification.id}>
                  <dt>{specification.title}</dt>
                  <dd>
                    {specification.value}
                    {specification.unit ? ` ${specification.unit}` : ""}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      </GridBlock>

      <GridBlock className="col-span-12 lg:col-span-5">
        <section className="product-detail-panel product-detail-copy">
          <h2>{t("Short advertising copy")}</h2>
          <p>{content.shortAdCopy}</p>
        </section>
      </GridBlock>
      <GridBlock className="col-span-12 lg:col-span-7">
        <section className="product-detail-panel product-detail-copy">
          <h2>{t("Long advertising copy")}</h2>
          <p>{content.longAdCopy}</p>
        </section>
      </GridBlock>

      <GridBlock>
        <section className="product-detail-panel">
          <div className="product-detail-section-heading">
            <h2>{t("Reviews")}</h2>
            <span>
              {t("{{count}} reviews", { count: content.reviews.length })}
            </span>
          </div>
          {content.reviews.length === 0 ? (
            <p className="product-detail-empty">{t("No reviews yet.")}</p>
          ) : (
            <div className="product-review-list">
              {content.reviews.map((review, index) => (
                <article key={`${review.date}-${index}`}>
                  <div>
                    <span
                      aria-label={t("{{rating}} out of 5 stars", {
                        rating: review.rating,
                      })}
                    >
                      {Array.from({ length: 5 }, (_, star) => (
                        <Star
                          key={star}
                          aria-hidden="true"
                          data-filled={star < review.rating ? "true" : "false"}
                        />
                      ))}
                    </span>
                    <time dateTime={review.date}>
                      {new Date(review.date).toLocaleDateString(
                        i18n.resolvedLanguage === "zh-TW" ? "zh-TW" : "en-US"
                      )}
                    </time>
                  </div>
                  <p>{review.comment}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      </GridBlock>

      <ConfirmationDialog
        open={confirmArchive}
        title={t("Archive product?")}
        description={t(
          "Archived products are hidden from the active list and can be restored later."
        )}
        confirmLabel={t("Archive")}
        error={archiveError}
        busy={busy}
        onCancel={() => {
          setArchiveError("")
          setConfirmArchive(false)
        }}
        onConfirm={() => void archive()}
      />
    </PageLayout>
  )
}

export const ProductDetailPage = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { productId = "" } = useParams()
  const { products, productRepository } = useVoltageAdmin()
  const numericProductId = Number(productId)
  const product = products.products.find(({ id }) => id === numericProductId)

  if (products.state === "loading" || products.state === "idle") {
    return (
      <PageLayout ariaLabel={t("Product details")} pageName="Product details">
        <GridBlock>
          <div className="product-list-state" role="status">
            {t("Loading product details…")}
          </div>
        </GridBlock>
      </PageLayout>
    )
  }

  if (products.state === "error") {
    return (
      <PageLayout ariaLabel={t("Product details")} pageName="Product details">
        <GridBlock>
          <div className="product-list-state" role="alert">
            {t(products.error ?? "Product data is unavailable.")}
          </div>
        </GridBlock>
      </PageLayout>
    )
  }

  if (!product) {
    return (
      <PageLayout
        ariaLabel={t("Product not found")}
        pageName="Product not found"
      >
        <GridBlock>
          <div className="product-list-state">
            <strong>{t("Product not found")}</strong>
            <span>
              {t("The product may have been removed or the link is invalid.")}
            </span>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/products")}
            >
              <ArrowLeft /> {t("Back to products")}
            </Button>
          </div>
        </GridBlock>
      </PageLayout>
    )
  }

  return (
    <ProductDetailContent product={product} repository={productRepository} />
  )
}
