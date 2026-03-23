import React, { useEffect, useMemo, useState } from "react";
import { Check, Code, Copy, FolderOpen, Trash2 } from "lucide-react";

type TraceDetailTab = "request" | "response" | "resolved_input";

type LlmTraceStepRecord = {
    id: string;
    actionId: string;
    kind: "transport" | "rag" | "app";
    stage: string;
    lane?: string;
    provider: string;
    model: string;
    method: string;
    url: string;
    requestHeaders: string;
    requestBody: string;
    responseStatus?: number;
    responseHeaders: string;
    responseBody: string;
    durationMs?: number;
    streamed: boolean;
    truncated: boolean;
    error?: string;
    startedAt: string;
    endedAt?: string;
};

type LlmTraceActionRecord = {
    id: string;
    sessionId: string;
    type: string;
    label: string;
    requestId?: string;
    startedAt: string;
    endedAt?: string;
    status: "running" | "completed" | "error";
    steps: LlmTraceStepRecord[];
    resolvedInput?: Record<string, unknown>;
    error?: string;
};

const TRACE_ACTION_LABELS: Record<string, string> = {
    what_to_answer: "怎么回答",
    follow_up: "追问优化",
    recap: "总结",
    follow_up_questions: "追问建议",
    answer: "作答",
    manual_submit: "手动提交",
    image_analysis: "图片分析",
    rag_query_live: "实时 RAG",
    rag_query_meeting: "会议 RAG",
    rag_query_global: "全局 RAG",
};

const parseTraceJson = (text: string) => {
    if (!text) return {};

    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
};

const normalizeTraceStringForDisplay = (value: string) => {
    return value
        .replace(/\\r\\n/g, "\n")
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "    ");
};

const formatTraceTimestamp = (value?: string) => {
    if (!value) return "--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleTimeString([], { hour12: false });
};

const formatTraceDuration = (durationMs?: number) => {
    if (typeof durationMs !== "number") return "--";
    if (durationMs < 1000) return `${Math.round(durationMs)}ms`;
    return `${(durationMs / 1000).toFixed(2)}s`;
};

const formatTraceActionType = (type: string) => TRACE_ACTION_LABELS[type] || type.replace(/_/g, " ");

const formatTraceActionStatus = (status: LlmTraceActionRecord["status"]) => {
    if (status === "error") return "错误";
    if (status === "completed") return "完成";
    return "运行中";
};

const upsertTraceActionRecord = (items: LlmTraceActionRecord[], nextAction: LlmTraceActionRecord) => {
    const index = items.findIndex(item => item.id === nextAction.id);
    const next = [...items];
    if (index >= 0) {
        next[index] = nextAction;
    } else {
        next.unshift(nextAction);
    }

    return next.sort((left, right) => (right.endedAt || right.startedAt).localeCompare(left.endedAt || left.startedAt));
};

const renderTraceValue = (value: unknown, depth: number = 0, path: string = "root"): React.ReactNode => {
    const indentStyle = { paddingLeft: `${depth * 14}px` };

    if (value === null) {
        return <span className="text-slate-500">null</span>;
    }

    if (typeof value === "undefined") {
        return <span className="text-slate-500">undefined</span>;
    }

    if (typeof value === "string") {
        return (
            <div className="min-w-0 whitespace-pre-wrap break-words text-emerald-100">
                &quot;{normalizeTraceStringForDisplay(value)}&quot;
            </div>
        );
    }

    if (typeof value === "number" || typeof value === "boolean") {
        return <span className="text-cyan-200">{String(value)}</span>;
    }

    if (Array.isArray(value)) {
        if (value.length === 0) {
            return <span className="text-slate-400">[]</span>;
        }

        return (
            <div className="space-y-1">
                <div style={indentStyle} className="text-slate-500">[</div>
                {value.map((entry, index) => (
                    <div key={`${path}[${index}]`} style={{ paddingLeft: `${(depth + 1) * 14}px` }} className="min-w-0">
                        {renderTraceValue(entry, depth + 1, `${path}[${index}]`)}
                    </div>
                ))}
                <div style={indentStyle} className="text-slate-500">]</div>
            </div>
        );
    }

    if (typeof value === "object") {
        const entries = Object.entries(value as Record<string, unknown>);
        if (entries.length === 0) {
            return <span className="text-slate-400">{'{}'}</span>;
        }

        return (
            <div className="space-y-1">
                <div style={indentStyle} className="text-slate-500">{'{'}</div>
                {entries.map(([key, entryValue]) => (
                    <div key={`${path}.${key}`} style={{ paddingLeft: `${(depth + 1) * 14}px` }} className="min-w-0">
                        <div className="flex min-w-0 items-start gap-2">
                            <span className="shrink-0 text-sky-300">&quot;{key}&quot;:</span>
                            <div className="min-w-0 flex-1">
                                {renderTraceValue(entryValue, depth + 1, `${path}.${key}`)}
                            </div>
                        </div>
                    </div>
                ))}
                <div style={indentStyle} className="text-slate-500">{'}'}</div>
            </div>
        );
    }

    return <span className="text-slate-400">{String(value)}</span>;
};

