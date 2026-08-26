import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { MessageCircleMoreIcon, MoreVerticalIcon, PencilIcon, PinIcon, TrashIcon } from "lucide-react";
import { useRef, useState } from "react";
import { ModelThread } from "../../types";
import { useAssistantController } from "../controller/AssistantControllerProvider";

type AssistantThreadItemProps = {
    thread: ModelThread;
    routerPath: string;
} & React.ComponentProps<"li">;

export const AssistantThreadItem = ({ thread, children, className, routerPath, ...props }: AssistantThreadItemProps) => {
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const controller = useAssistantController();

    const pin = thread.pin ?? 0;
    const path = `/chat/${thread.id}`;
    const isActive = routerPath === path;

    const openThread = () => {
        controller.openThread(thread.id);
    };

    const handlePin = () => {
        controller.pinThread(thread);
    };

    const handleEditTitle = () => {
        setEditOpen(true);
    };

    const handleDelete = () => {
        setDeleteOpen(true);
    };

    const handleSubmit = () => {
        if (inputRef.current) {
            const value = inputRef.current.value;
            controller.renameThread(thread.id, value);
        }
    };

    const confirmDelete = () => {
        controller.deleteThread(thread.id);
    };

    return (
        <li
            {...props}
            role="group"
            aria-labelledby={`thread-title-${thread.id}`}
            className={cn("group/thread relative list-none", className)}
        >

            <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Thread</AlertDialogTitle>
                        <AlertDialogDescription>
                            Sure to delete this thread?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDelete}>Continue</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={editOpen} onOpenChange={setEditOpen}>
                <AlertDialogContent>
                    <form onSubmit={e => {
                        e.preventDefault();
                        handleSubmit();
                    }}>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Edit Thread Title</AlertDialogTitle>
                            <AlertDialogDescription>
                                Please enter new title:
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <Field>
                            <FieldLabel htmlFor={`${thread.id}-input-title`}>
                                New Title
                            </FieldLabel>
                            <Input
                                ref={inputRef}
                                id={`${thread.id}-input-title`}
                                autoComplete="off"
                                defaultValue={thread.customTitle}
                            />
                        </Field>
                        <AlertDialogFooter>
                            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
                            <AlertDialogAction type="submit">Continue</AlertDialogAction>
                        </AlertDialogFooter>
                    </form>
                </AlertDialogContent>
            </AlertDialog>

            <div className="w-full flex group items-center">
                <Button
                    variant="ghost"
                    onClick={openThread}
                    className="flex-1 justify-start gap-2 text-base overflow-hidden h-10 flex items-center hover:bg-primary/10"
                >
                    <MessageCircleMoreIcon className={cn("size-6")} aria-hidden="true" />
                    <span id={`thread-title-${thread.id}`} className={cn("whitespace-nowrap text-ellipsis overflow-hidden", { "font-bold text-foreground/80": isActive, "text-foreground/60": !isActive })}>
                        {thread.title}
                    </span>
                </Button>

                <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" className="group hover:bg-primary/10 size-10" />}>
                        {
                            pin === 1 ? <>
                                <PinIcon className="group-hover:hidden" />
                                <MoreVerticalIcon className="group-hover:block hidden" />
                            </> :
                                <MoreVerticalIcon />
                        }

                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-36">
                        <DropdownMenuGroup>
                            <DropdownMenuItem onClick={handlePin} className="py-2">
                                <PinIcon /> Pin Thread
                            </DropdownMenuItem>

                            <DropdownMenuItem onClick={handleEditTitle} className="py-2">
                                <PencilIcon /> Edit Title
                            </DropdownMenuItem>

                            <DropdownMenuItem className="text-destructive hover:text-destructive py-2" onClick={handleDelete}>
                                <TrashIcon /> Delete Thread
                            </DropdownMenuItem>
                        </DropdownMenuGroup>
                    </DropdownMenuContent>
                </DropdownMenu>

            </div>
        </li>
    );
};
