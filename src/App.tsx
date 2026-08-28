import { Navigate, Route, Routes } from 'react-router-dom';
import { lazy, Suspense, useEffect } from "react";
import { Assistant } from "./app/assistant";
import { initializeSiteProfiles } from "./app/assistant/site-profile-store";

const WebMcpDemo = lazy(() =>
    import("./app/webmcp/demo").then(({ WebMcpDemo }) => ({ default: WebMcpDemo }))
);

export function App() {
    useEffect(() => {
        void initializeSiteProfiles()
    }, [])

    return (
        <Routes>
            <Route path='/market' element={<Suspense fallback={null}><WebMcpDemo siteId="market" /></Suspense>} />
            <Route path='/dashboard' element={<Suspense fallback={null}><WebMcpDemo siteId="dashboard" /></Suspense>} />
            <Route path='/webmcp-demo/shop-b' element={<Suspense fallback={null}><WebMcpDemo siteId="market" /></Suspense>} />
            <Route path='/webmcp-demo/shop-c' element={<Suspense fallback={null}><WebMcpDemo siteId="dashboard" /></Suspense>} />
            <Route path='/' element={<Assistant />} />

            <Route path='*' element={<Navigate to="/" replace />} />
        </Routes>
    );
}

export default App;
