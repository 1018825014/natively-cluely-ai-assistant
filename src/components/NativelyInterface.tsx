import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import {
    Sparkles,
    Pencil,
    MessageSquare,
    RefreshCw,
    Settings,
    ArrowUp,
    ArrowRight,
    HelpCircle,
    ChevronLeft,
    ChevronUp,
    ChevronRight,
    ChevronDown,

    CornerDownLeft,
    Mic,
    MicOff,
    Image,
    Camera,
    X,
    FolderOpen,
    Trash2,
    LogOut,
    Zap,
    Edit3,
    SlidersHorizontal,
    Ghost,
    Link,
    Code,
    Copy,
    Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
// import { ModelSelector } from './ui/ModelSelector'; // REMOVED
import TopPill from './ui/TopPill';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { analytics, detectProviderType } from '../lib/analytics/analytics.service';
import { useShortcuts } from '../hooks/useShortcuts';

interface Message {
    id: string;
    role: 'user' | 'system' | 'interviewer';
    text: string;
    timestamp?: number;
    isStreaming?: boolean;
    hasScreenshot?: boolean;
    screenshotPreview?: string;
    isCode?: boolean;
    intent?: string;
    lane?: 'primary' | 'strong';
    requestId?: string;
    modelId?: string;
    modelLabel?: string;
    liveTranscriptSegmentId?: string;
    edited?: boolean;
    transcriptStatus?: 'active' | 'final';
}

type RecommendationLane = 'primary' | 'strong';
type WhatToAnswerLaneStatus = 'idle' | 'started' | 'streaming' | 'completed' | 'skipped' | 'error';

interface RecommendationLaneState {
    requestId: string | null;
    status: WhatToAnswerLaneStatus;
    modelId?: string;
    modelLabel?: string;
    message?: string;
}

interface WhatToAnswerState {
    latestRequestId: string | null;
    primary: RecommendationLaneState;
    strong: RecommendationLaneState;
}

interface LiveTranscriptSegment {
    id: string;
    speaker: 'interviewer' | 'user';
    text: string;
    timestamp: number;
    updatedAt: number;
    status: 'active' | 'final';
    edited: boolean;
    lastProviderText: string;
    confidence?: number;
}

interface NativelyInterfaceProps {
    onEndMeeting?: () => void;
}

type ResizeDirection = 'top-left' | 'top' | 'top-right' | 'right' | 'bottom-right' | 'bottom' | 'bottom-left' | 'left';
type OverlayWindowState = {
    visible: boolean;
    mode: 'launcher' | 'overlay';
    overlayVisible: boolean;
    launcherVisible: boolean;
    overlayAlwaysOnTop: boolean;
    overlayFocused: boolean;
    isMaximized: boolean;
    bounds: { x: number; y: number; width: number; height: number } | null;
    restorableBounds: { x: number; y: number; width: number; height: number } | null;
};

type TraceDetailTab = 'request' | 'response' | 'resolved_input';
type TranscriptSaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';
type SttProviderId = 'google' | 'groq' | 'openai' | 'deepgram' | 'elevenlabs' | 'azure' | 'ibmwatson' | 'soniox' | 'alibaba' | 'funasr';
type PromptLabActionId = 'what_to_answer' | 'follow_up_refine' | 'recap' | 'follow_up_questions' | 'answer';

type LlmTraceActionType =
    | 'what_to_answer'
    | 'follow_up'
    | 'recap'
    | 'follow_up_questions'
    | 'answer'
    | 'manual_submit'
    | 'image_analysis'
    | 'rag_query_live'
    | 'rag_query_meeting'
    | 'rag_query_global';

type LlmTraceActionContext = {
    actionId?: string;
    type?: LlmTraceActionType;
    label?: string;
    requestId?: string;
};

type LlmTraceStepRecord = {
    id: string;
    actionId: string;
    kind: 'transport' | 'rag' | 'app';
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
    type: LlmTraceActionType;
    label: string;
    requestId?: string;
    startedAt: string;
    endedAt?: string;
    status: 'running' | 'completed' | 'error';
    steps: LlmTraceStepRecord[];
    resolvedInput?: Record<string, unknown>;
    error?: string;
};

const TRACE_ACTION_LABELS: Record<LlmTraceActionType, string> = {
    what_to_answer: '怎么回答',
    follow_up: '追问优化',
    recap: '总结',
    follow_up_questions: '追问建议',
    answer: '作答',
    manual_submit: '手动提交',
    image_analysis: '图片分析',
    rag_query_live: '实时 RAG',
    rag_query_meeting: '会议 RAG',
    rag_query_global: '全局 RAG',
};

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
    kind: 'primary' | 'shadow';
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
    speaker: 'interviewer' | 'user';
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

const OVERLAY_PANEL_SIZE_STORAGE_KEY = 'natively_overlay_panel_size';
const STRONG_PANEL_EXPANDED_STORAGE_KEY = 'natively_strong_answer_panel_expanded';
const DEFAULT_PANEL_SIZE = { width: 1080, height: 760 };
const MIN_PANEL_SIZE = { width: 860, height: 600 };
const MIN_THREE_COLUMN_PANEL_WIDTH = 1260;

const ANSWER_REFINEMENT_INTENTS = new Set([
    'what_to_answer',
    'shorten',
    'expand',
    'rephrase',
    'add_example',
    'more_confident',
    'more_casual',
    'more_formal',
    'simplify'
]);

const createEmptyLaneState = (): RecommendationLaneState => ({
    requestId: null,
    status: 'idle'
});

const createInitialWhatToAnswerState = (): WhatToAnswerState => ({
    latestRequestId: null,
    primary: createEmptyLaneState(),
    strong: createEmptyLaneState()
});

const STT_PROVIDER_LABELS: Record<SttProviderId, string> = {
    google: 'Google 云 STT',
    groq: 'Groq Whisper',
    openai: 'OpenAI Whisper',
    deepgram: 'Deepgram',
    elevenlabs: 'ElevenLabs Scribe',
    azure: 'Azure 语音',
    ibmwatson: 'IBM Watson',
    soniox: 'Soniox',
    alibaba: '阿里云 Paraformer',
    funasr: 'Fun-ASR 实时版',
};

const FUN_ASR_PROVIDER_ID = 'funasr';

const formatSttProviderLabel = (provider: string | null | undefined) => {
    if (!provider) return '';
    return STT_PROVIDER_LABELS[provider as SttProviderId] || provider;
};

const formatGlossaryText = (config?: TechnicalGlossaryConfigState | null) => {
    return (config?.entries || [])
        .map((entry) => typeof entry.weight === 'number' ? `${entry.term} | ${entry.weight}` : entry.term)
        .join('\n');
};

const parseGlossaryText = (rawText: string, existingConfig?: TechnicalGlossaryConfigState | null): TechnicalGlossaryConfigState => {
    const entries = rawText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
            const [term, weightPart] = line.split('|').map((part) => part.trim());
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

const formatCompareTimestamp = (value?: number | null) => {
    if (!value) return '--';
    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

const formatCompareLatency = (value?: number | null) => {
    if (typeof value !== 'number') return '--';
    return `${Math.max(0, Math.round(value))} ms`;
};

const createMessageId = (prefix: string) => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `${prefix}-${crypto.randomUUID()}`;
    }

    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const createTraceActionContext = (
    type: LlmTraceActionType,
    label: string,
    requestId?: string
): LlmTraceActionContext => ({
    actionId: createMessageId(`trace-${type}`),
    type,
    label,
    requestId,
});

const formatTraceActionTypeLabel = (type: LlmTraceActionType) => TRACE_ACTION_LABELS[type] || type.replace(/_/g, ' ');

const formatTraceStatusLabel = (status: LlmTraceActionRecord['status']) => {
    if (status === 'error') return '错误';
    if (status === 'completed') return '完成';
    return '运行中';
};

const parseTraceJson = (text: string) => {
    if (!text) return {};

    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
};

const normalizeLane = (lane?: RecommendationLane): RecommendationLane => lane || 'primary';

const normalizeTraceStringForDisplay = (value: string) => {
    return value
        .replace(/\\r\\n/g, '\n')
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '    ');
};

const ensureRequestId = (value: string | undefined, fallbackPrefix: string) => {
    return value || createMessageId(fallbackPrefix);
};

const findRecommendationMessageIndex = (
    items: Message[],
    target: { lane: RecommendationLane; requestId: string; intent?: string }
) => {
    for (let index = items.length - 1; index >= 0; index -= 1) {
        const message = items[index];
        if (message.role !== 'system') continue;
        if (normalizeLane(message.lane) !== target.lane) continue;
        if (message.requestId !== target.requestId) continue;
        if ((message.intent || '') !== (target.intent || '')) continue;
        return index;
    }

    return -1;
};

const TERMINAL_PUNCTUATION_REGEX = /[。！？!?…~～;；:：]$/;
const CJK_REGEX = /[\u3400-\u9fff]/;
const SHORT_INTERVIEWER_FRAGMENT_LENGTH = 12;
const MAX_MERGED_INTERVIEWER_LENGTH = 80;

const joinInterviewerFragments = (currentText: string, incomingText: string) => {
    const previous = currentText.trim();
    const next = incomingText.trim();

    if (!previous) return next;
    if (!next) return previous;

    const shouldUseSpace =
        !CJK_REGEX.test(previous) &&
        !CJK_REGEX.test(next) &&
        !previous.endsWith(' ') &&
        !next.startsWith(' ');

    return `${previous}${shouldUseSpace ? ' ' : ''}${next}`;
};

const shouldAppendInterviewerFragment = (currentText: string, incomingText: string) => {
    const previous = currentText.trim();
    const next = incomingText.trim();

    if (!previous || !next) return false;
    if (TERMINAL_PUNCTUATION_REGEX.test(previous)) return false;

    const combinedLength = joinInterviewerFragments(previous, next).length;
    if (combinedLength > MAX_MERGED_INTERVIEWER_LENGTH) return false;

    return (
        previous.length <= SHORT_INTERVIEWER_FRAGMENT_LENGTH ||
        next.length <= SHORT_INTERVIEWER_FRAGMENT_LENGTH
    );
};

const SAFE_TERMINAL_PUNCTUATION_REGEX = /[\u3002\uFF01\uFF1F\uFF1B\uFF1A.!?;:]$/;
const INTERVIEWER_PAUSE_COMMIT_MS = 1500;
const HARD_MAX_INTERVIEWER_CHARS = 220;
const COMMITTED_REFINEMENT_WINDOW_MS = 15000;
const SIMILARITY_REFINEMENT_MIN_CHARS = 16;
const SIMILARITY_REFINEMENT_THRESHOLD = 0.72;
const LCS_REFINEMENT_THRESHOLD = 0.78;
const INTERVIEWER_REVISION_GRACE_MS = 2500;
const AUTO_SCROLL_BOTTOM_THRESHOLD_PX = 48;

const normalizeTranscriptForComparison = (text: string) => (
    text
        .trim()
        .replace(/\s+/g, '')
        .replace(/[\u3002\uFF01\uFF1F\uFF1B\uFF1A\uFF0C,.!?;:]/g, '')
);

const computeEditDistance = (left: string, right: string) => {
    const rows = left.length + 1;
    const cols = right.length + 1;
    const matrix = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

    for (let row = 0; row < rows; row += 1) matrix[row][0] = row;
    for (let col = 0; col < cols; col += 1) matrix[0][col] = col;

    for (let row = 1; row < rows; row += 1) {
        for (let col = 1; col < cols; col += 1) {
            const substitutionCost = left[row - 1] === right[col - 1] ? 0 : 1;
            matrix[row][col] = Math.min(
                matrix[row - 1][col] + 1,
                matrix[row][col - 1] + 1,
                matrix[row - 1][col - 1] + substitutionCost
            );
        }
    }

    return matrix[left.length][right.length];
};

const calculateTranscriptSimilarity = (currentText: string, incomingText: string) => {
    const previous = normalizeTranscriptForComparison(currentText);
    const next = normalizeTranscriptForComparison(incomingText);

    if (!previous || !next) return 0;
    if (previous === next) return 1;

    const maxLength = Math.max(previous.length, next.length);
    if (!maxLength) return 0;

    return 1 - (computeEditDistance(previous, next) / maxLength);
};

const computeLongestCommonSubsequenceLength = (left: string, right: string) => {
    const rows = left.length + 1;
    const cols = right.length + 1;
    const matrix = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

    for (let row = 1; row < rows; row += 1) {
        for (let col = 1; col < cols; col += 1) {
            if (left[row - 1] === right[col - 1]) {
                matrix[row][col] = matrix[row - 1][col - 1] + 1;
            } else {
                matrix[row][col] = Math.max(matrix[row - 1][col], matrix[row][col - 1]);
            }
        }
    }

    return matrix[left.length][right.length];
};

const calculateTranscriptOverlap = (currentText: string, incomingText: string) => {
    const previous = normalizeTranscriptForComparison(currentText);
    const next = normalizeTranscriptForComparison(incomingText);

    if (!previous || !next) return 0;

    const sharedLength = computeLongestCommonSubsequenceLength(previous, next);
    return sharedLength / Math.min(previous.length, next.length);
};

const isTranscriptRefinement = (currentText: string, incomingText: string) => {
    const previous = normalizeTranscriptForComparison(currentText);
    const next = normalizeTranscriptForComparison(incomingText);

    if (!previous || !next) return false;
    if (previous === next) return true;
    if (next.startsWith(previous) || previous.startsWith(next)) return true;

    if (Math.min(previous.length, next.length) < SIMILARITY_REFINEMENT_MIN_CHARS) {
        return false;
    }

    return (
        calculateTranscriptSimilarity(previous, next) >= SIMILARITY_REFINEMENT_THRESHOLD ||
        calculateTranscriptOverlap(previous, next) >= LCS_REFINEMENT_THRESHOLD
    );
};

const chooseMoreCompleteTranscript = (currentText: string, incomingText: string) => {
    const previous = currentText.trim();
    const next = incomingText.trim();
    const previousNormalized = normalizeTranscriptForComparison(previous);
    const nextNormalized = normalizeTranscriptForComparison(next);

    if (nextNormalized.length > previousNormalized.length) return next;
    if (nextNormalized === previousNormalized && next.length >= previous.length) return next;

    return previous;
};

const shouldReplaceCommittedInterviewerMessage = (
    message: Message | undefined,
    nextText: string,
    nextTimestamp: number
) => {
    if (!message || message.role !== 'interviewer' || !message.timestamp) {
        return false;
    }

    if (Math.abs(nextTimestamp - message.timestamp) > COMMITTED_REFINEMENT_WINDOW_MS) {
        return false;
    }

    return isTranscriptRefinement(message.text, nextText);
};

const findLastCommittedInterviewerMessage = (messages: Message[]) => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        if (messages[index].role === 'interviewer') {
            return messages[index];
        }
    }

    return undefined;
};

const shouldTreatAsInterviewerRevision = (currentText: string, incomingText: string, timeDeltaMs: number) => {
    if (timeDeltaMs > INTERVIEWER_REVISION_GRACE_MS) {
        return false;
    }

    return (
        calculateTranscriptOverlap(currentText, incomingText) >= 0.45 ||
        calculateTranscriptSimilarity(currentText, incomingText) >= 0.5
    );
};

const isScrollNearBottom = (element: HTMLDivElement | null) => {
    if (!element) return true;

    const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
    return remaining <= AUTO_SCROLL_BOTTOM_THRESHOLD_PX;
};

