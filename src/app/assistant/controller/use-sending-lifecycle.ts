import { useCallback, useEffect, useRef, useState } from "react";

export const useSendingLifecycle = () => {
    const [loading, setLoading] = useState(false);
    const abortControllerRef = useRef<AbortController | null>(null);

    const finishSending = useCallback((controller: AbortController) => {
        if (abortControllerRef.current === controller) {
            abortControllerRef.current = null;
            setLoading(false);
        }
    }, []);

    const startSending = useCallback(() => {
        setLoading(true);
        const abortController = new AbortController();
        abortControllerRef.current = abortController;
        return abortController;
    }, []);

    const cancelSending = useCallback(() => {
        abortControllerRef.current?.abort();
    }, []);

    const hasActiveSending = useCallback(() => {
        return Boolean(abortControllerRef.current);
    }, []);

    useEffect(() => {
        return () => {
            abortControllerRef.current?.abort();
        };
    }, []);

    return {
        loading,
        startSending,
        finishSending,
        cancelSending,
        hasActiveSending,
    };
};
