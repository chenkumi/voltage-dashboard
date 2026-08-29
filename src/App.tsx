import { Navigate, Route, Routes } from "react-router-dom"
import { MainLayout } from "@/app/webmcp/voltage-admin-layout"
import { VoltageAdminProvider } from "@/app/webmcp/voltage-admin"
import {
  Customers,
  Dashboard,
  Inventory,
  Orders,
  Products,
  Reports,
} from "@/app/webmcp/voltage-admin-pages"

export function App() {
  return (
    <Routes>
      <Route element={<VoltageAdminProvider />}>
        <Route element={<MainLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="products" element={<Products />} />
          <Route path="orders" element={<Orders />} />
          <Route path="customers" element={<Customers />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="reports" element={<Reports />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default App