const NativelyInterface: React.FC<NativelyInterfaceProps> = ({ onEndMeeting }) => {
    const [isExpanded, setIsExpanded] = useState(true);
    const [inputValue, setInputValue] = useState('');
    const { shortcuts, isShortcutPressed } = useShortcuts();
    const [messages, setMessages] = useState<Message[]>([]);
    const [liveTranscriptSegments, setLiveTranscriptSegments] = useState<LiveTranscriptSegment[]>([]);
    const [transcriptDrafts, setTranscriptDrafts] = useState<Record<string, string>>({});
    const [isConnected, setIsConnected] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [activeRecommendationLane, setActiveRecommendationLane] = useState<RecommendationLane>('primary');
    const [whatToAnswerState, setWhatToAnswerState] = useState<WhatToAnswerState>(createInitialWhatToAnswerState);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [showConversationScrollToBottom, setShowConversationScrollToBottom] = useState(false);
    const [showRecommendationScrollToBottom, setShowRecommendationScrollToBottom] = useState(false);
    const [currentSttProvider, setCurrentSttProvider] = useState<string | null>(null);
    const [isFunAsrCompareOpen, setIsFunAsrCompareOpen] = useState(false);
    const [sttCompareResults, setSttCompareResults] = useState<SttCompareResultsView | null>(null);
    const [meetingGlossaryConfig, setMeetingGlossaryConfig] = useState<TechnicalGlossaryConfigState | null>(null);
    const [meetingGlossaryText, setMeetingGlossaryText] = useState('');
    const [meetingGlossarySaving, setMeetingGlossarySaving] = useState(false);
    const [meetingGlossarySaved, setMeetingGlossarySaved] = useState(false);
    const [meetingGlossaryMessage, setMeetingGlossaryMessage] = useState('');
    const [meetingGlossaryMessageTone, setMeetingGlossaryMessageTone] = useState<'success' | 'warning' | 'error'>('success');
    const [conversationContext, setConversationContext] = useState<string>('');
    const [isManualRecording, setIsManualRecording] = useState(false);
    const isRecordingRef = useRef(false);  // Ref to track recording state (avoids stale closure)
    const [traceDrawerOpen, setTraceDrawerOpen] = useState(false);
    const [strongPanelExpanded, setStrongPanelExpanded] = useState(() => {
        return localStorage.getItem(STRONG_PANEL_EXPANDED_STORAGE_KEY) === 'true';
    });
    const [panelSize, setPanelSize] = useState(() => {
        const stored = localStorage.getItem(OVERLAY_PANEL_SIZE_STORAGE_KEY);
        if (!stored) {
            return DEFAULT_PANEL_SIZE;
        }

        try {
            const parsed = JSON.parse(stored);
            return {
                width: typeof parsed.width === 'number' ? parsed.width : DEFAULT_PANEL_SIZE.width,
                height: typeof parsed.height === 'number' ? parsed.height : DEFAULT_PANEL_SIZE.height
            };
        } catch {
            return DEFAULT_PANEL_SIZE;
        }
    });
    const [traceActions, setTraceActions] = useState<LlmTraceActionRecord[]>([]);
    const [traceInfo, setTraceInfo] = useState<{ logDirectory: string; currentLogFile: string; sessionId: string } | null>(null);
    const [isTraceLoading, setIsTraceLoading] = useState(false);
    const [traceError, setTraceError] = useState('');
    const [selectedTraceActionId, setSelectedTraceActionId] = useState<string | null>(null);
    const [selectedTraceStepId, setSelectedTraceStepId] = useState<string | null>(null);
    const [traceDetailTab, setTraceDetailTab] = useState<TraceDetailTab>('request');
    const [overlayWindowState, setOverlayWindowState] = useState<OverlayWindowState | null>(null);
    const [transcriptSaveStates, setTranscriptSaveStates] = useState<Record<string, TranscriptSaveState>>({});
    const [isTranscriptFlushInFlight, setIsTranscriptFlushInFlight] = useState(false);

    const refreshCurrentSttProvider = async () => {
        if (!window.electronAPI?.getSttProvider) return;

        try {
            const provider = await window.electronAPI.getSttProvider();
            setCurrentSttProvider(typeof provider === 'string' ? provider : null);
        } catch (error) {
            console.warn('[NativelyInterface] Failed to fetch current STT provider:', error);
        }
    };

    const refreshSttCompareResults = async () => {
        if (!window.electronAPI?.getSttCompareResults) return null;

        try {
            const results = await window.electronAPI.getSttCompareResults();
            setSttCompareResults(results || null);
            return results || null;
        } catch (error) {
            console.warn('[NativelyInterface] Failed to fetch STT compare results:', error);
            return null;
        }
    };

    const refreshMeetingGlossary = async () => {
        if (!window.electronAPI?.getTechnicalGlossary) return null;

        try {
            const config = await window.electronAPI.getTechnicalGlossary();
            const normalizedConfig = config || null;
            setMeetingGlossaryConfig(normalizedConfig);
            setMeetingGlossaryText(formatGlossaryText(normalizedConfig));
            return normalizedConfig;
        } catch (error) {
            console.warn('[NativelyInterface] Failed to fetch technical glossary:', error);
            return null;
        }
    };

    const openFunAsrComparePanel = async () => {
        setIsFunAsrCompareOpen(true);
        setMeetingGlossaryMessage('');
        setMeetingGlossaryMessageTone('success');
        await Promise.all([
            refreshSttCompareResults(),
            refreshMeetingGlossary(),
        ]);
    };

    const closeFunAsrComparePanel = async () => {
        setIsFunAsrCompareOpen(false);

        if (!funAsrCompareAutoStartedRef.current || !window.electronAPI?.stopSttCompareSession) {
            return;
        }

        funAsrCompareAutoStartedRef.current = false;

        try {
            await window.electronAPI.stopSttCompareSession();
            await refreshSttCompareResults();
        } catch (error) {
            console.warn('[NativelyInterface] Failed to stop auto-started STT compare session:', error);
        }
    };

    const handleSaveMeetingGlossary = async () => {
        if (!window.electronAPI?.setTechnicalGlossary) return;

        setMeetingGlossarySaving(true);
        setMeetingGlossaryMessage('');
        setMeetingGlossaryMessageTone('success');

        try {
            const nextConfig = parseGlossaryText(meetingGlossaryText, meetingGlossaryConfig);
            const result = await window.electronAPI.setTechnicalGlossary(nextConfig);

            if (!result?.success) {
                setMeetingGlossaryMessageTone('error');
                setMeetingGlossaryMessage(result?.error || '保存热词表失败。');
                return;
            }

            const savedConfig = result.config || nextConfig;
            setMeetingGlossaryConfig(savedConfig);
            setMeetingGlossaryText(formatGlossaryText(savedConfig));
            setMeetingGlossarySaved(true);
            if (result.warning) {
                setMeetingGlossaryMessageTone('warning');
                setMeetingGlossaryMessage(result.warning);
            } else {
                setMeetingGlossaryMessageTone('success');
                setMeetingGlossaryMessage('热词表已保存，新热词会从下一句开始生效。');
            }
            setTimeout(() => setMeetingGlossarySaved(false), 1800);
            await refreshSttCompareResults();
        } catch (error) {
            console.error('[NativelyInterface] Failed to save meeting glossary:', error);
            setMeetingGlossaryMessageTone('error');
            setMeetingGlossaryMessage(error instanceof Error ? error.message : '保存热词表失败。');
        } finally {
            setMeetingGlossarySaving(false);
        }
    };

    // Analytics State
    const requestStartTimeRef = useRef<number | null>(null);
    const messagesRef = useRef<Message[]>([]);
    const whatToAnswerStateRef = useRef<WhatToAnswerState>(createInitialWhatToAnswerState());
    const legacyRefinementRequestIdsRef = useRef<Record<string, string>>({});
    const funAsrCompareAutoStartedRef = useRef(false);

    const upsertTraceAction = (incoming: LlmTraceActionRecord) => {
        setTraceActions(prev => {
            const next = [...prev];
            const index = next.findIndex(action => action.id === incoming.id);
            if (index >= 0) {
                next[index] = incoming;
            } else {
                next.push(incoming);
            }

            next.sort((left, right) => {
                const rightTimestamp = right.endedAt || right.startedAt;
                const leftTimestamp = left.endedAt || left.startedAt;
                return rightTimestamp.localeCompare(leftTimestamp);
            });

            return next.slice(0, 60);
        });
    };

    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    useEffect(() => {
        whatToAnswerStateRef.current = whatToAnswerState;
    }, [whatToAnswerState]);

    useEffect(() => {
        localStorage.setItem(STRONG_PANEL_EXPANDED_STORAGE_KEY, String(strongPanelExpanded));
    }, [strongPanelExpanded]);

    useEffect(() => {
        overlayWindowStateRef.current = overlayWindowState;
    }, [overlayWindowState]);

    useEffect(() => {
        if (!isExpanded) {
            setActiveRecommendationLane('primary');
        }
    }, [isExpanded]);

    const beginWhatToAnswerRequest = (requestId: string) => {
        legacyRefinementRequestIdsRef.current = {};
        setWhatToAnswerState({
            latestRequestId: requestId,
            primary: { requestId, status: 'started' },
            strong: { requestId, status: 'started' }
        });
    };

    const updateWhatToAnswerLaneState = (
        payload: {
            requestId: string;
            lane: RecommendationLane;
            status: WhatToAnswerLaneStatus;
            modelId?: string;
            modelLabel?: string;
            message?: string;
        }
    ) => {
        setWhatToAnswerState(prev => {
            let nextState = prev;

            if (payload.status === 'started' && payload.lane === 'primary' && prev.latestRequestId !== payload.requestId) {
                nextState = {
                    latestRequestId: payload.requestId,
                    primary: { requestId: payload.requestId, status: 'idle' },
                    strong: { requestId: payload.requestId, status: 'idle' }
                };
            }

            if (nextState.latestRequestId && nextState.latestRequestId !== payload.requestId) {
                return nextState;
            }

            const laneState: RecommendationLaneState = {
                ...nextState[payload.lane],
                requestId: payload.requestId,
                status: payload.status,
                modelId: payload.modelId ?? nextState[payload.lane].modelId,
                modelLabel: payload.modelLabel ?? nextState[payload.lane].modelLabel,
                message: payload.message
            };

            return {
                ...nextState,
                latestRequestId: payload.requestId,
                [payload.lane]: laneState
            };
        });
    };

    const upsertRecommendationMessage = (payload: {
        lane: RecommendationLane;
        requestId: string;
        intent?: string;
        text: string;
        isStreaming?: boolean;
        modelId?: string;
        modelLabel?: string;
    }) => {
        setMessages(prev => {
            const index = findRecommendationMessageIndex(prev, {
                lane: payload.lane,
                requestId: payload.requestId,
                intent: payload.intent
            });

            if (index >= 0) {
                const updated = [...prev];
                const nextText = payload.isStreaming && updated[index].isStreaming
                    ? `${updated[index].text}${payload.text}`
                    : payload.text;
                updated[index] = {
                    ...updated[index],
                    text: nextText,
                    isStreaming: payload.isStreaming,
                    modelId: payload.modelId ?? updated[index].modelId,
                    modelLabel: payload.modelLabel ?? updated[index].modelLabel,
                };
                return updated;
            }

            return [...prev, {
                id: createMessageId(`${payload.intent || 'recommendation'}-${payload.lane}`),
                role: 'system',
                text: payload.text,
                intent: payload.intent,
                lane: payload.lane,
                requestId: payload.requestId,
                isStreaming: payload.isStreaming,
                modelId: payload.modelId,
                modelLabel: payload.modelLabel,
            }];
        });
    };

    const appendSystemMessage = (text: string, lane: RecommendationLane = 'primary') => {
        setMessages(prev => [...prev, {
            id: createMessageId(`system-${lane}`),
            role: 'system',
            text,
            lane,
        }]);
    };

    const resolveWhatToAnswerRequestId = (rawRequestId?: string) => {
        return ensureRequestId(
            rawRequestId || whatToAnswerStateRef.current.latestRequestId || undefined,
            'legacy-what-to-answer'
        );
    };

    const resolveRefinementRequestId = (intent: string, lane: RecommendationLane, rawRequestId?: string) => {
        if (rawRequestId) {
            legacyRefinementRequestIdsRef.current[`${lane}:${intent}`] = rawRequestId;
            return rawRequestId;
        }

        const key = `${lane}:${intent}`;
        const existing = legacyRefinementRequestIdsRef.current[key];
        if (existing) {
            return existing;
        }

        const nextId = createMessageId(`legacy-${intent}-${lane}`);
        legacyRefinementRequestIdsRef.current[key] = nextId;
        return nextId;
    };

    const getLatestAnswerLikeMessage = (lane: RecommendationLane) => {
        const currentMessages = messagesRef.current;
        for (let index = currentMessages.length - 1; index >= 0; index -= 1) {
            const message = currentMessages[index];
            if (message.role !== 'system') continue;
            if (normalizeLane(message.lane) !== lane) continue;
            if (message.isStreaming) continue;
            if (!message.intent || ANSWER_REFINEMENT_INTENTS.has(message.intent)) {
                return message;
            }
        }

        return null;
    };

    const refreshLiveTranscriptState = async () => {
        if (!window.electronAPI?.getLiveTranscriptState) return;
        try {
            const state = await window.electronAPI.getLiveTranscriptState();
            setLiveTranscriptSegments(state);
        } catch (error) {
            console.error('[NativelyInterface] Failed to load live transcript state:', error);
        }
    };

    const autoSizeTranscriptTextarea = (element: HTMLTextAreaElement | null) => {
        if (!element) return;
        element.style.height = '0px';
        element.style.height = `${element.scrollHeight}px`;
    };

    const updateConversationScrollSnapshot = () => {
        const element = conversationScrollRef.current;
        if (!element) return;

        conversationScrollSnapshotRef.current = {
            scrollTop: element.scrollTop,
            scrollHeight: element.scrollHeight,
            pinned: isScrollNearBottom(element),
        };
    };

    const restoreConversationScrollPosition = () => {
        const element = conversationScrollRef.current;
        if (!element) return;

        const snapshot = conversationScrollSnapshotRef.current;
        if (snapshot.pinned) {
            updateConversationScrollSnapshot();
            return;
        }

        const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
        const nextScrollTop = Math.min(snapshot.scrollTop, maxScrollTop);
        if (Math.abs(element.scrollTop - nextScrollTop) > 1) {
            element.scrollTop = nextScrollTop;
        }

        updateConversationScrollSnapshot();
    };

    const registerTranscriptTextarea = (segmentId: string) => (element: HTMLTextAreaElement | null) => {
        if (!element) {
            transcriptTextareaRefs.current.delete(segmentId);
            return;
        }

        transcriptTextareaRefs.current.set(segmentId, element);
        autoSizeTranscriptTextarea(element);
    };

    const markTranscriptTextareaForAutosize = (segmentId: string) => {
        pendingTranscriptAutosizeIdsRef.current.add(segmentId);
    };

    const captureTranscriptSelection = (segmentId: string, element: HTMLTextAreaElement | null) => {
        if (!element) return;
        focusedTranscriptSegmentIdRef.current = segmentId;
        focusedTranscriptSelectionRef.current = {
            segmentId,
            start: element.selectionStart ?? 0,
            end: element.selectionEnd ?? element.selectionStart ?? 0,
        };
    };

    const clearFocusedTranscriptSelection = () => {
        focusedTranscriptSegmentIdRef.current = null;
        focusedTranscriptSelectionRef.current = null;
    };

    const getShouldAutoFollowConversation = () => {
        return !focusedTranscriptSegmentIdRef.current;
    };

    const clearTranscriptSaveStateTimeout = (segmentId: string) => {
        const timeout = transcriptSaveStateTimeoutsRef.current.get(segmentId);
        if (!timeout) return;
        clearTimeout(timeout);
        transcriptSaveStateTimeoutsRef.current.delete(segmentId);
    };

    const setTranscriptSaveState = (segmentId: string, status: TranscriptSaveState) => {
        clearTranscriptSaveStateTimeout(segmentId);
        setTranscriptSaveStates((prev) => {
            if (status === 'idle') {
                if (!(segmentId in prev)) return prev;
                const next = { ...prev };
                delete next[segmentId];
                return next;
            }

            if (prev[segmentId] === status) return prev;
            return { ...prev, [segmentId]: status };
        });
    };

    const scheduleTranscriptSaveStateReset = (segmentId: string, delayMs: number = 1400) => {
        clearTranscriptSaveStateTimeout(segmentId);
        const timeout = setTimeout(() => {
            transcriptSaveStateTimeoutsRef.current.delete(segmentId);
            setTranscriptSaveState(segmentId, 'idle');
        }, delayMs);
        transcriptSaveStateTimeoutsRef.current.set(segmentId, timeout);
    };

    const updateTranscriptDraft = (segmentId: string, nextText: string) => {
        const nextDrafts = { ...transcriptDraftsRef.current, [segmentId]: nextText };
        transcriptDraftsRef.current = nextDrafts;
        setTranscriptDrafts(nextDrafts);
        markTranscriptTextareaForAutosize(segmentId);
        setTranscriptSaveState(segmentId, 'pending');
    };

    const syncTranscriptDraftsFromSegments = (segments: LiveTranscriptSegment[]) => {
        liveTranscriptSegmentsRef.current = segments;
        const dirtyIds = dirtyTranscriptIdsRef.current;
        const knownSegmentIds = new Set(segments.map(segment => segment.id));
        const nextDrafts = { ...transcriptDraftsRef.current };
        let changed = false;

        for (const segment of segments) {
            if (!dirtyIds.has(segment.id) && nextDrafts[segment.id] !== segment.text) {
                nextDrafts[segment.id] = segment.text;
                markTranscriptTextareaForAutosize(segment.id);
                changed = true;
            }
        }

        for (const segmentId of Object.keys(nextDrafts)) {
            if (!knownSegmentIds.has(segmentId) && !dirtyIds.has(segmentId)) {
                delete nextDrafts[segmentId];
                changed = true;
            }
        }

        for (const segmentId of Object.keys(transcriptSaveStates)) {
            if (!knownSegmentIds.has(segmentId) && !dirtyIds.has(segmentId)) {
                setTranscriptSaveState(segmentId, 'idle');
            }
        }

        if (changed) {
            transcriptDraftsRef.current = nextDrafts;
            setTranscriptDrafts(nextDrafts);
        }
    };

    const clearTranscriptSaveTimeout = (segmentId: string) => {
        const timeout = transcriptSaveTimeoutsRef.current.get(segmentId);
        if (timeout) {
            clearTimeout(timeout);
            transcriptSaveTimeoutsRef.current.delete(segmentId);
        }
    };

    const scheduleTranscriptRagResync = (delayMs: number = 800) => {
        if (transcriptRagResyncTimeoutRef.current) {
            clearTimeout(transcriptRagResyncTimeoutRef.current);
        }

        transcriptRagResyncTimeoutRef.current = setTimeout(() => {
            transcriptRagResyncTimeoutRef.current = null;
            void window.electronAPI?.resyncLiveTranscriptRag?.().catch((error) => {
                console.error('[NativelyInterface] Failed to resync live transcript RAG:', error);
            });
        }, delayMs);
    };

    const canMergeTranscriptSegmentWithPrevious = (segmentId: string) => {
        const segments = liveTranscriptSegmentsRef.current;
        const currentIndex = segments.findIndex(segment => segment.id === segmentId);
        if (currentIndex <= 0) return false;

        const speaker = segments[currentIndex]?.speaker;
        if (!speaker) return false;

        for (let index = currentIndex - 1; index >= 0; index -= 1) {
            if (segments[index].speaker === speaker) {
                return true;
            }
        }

        return false;
    };

    const mergeTranscriptSegmentWithPrevious = async (segmentId: string) => {
        if (!window.electronAPI?.mergeLiveTranscriptSegmentWithPrevious) return false;

        await flushPendingTranscriptEdits({ syncRag: false });

        const result = await window.electronAPI.mergeLiveTranscriptSegmentWithPrevious({ id: segmentId });
        if (!result?.success || !result.state || !result.mergedIntoId) {
            if (result?.error) {
                console.error('[NativelyInterface] Failed to merge transcript segment:', result.error);
            }
            return false;
        }

        clearTranscriptSaveTimeout(segmentId);
        dirtyTranscriptIdsRef.current.delete(segmentId);
        setTranscriptSaveState(segmentId, 'idle');

        setLiveTranscriptSegments(result.state);
        syncTranscriptDraftsFromSegments(result.state);
        setTranscriptSaveState(result.mergedIntoId, 'saved');
        scheduleTranscriptSaveStateReset(result.mergedIntoId);

        pendingTranscriptFocusRef.current = {
            segmentId: result.mergedIntoId,
            cursorPosition: result.cursorPosition,
        };

        const ragResult = await window.electronAPI?.resyncLiveTranscriptRag?.();
        if (ragResult && !ragResult.success) {
            console.error('[NativelyInterface] Failed to resync live transcript RAG after merge:', ragResult.error);
        }

        return true;
    };

    const persistTranscriptDraft = async (
        segmentId: string,
        options?: { immediate?: boolean; scheduleRagSync?: boolean }
    ) => {
        clearTranscriptSaveTimeout(segmentId);

        const saveTask = async (): Promise<boolean> => {
            const currentSegment = liveTranscriptSegmentsRef.current.find(segment => segment.id === segmentId);
            if (!currentSegment) {
                dirtyTranscriptIdsRef.current.delete(segmentId);
                setTranscriptSaveState(segmentId, 'idle');
                return false;
            }

            const rawDraft = transcriptDraftsRef.current[segmentId] ?? currentSegment.text;
            const nextText = rawDraft.trim();
            if (!nextText) {
                updateTranscriptDraft(segmentId, currentSegment.text);
                dirtyTranscriptIdsRef.current.delete(segmentId);
                setTranscriptSaveState(segmentId, 'idle');
                return false;
            }

            if (nextText === currentSegment.text) {
                dirtyTranscriptIdsRef.current.delete(segmentId);
                setTranscriptSaveState(segmentId, 'idle');
                return false;
            }

            setTranscriptSaveState(segmentId, 'saving');
            const result = await window.electronAPI?.editLiveTranscriptSegment?.({ id: segmentId, text: nextText });
            if (!result?.success) {
                console.error('[NativelyInterface] Failed to save transcript edit:', result?.error);
                setTranscriptSaveState(segmentId, 'error');
                return false;
            }

            const nextState = result.state || [];
            setLiveTranscriptSegments(nextState);
            syncTranscriptDraftsFromSegments(nextState);

            const savedText = nextState.find(segment => segment.id === segmentId)?.text ?? nextText;
            const latestDraft = (transcriptDraftsRef.current[segmentId] ?? savedText).trim();

            if (latestDraft && latestDraft !== savedText) {
                dirtyTranscriptIdsRef.current.add(segmentId);
                setTranscriptSaveState(segmentId, 'pending');
                if (options?.immediate) {
                    return await persistTranscriptDraft(segmentId, options);
                }
                const timeout = setTimeout(() => {
                    void persistTranscriptDraft(segmentId, { scheduleRagSync: options?.scheduleRagSync });
                }, 250);
                transcriptSaveTimeoutsRef.current.set(segmentId, timeout);
                return false;
            }

            dirtyTranscriptIdsRef.current.delete(segmentId);
            setTranscriptSaveState(segmentId, 'saved');
            scheduleTranscriptSaveStateReset(segmentId);
            if (options?.scheduleRagSync) {
                scheduleTranscriptRagResync();
            }
            return true;
        };

        const inFlight = transcriptSaveInFlightRef.current.get(segmentId) || Promise.resolve(false);
        const chainedTask = inFlight.catch(() => false).then(saveTask);
        transcriptSaveInFlightRef.current.set(segmentId, chainedTask);
        try {
            return await chainedTask;
        } finally {
            if (transcriptSaveInFlightRef.current.get(segmentId) === chainedTask) {
                transcriptSaveInFlightRef.current.delete(segmentId);
            }
        }
    };

    const scheduleTranscriptDraftSave = (segmentId: string) => {
        clearTranscriptSaveTimeout(segmentId);
        const timeout = setTimeout(() => {
            void persistTranscriptDraft(segmentId, { scheduleRagSync: true });
        }, 250);
        transcriptSaveTimeoutsRef.current.set(segmentId, timeout);
    };

    const flushPendingTranscriptEdits = async (options?: { syncRag?: boolean }) => {
        const dirtyIds = Array.from(dirtyTranscriptIdsRef.current);
        const hasPendingRagSync = Boolean(transcriptRagResyncTimeoutRef.current);

        if (dirtyIds.length === 0) {
            if (options?.syncRag && hasPendingRagSync) {
                clearTimeout(transcriptRagResyncTimeoutRef.current!);
                transcriptRagResyncTimeoutRef.current = null;
                const result = await window.electronAPI?.resyncLiveTranscriptRag?.();
                if (result && !result.success) {
                    console.error('[NativelyInterface] Failed to flush transcript-triggered RAG resync:', result.error);
                }
            }
            return false;
        }

        setIsTranscriptFlushInFlight(true);
        dirtyIds.forEach(clearTranscriptSaveTimeout);

        let flushedAny = false;
        let guard = 0;
        try {
            while (dirtyTranscriptIdsRef.current.size > 0 && guard < 4) {
                const ids = Array.from(dirtyTranscriptIdsRef.current);
                for (const segmentId of ids) {
                    const didFlush = await persistTranscriptDraft(segmentId, { immediate: true, scheduleRagSync: false });
                    flushedAny = flushedAny || didFlush;
                }
                guard += 1;
            }

            if (options?.syncRag && flushedAny) {
                if (transcriptRagResyncTimeoutRef.current) {
                    clearTimeout(transcriptRagResyncTimeoutRef.current);
                    transcriptRagResyncTimeoutRef.current = null;
                }
                const result = await window.electronAPI?.resyncLiveTranscriptRag?.();
                if (result && !result.success) {
                    console.error('[NativelyInterface] Failed to flush transcript-triggered RAG resync:', result.error);
                }
            }
        } finally {
            setIsTranscriptFlushInFlight(false);
        }

        return flushedAny;
    };

    const clampPanelSize = (width: number, height: number) => {
        return {
            width: Math.round(Math.max(width, MIN_PANEL_SIZE.width)),
            height: Math.round(Math.max(height, MIN_PANEL_SIZE.height))
        };
    };

    const updatePanelSize = (nextWidth: number, nextHeight: number) => {
        const nextSize = clampPanelSize(nextWidth, nextHeight);
        panelSizeRef.current = nextSize;
        setPanelSize(nextSize);
        return nextSize;
    };

    const applyOverlayWindowStateSnapshot = (state: OverlayWindowState | null) => {
        if (!state) return;

        overlayWindowStateRef.current = state;
        setOverlayWindowState(state);

        if (!state.isMaximized && state.bounds) {
            const nextSize = clampPanelSize(state.bounds.width, state.bounds.height);
            if (
                panelSizeRef.current.width !== nextSize.width ||
                panelSizeRef.current.height !== nextSize.height
            ) {
                panelSizeRef.current = nextSize;
                setPanelSize(nextSize);
            }
        }
    };

    const toggleOverlayMaximize = async () => {
        if (!window.electronAPI) return;

        try {
            const nextState = overlayWindowStateRef.current?.isMaximized
                ? await window.electronAPI.restoreOverlayBounds?.()
                : await window.electronAPI.maximizeOverlayToWorkArea?.();

            applyOverlayWindowStateSnapshot((nextState as OverlayWindowState | undefined) || null);
        } catch (error) {
            console.error('[NativelyInterface] Failed to toggle overlay maximized state:', error);
        }
    };

    useEffect(() => {
        if (!isExpanded || overlayWindowState?.isMaximized) {
            return;
        }

        const requiredWidth = strongPanelExpanded ? MIN_THREE_COLUMN_PANEL_WIDTH : MIN_PANEL_SIZE.width;

        if (panelSize.width >= requiredWidth) return;
        updatePanelSize(requiredWidth, panelSize.height);
    }, [isExpanded, strongPanelExpanded, panelSize.width, panelSize.height, overlayWindowState?.isMaximized]);

    const scrollConversationToBottom = (behavior: ScrollBehavior = 'smooth') => {
        const element = conversationScrollRef.current;
        if (!element) return;

        element.scrollTo({ top: element.scrollHeight, behavior });
        interviewerMessagesEndRef.current?.scrollIntoView({ block: 'end', behavior });
        isConversationPinnedToBottomRef.current = true;
        setShowConversationScrollToBottom(false);
        requestAnimationFrame(() => updateConversationScrollSnapshot());
    };

    const scrollRecommendationToBottom = (behavior: ScrollBehavior = 'smooth') => {
        const element = recommendationScrollRef.current;
        if (!element) return;

        element.scrollTo({ top: element.scrollHeight, behavior });
        isRecommendationPinnedToBottomRef.current = true;
        setShowRecommendationScrollToBottom(false);
    };

    const handleConversationScroll = () => {
        const pinnedToBottom = isScrollNearBottom(conversationScrollRef.current);
        isConversationPinnedToBottomRef.current = pinnedToBottom;
        setShowConversationScrollToBottom(!pinnedToBottom);
        updateConversationScrollSnapshot();
    };

    const handleConversationPointerDownCapture = (event: React.PointerEvent<HTMLDivElement>) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest('[data-transcript-segment-id]')) {
            return;
        }

        const activeElement = document.activeElement as HTMLTextAreaElement | null;
        if (!activeElement?.dataset?.transcriptSegmentId) {
            return;
        }

        activeElement.blur();
        clearFocusedTranscriptSelection();
    };

    const handleRecommendationScroll = () => {
        const pinnedToBottom = isScrollNearBottom(recommendationScrollRef.current);
        isRecommendationPinnedToBottomRef.current = pinnedToBottom;
        setShowRecommendationScrollToBottom(!pinnedToBottom);
    };

    const stopResizing = () => {
        window.removeEventListener('pointermove', handleResizeMove);
        window.removeEventListener('pointerup', stopResizing);
        resizeStateRef.current = null;
    };

    function handleResizeMove(event: PointerEvent) {
        const resizeState = resizeStateRef.current;
        if (!resizeState) {
            return;
        }

        const deltaX = event.clientX - resizeState.startX;
        const deltaY = event.clientY - resizeState.startY;

        let nextWidth = resizeState.startWidth;
        let nextHeight = resizeState.startHeight;
        let nextX = resizeState.startWindowX;
        let nextY = resizeState.startWindowY;

        if (resizeState.corner.includes('right')) {
            nextWidth = resizeState.startWidth + deltaX;
        }
        if (resizeState.corner.includes('left')) {
            nextWidth = resizeState.startWidth - deltaX;
        }
        if (resizeState.corner.includes('bottom')) {
            nextHeight = resizeState.startHeight + deltaY;
        }
        if (resizeState.corner.includes('top')) {
            nextHeight = resizeState.startHeight - deltaY;
        }

        const clampedSize = updatePanelSize(nextWidth, nextHeight);

        if (resizeState.corner.includes('left')) {
            nextX = resizeState.startWindowX + (resizeState.startWidth - clampedSize.width);
        }
        if (resizeState.corner.includes('top')) {
            nextY = resizeState.startWindowY + (resizeState.startHeight - clampedSize.height);
        }

        void window.electronAPI?.setOverlayBounds?.({
            x: Math.round(nextX),
            y: Math.round(nextY),
            width: clampedSize.width,
            height: clampedSize.height
        });
    }

    const handleResizeStart = (corner: ResizeDirection) => (event: React.PointerEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        if (overlayWindowStateRef.current?.isMaximized) {
            return;
        }

        resizeStateRef.current = {
            corner,
            startX: event.clientX,
            startY: event.clientY,
            startWindowX: window.screenX,
            startWindowY: window.screenY,
            startWidth: panelSizeRef.current.width,
            startHeight: panelSizeRef.current.height
        };

        window.addEventListener('pointermove', handleResizeMove);
        window.addEventListener('pointerup', stopResizing);
    };

    useEffect(() => {
        panelSizeRef.current = panelSize;
        localStorage.setItem(OVERLAY_PANEL_SIZE_STORAGE_KEY, JSON.stringify(panelSize));
    }, [panelSize]);

    useEffect(() => {
        isExpandedRef.current = isExpanded;
    }, [isExpanded]);

    useEffect(() => () => {
        stopResizing();
        transcriptSaveTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
        transcriptSaveTimeoutsRef.current.clear();
        transcriptSaveStateTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
        transcriptSaveStateTimeoutsRef.current.clear();
        if (transcriptRagResyncTimeoutRef.current) {
            clearTimeout(transcriptRagResyncTimeoutRef.current);
            transcriptRagResyncTimeoutRef.current = null;
        }
    }, []);

    const textInputRef = useRef<HTMLInputElement>(null); // Ref for input focus

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const interviewerMessagesEndRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const conversationScrollRef = useRef<HTMLDivElement>(null);
    const recommendationScrollRef = useRef<HTMLDivElement>(null);
    const isConversationPinnedToBottomRef = useRef(true);
    const isRecommendationPinnedToBottomRef = useRef(true);
    const manualRecordingStartAtRef = useRef<number | null>(null);
    const latestUserTranscriptSnapshotRef = useRef('');
    const resizeStateRef = useRef<{
        corner: ResizeDirection;
        startX: number;
        startY: number;
        startWindowX: number;
        startWindowY: number;
        startWidth: number;
        startHeight: number;
    } | null>(null);
    const panelSizeRef = useRef(panelSize);
    const transcriptDraftsRef = useRef<Record<string, string>>({});
    const liveTranscriptSegmentsRef = useRef<LiveTranscriptSegment[]>([]);
    const dirtyTranscriptIdsRef = useRef<Set<string>>(new Set());
    const transcriptSaveTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
    const transcriptSaveInFlightRef = useRef<Map<string, Promise<boolean>>>(new Map());
    const transcriptRagResyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const transcriptSaveStateTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
    const transcriptTextareaRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map());
    const overlayWindowStateRef = useRef<OverlayWindowState | null>(null);
    const focusedTranscriptSegmentIdRef = useRef<string | null>(null);
    const focusedTranscriptSelectionRef = useRef<{ segmentId: string; start: number; end: number } | null>(null);
    const pendingTranscriptFocusRef = useRef<{ segmentId: string; cursorPosition?: number } | null>(null);
    const pendingTranscriptAutosizeIdsRef = useRef<Set<string>>(new Set());
    const conversationScrollSnapshotRef = useRef({
        scrollTop: 0,
        scrollHeight: 0,
        pinned: true,
    });
    const freezeAutoResizeRef = useRef(false);
    const isExpandedRef = useRef(isExpanded);
    // const settingsButtonRef = useRef<HTMLButtonElement>(null);

    // Latent Context State (Screenshots attached but not sent)
    const [attachedContext, setAttachedContext] = useState<Array<{ path: string, preview: string }>>([]);

    // Settings State with Persistence
    const [isUndetectable, setIsUndetectable] = useState(false);
    const [hideChatHidesWidget, setHideChatHidesWidget] = useState(() => {
        const stored = localStorage.getItem('natively_hideChatHidesWidget');
        return stored ? stored === 'true' : true;
    });

    // Model Selection State
    const [currentModel, setCurrentModel] = useState<string>('gemini-3-flash-preview');

    useEffect(() => {
        // Load the persisted default model (not the runtime model)
        // Each new meeting starts with the default from settings
        if (window.electronAPI?.getDefaultModel) {
            window.electronAPI.getDefaultModel()
                .then((result: any) => {
                    if (result && result.model) {
                        setCurrentModel(result.model);
                        // Also set the runtime model to the default
                        window.electronAPI.setModel(result.model).catch(() => { });
                    }
                })
                .catch((err: any) => console.error("Failed to fetch default model:", err));
        }
    }, []);

    const handleModelSelect = (modelId: string) => {
        setCurrentModel(modelId);
        // Session-only: update runtime but don't persist as default
        window.electronAPI.setModel(modelId)
            .catch((err: any) => console.error("Failed to set model:", err));
    };

    // Listen for default model changes from Settings
    useEffect(() => {
        if (!window.electronAPI?.onModelChanged) return;
        const unsubscribe = window.electronAPI.onModelChanged((modelId: string) => {
            setCurrentModel(prev => prev === modelId ? prev : modelId);
        });
        return () => unsubscribe();
    }, []);

    // Global State Sync
    useEffect(() => {
        // Fetch initial state
        if (window.electronAPI?.getUndetectable) {
            window.electronAPI.getUndetectable().then(setIsUndetectable);
        }

        if (window.electronAPI?.onUndetectableChanged) {
            const unsubscribe = window.electronAPI.onUndetectableChanged((state) => {
                setIsUndetectable(state);
            });
            return () => unsubscribe();
        }
    }, []);

    // Persist Settings
    useEffect(() => {
        localStorage.setItem('natively_undetectable', String(isUndetectable));
        localStorage.setItem('natively_hideChatHidesWidget', String(hideChatHidesWidget));
    }, [isUndetectable, hideChatHidesWidget]);

    // Auto-resize Window
    useLayoutEffect(() => {
        if (!contentRef.current) return;

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                // Use getBoundingClientRect to get the exact rendered size including padding
                const rect = entry.target.getBoundingClientRect();

                if (freezeAutoResizeRef.current || overlayWindowStateRef.current?.isMaximized || isExpandedRef.current) {
                    continue;
                }

                // Send exact dimensions to Electron
                // Removed buffer to ensure tight fit
                console.log('[NativelyInterface] ResizeObserver:', Math.ceil(rect.width), Math.ceil(rect.height));
                window.electronAPI?.updateContentDimensions({
                    width: Math.ceil(rect.width),
                    height: Math.ceil(rect.height)
                });
            }
        });

        observer.observe(contentRef.current);
        return () => observer.disconnect();
    }, []);

    // Force resize when attachedContext changes (screenshots added/removed)
    useEffect(() => {
        if (!contentRef.current) return;
        // Let the DOM settle, then measure and push new dimensions
        requestAnimationFrame(() => {
            if (!contentRef.current) return;
            if (freezeAutoResizeRef.current || overlayWindowStateRef.current?.isMaximized || isExpandedRef.current) return;
            const rect = contentRef.current.getBoundingClientRect();
            window.electronAPI?.updateContentDimensions({
                width: Math.ceil(rect.width),
                height: Math.ceil(rect.height)
            });
        });
    }, [attachedContext, overlayWindowState?.isMaximized]);

    // Force initial sizing safety check
    useEffect(() => {
        const timer = setTimeout(() => {
            if (contentRef.current) {
                if (freezeAutoResizeRef.current || overlayWindowStateRef.current?.isMaximized || isExpandedRef.current) return;
                const rect = contentRef.current.getBoundingClientRect();
                window.electronAPI?.updateContentDimensions({
                    width: Math.ceil(rect.width),
                    height: Math.ceil(rect.height)
                });
            }
        }, 600);
        return () => clearTimeout(timer);
    }, []);

    // Auto-scroll only when the user is already pinned to the bottom of a column.
    useEffect(() => {
        if (!isExpanded) {
            return;
        }

        if (isConversationPinnedToBottomRef.current && getShouldAutoFollowConversation()) {
            requestAnimationFrame(() => {
                scrollConversationToBottom('auto');
                requestAnimationFrame(() => scrollConversationToBottom('auto'));
            });
        } else {
            setShowConversationScrollToBottom(true);
        }

        if (isRecommendationPinnedToBottomRef.current) {
            requestAnimationFrame(() => scrollRecommendationToBottom('auto'));
        } else {
            setShowRecommendationScrollToBottom(true);
        }
    }, [messages, liveTranscriptSegments, isExpanded, isProcessing, isManualRecording]);

    // Build conversation context from messages
    useEffect(() => {
        const context = messages
            .filter(m => !m.isStreaming)
            .filter(m => m.role !== 'user' || !m.hasScreenshot)
            .filter(m => m.role !== 'system' || normalizeLane(m.lane) === 'primary')
            .map(m => `${m.role === 'interviewer' ? 'Interviewer' : m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`)
            .slice(-20)
            .join('\n');
        setConversationContext(context);
    }, [messages]);

    useEffect(() => {
        syncTranscriptDraftsFromSegments(liveTranscriptSegments);
    }, [liveTranscriptSegments]);

    useEffect(() => {
        const pendingIds = Array.from(pendingTranscriptAutosizeIdsRef.current);
        if (pendingIds.length === 0) return;
        pendingTranscriptAutosizeIdsRef.current.clear();
        pendingIds.forEach((segmentId) => {
            autoSizeTranscriptTextarea(transcriptTextareaRefs.current.get(segmentId) || null);
        });

        if (isConversationPinnedToBottomRef.current && getShouldAutoFollowConversation()) {
            requestAnimationFrame(() => {
                scrollConversationToBottom('auto');
                requestAnimationFrame(() => scrollConversationToBottom('auto'));
            });
        } else {
            requestAnimationFrame(() => restoreConversationScrollPosition());
        }
    }, [transcriptDrafts, liveTranscriptSegments]);

    useLayoutEffect(() => {
        if (!isExpanded) return;
        restoreConversationScrollPosition();
    }, [liveTranscriptSegments, messages, isManualRecording, isExpanded]);

    useLayoutEffect(() => {
        const pendingFocus = pendingTranscriptFocusRef.current;
        if (!pendingFocus) return;

        const target = transcriptTextareaRefs.current.get(pendingFocus.segmentId);
        if (!target) return;

        pendingTranscriptFocusRef.current = null;
        target.focus({ preventScroll: true });
        autoSizeTranscriptTextarea(target);

        const cursorPosition = Math.max(0, Math.min(
            pendingFocus.cursorPosition ?? target.value.length,
            target.value.length
        ));
        target.setSelectionRange(cursorPosition, cursorPosition);
        focusedTranscriptSegmentIdRef.current = pendingFocus.segmentId;
        focusedTranscriptSelectionRef.current = {
            segmentId: pendingFocus.segmentId,
            start: cursorPosition,
            end: cursorPosition,
        };
    }, [liveTranscriptSegments, transcriptDrafts]);

    useLayoutEffect(() => {
        if (pendingTranscriptFocusRef.current) return;

        const activeElement = document.activeElement as HTMLTextAreaElement | null;
        const activeSegmentId = activeElement?.dataset?.transcriptSegmentId || null;
        if (!activeElement || !activeSegmentId) return;

        const trackedSelection = focusedTranscriptSelectionRef.current;
        if (!trackedSelection || trackedSelection.segmentId !== activeSegmentId) return;

        const target = transcriptTextareaRefs.current.get(activeSegmentId);
        if (!target || target !== activeElement) return;

        const start = Math.max(0, Math.min(trackedSelection.start, target.value.length));
        const end = Math.max(start, Math.min(trackedSelection.end, target.value.length));

        if (target.selectionStart !== start || target.selectionEnd !== end) {
            target.setSelectionRange(start, end);
        }
    }, [liveTranscriptSegments, transcriptDrafts]);

    useEffect(() => {
        void refreshLiveTranscriptState();

        if (!window.electronAPI?.onLiveTranscriptUpdate) {
            return;
        }

        const unsubscribe = window.electronAPI.onLiveTranscriptUpdate((segments) => {
            setLiveTranscriptSegments(segments);
        });

        return () => unsubscribe();
    }, []);

    useEffect(() => {
        void refreshCurrentSttProvider();
        void refreshSttCompareResults();
    }, []);

    useEffect(() => {
        if (currentSttProvider || !liveTranscriptSegments.some((segment) => segment.speaker === 'interviewer')) {
            return;
        }

        void refreshCurrentSttProvider();
    }, [liveTranscriptSegments, currentSttProvider]);

    useEffect(() => {
        if (!window.electronAPI?.onSttCompareUpdate) return;

        return window.electronAPI.onSttCompareUpdate((results) => {
            setSttCompareResults(results || null);
        });
    }, []);

    useEffect(() => {
        if (!isFunAsrCompareOpen) return;
        void refreshSttCompareResults();
        void refreshMeetingGlossary();
    }, [isFunAsrCompareOpen]);

    useEffect(() => {
        if (!isFunAsrCompareOpen || !isConnected || !window.electronAPI?.startSttCompareSession) {
            return;
        }

        const providers = sttCompareResults?.providers || [];
        const funAsrDescriptor = providers.find((provider) => provider.id === FUN_ASR_PROVIDER_ID);
        if (!funAsrDescriptor?.available || sttCompareResults?.active) {
            return;
        }

        let cancelled = false;

        const startCompare = async () => {
            try {
                await window.electronAPI.startSttCompareSession();
                if (cancelled) return;
                funAsrCompareAutoStartedRef.current = true;
                await refreshSttCompareResults();
            } catch (error) {
                if (!cancelled) {
                    console.warn('[NativelyInterface] Failed to auto-start Fun-ASR compare session:', error);
                }
            }
        };

        void startCompare();

        return () => {
            cancelled = true;
        };
    }, [isFunAsrCompareOpen, isConnected, sttCompareResults?.active, sttCompareResults?.providers]);

    // Listen for settings window visibility changes
    useEffect(() => {
        if (!window.electronAPI?.onSettingsVisibilityChange) return;
        const unsubscribe = window.electronAPI.onSettingsVisibilityChange((isVisible) => {
            setIsSettingsOpen(isVisible);
        });
        return () => unsubscribe();
    }, []);

    // Sync Window Visibility with Expanded State
    useEffect(() => {
        if (isExpanded) {
            window.electronAPI.showWindow();
        } else {
            // Slight delay to allow animation to clean up if needed, though immediate is safer for click-through
            // Using setTimeout to ensure the render cycle completes first
            // Increased to 400ms to allow "contract to bottom" exit animation to finish
            setTimeout(() => window.electronAPI.hideWindow(), 400);
        }
    }, [isExpanded]);

    // Legacy renderer toggle event
    useEffect(() => {
        if (!window.electronAPI?.onToggleExpand) return;
        const unsubscribe = window.electronAPI.onToggleExpand(() => {
            setIsExpanded(prev => !prev);
        });
        return () => unsubscribe();
    }, []);

    // Keep renderer expansion state in sync with the actual overlay window visibility.
    useEffect(() => {
        if (!window.electronAPI?.getOverlayWindowState || !window.electronAPI?.onWindowVisibilityChanged) return;

        let mounted = true;
        const applyOverlayVisibility = (state: OverlayWindowState) => {
            if (!mounted || !state) return;
            applyOverlayWindowStateSnapshot(state);

            if (state.mode === 'overlay' || !state.visible) {
                setIsExpanded(state.visible);
            }
        };

        window.electronAPI.getOverlayWindowState()
            .then((state) => applyOverlayVisibility(state as OverlayWindowState))
            .catch((error) => {
                console.error('[NativelyInterface] Failed to fetch overlay window state:', error);
            });

        const unsubscribe = window.electronAPI.onWindowVisibilityChanged((state) => {
            applyOverlayVisibility(state as OverlayWindowState);
        });

        return () => {
            mounted = false;
            unsubscribe();
        };
    }, []);

    // Session Reset Listener - Clears UI when a NEW meeting starts
    useEffect(() => {
        if (!window.electronAPI?.onSessionReset) return;
        const unsubscribe = window.electronAPI.onSessionReset(() => {
            console.log('[NativelyInterface] Resetting session state...');
            setMessages([]);
            setInputValue('');
            setAttachedContext([]);
            setIsProcessing(false);
            setActiveRecommendationLane('primary');
            setWhatToAnswerState(createInitialWhatToAnswerState());
            setLiveTranscriptSegments([]);
            setCurrentSttProvider(null);
            setIsFunAsrCompareOpen(false);
            setSttCompareResults(null);
            setMeetingGlossaryMessage('');
            setMeetingGlossaryMessageTone('success');
            transcriptDraftsRef.current = {};
            setTranscriptDrafts({});
            setTranscriptSaveStates({});
            dirtyTranscriptIdsRef.current.clear();
            isRecordingRef.current = false;
            manualRecordingStartAtRef.current = null;
            latestUserTranscriptSnapshotRef.current = '';
            legacyRefinementRequestIdsRef.current = {};
            funAsrCompareAutoStartedRef.current = false;
            // Optionally reset connection status if needed, but connection persists

            // Track new conversation/session if applicable?
            // Actually 'app_opened' is global, 'assistant_started' is overlay.
            // Maybe 'conversation_started' event?
            analytics.trackConversationStarted();
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (!window.electronAPI?.getLlmTraceActions || !window.electronAPI?.getLlmTraceInfo || !window.electronAPI?.onLlmTraceUpdate) {
            return;
        }

        let mounted = true;

        const loadInitialTrace = async () => {
            setIsTraceLoading(true);
            setTraceError('');
            try {
                const [info, actions] = await Promise.all([
                    window.electronAPI.getLlmTraceInfo(),
                    window.electronAPI.getLlmTraceActions({ limit: 40, currentSessionOnly: true }),
                ]);

                if (!mounted) return;
                setTraceInfo(info);
                setTraceActions(actions);
            } catch (error) {
                if (!mounted) return;
                console.error('[NativelyInterface] Failed to load LLM trace actions:', error);
                setTraceError(error instanceof Error ? error.message : '加载调用链记录失败');
            } finally {
                if (mounted) {
                    setIsTraceLoading(false);
                }
            }
        };

        loadInitialTrace();

        const unsubscribe = window.electronAPI.onLlmTraceUpdate((data) => {
            if (!mounted) return;

            if (data.kind === 'cleared') {
                setTraceActions([]);
                setSelectedTraceActionId(null);
                setSelectedTraceStepId(null);
                setTraceInfo(prev => prev ? { ...prev, sessionId: data.sessionId } : prev);
                return;
            }

            upsertTraceAction(data.action);
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


    const handleScreenshotAttach = (data: { path: string; preview: string }) => {
        setIsExpanded(true);
        setAttachedContext(prev => {
            // Prevent duplicates and cap at 5
            if (prev.some(s => s.path === data.path)) return prev;
            const updated = [...prev, data];
            return updated.slice(-5); // Keep last 5
        });
    };

    // Connect to Native Audio Backend
    useEffect(() => {
        const cleanups: (() => void)[] = [];

        // Connection Status
        window.electronAPI.getNativeAudioStatus().then((status) => {
            setIsConnected(status.connected);
        }).catch(() => setIsConnected(false));

        cleanups.push(window.electronAPI.onNativeAudioConnected(() => {
            setIsConnected(true);
        }));
        cleanups.push(window.electronAPI.onNativeAudioDisconnected(() => {
            setIsConnected(false);
        }));

        // Real-time Transcripts
        cleanups.push(window.electronAPI.onNativeAudioTranscript((transcript) => {
            if (isRecordingRef.current && transcript.speaker === 'user') {
                latestUserTranscriptSnapshotRef.current = transcript.text.trim();
                return;
            }

            if (transcript.speaker === 'user') {
                return;
            }
        }));

        // AI Suggestions from native audio (legacy)
        cleanups.push(window.electronAPI.onSuggestionProcessingStart(() => {
            setIsProcessing(true);
            setIsExpanded(true);
        }));

        cleanups.push(window.electronAPI.onSuggestionGenerated((data) => {
            setIsProcessing(false);
            appendSystemMessage(data.suggestion);
        }));

        cleanups.push(window.electronAPI.onSuggestionError((err) => {
            setIsProcessing(false);
            appendSystemMessage(`错误：${err.error}`);
        }));

        if (typeof window.electronAPI.onIntelligenceSuggestedAnswerStatus === 'function') {
            cleanups.push(window.electronAPI.onIntelligenceSuggestedAnswerStatus((data) => {
                updateWhatToAnswerLaneState({
                    requestId: resolveWhatToAnswerRequestId(data.requestId),
                    lane: normalizeLane(data.lane),
                    status: data.status,
                    modelId: data.modelId,
                    modelLabel: data.modelLabel,
                    message: data.message
                });
            }));
        }

        cleanups.push(window.electronAPI.onIntelligenceSuggestedAnswerToken((data) => {
            const lane = normalizeLane(data.lane);
            const requestId = resolveWhatToAnswerRequestId(data.requestId);
            updateWhatToAnswerLaneState({
                requestId,
                lane,
                status: 'streaming',
                modelId: data.modelId,
                modelLabel: data.modelLabel
            });
            upsertRecommendationMessage({
                lane,
                requestId,
                intent: 'what_to_answer',
                text: data.token,
                isStreaming: true,
                modelId: data.modelId,
                modelLabel: data.modelLabel,
            });
        }));

        cleanups.push(window.electronAPI.onIntelligenceSuggestedAnswer((data) => {
            setIsProcessing(false);
            const lane = normalizeLane(data.lane);
            const requestId = resolveWhatToAnswerRequestId(data.requestId);
            updateWhatToAnswerLaneState({
                requestId,
                lane,
                status: 'completed',
                modelId: data.modelId,
                modelLabel: data.modelLabel
            });
            upsertRecommendationMessage({
                lane,
                requestId,
                intent: 'what_to_answer',
                text: data.answer,
                isStreaming: false,
                modelId: data.modelId,
                modelLabel: data.modelLabel,
            });
        }));

        // STREAMING: Refinement
        cleanups.push(window.electronAPI.onIntelligenceRefinedAnswerToken((data) => {
            const lane = normalizeLane(data.lane);
            const requestId = resolveRefinementRequestId(data.intent, lane, data.requestId);
            upsertRecommendationMessage({
                lane,
                requestId,
                intent: data.intent,
                text: data.token,
                isStreaming: true,
                modelId: data.modelId,
                modelLabel: data.modelLabel,
            });
        }));

        cleanups.push(window.electronAPI.onIntelligenceRefinedAnswer((data) => {
            setIsProcessing(false);
            const lane = normalizeLane(data.lane);
            const requestId = resolveRefinementRequestId(data.intent, lane, data.requestId);
            upsertRecommendationMessage({
                lane,
                requestId,
                intent: data.intent,
                text: data.answer,
                isStreaming: false,
                modelId: data.modelId,
                modelLabel: data.modelLabel,
            });
            delete legacyRefinementRequestIdsRef.current[`${lane}:${data.intent}`];
        }));

        // STREAMING: Recap
        cleanups.push(window.electronAPI.onIntelligenceRecapToken((data) => {
            setMessages(prev => {
                const lastMsg = prev[prev.length - 1];
                if (lastMsg && lastMsg.isStreaming && lastMsg.intent === 'recap') {
                    const updated = [...prev];
                    updated[prev.length - 1] = {
                        ...lastMsg,
                        text: lastMsg.text + data.token
                    };
                    return updated;
                }
                return [...prev, {
                    id: Date.now().toString(),
                    role: 'system',
                    text: data.token,
                    intent: 'recap',
                    isStreaming: true
                }];
            });
        }));

        cleanups.push(window.electronAPI.onIntelligenceRecap((data) => {
            setIsProcessing(false);
            setMessages(prev => {
                const lastMsg = prev[prev.length - 1];
                if (lastMsg && lastMsg.isStreaming && lastMsg.intent === 'recap') {
                    const updated = [...prev];
                    updated[prev.length - 1] = {
                        ...lastMsg,
                        text: data.summary,
                        isStreaming: false
                    };
                    return updated;
                }
                return [...prev, {
                    id: Date.now().toString(),
                    role: 'system',
                    text: data.summary,
                    intent: 'recap'
                }];
            });
        }));

        // STREAMING: Follow-Up Questions (Rendered as message? Or specific UI?)
        // Currently interface typically renders follow-up Qs as a message or button update.
        // Let's assume message for now based on existing 'follow_up_questions_update' handling
        // But wait, existing handle just sets state?
        // Let's check how 'follow_up_questions_update' was handled.
        // It was handled separate locally in this component maybe?
        // Ah, I need to see the existing listener for 'onIntelligenceFollowUpQuestionsUpdate'

        // Let's implemented token streaming for it anyway, likely it updates a message bubble 
        // OR it might update a specialized "Suggested Questions" area.
        // Assuming it's a message for consistency with "Copilot" approach.

        cleanups.push(window.electronAPI.onIntelligenceFollowUpQuestionsToken((data) => {
            setMessages(prev => {
                const lastMsg = prev[prev.length - 1];
                if (lastMsg && lastMsg.isStreaming && lastMsg.intent === 'follow_up_questions') {
                    const updated = [...prev];
                    updated[prev.length - 1] = {
                        ...lastMsg,
                        text: lastMsg.text + data.token
                    };
                    return updated;
                }
                return [...prev, {
                    id: Date.now().toString(),
                    role: 'system',
                    text: data.token,
                    intent: 'follow_up_questions',
                    isStreaming: true
                }];
            });
        }));

        cleanups.push(window.electronAPI.onIntelligenceFollowUpQuestionsUpdate((data) => {
            // This event name is slightly different ('update' vs 'answer')
            setIsProcessing(false);
            setMessages(prev => {
                const lastMsg = prev[prev.length - 1];
                if (lastMsg && lastMsg.isStreaming && lastMsg.intent === 'follow_up_questions') {
                    const updated = [...prev];
                    updated[prev.length - 1] = {
                        ...lastMsg,
                        text: data.questions,
                        isStreaming: false
                    };
                    return updated;
                }
                return [...prev, {
                    id: Date.now().toString(),
                    role: 'system',
                    text: data.questions,
                    intent: 'follow_up_questions'
                }];
            });
        }));

        cleanups.push(window.electronAPI.onIntelligenceManualResult((data) => {
            setIsProcessing(false);
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'system',
                text: `📝 **Answer:**\n\n${data.answer}`
            }]);
        }));

        cleanups.push(window.electronAPI.onIntelligenceError((data) => {
            setIsProcessing(false);
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'system',
                text: `❌ 错误（${data.mode}）：${data.error}`
            }]);
        }));
        // Screenshot taken - attach to chat input instead of auto-analyzing
        cleanups.push(window.electronAPI.onScreenshotTaken(handleScreenshotAttach));

        // Selective Screenshot (Latent Context)
        if (window.electronAPI.onScreenshotAttached) {
            cleanups.push(window.electronAPI.onScreenshotAttached(handleScreenshotAttach));
        }

        return () => cleanups.forEach(fn => fn());
    }, [isExpanded]);

    // Quick Actions - Updated to use new Intelligence APIs

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        analytics.trackCopyAnswer();
        // Optional: Trigger a small toast or state change for visual feedback
    };

    const handleOpenTraceFolder = async () => {
        if (!window.electronAPI?.openLlmTraceDirectory) return;

        try {
            const result = await window.electronAPI.openLlmTraceDirectory();
            if (!result.success) {
                setTraceError(result.error || '打开调用链目录失败');
                return;
            }

            setTraceError('');
            setTraceInfo({
                logDirectory: result.logDirectory,
                currentLogFile: result.currentLogFile,
                sessionId: result.sessionId,
            });
        } catch (error) {
            console.error('[NativelyInterface] Failed to open LLM trace directory:', error);
            setTraceError(error instanceof Error ? error.message : '打开调用链目录失败');
        }
    };

    const handleOpenTraceWindow = async () => {
        if (!window.electronAPI?.openTraceWindow) return;

        try {
            await window.electronAPI.openTraceWindow();
        } catch (error) {
            console.error('[NativelyInterface] Failed to open Trace window:', error);
        }
    };

    const handleOpenRawTranscriptWindow = async () => {
        if (!window.electronAPI?.openRawTranscriptWindow) return;

        try {
            await window.electronAPI.openRawTranscriptWindow();
        } catch (error) {
            console.error('[NativelyInterface] Failed to open Raw STT window:', error);
        }
    };

    const handleOpenPromptLabWindow = async (action: PromptLabActionId) => {
        if (!window.electronAPI?.openPromptLabWindow) return;

        try {
            if (action === 'what_to_answer') {
                await window.electronAPI.openPromptLabWindow({
                    action,
                    context: {
                        imagePaths: attachedContext.map(item => item.path)
                    }
                });
                return;
            }

            if (action === 'follow_up_refine') {
                const lane = isExpanded ? activeRecommendationLane : 'primary';
                const sourceMessage = getLatestAnswerLikeMessage(lane);
                await window.electronAPI.openPromptLabWindow({
                    action,
                    context: {
                        lane,
                        sourceAnswer: sourceMessage?.text,
                        intent: 'shorten'
                    }
                });
                return;
            }

            if (action === 'answer') {
                await window.electronAPI.openPromptLabWindow({
                    action,
                    context: {
                        imagePaths: attachedContext.map(item => item.path)
                    }
                });
                return;
            }

            await window.electronAPI.openPromptLabWindow({ action });
        } catch (error) {
            console.error('[NativelyInterface] Failed to open Prompt Lab window:', error);
        }
    };

    const handleClearTraceSession = async () => {
        if (!window.electronAPI?.clearLlmTraceSession) return;

        try {
            const result = await window.electronAPI.clearLlmTraceSession();
            if (!result.success) {
                return;
            }

            setTraceError('');
            setTraceActions([]);
            setSelectedTraceActionId(null);
            setSelectedTraceStepId(null);
            setTraceInfo(prev => prev ? { ...prev, sessionId: result.sessionId } : prev);
        } catch (error) {
            console.error('[NativelyInterface] Failed to clear LLM trace session:', error);
            setTraceError(error instanceof Error ? error.message : '清空调用链会话失败');
        }
    };

    const handleWhatToSay = async () => {
        setIsExpanded(true);
        setIsProcessing(true);
        setActiveRecommendationLane('primary');
        analytics.trackCommandExecuted('what_to_say');
        const requestId = createMessageId('what-to-answer-request');
        beginWhatToAnswerRequest(requestId);

        // Capture and clear attached image context
        const currentAttachments = attachedContext;
        if (currentAttachments.length > 0) {
            setAttachedContext([]);
            // Show the attached image in chat
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'user',
                text: '我该怎么回答这个？',
                hasScreenshot: true,
                screenshotPreview: currentAttachments[0].preview
            }]);
        }

        try {
            await flushPendingTranscriptEdits({ syncRag: true });
            // Pass imagePath if attached
            await window.electronAPI.generateWhatToSay(
                undefined,
                currentAttachments.length > 0 ? currentAttachments.map(s => s.path) : undefined,
                requestId
            );
        } catch (err) {
            updateWhatToAnswerLaneState({
                requestId,
                lane: 'primary',
                status: 'error',
                message: String(err)
            });
            appendSystemMessage(`错误：${err}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleFollowUp = async (intent: string = 'rephrase') => {
        setIsExpanded(true);
        setIsProcessing(true);
        analytics.trackCommandExecuted('follow_up_' + intent);
        const lane = isExpanded ? activeRecommendationLane : 'primary';
        const sourceMessage = getLatestAnswerLikeMessage(lane);

        if (lane === 'strong' && !sourceMessage) {
            setIsProcessing(false);
            appendSystemMessage('请先选定一条强模型答案，再执行追问类操作。', 'strong');
            return;
        }

        try {
            await flushPendingTranscriptEdits({ syncRag: true });
            await window.electronAPI.generateFollowUp(intent, undefined, {
                lane,
                answer: sourceMessage?.text,
                requestId: createMessageId(`follow-up-${lane}`)
            });
        } catch (err) {
            appendSystemMessage(`错误：${err}`, lane);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleRecap = async () => {
        setIsExpanded(true);
        setIsProcessing(true);
        analytics.trackCommandExecuted('recap');

        try {
            await flushPendingTranscriptEdits({ syncRag: true });
            await window.electronAPI.generateRecap();
        } catch (err) {
            appendSystemMessage(`错误：${err}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleFollowUpQuestions = async () => {
        setIsExpanded(true);
        setIsProcessing(true);
        analytics.trackCommandExecuted('suggest_questions');

        try {
            await flushPendingTranscriptEdits({ syncRag: true });
            await window.electronAPI.generateFollowUpQuestions();
        } catch (err) {
            appendSystemMessage(`错误：${err}`);
        } finally {
            setIsProcessing(false);
        }
    };


    // Setup Streaming Listeners
    useEffect(() => {
        const cleanups: (() => void)[] = [];

        // Stream Token
        cleanups.push(window.electronAPI.onGeminiStreamToken((token) => {
            setMessages(prev => {
                const lastMsg = prev[prev.length - 1];
                // Should we be updating the last message or finding the specific streaming one?
                // Assuming the last added message is the one we are streaming into.
                if (lastMsg && lastMsg.isStreaming && lastMsg.role === 'system') {
                    const updated = [...prev];
                    updated[prev.length - 1] = {
                        ...lastMsg,
                        text: lastMsg.text + token,
                        // re-check code status on every token? Expensive but needed for progressive highlighting
                        isCode: (lastMsg.text + token).includes('```') || (lastMsg.text + token).includes('def ') || (lastMsg.text + token).includes('function ')
                    };
                    return updated;
                }
                return prev;
            });
        }));

        // Stream Done
        cleanups.push(window.electronAPI.onGeminiStreamDone(() => {
            setIsProcessing(false);

            // Calculate latency if we have a start time
            let latency = 0;
            if (requestStartTimeRef.current) {
                latency = Date.now() - requestStartTimeRef.current;
                requestStartTimeRef.current = null;
            }

            // Track Usage
            analytics.trackModelUsed({
                model_name: currentModel,
                provider_type: detectProviderType(currentModel),
                latency_ms: latency
            });

            setMessages(prev => {
                const lastMsg = prev[prev.length - 1];
                if (lastMsg && lastMsg.isStreaming) {
                    const updated = [...prev];
                    updated[prev.length - 1] = {
                        ...lastMsg,
                        isStreaming: false
                    };
                    return updated;
                }
                return prev;
            });
        }));

        // Stream Error
        cleanups.push(window.electronAPI.onGeminiStreamError((error) => {
            setIsProcessing(false);
            requestStartTimeRef.current = null; // Clear timer on error
            setMessages(prev => {
                // Append error to the current message or add new one?
                // Let's add a new error block if the previous one confusing,
                // or just update status.
                // Ideally we want to show the partial response AND the error.
                const lastMsg = prev[prev.length - 1];
                if (lastMsg && lastMsg.isStreaming) {
                    const updated = [...prev];
                    updated[prev.length - 1] = {
                        ...lastMsg,
                        isStreaming: false,
                        text: lastMsg.text + `\n\n[错误：${error}]`
                    };
                    return updated;
                }
                return [...prev, {
                    id: Date.now().toString(),
                    role: 'system',
                    text: `❌ 错误：${error}`
                }];
            });
        }));

        // JIT RAG Stream listeners (for live meeting RAG responses)
        if (window.electronAPI.onRAGStreamChunk) {
            cleanups.push(window.electronAPI.onRAGStreamChunk((data: { chunk: string }) => {
                setMessages(prev => {
                    const lastMsg = prev[prev.length - 1];
                    if (lastMsg && lastMsg.isStreaming && lastMsg.role === 'system') {
                        const updated = [...prev];
                        updated[prev.length - 1] = {
                            ...lastMsg,
                            text: lastMsg.text + data.chunk,
                            isCode: (lastMsg.text + data.chunk).includes('```')
                        };
                        return updated;
                    }
                    return prev;
                });
            }));
        }

        if (window.electronAPI.onRAGStreamComplete) {
            cleanups.push(window.electronAPI.onRAGStreamComplete(() => {
                setIsProcessing(false);
                requestStartTimeRef.current = null;
                setMessages(prev => {
                    const lastMsg = prev[prev.length - 1];
                    if (lastMsg && lastMsg.isStreaming) {
                        const updated = [...prev];
                        updated[prev.length - 1] = { ...lastMsg, isStreaming: false };
                        return updated;
                    }
                    return prev;
                });
            }));
        }

        if (window.electronAPI.onRAGStreamError) {
            cleanups.push(window.electronAPI.onRAGStreamError((data: { error: string }) => {
                setIsProcessing(false);
                requestStartTimeRef.current = null;
                setMessages(prev => {
                    const lastMsg = prev[prev.length - 1];
                    if (lastMsg && lastMsg.isStreaming) {
                        const updated = [...prev];
                        updated[prev.length - 1] = {
                            ...lastMsg,
                            isStreaming: false,
                            text: lastMsg.text + `\n\n[RAG 错误：${data.error}]`
                        };
                        return updated;
                    }
                    return prev;
                });
            }));
        }

        return () => cleanups.forEach(fn => fn());
    }, [currentModel]); // Ensure tracking captures correct model


    const handleAnswerNow = async () => {
        if (isManualRecording) {
            // Stop recording - send the canonical user live transcript to Gemini
            isRecordingRef.current = false;
            setIsManualRecording(false);
            const recordingStartedAt = manualRecordingStartAtRef.current;
            manualRecordingStartAtRef.current = null;

            // End manual answer capture: finalize user STT and restore the default mic route
            if (window.electronAPI?.endManualAnswerCapture) {
                await window.electronAPI.endManualAnswerCapture().catch(err => console.error('[NativelyInterface] Failed to end manual answer capture:', err));
            } else {
                await window.electronAPI.finalizeMicSTT().catch(err => console.error('[NativelyInterface] Failed to send finalizeMicSTT:', err));
            }

            const currentAttachments = attachedContext;
            setAttachedContext([]);

            let transcriptState = liveTranscriptSegmentsRef.current.length > 0
                ? liveTranscriptSegmentsRef.current
                : liveTranscriptSegments;
            try {
                if (window.electronAPI?.getLiveTranscriptState) {
                    const nextTranscriptState = await window.electronAPI.getLiveTranscriptState();
                    if (nextTranscriptState?.length) {
                        transcriptState = nextTranscriptState;
                    }
                    setLiveTranscriptSegments(transcriptState);
                }
            } catch (error) {
                console.error('[NativelyInterface] Failed to refresh user live transcript state:', error);
            }

            const transcriptQuestion = transcriptState
                .filter(segment => segment.speaker === 'user')
                .filter(segment => recordingStartedAt === null || (segment.updatedAt || segment.timestamp) >= recordingStartedAt - 250)
                .map(segment => segment.text.trim())
                .filter(Boolean)
                .join(' ')
                .trim();
            const question = chooseMoreCompleteTranscript(
                transcriptQuestion,
                latestUserTranscriptSnapshotRef.current
            ).trim();

            latestUserTranscriptSnapshotRef.current = '';

            if (!question && currentAttachments.length === 0) {
                // No voice input and no image
                setMessages(prev => [...prev, {
                    id: Date.now().toString(),
                    role: 'system',
                    text: '⚠️ 没有检测到语音，请靠近麦克风再试一次。'
                }]);
                return;
            }

            if (currentAttachments.length > 0) {
                setMessages(prev => [...prev, {
                    id: Date.now().toString(),
                    role: 'user',
                    text: '已附加截图',
                    timestamp: Date.now(),
                    hasScreenshot: true,
                    screenshotPreview: currentAttachments[0]?.preview
                }]);
            }

            // Add placeholder for streaming response
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'system',
                text: '',
                isStreaming: true
            }]);

            setIsProcessing(true);
            const traceContext = createTraceActionContext('answer', '作答');

            try {
                await flushPendingTranscriptEdits({ syncRag: true });
                const answerPreview = await window.electronAPI?.getPromptLabActionPreview?.('answer', {
                    question,
                    imagePaths: currentAttachments.map(item => item.path)
                });
                const prompt = answerPreview?.execution?.contextPrompt || '';

                if (currentAttachments.length === 0) {
                    // JIT RAG pre-flight: try to use indexed meeting context first
                    const ragResult = await window.electronAPI.ragQueryLive?.(question, traceContext);
                    if (ragResult?.success) {
                        // JIT RAG handled it 鈥?response streamed via rag:stream-chunk events
                        return;
                    }
                }

                // Call Streaming API: message = question, context = instructions
                requestStartTimeRef.current = Date.now();
                await window.electronAPI.streamGeminiChat(
                    question,
                    currentAttachments.length > 0 ? currentAttachments.map(s => s.path) : undefined,
                    prompt,
                    {
                        skipSystemPrompt: true,
                        traceContext
                    }
                );

            } catch (err) {
                // Initial invocation failing (e.g. IPC error before stream starts)
                setIsProcessing(false);
                setMessages(prev => {
                    const last = prev[prev.length - 1];
                    // If we just added the empty streaming placeholder, remove it or fill it with error
                    if (last && last.isStreaming && last.text === '') {
                        return prev.slice(0, -1).concat({
                            id: Date.now().toString(),
                            role: 'system',
                            text: `❌ 启动流式回复失败：${err}`
                        });
                    }
                    return [...prev, {
                        id: Date.now().toString(),
                        role: 'system',
                        text: `❌ 错误：${err}`
                    }];
                });
            }
        } else {
            // Start recording and mark a new candidate-answer capture window
            try {
                const committed = await window.electronAPI?.commitLiveTranscriptSegment?.({ speaker: 'user' });
                if (committed?.state) {
                    setLiveTranscriptSegments(committed.state);
                }
            } catch (error) {
                console.warn('[NativelyInterface] Failed to finalize previous user live transcript before recording:', error);
            }

            try {
                await window.electronAPI?.beginManualAnswerCapture?.();
            } catch (error) {
                console.warn('[NativelyInterface] Failed to begin manual answer capture:', error);
            }

            latestUserTranscriptSnapshotRef.current = '';
            manualRecordingStartAtRef.current = Date.now();
            isRecordingRef.current = true;
            setIsManualRecording(true);


            // Ensure native audio is connected
            try {
                // Native audio is now managed by main process
                // await window.electronAPI.invoke('native-audio-connect');
            } catch (err) {
                // Already connected, that's fine
            }
        }
    };

    const handleManualSubmit = async () => {
        if (!inputValue.trim() && attachedContext.length === 0) return;

        const userText = inputValue;
        const currentAttachments = attachedContext;

        // Clear inputs immediately
        setInputValue('');
        setAttachedContext([]);

        setMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: 'user',
            text: userText || (currentAttachments.length > 0 ? '请分析这张截图' : ''),
            hasScreenshot: currentAttachments.length > 0,
            screenshotPreview: currentAttachments[0]?.preview
        }]);

        // Add placeholder for streaming response
        setMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: 'system',
            text: '',
            isStreaming: true
        }]);

        setIsExpanded(true);
        setIsProcessing(true);
        const traceContext = createTraceActionContext('manual_submit', '手动提交');

        try {
            await flushPendingTranscriptEdits({ syncRag: true });
            let canonicalContext = conversationContext;
            if (window.electronAPI?.getIntelligenceContext) {
                const contextSnapshot = await window.electronAPI.getIntelligenceContext();
                canonicalContext = contextSnapshot?.context || canonicalContext;
            }

            // JIT RAG pre-flight: try to use indexed meeting context first
            if (currentAttachments.length === 0) {
                const ragResult = await window.electronAPI.ragQueryLive?.(userText || '', traceContext);
                if (ragResult?.success) {
                    // JIT RAG handled it 鈥?response streamed via rag:stream-chunk events
                    return;
                }
            }

            // Pass imagePath if attached, AND conversation context
            requestStartTimeRef.current = Date.now();
            await window.electronAPI.streamGeminiChat(
                userText || '请分析这张截图',
                currentAttachments.length > 0 ? currentAttachments.map(s => s.path) : undefined,
                canonicalContext,
                {
                    traceContext
                }
            );
        } catch (err) {
            setIsProcessing(false);
            setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last && last.isStreaming && last.text === '') {
                    // remove the empty placeholder
                    return prev.slice(0, -1).concat({
                        id: Date.now().toString(),
                        role: 'system',
                        text: `❌ 启动流式回复失败：${err}`
                    });
                }
                return [...prev, {
                    id: Date.now().toString(),
                    role: 'system',
                    text: `❌ 错误：${err}`
                }];
            });
        }
    };

    const clearChat = () => {
        setMessages([]);
        setActiveRecommendationLane('primary');
        setWhatToAnswerState(createInitialWhatToAnswerState());
        legacyRefinementRequestIdsRef.current = {};
    };

    const compactMarkdownText = (text: string) => (
        text
            .replace(/\r\n/g, '\n')
            .replace(/[ \t]+\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim()
    );

    const compactMarkdownParagraphClass = "mb-1.5 last:mb-0 break-words [overflow-wrap:anywhere]";
    const compactMarkdownListClass = "mb-1.5 ml-4 list-disc space-y-0.5";
    const compactMarkdownOrderedListClass = "mb-1.5 ml-4 list-decimal space-y-0.5";
    const compactMarkdownListItemClass = "pl-1 leading-6 [&>p]:mb-0 [&>p]:inline [&>p]:mr-1.5 [&>p:last-child]:mr-0 [&>ul]:mt-1 [&>ol]:mt-1";
    const compactInlineCodeClass = "rounded bg-black/25 px-1 py-0.5 text-xs font-mono break-words [overflow-wrap:anywhere]";




    const renderMessageText = (msg: Message) => {
        const normalizedText = compactMarkdownText(msg.text);
        // Code-containing messages get special styling
        // We split by code blocks to keep the "Code Solution" UI intact for the code parts
        // But use ReactMarkdown for the text parts around it
        if (msg.isCode || (msg.role === 'system' && normalizedText.includes('```'))) {
            const parts = normalizedText.split(/(```[\s\S]*?```)/g);
            return (
                <div className="bg-white/5 border border-white/10 rounded-lg p-3 my-1">
                    <div className="flex items-center gap-2 mb-2 text-purple-300 font-semibold text-xs uppercase tracking-wide">
                        <Code className="w-3.5 h-3.5" />
                        <span>代码解法</span>
                    </div>
                    <div className="space-y-2 text-slate-200 text-[13px] leading-relaxed">
                        {parts.map((part, i) => {
                            if (part.startsWith('```')) {
                                const match = part.match(/```(\w+)?\n?([\s\S]*?)```/);
                                if (match) {
                                    const lang = match[1] || 'python';
                                    const code = match[2].trim();
                                    return (
                                        <div key={i} className="my-3 rounded-xl overflow-hidden border border-white/[0.08] shadow-lg bg-zinc-800/60 backdrop-blur-md">
                                            {/* Minimalist Apple Header */}
                                            <div className="bg-white/[0.04] px-3 py-1.5 border-b border-white/[0.08]">
                                                <span className="text-[10px] uppercase tracking-widest font-semibold text-white/40 font-mono">
                                                    {lang || 'CODE'}
                                                </span>
                                            </div>
                                            <div className="bg-transparent">
                                                <SyntaxHighlighter
                                                    language={lang}
                                                    style={vscDarkPlus}
                                                    customStyle={{
                                                        margin: 0,
                                                        borderRadius: 0,
                                                        fontSize: '13px',
                                                        lineHeight: '1.6',
                                                        background: 'transparent',
                                                        padding: '16px',
                                                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
                                                    }}
                                                    wrapLongLines={true}
                                                    showLineNumbers={true}
                                                    lineNumberStyle={{ minWidth: '2.5em', paddingRight: '1.2em', color: 'rgba(255,255,255,0.2)', textAlign: 'right', fontSize: '11px' }}
                                                >
                                                    {code}
                                                </SyntaxHighlighter>
                                            </div>
                                        </div>
                                    );
                                }
                            }
                            // Regular text - Render with Markdown
                            return (
                                <div key={i} className="markdown-content">
                                    <ReactMarkdown
                                        remarkPlugins={[remarkGfm, remarkMath]}
                                        rehypePlugins={[rehypeKatex]}
                                        components={{
                                            p: ({ node, ...props }: any) => <p className="mb-2 last:mb-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]" {...props} />,
                                            strong: ({ node, ...props }: any) => <strong className="font-bold text-white" {...props} />,
                                            em: ({ node, ...props }: any) => <em className="italic text-slate-300" {...props} />,
                                            ul: ({ node, ...props }: any) => <ul className="list-disc ml-4 mb-2 space-y-1" {...props} />,
                                            ol: ({ node, ...props }: any) => <ol className="list-decimal ml-4 mb-2 space-y-1" {...props} />,
                                            li: ({ node, ...props }: any) => <li className={compactMarkdownListItemClass} {...props} />,
                                            h1: ({ node, ...props }: any) => <h1 className="text-lg font-bold text-white mb-2 mt-3" {...props} />,
                                            h2: ({ node, ...props }: any) => <h2 className="text-base font-bold text-white mb-2 mt-3" {...props} />,
                                            h3: ({ node, ...props }: any) => <h3 className="text-sm font-bold text-white mb-1 mt-2" {...props} />,
                                            code: ({ node, ...props }: any) => <code className="bg-slate-700/50 rounded px-1 py-0.5 text-xs font-mono text-purple-200 break-words [overflow-wrap:anywhere]" {...props} />,
                                            blockquote: ({ node, ...props }: any) => <blockquote className="border-l-2 border-purple-500/50 pl-3 italic text-slate-400 my-2" {...props} />,
                                            a: ({ node, ...props }: any) => <a className="text-blue-400 hover:text-blue-300 hover:underline" target="_blank" rel="noopener noreferrer" {...props} />,
                                        }}
                                    >
                                        {part}
                                    </ReactMarkdown>
                                </div>
                            );
                        })}
                    </div>
                </div>
            );
        }

        // Custom Styled Labels (Shorten, Recap, Follow-up) - also use Markdown for content
        if (msg.intent === 'shorten') {
            return (
                <div className="bg-white/5 border border-white/10 rounded-lg p-3 my-1">
                    <div className="flex items-center gap-2 mb-2 text-cyan-300 font-semibold text-xs uppercase tracking-wide">
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>已精简</span>
                    </div>
                    <div className="text-slate-200 text-[13px] leading-relaxed markdown-content">
                        <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={{
                            p: ({ node, ...props }: any) => <p className={compactMarkdownParagraphClass} {...props} />,
                            strong: ({ node, ...props }: any) => <strong className="font-extrabold text-white" {...props} />,
                            ul: ({ node, ...props }: any) => <ul className={compactMarkdownListClass} {...props} />,
                            li: ({ node, ...props }: any) => <li className={compactMarkdownListItemClass} {...props} />,
                        }}>
                            {normalizedText}
                        </ReactMarkdown>
                    </div>
                </div>
            );
        }

        if (msg.intent === 'recap') {
            return (
                <div className="bg-white/5 border border-white/10 rounded-lg p-3 my-1">
                    <div className="flex items-center gap-2 mb-2 text-indigo-300 font-semibold text-xs uppercase tracking-wide">
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>总结</span>
                    </div>
                    <div className="text-slate-200 text-[13px] leading-relaxed markdown-content">
                        <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={{
                            p: ({ node, ...props }: any) => <p className={compactMarkdownParagraphClass} {...props} />,
                            strong: ({ node, ...props }: any) => <strong className="font-extrabold text-white" {...props} />,
                            ul: ({ node, ...props }: any) => <ul className={compactMarkdownListClass} {...props} />,
                            li: ({ node, ...props }: any) => <li className={compactMarkdownListItemClass} {...props} />,
                        }}>
                            {normalizedText}
                        </ReactMarkdown>
                    </div>
                </div>
            );
        }

        if (msg.intent === 'follow_up_questions') {
            return (
                <div className="bg-white/5 border border-white/10 rounded-lg p-3 my-1">
                    <div className="flex items-center gap-2 mb-2 text-[#FFD60A] font-semibold text-xs uppercase tracking-wide">
                        <HelpCircle className="w-3.5 h-3.5" />
                        <span>追问问题</span>
                    </div>
                    <div className="text-slate-200 text-[13px] leading-relaxed markdown-content">
                        <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={{
                            p: ({ node, ...props }: any) => <p className={compactMarkdownParagraphClass} {...props} />,
                            strong: ({ node, ...props }: any) => <strong className="font-extrabold text-white" {...props} />,
                            ul: ({ node, ...props }: any) => <ul className={compactMarkdownListClass} {...props} />,
                            li: ({ node, ...props }: any) => <li className={compactMarkdownListItemClass} {...props} />,
                        }}>
                            {normalizedText}
                        </ReactMarkdown>
                    </div>
                </div>
            );
        }

        if (msg.intent === 'what_to_answer') {
            // Split text by code blocks (Handle unclosed blocks at EOF)
            const parts = normalizedText.split(/(```[\s\S]*?(?:```|$))/g);

            return (
                <div className="bg-white/5 border border-white/10 rounded-lg p-3 my-1">
                    <div className="flex items-center gap-2 mb-2 text-emerald-400 font-semibold text-xs uppercase tracking-wide">
                        <span>你可以这样说</span>
                    </div>
                    <div className="text-slate-100 text-[14px] leading-relaxed">
                        {parts.map((part, i) => {
                            if (part.startsWith('```')) {
                                // Robust matching: handles unclosed blocks for streaming (```...$)
                                const match = part.match(/```(\w*)\s+([\s\S]*?)(?:```|$)/);

                                // Fallback logic: if it starts with ticks, treat as code (even if unclosed)
                                if (match || part.startsWith('```')) {
                                    const lang = (match && match[1]) ? match[1] : 'python';
                                    let code = '';

                                    if (match && match[2]) {
                                        code = match[2].trim();
                                    } else {
                                        // Manual strip if regex failed
                                        code = part.replace(/^```\w*\s*/, '').replace(/```$/, '').trim();
                                    }

                                    return (
                                        <div key={i} className="my-3 rounded-xl overflow-hidden border border-white/[0.08] shadow-lg bg-zinc-800/60 backdrop-blur-md">
                                            {/* Minimalist Apple Header */}
                                            <div className="bg-white/[0.04] px-3 py-1.5 border-b border-white/[0.08]">
                                                <span className="text-[10px] uppercase tracking-widest font-semibold text-white/40 font-mono">
                                                    {lang || 'CODE'}
                                                </span>
                                            </div>

                                            <div className="bg-transparent">
                                                <SyntaxHighlighter
                                                    language={lang}
                                                    style={vscDarkPlus}
                                                    customStyle={{
                                                        margin: 0,
                                                        borderRadius: 0,
                                                        fontSize: '13px',
                                                        lineHeight: '1.6',
                                                        background: 'transparent',
                                                        padding: '16px',
                                                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
                                                    }}
                                                    wrapLongLines={true}
                                                    showLineNumbers={true}
                                                    lineNumberStyle={{ minWidth: '2.5em', paddingRight: '1.2em', color: 'rgba(255,255,255,0.2)', textAlign: 'right', fontSize: '11px' }}
                                                >
                                                    {code}
                                                </SyntaxHighlighter>
                                            </div>
                                        </div>
                                    );
                                }
                            }
                            // Regular text - Render Markdown
                            return (
                                <div key={i} className="markdown-content">
                                    <ReactMarkdown
                                        remarkPlugins={[remarkGfm, remarkMath]}
                                        rehypePlugins={[rehypeKatex]}
                                        components={{
                                            p: ({ node, ...props }: any) => <p className={compactMarkdownParagraphClass} {...props} />,
                                            strong: ({ node, ...props }: any) => <strong className="font-extrabold text-white" {...props} />,
                                            em: ({ node, ...props }: any) => <em className="italic text-emerald-200/80" {...props} />,
                                            ul: ({ node, ...props }: any) => <ul className={compactMarkdownListClass} {...props} />,
                                            ol: ({ node, ...props }: any) => <ol className={compactMarkdownOrderedListClass} {...props} />,
                                            li: ({ node, ...props }: any) => <li className={compactMarkdownListItemClass} {...props} />,
                                        }}
                                    >
                                        {compactMarkdownText(part)}
                                    </ReactMarkdown>
                                </div>
                            );
                        })}
                    </div>
                </div>
            );
        }

        // Standard Text Messages (e.g. from User or Interviewer)
        // We still want basic markdown support here too
        return (
            <div className="markdown-content">
                <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                    components={{
                        p: ({ node, ...props }: any) => <p className="mb-1.5 last:mb-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]" {...props} />,
                        strong: ({ node, ...props }: any) => <strong className="font-extrabold text-white" {...props} />,
                        em: ({ node, ...props }: any) => <em className="italic opacity-90" {...props} />,
                        ul: ({ node, ...props }: any) => <ul className={compactMarkdownListClass} {...props} />,
                        ol: ({ node, ...props }: any) => <ol className={compactMarkdownOrderedListClass} {...props} />,
                        li: ({ node, ...props }: any) => <li className={compactMarkdownListItemClass} {...props} />,
                        code: ({ node, ...props }: any) => <code className={compactInlineCodeClass} {...props} />,
                        a: ({ node, ...props }: any) => <a className="underline hover:opacity-80" target="_blank" rel="noopener noreferrer" {...props} />,
                    }}
                >
                    {normalizedText}
                </ReactMarkdown>
            </div>
        );
    };


    // Keyboard Shortcuts

    // Keyboard Shortcuts
    // We use a ref to hold the latest handlers to avoid re-binding the event listener on every render
    const handlersRef = useRef({
        handleWhatToSay,
        handleFollowUp,
        handleFollowUpQuestions,
        handleRecap,
        handleAnswerNow
    });

    // Update ref on every render so the event listener always access latest state/props
    handlersRef.current = {
        handleWhatToSay,
        handleFollowUp,
        handleFollowUpQuestions,
        handleRecap,
        handleAnswerNow
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const { handleWhatToSay, handleFollowUp, handleFollowUpQuestions, handleRecap, handleAnswerNow } = handlersRef.current;

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                const activeElement = document.activeElement as HTMLElement | null;
                const focusedSegmentId = activeElement?.dataset?.transcriptSegmentId || focusedTranscriptSegmentIdRef.current;
                if (focusedSegmentId || dirtyTranscriptIdsRef.current.size > 0) {
                    e.preventDefault();
                    void (async () => {
                        if (focusedSegmentId) {
                            await persistTranscriptDraft(focusedSegmentId, { immediate: true, scheduleRagSync: true });
                            return;
                        }

                        await flushPendingTranscriptEdits({ syncRag: true });
                    })();
                    return;
                }
            }

            // Chat Shortcuts (Scope: Local to Chat/Overlay usually, but we allow them here if focused)
            if (isShortcutPressed(e, 'whatToAnswer')) {
                e.preventDefault();
                handleWhatToSay();
            } else if (isShortcutPressed(e, 'shorten')) {
                e.preventDefault();
                handleFollowUp('shorten');
            } else if (isShortcutPressed(e, 'followUp')) {
                e.preventDefault();
                handleFollowUpQuestions();
            } else if (isShortcutPressed(e, 'recap')) {
                e.preventDefault();
                handleRecap();
            } else if (isShortcutPressed(e, 'answer')) {
                e.preventDefault();
                handleAnswerNow();
            } else if (isShortcutPressed(e, 'scrollUp')) {
                e.preventDefault();
                conversationScrollRef.current?.scrollBy({ top: -100, behavior: 'smooth' });
            } else if (isShortcutPressed(e, 'scrollDown')) {
                e.preventDefault();
                conversationScrollRef.current?.scrollBy({ top: 100, behavior: 'smooth' });
            } else if (isShortcutPressed(e, 'moveWindowUp') || isShortcutPressed(e, 'moveWindowDown')) {
                // Prevent default scrolling when moving window
                e.preventDefault();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isShortcutPressed]);

    // General Global Shortcuts (Rebindable)
    // We listen here to handle them when the window is focused (renderer side)
    // Global shortcuts (when window blurred) are handled by Main process -> GlobalShortcuts
    // But Main process events might not reach here if we don't listen, or we want unified handling.
    // Actually, KeybindManager registers global shortcuts. If they are registered as global, 
    // Electron might consume them before they reach here?
    // 'toggle-app' is Global.

    const generalHandlersRef = useRef({
        processScreenshots: handleWhatToSay,
        resetCancel: async () => {
            if (isProcessing) {
                setIsProcessing(false);
            } else {
                await window.electronAPI.resetIntelligence();
                setMessages([]);
                setActiveRecommendationLane('primary');
                setWhatToAnswerState(createInitialWhatToAnswerState());
                legacyRefinementRequestIdsRef.current = {};
                setAttachedContext([]);
                setInputValue('');
            }
        },
        takeScreenshot: async () => {
            try {
                const data = await window.electronAPI.takeScreenshot();
                if (data && data.path) {
                    handleScreenshotAttach(data as { path: string; preview: string });
                }
            } catch (err) {
                console.error("Error triggering screenshot:", err);
            }
        },
        selectiveScreenshot: async () => {
            try {
                const data = await window.electronAPI.takeSelectiveScreenshot();
                if (data && !data.cancelled && data.path) {
                    handleScreenshotAttach(data as { path: string; preview: string });
                }
            } catch (err) {
                console.error("Error triggering selective screenshot:", err);
            }
        }
    });

    // Update ref
    generalHandlersRef.current = {
        processScreenshots: handleWhatToSay,
        resetCancel: async () => {
            if (isProcessing) {
                setIsProcessing(false);
            } else {
                await window.electronAPI.resetIntelligence();
                setMessages([]);
                setActiveRecommendationLane('primary');
                setWhatToAnswerState(createInitialWhatToAnswerState());
                legacyRefinementRequestIdsRef.current = {};
                setAttachedContext([]);
                setInputValue('');
            }
        },
        takeScreenshot: async () => {
            try {
                const data = await window.electronAPI.takeScreenshot();
                if (data && data.path) {
                    handleScreenshotAttach(data as { path: string; preview: string });
                }
            } catch (err) {
                console.error("Error triggering screenshot:", err);
            }
        },
        selectiveScreenshot: async () => {
            try {
                const data = await window.electronAPI.takeSelectiveScreenshot();
                if (data && !data.cancelled && data.path) {
                    handleScreenshotAttach(data as { path: string; preview: string });
                }
            } catch (err) {
                console.error("Error triggering selective screenshot:", err);
            }
        }
    };

    useEffect(() => {
        const handleGeneralKeyDown = (e: KeyboardEvent) => {
            const handlers = generalHandlersRef.current;
            const target = e.target as HTMLElement;
            const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

            if (isShortcutPressed(e, 'processScreenshots')) {
                if (!isInput) {
                    e.preventDefault();
                    handlers.processScreenshots();
                }
                // If input focused, let default behavior (Enter) happen or handle it via onKeyDown in Input
            } else if (isShortcutPressed(e, 'resetCancel')) {
                e.preventDefault();
                handlers.resetCancel();
            } else if (isShortcutPressed(e, 'takeScreenshot')) {
                e.preventDefault();
                handlers.takeScreenshot();
            } else if (isShortcutPressed(e, 'selectiveScreenshot')) {
                e.preventDefault();
                handlers.selectiveScreenshot();
            }
        };

        window.addEventListener('keydown', handleGeneralKeyDown);
        return () => window.removeEventListener('keydown', handleGeneralKeyDown);
    }, [isShortcutPressed]);

    const displayedLiveTranscriptSegments = liveTranscriptSegments
        .slice()
        .sort((left, right) => {
            if (left.timestamp !== right.timestamp) return left.timestamp - right.timestamp;
            return left.updatedAt - right.updatedAt;
        });
    const recordingUserTranscriptSegments = displayedLiveTranscriptSegments
        .filter((segment) => segment.speaker === 'user')
        .filter((segment) => manualRecordingStartAtRef.current === null || (segment.updatedAt || segment.timestamp) >= manualRecordingStartAtRef.current - 250);
    const conversationMessages: Message[] = [
        ...displayedLiveTranscriptSegments.map((segment) => ({
            id: segment.id,
            role: segment.speaker === 'user' ? 'user' : 'interviewer',
            text: segment.text,
            timestamp: segment.timestamp,
            isStreaming: segment.status === 'active',
            liveTranscriptSegmentId: segment.id,
            edited: segment.edited,
            transcriptStatus: segment.status,
        } as Message)),
        ...messages.filter((msg) => msg.role === 'user')
    ].sort((left, right) => (left.timestamp || 0) - (right.timestamp || 0));
    const displayedConversationMessages = conversationMessages;
    const recommendationMessages = messages.filter((msg) => msg.role === 'system');
    const primaryRecommendationMessages = recommendationMessages.filter((msg) => normalizeLane(msg.lane) === 'primary');
    const strongRecommendationMessages = recommendationMessages.filter((msg) => normalizeLane(msg.lane) === 'strong');
    const isOverlayMaximized = overlayWindowState?.isMaximized ?? false;
    const hasInterviewerTranscription = liveTranscriptSegments.some((segment) => segment.speaker === 'interviewer');
    const effectivePanelWidth = isOverlayMaximized
        ? overlayWindowState?.bounds?.width ?? panelSize.width
        : panelSize.width;
    const primaryLaneState = whatToAnswerState.primary;
    const strongLaneState = whatToAnswerState.strong;
    const hasOverlayContent =
        displayedConversationMessages.length > 0 ||
        recommendationMessages.length > 0 ||
        isManualRecording ||
        isProcessing;
    const activeLaneLabel = activeRecommendationLane === 'strong' ? '强模型答案' : '当前推荐';
    const shouldForceStrongCollapse = effectivePanelWidth < MIN_THREE_COLUMN_PANEL_WIDTH;
    const effectiveStrongPanelExpanded = strongPanelExpanded && !shouldForceStrongCollapse;
    const strongLaneHasContent = strongRecommendationMessages.length > 0;
    const shouldShowCurrentSttProvider = hasInterviewerTranscription && Boolean(currentSttProvider);
    const selectedTraceAction = traceActions.find(action => action.id === selectedTraceActionId) || traceActions[0] || null;
    const selectedTraceStep = selectedTraceAction?.steps.find(step => step.id === selectedTraceStepId)
        || selectedTraceAction?.steps[selectedTraceAction.steps.length - 1]
        || null;
    const strongLaneStatusCard = (() => {
        if (strongLaneState.status === 'started' || strongLaneState.status === 'streaming') {
            return {
                tone: 'border-cyan-400/20 bg-cyan-500/10 text-cyan-100',
                label: '生成中',
                description: '强模型答案正在并行生成。'
            };
        }

        if (strongLaneState.status === 'completed') {
            return {
                tone: 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100',
                label: '已完成',
                description: strongLaneHasContent
                    ? '强模型答案已生成完成，可直接对比。'
                    : (strongLaneState.message || '强模型请求已完成，但当前没有可显示的答案内容。')
            };
        }

        if (strongLaneState.status === 'skipped') {
            return {
                tone: 'border-amber-400/20 bg-amber-500/10 text-amber-100',
                label: '已跳过',
                description: strongLaneState.message || '主推荐通道已经使用了当前默认强模型。'
            };
        }

        if (strongLaneState.status === 'error') {
            return {
                tone: 'border-red-400/20 bg-red-500/10 text-red-100',
                label: '错误',
                description: strongLaneState.message || '强模型通道未能为这次请求生成答案。'
            };
        }

        return {
            tone: 'border-white/10 bg-white/[0.03] text-slate-200',
            label: '就绪',
            description: shouldForceStrongCollapse
                ? '当前窗口较窄且 Trace 已展开，所以强模型通道会暂时折叠。'
                : '展开这里即可对比当前推荐和默认强模型答案。'
        };
    })();

    const formatTraceTimestamp = (value?: string) => {
        if (!value) return '--';
        return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    const formatTraceDuration = (value?: number) => {
        if (typeof value !== 'number' || Number.isNaN(value)) return '--';
        if (value < 1000) return `${value}ms`;
        return `${(value / 1000).toFixed(2)}s`;
    };

    const compareProviders = sttCompareResults?.providers || [];
    const funAsrDescriptor = compareProviders.find((provider) => provider.id === FUN_ASR_PROVIDER_ID) || null;
    const primaryCompareProviderId = sttCompareResults?.primaryProviderId || currentSttProvider || null;
    const primaryCompareDescriptor = compareProviders.find((provider) => provider.id === primaryCompareProviderId) || null;
    const recentCompareUtterances = (sttCompareResults?.utterances || [])
        .filter((utterance) => {
            const primaryResult = primaryCompareProviderId ? utterance.providerResults[primaryCompareProviderId] : null;
            const funAsrResult = utterance.providerResults[FUN_ASR_PROVIDER_ID];
            return Boolean(primaryResult || funAsrResult);
        })
        .slice(-10)
        .reverse();
    const showFunAsrCompareBadge = Boolean(sttCompareResults?.active && funAsrDescriptor?.available);
    const canOpenFunAsrCompare = Boolean(funAsrDescriptor?.available);

    const renderCompareResultCard = (
        title: string,
        result: SttCompareProviderResultView | undefined,
        toneClassName: string
    ) => {
        const displayText = result?.finalText?.trim() || result?.partialText?.trim() || '';
        const statusLabel = result?.finalText?.trim()
            ? '最终'
            : result?.partialText?.trim()
                ? '实时'
                : '等待中';

        return (
            <div className={`rounded-[16px] border px-3 py-3 ${toneClassName}`}>
                <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-200">{title}</div>
                    <span className="rounded-full border border-white/10 bg-black/25 px-2 py-1 text-[9px] uppercase tracking-[0.16em] text-slate-300">
                        {statusLabel}
                    </span>
                </div>
                <div className="min-h-[72px] whitespace-pre-wrap text-[13px] leading-6 text-slate-100">
                    {displayText || <span className="text-slate-500">还没有转写内容。</span>}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-slate-500">
                    <span>首包：{formatCompareLatency(result?.firstPartialLatencyMs)}</span>
                    <span>最终稿：{formatCompareLatency(result?.finalLatencyMs)}</span>
                    {result?.termHits?.length ? (
                        <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-1 text-emerald-200">
                            热词：{result.termHits.slice(0, 3).join(', ')}
                        </span>
                    ) : null}
                    {result?.errors?.[0] ? (
                        <span className="rounded-full border border-red-400/20 bg-red-500/10 px-2 py-1 text-red-200">
                            {result.errors[0]}
                        </span>
                    ) : null}
                </div>
            </div>
        );
    };

    const renderFunAsrComparePanel = () => (
        <AnimatePresence>
            {isFunAsrCompareOpen && (
                <motion.aside
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 28 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    className="no-drag absolute inset-y-4 right-4 z-40 flex w-[380px] max-w-[calc(100%-32px)] flex-col overflow-hidden rounded-[22px] border border-cyan-400/20 bg-[#121212]/96 shadow-2xl shadow-black/45 backdrop-blur-xl"
                >
                    <div className="border-b border-white/[0.08] px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
                                    <Mic className="h-3.5 w-3.5" />
                                    <span>Fun-ASR 对比</span>
                                </div>
                                <p className="mt-1 text-xs text-slate-500">
                                    实时对比 {primaryCompareDescriptor?.label || formatSttProviderLabel(primaryCompareProviderId)} 和 Fun-ASR 的转写结果。
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => void closeFunAsrComparePanel()}
                                className="rounded-full border border-white/10 bg-black/30 p-1.5 text-slate-400 transition-colors hover:border-white/20 hover:bg-black/50 hover:text-white"
                                title="关闭 Fun-ASR 对比"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.16em]">
                            <span className={`rounded-full border px-2.5 py-1 ${sttCompareResults?.active ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200' : 'border-white/10 bg-white/[0.04] text-slate-400'}`}>
                                {sttCompareResults?.active ? '对比进行中' : '对比未启动'}
                            </span>
                            <span className={`rounded-full border px-2.5 py-1 ${isConnected ? 'border-cyan-400/20 bg-cyan-500/10 text-cyan-100' : 'border-white/10 bg-white/[0.04] text-slate-400'}`}>
                                {isConnected ? '会议音频已连接' : '会议未连接'}
                            </span>
                            {meetingGlossaryConfig?.funAsrVocabularyId ? (
                                <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-2.5 py-1 text-amber-100">
                                    热词已同步
                                </span>
                            ) : null}
                        </div>
                        {funAsrDescriptor && !funAsrDescriptor.available && (
                            <div className="mt-3 rounded-[14px] border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-100">
                                {funAsrDescriptor.reason || '运行 Fun-ASR 对比前，需要先配置阿里云 STT API 密钥。'}
                            </div>
                        )}
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4" style={{ scrollbarWidth: 'thin', overscrollBehavior: 'contain' }}>
                        <div className="space-y-4">
                            <div className="rounded-[18px] border border-white/[0.08] bg-white/[0.03] p-3">
                                <div className="mb-2 flex items-center justify-between gap-2">
                                    <div>
                                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">热词表</div>
                                        <p className="mt-1 text-xs text-slate-500">面试过程中可直接编辑，修改会从下一句开始生效。</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => void handleSaveMeetingGlossary()}
                                        disabled={meetingGlossarySaving}
                                        className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${meetingGlossarySaved ? 'bg-emerald-500/20 text-emerald-300' : 'border border-white/10 bg-black/25 text-slate-200 hover:border-white/20 hover:bg-black/45'} ${meetingGlossarySaving ? 'cursor-wait opacity-80' : ''}`}
                                    >
                                        {meetingGlossarySaving ? '保存中...' : meetingGlossarySaved ? '已保存' : '保存'}
                                    </button>
                                </div>
                                <textarea
                                    value={meetingGlossaryText}
                                    onChange={(event) => setMeetingGlossaryText(event.target.value)}
                                    rows={6}
                                    className="min-h-[124px] w-full rounded-[14px] border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-500 focus:border-cyan-400/30"
                                    placeholder={'agent | 5\ntool calling | 5\nMCP | 5\nRAG | 5'}
                                />
                                {meetingGlossaryMessage && (
                                    <div className={`mt-2 rounded-[12px] border px-3 py-2 text-xs leading-5 ${meetingGlossaryMessageTone === 'error'
                                        ? 'border-red-400/20 bg-red-500/10 text-red-200'
                                        : meetingGlossaryMessageTone === 'warning'
                                            ? 'border-amber-400/25 bg-amber-500/10 text-amber-100'
                                            : 'border-cyan-400/20 bg-cyan-500/10 text-cyan-100'}`}>
                                        {meetingGlossaryMessage}
                                    </div>
                                )}
                            </div>

                            <div className="rounded-[18px] border border-white/[0.08] bg-white/[0.03] p-3">
                                <div className="flex items-center justify-between gap-2">
                                    <div>
                                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">实时对比</div>
                                        <p className="mt-1 text-xs text-slate-500">
                                            同一份音频、同一份热词表，对比不同实时模型的表现。
                                        </p>
                                    </div>
                                    <span className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
                                        {sttCompareResults?.summary?.totalUtterances || 0} 条话语
                                    </span>
                                </div>
                            </div>

                            {recentCompareUtterances.length > 0 ? recentCompareUtterances.map((utterance) => {
                                const primaryResult = primaryCompareProviderId ? utterance.providerResults[primaryCompareProviderId] : undefined;
                                const funAsrResult = utterance.providerResults[FUN_ASR_PROVIDER_ID];

                                return (
                                    <div key={utterance.id} className="rounded-[18px] border border-white/[0.08] bg-black/20 p-3">
                                        <div className="mb-3 flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                                                <span>{utterance.speaker === 'user' ? '候选人' : '面试官'}</span>
                                                <span className="h-1 w-1 rounded-full bg-white/20" />
                                                <span>{formatCompareTimestamp(utterance.endedAt || utterance.startedAt)}</span>
                                            </div>
                                            <span className="rounded-full border border-white/10 bg-black/25 px-2 py-1 text-[9px] uppercase tracking-[0.16em] text-slate-400">
                                                {utterance.audioChunkCount} 个分片
                                            </span>
                                        </div>
                                        <div className="space-y-3">
                                            {renderCompareResultCard(
                                                primaryCompareDescriptor?.label || formatSttProviderLabel(primaryCompareProviderId) || '当前主模型',
                                                primaryResult,
                                                'border-white/10 bg-white/[0.03]'
                                            )}
                                            {renderCompareResultCard(
                                                funAsrDescriptor?.label || 'Fun-ASR 实时版',
                                                funAsrResult,
                                                'border-cyan-400/20 bg-cyan-500/[0.08]'
                                            )}
                                        </div>
                                    </div>
                                );
                            }) : (
                                <div className="rounded-[18px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-sm leading-6 text-slate-500">
                                    {canOpenFunAsrCompare
                                        ? '在实时面试中打开这个面板，就能并排查看当前主模型和 Fun-ASR 的实时转写。'
                                        : '请先配置阿里云 STT API 密钥，再重新打开这个面板来运行 Fun-ASR 对比。'}
                                </div>
                            )}
                        </div>
                    </div>
                </motion.aside>
            )}
        </AnimatePresence>
    );

    const resolveTracePaneValue = (tab: TraceDetailTab) => {
        if (tab === 'resolved_input') {
            if (!selectedTraceAction?.resolvedInput) return '当前还没有记录到解析后的输入。';
            return selectedTraceAction.resolvedInput;
        }

        if (!selectedTraceStep) {
            return tab === 'request' ? '当前还没有选中的步骤。' : '当前还没有记录到响应内容。';
        }

        if (tab === 'request') {
            const payload = {
                url: selectedTraceStep.url,
                method: selectedTraceStep.method,
                provider: selectedTraceStep.provider,
                model: selectedTraceStep.model,
                lane: selectedTraceStep.lane,
                headers: parseTraceJson(selectedTraceStep.requestHeaders),
                body: parseTraceJson(selectedTraceStep.requestBody || ''),
            };
            return payload;
        }

        return {
            status: selectedTraceStep.responseStatus,
            durationMs: selectedTraceStep.durationMs,
            error: selectedTraceStep.error,
            headers: parseTraceJson(selectedTraceStep.responseHeaders),
            body: parseTraceJson(selectedTraceStep.responseBody || ''),
        };
    };

    const renderTraceValue = (value: unknown, depth: number = 0, path: string = 'root'): React.ReactNode => {
        const indentStyle = { paddingLeft: `${depth * 14}px` };

        if (value === null) {
            return <span className="text-slate-500">null</span>;
        }

        if (typeof value === 'undefined') {
            return <span className="text-slate-500">undefined</span>;
        }

        if (typeof value === 'string') {
            return (
                <div className="min-w-0 whitespace-pre-wrap break-words text-emerald-100">
                    &quot;{normalizeTraceStringForDisplay(value)}&quot;
                </div>
            );
        }

        if (typeof value === 'number' || typeof value === 'boolean') {
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

        if (typeof value === 'object') {
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

    const renderConversationDocumentBlock = (msg: Message) => {
        const isUserMessage = msg.role === 'user';
        const segmentId = msg.liveTranscriptSegmentId;
        const isEditableLiveTranscript = Boolean(segmentId);
        const currentDraft = segmentId ? (transcriptDrafts[segmentId] ?? msg.text) : msg.text;
        const saveState = segmentId ? (transcriptSaveStates[segmentId] || 'idle') : 'idle';
        const hasUnsavedDraft = Boolean(
            segmentId &&
            normalizeTranscriptForComparison(currentDraft) !== normalizeTranscriptForComparison(msg.text)
        );

        return (
            <div key={msg.id} className="border-b border-white/[0.06] py-4 last:border-b-0">
                <div className={`rounded-[16px] border-l-2 px-4 py-2 ${isUserMessage ? 'border-emerald-400/35' : 'border-slate-400/20'}`}>
                    <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        <span>{isUserMessage ? '我' : '面试官'}</span>
                        {msg.isStreaming && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                        {msg.transcriptStatus === 'active' && (
                            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-1.5 py-0.5 text-[9px] tracking-[0.12em] text-emerald-200">
                                实时
                            </span>
                        )}
                        {msg.edited && (
                            <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-1.5 py-0.5 text-[9px] tracking-[0.12em] text-amber-200">
                                已编辑
                            </span>
                        )}
                        {hasUnsavedDraft && (
                            <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-1.5 py-0.5 text-[9px] tracking-[0.12em] text-sky-200">
                                待保存
                            </span>
                        )}
                        {saveState === 'saving' && (
                            <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-1.5 py-0.5 text-[9px] tracking-[0.12em] text-cyan-200">
                                保存中
                            </span>
                        )}
                        {saveState === 'saved' && (
                            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-1.5 py-0.5 text-[9px] tracking-[0.12em] text-emerald-200">
                                已保存
                            </span>
                        )}
                        {saveState === 'error' && (
                            <span className="rounded-full border border-red-400/20 bg-red-400/10 px-1.5 py-0.5 text-[9px] tracking-[0.12em] text-red-200">
                                保存失败
                            </span>
                        )}
                        {msg.hasScreenshot && <Image className="h-3 w-3 text-slate-400/80" />}
                    </div>

                    {msg.hasScreenshot && msg.screenshotPreview && (
                        <img
                            src={msg.screenshotPreview}
                            alt="已附加截图"
                            className="mb-3 max-h-24 rounded-xl border border-white/10 object-cover"
                        />
                    )}

                    {isEditableLiveTranscript && segmentId ? (
                        <textarea
                            ref={registerTranscriptTextarea(segmentId)}
                            data-transcript-segment-id={segmentId}
                            rows={1}
                            value={currentDraft}
                            spellCheck={false}
                            onFocus={() => {
                                captureTranscriptSelection(segmentId, transcriptTextareaRefs.current.get(segmentId) || null);
                            }}
                            onClick={(event) => captureTranscriptSelection(segmentId, event.currentTarget)}
                            onSelect={(event) => captureTranscriptSelection(segmentId, event.currentTarget)}
                            onChange={(event) => {
                                updateTranscriptDraft(segmentId, event.target.value);
                                dirtyTranscriptIdsRef.current.add(segmentId);
                                captureTranscriptSelection(segmentId, event.currentTarget);
                                autoSizeTranscriptTextarea(event.currentTarget);
                                scheduleTranscriptDraftSave(segmentId);
                            }}
                            onKeyDown={(event) => {
                                captureTranscriptSelection(segmentId, event.currentTarget);
                                if (
                                    event.key === 'Backspace' &&
                                    !event.metaKey &&
                                    !event.ctrlKey &&
                                    !event.altKey &&
                                    !event.shiftKey &&
                                    event.currentTarget.selectionStart === 0 &&
                                    event.currentTarget.selectionEnd === 0 &&
                                    canMergeTranscriptSegmentWithPrevious(segmentId)
                                ) {
                                    event.preventDefault();
                                    void mergeTranscriptSegmentWithPrevious(segmentId);
                                }
                            }}
                            onKeyUp={(event) => captureTranscriptSelection(segmentId, event.currentTarget)}
                            onBlur={() => {
                                if (focusedTranscriptSegmentIdRef.current === segmentId) {
                                    clearFocusedTranscriptSelection();
                                }
                                void persistTranscriptDraft(segmentId, { immediate: true, scheduleRagSync: true });
                            }}
                            className="min-h-[32px] w-full resize-none overflow-hidden bg-transparent p-0 text-[13px] leading-7 text-slate-100 outline-none placeholder:text-slate-500"
                        />
                    ) : (
                        <div className="text-[13px] leading-7 text-slate-100">
                            {renderMessageText(msg)}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const getRecommendationMeta = (msg: Message) => {
        if (msg.text.startsWith('Error:') || msg.text.startsWith('错误：') || msg.text.startsWith('❌')) {
            return {
                title: '错误',
                accent: 'text-rose-300',
                icon: <X className="h-3.5 w-3.5" />
            };
        }

        switch (msg.intent) {
            case 'what_to_answer':
                return {
                    title: msg.isStreaming ? '答案生成中' : '推荐答案',
                    accent: 'text-emerald-300',
                    icon: <Pencil className="h-3.5 w-3.5" />
                };
            case 'shorten':
                return {
                    title: '精简版',
                    accent: 'text-cyan-300',
                    icon: <MessageSquare className="h-3.5 w-3.5" />
                };
            case 'recap':
                return {
                    title: '总结',
                    accent: 'text-indigo-300',
                    icon: <RefreshCw className="h-3.5 w-3.5" />
                };
            case 'follow_up_questions':
                return {
                    title: '追问建议',
                    accent: 'text-amber-300',
                    icon: <HelpCircle className="h-3.5 w-3.5" />
                };
            default:
                return {
                    title: msg.isStreaming ? '生成中' : '推荐答案',
                    accent: 'text-emerald-300',
                    icon: <Sparkles className="h-3.5 w-3.5" />
                };
        }
    };

    const renderRecommendationContent = (msg: Message) => (
        <div className="markdown-content text-[13px] leading-6 text-slate-100 break-words [overflow-wrap:anywhere]">
            <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={{
                    p: ({ node, ...props }: any) => <p className={compactMarkdownParagraphClass} {...props} />,
                    strong: ({ node, ...props }: any) => <strong className="font-extrabold text-white" {...props} />,
                    em: ({ node, ...props }: any) => <em className="italic text-emerald-100/85" {...props} />,
                    ul: ({ node, ...props }: any) => <ul className={compactMarkdownListClass} {...props} />,
                    ol: ({ node, ...props }: any) => <ol className={compactMarkdownOrderedListClass} {...props} />,
                    li: ({ node, ...props }: any) => <li className={compactMarkdownListItemClass} {...props} />,
                    blockquote: ({ node, ...props }: any) => <blockquote className="my-2 border-l-2 border-emerald-400/30 pl-3 text-slate-300/90" {...props} />,
                    pre: ({ node, ...props }: any) => <div className="my-2 overflow-hidden rounded-xl border border-white/[0.08] bg-zinc-800/60" {...props} />,
                    code: ({ inline, className, children, ...props }: any) => {
                        const languageMatch = /language-(\w+)/.exec(className || '');
                        const code = String(children).replace(/\n$/, '');

                        if (!inline) {
                            return (
                                <SyntaxHighlighter
                                    language={languageMatch?.[1] || 'text'}
                                    style={vscDarkPlus}
                                    customStyle={{
                                        margin: 0,
                                        borderRadius: 0,
                                        fontSize: '12px',
                                        lineHeight: '1.55',
                                        background: 'transparent',
                                        padding: '14px',
                                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
                                    }}
                                    wrapLongLines={true}
                                >
                                    {code}
                                </SyntaxHighlighter>
                            );
                        }

                        return (
                            <code className={`${compactInlineCodeClass} text-emerald-100`} {...props}>
                                {children}
                            </code>
                        );
                    },
                    a: ({ node, ...props }: any) => <a className="underline underline-offset-2 hover:opacity-80" target="_blank" rel="noopener noreferrer" {...props} />,
                }}
            >
                {compactMarkdownText(msg.text)}
            </ReactMarkdown>
        </div>
    );

    const renderRecommendationBubble = (msg: Message) => {
        const meta = getRecommendationMeta(msg);
        const lane = normalizeLane(msg.lane);
        const isSelectedLane = lane === activeRecommendationLane;

        return (
            <div
                key={msg.id}
                role="button"
                tabIndex={0}
                onClick={() => setActiveRecommendationLane(lane)}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setActiveRecommendationLane(lane);
                    }
                }}
                className={[
                    'group relative w-full rounded-[22px] border bg-white/[0.04] px-4 py-3 text-left shadow-[0_10px_35px_rgba(0,0,0,0.16)] transition-colors',
                    isSelectedLane
                        ? 'border-emerald-400/35 ring-1 ring-emerald-400/20'
                        : 'border-white/[0.08] hover:border-white/15'
                ].join(' ')}
            >
                <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <div className={`flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] ${meta.accent}`}>
                            {meta.icon}
                            <span>{meta.title}</span>
                        </div>
                        {(msg.modelLabel || msg.modelId || lane === 'strong') && (
                            <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-slate-500">
                                {msg.modelLabel || msg.modelId || (lane === 'strong' ? 'Current default model' : 'Current route')}
                            </div>
                        )}
                    </div>
                    {!msg.isStreaming && (
                        <button
                            onClick={(event) => {
                                event.stopPropagation();
                                handleCopy(msg.text);
                            }}
                            className="rounded-md bg-black/35 p-1.5 text-slate-400 opacity-0 transition-opacity hover:bg-black/60 hover:text-white group-hover:opacity-100"
                        >
                            <Copy className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>
                {renderRecommendationContent(msg)}
            </div>
        );
    };

    return (
        <div
            ref={contentRef}
            style={isOverlayMaximized ? { width: '100vw', height: '100vh' } : { width: panelSize.width, height: panelSize.height }}
            className="mx-auto flex min-h-0 flex-col items-center gap-2 bg-transparent font-sans text-slate-200"
        >
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.95 }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                        className="flex h-full w-full flex-col items-center gap-2"
                    >
                        <TopPill
                            expanded={isExpanded}
                            isMaximized={isOverlayMaximized}
                            onToggle={() => setIsExpanded(!isExpanded)}
                            onToggleMaximize={() => void toggleOverlayMaximize()}
                            onQuit={() => onEndMeeting ? onEndMeeting() : window.electronAPI.quitApp()}
                        />

                        <div className="draggable-area relative flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-[24px] border border-white/10 bg-[#1E1E1E]/95 shadow-2xl shadow-black/40 backdrop-blur-2xl">
                            <div className="min-h-0 flex-1 overflow-hidden px-4 pb-4 pt-4">
                                {hasOverlayContent ? (
                                    <div className="flex h-full min-h-0 gap-4">
                                        <section className="relative flex h-full min-h-0 min-w-0 flex-[1.15] flex-col overflow-hidden rounded-[22px] border border-white/[0.08] bg-black/15">
                                            <div className="border-b border-white/[0.08] px-4 py-3">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                                                        <MessageSquare className="h-3.5 w-3.5" />
                                                        <span>对话</span>
                                                    </div>
                                                    <div className="flex flex-col items-end gap-1">
                                                        {shouldShowCurrentSttProvider && (
                                                            <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-200">
                                                                <Mic className="h-3 w-3" />
                                                                <span>STT · {formatSttProviderLabel(currentSttProvider)}</span>
                                                            </div>
                                                        )}
                                                        <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
                                                            自动保存 · Ctrl/Cmd+S
                                                        </div>
                                                    </div>
                                                </div>
                                                <p className="mt-1 text-xs text-slate-500">面试官提问和你的回答会一起显示在这里。</p>
                                            </div>

                                            <div
                                                ref={conversationScrollRef}
                                                onPointerDownCapture={handleConversationPointerDownCapture}
                                                onScroll={handleConversationScroll}
                                                className="min-h-0 flex-1 overflow-y-auto px-4 py-4 no-drag"
                                                style={{ scrollbarWidth: 'thin', overscrollBehavior: 'contain', overflowAnchor: 'none' }}
                                            >
                                                <div className="space-y-0">
                                                    {displayedConversationMessages.length === 0 && !isManualRecording ? (
                                                        <div className="rounded-[18px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-sm leading-6 text-slate-500">
                                                            面试官或你的麦克风一旦产出转写，这里就会开始显示完整对话。
                                                        </div>
                                                    ) : (
                                                        displayedConversationMessages.map(renderConversationDocumentBlock)
                                                    )}

                                                    {isManualRecording && recordingUserTranscriptSegments.length === 0 && (
                                                        <div className="border-b border-white/[0.06] py-4 last:border-b-0">
                                                            <div className="rounded-[16px] border-l-2 border-emerald-400/35 px-4 py-2">
                                                                <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300/80">
                                                                    <Mic className="h-3.5 w-3.5" />
                                                                    <span>语音输入</span>
                                                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                                                </div>
                                                                <div className="flex items-center gap-1.5 py-1 text-[13px] leading-7 text-emerald-100/80">
                                                                    <div className="h-2 w-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                                                                    <div className="h-2 w-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                                                                    <div className="h-2 w-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                                                                    <span className="ml-1 text-[11px] uppercase tracking-[0.18em]">监听中</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}

                                                    <div ref={interviewerMessagesEndRef} />
                                                </div>
                                            </div>

                                            {showConversationScrollToBottom && (
                                                <button
                                                    onClick={() => scrollConversationToBottom('smooth')}
                                                    className="absolute bottom-4 right-4 z-10 flex items-center gap-1.5 rounded-full border border-white/10 bg-black/65 px-3 py-1.5 text-[11px] font-medium text-slate-200 shadow-lg shadow-black/30 transition-all hover:border-white/20 hover:bg-black/80 hover:text-white"
                                                >
                                                    <ChevronDown className="h-3.5 w-3.5" />
                                                    <span>最新</span>
                                                </button>
                                            )}
                                        </section>

                                        <section className={`relative flex h-full min-h-0 min-w-[340px] flex-[0.92] flex-col overflow-hidden rounded-[22px] border bg-black/15 ${activeRecommendationLane === 'primary' ? 'border-emerald-400/25 ring-1 ring-emerald-400/10' : 'border-white/[0.08]'}`}>
                                            <div className="border-b border-white/[0.08] px-4 py-3">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div>
                                                        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300/90">
                                                            <Sparkles className="h-3.5 w-3.5" />
                                                            <span>LLM 推荐</span>
                                                        </div>
                                                        <p className="mt-1 text-xs text-slate-500">快速返回的当前推荐通道。</p>
                                                    </div>
                                                    {activeRecommendationLane === 'primary' && (
                                                        <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
                                                            当前目标
                                                        </span>
                                                    )}
                                                </div>
                                                {(primaryLaneState.modelLabel || primaryLaneState.modelId) && (
                                                    <div className="mt-2 text-[10px] uppercase tracking-[0.16em] text-slate-500">
                                                        {primaryLaneState.modelLabel || primaryLaneState.modelId}
                                                    </div>
                                                )}
                                            </div>

                                            <div
                                                ref={recommendationScrollRef}
                                                onScroll={handleRecommendationScroll}
                                                className="min-h-0 flex-1 overflow-y-auto px-4 py-4 no-drag"
                                                style={{ scrollbarWidth: 'thin', overscrollBehavior: 'contain' }}
                                            >
                                                <div className="space-y-3">
                                                    {primaryRecommendationMessages.length === 0 && !(isProcessing || primaryLaneState.status === 'started' || primaryLaneState.status === 'streaming') ? (
                                                        <div className="rounded-[18px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-sm leading-6 text-slate-500">
                                                            点击“怎么回答”后，主推荐答案会显示在这里。
                                                        </div>
                                                    ) : (
                                                        primaryRecommendationMessages.map(renderRecommendationBubble)
                                                    )}

                                                    {(isProcessing || primaryLaneState.status === 'started' || primaryLaneState.status === 'streaming') && primaryRecommendationMessages.length === 0 && (
                                                        <div className="rounded-[18px] border border-white/[0.08] bg-white/[0.03] px-4 py-4">
                                                            <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300/80">
                                                                <Sparkles className="h-3.5 w-3.5" />
                                                                <span>生成中</span>
                                                            </div>
                                                            <div className="flex gap-1.5">
                                                                <div className="h-2 w-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                                                                <div className="h-2 w-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                                                                <div className="h-2 w-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                                                            </div>
                                                        </div>
                                                    )}

                                                    <div ref={messagesEndRef} />
                                                </div>
                                            </div>

                                            {showRecommendationScrollToBottom && (
                                                <button
                                                    onClick={() => scrollRecommendationToBottom('smooth')}
                                                    className="absolute bottom-4 right-4 z-10 flex items-center gap-1.5 rounded-full border border-white/10 bg-black/65 px-3 py-1.5 text-[11px] font-medium text-slate-200 shadow-lg shadow-black/30 transition-all hover:border-white/20 hover:bg-black/80 hover:text-white"
                                                >
                                                    <ChevronDown className="h-3.5 w-3.5" />
                                                    <span>最新</span>
                                                </button>
                                            )}
                                        </section>

                                        {effectiveStrongPanelExpanded ? (
                                            <section className={`relative flex h-full min-h-0 min-w-[320px] flex-[0.84] flex-col overflow-hidden rounded-[22px] border bg-black/15 no-drag ${activeRecommendationLane === 'strong' ? 'border-cyan-400/25 ring-1 ring-cyan-400/10' : 'border-white/[0.08]'}`}>
                                                <div className="border-b border-white/[0.08] px-4 py-3">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div>
                                                            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300/90">
                                                                <Sparkles className="h-3.5 w-3.5" />
                                                                <span>强模型答案</span>
                                                            </div>
                                                            <p className="mt-1 text-xs text-slate-500">
                                                                默认强模型通道的常驻区域。
                                                            </p>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            {activeRecommendationLane === 'strong' && (
                                                                <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100">
                                                                    当前目标
                                                                </span>
                                                            )}
                                                            <button
                                                                type="button"
                                                                onClick={() => setStrongPanelExpanded(false)}
                                                                className="rounded-full border border-white/10 bg-black/30 p-1.5 text-slate-400 transition-colors hover:border-white/20 hover:bg-black/50 hover:text-white"
                                                                title="收起强模型面板"
                                                            >
                                                                <ChevronRight className="h-3.5 w-3.5" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                    {(strongLaneState.modelLabel || strongLaneState.modelId) && (
                                                        <div className="mt-2 text-[10px] uppercase tracking-[0.16em] text-slate-500">
                                                            {strongLaneState.modelLabel || strongLaneState.modelId}
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 no-drag" style={{ scrollbarWidth: 'thin', overscrollBehavior: 'contain' }}>
                                                    <div className="space-y-3">
                                                        <div className={`rounded-[18px] border px-4 py-4 ${strongLaneStatusCard.tone}`}>
                                                            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em]">
                                                                {strongLaneStatusCard.label}
                                                            </div>
                                                            <div className="text-sm leading-6">
                                                                {strongLaneStatusCard.description}
                                                            </div>
                                                        </div>

                                                        {strongRecommendationMessages.map(renderRecommendationBubble)}
                                                    </div>
                                                </div>
                                            </section>
                                        ) : (
                                            <div className={`flex h-full w-12 flex-col overflow-hidden rounded-[22px] border bg-black/15 no-drag ${shouldForceStrongCollapse ? 'border-cyan-400/20' : 'border-white/[0.08]'}`}>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (!shouldForceStrongCollapse) {
                                                            setStrongPanelExpanded(true);
                                                        }
                                                    }}
                                                    disabled={shouldForceStrongCollapse}
                                                    className={`flex h-full flex-col items-center justify-center gap-3 transition-colors ${shouldForceStrongCollapse ? 'cursor-not-allowed text-slate-600' : 'text-slate-400 hover:bg-white/[0.03] hover:text-white'}`}
                                                    title={shouldForceStrongCollapse ? '请先拉宽窗口，再展开强模型通道。' : '展开强模型答案面板'}
                                                >
                                                    <ChevronLeft className="h-4 w-4" />
                                                    <span className="-rotate-90 whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.18em]">
                                                        强模型
                                                    </span>
                                                </button>
                                            </div>
                                        )}

                                        {false && (traceDrawerOpen ? (
                                            <section className="relative flex h-full min-h-0 min-w-[360px] flex-[0.96] flex-col overflow-hidden rounded-[22px] border border-cyan-400/20 bg-black/15 no-drag">
                                                <div className="border-b border-white/[0.08] px-4 py-3">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
                                                                <Code className="h-3.5 w-3.5" />
                                                                <span>调用链</span>
                                                                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] tracking-[0.12em] text-slate-400">
                                                                    {traceActions.length}
                                                                </span>
                                                            </div>
                                                            <p className="mt-1 text-xs text-slate-500">
                                                                展示每次面试动作对应的原始请求、响应和解析后输入。
                                                            </p>
                                                            {traceInfo && (
                                                                <div className="mt-2 text-[10px] uppercase tracking-[0.16em] text-slate-500">
                                                                    会话 {traceInfo?.sessionId.slice(-6)}
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
                                                            <button
                                                                type="button"
                                                                onClick={() => setTraceDrawerOpen(false)}
                                                                className="rounded-full border border-white/10 bg-black/30 p-1.5 text-slate-400 transition-colors hover:border-white/20 hover:bg-black/50 hover:text-white"
                                                                title="收起调用链面板"
                                                            >
                                                                <ChevronRight className="h-3.5 w-3.5" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="grid min-h-0 flex-1 grid-cols-[240px_minmax(0,1fr)]">
                                                    <div className="min-h-0 overflow-y-auto border-r border-white/[0.08] p-3 no-drag" style={{ scrollbarWidth: 'thin', overscrollBehavior: 'contain' }}>
                                                        <div className="space-y-2">
                                                            {isTraceLoading ? (
                                                                <div className="rounded-[16px] border border-white/10 bg-white/[0.03] px-3 py-4 text-xs text-slate-400">
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
                                                                        className={`w-full rounded-[16px] border px-3 py-3 text-left transition-colors ${selectedTraceAction?.id === action.id
                                                                            ? 'border-emerald-400/25 bg-emerald-500/10'
                                                                            : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]'}`}
                                                                    >
                                                                        <div className="mb-2 flex items-center justify-between gap-2">
                                                                            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                                                                {action.label}
                                                                            </span>
                                                                            <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] ${action.status === 'error'
                                                                                ? 'bg-red-500/10 text-red-300'
                                                                                : action.status === 'completed'
                                                                                    ? 'bg-emerald-500/10 text-emerald-300'
                                                                                    : 'bg-amber-500/10 text-amber-300'}`}>
                                                                                {formatTraceStatusLabel(action.status)}
                                                                            </span>
                                                                        </div>
                                                                        <div className="text-xs text-slate-200 line-clamp-2">
                                                                            {formatTraceActionTypeLabel(action.type)}
                                                                        </div>
                                                                        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                                                                            <span>{formatTraceTimestamp(action.startedAt)}</span>
                                                                            <span>{action.steps.length} 个步骤</span>
                                                                        </div>
                                                                    </button>
                                                                ))
                                                            ) : (
                                                                    <div className="rounded-[16px] border border-dashed border-white/10 bg-white/[0.02] px-3 py-4 text-xs leading-5 text-slate-500">
                                                                    暂时还没有调用链记录。触发“怎么回答”“作答”“总结”等面试动作后，这里会自动出现内容。
                                                                    </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="flex min-h-0 min-w-0 flex-col">
                                                        {selectedTraceAction ? (
                                                            <>
                                                                <div className="border-b border-white/[0.08] px-4 py-3">
                                                                    <div className="flex items-center justify-between gap-3">
                                                                        <div className="min-w-0">
                                                                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                                                                                {selectedTraceAction.label}
                                                                            </div>
                                                                            <div className="mt-1 text-xs text-slate-500">
                                                                                {selectedTraceAction.requestId ? `请求 ID：${selectedTraceAction.requestId}` : formatTraceActionTypeLabel(selectedTraceAction.type)}
                                                                            </div>
                                                                        </div>
                                                                        <div className="text-right text-[11px] text-slate-500">
                                                                            <div>{formatTraceTimestamp(selectedTraceAction.startedAt)}</div>
                                                                            <div>{selectedTraceAction.endedAt ? formatTraceTimestamp(selectedTraceAction.endedAt) : '运行中'}</div>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                <div className="no-drag flex gap-2 overflow-x-auto border-b border-white/[0.08] px-4 py-3" style={{ scrollbarWidth: 'thin' }}>
                                                                    {selectedTraceAction.steps.length > 0 ? selectedTraceAction.steps.map((step) => (
                                                                        <button
                                                                            key={step.id}
                                                                            type="button"
                                                                            onClick={() => setSelectedTraceStepId(step.id)}
                                                                            className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] transition-colors ${selectedTraceStep?.id === step.id
                                                                                ? 'border-cyan-400/25 bg-cyan-500/10 text-cyan-100'
                                                                                : 'border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/20 hover:text-white'}`}
                                                                        >
                                                                            {step.lane ? `${step.lane} 路 ` : ''}{step.stage}{step.provider ? ` 路 ${step.provider}` : ''}
                                                                        </button>
                                                                    )) : (
                                                                        <div className="text-xs text-slate-500">暂时还没有采集到传输步骤。</div>
                                                                    )}
                                                                </div>

                                                                <div className="flex items-center gap-2 border-b border-white/[0.08] px-4 py-2">
                                                                    {(['request', 'response', 'resolved_input'] as TraceDetailTab[]).map((tab) => (
                                                                        <button
                                                                            key={tab}
                                                                            type="button"
                                                                            onClick={() => setTraceDetailTab(tab)}
                                                                            className={`rounded-full px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] transition-colors ${traceDetailTab === tab
                                                                                ? 'bg-white/10 text-white'
                                                                                : 'text-slate-500 hover:text-slate-300'}`}
                                                                        >
                                                                            {tab === 'resolved_input' ? '解析后输入' : tab === 'request' ? '请求' : '响应'}
                                                                        </button>
                                                                    ))}
                                                                    {selectedTraceStep && (
                                                                        <div className="ml-auto flex items-center gap-3 text-[11px] text-slate-500">
                                                                            <span>{selectedTraceStep.method || '--'}</span>
                                                                            <span>{formatTraceDuration(selectedTraceStep.durationMs)}</span>
                                                                            {selectedTraceStep.responseStatus && <span>HTTP {selectedTraceStep.responseStatus}</span>}
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                {traceError && (
                                                                    <div className="border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-300">
                                                                        {traceError}
                                                                    </div>
                                                                )}

                                                                <div className="no-drag min-h-0 flex-1 overflow-auto px-4 py-3 font-mono text-[11px] leading-5 text-slate-300" style={{ scrollbarWidth: 'thin', overscrollBehavior: 'contain' }}>
                                                                    {renderTraceValue(resolveTracePaneValue(traceDetailTab))}
                                                                </div>
                                                            </>
                                                        ) : (
                                                            <div className="flex h-full items-center justify-center px-6 text-sm text-slate-500">
                                                                请选择一条调用链记录，以查看它的请求、响应和解析后输入。
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </section>
                                        ) : (
                                            <div className="flex h-full w-12 flex-col overflow-hidden rounded-[22px] border border-white/[0.08] bg-black/15 no-drag">
                                                <button
                                                    type="button"
                                                    onClick={() => setTraceDrawerOpen(true)}
                                                    className="flex h-full flex-col items-center justify-center gap-3 text-slate-400 transition-colors hover:bg-white/[0.03] hover:text-white"
                                                    title="展开调用链面板"
                                                >
                                                    <Code className="h-4 w-4" />
                                                    <span className="-rotate-90 whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.18em]">
                                                        调用链
                                                    </span>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex h-full items-center justify-center px-6 py-8">
                                        <div className="max-w-xl rounded-[22px] border border-dashed border-white/10 bg-white/[0.02] px-6 py-8 text-center text-sm leading-6 text-slate-500">
                                            开始面试后，让系统音频或麦克风先产生转写。左侧是对话，中间是主推荐，右侧是强模型答案。
                                        </div>
                                    </div>
                                )}
                            </div>

                            {false && (
                            <div className="px-4 pb-3">
                                <div className="overflow-hidden rounded-[20px] border border-white/[0.08] bg-black/15">
                                    <div className="flex items-center justify-between gap-3 px-4 py-3">
                                        <button
                                            type="button"
                                            onClick={() => setTraceDrawerOpen(prev => !prev)}
                                            className="flex items-center gap-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300 transition-colors hover:text-white"
                                        >
                                            <Code className="h-3.5 w-3.5" />
                                            <span>调用链</span>
                                            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] tracking-[0.12em] text-slate-400">
                                                {traceActions.length}
                                            </span>
                                            {traceDrawerOpen ? <ChevronDown className="h-3.5 w-3.5 text-slate-500" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-500" />}
                                        </button>

                                        <div className="flex items-center gap-2">
                                            {traceInfo && (
                                                <span className="hidden rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-500 md:inline-flex">
                                                    会话 {traceInfo?.sessionId.slice(-6)}
                                                </span>
                                            )}
                                            {traceDrawerOpen && (
                                                <>
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
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {traceDrawerOpen && (
                                        <div className="grid h-[270px] min-h-0 grid-cols-[260px_minmax(0,1fr)] border-t border-white/[0.08]">
                                            <div className="min-h-0 overflow-y-auto border-r border-white/[0.08] p-3">
                                                <div className="space-y-2">
                                                    {isTraceLoading ? (
                                                        <div className="rounded-[16px] border border-white/10 bg-white/[0.03] px-3 py-4 text-xs text-slate-400">
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
                                                                className={`w-full rounded-[16px] border px-3 py-3 text-left transition-colors ${selectedTraceAction?.id === action.id
                                                                    ? 'border-emerald-400/25 bg-emerald-500/10'
                                                                    : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]'}`}
                                                            >
                                                                <div className="mb-2 flex items-center justify-between gap-2">
                                                                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                                                        {action.label}
                                                                    </span>
                                                                    <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] ${action.status === 'error'
                                                                        ? 'bg-red-500/10 text-red-300'
                                                                        : action.status === 'completed'
                                                                            ? 'bg-emerald-500/10 text-emerald-300'
                                                                            : 'bg-amber-500/10 text-amber-300'}`}>
                                                                        {action.status}
                                                                    </span>
                                                                </div>
                                                                <div className="text-xs text-slate-200 line-clamp-2">
                                                                            {formatTraceActionTypeLabel(action.type)}
                                                                </div>
                                                                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                                                                    <span>{formatTraceTimestamp(action.startedAt)}</span>
                                                                            <span>{action.steps.length} 个步骤</span>
                                                                </div>
                                                            </button>
                                                        ))
                                                    ) : (
                                                        <div className="rounded-[16px] border border-dashed border-white/10 bg-white/[0.02] px-3 py-4 text-xs leading-5 text-slate-500">
                                                            还没有调用链记录。先触发“怎么回答”“作答”“总结”等动作，这里就会开始出现内容。
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex min-h-0 min-w-0 flex-col">
                                                {selectedTraceAction ? (
                                                    <>
                                                        <div className="border-b border-white/[0.08] px-4 py-3">
                                                            <div className="flex items-center justify-between gap-3">
                                                                <div className="min-w-0">
                                                                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                                                                        {selectedTraceAction.label}
                                                                    </div>
                                                                    <div className="mt-1 text-xs text-slate-500">
                                                                        {selectedTraceAction.requestId ? `请求 ID：${selectedTraceAction.requestId}` : formatTraceActionTypeLabel(selectedTraceAction.type)}
                                                                    </div>
                                                                </div>
                                                                <div className="text-right text-[11px] text-slate-500">
                                                                    <div>{formatTraceTimestamp(selectedTraceAction.startedAt)}</div>
                                                                    <div>{selectedTraceAction.endedAt ? formatTraceTimestamp(selectedTraceAction.endedAt) : '运行中'}</div>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="flex gap-2 overflow-x-auto border-b border-white/[0.08] px-4 py-3">
                                                            {selectedTraceAction.steps.length > 0 ? selectedTraceAction.steps.map((step) => (
                                                                <button
                                                                    key={step.id}
                                                                    type="button"
                                                                    onClick={() => setSelectedTraceStepId(step.id)}
                                                                    className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] transition-colors ${selectedTraceStep?.id === step.id
                                                                        ? 'border-cyan-400/25 bg-cyan-500/10 text-cyan-100'
                                                                        : 'border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/20 hover:text-white'}`}
                                                                >
                                                                    {step.lane ? `${step.lane} 路 ` : ''}{step.stage}
                                                                    {step.provider ? ` 路 ${step.provider}` : ''}
                                                                </button>
                                                            )) : (
                                                                <div className="text-xs text-slate-500">暂时还没有采集到传输步骤。</div>
                                                            )}
                                                        </div>

                                                        <div className="flex items-center gap-2 border-b border-white/[0.08] px-4 py-2">
                                                            {(['request', 'response', 'resolved_input'] as TraceDetailTab[]).map((tab) => (
                                                                <button
                                                                    key={tab}
                                                                    type="button"
                                                                    onClick={() => setTraceDetailTab(tab)}
                                                                    className={`rounded-full px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] transition-colors ${traceDetailTab === tab
                                                                        ? 'bg-white/10 text-white'
                                                                        : 'text-slate-500 hover:text-slate-300'}`}
                                                                >
                                                                    {tab === 'resolved_input' ? '解析后输入' : tab === 'request' ? '请求' : '响应'}
                                                                </button>
                                                            ))}
                                                            {selectedTraceStep && (
                                                                <div className="ml-auto flex items-center gap-3 text-[11px] text-slate-500">
                                                                    <span>{selectedTraceStep.method || '--'}</span>
                                                                    <span>{formatTraceDuration(selectedTraceStep.durationMs)}</span>
                                                                    {selectedTraceStep.responseStatus && <span>HTTP {selectedTraceStep.responseStatus}</span>}
                                                                </div>
                                                            )}
                                                        </div>

                                                        {traceError && (
                                                            <div className="border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-300">
                                                                {traceError}
                                                            </div>
                                                        )}

                                                        <div className="min-h-0 flex-1 overflow-auto px-4 py-3 font-mono text-[11px] leading-5 text-slate-300" style={{ scrollbarWidth: 'thin' }}>
                                                            {renderTraceValue(resolveTracePaneValue(traceDetailTab))}
                                                        </div>
                                                    </>
                                                ) : (
                                                    <div className="flex h-full items-center justify-center px-6 text-sm text-slate-500">
                                                        请选择一条调用链记录，以查看它的请求、响应和解析后的输入。
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                            )}

                            <div className="flex flex-nowrap items-center justify-center gap-1.5 overflow-x-hidden px-4 pb-3 pt-3">
                                <div className="mr-2 rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                                    追问目标：{activeLaneLabel}
                                </div>
                                {isTranscriptFlushInFlight && (
                                    <div className="shrink-0 rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
                                        正在保存转写
                                    </div>
                                )}
                                <div className="flex shrink-0 items-center gap-1">
                                    <button onClick={handleWhatToSay} className="interaction-base interaction-press whitespace-nowrap rounded-full border border-white/0 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-slate-400 transition-all duration-200 hover:border-white/5 hover:bg-white/10 hover:text-slate-200 active:scale-95">
                                        <Pencil className="mr-1.5 inline h-3 w-3 opacity-70" /> 怎么回答
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleOpenPromptLabWindow('what_to_answer')}
                                        className="interaction-base interaction-press flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[10px] font-semibold tracking-[0.08em] text-slate-400 transition-all duration-200 hover:border-white/20 hover:bg-white/10 hover:text-white active:scale-95"
                                        title="打开“怎么回答”提示词实验室"
                                    >
                                        {`{}`}
                                    </button>
                                </div>
                                <div className="flex shrink-0 items-center gap-1">
                                    <button onClick={() => handleFollowUp('shorten')} className="interaction-base interaction-press whitespace-nowrap rounded-full border border-white/0 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-slate-400 transition-all duration-200 hover:border-white/5 hover:bg-white/10 hover:text-slate-200 active:scale-95">
                                        <MessageSquare className="mr-1.5 inline h-3 w-3 opacity-70" /> 精简
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleOpenPromptLabWindow('follow_up_refine')}
                                        className="interaction-base interaction-press flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[10px] font-semibold tracking-[0.08em] text-slate-400 transition-all duration-200 hover:border-white/20 hover:bg-white/10 hover:text-white active:scale-95"
                                        title="打开“精简”提示词实验室"
                                    >
                                        {`{}`}
                                    </button>
                                </div>
                                <div className="flex shrink-0 items-center gap-1">
                                    <button onClick={handleRecap} className="interaction-base interaction-press whitespace-nowrap rounded-full border border-white/0 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-slate-400 transition-all duration-200 hover:border-white/5 hover:bg-white/10 hover:text-slate-200 active:scale-95">
                                        <RefreshCw className="mr-1.5 inline h-3 w-3 opacity-70" /> 总结
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleOpenPromptLabWindow('recap')}
                                        className="interaction-base interaction-press flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[10px] font-semibold tracking-[0.08em] text-slate-400 transition-all duration-200 hover:border-white/20 hover:bg-white/10 hover:text-white active:scale-95"
                                        title="打开“总结”提示词实验室"
                                    >
                                        {`{}`}
                                    </button>
                                </div>
                                <div className="flex shrink-0 items-center gap-1">
                                    <button onClick={handleFollowUpQuestions} className="interaction-base interaction-press whitespace-nowrap rounded-full border border-white/0 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-slate-400 transition-all duration-200 hover:border-white/5 hover:bg-white/10 hover:text-slate-200 active:scale-95">
                                        <HelpCircle className="mr-1.5 inline h-3 w-3 opacity-70" /> 追问
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleOpenPromptLabWindow('follow_up_questions')}
                                        className="interaction-base interaction-press flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[10px] font-semibold tracking-[0.08em] text-slate-400 transition-all duration-200 hover:border-white/20 hover:bg-white/10 hover:text-white active:scale-95"
                                        title="打开“追问”提示词实验室"
                                    >
                                        {`{}`}
                                    </button>
                                </div>
                                <button
                                    onClick={handleOpenRawTranscriptWindow}
                                    className="interaction-base interaction-press shrink-0 whitespace-nowrap rounded-full border border-white/0 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-slate-400 transition-all duration-200 hover:border-white/5 hover:bg-white/10 hover:text-slate-200 active:scale-95"
                                >
                                    <Mic className="mr-1.5 inline h-3 w-3 opacity-70" /> 原始转写
                                </button>
                                <button
                                    onClick={handleOpenTraceWindow}
                                    className="interaction-base interaction-press shrink-0 whitespace-nowrap rounded-full border border-white/0 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-slate-400 transition-all duration-200 hover:border-white/5 hover:bg-white/10 hover:text-slate-200 active:scale-95"
                                >
                                    <Code className="mr-1.5 inline h-3 w-3 opacity-70" /> 调用链
                                    <span className="ml-1 rounded-full border border-white/10 bg-black/25 px-1.5 py-0.5 text-[10px] tracking-[0.12em] text-slate-300">
                                        {traceActions.length}
                                    </span>
                                </button>
                                <div className="flex shrink-0 items-center gap-1">
                                    <button
                                        onClick={handleAnswerNow}
                                        className={`interaction-base interaction-press min-w-[88px] whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-medium transition-all duration-200 active:scale-95 ${isManualRecording
                                            ? 'bg-red-500/10 text-red-400 ring-1 ring-red-500/20'
                                            : 'bg-white/5 text-slate-400 hover:bg-emerald-500/10 hover:text-emerald-400'
                                            }`}
                                    >
                                        {isManualRecording ? (
                                            <>
                                                <div className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
                                                停止
                                            </>
                                        ) : (
                                            <>
                                                <Zap className="mr-1.5 inline h-3 w-3 opacity-70" />
                                                作答
                                            </>
                                        )}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleOpenPromptLabWindow('answer')}
                                        className="interaction-base interaction-press flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[10px] font-semibold tracking-[0.08em] text-slate-400 transition-all duration-200 hover:border-white/20 hover:bg-white/10 hover:text-white active:scale-95"
                                        title="打开“作答”提示词实验室"
                                    >
                                        {`{}`}
                                    </button>
                                </div>
                            </div>

                            <div className="p-3 pt-0">
                                {attachedContext.length > 0 && (
                                    <div className="no-drag mb-2 rounded-lg border border-white/10 bg-white/5 p-2 transition-all duration-200">
                                        <div className="mb-1.5 flex items-center justify-between">
                                            <span className="text-[11px] font-medium text-white">
                                                已附加截图：{attachedContext.length}
                                            </span>
                                            <button
                                                onClick={() => setAttachedContext([])}
                                                className="rounded-full p-1 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                        <div className="flex max-w-full gap-1.5 overflow-x-auto pb-1">
                                            {attachedContext.map((ctx, idx) => (
                                                <div key={ctx.path} className="group/thumb relative flex-shrink-0">
                                                    <img
                                                        src={ctx.preview}
                                                        alt={`Screenshot ${idx + 1}`}
                                                        className="h-10 w-auto rounded border border-white/20"
                                                    />
                                                    <button
                                                        onClick={() => setAttachedContext(prev => prev.filter((_, i) => i !== idx))}
                                                        className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500/80 opacity-0 transition-opacity hover:bg-red-500 group-hover/thumb:opacity-100"
                                                        title="移除"
                                                    >
                                                        <X className="h-2.5 w-2.5 text-white" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                        <span className="text-[10px] text-slate-400">你可以直接提问，或者点击“作答”把这些截图一起作为上下文。</span>
                                    </div>
                                )}

                                <div className="group relative">
                                    <input
                                        ref={textInputRef}
                                        type="text"
                                        value={inputValue}
                                        onChange={(e) => setInputValue(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}
                                        placeholder="输入你想问的问题，或基于当前屏幕和对话继续追问..."
                                        className="w-full rounded-xl border border-white/5 bg-[#1E1E1E] py-2.5 pl-3 pr-10 text-[13px] leading-relaxed text-slate-200 transition-all duration-200 ease-sculpted placeholder:text-slate-500 hover:bg-[#252525] focus:border-white/10 focus:bg-[#1E1E1E] focus:outline-none focus:ring-1 focus:ring-white/10"
                                    />

                                    {!inputValue && (
                                        <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 opacity-20">
                                            <span className="text-[10px]">↵</span>
                                        </div>
                                    )}
                                </div>

                                <div className="mt-3 flex items-center justify-between px-0.5">
                                    <div className="flex items-center gap-1.5">
                                        <button
                                            onClick={(e) => {
                                                if (!contentRef.current) return;
                                                const contentRect = contentRef.current.getBoundingClientRect();
                                                const buttonRect = e.currentTarget.getBoundingClientRect();
                                                const GAP = 8;

                                                const x = window.screenX + buttonRect.left;
                                                const y = window.screenY + contentRect.bottom + GAP;

                                                window.electronAPI.toggleModelSelector({ x, y });
                                            }}
                                            className="interaction-base interaction-press flex w-[156px] items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white"
                                        >
                                            <span className="min-w-0 flex-1 truncate">
                                                {(() => {
                                                    const m = currentModel;
                                                    if (m.startsWith('ollama-')) return m.replace('ollama-', '');
                                                    if (m === 'gemini-3.1-flash-lite-preview') return 'Gemini 3.1 Flash';
                                                    if (m === 'gemini-3.1-pro-preview') return 'Gemini 3.1 Pro';
                                                    if (m === 'llama-3.3-70b-versatile') return 'Groq Llama 3.3';
                                                    if (m === 'gpt-5.4') return 'GPT 5.4';
                                                    if (m === 'claude-sonnet-4-6') return 'Sonnet 4.6';
                                                    return m;
                                                })()}
                                            </span>
                                            <ChevronDown size={14} className="shrink-0 transition-transform" />
                                        </button>

                                        <div className="mx-1 h-3 w-px bg-white/10" />

                                        <button
                                            type="button"
                                            onClick={() => void window.electronAPI?.openSttCompareWindow?.()}
                                            className={`interaction-base interaction-press flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-colors ${sttCompareResults?.active
                                                ? 'border-cyan-400/30 bg-cyan-500/10 text-cyan-100'
                                                : 'border-white/10 bg-black/20 text-slate-400 hover:border-white/20 hover:bg-white/5 hover:text-slate-200'
                                                }`}
                                            title="打开 Fun-ASR 独立对比窗口"
                                        >
                                            <Mic className="h-3.5 w-3.5" />
                                            <span>Fun-ASR 对比</span>
                                            {showFunAsrCompareBadge && (
                                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                            )}
                                        </button>

                                        <div className="relative">
                                            <button
                                                onClick={(e) => {
                                                    if (isSettingsOpen) {
                                                        window.electronAPI.toggleSettingsWindow();
                                                        return;
                                                    }

                                                    if (!contentRef.current) return;

                                                    const contentRect = contentRef.current.getBoundingClientRect();
                                                    const buttonRect = e.currentTarget.getBoundingClientRect();
                                                    const GAP = 8;
                                                    const x = window.screenX + buttonRect.left;
                                                    const y = window.screenY + contentRect.bottom + GAP;

                                                    window.electronAPI.toggleSettingsWindow({ x, y });
                                                }}
                                                className={`interaction-base interaction-press flex h-7 w-7 items-center justify-center rounded-lg ${isSettingsOpen ? 'bg-white/10 text-white' : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'}`}
                                                title="设置"
                                            >
                                                <SlidersHorizontal className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    </div>

                                    <button
                                        onClick={handleManualSubmit}
                                        disabled={!inputValue.trim()}
                                        className={`interaction-base interaction-press flex h-7 w-7 items-center justify-center rounded-full ${inputValue.trim()
                                            ? 'bg-[#007AFF] text-white shadow-lg shadow-blue-500/20 hover:bg-[#0071E3]'
                                            : 'cursor-not-allowed bg-white/5 text-white/10'
                                            }`}
                                    >
                                        <ArrowRight className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </div>

                            {!isOverlayMaximized && (
                                <>
                                    <div onPointerDown={handleResizeStart('top')} className="no-drag absolute left-8 right-8 top-0 z-[70] h-5 cursor-ns-resize" />
                                    <div onPointerDown={handleResizeStart('bottom')} className="no-drag absolute bottom-0 left-8 right-8 z-[70] h-5 cursor-ns-resize" />
                                    <div onPointerDown={handleResizeStart('left')} className="no-drag absolute bottom-8 left-0 top-8 z-[70] w-5 cursor-ew-resize" />
                                    <div onPointerDown={handleResizeStart('right')} className="no-drag absolute bottom-8 right-0 top-8 z-[70] w-5 cursor-ew-resize" />
                                    <div
                                        onPointerDown={handleResizeStart('top-left')}
                                        className="no-drag absolute left-0 top-0 z-[80] h-6 w-6 cursor-nwse-resize"
                                    />
                                    <div
                                        onPointerDown={handleResizeStart('top-right')}
                                        className="no-drag absolute right-0 top-0 z-[80] h-6 w-6 cursor-nesw-resize"
                                    />
                                    <div
                                        onPointerDown={handleResizeStart('bottom-left')}
                                        className="no-drag absolute bottom-0 left-0 z-[80] h-6 w-6 cursor-nesw-resize"
                                    />
                                    <div
                                        onPointerDown={handleResizeStart('bottom-right')}
                                        className="no-drag absolute bottom-0 right-0 z-[80] h-6 w-6 cursor-nwse-resize"
                                    />
                                    <div className="pointer-events-none absolute left-2 top-2 h-3 w-3 border-l border-t border-white/10" />
                                    <div className="pointer-events-none absolute right-2 top-2 h-3 w-3 border-r border-t border-white/10" />
                                    <div className="pointer-events-none absolute bottom-2 left-2 h-3 w-3 border-b border-l border-white/10" />
                                    <div className="pointer-events-none absolute bottom-2 right-2 h-3 w-3 border-b border-r border-white/10" />
                                </>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default NativelyInterface;

