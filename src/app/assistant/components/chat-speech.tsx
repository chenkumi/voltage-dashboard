import { Button } from "@/components/ui/button";
import { PauseIcon, PlayIcon, RotateCcwIcon, Volume2Icon, XIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAssistantViewState } from "../datasource";
import { useAssistantController } from "../controller/AssistantControllerProvider";

type AssistantSpeechStatus = "idle" | "playing" | "paused";

type AssistantSpeechState = {
    text: string;
    status: AssistantSpeechStatus;
    activeLineIndex: number;
};

type AssistantSpeechLineRange = {
    index: number;
    start: number;
    end: number;
};

const speechSettings = {
    pitch: 1,
    rate: 1.3,
    volume: 1,
};

const buildLineRanges = (text: string): AssistantSpeechLineRange[] => {
    let cursor = 0;

    return text.split("\n").map((line, index) => {
        const start = cursor;
        const end = start + line.length;
        cursor = end + 1;

        return { index, start, end };
    });
};

const findLineIndexByCharIndex = (
    lineRanges: AssistantSpeechLineRange[],
    charIndex: number,
    startLineIndex: number,
) => {
    for (let i = startLineIndex; i < lineRanges.length; i += 1) {
        const line = lineRanges[i];

        if (charIndex >= line.start && charIndex <= line.end) {
            return line.index;
        }
    }

    return null;
};

