import React, { useEffect, useMemo, useRef, useState } from "react";
import { Activity, Check, Download, Mic, Play, Square } from "lucide-react";

type TechnicalGlossaryEntry = {
    term: string;
    weight?: number;
};

type TechnicalGlossaryConfigState = {
    entries: TechnicalGlossaryEntry[];
    alibabaWorkspaceId?: string;
    alibabaVocabularyId?: string;
    funAsrVocabularyId?: string;
    updatedAt?: string;
};

type SttCompareProviderDescriptorView = {
    id: string;
    label: string;
    kind: "primary" | "shadow";
    available: boolean;
    reason?: string;
};

type SttCompareProviderResultView = {
    providerId: string;
    label: string;
    partialText: string;
    finalText: string;
    firstPartialLatencyMs: number | null;
    finalLatencyMs: number | null;
    errors: string[];
    termHits: string[];
};

type SttCompareUtteranceView = {
    id: string;
    speaker: "interviewer" | "user";
    startedAt: number;
    endedAt: number | null;
    audioChunkCount: number;
    audioBytes: number;
    providerResults: Record<string, SttCompareProviderResultView>;
};

type SttCompareResultsView = {
    active: boolean;
    startedAt: number | null;
    stoppedAt: number | null;
    primaryProviderId: string | null;
    providers: SttCompareProviderDescriptorView[];
    glossary: TechnicalGlossaryConfigState;
    utterances: SttCompareUtteranceView[];
    summary?: {
        totalUtterances: number;
        byProvider: Record<string, {
            totalUtterances: number;
            utterancesWithFinal: number;
            avgFirstPartialLatencyMs: number | null;
            avgFinalLatencyMs: number | null;
            errorCount: number;
            technicalTerms: string[];
            technicalTermHitCount: number;
        }>;
    };
};

const FUN_ASR_PROVIDER_ID = "funasr";

const STT_PROVIDER_LABELS: Record<string, string> = {
    google: "Google 云 STT",
    groq: "Groq Whisper",
    openai: "OpenAI Whisper",
    deepgram: "Deepgram",
    elevenlabs: "ElevenLabs Scribe",
    azure: "Azure 语音",
    ibmwatson: "IBM Watson",
    soniox: "Soniox",
    alibaba: "阿里云 Paraformer",
    funasr: "Fun-ASR 实时版",
};

const formatProviderLabel = (providerId?: string | null) => {
    if (!providerId) return "";
    return STT_PROVIDER_LABELS[providerId] || providerId;
};

const formatGlossaryText = (config?: TechnicalGlossaryConfigState | null) => {
    return (config?.entries || [])
        .map((entry) => typeof entry.weight === "number" ? `${entry.term} | ${entry.weight}` : entry.term)
        .join("\n");
};

const parseGlossaryText = (rawText: string, existingConfig?: TechnicalGlossaryConfigState | null): TechnicalGlossaryConfigState => {
    const entries = rawText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
            const [term, weightPart] = line.split("|").map((part) => part.trim());
            const parsedWeight = weightPart ? Number(weightPart) : undefined;
            return {
                term,
                weight: Number.isFinite(parsedWeight) ? parsedWeight : undefined,
            };
        })
        .filter((entry) => entry.term);

    return {
        entries,
        alibabaWorkspaceId: existingConfig?.alibabaWorkspaceId,
        alibabaVocabularyId: existingConfig?.alibabaVocabularyId,
        funAsrVocabularyId: existingConfig?.funAsrVocabularyId,
        updatedAt: new Date().toISOString(),
    };
};

const formatTimestamp = (value?: number | null) => {
    if (!value) return "--";
    return new Date(value).toLocaleTimeString([], { hour12: false });
};

const formatLatency = (value?: number | null) => {
    if (typeof value !== "number") return "--";
    return `${Math.max(0, Math.round(value))} ms`;
};

