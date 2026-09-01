import { Languages, LockKeyhole, ShieldCheck } from "lucide-react"
import { useEffect, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
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
  const { t, i18n } = useTranslation()
  const { isAuthenticated, signIn } = useDemoAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const redirectPath = getRedirectPath(location.state)
  const [username, setUsername] = useState("guest")
  const [password, setPassword] = useState("123456")
  const [hasInvalidCredentials, setHasInvalidCredentials] = useState(false)
  const [isSigningIn, setIsSigningIn] = useState(false)

  useEffect(() => {
    if (isAuthenticated) {
      navigate(redirectPath, { replace: true })
    }
  }, [isAuthenticated, navigate, redirectPath])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setHasInvalidCredentials(false)
    setIsSigningIn(true)
    if (!(await signIn(username, password))) {
      setHasInvalidCredentials(true)
      setIsSigningIn(false)
      return
    }
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
        <p className="demo-login-eyebrow">
          {t("OPERATIONS CONTROL CENTER")}
        </p>
        <h1 id="login-product-name">Voltage</h1>
        <p>
          {t(
            "Manage products, orders, after-sales service, and operational reports in one place, so teams and agents can collaborate within clear permission boundaries."
          )}
        </p>
        <div className="demo-login-capabilities">
          <span>
            <ShieldCheck aria-hidden="true" />
            {t("Operations tools are enabled only after sign-in")}
          </span>
          <span>
            <LockKeyhole aria-hidden="true" />
            {t("Demo mode; no production account system is connected")}
          </span>
        </div>
      </section>

      <section className="demo-login-panel" aria-labelledby="login-heading">
        <div className="demo-login-panel-heading">
          <div className="demo-login-panel-kicker">
            <p>{t("DEMO ACCESS")}</p>
            <label className="demo-login-language" htmlFor="demo-language">
              <Languages aria-hidden="true" />
              <span className="sr-only">{t("Switch language")}</span>
              <select
                id="demo-language"
                aria-label={t("Switch language")}
                value={i18n.resolvedLanguage === "zh-TW" ? "zh-TW" : "en"}
                onChange={(event) =>
                  void i18n.changeLanguage(event.target.value)
                }
              >
                <option value="en">{t("English")}</option>
                <option value="zh-TW">{t("Traditional Chinese")}</option>
              </select>
            </label>
          </div>
          <h2 id="login-heading">{t("Sign in to operations")}</h2>
          <span>{t("Use the demo account to continue.")}</span>
        </div>

        <form className="demo-login-form" onSubmit={submit}>
          <label htmlFor="demo-username">
            {t("Username")}
            <input
              id="demo-username"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label htmlFor="demo-password">
            {t("Password")}
            <input
              id="demo-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {hasInvalidCredentials ? (
            <p className="demo-login-error" role="alert">
              {t(
                "Incorrect username or password. Use the demo account to sign in."
              )}
            </p>
          ) : null}
          <button type="submit" disabled={isSigningIn} aria-busy={isSigningIn}>
            {t(isSigningIn ? "Signing in…" : "Sign in to Voltage")}
          </button>
        </form>

        <p className="demo-login-hint">
          {t("Demo account:")} <strong>guest</strong>
          <span aria-hidden="true"> / </span>
          <strong>123456</strong>
        </p>
      </section>
    </main>
  )
}
