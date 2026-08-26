import { TooltipProvider } from "@/components/ui/tooltip";
import { Outlet, Route, Routes } from 'react-router-dom';
import { Assistant } from "./app/assistant";
// import { LocalAssistant } from "../.backup/assistant-local/local-assistant";
import { FileManagerPage } from "./app/file-manager";
import { WebMcpDemo } from "./app/webmcp/demo";


// import "./llm";

export const Main = () => {
    return (<Outlet />)
};

export function App() {
    return (
        <TooltipProvider>
            <Routes>
                {/* <Route path='/local/:threadId' element={<LocalAssistant />} />
                <Route path='/local' element={<LocalAssistant />} /> */}
                <Route path='/chat/:threadId' element={<Assistant />} />
                <Route path='/chat' element={<Assistant />} />
                <Route path='/files' element={<FileManagerPage />} />
                <Route path='/webmcp-demo' element={<WebMcpDemo />} />
                <Route path='/' element={<Assistant />} />

                <Route path='*' element={<Assistant />} />
            </Routes>
        </TooltipProvider>
    );
}

export default App;
