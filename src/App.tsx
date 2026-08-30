import { Navigate, Route, Routes } from "react-router-dom"
import "./i18n"
import { EnterpriseAdminShell } from "@/app/webmcp/voltage-admin-shell"
import { VoltageAdminProvider } from "@/app/webmcp/voltage-admin"
import { ApprovalInboxPage } from "@/app/webmcp/operations/approval-inbox-page"
import { OperationsCasesPage } from "@/app/webmcp/operations/operations-cases-page"
import {
  ProductAddRoute,
  ProductEditRoute,
} from "@/app/webmcp/products/product-route-pages"
import { ProductListPage } from "@/app/webmcp/products/product-list-page"
import { ProductDetailPage } from "@/app/webmcp/products/product-detail-page"
import {
  InventoryDetailPage,
  InventoryPage,
} from "@/app/webmcp/inventory/inventory-pages"
import { OrderDetailPage, OrdersPage } from "@/app/webmcp/orders/order-pages"
import {
  CustomerDetailPage,
  CustomersPage,
} from "@/app/webmcp/customers/customer-pages"
import { CustomerEditorPage } from "@/app/webmcp/customers/customer-editor-page"
import { Dashboard, Reports } from "@/app/webmcp/voltage-admin-pages"

export function App() {
  return (
    <Routes>
      <Route element={<VoltageAdminProvider />}>
        <Route element={<EnterpriseAdminShell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="products" element={<ProductListPage />} />
          <Route path="products/add" element={<ProductAddRoute />} />
          <Route path="products/:productId" element={<ProductDetailPage />} />
          <Route
            path="products/edit/:productId"
            element={<ProductEditRoute />}
          />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="orders/:orderId" element={<OrderDetailPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route
            path="customers/add"
            element={<CustomerEditorPage mode="add" />}
          />
          <Route
            path="customers/edit/:customerId"
            element={<CustomerEditorPage mode="edit" />}
          />
          <Route
            path="customers/:customerId"
            element={<CustomerDetailPage />}
          />
          <Route path="inventory" element={<InventoryPage />} />
          <Route
            path="inventory/:productId"
            element={<InventoryDetailPage />}
          />
          <Route path="reports" element={<Reports />} />
          <Route path="operations-cases" element={<OperationsCasesPage />} />
          <Route path="approvals" element={<ApprovalInboxPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default App
