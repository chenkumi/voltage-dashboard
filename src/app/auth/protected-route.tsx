import { Navigate, Outlet, useLocation } from "react-router-dom"
import { useDemoAuth } from "./demo-auth"

export const ProtectedRoute = () => {
  const { status } = useDemoAuth()
  const location = useLocation()

  if (status === "loading") {
    return (
      <main className="voltage-admin demo-auth-loading" aria-busy="true">
        正在驗證展示登入狀態…
      </main>
    )
  }

  return status === "authenticated" ? (
    <Outlet />
  ) : (
    <Navigate
      to="/login"
      replace
      state={{ from: `${location.pathname}${location.search}${location.hash}` }}
    />
  )
}
