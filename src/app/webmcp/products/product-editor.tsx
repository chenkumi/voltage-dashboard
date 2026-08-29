import {
  ArrowDown,
  ArrowUp,
  Archive,
  Check,
  ImageOff,
  Plus,
  RotateCcw,
  Save,
  Send,
  Trash2,
} from "lucide-react"
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { useTranslation } from "react-i18next"
import { unstable_usePrompt, useNavigate } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { GridBlock, PageLayout } from "../voltage-admin-page-layout"
import { createProductContentModel } from "./product-content-model"
import { ConfirmationDialog } from "./confirmation-dialog"
import type { ProductEditorController } from "./product-editor-controller"
import {
  createProductEditorState,
  markProductEditorSaved,
  patchProductDraft,
  setProductImages,
  setProductSpecifications,
  type ProductEditorMode,
  type ProductEditorState,
} from "./product-editor-state"
import { ProductValidationError } from "./product-repository"
import type { ProductRepository } from "./product-repository"
import type {
  Product,
  ProductImage,
  ProductSpecification,
  ProductWriteInput,
} from "./types"

let editorItemSequence = 0
const createEditorItemId = (prefix: string) => {
  editorItemSequence += 1
  return `${prefix}-${Date.now()}-${editorItemSequence}`
}

const moveItem = <T,>(items: readonly T[], index: number, offset: -1 | 1) => {
  const nextIndex = index + offset
  if (nextIndex < 0 || nextIndex >= items.length) return items
  const next = [...items]
  ;[next[index], next[nextIndex]] = [next[nextIndex], next[index]]
  return next
}

const EditorField = ({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: ReactNode
}) => (
  <label className="product-editor-field">
    <span>
      {label} {required ? <em aria-hidden="true">*</em> : null}
    </span>
    {children}
  </label>
)

const ImagePreview = ({ image }: { image: ProductImage }) => {
  const { t } = useTranslation()
  const [failedUrl, setFailedUrl] = useState("")
  const failed = failedUrl === image.url
  return failed || !image.url ? (
    <span
      className="product-editor-image-fallback"
      title={t("Image unavailable")}
    >
      <ImageOff />
    </span>
  ) : (
    <img src={image.url} alt="" onError={() => setFailedUrl(image.url)} />
  )
}

const CompletionSummary = ({ state }: { state: ProductEditorState }) => {
  const { t } = useTranslation()
  const completeCount = 8 - state.missingFields.length
  return (
    <aside className="voltage-admin-panel product-editor-summary">
      <div className="product-editor-summary-heading">
        <div>
          <p className="product-section-kicker">{t("Completion")}</p>
          <strong>
            {t("{{count}} of 8 required areas complete", {
              count: Math.max(0, completeCount),
            })}
          </strong>
        </div>
        <Badge variant="outline">v{state.version}</Badge>
      </div>
      {state.valid ? (
        <p className="product-editor-valid">
          <Check /> {t("Ready to publish")}
        </p>
      ) : (
        <>
          <p>{t("Complete these fields before publishing:")}</p>
          <ul>
            {state.missingFields.map((field) => (
              <li key={field}>{t(field)}</li>
            ))}
          </ul>
        </>
      )}
      <p className="product-editor-dirty">
        {state.dirty ? t("Unsaved changes") : t("All changes saved")}
      </p>
    </aside>
  )
}

