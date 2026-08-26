import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { GitBranchIcon, ImageIcon, MicIcon, RotateCcwIcon, SendIcon, SquareIcon, TrashIcon, XIcon } from "lucide-react";
import { useChatInput } from "../hooks/use-chat-input";
import { parseFileName } from "../utils/file-name";

export const FileName = ({ text }: { text: string }) => {
    const parseData = parseFileName(text);

    return <>
        <div className="flex-1 whitespace-nowrap overflow-hidden text-ellipsis">{parseData.name}</div>
        <div className="flex">{`.${parseData.ext}`}</div>
    </>;
};

export const AssistantChatInput = () => {
    const {
        text,
        setText,
        loading,
        editingMessage,
        attachedImage,
        textareaRef,
        fileInputRef,
        handleFileChange,
        handleRemoveImage,
        handleCancelMessage,
        handleCancelEditMessage,
        handleResendMessage,
        handleBranchMessage,
        handleSendMessage,
        handleKeyDown,
    } = useChatInput();

    return <div className="max-w-3xl mx-auto flex flex-col overflow-hidden">
        <form onSubmit={editingMessage ? handleResendMessage : handleSendMessage} className="space-x-2space-y-2">
            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleFileChange}
            />
            <Label id="messageInputLabel" htmlFor="messageInput" className="sr-only">Send Message</Label>
            <div className="w-full flex gap-1 items-end p-2">

                <Textarea
                    ref={textareaRef}
                    id="messageInput"
                    className={cn("flex-1 resize-none text-base md:text-base rounded-br-n bg-background", "min-h-[2.8lh] max-h-[7lh]")}
                    placeholder={`You say:\nShift+Enter to new line`}
                    value={text}
                    onKeyDown={handleKeyDown}
                    onChange={e => {
                        if (!loading) setText(e.target.value);
                    }}
                />
            </div>

            <div className="w-full flex justify-between pb-2 px-2 gap-2">
                <div className="flex gap-2">
                    <Button
                        type="button"
                        className="gap-2"
                        disabled={loading}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <ImageIcon />
                        <span>Attach Image</span>
                    </Button>
                </div>

                <div className="flex-1 overflow-hidden flex items-center">

                    {attachedImage && (
                        <div className=" relative group overflow-visible flex items-center gap-1">
                            <Button className="max-w-40" variant='outline'>
                                <ImageIcon />
                                <div className="flex-1 flex items-center overflow-hidden">
                                    <FileName text={attachedImage} />
                                </div>
                            </Button>

                            <Button
                                variant='destructive'
                                onClick={handleRemoveImage}
                                className="group-hover:visible rounded-full invisible"
                            >
                                <TrashIcon className="size-3" />
                            </Button>
                        </div>
                    )}
                </div>

                <div className="flex gap-2">
                    {
                        !editingMessage && <>
                        <Button
                            type="button"
                            className="gap-2"
                            disabled={(text.length > 0 || !!attachedImage) || loading || !!editingMessage}
                        >
                            <MicIcon />
                            <span>Voice</span>
                        </Button>
                        </>
                    }
                    

                    {editingMessage && !loading ? (
                        <>
                            <Button
                                type="button"
                                variant="destructive"
                                aria-label="Cancel editing message"
                                className="gap-2"
                                onClick={handleCancelEditMessage}
                            >
                                <XIcon />
                                <span>Cancel</span>
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                aria-label="Create branch from edited message"
                                className="gap-2"
                                disabled={text.trim().length == 0 && !attachedImage}
                                onClick={handleBranchMessage}
                            >
                                <GitBranchIcon />
                                <span>Branch</span>
                            </Button>
                            <Button
                                type="submit"
                                aria-label="Resend edited message"
                                className="gap-2"
                                disabled={text.trim().length == 0 && !attachedImage}
                            >
                                <RotateCcwIcon />
                                <span>Resend</span>
                            </Button>
                        </>
                    ) : (
                        <Button
                            type={loading ? "button" : "submit"}
                            aria-label={loading ? "Cancel AI response" : "Send Message To AI"}
                            className="gap-2"
                            disabled={!loading && (text.trim().length == 0 && !attachedImage)}
                            onClick={loading ? handleCancelMessage : undefined}
                        >
                            {loading ? <SquareIcon /> : <SendIcon />}
                            <span>{loading ? "Cancel" : "Send"}</span>
                        </Button>
                    )}
                </div>
            </div>
        </form >
    </div>;
};
