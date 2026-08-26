import { TooltipProvider } from "@/components/ui/tooltip";
import { Outlet, Route, Routes } from 'react-router-dom';
import { Assistant } from "./app/assistant";
import { WebMcpDemo } from "./app/webmcp/demo";

export const Main = () => {
    return (<Outlet />)
};

export function App() {
    return (
        <TooltipProvider>
            <Routes>
                <Route path='/chat/:threadId' element={<Assistant />} />
                <Route path='/chat' element={<Assistant />} />
                <Route path='/webmcp-demo' element={<WebMcpDemo />} />
                <Route path='/' element={<Assistant />} />

                <Route path='*' element={<Assistant />} />
            </Routes>
        </TooltipProvider>
    );
}

export default App;
