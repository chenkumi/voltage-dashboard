import { createContext, ReactNode, useContext } from "react";
import { AssistantDatasource } from "./assistant-datasource";
import { dexieAssistantDatasource } from "./dexie-assistant-datasource";

export const AssistantDatasourceContext = createContext<AssistantDatasource>(dexieAssistantDatasource);

export const AssistantDatasourceProvider = ({
    children,
    datasource = dexieAssistantDatasource,
}: {
    children: ReactNode;
    datasource?: AssistantDatasource;
}) => {
    return <AssistantDatasourceContext.Provider value={datasource}>
        {children}
    </AssistantDatasourceContext.Provider>;
};

export const useAssistantDatasource = () => {
    return useContext(AssistantDatasourceContext);
};
