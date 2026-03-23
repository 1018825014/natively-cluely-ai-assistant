import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Mic } from "lucide-react";

type RawInterviewerTranscriptEvent = {
    id: string;
    text: string;
    timestamp: number;
    final: boolean;
    confidence?: number;
};

type RawInterviewerTranscriptState = {
    latest: RawInterviewerTranscriptEvent | null;
    fullText: string;
    events: RawInterviewerTranscriptEvent[];
};

const EMPTY_STATE: RawInterviewerTranscriptState = {
    latest: null,
    fullText: "",
    events: [],
};

const isScrollNearBottom = (element: HTMLDivElement | null) => {
    if (!element) return true;
    const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
    return remaining <= 40;
};

const formatRawTranscriptTimestamp = (value?: number) => {
    if (!value) return "--";
    return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
};

export default function RawTranscriptWindow() {
    const [rawState, setRawState] = useState<RawInterviewerTranscriptState>(EMPTY_STATE);
    const [copied, setCopied] = useState(false);
    const [showScrollToBottom, setShowScrollToBottom] = useState(false);
    const fullTextRef = useRef<HTMLDivElement>(null);
    const eventLogRef = useRef<HTMLDivElement>(null);
    const isFullTextPinnedRef = useRef(true);
    const isEventLogPinnedRef = useRef(true);

    useEffect(() => {
        if (!window.electronAPI?.getRawTranscriptState || !window.electronAPI?.onRawTranscriptUpdate) {
            return;
        }

        let mounted = true;

        window.electronAPI.getRawTranscriptState()
            .then((state) => {
                if (mounted) {
                    setRawState(state || EMPTY_STATE);
                }
            })
            .catch((error) => {
                console.error("[RawTranscriptWindow] Failed to load initial raw transcript state:", error);
            });

        const unsubscribe = window.electronAPI.onRawTranscriptUpdate((state) => {
            if (!mounted) return;
            setRawState(state || EMPTY_STATE);
        });

        return () => {
            mounted = false;
            unsubscribe();
        };
    }, []);

    useEffect(() => {
        if (isFullTextPinnedRef.current) {
            requestAnimationFrame(() => {
                fullTextRef.current?.scrollTo({ top: fullTextRef.current.scrollHeight, behavior: "auto" });
            });
        }

        if (isEventLogPinnedRef.current) {
            requestAnimationFrame(() => {
                eventLogRef.current?.scrollTo({ top: eventLogRef.current.scrollHeight, behavior: "auto" });
            });
            setShowScrollToBottom(false);
        } else if (rawState.events.length > 0) {
            setShowScrollToBottom(true);
        }
    }, [rawState]);

    const latestMeta = useMemo(() => rawState.latest, [rawState.latest]);

    const handleCopyFullText = async () => {
        try {
            await navigator.clipboard.writeText(rawState.fullText || "");
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
        } catch (error) {
            console.error("[RawTranscriptWindow] Failed to copy raw transcript:", error);
        }
    };

    return (
        <div className="min-h-screen bg-[#111111] px-6 py-6 font-sans text-slate-200">
            <div className="mx-auto flex h-[calc(100vh-48px)] max-w-[1500px] min-h-0 flex-col overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#1a1a1a] shadow-2xl shadow-black/40">
                <div className="border-b border-white/[0.08] px-6 py-5">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.2em] text-amber-200/90">
                                <Mic className="h-4 w-4" />
                                <span>原始转写</span>
                            </div>
                            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                                这里展示的是在进入 `SessionTracker` 合并、去重、切段和编辑逻辑之前，面试官原始转写流直接推送出来的内容。
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={handleCopyFullText}
                            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-slate-200 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
                        >
                            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                            <span>{copied ? "已复制" : "复制全文"}</span>
                        </button>
                    </div>
                </div>

                <div className="grid min-h-0 flex-1 grid-rows-[minmax(420px,1.35fr)_minmax(240px,0.9fr)] gap-4 px-6 py-5">
                    <section className="min-h-0 overflow-hidden rounded-[22px] border border-white/[0.08] bg-black/15">
                        <div className="border-b border-white/[0.08] px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                                        最新 / 全场原始转写
                                    </div>
                                    <p className="mt-1 text-xs text-slate-500">
                                        这里会展示从本场开始累计下来的面试官原始转写全文，只读查看。
                                    </p>
                                </div>
                                {latestMeta && (
                                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-slate-500">
                                        <span>{formatRawTranscriptTimestamp(latestMeta.timestamp)}</span>
                                        <span className={`rounded-full px-2 py-0.5 ${latestMeta.final ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300"}`}>
                                            {latestMeta.final ? "最终" : "实时"}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div
                            ref={fullTextRef}
                            onScroll={() => {
                                isFullTextPinnedRef.current = isScrollNearBottom(fullTextRef.current);
                            }}
                            className="h-full overflow-y-auto px-4 py-4 no-drag"
                            style={{ scrollbarWidth: "thin", overscrollBehavior: "contain" }}
                        >
                            <div className="min-h-full whitespace-pre-wrap break-words rounded-[18px] border border-white/[0.08] bg-white/[0.03] px-4 py-4 text-[13px] leading-7 text-slate-100/95">
                                {rawState.fullText || "STT provider 一旦开始产生转写事件，这里就会显示完整的原始面试官转写全文。"}
                            </div>
                        </div>
                    </section>

                    <section className="relative min-h-0 overflow-hidden rounded-[22px] border border-white/[0.08] bg-black/15">
                        <div className="border-b border-white/[0.08] px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                                        原始事件流
                                    </div>
                                    <p className="mt-1 text-xs text-slate-500">
                                        这里会保留每一次面试官原始转写推送，包括重复文本和修正后的文本。
                                    </p>
                                </div>
                                <div className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-400">
                                        {rawState.events.length} 条事件
                                </div>
                            </div>
                        </div>

                        <div
                            ref={eventLogRef}
                            onScroll={() => {
                                const pinned = isScrollNearBottom(eventLogRef.current);
                                isEventLogPinnedRef.current = pinned;
                                setShowScrollToBottom(!pinned);
                            }}
                            className="h-full overflow-y-auto px-4 py-4 no-drag"
                            style={{ scrollbarWidth: "thin", overscrollBehavior: "contain" }}
                        >
                            <div className="space-y-3">
                                {rawState.events.length === 0 ? (
                                    <div className="rounded-[18px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-sm leading-6 text-slate-500">
                                        面试官 STT 流中的每一条原始转写事件都会追加到这里。
                                    </div>
                                ) : (
                                    rawState.events.map((eventItem) => (
                                        <div key={eventItem.id} className="rounded-[18px] border border-white/[0.08] bg-white/[0.03] px-4 py-4">
                                            <div className="mb-2 flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.16em] text-slate-500">
                                                <span>{formatRawTranscriptTimestamp(eventItem.timestamp)}</span>
                                                <div className="flex items-center gap-2">
                                                    <span className={`rounded-full px-2 py-0.5 ${eventItem.final ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300"}`}>
                                                        {eventItem.final ? "最终" : "实时"}
                                                    </span>
                                                    {typeof eventItem.confidence === "number" && (
                                                        <span>{Math.round(eventItem.confidence * 100)}%</span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="whitespace-pre-wrap break-words text-[13px] leading-6 text-slate-100/95">
                                                {eventItem.text}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {showScrollToBottom && (
                            <button
                                type="button"
                                onClick={() => {
                                    eventLogRef.current?.scrollTo({ top: eventLogRef.current.scrollHeight, behavior: "smooth" });
                                    isEventLogPinnedRef.current = true;
                                    setShowScrollToBottom(false);
                                }}
                                className="absolute bottom-4 right-4 z-10 rounded-full border border-white/10 bg-black/70 px-3 py-1.5 text-[11px] font-medium text-slate-200 shadow-lg shadow-black/30 transition-colors hover:border-white/20 hover:bg-black/85 hover:text-white"
                            >
                                最新
                            </button>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
}
