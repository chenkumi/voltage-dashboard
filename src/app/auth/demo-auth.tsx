import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react"
import { useLiveQuery } from "dexie-react-hooks"
import {
  demoAuthDb,
  DEMO_AUTH_SESSION_ID,
  type DemoAuthSession,
} from "./demo-auth-db"

const DEMO_USERNAME = "guest"
const DEMO_PASSWORD = "123456"

type DemoAuthContextValue = {
  status: "loading" | "authenticated" | "unauthenticated"
  isAuthenticated: boolean
  signIn: (username: string, password: string) => Promise<boolean>
  signOut: () => Promise<void>
}

const DemoAuthContext = createContext<DemoAuthContextValue | null>(null)

export const DemoAuthProvider = ({ children }: { children: ReactNode }) => {
  const session = useLiveQuery(
    async () => (await demoAuthDb.sessions.get(DEMO_AUTH_SESSION_ID)) ?? null,
    [],
    undefined
  )
  const status: DemoAuthContextValue["status"] =
    session === undefined
      ? "loading"
      : session?.username === DEMO_USERNAME
        ? "authenticated"
        : "unauthenticated"

  const signIn = useCallback(async (username: string, password: string) => {
    const isValid =
      username.trim() === DEMO_USERNAME && password === DEMO_PASSWORD
    if (!isValid) return false

    const session: DemoAuthSession = {
      id: DEMO_AUTH_SESSION_ID,
      username: DEMO_USERNAME,
      signedInAt: new Date().toISOString(),
    }
    await demoAuthDb.sessions.put(session)
    return true
  }, [])

  const signOut = useCallback(async () => {
    await demoAuthDb.sessions.delete(DEMO_AUTH_SESSION_ID)
  }, [])

  const value = useMemo(
    () => ({
      status,
      isAuthenticated: status === "authenticated",
      signIn,
      signOut,
    }),
    [signIn, signOut, status]
  )

  return (
    <DemoAuthContext.Provider value={value}>
      {children}
    </DemoAuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useDemoAuth = () => {
  const context = useContext(DemoAuthContext)
  if (!context) {
    throw new Error("useDemoAuth must be used inside DemoAuthProvider.")
  }
  return context
}
