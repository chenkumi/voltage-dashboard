import { Route, Routes } from 'react-router-dom';
import { lazy, Suspense } from "react";
import { Assistant } from "./app/assistant";

const WebMcpDemo = lazy(() =>
    import("./app/webmcp/demo").then(({ WebMcpDemo }) => ({ default: WebMcpDemo }))
);

export function App() {
    return (
        <Routes>
            <Route path='/chat/:threadId' element={<Assistant />} />
            <Route path='/chat' element={<Assistant />} />
            <Route path='/webmcp-demo' element={<Suspense fallback={null}><WebMcpDemo /></Suspense>} />
            <Route path='/webmcp-demo/:siteId' element={<Suspense fallback={null}><WebMcpDemo /></Suspense>} />
            <Route path='/' element={<Assistant />} />

            <Route path='*' element={<Assistant />} />
        </Routes>
    );
}

export default App;
