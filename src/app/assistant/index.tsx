import { useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { AssistantChatHeader } from "./components/chat-header";
import { AssistantChatInput } from "./components/chat-input";
import { AssistantChatWindow } from "./components/chat-window";
import { AssistantDatasourceProvider, AssistantMessageProvider, AssistantThreadProvider, AssistantViewStateProvider, useAssistantThread } from "./datasource";
import { AssistantRuntime } from "./runtime";
import { Toaster } from "@/components/ui/sonner"
import { AssistantControllerProvider } from "./controller/AssistantControllerProvider";
import { WebMcpWorkspace } from "../webmcp/workspace";
import { webMcpAgent } from "../webmcp/agent";

// ?????A11y ??皜莎????憸?
export const AssistantObserver = () => {
    const thread = useAssistantThread();
    const navigate = useNavigate();
    useEffect(() => {
        if (thread === null) {
            navigate('/');
        }
    }, [thread]);
    return <></>
}

export const Assistant = () => {
    const { threadId } = useParams();

    return <AssistantDatasourceProvider>
        <AssistantThreadProvider threadId={threadId}>
            <AssistantMessageProvider>
                <AssistantViewStateProvider>
                    <AssistantRuntime agent={webMcpAgent}>
                        <AssistantControllerProvider>
                        <div className="flex h-full w-full min-w-0 overflow-hidden bg-[#101417]">
                            <AssistantObserver />
                            <WebMcpWorkspace />
                            <section className="flex h-full min-w-[320px] basis-[30%] flex-col overflow-hidden border-l border-white/10 bg-background">
                                <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-3">
                                    <AssistantChatHeader />
                                    <section aria-labelledby="chat-history-title" className="min-h-0 flex-1 overflow-hidden">
                                        <h2 id="chat-history-title" className="sr-only">Chat History</h2>
                                        <AssistantChatWindow />
                                    </section>
                                    <footer>
                                        <AssistantChatInput />
                                    </footer>
                                </div>
                            </section>
                        </div>
                        <Toaster />
                        </AssistantControllerProvider>
                    </AssistantRuntime>
                </AssistantViewStateProvider>
            </AssistantMessageProvider>
        </AssistantThreadProvider>
    </AssistantDatasourceProvider>;
}
