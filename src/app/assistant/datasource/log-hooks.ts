import { useLiveQuery } from "dexie-react-hooks";
import { useAssistantDatasource } from "./datasource-context";
import { useAssistantThread } from "./thread-context";

export const useAssistantThreadLogs = () => {
    const datasource = useAssistantDatasource();
    const thread = useAssistantThread();

    return useLiveQuery(async () => {
        if (thread) {
            return await datasource.listLogs(thread.id);
        }

        return null;
    }, [thread, datasource]);
};
