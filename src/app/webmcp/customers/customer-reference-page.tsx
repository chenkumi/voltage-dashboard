import { ChevronLeft } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useNavigate, useParams } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { GridBlock, PageLayout } from "../voltage-admin-page-layout"
import { useVoltageAdmin } from "../voltage-admin"

const maskName = (value: string) => `${value.slice(0, 1)}•••`

const maskEmail = (value: string) => {
  const [local = "", domain = ""] = value.split("@")
  return `${local.slice(0, 1)}•••@${domain}`
}

export const CustomerReferencePage = () => {
  const { customerId } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { commerce } = useVoltageAdmin()
  const customer = commerce.customers.find(({ id }) => id === customerId)
  const orders = commerce.orders.filter(
    ({ customerId: id }) => id === customerId
  )
  const stateMessage =
    commerce.state === "error"
      ? t("Customer data is unavailable.")
      : commerce.state !== "ready"
        ? t("Loading customer…")
        : !customer
          ? t("Customer was not found.")
          : null

  return (
    <PageLayout
      ariaLabel={t("Customer reference")}
      pageName={customer?.id ?? t("Customer reference")}
      translatePageName={!customer}
      breadcrumb={[
        { label: "Customers", to: "/customers" },
        { label: customer?.id ?? "Not found", translate: !customer },
      ]}
      status={
        customer ? (
          <Badge variant="outline">{t(customer.status)}</Badge>
        ) : undefined
      }
      actions={
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ChevronLeft />
          {t("Back")}
        </Button>
      }
    >
      {stateMessage ? (
        <GridBlock>
          <Card>
            <CardContent className="flex min-h-40 items-center justify-center text-muted-foreground">
              {stateMessage}
            </CardContent>
          </Card>
        </GridBlock>
      ) : null}
      {customer ? (
        <>
          <GridBlock className="col-span-12 lg:col-span-6">
            <Card className="h-full">
              <CardHeader>
                <CardTitle>{t("Masked customer profile")}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 text-sm">
                <strong>{maskName(customer.contact.fullName)}</strong>
                <span>{maskEmail(customer.contact.email)}</span>
                <span>
                  {t(customer.segment)} · {t(customer.region)}
                </span>
                <p className="text-xs text-muted-foreground">
                  {t("Contact details remain masked in this order workflow.")}
                </p>
              </CardContent>
            </Card>
          </GridBlock>
          <GridBlock className="col-span-12 lg:col-span-6">
            <Card className="h-full">
              <CardHeader>
                <CardTitle>{t("Customer orders")}</CardTitle>
              </CardHeader>
              <CardContent>
                <strong className="text-2xl tabular-nums">
                  {orders.length}
                </strong>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("Open Orders to inspect readonly snapshots.")}
                </p>
              </CardContent>
            </Card>
          </GridBlock>
        </>
      ) : null}
    </PageLayout>
  )
}
