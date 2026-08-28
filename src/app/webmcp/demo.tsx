import { VoltageAdminDemo } from "./voltage-admin"
import { VoltageMarketDemo } from "./voltage-market"

export const WebMcpDemo = ({ siteId }: { siteId: "market" | "dashboard" }) => {
  return siteId === "dashboard" ? <VoltageAdminDemo /> : <VoltageMarketDemo />
}