export default function TraceWindow() {
    const [traceActions, setTraceActions] = useState<LlmTraceActionRecord[]>([]);
    const [traceInfo, setTraceInfo] = useState<{ logDirectory: string; currentLogFile: string; sessionId: string } | null>(null);
    const [selectedTraceActionId, setSelectedTraceActionId] = useState<string | null>(null);
    const [selectedTraceStepId, setSelectedTraceStepId] = useState<string | null>(null);
    const [traceDetailTab, setTraceDetailTab] = useState<TraceDetailTab>("request");
    const [traceError, setTraceError] = useState("");
    const [isTraceLoading, setIsTraceLoading] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!window.electronAPI?.getLlmTraceActions || !window.electronAPI?.getLlmTraceInfo || !window.electronAPI?.onLlmTraceUpdate) {
            return;
        }

        let mounted = true;

        const loadInitialTrace = async () => {
            setIsTraceLoading(true);
            setTraceError("");
            try {
                const [info, actions] = await Promise.all([
                    window.electronAPI.getLlmTraceInfo(),
                    window.electronAPI.getLlmTraceActions({ limit: 80, currentSessionOnly: true }),
                ]);

                if (!mounted) return;
                setTraceInfo(info);
                setTraceActions(actions);
            } catch (error) {
                if (!mounted) return;
                setTraceError(error instanceof Error ? error.message : "加载调用链记录失败");
            } finally {
                if (mounted) {
                    setIsTraceLoading(false);
                }
            }
        };

        void loadInitialTrace();

        const unsubscribe = window.electronAPI.onLlmTraceUpdate((data) => {
            if (!mounted) return;

            if (data.kind === "cleared") {
                setTraceActions([]);
                setSelectedTraceActionId(null);
                setSelectedTraceStepId(null);
                setTraceInfo(prev => prev ? { ...prev, sessionId: data.sessionId } : prev);
                return;
            }

            setTraceActions(prev => upsertTraceActionRecord(prev, data.action));
            setTraceInfo(prev => prev ? { ...prev, sessionId: data.action.sessionId } : prev);
        });

        return () => {
            mounted = false;
            unsubscribe();
        };
    }, []);

    useEffect(() => {
        if (traceActions.length === 0) {
            setSelectedTraceActionId(null);
            setSelectedTraceStepId(null);
            return;
        }

        const selectedAction = traceActions.find(action => action.id === selectedTraceActionId) || traceActions[0];
        if (selectedAction.id !== selectedTraceActionId) {
            setSelectedTraceActionId(selectedAction.id);
        }

        const selectedStep = selectedAction.steps.find(step => step.id === selectedTraceStepId)
            || selectedAction.steps[selectedAction.steps.length - 1]
            || null;

        if (selectedStep?.id !== selectedTraceStepId) {
            setSelectedTraceStepId(selectedStep?.id || null);
        }
    }, [traceActions, selectedTraceActionId, selectedTraceStepId]);

    const selectedTraceAction = useMemo(
        () => traceActions.find(action => action.id === selectedTraceActionId) || traceActions[0] || null,
        [traceActions, selectedTraceActionId]
    );

    const selectedTraceStep = useMemo(
        () => selectedTraceAction?.steps.find(step => step.id === selectedTraceStepId)
            || selectedTraceAction?.steps[selectedTraceAction.steps.length - 1]
            || null,
        [selectedTraceAction, selectedTraceStepId]
    );

    const resolveTracePaneValue = (tab: TraceDetailTab) => {
        if (!selectedTraceAction) {
            return tab === "resolved_input" ? "当前还没有记录到解析后的输入。" : "当前还没有选中的调用链记录。";
        }

        if (tab === "resolved_input") {
            return selectedTraceAction.resolvedInput || "当前还没有记录到解析后的输入。";
        }

        if (!selectedTraceStep) {
            return tab === "request" ? "当前还没有选中的步骤。" : "当前还没有记录到响应内容。";
        }

        if (tab === "request") {
            return {
                url: selectedTraceStep.url,
                method: selectedTraceStep.method,
                provider: selectedTraceStep.provider,
                model: selectedTraceStep.model,
                lane: selectedTraceStep.lane,
                headers: parseTraceJson(selectedTraceStep.requestHeaders),
                body: parseTraceJson(selectedTraceStep.requestBody || ""),
            };
        }

        return {
            status: selectedTraceStep.responseStatus,
            durationMs: selectedTraceStep.durationMs,
            error: selectedTraceStep.error,
            headers: parseTraceJson(selectedTraceStep.responseHeaders),
            body: parseTraceJson(selectedTraceStep.responseBody || ""),
        };
    };

    const handleOpenTraceFolder = async () => {
        if (!window.electronAPI?.openLlmTraceDirectory) return;

        const result = await window.electronAPI.openLlmTraceDirectory();
        if (!result.success) {
            setTraceError(result.error || "打开调用链目录失败");
            return;
        }

        setTraceError("");
        setTraceInfo({
            logDirectory: result.logDirectory,
            currentLogFile: result.currentLogFile,
            sessionId: result.sessionId,
        });
    };

    const handleClearTraceSession = async () => {
        if (!window.electronAPI?.clearLlmTraceSession) return;

        const result = await window.electronAPI.clearLlmTraceSession();
        if (!result.success) return;

        setTraceError("");
        setTraceActions([]);
        setSelectedTraceActionId(null);
        setSelectedTraceStepId(null);
        setTraceInfo(prev => prev ? { ...prev, sessionId: result.sessionId } : prev);
    };

    const handleCopyCurrentPane = async () => {
        try {
            const value = resolveTracePaneValue(traceDetailTab);
            const raw = typeof value === "string" ? value : JSON.stringify(value, null, 2);
            await navigator.clipboard.writeText(raw);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
        } catch (error) {
            console.error("[TraceWindow] Failed to copy trace pane:", error);
        }
    };

    return (
        <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#0E0E10] text-slate-200">
            <div className="border-b border-white/[0.08] px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
                            <Code className="h-4 w-4" />
                            <span>调用链</span>
                            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] tracking-[0.12em] text-slate-400">
                                {traceActions.length}
                            </span>
                        </div>
                        <p className="mt-1 text-sm text-slate-500">
                            每个面试动作对应的原始请求、响应以及解析后的输入都会记录在这里。
                        </p>
                        {traceInfo && (
                            <div className="mt-2 text-[11px] uppercase tracking-[0.16em] text-slate-500">
                                会话 {traceInfo.sessionId.slice(-6)}
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleOpenTraceFolder}
                            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-slate-300 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
                        >
                            <FolderOpen className="h-3.5 w-3.5" />
                            <span>打开目录</span>
                        </button>
                        <button
                            type="button"
                            onClick={handleClearTraceSession}
                            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-slate-300 transition-colors hover:border-red-400/30 hover:bg-red-500/10 hover:text-red-200"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>清空会话</span>
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)]">
                <div className="min-h-0 overflow-y-auto border-r border-white/[0.08] p-4" style={{ scrollbarWidth: "thin", overscrollBehavior: "contain" }}>
                    <div className="space-y-2">
                        {isTraceLoading ? (
                            <div className="rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-5 text-sm text-slate-400">
                                正在加载调用链记录...
                            </div>
                        ) : traceActions.length > 0 ? (
                            traceActions.map((action) => (
                                <button
                                    key={action.id}
                                    type="button"
                                    onClick={() => {
                                        setSelectedTraceActionId(action.id);
                                        setSelectedTraceStepId(action.steps[action.steps.length - 1]?.id || null);
                                    }}
                                    className={`w-full rounded-[18px] border px-3 py-3 text-left transition-colors ${selectedTraceAction?.id === action.id
                                        ? "border-emerald-400/25 bg-emerald-500/10"
                                        : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"}`}
                                >
                                    <div className="mb-2 flex items-center justify-between gap-2">
                                        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                            {action.label}
                                        </span>
                                        <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] ${action.status === "error"
                                            ? "bg-red-500/10 text-red-300"
                                            : action.status === "completed"
                                                ? "bg-emerald-500/10 text-emerald-300"
                                                : "bg-amber-500/10 text-amber-300"}`}>
                                            {formatTraceActionStatus(action.status)}
                                        </span>
                                    </div>
                                    <div className="text-xs text-slate-200 line-clamp-2">
                                        {formatTraceActionType(action.type)}
                                    </div>
                                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                                        <span>{formatTraceTimestamp(action.startedAt)}</span>
                                        <span>{action.steps.length} 个步骤</span>
                                    </div>
                                </button>
                            ))
                        ) : (
                            <div className="rounded-[18px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-sm leading-6 text-slate-500">
                                还没有调用链记录。先触发“怎么回答”“作答”“总结”等动作，这里就会开始出现对应链路。
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex min-h-0 min-w-0 flex-col">
                    {selectedTraceAction ? (
                        <>
                            <div className="border-b border-white/[0.08] px-5 py-4">
                                <div className="flex items-center justify-between gap-4">
                                    <div className="min-w-0">
                                        <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                                            {selectedTraceAction.label}
                                        </div>
                                        <div className="mt-1 text-xs text-slate-500">
                                            {selectedTraceAction.requestId ? `请求 ID：${selectedTraceAction.requestId}` : formatTraceActionType(selectedTraceAction.type)}
                                        </div>
                                    </div>
                                    <div className="text-right text-[11px] text-slate-500">
                                        <div>{formatTraceTimestamp(selectedTraceAction.startedAt)}</div>
                                        <div>{selectedTraceAction.endedAt ? formatTraceTimestamp(selectedTraceAction.endedAt) : "运行中"}</div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-2 overflow-x-auto border-b border-white/[0.08] px-5 py-3" style={{ scrollbarWidth: "thin" }}>
                                {selectedTraceAction.steps.length > 0 ? selectedTraceAction.steps.map((step) => (
                                    <button
                                        key={step.id}
                                        type="button"
                                        onClick={() => setSelectedTraceStepId(step.id)}
                                        className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] transition-colors ${selectedTraceStep?.id === step.id
                                            ? "border-cyan-400/25 bg-cyan-500/10 text-cyan-100"
                                            : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/20 hover:text-white"}`}
                                    >
                                        {step.lane ? `${step.lane} · ` : ""}{step.stage}{step.provider ? ` · ${step.provider}` : ""}
                                    </button>
                                )) : (
                                    <div className="text-xs text-slate-500">当前还没有采集到传输步骤。</div>
                                )}
                            </div>

                            <div className="flex items-center gap-2 border-b border-white/[0.08] px-5 py-3">
                                {(["request", "response", "resolved_input"] as TraceDetailTab[]).map((tab) => (
                                    <button
                                        key={tab}
                                        type="button"
                                        onClick={() => setTraceDetailTab(tab)}
                                        className={`rounded-full px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] transition-colors ${traceDetailTab === tab
                                            ? "bg-white/10 text-white"
                                            : "text-slate-500 hover:text-slate-300"}`}
                                    >
                                        {tab === "resolved_input" ? "解析后输入" : tab === "request" ? "请求" : "响应"}
                                    </button>
                                ))}
                                {selectedTraceStep && (
                                    <div className="ml-auto flex items-center gap-3 text-[11px] text-slate-500">
                                        <span>{selectedTraceStep.method || "--"}</span>
                                        <span>{formatTraceDuration(selectedTraceStep.durationMs)}</span>
                                        {selectedTraceStep.responseStatus && <span>HTTP {selectedTraceStep.responseStatus}</span>}
                                    </div>
                                )}
                                <button
                                    type="button"
                                    onClick={handleCopyCurrentPane}
                                    className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-slate-300 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
                                >
                                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                    <span>{copied ? "已复制" : "复制"}</span>
                                </button>
                            </div>

                            {traceError && (
                                <div className="border-b border-red-500/20 bg-red-500/10 px-5 py-2 text-xs text-red-300">
                                    {traceError}
                                </div>
                            )}

                            <div className="min-h-0 flex-1 overflow-auto px-5 py-4 font-mono text-[12px] leading-6 text-slate-300" style={{ scrollbarWidth: "thin", overscrollBehavior: "contain" }}>
                                {renderTraceValue(resolveTracePaneValue(traceDetailTab))}
                            </div>
                        </>
                    ) : (
                        <div className="flex h-full items-center justify-center px-8 text-sm text-slate-500">
                            请选择一条调用链记录，以查看它的请求、响应和解析后的输入。
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