const AssistantSpeechPanel = ({
    text,
    status,
    activeLineIndex,
    onPause,
    onResume,
    onStop,
    onReplay,
}: {
    text: string;
    status: AssistantSpeechStatus;
    activeLineIndex: number;
    onPause: () => void;
    onResume: () => void;
    onStop: () => void;
    onReplay: () => void;
}) => {
    const viewState = useAssistantViewState();
    const setViewState = viewState?.setState;
    const paused = status === "paused";
    const lines = useMemo(() => text.split("\n"), [text]);
    const lineRefs = useRef<Array<HTMLLIElement | null>>([]);
    const autoScrollLockedRef = useRef(false);
    const unlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(()=>{
        setViewState?.(prev=>({...prev, isSpeaking:true}));
        return ()=>{
            setViewState?.(prev=>({...prev, isSpeaking:false}));
        }
    },[setViewState]);

    const clearUnlockTimer = useCallback(() => {
        if (unlockTimerRef.current) {
            clearTimeout(unlockTimerRef.current);
            unlockTimerRef.current = null;
        }
    }, []);

    const lockAutoScroll = useCallback(() => {
        clearUnlockTimer();
        autoScrollLockedRef.current = true;
    }, [clearUnlockTimer]);

    const scheduleAutoScrollUnlock = useCallback(() => {
        clearUnlockTimer();
        unlockTimerRef.current = setTimeout(() => {
            autoScrollLockedRef.current = false;
            unlockTimerRef.current = null;
        }, 3000);
    }, [clearUnlockTimer]);

    useEffect(() => {
        if (autoScrollLockedRef.current) {
            return;
        }

        lineRefs.current[activeLineIndex]?.scrollIntoView({
            behavior: "smooth",
            block: "center",
        });
    }, [activeLineIndex]);

    useEffect(() => {
        return () => {
            clearUnlockTimer();
        };
    }, [clearUnlockTimer]);

    return (
        <motion.aside
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-x-5 bottom-5 z-10 rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur"
            aria-label="Speech playback"
        >
            <div className="flex flex-col gap-2">
                <div className="w-full flex items-center gap-2">
                    <Volume2Icon className="size-4" aria-hidden="true" />
                    <div className="flex-1 text-ellipsis whitespace-nowrap  overflow-hidden text-sm">
                        {paused ? "Paused" : "Playing..."}
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                        {paused ? (
                            <>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="size-8"
                                    aria-label="Resume"
                                    onClick={onResume}
                                >
                                    <PlayIcon className="size-4" />
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="size-8"
                                    aria-label="Replay"
                                    onClick={onReplay}
                                >
                                    <RotateCcwIcon className="size-4" />
                                </Button>
                            </>
                        ) : (
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-8"
                                aria-label="Pause"
                                onClick={onPause}
                            >
                                <PauseIcon className="size-4" />
                            </Button>
                        )}
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            aria-label="Stop and close"
                            onClick={onStop}
                        >
                            <XIcon className="size-4" />
                        </Button>
                    </div>
                </div>
                    
                {/* </div> */}
                <div className="min-w-0 flex-1">
                    <ul
                        className="mt-2 max-h-18 overflow-auto rounded-md bg-muted/50 p-2 text-sm text-muted-foreground"
                        onPointerDown={lockAutoScroll}
                        onPointerUp={scheduleAutoScrollUnlock}
                        onPointerCancel={scheduleAutoScrollUnlock}
                        onPointerLeave={scheduleAutoScrollUnlock}
                    >
                        {lines.map((line, index) => (
                            <li
                                key={`${index}-${line}`}
                                ref={(element) => {
                                    lineRefs.current[index] = element;
                                }}
                                aria-current={index === activeLineIndex ? "true" : undefined}
                                className="scroll-my-8 whitespace-pre-wrap wrap-break-word rounded px-1 py-0.5 aria-current:bg-indigo-500/10 aria-current:text-foreground"
                            >
                                {line.length > 0 ? line : " "}
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </motion.aside>
    );
};

export const AssistantSpeech = () => {
    const controller = useAssistantController();
    const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
    const playbackIdRef = useRef(0);
    const currentLineIndexRef = useRef(0);
    const lineRangesRef = useRef<AssistantSpeechLineRange[]>([]);
    const stopRequestedRef = useRef(false);
    const [speech, setSpeech] = useState<AssistantSpeechState>({
        text: "",
        status: "idle",
        activeLineIndex: 0,
    });

    const stopSpeech = useCallback(() => {
        playbackIdRef.current += 1;
        stopRequestedRef.current = true;
        currentLineIndexRef.current = 0;
        lineRangesRef.current = [];
        utteranceRef.current = null;
        window.speechSynthesis.cancel();
        setSpeech({ text: "", status: "idle", activeLineIndex: 0 });
    }, []);

    const startSpeech = useCallback((text: string) => {
        const nextText = text.trim();

        if (nextText.length === 0) {
            return;
        }

        if (!("speechSynthesis" in window)) {
            toast.error("此瀏覽器不支援語音播放。");
            return;
        }

        stopRequestedRef.current = false;
        const playbackId = playbackIdRef.current + 1;
        playbackIdRef.current = playbackId;
        currentLineIndexRef.current = 0;
        lineRangesRef.current = buildLineRanges(nextText);
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(nextText);
        utterance.lang = navigator.language;
        utterance.pitch = speechSettings.pitch;
        utterance.rate = speechSettings.rate;
        utterance.volume = speechSettings.volume;
        utterance.onend = () => {
            if (playbackIdRef.current === playbackId && !stopRequestedRef.current) {
                setSpeech({ text: "", status: "idle", activeLineIndex: 0 });
            }
            if (playbackIdRef.current === playbackId) {
                utteranceRef.current = null;
                currentLineIndexRef.current = 0;
                lineRangesRef.current = [];
            }
        };
        utterance.onerror = () => {
            if (playbackIdRef.current === playbackId) {
                utteranceRef.current = null;
                currentLineIndexRef.current = 0;
                lineRangesRef.current = [];
                setSpeech({ text: "", status: "idle", activeLineIndex: 0 });
                toast.error("語音播放失敗。");
            }
        };
        utterance.onboundary = (event) => {
            if (playbackIdRef.current !== playbackId) {
                return;
            }

            const nextLineIndex = findLineIndexByCharIndex(
                lineRangesRef.current,
                event.charIndex,
                currentLineIndexRef.current,
            );

            if (nextLineIndex === null || nextLineIndex < currentLineIndexRef.current) {
                return;
            }

            currentLineIndexRef.current = nextLineIndex;
            setSpeech((current) => ({
                ...current,
                activeLineIndex: nextLineIndex,
            }));
        };

        utteranceRef.current = utterance;
        setSpeech({ text: nextText, status: "playing", activeLineIndex: 0 });
        window.speechSynthesis.speak(utterance);
    }, []);

    const pauseSpeech = useCallback(() => {
        if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
            window.speechSynthesis.pause();
            setSpeech((current) => ({ ...current, status: "paused" }));
        }
    }, []);

    const resumeSpeech = useCallback(() => {
        if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
            setSpeech((current) => ({ ...current, status: "playing" }));
        }
    }, []);

    const replaySpeech = useCallback(() => {
        if (speech.text.length > 0) {
            startSpeech(speech.text);
        }
    }, [speech.text, startSpeech]);

    useEffect(() => {
        if (controller.speechRequest) {
            startSpeech(controller.speechRequest.text);
        }
    }, [controller.speechRequest, startSpeech]);

    useEffect(() => {
        return () => {
            playbackIdRef.current += 1;
            stopRequestedRef.current = true;
            currentLineIndexRef.current = 0;
            lineRangesRef.current = [];
            window.speechSynthesis.cancel();
        };
    }, []);

    return (
        <AnimatePresence>
            {speech.status !== "idle" && (
                <AssistantSpeechPanel
                    key="assistant-speech"
                    text={speech.text}
                    status={speech.status}
                    activeLineIndex={speech.activeLineIndex}
                    onPause={pauseSpeech}
                    onResume={resumeSpeech}
                    onStop={stopSpeech}
                    onReplay={replaySpeech}
                />
            )}
        </AnimatePresence>
    );
};
