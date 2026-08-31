import { LockKeyhole, ShieldCheck } from "lucide-react"
import { useState, type FormEvent } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { useDemoAuth } from "./demo-auth"
import "../webmcp/voltage-admin.css"

const getRedirectPath = (state: unknown) => {
  if (
    typeof state === "object" &&
    state !== null &&
    "from" in state &&
    typeof state.from === "string" &&
    state.from.startsWith("/") &&
    !state.from.startsWith("//") &&
    !state.from.startsWith("/login")
  ) {
    return state.from
  }
  return "/dashboard"
}

export const LoginPage = () => {
  const { signIn } = useDemoAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [username, setUsername] = useState("guest")
  const [password, setPassword] = useState("123456")
  const [error, setError] = useState("")

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!(await signIn(username, password))) {
      setError("帳號或密碼不正確，請使用展示帳號登入。")
      return
    }
    navigate(getRedirectPath(location.state), { replace: true })
  }

  return (
    <main className="voltage-admin demo-login-shell">
      <section
        className="demo-login-intro"
        aria-labelledby="login-product-name"
      >
        <div className="demo-login-brand" aria-hidden="true">
          V
        </div>
        <p className="demo-login-eyebrow">OPERATIONS CONTROL CENTER</p>
        <h1 id="login-product-name">Voltage</h1>
        <p>
          統一管理商品、訂單、售後與營運報表，讓團隊與 Agent
          在清楚的權限邊界中協作。
        </p>
        <div className="demo-login-capabilities">
          <span>
            <ShieldCheck aria-hidden="true" />
            僅於登入後啟用營運工具
          </span>
          <span>
            <LockKeyhole aria-hidden="true" />
            展示模式，不連接正式帳號系統
          </span>
        </div>
      </section>

      <section className="demo-login-panel" aria-labelledby="login-heading">
        <div className="demo-login-panel-heading">
          <p>DEMO ACCESS</p>
          <h2 id="login-heading">登入營運後台</h2>
          <span>請使用展示帳號繼續。</span>
        </div>

        <form className="demo-login-form" onSubmit={submit}>
          <label htmlFor="demo-username">
            帳號
            <input
              id="demo-username"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label htmlFor="demo-password">
            密碼
            <input
              id="demo-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error ? (
            <p className="demo-login-error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit">登入 Voltage</button>
        </form>

        <p className="demo-login-hint">
          展示帳號：<strong>guest</strong>
          <span aria-hidden="true"> / </span>
          <strong>123456</strong>
        </p>
      </section>
    </main>
  )
}
