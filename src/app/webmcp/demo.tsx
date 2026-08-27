import { useParams } from "react-router-dom"
import { getWebMcpSite } from "./sites"
import { VoltageAdminDemo } from "./voltage-admin"
import { VoltageMarketDemo } from "./voltage-market"

export const WebMcpDemo = () => {
  const { siteId } = useParams()
  const site = getWebMcpSite(siteId ?? "shop-b")

  return site?.id === "shop-c" ? <VoltageAdminDemo /> : <VoltageMarketDemo />
}