const ProductEditorPreview = ({ draft }: { draft: ProductWriteInput }) => {
  const { t, i18n } = useTranslation()
  const content = createProductContentModel(draft)
  const price = new Intl.NumberFormat(
    i18n.language === "zh-TW" ? "zh-TW" : "en-US",
    {
      style: "currency",
      currency: draft.price.currency,
      maximumFractionDigits: draft.price.currency === "TWD" ? 0 : 2,
    }
  ).format(draft.price.amount || 0)
  return (
    <section
      className="voltage-admin-panel product-editor-preview"
      aria-label={t("Product preview")}
    >
      <div className="product-editor-preview-heading">
        <div>
          <p className="product-section-kicker">{t("Product preview")}</p>
          <h2>{content.title || t("Untitled product")}</h2>
        </div>
        <strong>{price}</strong>
      </div>
      <div className="product-editor-preview-body">
        {content.primaryImage ? (
          <ImagePreview image={content.primaryImage} />
        ) : (
          <span className="product-editor-image-fallback">
            <ImageOff />
          </span>
        )}
        <div>
          <p>
            {content.shortAdCopy ||
              t("Short advertising copy will appear here.")}
          </p>
          <dl>
            {content.specifications.map((item) => (
              <div key={item.id}>
                <dt>{item.title || t("Specification")}</dt>
                <dd>
                  {item.value}
                  {item.unit ? ` ${item.unit}` : ""}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      <p className="product-editor-preview-description">
        {content.description || t("Product description will appear here.")}
      </p>
      {content.longAdCopy ? (
        <div className="product-editor-preview-copy">{content.longAdCopy}</div>
      ) : null}
    </section>
  )
}

export const ProductEditor = ({
  mode,
  product,
  sourceProduct,
  repository,
  controller,
}: {
  mode: ProductEditorMode
  product?: Product
  sourceProduct?: Product
  repository: Pick<
    ProductRepository,
    "create" | "update" | "publish" | "archiveMany" | "restore"
  >
  controller?: ProductEditorController
}) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const initialProduct = mode === "edit" ? product : sourceProduct
  const [state, setState] = useState(() => {
    const initial = createProductEditorState(mode, initialProduct)
    return sourceProduct && mode === "create"
      ? patchProductDraft(initial, { sku: "" })
      : initial
  })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [errors, setErrors] = useState<readonly string[]>([])
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState("")

  useLayoutEffect(() => {
    if (!controller) return
    return controller.attach(state, setState)
    // The controller receives subsequent state through the update effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller])

  useLayoutEffect(() => controller?.update(state), [controller, state])

  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (!state.dirty) return
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", guard)
    return () => window.removeEventListener("beforeunload", guard)
  }, [state.dirty])

  unstable_usePrompt({
    message: t("Discard unsaved changes?"),
    when: state.dirty,
  })

  useEffect(() => {
    if (pendingNavigation && !state.dirty) navigate(pendingNavigation)
  }, [navigate, pendingNavigation, state.dirty])

  const pageName =
    mode === "create"
      ? t("Add product")
      : t("Edit {{title}}", { title: product?.title ?? "" })
  const update = (patch: Partial<ProductWriteInput>) =>
    setState((current) => patchProductDraft(current, patch))
  const setSpecifications = (items: readonly ProductSpecification[]) =>
    setState((current) => setProductSpecifications(current, items))
  const setImages = (items: readonly ProductImage[]) =>
    setState((current) => setProductImages(current, items))

  const handleError = (error: unknown) => {
    if (error instanceof ProductValidationError) {
      setErrors(error.issues.map((issue) => t(issue.field)))
    } else {
      setErrors([t("Product could not be saved.")])
    }
  }

  const persist = async (intent: "draft" | "publish" | "update") => {
    setBusy(true)
    setErrors([])
    setMessage("")
    try {
      let saved: Product
      if (mode === "create") {
        saved = await repository.create(
          state.draft,
          intent === "publish" ? "published" : "draft"
        )
      } else {
        saved = await repository.update(product!.id, state.draft)
        if (intent === "publish" && saved.status === "draft") {
          saved = await repository.publish(saved.id)
        }
      }
      setState((current) => markProductEditorSaved(current, saved))
      setMessage(
        intent === "publish" ? t("Product published.") : t("Product saved.")
      )
      setPendingNavigation(`/products/${saved.id}`)
    } catch (error) {
      handleError(error)
    } finally {
      setBusy(false)
    }
  }

  const leave = () => {
    navigate(product ? `/products/${product.id}` : "/products")
  }

  const archive = async () => {
    if (!product) return
    setBusy(true)
    setErrors([])
    try {
      const [saved] = await repository.archiveMany([product.id])
      if (!saved) throw new Error("Product was not archived.")
      setState((current) => markProductEditorSaved(current, saved))
      setConfirmArchive(false)
      setPendingNavigation(`/products/${saved.id}`)
    } catch {
      setErrors([t("Product could not be archived.")])
    } finally {
      setBusy(false)
    }
  }

  const restore = async () => {
    if (!product) return
    setBusy(true)
    setErrors([])
    try {
      const saved = await repository.restore(product.id)
      setState((current) => markProductEditorSaved(current, saved))
      setPendingNavigation(`/products/${saved.id}`)
    } catch {
      setErrors([t("Product could not be restored.")])
    } finally {
      setBusy(false)
    }
  }

  const sortedImages = useMemo(
    () => [...state.draft.images].sort((a, b) => a.position - b.position),
    [state.draft.images]
  )
  const sortedSpecifications = useMemo(
    () =>
      [...state.draft.specifications].sort((a, b) => a.position - b.position),
    [state.draft.specifications]
  )

  return (
    <PageLayout
      ariaLabel={pageName}
      pageName={pageName}
      translatePageName={false}
      breadcrumb={[
        { label: "Products", to: "/products" },
        ...(product
          ? [
              {
                label: product.title,
                to: `/products/${product.id}`,
                translate: false,
              },
            ]
          : []),
        { label: mode === "create" ? "Add product" : "Edit" },
      ]}
      status={
        state.dirty ? (
          <Badge variant="outline">{t("Unsaved")}</Badge>
        ) : undefined
      }
      actions={
        <>
          <Button type="button" variant="outline" onClick={leave}>
            {t("Cancel")}
          </Button>
          {product?.status === "archived" ? (
            <Button
              type="button"
              disabled={busy}
              onClick={() => void restore()}
            >
              <RotateCcw /> {t("Restore")}
            </Button>
          ) : mode === "create" ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void persist("draft")}
            >
              <Save /> {t("Save draft")}
            </Button>
          ) : (
            <Button
              type="button"
              disabled={busy || !state.dirty}
              onClick={() => void persist("update")}
            >
              <Save /> {t("Save changes")}
            </Button>
          )}
          {mode === "create" || product?.status === "draft" ? (
            <Button
              type="button"
              disabled={busy || !state.valid}
              onClick={() => void persist("publish")}
            >
              <Send /> {t("Publish product")}
            </Button>
          ) : null}
          {mode === "edit" && product?.status !== "archived" ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy || state.dirty}
              title={
                state.dirty ? t("Save changes before archiving.") : undefined
              }
              onClick={() => setConfirmArchive(true)}
            >
              <Archive /> {t("Archive")}
            </Button>
          ) : null}
        </>
      }
    >
      {message ? (
        <GridBlock>
          <p className="product-action-message" role="status">
            {message}
          </p>
        </GridBlock>
      ) : null}
      {errors.length ? (
        <GridBlock>
          <div className="product-action-error" role="alert">
            <strong>{t("Check the following fields:")}</strong>
            <ul>
              {errors.map((error, index) => (
                <li key={`${error}-${index}`}>{error}</li>
              ))}
            </ul>
          </div>
        </GridBlock>
      ) : null}
      <GridBlock className="col-span-12 lg:col-span-8">
        <form
          className="product-editor-form"
          onSubmit={(event) => event.preventDefault()}
        >
          <fieldset
            className="product-editor-fieldset"
            disabled={product?.status === "archived"}
          >
            <section className="voltage-admin-panel product-editor-section">
              <div className="product-editor-section-heading">
                <div>
                  <p className="product-section-kicker">
                    {t("Basic information")}
                  </p>
                  <h2>{t("Product identity and inventory")}</h2>
                </div>
              </div>
              <div className="product-editor-grid">
                <EditorField label={t("SKU")} required>
                  <input
                    name="sku"
                    value={state.draft.sku}
                    onChange={(event) => update({ sku: event.target.value })}
                  />
                </EditorField>
                <EditorField label={t("Title")} required>
                  <input
                    name="title"
                    value={state.draft.title}
                    onChange={(event) => update({ title: event.target.value })}
                  />
                </EditorField>
                <EditorField label={t("Brand")}>
                  <input
                    name="brand"
                    value={state.draft.brand ?? ""}
                    onChange={(event) =>
                      update({ brand: event.target.value || null })
                    }
                  />
                </EditorField>
                <EditorField label={t("Category")} required>
                  <input
                    name="category"
                    value={state.draft.category}
                    onChange={(event) =>
                      update({ category: event.target.value })
                    }
                  />
                </EditorField>
                <EditorField label={t("Price")} required>
                  <input
                    name="price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={state.draft.price.amount}
                    onChange={(event) =>
                      update({
                        price: {
                          ...state.draft.price,
                          amount: Number(event.target.value),
                        },
                      })
                    }
                  />
                </EditorField>
                <EditorField label={t("Currency")} required>
                  <select
                    name="currency"
                    value={state.draft.price.currency}
                    onChange={(event) =>
                      update({
                        price: {
                          ...state.draft.price,
                          currency: event.target.value as "USD" | "TWD",
                        },
                      })
                    }
                  >
                    <option value="USD">USD</option>
                    <option value="TWD">TWD</option>
                  </select>
                </EditorField>
                <EditorField label={t("Stock")} required>
                  <input
                    name="stock"
                    type="number"
                    min="0"
                    step="1"
                    value={state.draft.stock}
                    onChange={(event) =>
                      update({ stock: Number(event.target.value) })
                    }
                  />
                </EditorField>
              </div>
            </section>

            <section className="voltage-admin-panel product-editor-section">
              <div className="product-editor-section-heading">
                <div>
                  <p className="product-section-kicker">{t("Content")}</p>
                  <h2>{t("Description and advertising copy")}</h2>
                </div>
              </div>
              <EditorField label={t("Description")} required>
                <textarea
                  name="description"
                  rows={5}
                  value={state.draft.description}
                  onChange={(event) =>
                    update({ description: event.target.value })
                  }
                />
              </EditorField>
              <EditorField label={t("Short advertising copy")} required>
                <textarea
                  name="shortAdCopy"
                  rows={2}
                  value={state.draft.shortAdCopy}
                  onChange={(event) =>
                    update({ shortAdCopy: event.target.value })
                  }
                />
              </EditorField>
              <EditorField label={t("Long advertising copy")} required>
                <textarea
                  name="longAdCopy"
                  rows={7}
                  value={state.draft.longAdCopy}
                  onChange={(event) =>
                    update({ longAdCopy: event.target.value })
                  }
                />
              </EditorField>
            </section>

            <section className="voltage-admin-panel product-editor-section">
              <div className="product-editor-section-heading">
                <div>
                  <p className="product-section-kicker">{t("Images")}</p>
                  <h2>{t("Product image URLs")}</h2>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setImages([
                      ...sortedImages,
                      {
                        id: createEditorItemId("image"),
                        url: "",
                        alt: "",
                        position: sortedImages.length,
                        isPrimary: sortedImages.length === 0,
                      },
                    ])
                  }
                >
                  <Plus /> {t("Add image")}
                </Button>
              </div>
              {sortedImages.length === 0 ? (
                <p className="product-editor-empty">{t("No images added.")}</p>
              ) : (
                <div className="product-editor-list">
                  {sortedImages.map((image, index) => (
                    <div className="product-editor-image-row" key={image.id}>
                      <ImagePreview image={image} />
                      <div className="product-editor-list-fields">
                        <EditorField label={t("HTTPS URL")}>
                          <input
                            aria-label={t("Image URL {{number}}", {
                              number: index + 1,
                            })}
                            type="url"
                            value={image.url}
                            onChange={(event) =>
                              setImages(
                                sortedImages.map((item) =>
                                  item.id === image.id
                                    ? { ...item, url: event.target.value }
                                    : item
                                )
                              )
                            }
                          />
                        </EditorField>
                        <EditorField label={t("Alt text")}>
                          <input
                            value={image.alt}
                            onChange={(event) =>
                              setImages(
                                sortedImages.map((item) =>
                                  item.id === image.id
                                    ? { ...item, alt: event.target.value }
                                    : item
                                )
                              )
                            }
                          />
                        </EditorField>
                      </div>
                      <label className="product-editor-primary">
                        <input
                          type="radio"
                          name="primaryImage"
                          checked={image.isPrimary}
                          onChange={() =>
                            setImages(
                              sortedImages.map((item) => ({
                                ...item,
                                isPrimary: item.id === image.id,
                              }))
                            )
                          }
                        />{" "}
                        {t("Primary")}
                      </label>
                      <div className="product-editor-row-actions">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label={t("Move image up")}
                          disabled={index === 0}
                          onClick={() =>
                            setImages(moveItem(sortedImages, index, -1))
                          }
                        >
                          <ArrowUp />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label={t("Move image down")}
                          disabled={index === sortedImages.length - 1}
                          onClick={() =>
                            setImages(moveItem(sortedImages, index, 1))
                          }
                        >
                          <ArrowDown />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label={t("Remove image")}
                          onClick={() =>
                            setImages(
                              sortedImages.filter(
                                (item) => item.id !== image.id
                              )
                            )
                          }
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="voltage-admin-panel product-editor-section">
              <div className="product-editor-section-heading">
                <div>
                  <p className="product-section-kicker">
                    {t("Specifications")}
                  </p>
                  <h2>{t("Flexible product specifications")}</h2>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setSpecifications([
                      ...sortedSpecifications,
                      {
                        id: createEditorItemId("spec"),
                        title: "",
                        value: "",
                        unit: "",
                        position: sortedSpecifications.length,
                      },
                    ])
                  }
                >
                  <Plus /> {t("Add specification")}
                </Button>
              </div>
              {sortedSpecifications.length === 0 ? (
                <p className="product-editor-empty">
                  {t("No specifications added.")}
                </p>
              ) : (
                <div className="product-editor-list">
                  {sortedSpecifications.map((specification, index) => (
                    <div
                      className="product-editor-spec-row"
                      key={specification.id}
                    >
                      <EditorField label={t("Specification title")}>
                        <input
                          aria-label={t("Specification title {{number}}", {
                            number: index + 1,
                          })}
                          value={specification.title}
                          onChange={(event) =>
                            setSpecifications(
                              sortedSpecifications.map((item) =>
                                item.id === specification.id
                                  ? { ...item, title: event.target.value }
                                  : item
                              )
                            )
                          }
                        />
                      </EditorField>
                      <EditorField label={t("Value")}>
                        <input
                          value={specification.value}
                          onChange={(event) =>
                            setSpecifications(
                              sortedSpecifications.map((item) =>
                                item.id === specification.id
                                  ? { ...item, value: event.target.value }
                                  : item
                              )
                            )
                          }
                        />
                      </EditorField>
                      <EditorField label={t("Unit")}>
                        <input
                          value={specification.unit}
                          onChange={(event) =>
                            setSpecifications(
                              sortedSpecifications.map((item) =>
                                item.id === specification.id
                                  ? { ...item, unit: event.target.value }
                                  : item
                              )
                            )
                          }
                        />
                      </EditorField>
                      <div className="product-editor-row-actions">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label={t("Move specification up")}
                          disabled={index === 0}
                          onClick={() =>
                            setSpecifications(
                              moveItem(sortedSpecifications, index, -1)
                            )
                          }
                        >
                          <ArrowUp />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label={t("Move specification down")}
                          disabled={index === sortedSpecifications.length - 1}
                          onClick={() =>
                            setSpecifications(
                              moveItem(sortedSpecifications, index, 1)
                            )
                          }
                        >
                          <ArrowDown />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label={t("Remove specification")}
                          onClick={() =>
                            setSpecifications(
                              sortedSpecifications.filter(
                                (item) => item.id !== specification.id
                              )
                            )
                          }
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </fieldset>
        </form>
      </GridBlock>
      <GridBlock className="col-span-12 lg:col-span-4">
        <div className="product-editor-sidebar">
          <CompletionSummary state={state} />
          <ProductEditorPreview draft={state.draft} />
        </div>
      </GridBlock>
      <ConfirmationDialog
        open={confirmArchive}
        title={t("Archive product?")}
        description={t(
          "Archived products are hidden from the active list and can be restored later."
        )}
        confirmLabel={t("Archive")}
        busy={busy}
        error={errors[0] ?? ""}
        onCancel={() => {
          if (!busy) setConfirmArchive(false)
        }}
        onConfirm={() => void archive()}
      />
    </PageLayout>
  )
}
