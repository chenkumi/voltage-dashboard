import { MessageCircleCheckIcon } from "lucide-react";

export const UIChatEmpty = () => {
    return <div className="h-full flex flex-col items-center justify-center text-2xl text-muted-foreground/70 gap-3 max-w-3xl mx-auto">
        <MessageCircleCheckIcon className="size-14" />
        Hi, how can I help you?
    </div>;
};