import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  ImageOff,
  PackagePlus,
  Pencil,
  Search,
} from "lucide-react"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, useNavigate } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { GridBlock, PageLayout } from "../voltage-admin-page-layout"
import { useVoltageAdmin } from "../voltage-admin"
import { archiveProducts } from "./product-actions"
import { ConfirmationDialog } from "./confirmation-dialog"
import {
  createProductListModel,
  listProductCategories,
  type ProductListFilters,
  type ProductStatusFilter,
  type ProductStockFilter,
} from "./product-list-model"
import type { ProductRepository } from "./product-repository"
import type { ProductStoreSnapshot } from "./product-store"
import type { Product } from "./types"

const initialFilters: ProductListFilters = {
  query: "",
  category: "all",
  status: "active",
  stock: "all",
}

const statusTone = (status: Product["status"]) => {
  if (status === "published") return "bg-[#e5eee7] text-[#48614c]"
  if (status === "archived") return "bg-[#ece8e5] text-[#70645c]"
  return "bg-[#ece8d9] text-[#6e6746]"
}

const ProductThumbnail = ({ product }: { product: Product }) => {
  const [failed, setFailed] = useState(false)
  const image = [...product.images]
    .sort((left, right) => left.position - right.position)
    .find(({ isPrimary }) => isPrimary)

  if (!image || failed) {
    return (
      <span className="product-thumbnail product-thumbnail-fallback">
        <ImageOff />
      </span>
    )
  }

  return (
    <img
      className="product-thumbnail"
      src={image.url}
      alt={image.alt || product.title}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}

const formatPrice = (product: Product, locale: string) =>
  new Intl.NumberFormat(locale === "zh-TW" ? "zh-TW" : "en-US", {
    style: "currency",
    currency: product.price.currency,
    maximumFractionDigits: product.price.currency === "TWD" ? 0 : 2,
  }).format(product.price.amount)

export const ProductListContent = ({
  snapshot,
  repository,
}: {
  snapshot: ProductStoreSnapshot
  repository: Pick<ProductRepository, "archiveMany">
}) => {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [filters, setFilters] = useState(initialFilters)
  const [page, setPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<number>>(new Set())
  const [archiveIds, setArchiveIds] = useState<readonly number[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [archiveError, setArchiveError] = useState("")
  const categories = useMemo(
    () => listProductCategories(snapshot.products),
    [snapshot.products]
  )
  const model = useMemo(
    () => createProductListModel(snapshot.products, filters, page),
    [filters, page, snapshot.products]
  )
  const currentIds = model.items.map(({ id }) => id)
  const allCurrentSelected =
    currentIds.length > 0 && currentIds.every((id) => selectedIds.has(id))

  const updateFilter = <Key extends keyof ProductListFilters>(
    key: Key,
    value: ProductListFilters[Key]
  ) => {
    setPage(1)
    setSelectedIds(new Set())
    setFilters((current) => ({ ...current, [key]: value }))
  }

  const toggleProduct = (productId: number) =>
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(productId)) next.delete(productId)
      else next.add(productId)
      return next
    })

  const toggleCurrentPage = () =>
    setSelectedIds((current) => {
      const next = new Set(current)
      for (const productId of currentIds) {
        if (allCurrentSelected) next.delete(productId)
        else next.add(productId)
      }
      return next
    })

  const confirmArchive = async () => {
    setBusy(true)
    setArchiveError("")
    await archiveProducts({
      productIds: archiveIds,
      repository,
      onComplete: () => {
        setSelectedIds(new Set())
        setArchiveIds([])
        setMessage(
          t("{{count}} products archived.", { count: archiveIds.length })
        )
      },
      onError: () => setArchiveError(t("Products could not be archived.")),
    })
    setBusy(false)
  }

  const openArchiveDialog = (productIds: readonly number[]) => {
    setArchiveError("")
    setArchiveIds(productIds)
  }

  const pageNumbers = Array.from(
    { length: model.pageCount },
    (_, index) => index + 1
  )

  return (
    <PageLayout
      ariaLabel={t("Products")}
      pageName="Products"
      actions={
        <Button type="button" onClick={() => navigate("/products/add")}>
          <PackagePlus /> {t("Add product")}
        </Button>
      }
    >
      <GridBlock>
        <section className="product-list-panel" aria-label={t("Product list")}>
          <div className="product-list-toolbar">
            <label className="product-list-search">
              <Search />
              <span className="sr-only">{t("Search products")}</span>
              <input
                type="search"
                value={filters.query}
                placeholder={t("Search title, SKU, brand or category")}
                onChange={(event) => updateFilter("query", event.target.value)}
              />
            </label>
            <label>
              <span>{t("Category")}</span>
              <select
                aria-label={t("Category")}
                value={filters.category}
                onChange={(event) =>
                  updateFilter("category", event.target.value)
                }
              >
                <option value="all">{t("All categories")}</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{t("Status")}</span>
              <select
                aria-label={t("Status")}
                value={filters.status}
                onChange={(event) =>
                  updateFilter(
                    "status",
                    event.target.value as ProductStatusFilter
                  )
                }
              >
                <option value="active">{t("Active products")}</option>
                <option value="published">{t("Published")}</option>
                <option value="draft">{t("Draft")}</option>
                <option value="archived">{t("Archived")}</option>
              </select>
            </label>
            <label>
              <span>{t("Stock")}</span>
              <select
                aria-label={t("Stock")}
                value={filters.stock}
                onChange={(event) =>
                  updateFilter(
                    "stock",
                    event.target.value as ProductStockFilter
                  )
                }
              >
                <option value="all">{t("All stock")}</option>
                <option value="in-stock">{t("In stock")}</option>
                <option value="low-stock">{t("Low stock")}</option>
                <option value="out-of-stock">{t("Out of stock")}</option>
              </select>
            </label>
          </div>

          <div className="product-list-summary">
            <span>
              {t("{{count}} of {{total}} products", {
                count: model.filteredCount,
                total: model.totalCount,
              })}
            </span>
            {selectedIds.size > 0 ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => openArchiveDialog([...selectedIds])}
              >
                <Archive />
                {t("Archive selected ({{count}})", { count: selectedIds.size })}
              </Button>
            ) : null}
          </div>

          {message ? (
            <p className="product-list-message" role="status">
              {message}
            </p>
          ) : null}

          {snapshot.state === "loading" || snapshot.state === "idle" ? (
            <div className="product-list-state" role="status">
              {t("Loading products…")}
            </div>
          ) : snapshot.state === "error" ? (
            <div className="product-list-state" role="alert">
              {t(snapshot.error ?? "Product data is unavailable.")}
            </div>
          ) : snapshot.products.length === 0 ? (
            <div className="product-list-state">
              <PackagePlus />
              <strong>{t("No products yet")}</strong>
              <span>
                {t("Add the first product to begin managing the catalog.")}
              </span>
            </div>
          ) : model.filteredCount === 0 ? (
            <div className="product-list-state">
              <Search />
              <strong>{t("No matching products")}</strong>
              <span>{t("Adjust the search or filters and try again.")}</span>
            </div>
          ) : (
            <div className="product-table-wrap">
              <table className="product-table">
                <thead>
                  <tr>
                    <th className="product-select-cell">
                      <input
                        type="checkbox"
                        aria-label={t("Select current page")}
                        checked={allCurrentSelected}
                        onChange={toggleCurrentPage}
                      />
                    </th>
                    <th>{t("Product")}</th>
                    <th>{t("Category")}</th>
                    <th>{t("Price")}</th>
                    <th>{t("Status")}</th>
                    <th>{t("Stock")}</th>
                    <th>{t("Updated")}</th>
                    <th className="product-actions-cell">{t("Actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {model.items.map((product) => (
                    <tr key={product.id}>
                      <td className="product-select-cell">
                        <input
                          type="checkbox"
                          aria-label={t("Select {{title}}", {
                            title: product.title,
                          })}
                          checked={selectedIds.has(product.id)}
                          onChange={() => toggleProduct(product.id)}
                        />
                      </td>
                      <td>
                        <div className="product-name-cell">
                          <ProductThumbnail product={product} />
                          <span>
                            <Link to={`/products/${product.id}`}>
                              {product.title}
                            </Link>
                            <small>{product.sku}</small>
                          </span>
                        </div>
                      </td>
                      <td>{product.category}</td>
                      <td>
                        {formatPrice(product, i18n.resolvedLanguage ?? "en")}
                      </td>
                      <td>
                        <Badge className={statusTone(product.status)}>
                          {t(product.status)}
                        </Badge>
                      </td>
                      <td>
                        <span
                          data-stock={
                            product.stock === 0
                              ? "empty"
                              : product.stock <= 12
                                ? "low"
                                : "ok"
                          }
                        >
                          {product.stock}
                        </span>
                      </td>
                      <td>
                        {new Date(product.updatedAt).toLocaleDateString(
                          i18n.resolvedLanguage === "zh-TW" ? "zh-TW" : "en-US"
                        )}
                      </td>
                      <td className="product-actions-cell">
                        <div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            title={t("View {{title}}", {
                              title: product.title,
                            })}
                            aria-label={t("View {{title}}", {
                              title: product.title,
                            })}
                            onClick={() => navigate(`/products/${product.id}`)}
                          >
                            <Eye />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            title={t("Edit {{title}}", {
                              title: product.title,
                            })}
                            aria-label={t("Edit {{title}}", {
                              title: product.title,
                            })}
                            onClick={() =>
                              navigate(`/products/edit/${product.id}`)
                            }
                          >
                            <Pencil />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            title={t("Duplicate {{title}}", {
                              title: product.title,
                            })}
                            aria-label={t("Duplicate {{title}}", {
                              title: product.title,
                            })}
                            onClick={() =>
                              navigate(`/products/add?copyFrom=${product.id}`)
                            }
                          >
                            <Copy />
                          </Button>
                          {product.status !== "archived" ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              title={t("Archive {{title}}", {
                                title: product.title,
                              })}
                              aria-label={t("Archive {{title}}", {
                                title: product.title,
                              })}
                              onClick={() => openArchiveDialog([product.id])}
                            >
                              <Archive />
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {model.filteredCount > 0 ? (
            <nav
              className="product-pagination"
              aria-label={t("Product pagination")}
            >
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={model.page === 1}
                aria-label={t("Previous page")}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <ChevronLeft />
              </Button>
              {pageNumbers.map((pageNumber) => (
                <Button
                  key={pageNumber}
                  type="button"
                  variant={pageNumber === model.page ? "default" : "outline"}
                  size="sm"
                  aria-current={pageNumber === model.page ? "page" : undefined}
                  aria-label={t("Page {{page}}", { page: pageNumber })}
                  onClick={() => setPage(pageNumber)}
                >
                  {pageNumber}
                </Button>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={model.page === model.pageCount}
                aria-label={t("Next page")}
                onClick={() =>
                  setPage((current) => Math.min(model.pageCount, current + 1))
                }
              >
                <ChevronRight />
              </Button>
            </nav>
          ) : null}
        </section>
      </GridBlock>

      <ConfirmationDialog
        open={archiveIds.length > 0}
        title={t(
          archiveIds.length === 1 ? "Archive product?" : "Archive products?"
        )}
        description={t(
          "Archived products are hidden from the active list and can be restored later."
        )}
        confirmLabel={t("Archive")}
        error={archiveError}
        busy={busy}
        onCancel={() => {
          setArchiveError("")
          setArchiveIds([])
        }}
        onConfirm={() => void confirmArchive()}
      />
    </PageLayout>
  )
}

export const ProductListPage = () => {
  const { products, productRepository } = useVoltageAdmin()
  return (
    <ProductListContent snapshot={products} repository={productRepository} />
  )
}
