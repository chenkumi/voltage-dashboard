import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { BotIcon, MenuIcon } from "lucide-react";
import { ModelThread } from "../../types";
import { useAssistantThreadList } from "../datasource";
import { AssistantThreadItem } from "./thread-item";
import { AssistantThreadThemeMenu } from "./thread-theme-menu";
import { useRouterPath } from "../utils/router-path";


const AssistantThreadListHistory = ({ threads }: { threads: ModelThread[] }) => {
    const routerPath = useRouterPath();
    return <nav aria-label="Chat History List" className="w-full flex-1 overflow-x-hidden overflow-y-auto no-scrollbar">
        <ul> {
            threads.map(thread => <AssistantThreadItem key={thread.id} thread={thread} routerPath={routerPath} />)}
        </ul>
    </nav>;
};

const AssistantThreadListLoading = () => {
    return <div className="w-full flex-1 flex flex-col items-center justify-center gap-3" aria-busy="true">
        <Spinner className="size-10" />
        <Label>Loading...</Label>
    </div>;
};

const AssistantThreadListEmpty = () => {
    return <div className="w-full flex-1 flex flex-col items-center justify-center gap-3">
        <BotIcon className="size-10" />
        <Label>No threads</Label>
    </div>;
};

const AssistantThreadListRouter = ({ threads }: { threads: ModelThread[] | undefined }) => {
    if (threads && threads.length > 0) {
        return <AssistantThreadListHistory threads={threads} />;
    }
    else if (threads) {
        return <AssistantThreadListEmpty />;
    }

    return <AssistantThreadListLoading />;
};

const AssistantThreadSetting = () => {
    return <div className="w-full">
    </div>;
};

const AssistantThreadTitle = () => {
    return <>
        <div className="w-full flex justify-between items-center">
            <Button variant='ghost'>
                <MenuIcon />
            </Button>

            <h2 className="flex font-bold text-foreground">Chats</h2>

            <div className="flex">
                <AssistantThreadThemeMenu />
            </div>
        </div>
        <Separator />
    </>;
};

export const AssistantThreadList = () => {
    const threads = useAssistantThreadList();
    return <>
        <AssistantThreadTitle />
        <AssistantThreadListRouter threads={threads} />
        <AssistantThreadSetting />
    </>;
};
