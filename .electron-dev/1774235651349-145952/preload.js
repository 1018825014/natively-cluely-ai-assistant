"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROCESSING_EVENTS = void 0;
const electron_1 = require("electron");
const formatRendererValue = (value) => {
    if (value instanceof Error) {
        return value.stack || value.message;
    }
    if (typeof value === "string") {
        return value;
    }
    try {
        return JSON.stringify(value, null, 2);
    }
    catch {
        return String(value);
    }
};
const sendRendererLog = (payload) => {
    try {
        electron_1.ipcRenderer.send("runtime-log:renderer-report", payload);
    }
    catch {
        // Logging must never break renderer startup.
    }
};
if (typeof window !== "undefined") {
    window.addEventListener("error", (event) => {
        sendRendererLog({
            level: "error",
            type: "window-error",
            source: "renderer-window",
            message: event.message || "Unhandled renderer error",
            stack: event.error instanceof Error ? event.error.stack : undefined,
            details: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : undefined,
            windowUrl: window.location.href,
        });
    });
    window.addEventListener("unhandledrejection", (event) => {
        sendRendererLog({
            level: "error",
            type: "unhandledrejection",
            source: "renderer-window",
            message: "Unhandled promise rejection",
            details: formatRendererValue(event.reason),
            windowUrl: window.location.href,
        });
    });
}
exports.PROCESSING_EVENTS = {
    //global states
    UNAUTHORIZED: "procesing-unauthorized",
    NO_SCREENSHOTS: "processing-no-screenshots",
    //states for generating the initial solution
    INITIAL_START: "initial-start",
    PROBLEM_EXTRACTED: "problem-extracted",
    SOLUTION_SUCCESS: "solution-success",
    INITIAL_SOLUTION_ERROR: "solution-error",
    //states for processing the debugging
    DEBUG_START: "debug-start",
    DEBUG_SUCCESS: "debug-success",
    DEBUG_ERROR: "debug-error"
};
// Expose the Electron API to the renderer process
electron_1.contextBridge.exposeInMainWorld("electronAPI", {
    updateContentDimensions: (dimensions) => electron_1.ipcRenderer.invoke("update-content-dimensions", dimensions),
    setOverlayBounds: (bounds) => electron_1.ipcRenderer.invoke("set-overlay-bounds", bounds),
    maximizeOverlayToWorkArea: () => electron_1.ipcRenderer.invoke("maximize-overlay-to-work-area"),
    restoreOverlayBounds: () => electron_1.ipcRenderer.invoke("restore-overlay-bounds"),
    getRecognitionLanguages: () => electron_1.ipcRenderer.invoke("get-recognition-languages"),
    takeScreenshot: () => electron_1.ipcRenderer.invoke("take-screenshot"),
    takeSelectiveScreenshot: () => electron_1.ipcRenderer.invoke("take-selective-screenshot"),
    getScreenshots: () => electron_1.ipcRenderer.invoke("get-screenshots"),
    deleteScreenshot: (path) => electron_1.ipcRenderer.invoke("delete-screenshot", path),
    // Event listeners
    onScreenshotTaken: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on("screenshot-taken", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("screenshot-taken", subscription);
        };
    },
    onScreenshotAttached: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on("screenshot-attached", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("screenshot-attached", subscription);
        };
    },
    onSolutionsReady: (callback) => {
        const subscription = (_, solutions) => callback(solutions);
        electron_1.ipcRenderer.on("solutions-ready", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("solutions-ready", subscription);
        };
    },
    onResetView: (callback) => {
        const subscription = () => callback();
        electron_1.ipcRenderer.on("reset-view", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("reset-view", subscription);
        };
    },
    onSolutionStart: (callback) => {
        const subscription = () => callback();
        electron_1.ipcRenderer.on(exports.PROCESSING_EVENTS.INITIAL_START, subscription);
        return () => {
            electron_1.ipcRenderer.removeListener(exports.PROCESSING_EVENTS.INITIAL_START, subscription);
        };
    },
    onDebugStart: (callback) => {
        const subscription = () => callback();
        electron_1.ipcRenderer.on(exports.PROCESSING_EVENTS.DEBUG_START, subscription);
        return () => {
            electron_1.ipcRenderer.removeListener(exports.PROCESSING_EVENTS.DEBUG_START, subscription);
        };
    },
    onDebugSuccess: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on("debug-success", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("debug-success", subscription);
        };
    },
    onDebugError: (callback) => {
        const subscription = (_, error) => callback(error);
        electron_1.ipcRenderer.on(exports.PROCESSING_EVENTS.DEBUG_ERROR, subscription);
        return () => {
            electron_1.ipcRenderer.removeListener(exports.PROCESSING_EVENTS.DEBUG_ERROR, subscription);
        };
    },
    onSolutionError: (callback) => {
        const subscription = (_, error) => callback(error);
        electron_1.ipcRenderer.on(exports.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR, subscription);
        return () => {
            electron_1.ipcRenderer.removeListener(exports.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR, subscription);
        };
    },
    onProcessingNoScreenshots: (callback) => {
        const subscription = () => callback();
        electron_1.ipcRenderer.on(exports.PROCESSING_EVENTS.NO_SCREENSHOTS, subscription);
        return () => {
            electron_1.ipcRenderer.removeListener(exports.PROCESSING_EVENTS.NO_SCREENSHOTS, subscription);
        };
    },
    onProblemExtracted: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on(exports.PROCESSING_EVENTS.PROBLEM_EXTRACTED, subscription);
        return () => {
            electron_1.ipcRenderer.removeListener(exports.PROCESSING_EVENTS.PROBLEM_EXTRACTED, subscription);
        };
    },
    onSolutionSuccess: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on(exports.PROCESSING_EVENTS.SOLUTION_SUCCESS, subscription);
        return () => {
            electron_1.ipcRenderer.removeListener(exports.PROCESSING_EVENTS.SOLUTION_SUCCESS, subscription);
        };
    },
    onUnauthorized: (callback) => {
        const subscription = () => callback();
        electron_1.ipcRenderer.on(exports.PROCESSING_EVENTS.UNAUTHORIZED, subscription);
        return () => {
            electron_1.ipcRenderer.removeListener(exports.PROCESSING_EVENTS.UNAUTHORIZED, subscription);
        };
    },
    moveWindowLeft: () => electron_1.ipcRenderer.invoke("move-window-left"),
    moveWindowRight: () => electron_1.ipcRenderer.invoke("move-window-right"),
    moveWindowUp: () => electron_1.ipcRenderer.invoke("move-window-up"),
    moveWindowDown: () => electron_1.ipcRenderer.invoke("move-window-down"),
    analyzeImageFile: (path, traceContext) => electron_1.ipcRenderer.invoke("analyze-image-file", path, traceContext),
    quitApp: () => electron_1.ipcRenderer.invoke("quit-app"),
    getRuntimeLogInfo: () => electron_1.ipcRenderer.invoke("runtime-log:get-info"),
    getRuntimeLogEntries: (query) => electron_1.ipcRenderer.invoke("runtime-log:get-entries", query),
    openRuntimeLogDirectory: () => electron_1.ipcRenderer.invoke("runtime-log:open-directory"),
    getLlmTraceInfo: () => electron_1.ipcRenderer.invoke("llm-trace:get-info"),
    getLlmTraceActions: (query) => electron_1.ipcRenderer.invoke("llm-trace:get-actions", query),
    openLlmTraceDirectory: () => electron_1.ipcRenderer.invoke("llm-trace:open-directory"),
    clearLlmTraceSession: () => electron_1.ipcRenderer.invoke("llm-trace:clear-session"),
    onLlmTraceUpdate: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on("llm-trace:update", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("llm-trace:update", subscription);
        };
    },
    logErrorToMain: (payload) => sendRendererLog(payload),
    toggleWindow: () => electron_1.ipcRenderer.invoke("toggle-window"),
    showWindow: () => electron_1.ipcRenderer.invoke("show-window"),
    hideWindow: () => electron_1.ipcRenderer.invoke("hide-window"),
    getOverlayWindowState: () => electron_1.ipcRenderer.invoke("get-overlay-window-state"),
    toggleAdvancedSettings: () => electron_1.ipcRenderer.invoke("toggle-advanced-settings"),
    openExternal: (url) => electron_1.ipcRenderer.invoke("open-external", url),
    setUndetectable: (state) => electron_1.ipcRenderer.invoke("set-undetectable", state),
    getUndetectable: () => electron_1.ipcRenderer.invoke("get-undetectable"),
    setOpenAtLogin: (open) => electron_1.ipcRenderer.invoke("set-open-at-login", open),
    getOpenAtLogin: () => electron_1.ipcRenderer.invoke("get-open-at-login"),
    setDisguise: (mode) => electron_1.ipcRenderer.invoke("set-disguise", mode),
    getDisguise: () => electron_1.ipcRenderer.invoke("get-disguise"),
    onDisguiseChanged: (callback) => {
        const subscription = (_, mode) => callback(mode);
        electron_1.ipcRenderer.on('disguise-changed', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('disguise-changed', subscription);
        };
    },
    onSettingsVisibilityChange: (callback) => {
        const subscription = (_, isVisible) => callback(isVisible);
        electron_1.ipcRenderer.on("settings-visibility-changed", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("settings-visibility-changed", subscription);
        };
    },
    onToggleExpand: (callback) => {
        const subscription = () => callback();
        electron_1.ipcRenderer.on("toggle-expand", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("toggle-expand", subscription);
        };
    },
    onWindowVisibilityChanged: (callback) => {
        const subscription = (_, state) => callback(state);
        electron_1.ipcRenderer.on("window-visibility-changed", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("window-visibility-changed", subscription);
        };
    },
    // LLM Model Management
    getCurrentLlmConfig: () => electron_1.ipcRenderer.invoke("get-current-llm-config"),
    getAvailableOllamaModels: () => electron_1.ipcRenderer.invoke("get-available-ollama-models"),
    switchToOllama: (model, url) => electron_1.ipcRenderer.invoke("switch-to-ollama", model, url),
    switchToGemini: (apiKey, modelId) => electron_1.ipcRenderer.invoke("switch-to-gemini", apiKey, modelId),
    testLlmConnection: (provider, config) => electron_1.ipcRenderer.invoke("test-llm-connection", provider, config),
    selectServiceAccount: () => electron_1.ipcRenderer.invoke("select-service-account"),
    // API Key Management
    setGeminiApiKey: (apiKey) => electron_1.ipcRenderer.invoke("set-gemini-api-key", apiKey),
    setGroqApiKey: (apiKey) => electron_1.ipcRenderer.invoke("set-groq-api-key", apiKey),
    setOpenaiApiKey: (apiKey) => electron_1.ipcRenderer.invoke("set-openai-api-key", apiKey),
    setOpenaiProviderConfig: (config) => electron_1.ipcRenderer.invoke("set-openai-provider-config", config),
    setClaudeApiKey: (apiKey) => electron_1.ipcRenderer.invoke("set-claude-api-key", apiKey),
    setAlibabaLlmProviderConfig: (config) => electron_1.ipcRenderer.invoke("set-alibaba-llm-provider-config", config),
    getStoredCredentials: () => electron_1.ipcRenderer.invoke("get-stored-credentials"),
    // STT Provider Management
    setSttProvider: (provider) => electron_1.ipcRenderer.invoke("set-stt-provider", provider),
    getSttProvider: () => electron_1.ipcRenderer.invoke("get-stt-provider"),
    setGroqSttApiKey: (apiKey) => electron_1.ipcRenderer.invoke("set-groq-stt-api-key", apiKey),
    setOpenAiSttApiKey: (apiKey) => electron_1.ipcRenderer.invoke("set-openai-stt-api-key", apiKey),
    setDeepgramApiKey: (apiKey) => electron_1.ipcRenderer.invoke("set-deepgram-api-key", apiKey),
    setElevenLabsApiKey: (apiKey) => electron_1.ipcRenderer.invoke("set-elevenlabs-api-key", apiKey),
    setAzureApiKey: (apiKey) => electron_1.ipcRenderer.invoke("set-azure-api-key", apiKey),
    setAzureRegion: (region) => electron_1.ipcRenderer.invoke("set-azure-region", region),
    setIbmWatsonApiKey: (apiKey) => electron_1.ipcRenderer.invoke("set-ibmwatson-api-key", apiKey),
    setGroqSttModel: (model) => electron_1.ipcRenderer.invoke("set-groq-stt-model", model),
    setSonioxApiKey: (apiKey) => electron_1.ipcRenderer.invoke("set-soniox-api-key", apiKey),
    setAlibabaSttApiKey: (apiKey) => electron_1.ipcRenderer.invoke("set-alibaba-stt-api-key", apiKey),
    getTechnicalGlossary: () => electron_1.ipcRenderer.invoke("get-technical-glossary"),
    setTechnicalGlossary: (config) => electron_1.ipcRenderer.invoke("set-technical-glossary", config),
    testSttConnection: (provider, apiKey, region) => electron_1.ipcRenderer.invoke("test-stt-connection", provider, apiKey, region),
    startSttCompareSession: () => electron_1.ipcRenderer.invoke("start-stt-compare-session"),
    stopSttCompareSession: () => electron_1.ipcRenderer.invoke("stop-stt-compare-session"),
    getSttCompareResults: () => electron_1.ipcRenderer.invoke("get-stt-compare-results"),
    exportSttBenchmarkReport: () => electron_1.ipcRenderer.invoke("export-stt-benchmark-report"),
    onSttCompareUpdate: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on("stt-compare-update", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("stt-compare-update", subscription);
        };
    },
    // Native Audio Service Events
    onNativeAudioTranscript: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on("native-audio-transcript", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("native-audio-transcript", subscription);
        };
    },
    onNativeAudioSpeechEnded: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on("native-audio-speech-ended", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("native-audio-speech-ended", subscription);
        };
    },
    onNativeAudioSuggestion: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on("native-audio-suggestion", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("native-audio-suggestion", subscription);
        };
    },
    onNativeAudioConnected: (callback) => {
        const subscription = () => callback();
        electron_1.ipcRenderer.on("native-audio-connected", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("native-audio-connected", subscription);
        };
    },
    onNativeAudioDisconnected: (callback) => {
        const subscription = () => callback();
        electron_1.ipcRenderer.on("native-audio-disconnected", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("native-audio-disconnected", subscription);
        };
    },
    getLiveTranscriptState: () => electron_1.ipcRenderer.invoke("live-transcript:get-state"),
    editLiveTranscriptSegment: (payload) => electron_1.ipcRenderer.invoke("live-transcript:edit-segment", payload),
    commitLiveTranscriptSegment: (payload) => electron_1.ipcRenderer.invoke("live-transcript:commit-segment", payload),
    resyncLiveTranscriptRag: () => electron_1.ipcRenderer.invoke("live-transcript:resync-rag"),
    onLiveTranscriptUpdate: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on("live-transcript-update", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("live-transcript-update", subscription);
        };
    },
    onSuggestionGenerated: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on("suggestion-generated", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("suggestion-generated", subscription);
        };
    },
    onSuggestionProcessingStart: (callback) => {
        const subscription = () => callback();
        electron_1.ipcRenderer.on("suggestion-processing-start", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("suggestion-processing-start", subscription);
        };
    },
    onSuggestionError: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on("suggestion-error", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("suggestion-error", subscription);
        };
    },
    generateSuggestion: (context, lastQuestion) => electron_1.ipcRenderer.invoke("generate-suggestion", context, lastQuestion),
    getNativeAudioStatus: () => electron_1.ipcRenderer.invoke("native-audio-status"),
    getInputDevices: () => electron_1.ipcRenderer.invoke("get-input-devices"),
    getOutputDevices: () => electron_1.ipcRenderer.invoke("get-output-devices"),
    setRecognitionLanguage: (key) => electron_1.ipcRenderer.invoke("set-recognition-language", key),
    getAiResponseLanguages: () => electron_1.ipcRenderer.invoke("get-ai-response-languages"),
    setAiResponseLanguage: (language) => electron_1.ipcRenderer.invoke("set-ai-response-language", language),
    getSttLanguage: () => electron_1.ipcRenderer.invoke("get-stt-language"),
    getAiResponseLanguage: () => electron_1.ipcRenderer.invoke("get-ai-response-language"),
    // Intelligence Mode IPC
    generateAssist: () => electron_1.ipcRenderer.invoke("generate-assist"),
    generateWhatToSay: (question, imagePaths, requestId) => electron_1.ipcRenderer.invoke("generate-what-to-say", question, imagePaths, requestId),
    generateFollowUp: (intent, userRequest, source) => electron_1.ipcRenderer.invoke("generate-follow-up", intent, userRequest, source),
    generateFollowUpQuestions: () => electron_1.ipcRenderer.invoke("generate-follow-up-questions"),
    generateRecap: () => electron_1.ipcRenderer.invoke("generate-recap"),
    submitManualQuestion: (question) => electron_1.ipcRenderer.invoke("submit-manual-question", question),
    getIntelligenceContext: () => electron_1.ipcRenderer.invoke("get-intelligence-context"),
    resetIntelligence: () => electron_1.ipcRenderer.invoke("reset-intelligence"),
    // Meeting Lifecycle
    startMeeting: (metadata) => electron_1.ipcRenderer.invoke("start-meeting", metadata),
    endMeeting: () => electron_1.ipcRenderer.invoke("end-meeting"),
    finalizeMicSTT: () => electron_1.ipcRenderer.invoke("finalize-mic-stt"),
    getRecentMeetings: () => electron_1.ipcRenderer.invoke("get-recent-meetings"),
    getMeetingDetails: (id) => electron_1.ipcRenderer.invoke("get-meeting-details", id),
    updateMeetingTitle: (id, title) => electron_1.ipcRenderer.invoke("update-meeting-title", { id, title }),
    updateMeetingSummary: (id, updates) => electron_1.ipcRenderer.invoke("update-meeting-summary", { id, updates }),
    deleteMeeting: (id) => electron_1.ipcRenderer.invoke("delete-meeting", id),
    onMeetingsUpdated: (callback) => {
        const subscription = () => callback();
        electron_1.ipcRenderer.on("meetings-updated", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("meetings-updated", subscription);
        };
    },
    // Window Mode
    setWindowMode: (mode) => electron_1.ipcRenderer.invoke("set-window-mode", mode),
    // Intelligence Mode Events
    onIntelligenceAssistUpdate: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on("intelligence-assist-update", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("intelligence-assist-update", subscription);
        };
    },
    onIntelligenceSuggestedAnswerToken: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on("intelligence-suggested-answer-token", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("intelligence-suggested-answer-token", subscription);
        };
    },
    onIntelligenceSuggestedAnswerStatus: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on("intelligence-suggested-answer-status", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("intelligence-suggested-answer-status", subscription);
        };
    },
    onIntelligenceSuggestedAnswer: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on("intelligence-suggested-answer", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("intelligence-suggested-answer", subscription);
        };
    },
    onIntelligenceRefinedAnswerToken: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on("intelligence-refined-answer-token", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("intelligence-refined-answer-token", subscription);
        };
    },
    onIntelligenceRefinedAnswer: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on("intelligence-refined-answer", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("intelligence-refined-answer", subscription);
        };
    },
    onIntelligenceRecapToken: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on("intelligence-recap-token", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("intelligence-recap-token", subscription);
        };
    },
    onIntelligenceRecap: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on("intelligence-recap", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("intelligence-recap", subscription);
        };
    },
    onIntelligenceFollowUpQuestionsToken: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on("intelligence-follow-up-questions-token", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("intelligence-follow-up-questions-token", subscription);
        };
    },
    onIntelligenceFollowUpQuestionsUpdate: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on("intelligence-follow-up-questions-update", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("intelligence-follow-up-questions-update", subscription);
        };
    },
    onIntelligenceManualStarted: (callback) => {
        const subscription = () => callback();
        electron_1.ipcRenderer.on("intelligence-manual-started", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("intelligence-manual-started", subscription);
        };
    },
    onIntelligenceManualResult: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on("intelligence-manual-result", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("intelligence-manual-result", subscription);
        };
    },
    onIntelligenceModeChanged: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on("intelligence-mode-changed", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("intelligence-mode-changed", subscription);
        };
    },
    onIntelligenceError: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on("intelligence-error", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("intelligence-error", subscription);
        };
    },
    onSessionReset: (callback) => {
        const subscription = () => callback();
        electron_1.ipcRenderer.on("session-reset", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("session-reset", subscription);
        };
    },
    // Streaming Chat
    streamGeminiChat: (message, imagePaths, context, options) => electron_1.ipcRenderer.invoke("gemini-chat-stream", message, imagePaths, context, options),
    onGeminiStreamToken: (callback) => {
        const subscription = (_, token) => callback(token);
        electron_1.ipcRenderer.on("gemini-stream-token", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("gemini-stream-token", subscription);
        };
    },
    onGeminiStreamDone: (callback) => {
        const subscription = () => callback();
        electron_1.ipcRenderer.on("gemini-stream-done", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("gemini-stream-done", subscription);
        };
    },
    onGeminiStreamError: (callback) => {
        const subscription = (_, error) => callback(error);
        electron_1.ipcRenderer.on("gemini-stream-error", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("gemini-stream-error", subscription);
        };
    },
    // Model Management
    getDefaultModel: () => electron_1.ipcRenderer.invoke('get-default-model'),
    setModel: (modelId) => electron_1.ipcRenderer.invoke('set-model', modelId),
    setDefaultModel: (modelId) => electron_1.ipcRenderer.invoke('set-default-model', modelId),
    toggleModelSelector: (coords) => electron_1.ipcRenderer.invoke('toggle-model-selector', coords),
    forceRestartOllama: () => electron_1.ipcRenderer.invoke('force-restart-ollama'),
    // Settings Window
    toggleSettingsWindow: (coords) => electron_1.ipcRenderer.invoke('toggle-settings-window', coords),
    // Groq Fast Text Mode
    getGroqFastTextMode: () => electron_1.ipcRenderer.invoke('get-groq-fast-text-mode'),
    setGroqFastTextMode: (enabled) => electron_1.ipcRenderer.invoke('set-groq-fast-text-mode', enabled),
    // Demo
    seedDemo: () => electron_1.ipcRenderer.invoke('seed-demo'),
    // Custom Providers
    saveCustomProvider: (provider) => electron_1.ipcRenderer.invoke('save-custom-provider', provider),
    getCustomProviders: () => electron_1.ipcRenderer.invoke('get-custom-providers'),
    deleteCustomProvider: (id) => electron_1.ipcRenderer.invoke('delete-custom-provider', id),
    testCustomProviderConnection: (provider) => electron_1.ipcRenderer.invoke('test-custom-provider-connection', provider),
    // Follow-up Email
    generateFollowupEmail: (input) => electron_1.ipcRenderer.invoke('generate-followup-email', input),
    extractEmailsFromTranscript: (transcript) => electron_1.ipcRenderer.invoke('extract-emails-from-transcript', transcript),
    getCalendarAttendees: (eventId) => electron_1.ipcRenderer.invoke('get-calendar-attendees', eventId),
    openMailto: (params) => electron_1.ipcRenderer.invoke('open-mailto', params),
    // Audio Test
    startAudioTest: (deviceId) => electron_1.ipcRenderer.invoke('start-audio-test', deviceId),
    stopAudioTest: () => electron_1.ipcRenderer.invoke('stop-audio-test'),
    onAudioTestLevel: (callback) => {
        const subscription = (_, level) => callback(level);
        electron_1.ipcRenderer.on('audio-test-level', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('audio-test-level', subscription);
        };
    },
    // Database
    flushDatabase: () => electron_1.ipcRenderer.invoke('flush-database'),
    onUndetectableChanged: (callback) => {
        const subscription = (_, state) => callback(state);
        electron_1.ipcRenderer.on('undetectable-changed', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('undetectable-changed', subscription);
        };
    },
    onGroqFastTextChanged: (callback) => {
        const subscription = (_, enabled) => callback(enabled);
        electron_1.ipcRenderer.on('groq-fast-text-changed', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('groq-fast-text-changed', subscription);
        };
    },
    onModelChanged: (callback) => {
        const subscription = (_, modelId) => callback(modelId);
        electron_1.ipcRenderer.on('model-changed', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('model-changed', subscription);
        };
    },
    onOllamaPullProgress: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on('ollama:pull-progress', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('ollama:pull-progress', subscription);
        };
    },
    onOllamaPullComplete: (callback) => {
        const subscription = () => callback();
        electron_1.ipcRenderer.on('ollama:pull-complete', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('ollama:pull-complete', subscription);
        };
    },
    // Theme API
    getThemeMode: () => electron_1.ipcRenderer.invoke('theme:get-mode'),
    setThemeMode: (mode) => electron_1.ipcRenderer.invoke('theme:set-mode', mode),
    onThemeChanged: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on('theme:changed', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('theme:changed', subscription);
        };
    },
    // Calendar API
    calendarConnect: () => electron_1.ipcRenderer.invoke('calendar-connect'),
    calendarDisconnect: () => electron_1.ipcRenderer.invoke('calendar-disconnect'),
    getCalendarStatus: () => electron_1.ipcRenderer.invoke('get-calendar-status'),
    getUpcomingEvents: () => electron_1.ipcRenderer.invoke('get-upcoming-events'),
    calendarRefresh: () => electron_1.ipcRenderer.invoke('calendar-refresh'),
    // Auto-Update
    onUpdateAvailable: (callback) => {
        const subscription = (_, info) => callback(info);
        electron_1.ipcRenderer.on("update-available", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("update-available", subscription);
        };
    },
    onUpdateDownloaded: (callback) => {
        const subscription = (_, info) => callback(info);
        electron_1.ipcRenderer.on("update-downloaded", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("update-downloaded", subscription);
        };
    },
    onUpdateChecking: (callback) => {
        const subscription = () => callback();
        electron_1.ipcRenderer.on("update-checking", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("update-checking", subscription);
        };
    },
    onUpdateNotAvailable: (callback) => {
        const subscription = (_, info) => callback(info);
        electron_1.ipcRenderer.on("update-not-available", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("update-not-available", subscription);
        };
    },
    onUpdateError: (callback) => {
        const subscription = (_, err) => callback(err);
        electron_1.ipcRenderer.on("update-error", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("update-error", subscription);
        };
    },
    onDownloadProgress: (callback) => {
        const subscription = (_, progressObj) => callback(progressObj);
        electron_1.ipcRenderer.on("download-progress", subscription);
        return () => {
            electron_1.ipcRenderer.removeListener("download-progress", subscription);
        };
    },
    restartAndInstall: () => electron_1.ipcRenderer.invoke("quit-and-install-update"),
    checkForUpdates: () => electron_1.ipcRenderer.invoke("check-for-updates"),
    downloadUpdate: () => electron_1.ipcRenderer.invoke("download-update"),
    testReleaseFetch: () => electron_1.ipcRenderer.invoke("test-release-fetch"),
    // RAG API
    ragQueryMeeting: (meetingId, query, traceContext) => electron_1.ipcRenderer.invoke('rag:query-meeting', { meetingId, query, traceContext }),
    ragQueryLive: (query, traceContext) => electron_1.ipcRenderer.invoke('rag:query-live', { query, traceContext }),
    ragQueryGlobal: (query, traceContext) => electron_1.ipcRenderer.invoke('rag:query-global', { query, traceContext }),
    ragCancelQuery: (options) => electron_1.ipcRenderer.invoke('rag:cancel-query', options),
    ragIsMeetingProcessed: (meetingId) => electron_1.ipcRenderer.invoke('rag:is-meeting-processed', meetingId),
    ragGetQueueStatus: () => electron_1.ipcRenderer.invoke('rag:get-queue-status'),
    ragRetryEmbeddings: () => electron_1.ipcRenderer.invoke('rag:retry-embeddings'),
    onIncompatibleProviderWarning: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on('embedding:incompatible-provider-warning', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('embedding:incompatible-provider-warning', subscription);
        };
    },
    reindexIncompatibleMeetings: () => electron_1.ipcRenderer.invoke('rag:reindex-incompatible-meetings'),
    onRAGStreamChunk: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on('rag:stream-chunk', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('rag:stream-chunk', subscription);
        };
    },
    onRAGStreamComplete: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on('rag:stream-complete', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('rag:stream-complete', subscription);
        };
    },
    onRAGStreamError: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on('rag:stream-error', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('rag:stream-error', subscription);
        };
    },
    // Keybind Management
    getKeybinds: () => electron_1.ipcRenderer.invoke('keybinds:get-all'),
    setKeybind: (id, accelerator) => electron_1.ipcRenderer.invoke('keybinds:set', id, accelerator),
    resetKeybinds: () => electron_1.ipcRenderer.invoke('keybinds:reset'),
    onKeybindsUpdate: (callback) => {
        const subscription = (_, keybinds) => callback(keybinds);
        electron_1.ipcRenderer.on('keybinds:update', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('keybinds:update', subscription);
        };
    },
    // Donation API
    getDonationStatus: () => electron_1.ipcRenderer.invoke("get-donation-status"),
    markDonationToastShown: () => electron_1.ipcRenderer.invoke("mark-donation-toast-shown"),
    setDonationComplete: () => electron_1.ipcRenderer.invoke('set-donation-complete'),
    // Profile Engine API
    profileUploadResume: (filePath) => electron_1.ipcRenderer.invoke('profile:upload-resume', filePath),
    profileGetStatus: () => electron_1.ipcRenderer.invoke('profile:get-status'),
    profileSetMode: (enabled) => electron_1.ipcRenderer.invoke('profile:set-mode', enabled),
    profileDelete: () => electron_1.ipcRenderer.invoke('profile:delete'),
    profileGetProfile: () => electron_1.ipcRenderer.invoke('profile:get-profile'),
    profileSelectFile: () => electron_1.ipcRenderer.invoke('profile:select-file'),
    // JD & Research API
    profileUploadJD: (filePath) => electron_1.ipcRenderer.invoke('profile:upload-jd', filePath),
    profileDeleteJD: () => electron_1.ipcRenderer.invoke('profile:delete-jd'),
    profileResearchCompany: (companyName) => electron_1.ipcRenderer.invoke('profile:research-company', companyName),
    profileGenerateNegotiation: () => electron_1.ipcRenderer.invoke('profile:generate-negotiation'),
    // Project Library API
    projectLibraryListProjects: () => electron_1.ipcRenderer.invoke('projectLibrary:listProjects'),
    projectLibraryUpsertProject: (project) => electron_1.ipcRenderer.invoke('projectLibrary:upsertProject', project),
    projectLibraryAttachAssets: (payload) => electron_1.ipcRenderer.invoke('projectLibrary:attachAssets', payload),
    projectLibraryAttachRepo: (payload) => electron_1.ipcRenderer.invoke('projectLibrary:attachRepo', payload),
    projectLibraryGetProjectFacts: (projectId) => electron_1.ipcRenderer.invoke('projectLibrary:getProjectFacts', projectId),
    projectLibrarySetActiveProjects: (projectIds) => electron_1.ipcRenderer.invoke('projectLibrary:setActiveProjects', projectIds),
    projectLibrarySetAnswerMode: (mode) => electron_1.ipcRenderer.invoke('projectLibrary:setAnswerMode', mode),
    projectLibrarySetJDBias: (enabled) => electron_1.ipcRenderer.invoke('projectLibrary:setJDBias', enabled),
    projectLibrarySelectAssets: () => electron_1.ipcRenderer.invoke('projectLibrary:selectAssets'),
    projectLibrarySelectRepo: () => electron_1.ipcRenderer.invoke('projectLibrary:selectRepo'),
    // Google Search API
    setGoogleSearchApiKey: (apiKey) => electron_1.ipcRenderer.invoke('set-google-search-api-key', apiKey),
    setGoogleSearchCseId: (cseId) => electron_1.ipcRenderer.invoke('set-google-search-cse-id', cseId),
    // Dynamic Model Discovery
    fetchProviderModels: (provider, config) => electron_1.ipcRenderer.invoke('fetch-provider-models', provider, config),
    setProviderPreferredModel: (provider, modelId) => electron_1.ipcRenderer.invoke('set-provider-preferred-model', provider, modelId),
    // License Management
    licenseActivate: (key) => electron_1.ipcRenderer.invoke('license:activate', key),
    licenseCheckPremium: () => electron_1.ipcRenderer.invoke('license:check-premium'),
    licenseDeactivate: () => electron_1.ipcRenderer.invoke('license:deactivate'),
    licenseGetHardwareId: () => electron_1.ipcRenderer.invoke('license:get-hardware-id'),
    // Overlay Opacity (Stealth Mode)
    setOverlayOpacity: (opacity) => electron_1.ipcRenderer.invoke('set-overlay-opacity', opacity),
    onOverlayOpacityChanged: (callback) => {
        const subscription = (_, opacity) => callback(opacity);
        electron_1.ipcRenderer.on('overlay-opacity-changed', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('overlay-opacity-changed', subscription);
        };
    },
    // Cropper API
    cropperConfirmed: (bounds) => electron_1.ipcRenderer.send('cropper-confirmed', bounds),
    cropperCancelled: () => electron_1.ipcRenderer.send('cropper-cancelled'),
    onResetCropper: (callback) => {
        const subscription = (_, data) => callback(data);
        electron_1.ipcRenderer.on('reset-cropper', subscription);
        return () => {
            electron_1.ipcRenderer.removeListener('reset-cropper', subscription);
        };
    },
});
//# sourceMappingURL=preload.js.map
