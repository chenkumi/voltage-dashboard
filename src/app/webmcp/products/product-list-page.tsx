import { Archive, Copy, Eye, ImageOff, PackagePlus, Pencil } from "lucide-react"
import { type Dispatch, type SetStateAction, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, useNavigate } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  ActiveFilterSummary,
  OperationalFilterButton,
  OperationalFilterPopover,
  OperationalFilterToolbar,
  OperationalListPanel,
  OperationalListState,
  OperationalPagination,
  OperationalToolbarSearch,
  OperationalToolbarSelect,
  useOperationalPagination,
  type ActiveOperationalFilter,
  type OperationalSelectOption,
} from "../operational-ui"
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
  type ProductSort,
} from "./product-list-model"
import type { ProductRepository } from "./product-repository"
import type { ProductStoreSnapshot } from "./product-store"
import type { Product } from "./types"

const initialFilters: ProductListFilters = {
  query: "",
  category: "all",
  status: "active",
  stock: "all",
  sort: "recent",
}

const statusOptions: readonly OperationalSelectOption[] = [
  { value: "active", label: "Active products" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
  { value: "archived", label: "Archived" },
]

const stockOptions: readonly OperationalSelectOption[] = [
  { value: "all", label: "All stock" },
  { value: "in-stock", label: "In stock" },
  { value: "low-stock", label: "Low stock" },
  { value: "out-of-stock", label: "Out of stock" },
]

const sortOptions: readonly OperationalSelectOption[] = [
  { value: "recent", label: "Recently updated" },
  { value: "name", label: "Name A–Z" },
  { value: "price", label: "Price high–low by currency" },
  { value: "stock", label: "Stock low–high" },
]

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
  const { page, setPage, applyAndReset } = useOperationalPagination()
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<number>>(new Set())
  const [archiveIds, setArchiveIds] = useState<readonly number[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [archiveError, setArchiveError] = useState("")
  const categories = useMemo(
    () => listProductCategories(snapshot.products),
    [snapshot.products]
  )
  const categoryOptions = useMemo<readonly OperationalSelectOption[]>(
    () => [
      { value: "all", label: t("All categories") },
      ...categories.map((category) => ({ value: category, label: category })),
    ],
    [categories, t]
  )
  const localizedStatusOptions = statusOptions.map((option) => ({
    ...option,
    label: t(option.label),
  }))
  const localizedStockOptions = stockOptions.map((option) => ({
    ...option,
    label: t(option.label),
  }))
  const localizedSortOptions = sortOptions.map((option) => ({
    ...option,
    label: t(option.label),
  }))
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
    applyAndReset(() => {
      setSelectedIds(new Set())
      setFilters((current) => ({ ...current, [key]: value }))
    })
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

  const resultStart = model.filteredCount === 0 ? 0 : (model.page - 1) * 15 + 1
  const resultEnd =
    model.filteredCount === 0 ? 0 : resultStart + model.items.length - 1
  const activeFilters: ActiveOperationalFilter[] = []
  const addActiveFilter = <Key extends keyof ProductListFilters>(
    id: string,
    label: string,
    key: Key,
    resetValue: ProductListFilters[Key]
  ) =>
    activeFilters.push({
      id,
      label,
      onRemove: () => updateFilter(key, resetValue),
    })

  if (filters.query) {
    addActiveFilter("query", `${t("Search")}: ${filters.query}`, "query", "")
  }
  if (filters.category !== "all") {
    addActiveFilter(
      "category",
      `${t("Category")}: ${filters.category}`,
      "category",
      "all"
    )
  }
  if (filters.status !== "active") {
    const statusLabel = localizedStatusOptions.find(
      (option) => option.value === filters.status
    )?.label
    addActiveFilter(
      "status",
      `${t("Status")}: ${statusLabel ?? filters.status}`,
      "status",
      "active"
    )
  }
  if (filters.stock !== "all") {
    const stockLabel = localizedStockOptions.find(
      (option) => option.value === filters.stock
    )?.label
    addActiveFilter(
      "stock",
      `${t("Stock")}: ${stockLabel ?? filters.stock}`,
      "stock",
      "all"
    )
  }
  if (filters.sort !== "recent") {
    const sortLabel = localizedSortOptions.find(
      (option) => option.value === filters.sort
    )?.label
    addActiveFilter(
      "sort",
      `${t("Sort")}: ${sortLabel ?? filters.sort}`,
      "sort",
      "recent"
    )
  }

  const clearAllFilters = () =>
    applyAndReset(() => {
      setFilters(initialFilters)
      setSelectedIds(new Set())
    })
  const desktopEmptyFilters: ProductListFilters = {
    ...filters,
    sort: "recent",
  }
  const mobileEmptyFilters: ProductListFilters = {
    ...initialFilters,
    query: filters.query,
  }

  const renderFilterFields = (
    draft: ProductListFilters,
    setDraft: Dispatch<SetStateAction<ProductListFilters>>,
    includePrimary: boolean
  ) => (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {includePrimary ? (
        <>
          <div className="grid gap-1.5 text-xs font-medium">
            <span>{t("Category")}</span>
            <OperationalToolbarSelect
              label={t("Category")}
              value={draft.category}
              options={categoryOptions}
              className="w-full"
              onValueChange={(category) =>
                setDraft((current) => ({ ...current, category }))
              }
            />
          </div>
          <div className="grid gap-1.5 text-xs font-medium">
            <span>{t("Status")}</span>
            <OperationalToolbarSelect
              label={t("Status")}
              value={draft.status}
              options={localizedStatusOptions}
              className="w-full"
              onValueChange={(status) =>
                setDraft((current) => ({
                  ...current,
                  status: status as ProductStatusFilter,
                }))
              }
            />
          </div>
          <div className="grid gap-1.5 text-xs font-medium">
            <span>{t("Stock")}</span>
            <OperationalToolbarSelect
              label={t("Stock")}
              value={draft.stock}
              options={localizedStockOptions}
              className="w-full"
              onValueChange={(stock) =>
                setDraft((current) => ({
                  ...current,
                  stock: stock as ProductStockFilter,
                }))
              }
            />
          </div>
        </>
      ) : null}
      <div className="grid gap-1.5 text-xs font-medium">
        <span>{t("Sort")}</span>
        <OperationalToolbarSelect
          label={t("Sort")}
          value={draft.sort}
          options={localizedSortOptions}
          className="w-full"
          onValueChange={(sort) =>
            setDraft((current) => ({
              ...current,
              sort: sort as ProductSort,
            }))
          }
        />
      </div>
    </div>
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
        <section aria-label={t("Product list")}>
          <OperationalListPanel
            toolbar={
              <OperationalFilterToolbar
                search={
                  <OperationalToolbarSearch
                    label={t("Search products")}
                    value={filters.query}
                    placeholder={t("Search title, SKU, brand or category")}
                    onChange={(query) => updateFilter("query", query)}
                  />
                }
                primaryFilters={
                  <>
                    <OperationalToolbarSelect
                      label={t("Category")}
                      value={filters.category}
                      options={categoryOptions}
                      onValueChange={(category) =>
                        updateFilter("category", category)
                      }
                    />
                    <OperationalToolbarSelect
                      label={t("Status")}
                      value={filters.status}
                      options={localizedStatusOptions}
                      onValueChange={(status) =>
                        updateFilter("status", status as ProductStatusFilter)
                      }
                    />
                    <OperationalToolbarSelect
                      label={t("Stock")}
                      value={filters.stock}
                      options={localizedStockOptions}
                      onValueChange={(stock) =>
                        updateFilter("stock", stock as ProductStockFilter)
                      }
                    />
                  </>
                }
                moreFilter={
                  <OperationalFilterPopover
                    value={filters}
                    emptyValue={desktopEmptyFilters}
                    onApply={(next) =>
                      applyAndReset(() => {
                        setFilters(next)
                        setSelectedIds(new Set())
                      })
                    }
                    trigger={
                      <OperationalFilterButton
                        kind="more"
                        label={t("More filters")}
                        activeCount={filters.sort === "recent" ? 0 : 1}
                      />
                    }
                    title={t("More filters")}
                    labels={{
                      clear: t("Clear"),
                      cancel: t("Cancel"),
                      apply: t("Apply"),
                    }}
                  >
                    {({ draft, setDraft }) =>
                      renderFilterFields(draft, setDraft, false)
                    }
                  </OperationalFilterPopover>
                }
                mobileFilter={
                  <OperationalFilterPopover
                    value={filters}
                    emptyValue={mobileEmptyFilters}
                    onApply={(next) =>
                      applyAndReset(() => {
                        setFilters(next)
                        setSelectedIds(new Set())
                      })
                    }
                    trigger={
                      <OperationalFilterButton
                        kind="filter"
                        label={t("Filter products")}
                        activeCount={
                          activeFilters.filter(({ id }) => id !== "query")
                            .length
                        }
                      />
                    }
                    title={t("Filter products")}
                    labels={{
                      clear: t("Clear"),
                      cancel: t("Cancel"),
                      apply: t("Apply"),
                    }}
                  >
                    {({ draft, setDraft }) =>
                      renderFilterFields(draft, setDraft, true)
                    }
                  </OperationalFilterPopover>
                }
              />
            }
            summary={
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <ActiveFilterSummary
                    resultLabel={t("Showing {{start}}–{{end}} / {{total}}", {
                      start: resultStart,
                      end: resultEnd,
                      total: model.filteredCount,
                    })}
                    filters={activeFilters}
                    clearAllLabel={t("Clear all")}
                    onClearAll={clearAllFilters}
                  />
                </div>
                {selectedIds.size > 0 ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => openArchiveDialog([...selectedIds])}
                  >
                    <Archive />
                    {t("Archive selected ({{count}})", {
                      count: selectedIds.size,
                    })}
                  </Button>
                ) : null}
              </div>
            }
            pagination={
              model.filteredCount > 0 ? (
                <OperationalPagination
                  page={model.page}
                  pageCount={model.pageCount}
                  ariaLabel={t("Product pagination")}
                  previousLabel={t("Previous page")}
                  nextLabel={t("Next page")}
                  onPageChange={setPage}
                />
              ) : undefined
            }
          >
            {selectedIds.size > 0 ? (
              <span className="sr-only">
                {t("{{count}} products selected", { count: selectedIds.size })}
              </span>
            ) : null}
            {message ? (
              <p className="border-b px-3 py-2 text-sm" role="status">
                {message}
              </p>
            ) : null}
            {snapshot.state === "loading" || snapshot.state === "idle" ? (
              <OperationalListState kind="loading">
                {t("Loading products…")}
              </OperationalListState>
            ) : snapshot.state === "error" ? (
              <OperationalListState kind="error">
                {t(snapshot.error ?? "Product data is unavailable.")}
              </OperationalListState>
            ) : snapshot.products.length === 0 ? (
              <OperationalListState kind="empty">
                <span className="grid justify-items-center gap-1">
                  <PackagePlus aria-hidden="true" />
                  <strong>{t("No products yet")}</strong>
                  <span>
                    {t("Add the first product to begin managing the catalog.")}
                  </span>
                </span>
              </OperationalListState>
            ) : model.filteredCount === 0 ? (
              <OperationalListState kind="empty">
                <span className="grid gap-1">
                  <strong>{t("No matching products")}</strong>
                  <span>
                    {t("Adjust the search or filters and try again.")}
                  </span>
                </span>
              </OperationalListState>
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
                            i18n.resolvedLanguage === "zh-TW"
                              ? "zh-TW"
                              : "en-US"
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
                              onClick={() =>
                                navigate(`/products/${product.id}`)
                              }
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
          </OperationalListPanel>
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
