import { ChevronLeft } from "lucide-react"
import { useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, useParams } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  CUSTOMER_REGIONS,
  CUSTOMER_SAFE_TAGS,
  CUSTOMER_SEGMENTS,
  type Customer,
  type CustomerSafeTag,
  type CustomerWriteInput,
} from "../commerce-data/types"
import { GridBlock, PageLayout } from "../voltage-admin-page-layout"
import { useVoltageAdmin } from "../voltage-admin"

const createInitialInput = (customer: Customer | null): CustomerWriteInput =>
  customer
    ? {
        segment: customer.segment,
        region: customer.region,
        contact: { ...customer.contact },
        tags: [...customer.tags],
      }
    : {
        segment: "new",
        region: "north",
        contact: {
          fullName: "",
          email: "",
          phone: "",
          addressLine: "",
          city: "",
          postalCode: "",
          countryCode: "TW",
        },
        tags: [{ kind: "safe", value: "new_customer" }],
      }

const CustomerEditorForm = ({ customer }: { customer: Customer | null }) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { commerceRepository } = useVoltageAdmin()
  const [input, setInput] = useState(() => createInitialInput(customer))
  const [customTags, setCustomTags] = useState(
    () =>
      customer?.tags
        .filter((tag) => tag.kind === "custom")
        .map(({ value }) => value)
        .join(", ") ?? ""
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const selectedSafeTags = new Set(
    input.tags.filter((tag) => tag.kind === "safe").map(({ value }) => value)
  )

  const updateContact = (
    key: keyof CustomerWriteInput["contact"],
    value: string
  ) =>
    setInput((current) => ({
      ...current,
      contact: { ...current.contact, [key]: value },
    }))

  const toggleSafeTag = (tag: CustomerSafeTag) =>
    setInput((current) => ({
      ...current,
      tags: selectedSafeTags.has(tag)
        ? current.tags.filter(
            (item) => !(item.kind === "safe" && item.value === tag)
          )
        : [...current.tags, { kind: "safe", value: tag }],
    }))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError("")
    const safeTags = input.tags.filter((tag) => tag.kind === "safe")
    const parsedCustomTags = customTags
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => ({ kind: "custom" as const, value }))
    try {
      const saved = customer
        ? await commerceRepository.updateCustomer(customer.id, {
            ...input,
            tags: [...safeTags, ...parsedCustomTags],
          })
        : await commerceRepository.createCustomer({
            ...input,
            tags: [...safeTags, ...parsedCustomTags],
          })
      navigate(`/customers/${saved.id}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("Save failed."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)}>
      <Card>
        <CardHeader className="border-b">
          <CardTitle>{t("Customer information")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 pt-4 md:grid-cols-2">
          {(
            [
              ["fullName", "Full name", "text"],
              ["email", "Email", "email"],
              ["phone", "Phone", "tel"],
              ["addressLine", "Address", "text"],
              ["city", "City", "text"],
              ["postalCode", "Postal code", "text"],
            ] as const
          ).map(([key, label, type]) => (
            <label key={key} className="grid gap-1 text-sm">
              <span>{t(label)}</span>
              <input
                required
                type={type}
                className="h-9 rounded-md border bg-background px-2"
                value={input.contact[key]}
                onChange={(event) => updateContact(key, event.target.value)}
              />
            </label>
          ))}
          <label className="grid gap-1 text-sm">
            <span>{t("Customer segment")}</span>
            <select
              className="h-9 rounded-md border bg-background px-2"
              value={input.segment}
              onChange={(event) =>
                setInput((current) => ({
                  ...current,
                  segment: event.target.value as CustomerWriteInput["segment"],
                }))
              }
            >
              {CUSTOMER_SEGMENTS.map((segment) => (
                <option key={segment} value={segment}>
                  {t(segment)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span>{t("Region")}</span>
            <select
              className="h-9 rounded-md border bg-background px-2"
              value={input.region}
              onChange={(event) =>
                setInput((current) => ({
                  ...current,
                  region: event.target.value as CustomerWriteInput["region"],
                }))
              }
            >
              {CUSTOMER_REGIONS.map((region) => (
                <option key={region} value={region}>
                  {t(region)}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="grid gap-2 md:col-span-2">
            <legend className="text-sm font-medium">{t("Safe tags")}</legend>
            <div className="flex flex-wrap gap-2">
              {CUSTOMER_SAFE_TAGS.map((tag) => (
                <label key={tag} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedSafeTags.has(tag)}
                    onChange={() => toggleSafeTag(tag)}
                  />
                  <Badge variant="secondary">{t(tag)}</Badge>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="grid gap-1 text-sm md:col-span-2">
            <span>{t("Custom tags")}</span>
            <input
              className="h-9 rounded-md border bg-background px-2"
              value={customTags}
              onChange={(event) => setCustomTags(event.target.value)}
              placeholder={t("Comma-separated; UI only")}
            />
          </label>
          {error ? (
            <p role="alert" className="text-sm text-destructive md:col-span-2">
              {error}
            </p>
          ) : null}
          <footer className="flex justify-end gap-2 border-t pt-3 md:col-span-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(-1)}
            >
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? t("Saving…") : t("Save customer")}
            </Button>
          </footer>
        </CardContent>
      </Card>
    </form>
  )
}

export const CustomerEditorPage = ({ mode }: { mode: "add" | "edit" }) => {
  const { customerId } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { commerce } = useVoltageAdmin()
  const customer =
    mode === "edit"
      ? (commerce.customers.find(({ id }) => id === customerId) ?? null)
      : null
  const message =
    commerce.state === "error"
      ? t("Customer data is unavailable.")
      : commerce.state !== "ready"
        ? t("Loading customer…")
        : mode === "edit" && !customer
          ? t("Customer was not found.")
          : null

  return (
    <PageLayout
      ariaLabel={t(mode === "add" ? "Add customer" : "Edit customer")}
      pageName={mode === "add" ? "Add customer" : "Edit customer"}
      breadcrumb={[
        { label: "Customers", to: "/customers" },
        { label: mode === "add" ? "Add customer" : "Edit customer" },
      ]}
      actions={
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ChevronLeft /> {t("Back")}
        </Button>
      }
    >
      <GridBlock>
        {message ? (
          <Card>
            <CardContent className="flex min-h-40 items-center justify-center text-muted-foreground">
              {message}
            </CardContent>
          </Card>
        ) : (
          <CustomerEditorForm key={customer?.id ?? "new"} customer={customer} />
        )}
      </GridBlock>
    </PageLayout>
  )
}
