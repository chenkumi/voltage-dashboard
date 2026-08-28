import { Navigate, Route, Routes } from 'react-router-dom';
import { lazy, Suspense, useEffect, useState } from "react";
import { Assistant } from "./app/assistant";
import { initializeSiteProfiles } from "./app/assistant/site-profile-store";

const WebMcpDemo = lazy(() =>
    import("./app/webmcp/demo").then(({ WebMcpDemo }) => ({ default: WebMcpDemo }))
);

const ProfileBootstrap = ({ children }: { children: React.ReactNode }) => {
    const [error, setError] = useState<string | null>(null)
    const [retryNonce, setRetryNonce] = useState(0)

    useEffect(() => {
        void initializeSiteProfiles().catch((reason: unknown) => {
            setError(reason instanceof Error ? reason.message : "Unable to initialize profiles.")
        })
    }, [retryNonce])

    if (error) {
        return (
            <div className="flex h-screen flex-col items-center justify-center gap-3 bg-[#101417] text-slate-200">
                <p role="alert" className="text-sm">{error}</p>
                <button
                    type="button"
                    className="rounded-md bg-amber-300 px-3 py-2 text-sm font-semibold text-[#101417]"
                    onClick={() => {
                        setError(null)
                        setRetryNonce((current) => current + 1)
                    }}
                >
                    Retry
                </button>
            </div>
        )
    }

    return children
}

export function App() {
    return (
        <Routes>
            <Route path='/market' element={<Suspense fallback={null}><WebMcpDemo siteId="market" /></Suspense>} />
            <Route path='/dashboard' element={<Suspense fallback={null}><WebMcpDemo siteId="dashboard" /></Suspense>} />
            <Route path='/webmcp-demo/shop-b' element={<Suspense fallback={null}><WebMcpDemo siteId="market" /></Suspense>} />
            <Route path='/webmcp-demo/shop-c' element={<Suspense fallback={null}><WebMcpDemo siteId="dashboard" /></Suspense>} />
            <Route path='/webmcp-demo/legacy-shop-b' element={<Suspense fallback={null}><WebMcpDemo siteId="market" /></Suspense>} />
            <Route path='/' element={<ProfileBootstrap><Assistant /></ProfileBootstrap>} />

            <Route path='*' element={<Navigate to="/" replace />} />
        </Routes>
    );
}

export default App;
