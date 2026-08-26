import { createContext, Dispatch, ReactNode, SetStateAction, useContext, useMemo, useState } from "react";

export type AssistantViewState = {
    isSpeaking: boolean;
};

export type AssistantViewStateContextValue = {
    state: AssistantViewState;
    setState: Dispatch<SetStateAction<AssistantViewState>>;
};

export const AssistantViewStateContext = createContext<AssistantViewStateContextValue | undefined>(undefined);

export const AssistantViewStateProvider = ({ children }: { children: ReactNode }) => {
    const [state, setState] = useState<AssistantViewState>({ isSpeaking: false });
    const value = useMemo(() => ({ state, setState }), [state]);

    return <AssistantViewStateContext.Provider value={value}>
        {children}
    </AssistantViewStateContext.Provider>;
};

export const useAssistantViewState = () => {
    return useContext(AssistantViewStateContext);
};