export default function SttCompareWindow() {
    const [compareResults, setCompareResults] = useState<SttCompareResultsView | null>(null);
    const [glossaryConfig, setGlossaryConfig] = useState<TechnicalGlossaryConfigState | null>(null);
    const [glossaryText, setGlossaryText] = useState("");
    const [connected, setConnected] = useState(false);
    const [compareBusy, setCompareBusy] = useState<"idle" | "starting" | "stopping" | "exporting">("idle");
    const [glossarySaving, setGlossarySaving] = useState(false);
    const [glossarySaved, setGlossarySaved] = useState(false);
    const [statusMessage, setStatusMessage] = useState("");
    const autoStartedRef = useRef(false);

    const refreshCompareResults = async () => {
        if (!window.electronAPI?.getSttCompareResults) return null;
        try {
            const results = await window.electronAPI.getSttCompareResults();
            setCompareResults(results || null);
            return results || null;
        } catch (error) {
            console.error("[SttCompareWindow] 加载对比结果失败:", error);
            return null;
        }
    };

    const refreshGlossary = async () => {
        if (!window.electronAPI?.getTechnicalGlossary) return null;
        try {
            const config = await window.electronAPI.getTechnicalGlossary();
            setGlossaryConfig(config || null);
            setGlossaryText(formatGlossaryText(config || null));
            return config || null;
        } catch (error) {
            console.error("[SttCompareWindow] 加载热词表失败:", error);
            return null;
        }
    };

    useEffect(() => {
        let mounted = true;

        const loadInitialState = async () => {
            try {
                const [results, glossary, audioStatus] = await Promise.all([
                    refreshCompareResults(),
                    refreshGlossary(),
                    window.electronAPI?.getNativeAudioStatus?.(),
                ]);

                if (!mounted) return;
                setCompareResults(results || null);
                setGlossaryConfig(glossary || null);
                setConnected(Boolean(audioStatus?.connected));
            } catch (error) {
                if (!mounted) return;
                console.error("[SttCompareWindow] 初始化失败:", error);
            }
        };

        void loadInitialState();

        const cleanups: Array<() => void> = [];

        if (window.electronAPI?.onSttCompareUpdate) {
            cleanups.push(window.electronAPI.onSttCompareUpdate((results) => {
                setCompareResults(results || null);
            }));
        }

        if (window.electronAPI?.onNativeAudioConnected) {
            cleanups.push(window.electronAPI.onNativeAudioConnected(() => setConnected(true)));
        }

        if (window.electronAPI?.onNativeAudioDisconnected) {
            cleanups.push(window.electronAPI.onNativeAudioDisconnected(() => setConnected(false)));
        }

        return () => {
            mounted = false;
            cleanups.forEach((cleanup) => cleanup());

            if (autoStartedRef.current && window.electronAPI?.stopSttCompareSession) {
                void window.electronAPI.stopSttCompareSession().catch((error) => {
                    console.warn("[SttCompareWindow] 关闭时停止对比会话失败:", error);
                });
            }
        };
    }, []);

    useEffect(() => {
        if (!connected || !window.electronAPI?.startSttCompareSession) {
            return;
        }

        const providers = compareResults?.providers || [];
        const funAsrDescriptor = providers.find((provider) => provider.id === FUN_ASR_PROVIDER_ID);
        if (!funAsrDescriptor?.available || compareResults?.active) {
            return;
        }

        let cancelled = false;

        const startCompare = async () => {
            try {
                await window.electronAPI.startSttCompareSession();
                if (cancelled) return;
                autoStartedRef.current = true;
                await refreshCompareResults();
            } catch (error) {
                if (!cancelled) {
                    console.warn("[SttCompareWindow] 自动启动对比失败:", error);
                }
            }
        };

        void startCompare();

        return () => {
            cancelled = true;
        };
    }, [connected, compareResults?.active, compareResults?.providers]);

    const handleSaveGlossary = async () => {
        if (!window.electronAPI?.setTechnicalGlossary) return;

        setGlossarySaving(true);
        setStatusMessage("");

        try {
            const nextConfig = parseGlossaryText(glossaryText, glossaryConfig);
            const result = await window.electronAPI.setTechnicalGlossary(nextConfig);

            if (!result?.success) {
                setStatusMessage(result?.error || "保存热词表失败");
                return;
            }

            const savedConfig = result.config || nextConfig;
            setGlossaryConfig(savedConfig);
            setGlossaryText(formatGlossaryText(savedConfig));
            setGlossarySaved(true);
            setStatusMessage(result.warning || "热词表已保存，新热词会从下一句开始生效。");
            window.setTimeout(() => setGlossarySaved(false), 1500);
            await refreshCompareResults();
        } catch (error) {
            console.error("[SttCompareWindow] 保存热词表失败:", error);
            setStatusMessage(error instanceof Error ? error.message : "保存热词表失败");
        } finally {
            setGlossarySaving(false);
        }
    };

    const handleStartCompare = async () => {
        if (!window.electronAPI?.startSttCompareSession) return;
        setCompareBusy("starting");
        setStatusMessage("");
        try {
            await window.electronAPI.startSttCompareSession();
            autoStartedRef.current = false;
            await refreshCompareResults();
        } catch (error) {
            console.error("[SttCompareWindow] 启动对比失败:", error);
            setStatusMessage(error instanceof Error ? error.message : "启动对比失败");
        } finally {
            setCompareBusy("idle");
        }
    };

    const handleStopCompare = async () => {
        if (!window.electronAPI?.stopSttCompareSession) return;
        setCompareBusy("stopping");
        try {
            await window.electronAPI.stopSttCompareSession();
            autoStartedRef.current = false;
            await refreshCompareResults();
        } catch (error) {
            console.error("[SttCompareWindow] 停止对比失败:", error);
            setStatusMessage(error instanceof Error ? error.message : "停止对比失败");
        } finally {
            setCompareBusy("idle");
        }
    };

    const handleExportReport = async () => {
        if (!window.electronAPI?.exportSttBenchmarkReport) return;
        setCompareBusy("exporting");
        try {
            const result = await window.electronAPI.exportSttBenchmarkReport();
            if (result?.success) {
                setStatusMessage(`报告已导出：${result.markdownPath || result.jsonPath}`);
            } else {
                setStatusMessage(result?.error || "导出报告失败");
            }
        } catch (error) {
            console.error("[SttCompareWindow] 导出报告失败:", error);
            setStatusMessage(error instanceof Error ? error.message : "导出报告失败");
        } finally {
            setCompareBusy("idle");
        }
    };

    const providers = compareResults?.providers || [];
    const primaryProviderId = compareResults?.primaryProviderId || null;
    const primaryProvider = providers.find((provider) => provider.id === primaryProviderId) || null;
    const funAsrProvider = providers.find((provider) => provider.id === FUN_ASR_PROVIDER_ID) || null;
    const recentUtterances = useMemo(
        () => (compareResults?.utterances || []).slice(-18).reverse(),
        [compareResults?.utterances]
    );

    const renderResultCard = (
        label: string,
        result: SttCompareProviderResultView | undefined,
        themeClass: string
    ) => {
        const text = result?.finalText?.trim() || result?.partialText?.trim() || "";
        const status = result?.finalText?.trim() ? "最终稿" : result?.partialText?.trim() ? "实时稿" : "等待中";

        return (
            <div className={`rounded-[20px] border p-4 ${themeClass}`}>
                <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-200">{label}</div>
                    <span className="rounded-full border border-white/10 bg-black/25 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-300">
                        {status}
                    </span>
                </div>
                <div className="min-h-[96px] whitespace-pre-wrap text-[14px] leading-7 text-slate-100">
                    {text || <span className="text-slate-500">暂无转写结果</span>}
                </div>
                <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-slate-400">
                    <span>首包：{formatLatency(result?.firstPartialLatencyMs)}</span>
                    <span>最终：{formatLatency(result?.finalLatencyMs)}</span>
                    {result?.termHits?.length ? (
                        <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-emerald-200">
                            热词命中：{result.termHits.slice(0, 4).join("、")}
                        </span>
                    ) : null}
                    {result?.errors?.[0] ? (
                        <span className="rounded-full border border-red-400/20 bg-red-500/10 px-2.5 py-1 text-red-200">
                            {result.errors[0]}
                        </span>
                    ) : null}
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-[#0d1015] px-6 py-6 font-sans text-slate-200">
            <div className="mx-auto flex h-[calc(100vh-48px)] max-w-[1680px] min-h-0 flex-col overflow-hidden rounded-[30px] border border-white/[0.08] bg-[#14181f] shadow-2xl shadow-black/40">
                <div className="border-b border-white/[0.08] px-6 py-5">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.2em] text-cyan-200">
                                <Mic className="h-4 w-4" />
                                <span>Fun-ASR 实时对比</span>
                                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] tracking-[0.12em] text-slate-400">
                                    {compareResults?.summary?.totalUtterances || 0} 条语句
                                </span>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-slate-400">
                                用同一份会议音频、同一份热词表，对比当前主实时转写模型和 Fun-ASR 的实际表现。
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            {compareResults?.active ? (
                                <button
                                    type="button"
                                    onClick={handleStopCompare}
                                    disabled={compareBusy !== "idle"}
                                    className="inline-flex items-center gap-2 rounded-full border border-red-400/20 bg-red-500/10 px-4 py-2 text-[11px] font-semibold text-red-200 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                                >
                                    <Square className="h-3.5 w-3.5" />
                                    <span>{compareBusy === "stopping" ? "停止中..." : "停止对比"}</span>
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={handleStartCompare}
                                    disabled={compareBusy !== "idle"}
                                    className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-500/10 px-4 py-2 text-[11px] font-semibold text-cyan-100 transition-colors hover:bg-cyan-500/20 disabled:opacity-50"
                                >
                                    <Play className="h-3.5 w-3.5" />
                                    <span>{compareBusy === "starting" ? "启动中..." : "开始对比"}</span>
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={handleExportReport}
                                disabled={compareBusy !== "idle" || (compareResults?.utterances?.length ?? 0) === 0}
                                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[11px] font-semibold text-slate-200 transition-colors hover:border-white/20 hover:bg-white/[0.08] disabled:opacity-50"
                            >
                                <Download className="h-3.5 w-3.5" />
                                <span>{compareBusy === "exporting" ? "导出中..." : "导出报告"}</span>
                            </button>
                        </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.16em]">
                        <span className={`rounded-full border px-3 py-1 ${connected ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200" : "border-white/10 bg-white/[0.04] text-slate-400"}`}>
                            {connected ? "会议音频已连接" : "会议音频未连接"}
                        </span>
                        <span className={`rounded-full border px-3 py-1 ${compareResults?.active ? "border-cyan-400/20 bg-cyan-500/10 text-cyan-100" : "border-white/10 bg-white/[0.04] text-slate-400"}`}>
                            {compareResults?.active ? "对比会话运行中" : "对比会话未启动"}
                        </span>
                        {glossaryConfig?.funAsrVocabularyId ? (
                            <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-amber-100">
                                Fun-ASR 热词已同步
                            </span>
                        ) : null}
                    </div>
                </div>

                <div className="grid min-h-0 flex-1 grid-cols-[360px_minmax(0,1fr)] gap-0">
                    <aside className="min-h-0 overflow-y-auto border-r border-white/[0.08] p-5" style={{ scrollbarWidth: "thin", overscrollBehavior: "contain" }}>
                        <div className="space-y-4">
                            <section className="rounded-[22px] border border-white/[0.08] bg-black/15 p-4">
                                <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                                    <Activity className="h-3.5 w-3.5" />
                                    <span>对比概览</span>
                                </div>
                                <div className="space-y-3 text-sm text-slate-400">
                                    <div>
                                        <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">当前主模型</div>
                                        <div className="mt-1 text-slate-100">{primaryProvider?.label || formatProviderLabel(primaryProviderId) || "未识别"}</div>
                                    </div>
                                    <div>
                                        <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">对照模型</div>
                                        <div className="mt-1 text-slate-100">{funAsrProvider?.label || "Fun-ASR 实时版"}</div>
                                    </div>
                                    {funAsrProvider && !funAsrProvider.available && (
                                        <div className="rounded-[16px] border border-amber-400/20 bg-amber-500/10 px-3 py-3 text-xs leading-5 text-amber-100">
                                            {funAsrProvider.reason || "当前未配置阿里云 STT Key，无法启动 Fun-ASR 对比。"}
                                        </div>
                                    )}
                                </div>
                            </section>

                            <section className="rounded-[22px] border border-white/[0.08] bg-black/15 p-4">
                                <div className="mb-3 flex items-center justify-between gap-3">
                                    <div>
                                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">热词表</div>
                                        <p className="mt-1 text-xs leading-5 text-slate-500">会中可编辑并持久化保存，新热词从下一句开始生效。</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleSaveGlossary}
                                        disabled={glossarySaving}
                                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${glossarySaved ? "bg-emerald-500/20 text-emerald-300" : "border border-white/10 bg-white/[0.04] text-slate-200 hover:border-white/20 hover:bg-white/[0.08]"} disabled:opacity-60`}
                                    >
                                        {glossarySaved ? <Check className="h-3.5 w-3.5" /> : null}
                                        <span>{glossarySaving ? "保存中..." : glossarySaved ? "已保存" : "保存热词表"}</span>
                                    </button>
                                </div>
                                <textarea
                                    value={glossaryText}
                                    onChange={(event) => setGlossaryText(event.target.value)}
                                    rows={12}
                                    className="min-h-[260px] w-full rounded-[16px] border border-white/10 bg-[#0f1218] px-3 py-3 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-500 focus:border-cyan-400/30"
                                    placeholder={"agent | 5\ntool calling | 5\nMCP | 5\nRAG | 5\nSpring Boot | 5"}
                                />
                                <div className="mt-3 text-[11px] leading-5 text-slate-500">
                                    当前会为 Paraformer 和 Fun-ASR 分别同步模型专属热词表，但共享同一份热词源数据。
                                </div>
                            </section>

                            {statusMessage && (
                                <div className={`rounded-[18px] border px-4 py-3 text-sm leading-6 ${statusMessage.includes("失败") || statusMessage.toLowerCase().includes("error")
                                    ? "border-red-400/20 bg-red-500/10 text-red-200"
                                    : "border-cyan-400/20 bg-cyan-500/10 text-cyan-100"}`}>
                                    {statusMessage}
                                </div>
                            )}

                            <section className="rounded-[22px] border border-white/[0.08] bg-black/15 p-4">
                                <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">模型摘要</div>
                                <div className="space-y-3">
                                    {providers.map((provider) => {
                                        const summary = compareResults?.summary?.byProvider?.[provider.id];
                                        return (
                                            <div key={provider.id} className="rounded-[18px] border border-white/10 bg-white/[0.03] px-3 py-3">
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="text-sm font-medium text-slate-100">{provider.label}</div>
                                                    {!provider.available && <span className="text-[10px] text-amber-300">未就绪</span>}
                                                </div>
                                                <div className="mt-2 space-y-1 text-xs text-slate-400">
                                                    <div>平均首包：{formatLatency(summary?.avgFirstPartialLatencyMs)}</div>
                                                    <div>平均最终稿：{formatLatency(summary?.avgFinalLatencyMs)}</div>
                                                    <div>热词命中：{summary?.technicalTerms?.join("、") || "暂无"}</div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>
                        </div>
                    </aside>

                    <main className="min-h-0 overflow-y-auto px-6 py-5" style={{ scrollbarWidth: "thin", overscrollBehavior: "contain" }}>
                        <div className="space-y-4">
                            {recentUtterances.length > 0 ? recentUtterances.map((utterance) => {
                                const primaryResult = primaryProviderId ? utterance.providerResults[primaryProviderId] : undefined;
                                const funAsrResult = utterance.providerResults[FUN_ASR_PROVIDER_ID];

                                return (
                                    <section key={utterance.id} className="rounded-[24px] border border-white/[0.08] bg-black/15 p-5">
                                        <div className="mb-4 flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                                                <span>{utterance.speaker === "user" ? "候选人" : "面试官"}</span>
                                                <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
                                                <span>{formatTimestamp(utterance.endedAt || utterance.startedAt)}</span>
                                            </div>
                                            <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-400">
                                                {utterance.audioChunkCount} 个音频块 / {utterance.audioBytes} 字节
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                                            {renderResultCard(
                                                primaryProvider?.label || formatProviderLabel(primaryProviderId) || "当前主模型",
                                                primaryResult,
                                                "border-white/10 bg-white/[0.03]"
                                            )}
                                            {renderResultCard(
                                                funAsrProvider?.label || "Fun-ASR 实时版",
                                                funAsrResult,
                                                "border-cyan-400/20 bg-cyan-500/[0.08]"
                                            )}
                                        </div>
                                    </section>
                                );
                            }) : (
                                <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.02] px-6 py-8 text-sm leading-7 text-slate-500">
                                    还没有对比样本。请先开始会议音频，再启动对比会话，随后这里会持续显示当前主模型和 Fun-ASR 的实时结果。
                                </div>
                            )}
                        </div>
                    </main>
                </div>
            </div>
        </div>
    );
}
