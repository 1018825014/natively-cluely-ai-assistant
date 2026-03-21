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
    ChevronUp,
    ChevronDown,

    CornerDownLeft,
    Mic,
    MicOff,
    Image,
    Camera,
    X,
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
import RollingTranscript from './ui/RollingTranscript';
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
}

interface InterviewerDraft {
    id: string;
    text: string;
    startedAt: number;
    updatedAt: number;
    lastStableText: string;
    isFinalCandidate: boolean;
}

interface NativelyInterfaceProps {
    onEndMeeting?: () => void;
}

type ResizeCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
type OverlayWindowState = {
    visible: boolean;
    mode: 'launcher' | 'overlay';
    overlayVisible: boolean;
    launcherVisible: boolean;
    overlayAlwaysOnTop: boolean;
    overlayFocused: boolean;
};

const OVERLAY_PANEL_SIZE_STORAGE_KEY = 'natively_overlay_panel_size';
const DEFAULT_PANEL_SIZE = { width: 1080, height: 760 };
const MIN_PANEL_SIZE = { width: 860, height: 600 };
const MAX_PANEL_SIZE = { width: 1480, height: 960 };

const createMessageId = (prefix: string) => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `${prefix}-${crypto.randomUUID()}`;
    }

    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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
    const [interviewerDraft, setInterviewerDraft] = useState<InterviewerDraft | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [showConversationScrollToBottom, setShowConversationScrollToBottom] = useState(false);
    const [showRecommendationScrollToBottom, setShowRecommendationScrollToBottom] = useState(false);
    const [conversationContext, setConversationContext] = useState<string>('');
    const [isManualRecording, setIsManualRecording] = useState(false);
    const isRecordingRef = useRef(false);  // Ref to track recording state (avoids stale closure)
    const [manualTranscript, setManualTranscript] = useState('');
    const manualTranscriptRef = useRef<string>('');
    const [showTranscript, setShowTranscript] = useState(() => {
        const stored = localStorage.getItem('natively_interviewer_transcript');
        return stored !== 'false';
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

    // Analytics State
    const requestStartTimeRef = useRef<number | null>(null);
    const messagesRef = useRef<Message[]>([]);
    const interviewerDraftRef = useRef<InterviewerDraft | null>(null);
    const interviewerPauseCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearInterviewerPauseCommitTimer = () => {
        if (interviewerPauseCommitTimerRef.current) {
            clearTimeout(interviewerPauseCommitTimerRef.current);
            interviewerPauseCommitTimerRef.current = null;
        }
    };

    const setInterviewerDraftState = (draft: InterviewerDraft | null) => {
        interviewerDraftRef.current = draft;
        setInterviewerDraft(draft);
    };

    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    const commitInterviewerDraft = (clearLivePreview: boolean = false) => {
        clearInterviewerPauseCommitTimer();

        const draft = interviewerDraftRef.current;
        if (!draft) {
            return;
        }

        const committedText = (draft.lastStableText || draft.text).trim();
        if (!committedText) {
            setInterviewerDraftState(null);
            return;
        }

        setMessages(prev => {
            const lastMessage = findLastCommittedInterviewerMessage(prev);

            if (
                lastMessage?.role === 'interviewer' &&
                normalizeTranscriptForComparison(lastMessage.text) === normalizeTranscriptForComparison(committedText)
            ) {
                messagesRef.current = prev;
                return prev;
            }

            if (shouldReplaceCommittedInterviewerMessage(lastMessage, committedText, draft.updatedAt)) {
                const updated = prev.map(message => (
                    message.id === lastMessage!.id
                        ? {
                            ...message,
                            text: chooseMoreCompleteTranscript(lastMessage!.text, committedText),
                            timestamp: draft.updatedAt,
                        }
                        : message
                ));
                messagesRef.current = updated;
                return updated;
            }

            const nextMessages: Message[] = [...prev, {
                id: draft.id,
                role: 'interviewer' as const,
                text: committedText,
                timestamp: draft.updatedAt,
            }];
            messagesRef.current = nextMessages;
            return nextMessages;
        });

        setInterviewerDraftState(null);
        if (clearLivePreview) {
            setRollingTranscript('');
        }
        setIsInterviewerSpeaking(false);
    };

    const scheduleInterviewerDraftCommit = () => {
        clearInterviewerPauseCommitTimer();

        interviewerPauseCommitTimerRef.current = setTimeout(() => {
            const currentDraft = interviewerDraftRef.current;
            if (!currentDraft) {
                return;
            }

            if (Date.now() - currentDraft.updatedAt >= INTERVIEWER_PAUSE_COMMIT_MS) {
                commitInterviewerDraft(true);
            }
        }, INTERVIEWER_PAUSE_COMMIT_MS);
    };

    const handleIncomingInterviewerTranscript = (transcript: {
        text: string;
        final: boolean;
        timestamp: number;
    }) => {
        const nextText = transcript.text.trim();
        if (!nextText) {
            return;
        }

        const currentDraft = interviewerDraftRef.current;
        let nextDraft: InterviewerDraft;

        if (!currentDraft) {
            const lastCommittedMessage = findLastCommittedInterviewerMessage(messagesRef.current);
            if (shouldReplaceCommittedInterviewerMessage(lastCommittedMessage, nextText, transcript.timestamp)) {
                const refinedText = chooseMoreCompleteTranscript(lastCommittedMessage!.text, nextText);

                setMessages(prev => {
                    const nextMessages = prev.filter(message => message.id !== lastCommittedMessage!.id);
                    if (nextMessages.length === prev.length) {
                        messagesRef.current = prev;
                        return prev;
                    }
                    messagesRef.current = nextMessages;
                    return nextMessages;
                });

                nextDraft = {
                    id: lastCommittedMessage!.id,
                    text: refinedText,
                    startedAt: lastCommittedMessage!.timestamp ?? transcript.timestamp,
                    updatedAt: transcript.timestamp,
                    lastStableText: refinedText,
                    isFinalCandidate: transcript.final,
                };
            } else {
                nextDraft = {
                    id: createMessageId('interviewer'),
                    text: nextText,
                    startedAt: transcript.timestamp,
                    updatedAt: transcript.timestamp,
                    lastStableText: transcript.final ? nextText : '',
                    isFinalCandidate: transcript.final,
                };
            }
        } else if (isTranscriptRefinement(currentDraft.text, nextText)) {
            const refinedText = chooseMoreCompleteTranscript(currentDraft.text, nextText);
            nextDraft = {
                ...currentDraft,
                text: refinedText,
                updatedAt: transcript.timestamp,
                lastStableText: transcript.final ? refinedText : currentDraft.lastStableText,
                isFinalCandidate: currentDraft.isFinalCandidate || transcript.final,
            };
        } else if (shouldAppendInterviewerFragment(currentDraft.text, nextText)) {
            const appendedText = joinInterviewerFragments(currentDraft.text, nextText);
            nextDraft = {
                ...currentDraft,
                text: appendedText,
                updatedAt: transcript.timestamp,
                lastStableText: transcript.final ? appendedText : currentDraft.lastStableText,
                isFinalCandidate: currentDraft.isFinalCandidate || transcript.final,
            };
        } else if (shouldTreatAsInterviewerRevision(currentDraft.text, nextText, Math.abs(transcript.timestamp - currentDraft.updatedAt))) {
            const revisedText = transcript.final
                ? nextText
                : (
                    normalizeTranscriptForComparison(nextText).length >= normalizeTranscriptForComparison(currentDraft.text).length
                        ? nextText
                        : currentDraft.text
                );

            nextDraft = {
                ...currentDraft,
                text: revisedText,
                updatedAt: transcript.timestamp,
                lastStableText: transcript.final ? revisedText : currentDraft.lastStableText,
                isFinalCandidate: currentDraft.isFinalCandidate || transcript.final,
            };
        } else {
            commitInterviewerDraft(false);
            nextDraft = {
                id: createMessageId('interviewer'),
                text: nextText,
                startedAt: transcript.timestamp,
                updatedAt: transcript.timestamp,
                lastStableText: transcript.final ? nextText : '',
                isFinalCandidate: transcript.final,
            };
        }

        setInterviewerDraftState(nextDraft);

        const shouldCommitImmediately = nextDraft.text.length >= HARD_MAX_INTERVIEWER_CHARS;

        if (shouldCommitImmediately) {
            commitInterviewerDraft(false);
            return;
        }

        scheduleInterviewerDraftCommit();
    };

    // Sync transcript setting
    useEffect(() => {
        const handleStorage = () => {
            const stored = localStorage.getItem('natively_interviewer_transcript');
            setShowTranscript(stored !== 'false');
        };
        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
    }, []);

    useEffect(() => () => clearInterviewerPauseCommitTimer(), []);

    const clampPanelSize = (width: number, height: number) => {
        const maxWidth = Math.min(MAX_PANEL_SIZE.width, Math.floor((window.screen?.availWidth || MAX_PANEL_SIZE.width) * 0.9));
        const maxHeight = Math.min(MAX_PANEL_SIZE.height, Math.floor((window.screen?.availHeight || MAX_PANEL_SIZE.height) * 0.9));

        return {
            width: Math.round(Math.min(Math.max(width, MIN_PANEL_SIZE.width), maxWidth)),
            height: Math.round(Math.min(Math.max(height, MIN_PANEL_SIZE.height), maxHeight))
        };
    };

    const updatePanelSize = (nextWidth: number, nextHeight: number) => {
        const nextSize = clampPanelSize(nextWidth, nextHeight);
        panelSizeRef.current = nextSize;
        setPanelSize(nextSize);
        return nextSize;
    };

    const scrollConversationToBottom = (behavior: ScrollBehavior = 'smooth') => {
        const element = conversationScrollRef.current;
        if (!element) return;

        element.scrollTo({ top: element.scrollHeight, behavior });
        isConversationPinnedToBottomRef.current = true;
        setShowConversationScrollToBottom(false);
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

        const maxX = Math.max(0, (window.screen?.availWidth || clampedSize.width) - clampedSize.width);
        const maxY = Math.max(0, (window.screen?.availHeight || clampedSize.height) - clampedSize.height);

        void window.electronAPI?.setOverlayBounds?.({
            x: Math.round(Math.min(Math.max(nextX, 0), maxX)),
            y: Math.round(Math.min(Math.max(nextY, 0), maxY)),
            width: clampedSize.width,
            height: clampedSize.height
        });
    }

    const handleResizeStart = (corner: ResizeCorner) => (event: React.PointerEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();

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

    useEffect(() => () => stopResizing(), []);

    const [rollingTranscript, setRollingTranscript] = useState('');  // For interviewer rolling text bar
    const [isInterviewerSpeaking, setIsInterviewerSpeaking] = useState(false);  // Track if actively speaking
    const [voiceInput, setVoiceInput] = useState('');  // Accumulated user voice input
    const voiceInputRef = useRef<string>('');  // Ref for capturing in async handlers
    const textInputRef = useRef<HTMLInputElement>(null); // Ref for input focus

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const interviewerMessagesEndRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const conversationScrollRef = useRef<HTMLDivElement>(null);
    const recommendationScrollRef = useRef<HTMLDivElement>(null);
    const isConversationPinnedToBottomRef = useRef(true);
    const isRecommendationPinnedToBottomRef = useRef(true);
    const resizeStateRef = useRef<{
        corner: ResizeCorner;
        startX: number;
        startY: number;
        startWindowX: number;
        startWindowY: number;
        startWidth: number;
        startHeight: number;
    } | null>(null);
    const panelSizeRef = useRef(panelSize);
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
            const rect = contentRef.current.getBoundingClientRect();
            window.electronAPI?.updateContentDimensions({
                width: Math.ceil(rect.width),
                height: Math.ceil(rect.height)
            });
        });
    }, [attachedContext]);

    // Force initial sizing safety check
    useEffect(() => {
        const timer = setTimeout(() => {
            if (contentRef.current) {
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

        if (isConversationPinnedToBottomRef.current) {
            requestAnimationFrame(() => scrollConversationToBottom('smooth'));
        } else {
            setShowConversationScrollToBottom(true);
        }

        if (isRecommendationPinnedToBottomRef.current) {
            requestAnimationFrame(() => scrollRecommendationToBottom('smooth'));
        } else {
            setShowRecommendationScrollToBottom(true);
        }
    }, [messages, interviewerDraft, isExpanded, isProcessing, isManualRecording, voiceInput, manualTranscript]);

    // Build conversation context from messages
    useEffect(() => {
        const context = messages
            .filter(m => !m.isStreaming)
            .filter(m => m.role !== 'user' || !m.hasScreenshot)
            .map(m => `${m.role === 'interviewer' ? 'Interviewer' : m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`)
            .slice(-20)
            .join('\n');
        setConversationContext(context);
    }, [messages]);

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
            setManualTranscript('');
            setVoiceInput('');
            setRollingTranscript('');
            setIsInterviewerSpeaking(false);
            setIsProcessing(false);
            clearInterviewerPauseCommitTimer();
            setInterviewerDraftState(null);
            // Optionally reset connection status if needed, but connection persists

            // Track new conversation/session if applicable?
            // Actually 'app_opened' is global, 'assistant_started' is overlay.
            // Maybe 'conversation_started' event?
            analytics.trackConversationStarted();
        });
        return () => unsubscribe();
    }, []);


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
            // When Answer button is active, capture USER transcripts for voice input
            // Use ref to avoid stale closure issue
            if (isRecordingRef.current && transcript.speaker === 'user') {
                if (transcript.final) {
                    // Accumulate final transcripts
                    setVoiceInput(prev => {
                        const updated = prev + (prev ? ' ' : '') + transcript.text;
                        voiceInputRef.current = updated;
                        return updated;
                    });
                    setManualTranscript('');  // Clear partial preview
                    manualTranscriptRef.current = '';
                } else {
                    // Show live partial transcript
                    setManualTranscript(transcript.text);
                    manualTranscriptRef.current = transcript.text;
                }
                return;  // Don't add to messages while recording
            }

            // Ignore user mic transcripts when not recording
            // Only interviewer (system audio) transcripts should appear in chat
            if (transcript.speaker === 'user') {
                return;  // Skip user mic input - only relevant when Answer button is active
            }

            // Only show interviewer (system audio) transcripts in rolling bar
            if (transcript.speaker !== 'interviewer') {
                return;  // Safety check for any other speaker types
            }

            setIsInterviewerSpeaking(!transcript.final);
            setRollingTranscript(transcript.final ? '' : transcript.text);
            handleIncomingInterviewerTranscript({
                text: transcript.text,
                final: transcript.final,
                timestamp: transcript.timestamp || Date.now(),
            });

            if (transcript.final) {
                setTimeout(() => {
                    setIsInterviewerSpeaking(false);
                }, 1800);
            }
        }));

        cleanups.push(window.electronAPI.onNativeAudioSpeechEnded((event) => {
            if (event.speaker !== 'interviewer') {
                return;
            }

            commitInterviewerDraft(true);
        }));

        // AI Suggestions from native audio (legacy)
        cleanups.push(window.electronAPI.onSuggestionProcessingStart(() => {
            setIsProcessing(true);
            setIsExpanded(true);
        }));

        cleanups.push(window.electronAPI.onSuggestionGenerated((data) => {
            setIsProcessing(false);
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'system',
                text: data.suggestion
            }]);
        }));

        cleanups.push(window.electronAPI.onSuggestionError((err) => {
            setIsProcessing(false);
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'system',
                text: `Error: ${err.error}`
            }]);
        }));



        cleanups.push(window.electronAPI.onIntelligenceSuggestedAnswerToken((data) => {
            // Progressive update for 'what_to_answer' mode
            setMessages(prev => {
                const lastMsg = prev[prev.length - 1];

                // If we already have a streaming message for this intent, append
                if (lastMsg && lastMsg.isStreaming && lastMsg.intent === 'what_to_answer') {
                    const updated = [...prev];
                    updated[prev.length - 1] = {
                        ...lastMsg,
                        text: lastMsg.text + data.token
                    };
                    return updated;
                }

                // Otherwise, start a new one (First token)
                return [...prev, {
                    id: Date.now().toString(),
                    role: 'system',
                    text: data.token,
                    intent: 'what_to_answer',
                    isStreaming: true
                }];
            });
        }));

        cleanups.push(window.electronAPI.onIntelligenceSuggestedAnswer((data) => {
            setIsProcessing(false);
            setMessages(prev => {
                const lastMsg = prev[prev.length - 1];

                // If we were streaming, finalize it
                if (lastMsg && lastMsg.isStreaming && lastMsg.intent === 'what_to_answer') {
                    // Start new array to avoid mutation
                    const updated = [...prev];
                    updated[prev.length - 1] = {
                        ...lastMsg,
                        text: data.answer, // Ensure final consistency
                        isStreaming: false
                    };
                    return updated;
                }

                // If we missed the stream (or not streaming), append fresh
                return [...prev, {
                    id: Date.now().toString(),
                    role: 'system',
                    text: data.answer,  // Plain text, no markdown - ready to speak
                    intent: 'what_to_answer'
                }];
            });
        }));

        // STREAMING: Refinement
        cleanups.push(window.electronAPI.onIntelligenceRefinedAnswerToken((data) => {
            setMessages(prev => {
                const lastMsg = prev[prev.length - 1];
                if (lastMsg && lastMsg.isStreaming && lastMsg.intent === data.intent) {
                    const updated = [...prev];
                    updated[prev.length - 1] = {
                        ...lastMsg,
                        text: lastMsg.text + data.token
                    };
                    return updated;
                }
                // New stream start (e.g. user clicked Shorten)
                return [...prev, {
                    id: Date.now().toString(),
                    role: 'system',
                    text: data.token,
                    intent: data.intent,
                    isStreaming: true
                }];
            });
        }));

        cleanups.push(window.electronAPI.onIntelligenceRefinedAnswer((data) => {
            setIsProcessing(false);
            setMessages(prev => {
                const lastMsg = prev[prev.length - 1];
                if (lastMsg && lastMsg.isStreaming && lastMsg.intent === data.intent) {
                    const updated = [...prev];
                    updated[prev.length - 1] = {
                        ...lastMsg,
                        text: data.answer,
                        isStreaming: false
                    };
                    return updated;
                }
                return [...prev, {
                    id: Date.now().toString(),
                    role: 'system',
                    text: data.answer,
                    intent: data.intent
                }];
            });
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
                text: `🎯 **Answer:**\n\n${data.answer}`
            }]);
        }));

        cleanups.push(window.electronAPI.onIntelligenceError((data) => {
            setIsProcessing(false);
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'system',
                text: `❌ Error (${data.mode}): ${data.error}`
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

    const handleWhatToSay = async () => {
        setIsExpanded(true);
        setIsProcessing(true);
        analytics.trackCommandExecuted('what_to_say');

        // Capture and clear attached image context
        const currentAttachments = attachedContext;
        if (currentAttachments.length > 0) {
            setAttachedContext([]);
            // Show the attached image in chat
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'user',
                text: 'What should I say about this?',
                hasScreenshot: true,
                screenshotPreview: currentAttachments[0].preview
            }]);
        }

        try {
            // Pass imagePath if attached
            await window.electronAPI.generateWhatToSay(undefined, currentAttachments.length > 0 ? currentAttachments.map(s => s.path) : undefined);
        } catch (err) {
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'system',
                text: `Error: ${err}`
            }]);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleFollowUp = async (intent: string = 'rephrase') => {
        setIsExpanded(true);
        setIsProcessing(true);
        analytics.trackCommandExecuted('follow_up_' + intent);

        try {
            await window.electronAPI.generateFollowUp(intent);
        } catch (err) {
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'system',
                text: `Error: ${err}`
            }]);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleRecap = async () => {
        setIsExpanded(true);
        setIsProcessing(true);
        analytics.trackCommandExecuted('recap');

        try {
            await window.electronAPI.generateRecap();
        } catch (err) {
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'system',
                text: `Error: ${err}`
            }]);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleFollowUpQuestions = async () => {
        setIsExpanded(true);
        setIsProcessing(true);
        analytics.trackCommandExecuted('suggest_questions');

        try {
            await window.electronAPI.generateFollowUpQuestions();
        } catch (err) {
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'system',
                text: `Error: ${err}`
            }]);
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
                        text: lastMsg.text + `\n\n[Error: ${error}]`
                    };
                    return updated;
                }
                return [...prev, {
                    id: Date.now().toString(),
                    role: 'system',
                    text: `❌ Error: ${error}`
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
                            text: lastMsg.text + `\n\n[RAG Error: ${data.error}]`
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
            // Stop recording - send accumulated voice input to Gemini
            isRecordingRef.current = false;  // Update ref immediately
            setIsManualRecording(false);
            setManualTranscript('');  // Clear live preview

            // Send manual finalization signal to STT Providers
            window.electronAPI.finalizeMicSTT().catch(err => console.error('[NativelyInterface] Failed to send finalizeMicSTT:', err));

            const currentAttachments = attachedContext;
            setAttachedContext([]); // Clear context immediately on send

            const question = (voiceInputRef.current + (manualTranscriptRef.current ? ' ' + manualTranscriptRef.current : '')).trim();
            setVoiceInput('');
            voiceInputRef.current = '';
            setManualTranscript('');
            manualTranscriptRef.current = '';

            if (!question && currentAttachments.length === 0) {
                // No voice input and no image
                setMessages(prev => [...prev, {
                    id: Date.now().toString(),
                    role: 'system',
                    text: '⚠️ 没有检测到语音，请靠近麦克风再试一次。'
                }]);
                return;
            }

            // Show user's spoken question
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'user',
                text: question,
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

            setIsProcessing(true);

            try {
                let prompt = '';

                if (currentAttachments.length > 0) {
                    // Image + Voice Context
                    prompt = `You are a helper. The user has provided a screenshot and a spoken question/command.
User said: "${question}"

Instructions:
1. Analyze the screenshot in the context of what the user said.
2. Provide a direct, helpful answer.
3. Be concise.`;
                } else {
                    // JIT RAG pre-flight: try to use indexed meeting context first
                    const ragResult = await window.electronAPI.ragQueryLive?.(question);
                    if (ragResult?.success) {
                        // JIT RAG handled it — response streamed via rag:stream-chunk events
                        return;
                    }

                    // Voice Only (Smart Extract) — fallback
                    prompt = `You are a real-time interview assistant. The user just repeated or paraphrased a question from their interviewer.
Instructions:
1. Extract the core question being asked
2. Provide a clear, concise, and professional answer that the user can say out loud
3. Keep the answer conversational but informative (2-4 sentences ideal)
4. Do NOT include phrases like "The question is..." - just give the answer directly
5. Format for speaking out loud, not for reading

Provide only the answer, nothing else.`;
                }

                // Call Streaming API: message = question, context = instructions
                requestStartTimeRef.current = Date.now();
                await window.electronAPI.streamGeminiChat(question, currentAttachments.length > 0 ? currentAttachments.map(s => s.path) : undefined, prompt, { skipSystemPrompt: true });

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
                            text: `❌ Error starting stream: ${err}`
                        });
                    }
                    return [...prev, {
                        id: Date.now().toString(),
                        role: 'system',
                        text: `❌ Error: ${err}`
                    }];
                });
            }
        } else {
            // Start recording - reset voice input state
            setVoiceInput('');
            voiceInputRef.current = '';
            setManualTranscript('');
            isRecordingRef.current = true;  // Update ref immediately
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
            text: userText || (currentAttachments.length > 0 ? 'Analyze this screenshot' : ''),
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

        try {
            // JIT RAG pre-flight: try to use indexed meeting context first
            if (currentAttachments.length === 0) {
                const ragResult = await window.electronAPI.ragQueryLive?.(userText || '');
                if (ragResult?.success) {
                    // JIT RAG handled it — response streamed via rag:stream-chunk events
                    return;
                }
            }

            // Pass imagePath if attached, AND conversation context
            requestStartTimeRef.current = Date.now();
            await window.electronAPI.streamGeminiChat(
                userText || 'Analyze this screenshot',
                currentAttachments.length > 0 ? currentAttachments.map(s => s.path) : undefined,
                conversationContext // Pass context so "answer this" works
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
                        text: `❌ Error starting stream: ${err}`
                    });
                }
                return [...prev, {
                    id: Date.now().toString(),
                    role: 'system',
                    text: `❌ Error: ${err}`
                }];
            });
        }
    };

    const clearChat = () => {
        setMessages([]);
        setRollingTranscript('');
        setIsInterviewerSpeaking(false);
    };

    const compactMarkdownText = (text: string) => (
        text
            .replace(/\r\n/g, '\n')
            .replace(/[ \t]+\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim()
    );




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
                                            p: ({ node, ...props }: any) => <p className="mb-2 last:mb-0 whitespace-pre-wrap" {...props} />,
                                            strong: ({ node, ...props }: any) => <strong className="font-bold text-white" {...props} />,
                                            em: ({ node, ...props }: any) => <em className="italic text-slate-300" {...props} />,
                                            ul: ({ node, ...props }: any) => <ul className="list-disc ml-4 mb-2 space-y-1" {...props} />,
                                            ol: ({ node, ...props }: any) => <ol className="list-decimal ml-4 mb-2 space-y-1" {...props} />,
                                            li: ({ node, ...props }: any) => <li className="pl-1" {...props} />,
                                            h1: ({ node, ...props }: any) => <h1 className="text-lg font-bold text-white mb-2 mt-3" {...props} />,
                                            h2: ({ node, ...props }: any) => <h2 className="text-base font-bold text-white mb-2 mt-3" {...props} />,
                                            h3: ({ node, ...props }: any) => <h3 className="text-sm font-bold text-white mb-1 mt-2" {...props} />,
                                            code: ({ node, ...props }: any) => <code className="bg-slate-700/50 rounded px-1 py-0.5 text-xs font-mono text-purple-200 whitespace-pre-wrap" {...props} />,
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
                            p: ({ node, ...props }: any) => <p className="mb-1.5 last:mb-0" {...props} />,
                            strong: ({ node, ...props }: any) => <strong className="font-extrabold text-white" {...props} />,
                            ul: ({ node, ...props }: any) => <ul className="list-disc ml-4 mb-1.5 space-y-0.5" {...props} />,
                            li: ({ node, ...props }: any) => <li className="pl-1" {...props} />,
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
                            p: ({ node, ...props }: any) => <p className="mb-1.5 last:mb-0" {...props} />,
                            strong: ({ node, ...props }: any) => <strong className="font-extrabold text-white" {...props} />,
                            ul: ({ node, ...props }: any) => <ul className="list-disc ml-4 mb-1.5 space-y-0.5" {...props} />,
                            li: ({ node, ...props }: any) => <li className="pl-1" {...props} />,
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
                            p: ({ node, ...props }: any) => <p className="mb-1.5 last:mb-0" {...props} />,
                            strong: ({ node, ...props }: any) => <strong className="font-extrabold text-white" {...props} />,
                            ul: ({ node, ...props }: any) => <ul className="list-disc ml-4 mb-1.5 space-y-0.5" {...props} />,
                            li: ({ node, ...props }: any) => <li className="pl-1" {...props} />,
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
                                            p: ({ node, ...props }: any) => <p className="mb-1.5 last:mb-0" {...props} />,
                                            strong: ({ node, ...props }: any) => <strong className="font-extrabold text-white" {...props} />,
                                            em: ({ node, ...props }: any) => <em className="italic text-emerald-200/80" {...props} />,
                                            ul: ({ node, ...props }: any) => <ul className="list-disc ml-4 mb-1.5 space-y-0.5" {...props} />,
                                            ol: ({ node, ...props }: any) => <ol className="list-decimal ml-4 mb-1.5 space-y-0.5" {...props} />,
                                            li: ({ node, ...props }: any) => <li className="pl-1" {...props} />,
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
                        p: ({ node, ...props }: any) => <p className="mb-1.5 last:mb-0 whitespace-pre-wrap" {...props} />,
                        strong: ({ node, ...props }: any) => <strong className="font-extrabold text-white" {...props} />,
                        em: ({ node, ...props }: any) => <em className="italic opacity-90" {...props} />,
                        ul: ({ node, ...props }: any) => <ul className="list-disc ml-4 mb-1.5 space-y-0.5" {...props} />,
                        ol: ({ node, ...props }: any) => <ol className="list-decimal ml-4 mb-1.5 space-y-0.5" {...props} />,
                        li: ({ node, ...props }: any) => <li className="pl-1" {...props} />,
                        code: ({ node, ...props }: any) => <code className="bg-black/20 rounded px-1 py-0.5 text-xs font-mono" {...props} />,
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

    const conversationMessages = messages.filter((msg) => msg.role === 'interviewer' || msg.role === 'user');
    const displayedConversationMessages = interviewerDraft
        ? [...conversationMessages, {
            id: interviewerDraft.id,
            role: 'interviewer' as const,
            text: interviewerDraft.text,
            timestamp: interviewerDraft.updatedAt,
            isStreaming: true
        }]
        : conversationMessages;
    const recommendationMessages = messages.filter((msg) => msg.role === 'system');
    const hasOverlayContent = displayedConversationMessages.length > 0 || recommendationMessages.length > 0 || isManualRecording || isProcessing;
    const liveUserTranscript = [voiceInput, manualTranscript].filter(Boolean).join(voiceInput && manualTranscript ? ' ' : '');

    const renderConversationBubble = (msg: Message) => {
        const isUserMessage = msg.role === 'user';

        return (
            <div key={msg.id} className={`flex ${isUserMessage ? 'justify-end' : 'justify-start'}`}>
                <div
                    className={[
                        'group relative max-w-[92%] rounded-[22px] border px-4 py-3 text-[13px] leading-6 shadow-[0_10px_35px_rgba(0,0,0,0.16)]',
                        isUserMessage
                            ? 'border-blue-400/25 bg-blue-500/12 text-blue-50 rounded-tr-[6px]'
                            : 'border-white/[0.08] bg-white/[0.04] text-slate-100 rounded-tl-[6px]'
                    ].join(' ')}
                >
                    <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                        <span>{isUserMessage ? 'You' : 'Interviewer'}</span>
                        {msg.isStreaming && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                        {msg.hasScreenshot && <Image className="h-3 w-3 text-slate-400/80" />}
                    </div>
                    {msg.hasScreenshot && msg.screenshotPreview && (
                        <img
                            src={msg.screenshotPreview}
                            alt="Attached screenshot"
                            className="mb-3 max-h-24 rounded-xl border border-white/10 object-cover"
                        />
                    )}
                    {renderMessageText(msg)}
                </div>
            </div>
        );
    };

    const getRecommendationMeta = (msg: Message) => {
        if (msg.text.startsWith('Error:') || msg.text.startsWith('❌')) {
            return {
                title: 'Error',
                accent: 'text-rose-300',
                icon: <X className="h-3.5 w-3.5" />
            };
        }

        switch (msg.intent) {
            case 'what_to_answer':
                return {
                    title: msg.isStreaming ? 'Drafting answer' : 'Suggested answer',
                    accent: 'text-emerald-300',
                    icon: <Pencil className="h-3.5 w-3.5" />
                };
            case 'shorten':
                return {
                    title: 'Shortened version',
                    accent: 'text-cyan-300',
                    icon: <MessageSquare className="h-3.5 w-3.5" />
                };
            case 'recap':
                return {
                    title: 'Recap',
                    accent: 'text-indigo-300',
                    icon: <RefreshCw className="h-3.5 w-3.5" />
                };
            case 'follow_up_questions':
                return {
                    title: 'Follow-up questions',
                    accent: 'text-amber-300',
                    icon: <HelpCircle className="h-3.5 w-3.5" />
                };
            default:
                return {
                    title: msg.isStreaming ? 'Generating' : 'Recommendation',
                    accent: 'text-emerald-300',
                    icon: <Sparkles className="h-3.5 w-3.5" />
                };
        }
    };

    const renderRecommendationContent = (msg: Message) => (
        <div className="markdown-content text-[13px] leading-6 text-slate-100">
            <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={{
                    p: ({ node, ...props }: any) => <p className="mb-1.5 last:mb-0" {...props} />,
                    strong: ({ node, ...props }: any) => <strong className="font-extrabold text-white" {...props} />,
                    em: ({ node, ...props }: any) => <em className="italic text-emerald-100/85" {...props} />,
                    ul: ({ node, ...props }: any) => <ul className="mb-1.5 ml-4 list-disc space-y-0.5" {...props} />,
                    ol: ({ node, ...props }: any) => <ol className="mb-1.5 ml-4 list-decimal space-y-0.5" {...props} />,
                    li: ({ node, ...props }: any) => <li className="pl-1" {...props} />,
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
                            <code className="rounded bg-black/25 px-1 py-0.5 text-xs font-mono text-emerald-100" {...props}>
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

        return (
            <div key={msg.id} className="group relative rounded-[22px] border border-white/[0.08] bg-white/[0.04] px-4 py-3 shadow-[0_10px_35px_rgba(0,0,0,0.16)]">
                <div className="mb-2 flex items-center justify-between gap-3">
                    <div className={`flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] ${meta.accent}`}>
                        {meta.icon}
                        <span>{meta.title}</span>
                    </div>
                    {!msg.isStreaming && (
                        <button
                            onClick={() => handleCopy(msg.text)}
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
            style={{ width: panelSize.width, height: panelSize.height }}
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
                            onToggle={() => setIsExpanded(!isExpanded)}
                            onQuit={() => onEndMeeting ? onEndMeeting() : window.electronAPI.quitApp()}
                        />

                        <div className="draggable-area relative flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-[24px] border border-white/10 bg-[#1E1E1E]/95 shadow-2xl shadow-black/40 backdrop-blur-2xl">
                            {(rollingTranscript || isInterviewerSpeaking) && showTranscript && (
                                <RollingTranscript
                                    text={rollingTranscript}
                                    isActive={isInterviewerSpeaking}
                                />
                            )}

                            <div className="min-h-0 flex-1 overflow-hidden px-4 pb-4 pt-4">
                                {hasOverlayContent ? (
                                    <div className="flex h-full min-h-0 gap-4">
                                        <section className="relative flex h-full min-h-0 min-w-0 flex-[1.15] flex-col overflow-hidden rounded-[22px] border border-white/[0.08] bg-black/15">
                                            <div className="border-b border-white/[0.08] px-4 py-3">
                                                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                                                    <MessageSquare className="h-3.5 w-3.5" />
                                                    <span>Conversation</span>
                                                </div>
                                                <p className="mt-1 text-xs text-slate-500">Interviewer and your replies stay together here.</p>
                                            </div>

                                            <div
                                                ref={conversationScrollRef}
                                                onScroll={handleConversationScroll}
                                                className="min-h-0 flex-1 overflow-y-auto px-4 py-4 no-drag"
                                                style={{ scrollbarWidth: 'thin', overscrollBehavior: 'contain' }}
                                            >
                                                <div className="space-y-3">
                                                    {displayedConversationMessages.length === 0 && !isManualRecording ? (
                                                        <div className="rounded-[18px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-sm leading-6 text-slate-500">
                                                            The conversation transcript will appear here as soon as the interviewer or your microphone produces text.
                                                        </div>
                                                    ) : (
                                                        displayedConversationMessages.map(renderConversationBubble)
                                                    )}

                                                    {isManualRecording && (
                                                        <div className="flex justify-end">
                                                            <div className="max-w-[92%] rounded-[22px] rounded-tr-[6px] border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-[13px] leading-6 text-emerald-100 shadow-[0_10px_35px_rgba(0,0,0,0.16)]">
                                                                <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300/80">
                                                                    <Mic className="h-3.5 w-3.5" />
                                                                    <span>Voice input</span>
                                                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                                                </div>
                                                                {liveUserTranscript ? (
                                                                    <div className="whitespace-pre-wrap">{liveUserTranscript}</div>
                                                                ) : (
                                                                    <div className="flex items-center gap-1.5 py-1 text-emerald-300/75">
                                                                        <div className="h-2 w-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                                                                        <div className="h-2 w-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                                                                        <div className="h-2 w-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                                                                        <span className="ml-1 text-[11px] uppercase tracking-[0.18em]">Listening</span>
                                                                    </div>
                                                                )}
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
                                                    <span>Latest</span>
                                                </button>
                                            )}
                                        </section>

                                        <section className="relative flex h-full min-h-0 min-w-[360px] flex-[0.95] flex-col overflow-hidden rounded-[22px] border border-white/[0.08] bg-black/15">
                                            <div className="border-b border-white/[0.08] px-4 py-3">
                                                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300/90">
                                                    <Sparkles className="h-3.5 w-3.5" />
                                                    <span>LLM recommendation</span>
                                                </div>
                                                <p className="mt-1 text-xs text-slate-500">Recommended answers stay compact on the right.</p>
                                            </div>

                                            <div
                                                ref={recommendationScrollRef}
                                                onScroll={handleRecommendationScroll}
                                                className="min-h-0 flex-1 overflow-y-auto px-4 py-4 no-drag"
                                                style={{ scrollbarWidth: 'thin', overscrollBehavior: 'contain' }}
                                            >
                                                <div className="space-y-3">
                                                    {recommendationMessages.length === 0 && !isProcessing ? (
                                                        <div className="rounded-[18px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-sm leading-6 text-slate-500">
                                                            Click "How to answer" and recommendations will show up here.
                                                        </div>
                                                    ) : (
                                                        recommendationMessages.map(renderRecommendationBubble)
                                                    )}

                                                    {isProcessing && recommendationMessages.length === 0 && (
                                                        <div className="rounded-[18px] border border-white/[0.08] bg-white/[0.03] px-4 py-4">
                                                            <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300/80">
                                                                <Sparkles className="h-3.5 w-3.5" />
                                                                <span>Generating</span>
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
                                                    <span>Latest</span>
                                                </button>
                                            )}
                                        </section>
                                    </div>
                                ) : (
                                    <div className="flex h-full items-center justify-center px-6 py-8">
                                        <div className="max-w-xl rounded-[22px] border border-dashed border-white/10 bg-white/[0.02] px-6 py-8 text-center text-sm leading-6 text-slate-500">
                                            Start the interview and let the system audio or your microphone produce text. The conversation will stay on the left, and the recommended answer will stay on the right.
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className={`flex flex-nowrap items-center justify-center gap-1.5 overflow-x-hidden px-4 pb-3 ${rollingTranscript && showTranscript ? 'pt-1' : 'pt-3'}`}>
                                <button onClick={handleWhatToSay} className="interaction-base interaction-press shrink-0 whitespace-nowrap rounded-full border border-white/0 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-slate-400 transition-all duration-200 hover:border-white/5 hover:bg-white/10 hover:text-slate-200 active:scale-95">
                                    <Pencil className="mr-1.5 inline h-3 w-3 opacity-70" /> How to answer
                                </button>
                                <button onClick={() => handleFollowUp('shorten')} className="interaction-base interaction-press shrink-0 whitespace-nowrap rounded-full border border-white/0 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-slate-400 transition-all duration-200 hover:border-white/5 hover:bg-white/10 hover:text-slate-200 active:scale-95">
                                    <MessageSquare className="mr-1.5 inline h-3 w-3 opacity-70" /> Shorten
                                </button>
                                <button onClick={handleRecap} className="interaction-base interaction-press shrink-0 whitespace-nowrap rounded-full border border-white/0 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-slate-400 transition-all duration-200 hover:border-white/5 hover:bg-white/10 hover:text-slate-200 active:scale-95">
                                    <RefreshCw className="mr-1.5 inline h-3 w-3 opacity-70" /> Recap
                                </button>
                                <button onClick={handleFollowUpQuestions} className="interaction-base interaction-press shrink-0 whitespace-nowrap rounded-full border border-white/0 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-slate-400 transition-all duration-200 hover:border-white/5 hover:bg-white/10 hover:text-slate-200 active:scale-95">
                                    <HelpCircle className="mr-1.5 inline h-3 w-3 opacity-70" /> Follow-up
                                </button>
                                <button
                                    onClick={handleAnswerNow}
                                    className={`interaction-base interaction-press min-w-[88px] shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-medium transition-all duration-200 active:scale-95 ${isManualRecording
                                        ? 'bg-red-500/10 text-red-400 ring-1 ring-red-500/20'
                                        : 'bg-white/5 text-slate-400 hover:bg-emerald-500/10 hover:text-emerald-400'
                                        }`}
                                >
                                    {isManualRecording ? (
                                        <>
                                            <div className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
                                            Stop
                                        </>
                                    ) : (
                                        <>
                                            <Zap className="mr-1.5 inline h-3 w-3 opacity-70" />
                                            Answer
                                        </>
                                    )}
                                </button>
                            </div>

                            <div className="p-3 pt-0">
                                {attachedContext.length > 0 && (
                                    <div className="no-drag mb-2 rounded-lg border border-white/10 bg-white/5 p-2 transition-all duration-200">
                                        <div className="mb-1.5 flex items-center justify-between">
                                            <span className="text-[11px] font-medium text-white">
                                                Attached screenshots: {attachedContext.length}
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
                                                        title="Remove"
                                                    >
                                                        <X className="h-2.5 w-2.5 text-white" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                        <span className="text-[10px] text-slate-400">Ask a question or click Answer to include the screenshot context.</span>
                                    </div>
                                )}

                                <div className="group relative">
                                    <input
                                        ref={textInputRef}
                                        type="text"
                                        value={inputValue}
                                        onChange={(e) => setInputValue(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}
                                        placeholder="Ask about the screen or current conversation..."
                                        className="w-full rounded-xl border border-white/5 bg-[#1E1E1E] py-2.5 pl-3 pr-10 text-[13px] leading-relaxed text-slate-200 transition-all duration-200 ease-sculpted placeholder:text-slate-500 hover:bg-[#252525] focus:border-white/10 focus:bg-[#1E1E1E] focus:outline-none focus:ring-1 focus:ring-white/10"
                                    />

                                    {!inputValue && (
                                        <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 opacity-20">
                                            <span className="text-[10px]">→</span>
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
                                                title="Settings"
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

                            <div
                                onPointerDown={handleResizeStart('top-left')}
                                className="no-drag absolute left-1 top-1 h-5 w-5 cursor-nwse-resize rounded-full"
                            />
                            <div
                                onPointerDown={handleResizeStart('top-right')}
                                className="no-drag absolute right-1 top-1 h-5 w-5 cursor-nesw-resize rounded-full"
                            />
                            <div
                                onPointerDown={handleResizeStart('bottom-left')}
                                className="no-drag absolute bottom-1 left-1 h-5 w-5 cursor-nesw-resize rounded-full"
                            />
                            <div
                                onPointerDown={handleResizeStart('bottom-right')}
                                className="no-drag absolute bottom-1 right-1 h-5 w-5 cursor-nwse-resize rounded-full"
                            />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );

    return (
        <div ref={contentRef} className="flex flex-col items-center w-fit mx-auto h-fit min-h-0 bg-transparent p-0 rounded-[24px] font-sans text-slate-200 gap-2">

            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.95 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        className="flex flex-col items-center gap-2 w-full"
                    >
                        <TopPill
                            expanded={isExpanded}
                            onToggle={() => setIsExpanded(!isExpanded)}
                            onQuit={() => onEndMeeting ? onEndMeeting() : window.electronAPI.quitApp()}
                        />
                        <div className="
                    relative w-[600px] max-w-full
                    bg-[#1E1E1E]/95
                    backdrop-blur-2xl
                    border border-white/10
                    shadow-2xl shadow-black/40
                    rounded-[24px] 
                    overflow-hidden 
                    flex flex-col
                    draggable-area
                ">




                            {/* Rolling Transcript Bar - Single-line interviewer speech */}
                            {(rollingTranscript || isInterviewerSpeaking) && showTranscript && (
                                <RollingTranscript
                                    text={rollingTranscript}
                                    isActive={isInterviewerSpeaking}
                                />
                            )}

                            {/* Chat History - Only show if there are messages OR active states */}
                            {(messages.length > 0 || isManualRecording || isProcessing) && (
                                <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[clamp(300px,35vh,450px)] no-drag" style={{ scrollbarWidth: 'none' }}>
                                    {messages.map((msg) => (
                                        <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in-up`}>
                                            <div className={`
                      ${msg.role === 'user' ? 'max-w-[72.25%] px-[13.6px] py-[10.2px]' : 'max-w-[85%] px-4 py-3'} text-[14px] leading-relaxed relative group whitespace-pre-wrap
                      ${msg.role === 'user'
                                                    ? 'bg-blue-600/20 backdrop-blur-md border border-blue-500/30 text-blue-100 rounded-[20px] rounded-tr-[4px] shadow-sm font-medium'
                                                    : ''
                                                }
                      ${msg.role === 'system'
                                                    ? 'text-slate-200 font-normal'
                                                    : ''
                                                }
                      ${msg.role === 'interviewer'
                                                    ? 'text-white/40 italic pl-0 text-[13px]'
                                                    : ''
                                                }
                    `}>
                                                {msg.role === 'interviewer' && (
                                                    <div className="flex items-center gap-1.5 mb-1 text-[10px] text-slate-600 font-medium uppercase tracking-wider">
                                                        面试官
                                                        {msg.isStreaming && <span className="w-1 h-1 bg-green-500 rounded-full animate-pulse" />}
                                                    </div>
                                                )}
                                                {msg.role === 'user' && msg.hasScreenshot && (
                                                    <div className="flex items-center gap-1 text-[10px] opacity-70 mb-1 border-b border-white/10 pb-1">
                                                        <Image className="w-2.5 h-2.5" />
                                                        <span>已附加截图</span>
                                                    </div>
                                                )}
                                                {msg.role === 'system' && !msg.isStreaming && (
                                                    <button
                                                        onClick={() => handleCopy(msg.text)}
                                                        className="absolute top-2 right-2 p-1.5 bg-black/40 hover:bg-black/60 text-slate-400 hover:text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                                                    >
                                                        <Copy className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                                {renderMessageText(msg)}
                                            </div>
                                        </div>
                                    ))}

                                    {/* Active Recording State with Live Transcription */}
                                    {isManualRecording && (
                                        <div className="flex flex-col items-end gap-1 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                            {/* Live transcription preview */}
                                            {(manualTranscript || voiceInput) && (
                                                <div className="max-w-[85%] px-3.5 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-[18px] rounded-tr-[4px]">
                                                    <span className="text-[13px] text-emerald-300">
                                                        {voiceInput}{voiceInput && manualTranscript ? ' ' : ''}{manualTranscript}
                                                    </span>
                                                </div>
                                            )}
                                            <div className="px-3 py-2 flex gap-1.5 items-center">
                                                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                                <span className="text-[10px] text-emerald-400/70 ml-1">正在聆听...</span>
                                            </div>
                                        </div>
                                    )}

                                    {isProcessing && (
                                        <div className="flex justify-start">
                                            <div className="px-3 py-2 flex gap-1.5">
                                                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                            </div>
                                        </div>
                                    )}
                                    <div ref={messagesEndRef} />
                                </div>
                            )}

                            {/* Quick Actions - Minimal & Clean */}
                            <div className={`flex flex-nowrap justify-center items-center gap-1.5 px-4 pb-3 overflow-x-hidden ${rollingTranscript && showTranscript ? 'pt-1' : 'pt-3'}`}>
                                <button onClick={handleWhatToSay} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium text-slate-400 bg-white/5 border border-white/0 hover:text-slate-200 hover:bg-white/10 hover:border-white/5 transition-all active:scale-95 duration-200 interaction-base interaction-press whitespace-nowrap shrink-0">
                                    <Pencil className="w-3 h-3 opacity-70" /> 怎么回答？
                                </button>
                                <button onClick={() => handleFollowUp('shorten')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium text-slate-400 bg-white/5 border border-white/0 hover:text-slate-200 hover:bg-white/10 hover:border-white/5 transition-all active:scale-95 duration-200 interaction-base interaction-press whitespace-nowrap shrink-0">
                                    <MessageSquare className="w-3 h-3 opacity-70" /> 精简一下
                                </button>
                                <button onClick={handleRecap} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium text-slate-400 bg-white/5 border border-white/0 hover:text-slate-200 hover:bg-white/10 hover:border-white/5 transition-all active:scale-95 duration-200 interaction-base interaction-press whitespace-nowrap shrink-0">
                                    <RefreshCw className="w-3 h-3 opacity-70" /> 总结一下
                                </button>
                                <button onClick={handleFollowUpQuestions} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium text-slate-400 bg-white/5 border border-white/0 hover:text-slate-200 hover:bg-white/10 hover:border-white/5 transition-all active:scale-95 duration-200 interaction-base interaction-press whitespace-nowrap shrink-0">
                                    <HelpCircle className="w-3 h-3 opacity-70" /> 继续追问
                                </button>
                                <button
                                    onClick={handleAnswerNow}
                                    className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all active:scale-95 duration-200 interaction-base interaction-press min-w-[74px] whitespace-nowrap shrink-0 ${isManualRecording
                                        ? 'bg-red-500/10 text-red-400 ring-1 ring-red-500/20'
                                        : 'bg-white/5 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10'
                                        }`}
                                >
                                    {isManualRecording ? (
                                        <>
                                            <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                                            停止
                                        </>
                                    ) : (
                                        <><Zap className="w-3 h-3 opacity-70" /> 回答</>
                                    )}
                                </button>
                            </div>

                            {/* Input Area */}
                            <div className="p-3 pt-0">
                                {/* Latent Context Preview (Attached Screenshot) */}
                                {attachedContext.length > 0 && (
                                    <div className="mb-2 bg-white/5 border border-white/10 rounded-lg p-2 transition-all duration-200">
                                        <div className="flex items-center justify-between mb-1.5">
                                            <span className="text-[11px] font-medium text-white">
                                                已附加 {attachedContext.length} 张截图
                                            </span>
                                            <button
                                                onClick={() => setAttachedContext([])}
                                                className="p-1 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                        <div className="flex gap-1.5 overflow-x-auto max-w-full pb-1">
                                            {attachedContext.map((ctx, idx) => (
                                                <div key={ctx.path} className="relative group/thumb flex-shrink-0">
                                                    <img
                                                        src={ctx.preview}
                                                        alt={`Screenshot ${idx + 1}`}
                                                        className="h-10 w-auto rounded border border-white/20"
                                                    />
                                                    <button
                                                        onClick={() => setAttachedContext(prev => prev.filter((_, i) => i !== idx))}
                                                        className="absolute -top-1 -right-1 w-4 h-4 bg-red-500/80 hover:bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity"
                                                        title="移除"
                                                    >
                                                        <X className="w-2.5 h-2.5 text-white" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                        <span className="text-[10px] text-slate-400">输入问题，或直接点击“回答”</span>
                                    </div>
                                )}

                                <div className="relative group">
                                    <input
                                        ref={textInputRef}
                                        type="text"
                                        value={inputValue}
                                        onChange={(e) => setInputValue(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}

                                        className="
                                    w-full 
                                    bg-[#1E1E1E] 
                                    hover:bg-[#252525] 
                                    focus:bg-[#1E1E1E]
                                    border border-white/5 
                                    focus:border-white/10
                                    focus:ring-1 focus:ring-white/10
                                    rounded-xl 
                                    pl-3 pr-10 py-2.5 
                                    text-slate-200 
                                    focus:outline-none 
                                    transition-all duration-200 ease-sculpted
                                    text-[13px] leading-relaxed
                                    placeholder:text-slate-500
                                "
                                    />

                                    {/* Custom Rich Placeholder */}
                                    {!inputValue && (
                                        <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none text-[13px] text-slate-400">
                                            <span>可以问屏幕内容或当前对话里的任何问题，或者</span>
                                            <div className="flex items-center gap-1 opacity-80">
                                                {(shortcuts.selectiveScreenshot || ['⌘', 'Shift', 'H']).map((key, i) => (
                                                    <React.Fragment key={i}>
                                                        {i > 0 && <span className="text-[10px]">+</span>}
                                                        <kbd className="px-1.5 py-0.5 rounded border border-white/10 bg-white/5 text-[10px] font-sans min-w-[20px] text-center">{key}</kbd>
                                                    </React.Fragment>
                                                ))}
                                            </div>
                                            <span>进行区域截图</span>
                                        </div>
                                    )}

                                    {!inputValue && (
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none opacity-20">
                                            <span className="text-[10px]">↵</span>
                                        </div>
                                    )}
                                </div>

                                {/* Bottom Row */}
                                <div className="flex items-center justify-between mt-3 px-0.5">
                                    <div className="flex items-center gap-1.5">
                                        <button
                                            onClick={(e) => {
                                                // Calculate position for detached window
                                                if (!contentRef.current) return;
                                                const contentRect = contentRef.current.getBoundingClientRect();
                                                const buttonRect = e.currentTarget.getBoundingClientRect();
                                                const GAP = 8;

                                                const x = window.screenX + buttonRect.left;
                                                const y = window.screenY + contentRect.bottom + GAP;

                                                window.electronAPI.toggleModelSelector({ x, y });
                                            }}
                                            className={`
                                                flex items-center gap-2 px-3 py-1.5 
                                                border border-white/10 rounded-lg transition-colors 
                                                text-xs font-medium w-[140px]
                                                interaction-base interaction-press
                                                bg-black/20 text-white/70 hover:bg-white/5 hover:text-white
                                            `}
                                        >
                                            <span className="truncate min-w-0 flex-1">
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

                                        <div className="w-px h-3 bg-white/10 mx-1" />

                                        {/* Settings Gear */}
                                        <div className="relative">
                                            <button
                                                onClick={(e) => {
                                                    if (isSettingsOpen) {
                                                        // If open, just close it (toggle will handle logic but we can be explicit or just toggle)
                                                        // Actually toggle-settings-window handles hiding if visible, so logic is same.
                                                        window.electronAPI.toggleSettingsWindow();
                                                        return;
                                                    }

                                                    if (!contentRef.current) return;

                                                    const contentRect = contentRef.current.getBoundingClientRect();
                                                    const buttonRect = e.currentTarget.getBoundingClientRect();
                                                    const POPUP_WIDTH = 270; // Matches SettingsWindowHelper actual width
                                                    const GAP = 8; // Same gap as between TopPill and main body (gap-2 = 8px)

                                                    // X: Left-aligned relative to the Settings Button
                                                    const x = window.screenX + buttonRect.left;

                                                    // Y: Below the main content + gap
                                                    const y = window.screenY + contentRect.bottom + GAP;

                                                    window.electronAPI.toggleSettingsWindow({ x, y });
                                                }}
                                                className={`
                                            w-7 h-7 flex items-center justify-center rounded-lg 
                                            interaction-base interaction-press
                                            ${isSettingsOpen ? 'text-white bg-white/10' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}
                                        `}
                                                title="设置"
                                            >
                                                <SlidersHorizontal className="w-3.5 h-3.5" />
                                            </button>
                                        </div>

                                    </div>

                                    <button
                                        onClick={handleManualSubmit}
                                        disabled={!inputValue.trim()}
                                        className={`
                                    w-7 h-7 rounded-full flex items-center justify-center 
                                    interaction-base interaction-press
                                    ${inputValue.trim()
                                                ? 'bg-[#007AFF] text-white shadow-lg shadow-blue-500/20 hover:bg-[#0071E3]'
                                                : 'bg-white/5 text-white/10 cursor-not-allowed'
                                            }
                                `}
                                    >
                                        <ArrowRight className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default NativelyInterface;
