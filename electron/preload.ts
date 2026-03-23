import { contextBridge, ipcRenderer } from "electron"

type LlmProviderConfig = {
  apiKey?: string
  baseUrl?: string
  preferredModel?: string
}

type LlmRuntimeProvider = "ollama" | "gemini" | "openai" | "alibaba" | "groq" | "claude" | "custom"

type OverlayWindowState = {
  visible: boolean
  mode: "launcher" | "overlay"
  overlayVisible: boolean
  launcherVisible: boolean
  overlayAlwaysOnTop: boolean
  overlayFocused: boolean
  isMaximized: boolean
  bounds: { x: number; y: number; width: number; height: number } | null
  restorableBounds: { x: number; y: number; width: number; height: number } | null
}

type NativeAudioTranscript = {
  speaker: string
  text: string
  final: boolean
  timestamp: number
  confidence: number
}

type NativeAudioSpeechEnded = {
  speaker: "interviewer" | "user"
  timestamp: number
}

type LiveTranscriptSegment = {
  id: string
  speaker: "interviewer" | "user"
  text: string
  timestamp: number
  updatedAt: number
  status: "active" | "final"
  edited: boolean
  lastProviderText: string
  confidence?: number
}

type RawInterviewerTranscriptEvent = {
  id: string
  text: string
  timestamp: number
  final: boolean
  confidence?: number
}

type RawInterviewerTranscriptState = {
  latest: RawInterviewerTranscriptEvent | null
  fullText: string
  events: RawInterviewerTranscriptEvent[]
}

type PromptLabActionId =
  | "what_to_answer"
  | "follow_up_refine"
  | "recap"
  | "follow_up_questions"
  | "answer"

type PromptLabFieldKind = "fixed" | "dynamic" | "runtime" | "transcript"

type PromptLabFieldPreview = {
  key: string
  label: string
  kind: PromptLabFieldKind
  editable: boolean
  scope: "fixed" | "meeting" | "runtime" | "transcript"
  text: string
  baseText: string
  charCount: number
  summaryStart: string
  summaryEnd: string
  overrideActive: boolean
  description?: string
}

type PromptLabTranscriptSummary = {
  key: string
  label: string
  speaker: "interviewer" | "user"
  turnCount: number
  charCount: number
  summaryStart: string
  summaryEnd: string
}

type PromptLabActionPreview = {
  action: PromptLabActionId
  title: string
  fixedPromptBase: string
  fixedPromptResolved: string
  fixedFields: PromptLabFieldPreview[]
  dynamicFields: PromptLabFieldPreview[]
  runtimeFields: PromptLabFieldPreview[]
  transcriptSummaries: PromptLabTranscriptSummary[]
  hasUserOverrides: boolean
  execution: {
    systemPrompt?: string
    contextPrompt?: string
    message?: string
    imagePaths: string[]
    runtime: Record<string, unknown>
  }
}

type RuntimeLogLevel = "debug" | "info" | "warn" | "error"

type RuntimeLogEntry = {
  timestamp: string
  level: RuntimeLogLevel
  source: string
  message: string
  details?: string
}

type LlmTraceActionType =
  | "what_to_answer"
  | "follow_up"
  | "recap"
  | "follow_up_questions"
  | "answer"
  | "manual_submit"
  | "image_analysis"
  | "rag_query_live"
  | "rag_query_meeting"
  | "rag_query_global"

type LlmTraceStepRecord = {
  id: string
  actionId: string
  kind: "transport" | "rag" | "app"
  stage: string
  lane?: string
  provider: string
  model: string
  method: string
  url: string
  requestHeaders: string
  requestBody: string
  responseStatus?: number
  responseHeaders: string
  responseBody: string
  durationMs?: number
  streamed: boolean
  truncated: boolean
  error?: string
  startedAt: string
  endedAt?: string
}

type LlmTraceActionRecord = {
  id: string
  sessionId: string
  type: LlmTraceActionType
  label: string
  requestId?: string
  startedAt: string
  endedAt?: string
  status: "running" | "completed" | "error"
  steps: LlmTraceStepRecord[]
  resolvedInput?: Record<string, unknown>
  error?: string
}

type LlmTraceActionContext = {
  actionId?: string
  type?: LlmTraceActionType
  label?: string
  requestId?: string
}

type RendererLogPayload = {
  level?: RuntimeLogLevel
  type?: string
  source?: string
  context?: string
  message?: string
  details?: string
  stack?: string
  componentStack?: string
  windowUrl?: string
}

const formatRendererValue = (value: unknown): string => {
  if (value instanceof Error) {
    return value.stack || value.message
  }

  if (typeof value === "string") {
    return value
  }

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const sendRendererLog = (payload: RendererLogPayload): void => {
  try {
    ipcRenderer.send("runtime-log:renderer-report", payload)
  } catch {
    // Logging must never break renderer startup.
  }
}

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
    })
  })

  window.addEventListener("unhandledrejection", (event) => {
    sendRendererLog({
      level: "error",
      type: "unhandledrejection",
      source: "renderer-window",
      message: "Unhandled promise rejection",
      details: formatRendererValue(event.reason),
      windowUrl: window.location.href,
    })
  })
}

// Types for the exposed Electron API
interface ElectronAPI {
  updateContentDimensions: (dimensions: {
    width: number
    height: number
  }) => Promise<void>
  setOverlayBounds: (bounds: {
    x: number
    y: number
    width: number
    height: number
  }) => Promise<{ success: boolean }>
  maximizeOverlayToWorkArea: () => Promise<OverlayWindowState>
  restoreOverlayBounds: () => Promise<OverlayWindowState>
  getRecognitionLanguages: () => Promise<Record<string, any>>
  getScreenshots: () => Promise<Array<{ path: string; preview: string }>>
  deleteScreenshot: (
    path: string
  ) => Promise<{ success: boolean; error?: string }>
  onScreenshotTaken: (
    callback: (data: { path: string; preview: string }) => void
  ) => () => void
  onScreenshotAttached: (
    callback: (data: { path: string; preview: string }) => void
  ) => () => void
  onSolutionsReady: (callback: (solutions: string) => void) => () => void
  onResetView: (callback: () => void) => () => void
  onSolutionStart: (callback: () => void) => () => void
  onDebugStart: (callback: () => void) => () => void
  onDebugSuccess: (callback: (data: any) => void) => () => void
  onSolutionError: (callback: (error: string) => void) => () => void
  onProcessingNoScreenshots: (callback: () => void) => () => void
  onProblemExtracted: (callback: (data: any) => void) => () => void
  onSolutionSuccess: (callback: (data: any) => void) => () => void

  onUnauthorized: (callback: () => void) => () => void
  onDebugError: (callback: (error: string) => void) => () => void
  takeScreenshot: () => Promise<void>
  takeSelectiveScreenshot: () => Promise<{ path: string; preview: string; cancelled?: boolean }>
  moveWindowLeft: () => Promise<void>
  moveWindowRight: () => Promise<void>
  moveWindowUp: () => Promise<void>
  moveWindowDown: () => Promise<void>

  analyzeImageFile: (path: string, traceContext?: LlmTraceActionContext) => Promise<void>
  quitApp: () => Promise<void>
  getRuntimeLogInfo: () => Promise<{ logDirectory: string; currentLogFile: string }>
  getRuntimeLogEntries: (query?: { limit?: number; levels?: RuntimeLogLevel[] }) => Promise<RuntimeLogEntry[]>
  openRuntimeLogDirectory: () => Promise<{ success: boolean; error?: string; logDirectory: string; currentLogFile: string }>
  getLlmTraceInfo: () => Promise<{ logDirectory: string; currentLogFile: string; sessionId: string }>
  getLlmTraceActions: (query?: { limit?: number; currentSessionOnly?: boolean; actionTypes?: LlmTraceActionType[] }) => Promise<LlmTraceActionRecord[]>
  openLlmTraceDirectory: () => Promise<{ success: boolean; error?: string; logDirectory: string; currentLogFile: string; sessionId: string }>
  clearLlmTraceSession: () => Promise<{ success: boolean; sessionId: string }>
  openTraceWindow: () => Promise<{ success: boolean }>
  getRawTranscriptState: () => Promise<RawInterviewerTranscriptState>
  openRawTranscriptWindow: () => Promise<{ success: boolean }>
  openSttCompareWindow: () => Promise<{ success: boolean }>
  openPromptLabWindow: (payload?: { action?: PromptLabActionId; context?: any }) => Promise<{ success: boolean }>
  getPromptLabActionPreview: (action: PromptLabActionId, context?: any) => Promise<PromptLabActionPreview>
  getPromptLabFixedOverrides: () => Promise<Record<string, any>>
  setPromptLabFixedOverride: (payload: { action: PromptLabActionId; fieldKey: string; value: string }) => Promise<{ success: boolean }>
  resetPromptLabFixedOverride: (payload: { action: PromptLabActionId; fieldKey: string }) => Promise<{ success: boolean }>
  setPromptLabDynamicOverride: (payload: { action: PromptLabActionId; fieldKey: string; value: string }) => Promise<{ success: boolean }>
  resetPromptLabDynamicOverride: (payload: { action: PromptLabActionId; fieldKey: string }) => Promise<{ success: boolean }>
  resetPromptLabActionDynamicOverrides: (payload: { action: PromptLabActionId }) => Promise<{ success: boolean }>
  onLlmTraceUpdate: (callback: (data: { kind: "upsert"; action: LlmTraceActionRecord } | { kind: "cleared"; sessionId: string }) => void) => () => void
  onPromptLabFocusAction: (callback: (action: PromptLabActionId) => void) => () => void
  logErrorToMain: (payload: RendererLogPayload) => void

  // LLM Model Management
  getCurrentLlmConfig: () => Promise<{ provider: LlmRuntimeProvider; model: string; isOllama: boolean }>
  getAvailableOllamaModels: () => Promise<string[]>
  switchToOllama: (model?: string, url?: string) => Promise<{ success: boolean; error?: string }>
  switchToGemini: (apiKey?: string, modelId?: string) => Promise<{ success: boolean; error?: string }>
  testLlmConnection: (provider: 'gemini' | 'groq' | 'openai' | 'claude' | 'alibaba', config?: LlmProviderConfig) => Promise<{ success: boolean; error?: string; diagnostics?: string[] }>
  selectServiceAccount: () => Promise<{ success: boolean; path?: string; cancelled?: boolean; error?: string }>

  // API Key Management
  setGeminiApiKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>
  setGroqApiKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>
  setOpenaiApiKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>
  setOpenaiProviderConfig: (config: LlmProviderConfig) => Promise<{ success: boolean; error?: string }>
  setClaudeApiKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>
  setAlibabaLlmProviderConfig: (config: LlmProviderConfig) => Promise<{ success: boolean; error?: string }>
  getStoredCredentials: () => Promise<{ hasGeminiKey: boolean; hasGroqKey: boolean; hasOpenaiKey: boolean; hasClaudeKey: boolean; hasAlibabaLlmKey: boolean; openaiBaseUrl?: string; alibabaLlmBaseUrl?: string; geminiPreferredModel?: string; groqPreferredModel?: string; openaiPreferredModel?: string; claudePreferredModel?: string; alibabaPreferredModel?: string; googleServiceAccountPath: string | null; sttProvider: string; hasSttGroqKey: boolean; hasSttOpenaiKey: boolean; hasDeepgramKey: boolean; hasElevenLabsKey: boolean; hasAzureKey: boolean; azureRegion: string; hasIbmWatsonKey: boolean; ibmWatsonRegion: string; hasSonioxKey: boolean; hasAlibabaKey: boolean; technicalGlossaryConfig?: any }>

  // STT Provider Management
  setSttProvider: (provider: 'google' | 'groq' | 'openai' | 'deepgram' | 'elevenlabs' | 'azure' | 'ibmwatson' | 'soniox' | 'alibaba') => Promise<{ success: boolean; error?: string }>
  getSttProvider: () => Promise<string>
  setGroqSttApiKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>
  setOpenAiSttApiKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>
  setDeepgramApiKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>
  setElevenLabsApiKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>
  setAzureApiKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>
  setAzureRegion: (region: string) => Promise<{ success: boolean; error?: string }>
  setIbmWatsonApiKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>
  setGroqSttModel: (model: string) => Promise<{ success: boolean; error?: string }>
  setSonioxApiKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>
  setAlibabaSttApiKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>
  getTechnicalGlossary: () => Promise<any>
  setTechnicalGlossary: (config: any) => Promise<{ success: boolean; config?: any; warning?: string; error?: string }>
  testSttConnection: (provider: 'groq' | 'openai' | 'deepgram' | 'elevenlabs' | 'azure' | 'ibmwatson' | 'soniox' | 'alibaba', apiKey: string, region?: string) => Promise<{ success: boolean; error?: string }>
  startSttCompareSession: () => Promise<{ success: boolean; error?: string }>
  stopSttCompareSession: () => Promise<{ success: boolean; error?: string }>
  getSttCompareResults: () => Promise<any>
  exportSttBenchmarkReport: () => Promise<{ success: boolean; jsonPath?: string; markdownPath?: string; error?: string }>
  onSttCompareUpdate: (callback: (data: any) => void) => () => void

  // Native Audio Service Events
  onNativeAudioTranscript: (callback: (transcript: NativeAudioTranscript) => void) => () => void
  onNativeAudioSpeechEnded: (callback: (event: NativeAudioSpeechEnded) => void) => () => void
  onNativeAudioSuggestion: (callback: (suggestion: { context: string; lastQuestion: string; confidence: number }) => void) => () => void
  onNativeAudioConnected: (callback: () => void) => () => void
  onNativeAudioDisconnected: (callback: () => void) => () => void
  getLiveTranscriptState: () => Promise<LiveTranscriptSegment[]>
  editLiveTranscriptSegment: (payload: { id: string; text: string }) => Promise<{ success: boolean; segment?: LiveTranscriptSegment; state?: LiveTranscriptSegment[]; error?: string }>
  commitLiveTranscriptSegment: (payload?: { id?: string; speaker?: "interviewer" | "user" }) => Promise<{ success: boolean; segment?: LiveTranscriptSegment; state?: LiveTranscriptSegment[]; error?: string }>
  resyncLiveTranscriptRag: () => Promise<{ success: boolean; skipped?: boolean; error?: string }>
  onLiveTranscriptUpdate: (callback: (segments: LiveTranscriptSegment[]) => void) => () => void
  onSuggestionGenerated: (callback: (data: { question: string; suggestion: string; confidence: number }) => void) => () => void
  onSuggestionProcessingStart: (callback: () => void) => () => void
  onSuggestionError: (callback: (error: { error: string }) => void) => () => void
  generateSuggestion: (context: string, lastQuestion: string) => Promise<{ suggestion: string }>
  getInputDevices: () => Promise<Array<{ id: string; name: string }>>
  getOutputDevices: () => Promise<Array<{ id: string; name: string }>>
  setRecognitionLanguage: (key: string) => Promise<{ success: boolean; error?: string }>
  getAiResponseLanguages: () => Promise<Array<{ label: string; code: string }>>
  setAiResponseLanguage: (language: string) => Promise<{ success: boolean; error?: string }>
  getSttLanguage: () => Promise<string>
  getAiResponseLanguage: () => Promise<string>

  // Intelligence Mode IPC
  generateAssist: () => Promise<{ insight: string | null }>
  generateWhatToSay: (question?: string, imagePaths?: string[]) => Promise<{ answer: string | null; question?: string; error?: string }>
  generateFollowUp: (intent: string, userRequest?: string) => Promise<{ refined: string | null; intent: string }>
  generateRecap: () => Promise<{ summary: string | null }>
  submitManualQuestion: (question: string) => Promise<{ answer: string | null; question: string }>
  getIntelligenceContext: () => Promise<{ context: string; lastAssistantMessage: string | null; activeMode: string }>
  resetIntelligence: () => Promise<{ success: boolean; error?: string }>

  // Meeting Lifecycle
  startMeeting: (metadata?: any) => Promise<{ success: boolean; error?: string }>
  endMeeting: () => Promise<{ success: boolean; error?: string }>
  finalizeMicSTT: () => Promise<void>
  getRecentMeetings: () => Promise<Array<{ id: string; title: string; date: string; duration: string; summary: string }>>
  getMeetingDetails: (id: string) => Promise<any>
  updateMeetingTitle: (id: string, title: string) => Promise<boolean>
  updateMeetingSummary: (id: string, updates: { overview?: string, actionItems?: string[], keyPoints?: string[], actionItemsTitle?: string, keyPointsTitle?: string }) => Promise<boolean>
  onMeetingsUpdated: (callback: () => void) => () => void

  // Intelligence Mode Events
  onIntelligenceAssistUpdate: (callback: (data: { insight: string }) => void) => () => void
  onIntelligenceSuggestedAnswer: (callback: (data: { answer: string; question: string; confidence: number }) => void) => () => void
  onIntelligenceRefinedAnswer: (callback: (data: { answer: string; intent: string }) => void) => () => void
  onIntelligenceRecap: (callback: (data: { summary: string }) => void) => () => void
  onIntelligenceManualStarted: (callback: () => void) => () => void
  onIntelligenceManualResult: (callback: (data: { answer: string; question: string }) => void) => () => void
  onIntelligenceModeChanged: (callback: (data: { mode: string }) => void) => () => void
  onIntelligenceError: (callback: (data: { error: string; mode: string }) => void) => () => void

  // Model Management
  getDefaultModel: () => Promise<{ model: string }>
  setModel: (modelId: string) => Promise<{ success: boolean; error?: string }>
  setDefaultModel: (modelId: string) => Promise<{ success: boolean; error?: string }>
  toggleModelSelector: (coords: { x: number; y: number }) => Promise<void>
  forceRestartOllama: () => Promise<void>

  // Settings Window
  toggleSettingsWindow: (coords?: { x: number; y: number }) => Promise<void>

  // Groq Fast Text Mode
  getGroqFastTextMode: () => Promise<{ enabled: boolean }>
  setGroqFastTextMode: (enabled: boolean) => Promise<{ success: boolean; error?: string }>

  // Demo
  seedDemo: () => Promise<{ success: boolean }>

  // Custom Providers
  saveCustomProvider: (provider: any) => Promise<{ success: boolean; id?: string; error?: string }>
  getCustomProviders: () => Promise<any[]>
  deleteCustomProvider: (id: string) => Promise<{ success: boolean; error?: string }>

  // Follow-up Email
  generateFollowupEmail: (input: any) => Promise<string>
  extractEmailsFromTranscript: (transcript: Array<{ text: string }>) => Promise<string[]>
  getCalendarAttendees: (eventId: string) => Promise<Array<{ email: string; name: string }>>
  openMailto: (params: { to: string; subject: string; body: string }) => Promise<{ success: boolean; error?: string }>

  // Audio Test
  startAudioTest: (deviceId?: string) => Promise<{ success: boolean }>
  stopAudioTest: () => Promise<{ success: boolean }>
  onAudioTestLevel: (callback: (level: number) => void) => () => void

  // Database
  flushDatabase: () => Promise<{ success: boolean }>
  getOverlayWindowState: () => Promise<OverlayWindowState>
  showWindow: () => Promise<void>
  hideWindow: () => Promise<void>
  onToggleExpand: (callback: () => void) => () => void
  onWindowVisibilityChanged: (callback: (state: OverlayWindowState) => void) => () => void
  toggleAdvancedSettings: () => Promise<void>

  // Streaming listeners
  streamGeminiChat: (message: string, imagePaths?: string[], context?: string, options?: { skipSystemPrompt?: boolean; traceContext?: LlmTraceActionContext }) => Promise<void>
  onGeminiStreamToken: (callback: (token: string) => void) => () => void
  onGeminiStreamDone: (callback: () => void) => () => void
  onGeminiStreamError: (callback: (error: string) => void) => () => void


  onUndetectableChanged: (callback: (state: boolean) => void) => () => void
  onGroqFastTextChanged: (callback: (enabled: boolean) => void) => () => void
  onModelChanged: (callback: (modelId: string) => void) => () => void

  // Ollama
  onOllamaPullProgress: (callback: (data: { status: string; percent: number }) => void) => () => void
  onOllamaPullComplete: (callback: () => void) => () => void

  // Theme API
  getThemeMode: () => Promise<{ mode: 'system' | 'light' | 'dark', resolved: 'light' | 'dark' }>
  setThemeMode: (mode: 'system' | 'light' | 'dark') => Promise<void>
  onThemeChanged: (callback: (data: { mode: 'system' | 'light' | 'dark', resolved: 'light' | 'dark' }) => void) => () => void

  // Calendar
  calendarConnect: () => Promise<{ success: boolean; error?: string }>
  calendarDisconnect: () => Promise<{ success: boolean; error?: string }>
  getCalendarStatus: () => Promise<{ connected: boolean; email?: string }>
  getUpcomingEvents: () => Promise<Array<{ id: string; title: string; startTime: string; endTime: string; link?: string; source: 'google' }>>
  calendarRefresh: () => Promise<{ success: boolean; error?: string }>

  // Auto-Update
  onUpdateAvailable: (callback: (info: any) => void) => () => void
  onUpdateDownloaded: (callback: (info: any) => void) => () => void
  onUpdateChecking: (callback: () => void) => () => void
  onUpdateNotAvailable: (callback: (info: any) => void) => () => void
  onUpdateError: (callback: (err: string) => void) => () => void
  onDownloadProgress: (callback: (progressObj: any) => void) => () => void
  restartAndInstall: () => Promise<void>
  checkForUpdates: () => Promise<void>
  downloadUpdate: () => Promise<void>
  testReleaseFetch: () => Promise<{ success: boolean; error?: string }>

  // RAG (Retrieval-Augmented Generation) API
  ragQueryMeeting: (meetingId: string, query: string, traceContext?: LlmTraceActionContext) => Promise<{ success?: boolean; fallback?: boolean; error?: string }>
  ragQueryLive: (query: string, traceContext?: LlmTraceActionContext) => Promise<{ success?: boolean; fallback?: boolean; error?: string }>
  ragQueryGlobal: (query: string, traceContext?: LlmTraceActionContext) => Promise<{ success?: boolean; fallback?: boolean; error?: string }>
  ragCancelQuery: (options: { meetingId?: string; global?: boolean }) => Promise<{ success: boolean }>
  ragIsMeetingProcessed: (meetingId: string) => Promise<boolean>
  ragGetQueueStatus: () => Promise<{ pending: number; processing: number; completed: number; failed: number }>
  ragRetryEmbeddings: () => Promise<{ success: boolean }>
  onRAGStreamChunk: (callback: (data: { meetingId?: string; global?: boolean; chunk: string }) => void) => () => void
  onRAGStreamComplete: (callback: (data: { meetingId?: string; global?: boolean }) => void) => () => void
  onRAGStreamError: (callback: (data: { meetingId?: string; global?: boolean; error: string }) => void) => () => void

  // Keybind Management
  getKeybinds: () => Promise<Array<{ id: string; label: string; accelerator: string; isGlobal: boolean; defaultAccelerator: string }>>
  setKeybind: (id: string, accelerator: string) => Promise<boolean>
  resetKeybinds: () => Promise<Array<{ id: string; label: string; accelerator: string; isGlobal: boolean; defaultAccelerator: string }>>
  onKeybindsUpdate: (callback: (keybinds: Array<any>) => void) => () => void

  // Donation API
  getDonationStatus: () => Promise<{ shouldShow: boolean; hasDonated: boolean; lifetimeShows: number }>;
  markDonationToastShown: () => Promise<{ success: boolean }>;
  setDonationComplete: () => Promise<{ success: boolean }>;

  // Profile Engine API
  profileUploadResume: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  profileGetStatus: () => Promise<{ hasProfile: boolean; profileMode: boolean; name?: string; role?: string; totalExperienceYears?: number }>;
  profileSetMode: (enabled: boolean) => Promise<{ success: boolean; error?: string }>;
  profileDelete: () => Promise<{ success: boolean; error?: string }>;
  profileGetProfile: () => Promise<any>;
  profileSelectFile: () => Promise<{ success?: boolean; cancelled?: boolean; filePath?: string; error?: string }>;

  // JD & Research API
  profileUploadJD: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  profileDeleteJD: () => Promise<{ success: boolean; error?: string }>;
  profileResearchCompany: (companyName: string) => Promise<{ success: boolean; dossier?: any; error?: string }>;
  profileGenerateNegotiation: () => Promise<{ success: boolean; dossier?: any; profileData?: any; error?: string }>;

  // Project Library API
  projectLibraryListProjects: () => Promise<any[]>;
  projectLibraryUpsertProject: (project: any) => Promise<{ success: boolean; project?: any; error?: string }>;
  projectLibraryAttachAssets: (payload: { projectId: string; filePaths: string[] }) => Promise<{ success: boolean; attached?: Array<{ name: string; kind: string }>; error?: string }>;
  projectLibraryAttachRepo: (payload: { projectId: string; repoPath: string }) => Promise<{ success: boolean; attachedCount?: number; repoPath?: string; error?: string }>;
  projectLibraryGetProjectFacts: (projectId: string) => Promise<any>;
  projectLibrarySetActiveProjects: (projectIds: string[]) => Promise<{ success: boolean; state?: any; error?: string }>;
  projectLibrarySetAnswerMode: (mode: 'strict' | 'polished') => Promise<{ success: boolean; state?: any; error?: string }>;
  projectLibrarySetJDBias: (enabled: boolean) => Promise<{ success: boolean; state?: any; error?: string }>;
  projectLibrarySelectAssets: () => Promise<{ success?: boolean; cancelled?: boolean; filePaths?: string[]; error?: string }>;
  projectLibrarySelectRepo: () => Promise<{ success?: boolean; cancelled?: boolean; repoPath?: string; error?: string }>;

  // Google Search API
  setGoogleSearchApiKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>;
  setGoogleSearchCseId: (cseId: string) => Promise<{ success: boolean; error?: string }>;

  // Overlay Opacity (Stealth Mode)
  setOverlayOpacity: (opacity: number) => Promise<void>;
  onOverlayOpacityChanged: (callback: (opacity: number) => void) => () => void;

  // Cropper API
  cropperConfirmed: (bounds: Electron.Rectangle) => void;
  cropperCancelled: () => void;
  onResetCropper: (callback: (data: { hudPosition: { x: number; y: number } }) => void) => () => void;
}

export const PROCESSING_EVENTS = {
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
} as const

// Expose the Electron API to the renderer process
contextBridge.exposeInMainWorld("electronAPI", {
  updateContentDimensions: (dimensions: { width: number; height: number }) =>
    ipcRenderer.invoke("update-content-dimensions", dimensions),
  setOverlayBounds: (bounds: { x: number; y: number; width: number; height: number }) =>
    ipcRenderer.invoke("set-overlay-bounds", bounds),
  maximizeOverlayToWorkArea: () => ipcRenderer.invoke("maximize-overlay-to-work-area"),
  restoreOverlayBounds: () => ipcRenderer.invoke("restore-overlay-bounds"),
  getRecognitionLanguages: () => ipcRenderer.invoke("get-recognition-languages"),
  takeScreenshot: () => ipcRenderer.invoke("take-screenshot"),
  takeSelectiveScreenshot: () => ipcRenderer.invoke("take-selective-screenshot"),
  getScreenshots: () => ipcRenderer.invoke("get-screenshots"),
  deleteScreenshot: (path: string) =>
    ipcRenderer.invoke("delete-screenshot", path),

  // Event listeners
  onScreenshotTaken: (
    callback: (data: { path: string; preview: string }) => void
  ) => {
    const subscription = (_: any, data: { path: string; preview: string }) =>
      callback(data)
    ipcRenderer.on("screenshot-taken", subscription)
    return () => {
      ipcRenderer.removeListener("screenshot-taken", subscription)
    }
  },
  onScreenshotAttached: (
    callback: (data: { path: string; preview: string }) => void
  ) => {
    const subscription = (_: any, data: { path: string; preview: string }) =>
      callback(data)
    ipcRenderer.on("screenshot-attached", subscription)
    return () => {
      ipcRenderer.removeListener("screenshot-attached", subscription)
    }
  },
  onSolutionsReady: (callback: (solutions: string) => void) => {
    const subscription = (_: any, solutions: string) => callback(solutions)
    ipcRenderer.on("solutions-ready", subscription)
    return () => {
      ipcRenderer.removeListener("solutions-ready", subscription)
    }
  },
  onResetView: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("reset-view", subscription)
    return () => {
      ipcRenderer.removeListener("reset-view", subscription)
    }
  },
  onSolutionStart: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.INITIAL_START, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.INITIAL_START, subscription)
    }
  },
  onDebugStart: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.DEBUG_START, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.DEBUG_START, subscription)
    }
  },

  onDebugSuccess: (callback: (data: any) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on("debug-success", subscription)
    return () => {
      ipcRenderer.removeListener("debug-success", subscription)
    }
  },
  onDebugError: (callback: (error: string) => void) => {
    const subscription = (_: any, error: string) => callback(error)
    ipcRenderer.on(PROCESSING_EVENTS.DEBUG_ERROR, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.DEBUG_ERROR, subscription)
    }
  },
  onSolutionError: (callback: (error: string) => void) => {
    const subscription = (_: any, error: string) => callback(error)
    ipcRenderer.on(PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR, subscription)
    return () => {
      ipcRenderer.removeListener(
        PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
        subscription
      )
    }
  },
  onProcessingNoScreenshots: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.NO_SCREENSHOTS, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.NO_SCREENSHOTS, subscription)
    }
  },

  onProblemExtracted: (callback: (data: any) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on(PROCESSING_EVENTS.PROBLEM_EXTRACTED, subscription)
    return () => {
      ipcRenderer.removeListener(
        PROCESSING_EVENTS.PROBLEM_EXTRACTED,
        subscription
      )
    }
  },
  onSolutionSuccess: (callback: (data: any) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on(PROCESSING_EVENTS.SOLUTION_SUCCESS, subscription)
    return () => {
      ipcRenderer.removeListener(
        PROCESSING_EVENTS.SOLUTION_SUCCESS,
        subscription
      )
    }
  },
  onUnauthorized: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.UNAUTHORIZED, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.UNAUTHORIZED, subscription)
    }
  },
  moveWindowLeft: () => ipcRenderer.invoke("move-window-left"),
  moveWindowRight: () => ipcRenderer.invoke("move-window-right"),
  moveWindowUp: () => ipcRenderer.invoke("move-window-up"),
  moveWindowDown: () => ipcRenderer.invoke("move-window-down"),

  analyzeImageFile: (path: string, traceContext?: LlmTraceActionContext) => ipcRenderer.invoke("analyze-image-file", path, traceContext),
  quitApp: () => ipcRenderer.invoke("quit-app"),
  getRuntimeLogInfo: () => ipcRenderer.invoke("runtime-log:get-info"),
  getRuntimeLogEntries: (query?: { limit?: number; levels?: RuntimeLogLevel[] }) => ipcRenderer.invoke("runtime-log:get-entries", query),
  openRuntimeLogDirectory: () => ipcRenderer.invoke("runtime-log:open-directory"),
  getLlmTraceInfo: () => ipcRenderer.invoke("llm-trace:get-info"),
  getLlmTraceActions: (query?: { limit?: number; currentSessionOnly?: boolean; actionTypes?: LlmTraceActionType[] }) => ipcRenderer.invoke("llm-trace:get-actions", query),
  openLlmTraceDirectory: () => ipcRenderer.invoke("llm-trace:open-directory"),
  clearLlmTraceSession: () => ipcRenderer.invoke("llm-trace:clear-session"),
  openTraceWindow: () => ipcRenderer.invoke("open-trace-window"),
  getRawTranscriptState: () => ipcRenderer.invoke("raw-transcript:get-state"),
  openRawTranscriptWindow: () => ipcRenderer.invoke("open-raw-transcript-window"),
  openSttCompareWindow: () => ipcRenderer.invoke("open-stt-compare-window"),
  openPromptLabWindow: (payload?: { action?: PromptLabActionId; context?: any }) => ipcRenderer.invoke("open-prompt-lab-window", payload),
  getPromptLabActionPreview: (action: PromptLabActionId, context?: any) => ipcRenderer.invoke("prompt-lab:get-action-preview", action, context),
  getPromptLabFixedOverrides: () => ipcRenderer.invoke("prompt-lab:get-fixed-overrides"),
  setPromptLabFixedOverride: (payload: { action: PromptLabActionId; fieldKey: string; value: string }) => ipcRenderer.invoke("prompt-lab:set-fixed-override", payload),
  resetPromptLabFixedOverride: (payload: { action: PromptLabActionId; fieldKey: string }) => ipcRenderer.invoke("prompt-lab:reset-fixed-override", payload),
  setPromptLabDynamicOverride: (payload: { action: PromptLabActionId; fieldKey: string; value: string }) => ipcRenderer.invoke("prompt-lab:set-dynamic-override", payload),
  resetPromptLabDynamicOverride: (payload: { action: PromptLabActionId; fieldKey: string }) => ipcRenderer.invoke("prompt-lab:reset-dynamic-override", payload),
  resetPromptLabActionDynamicOverrides: (payload: { action: PromptLabActionId }) => ipcRenderer.invoke("prompt-lab:reset-action-dynamic-overrides", payload),
  onRawTranscriptUpdate: (callback: (state: RawInterviewerTranscriptState) => void) => {
    const subscription = (_: any, data: RawInterviewerTranscriptState) => callback(data)
    ipcRenderer.on("raw-transcript:update", subscription)
    return () => {
      ipcRenderer.removeListener("raw-transcript:update", subscription)
    }
  },
  onLlmTraceUpdate: (callback: (data: { kind: "upsert"; action: LlmTraceActionRecord } | { kind: "cleared"; sessionId: string }) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on("llm-trace:update", subscription)
    return () => {
      ipcRenderer.removeListener("llm-trace:update", subscription)
    }
  },
  onPromptLabFocusAction: (callback: (action: PromptLabActionId) => void) => {
    const subscription = (_: any, action: PromptLabActionId) => callback(action)
    ipcRenderer.on("prompt-lab:focus-action", subscription)
    return () => {
      ipcRenderer.removeListener("prompt-lab:focus-action", subscription)
    }
  },
  logErrorToMain: (payload: RendererLogPayload) => sendRendererLog(payload),
  toggleWindow: () => ipcRenderer.invoke("toggle-window"),
  showWindow: () => ipcRenderer.invoke("show-window"),
  hideWindow: () => ipcRenderer.invoke("hide-window"),
  getOverlayWindowState: () => ipcRenderer.invoke("get-overlay-window-state"),
  toggleAdvancedSettings: () => ipcRenderer.invoke("toggle-advanced-settings"),
  openExternal: (url: string) => ipcRenderer.invoke("open-external", url),
  setUndetectable: (state: boolean) => ipcRenderer.invoke("set-undetectable", state),
  getUndetectable: () => ipcRenderer.invoke("get-undetectable"),
  setOpenAtLogin: (open: boolean) => ipcRenderer.invoke("set-open-at-login", open),
  getOpenAtLogin: () => ipcRenderer.invoke("get-open-at-login"),
  setDisguise: (mode: 'terminal' | 'settings' | 'activity' | 'none') => ipcRenderer.invoke("set-disguise", mode),
  getDisguise: () => ipcRenderer.invoke("get-disguise"),
  onDisguiseChanged: (callback: (mode: 'terminal' | 'settings' | 'activity' | 'none') => void) => {
    const subscription = (_: any, mode: any) => callback(mode)
    ipcRenderer.on('disguise-changed', subscription)
    return () => {
      ipcRenderer.removeListener('disguise-changed', subscription)
    }
  },

  onSettingsVisibilityChange: (callback: (isVisible: boolean) => void) => {
    const subscription = (_: any, isVisible: boolean) => callback(isVisible)
    ipcRenderer.on("settings-visibility-changed", subscription)
    return () => {
      ipcRenderer.removeListener("settings-visibility-changed", subscription)
    }
  },

  onToggleExpand: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("toggle-expand", subscription)
    return () => {
      ipcRenderer.removeListener("toggle-expand", subscription)
    }
  },

  onWindowVisibilityChanged: (callback: (state: OverlayWindowState) => void) => {
    const subscription = (_: any, state: OverlayWindowState) => callback(state)
    ipcRenderer.on("window-visibility-changed", subscription)
    return () => {
      ipcRenderer.removeListener("window-visibility-changed", subscription)
    }
  },

  // LLM Model Management
  getCurrentLlmConfig: () => ipcRenderer.invoke("get-current-llm-config"),
  getAvailableOllamaModels: () => ipcRenderer.invoke("get-available-ollama-models"),
  switchToOllama: (model?: string, url?: string) => ipcRenderer.invoke("switch-to-ollama", model, url),
  switchToGemini: (apiKey?: string, modelId?: string) => ipcRenderer.invoke("switch-to-gemini", apiKey, modelId),
  testLlmConnection: (provider: 'gemini' | 'groq' | 'openai' | 'claude' | 'alibaba', config?: LlmProviderConfig) => ipcRenderer.invoke("test-llm-connection", provider, config),
  selectServiceAccount: () => ipcRenderer.invoke("select-service-account"),

  // API Key Management
  setGeminiApiKey: (apiKey: string) => ipcRenderer.invoke("set-gemini-api-key", apiKey),
  setGroqApiKey: (apiKey: string) => ipcRenderer.invoke("set-groq-api-key", apiKey),
  setOpenaiApiKey: (apiKey: string) => ipcRenderer.invoke("set-openai-api-key", apiKey),
  setOpenaiProviderConfig: (config: LlmProviderConfig) => ipcRenderer.invoke("set-openai-provider-config", config),
  setClaudeApiKey: (apiKey: string) => ipcRenderer.invoke("set-claude-api-key", apiKey),
  setAlibabaLlmProviderConfig: (config: LlmProviderConfig) => ipcRenderer.invoke("set-alibaba-llm-provider-config", config),
  getStoredCredentials: () => ipcRenderer.invoke("get-stored-credentials"),

  // STT Provider Management
  setSttProvider: (provider: 'google' | 'groq' | 'openai' | 'deepgram' | 'elevenlabs' | 'azure' | 'ibmwatson' | 'soniox' | 'alibaba') => ipcRenderer.invoke("set-stt-provider", provider),
  getSttProvider: () => ipcRenderer.invoke("get-stt-provider"),
  setGroqSttApiKey: (apiKey: string) => ipcRenderer.invoke("set-groq-stt-api-key", apiKey),
  setOpenAiSttApiKey: (apiKey: string) => ipcRenderer.invoke("set-openai-stt-api-key", apiKey),
  setDeepgramApiKey: (apiKey: string) => ipcRenderer.invoke("set-deepgram-api-key", apiKey),
  setElevenLabsApiKey: (apiKey: string) => ipcRenderer.invoke("set-elevenlabs-api-key", apiKey),
  setAzureApiKey: (apiKey: string) => ipcRenderer.invoke("set-azure-api-key", apiKey),
  setAzureRegion: (region: string) => ipcRenderer.invoke("set-azure-region", region),
  setIbmWatsonApiKey: (apiKey: string) => ipcRenderer.invoke("set-ibmwatson-api-key", apiKey),
  setGroqSttModel: (model: string) => ipcRenderer.invoke("set-groq-stt-model", model),
  setSonioxApiKey: (apiKey: string) => ipcRenderer.invoke("set-soniox-api-key", apiKey),
  setAlibabaSttApiKey: (apiKey: string) => ipcRenderer.invoke("set-alibaba-stt-api-key", apiKey),
  getTechnicalGlossary: () => ipcRenderer.invoke("get-technical-glossary"),
  setTechnicalGlossary: (config: any) => ipcRenderer.invoke("set-technical-glossary", config),
  testSttConnection: (provider: 'groq' | 'openai' | 'deepgram' | 'elevenlabs' | 'azure' | 'ibmwatson' | 'soniox' | 'alibaba', apiKey: string, region?: string) => ipcRenderer.invoke("test-stt-connection", provider, apiKey, region),
  startSttCompareSession: () => ipcRenderer.invoke("start-stt-compare-session"),
  stopSttCompareSession: () => ipcRenderer.invoke("stop-stt-compare-session"),
  getSttCompareResults: () => ipcRenderer.invoke("get-stt-compare-results"),
  exportSttBenchmarkReport: () => ipcRenderer.invoke("export-stt-benchmark-report"),
  onSttCompareUpdate: (callback: (data: any) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on("stt-compare-update", subscription)
    return () => {
      ipcRenderer.removeListener("stt-compare-update", subscription)
    }
  },

  // Native Audio Service Events
  onNativeAudioTranscript: (callback: (transcript: NativeAudioTranscript) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on("native-audio-transcript", subscription)
    return () => {
      ipcRenderer.removeListener("native-audio-transcript", subscription)
    }
  },
  onNativeAudioSpeechEnded: (callback: (event: NativeAudioSpeechEnded) => void) => {
    const subscription = (_: any, data: NativeAudioSpeechEnded) => callback(data)
    ipcRenderer.on("native-audio-speech-ended", subscription)
    return () => {
      ipcRenderer.removeListener("native-audio-speech-ended", subscription)
    }
  },
  onNativeAudioSuggestion: (callback: (suggestion: { context: string; lastQuestion: string; confidence: number }) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on("native-audio-suggestion", subscription)
    return () => {
      ipcRenderer.removeListener("native-audio-suggestion", subscription)
    }
  },
  onNativeAudioConnected: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("native-audio-connected", subscription)
    return () => {
      ipcRenderer.removeListener("native-audio-connected", subscription)
    }
  },
  onNativeAudioDisconnected: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("native-audio-disconnected", subscription)
    return () => {
      ipcRenderer.removeListener("native-audio-disconnected", subscription)
    }
  },
  getLiveTranscriptState: () => ipcRenderer.invoke("live-transcript:get-state"),
  editLiveTranscriptSegment: (payload: { id: string; text: string }) => ipcRenderer.invoke("live-transcript:edit-segment", payload),
  mergeLiveTranscriptSegmentWithPrevious: (payload: { id: string }) => ipcRenderer.invoke("live-transcript:merge-with-previous", payload),
  commitLiveTranscriptSegment: (payload?: { id?: string; speaker?: "interviewer" | "user" }) => ipcRenderer.invoke("live-transcript:commit-segment", payload),
  resyncLiveTranscriptRag: () => ipcRenderer.invoke("live-transcript:resync-rag"),
  onLiveTranscriptUpdate: (callback: (segments: LiveTranscriptSegment[]) => void) => {
    const subscription = (_: any, data: LiveTranscriptSegment[]) => callback(data)
    ipcRenderer.on("live-transcript-update", subscription)
    return () => {
      ipcRenderer.removeListener("live-transcript-update", subscription)
    }
  },
  onSuggestionGenerated: (callback: (data: { question: string; suggestion: string; confidence: number }) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on("suggestion-generated", subscription)
    return () => {
      ipcRenderer.removeListener("suggestion-generated", subscription)
    }
  },
  onSuggestionProcessingStart: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("suggestion-processing-start", subscription)
    return () => {
      ipcRenderer.removeListener("suggestion-processing-start", subscription)
    }
  },
  onSuggestionError: (callback: (error: { error: string }) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on("suggestion-error", subscription)
    return () => {
      ipcRenderer.removeListener("suggestion-error", subscription)
    }
  },
  generateSuggestion: (context: string, lastQuestion: string) =>
    ipcRenderer.invoke("generate-suggestion", context, lastQuestion),

  getNativeAudioStatus: () => ipcRenderer.invoke("native-audio-status"),
  getInputDevices: () => ipcRenderer.invoke("get-input-devices"),
  getOutputDevices: () => ipcRenderer.invoke("get-output-devices"),
  setRecognitionLanguage: (key: string) => ipcRenderer.invoke("set-recognition-language", key),
  getAiResponseLanguages: () => ipcRenderer.invoke("get-ai-response-languages"),
  setAiResponseLanguage: (language: string) => ipcRenderer.invoke("set-ai-response-language", language),
  getSttLanguage: () => ipcRenderer.invoke("get-stt-language"),
  getAiResponseLanguage: () => ipcRenderer.invoke("get-ai-response-language"),

  // Intelligence Mode IPC
  generateAssist: () => ipcRenderer.invoke("generate-assist"),
  generateWhatToSay: (question?: string, imagePaths?: string[], requestId?: string) => ipcRenderer.invoke("generate-what-to-say", question, imagePaths, requestId),
  generateFollowUp: (intent: string, userRequest?: string, source?: { lane?: 'primary' | 'strong'; answer?: string; requestId?: string }) => ipcRenderer.invoke("generate-follow-up", intent, userRequest, source),
  generateFollowUpQuestions: () => ipcRenderer.invoke("generate-follow-up-questions"),
  generateRecap: () => ipcRenderer.invoke("generate-recap"),
  submitManualQuestion: (question: string) => ipcRenderer.invoke("submit-manual-question", question),
  getIntelligenceContext: () => ipcRenderer.invoke("get-intelligence-context"),
  resetIntelligence: () => ipcRenderer.invoke("reset-intelligence"),

  // Meeting Lifecycle
  startMeeting: (metadata?: any) => ipcRenderer.invoke("start-meeting", metadata),
  endMeeting: () => ipcRenderer.invoke("end-meeting"),
  finalizeMicSTT: () => ipcRenderer.invoke("finalize-mic-stt"),
  getRecentMeetings: () => ipcRenderer.invoke("get-recent-meetings"),
  getMeetingDetails: (id: string) => ipcRenderer.invoke("get-meeting-details", id),
  updateMeetingTitle: (id: string, title: string) => ipcRenderer.invoke("update-meeting-title", { id, title }),
  updateMeetingSummary: (id: string, updates: any) => ipcRenderer.invoke("update-meeting-summary", { id, updates }),
  deleteMeeting: (id: string) => ipcRenderer.invoke("delete-meeting", id),

  onMeetingsUpdated: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("meetings-updated", subscription)
    return () => {
      ipcRenderer.removeListener("meetings-updated", subscription)
    }
  },

  // Window Mode
  setWindowMode: (mode: 'launcher' | 'overlay') => ipcRenderer.invoke("set-window-mode", mode),

  // Intelligence Mode Events
  onIntelligenceAssistUpdate: (callback: (data: { insight: string }) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on("intelligence-assist-update", subscription)
    return () => {
      ipcRenderer.removeListener("intelligence-assist-update", subscription)
    }
  },
  onIntelligenceSuggestedAnswerToken: (callback: (data: { token: string; question: string; confidence: number; lane: 'primary' | 'strong'; requestId: string; modelId?: string; modelLabel?: string }) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on("intelligence-suggested-answer-token", subscription)
    return () => {
      ipcRenderer.removeListener("intelligence-suggested-answer-token", subscription)
    }
  },
  onIntelligenceSuggestedAnswerStatus: (callback: (data: { status: 'started' | 'completed' | 'skipped' | 'error'; question: string; confidence: number; lane: 'primary' | 'strong'; requestId: string; modelId?: string; modelLabel?: string; message?: string }) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on("intelligence-suggested-answer-status", subscription)
    return () => {
      ipcRenderer.removeListener("intelligence-suggested-answer-status", subscription)
    }
  },
  onIntelligenceSuggestedAnswer: (callback: (data: { answer: string; question: string; confidence: number; lane: 'primary' | 'strong'; requestId: string; modelId?: string; modelLabel?: string }) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on("intelligence-suggested-answer", subscription)
    return () => {
      ipcRenderer.removeListener("intelligence-suggested-answer", subscription)
    }
  },
  onIntelligenceRefinedAnswerToken: (callback: (data: { token: string; intent: string; lane: 'primary' | 'strong'; requestId: string; modelId?: string; modelLabel?: string }) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on("intelligence-refined-answer-token", subscription)
    return () => {
      ipcRenderer.removeListener("intelligence-refined-answer-token", subscription)
    }
  },
  onIntelligenceRefinedAnswer: (callback: (data: { answer: string; intent: string; lane: 'primary' | 'strong'; requestId: string; modelId?: string; modelLabel?: string }) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on("intelligence-refined-answer", subscription)
    return () => {
      ipcRenderer.removeListener("intelligence-refined-answer", subscription)
    }
  },
  onIntelligenceRecapToken: (callback: (data: { token: string }) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on("intelligence-recap-token", subscription)
    return () => {
      ipcRenderer.removeListener("intelligence-recap-token", subscription)
    }
  },
  onIntelligenceRecap: (callback: (data: { summary: string }) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on("intelligence-recap", subscription)
    return () => {
      ipcRenderer.removeListener("intelligence-recap", subscription)
    }
  },
  onIntelligenceFollowUpQuestionsToken: (callback: (data: { token: string }) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on("intelligence-follow-up-questions-token", subscription)
    return () => {
      ipcRenderer.removeListener("intelligence-follow-up-questions-token", subscription)
    }
  },
  onIntelligenceFollowUpQuestionsUpdate: (callback: (data: { questions: string }) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on("intelligence-follow-up-questions-update", subscription)
    return () => {
      ipcRenderer.removeListener("intelligence-follow-up-questions-update", subscription)
    }
  },
  onIntelligenceManualStarted: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("intelligence-manual-started", subscription)
    return () => {
      ipcRenderer.removeListener("intelligence-manual-started", subscription)
    }
  },
  onIntelligenceManualResult: (callback: (data: { answer: string; question: string }) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on("intelligence-manual-result", subscription)
    return () => {
      ipcRenderer.removeListener("intelligence-manual-result", subscription)
    }
  },
  onIntelligenceModeChanged: (callback: (data: { mode: string }) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on("intelligence-mode-changed", subscription)
    return () => {
      ipcRenderer.removeListener("intelligence-mode-changed", subscription)
    }
  },
  onIntelligenceError: (callback: (data: { error: string; mode: string }) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on("intelligence-error", subscription)
    return () => {
      ipcRenderer.removeListener("intelligence-error", subscription)
    }
  },
  onSessionReset: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("session-reset", subscription)
    return () => {
      ipcRenderer.removeListener("session-reset", subscription)
    }
  },


  // Streaming Chat
  streamGeminiChat: (message: string, imagePaths?: string[], context?: string, options?: { skipSystemPrompt?: boolean; traceContext?: LlmTraceActionContext }) => ipcRenderer.invoke("gemini-chat-stream", message, imagePaths, context, options),

  onGeminiStreamToken: (callback: (token: string) => void) => {
    const subscription = (_: any, token: string) => callback(token)
    ipcRenderer.on("gemini-stream-token", subscription)
    return () => {
      ipcRenderer.removeListener("gemini-stream-token", subscription)
    }
  },

  onGeminiStreamDone: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("gemini-stream-done", subscription)
    return () => {
      ipcRenderer.removeListener("gemini-stream-done", subscription)
    }
  },

  onGeminiStreamError: (callback: (error: string) => void) => {
    const subscription = (_: any, error: string) => callback(error)
    ipcRenderer.on("gemini-stream-error", subscription)
    return () => {
      ipcRenderer.removeListener("gemini-stream-error", subscription)
    }
  },

  // Model Management
  getDefaultModel: () => ipcRenderer.invoke('get-default-model'),
  setModel: (modelId: string) => ipcRenderer.invoke('set-model', modelId),
  setDefaultModel: (modelId: string) => ipcRenderer.invoke('set-default-model', modelId),
  toggleModelSelector: (coords: { x: number; y: number }) => ipcRenderer.invoke('toggle-model-selector', coords),
  forceRestartOllama: () => ipcRenderer.invoke('force-restart-ollama'),

  // Settings Window
  toggleSettingsWindow: (coords?: { x: number; y: number }) => ipcRenderer.invoke('toggle-settings-window', coords),

  // Groq Fast Text Mode
  getGroqFastTextMode: () => ipcRenderer.invoke('get-groq-fast-text-mode'),
  setGroqFastTextMode: (enabled: boolean) => ipcRenderer.invoke('set-groq-fast-text-mode', enabled),

  // Demo
  seedDemo: () => ipcRenderer.invoke('seed-demo'),

  // Custom Providers
  saveCustomProvider: (provider: any) => ipcRenderer.invoke('save-custom-provider', provider),
  getCustomProviders: () => ipcRenderer.invoke('get-custom-providers'),
  deleteCustomProvider: (id: string) => ipcRenderer.invoke('delete-custom-provider', id),
  testCustomProviderConnection: (provider: any) => ipcRenderer.invoke('test-custom-provider-connection', provider),

  // Follow-up Email
  generateFollowupEmail: (input: any) => ipcRenderer.invoke('generate-followup-email', input),
  extractEmailsFromTranscript: (transcript: Array<{ text: string }>) => ipcRenderer.invoke('extract-emails-from-transcript', transcript),
  getCalendarAttendees: (eventId: string) => ipcRenderer.invoke('get-calendar-attendees', eventId),
  openMailto: (params: { to: string; subject: string; body: string }) => ipcRenderer.invoke('open-mailto', params),

  // Audio Test
  startAudioTest: (deviceId?: string) => ipcRenderer.invoke('start-audio-test', deviceId),
  stopAudioTest: () => ipcRenderer.invoke('stop-audio-test'),
  onAudioTestLevel: (callback: (level: number) => void) => {
    const subscription = (_: any, level: number) => callback(level)
    ipcRenderer.on('audio-test-level', subscription)
    return () => {
      ipcRenderer.removeListener('audio-test-level', subscription)
    }
  },

  // Database
  flushDatabase: () => ipcRenderer.invoke('flush-database'),



  onUndetectableChanged: (callback: (state: boolean) => void) => {
    const subscription = (_: any, state: boolean) => callback(state)
    ipcRenderer.on('undetectable-changed', subscription)
    return () => {
      ipcRenderer.removeListener('undetectable-changed', subscription)
    }
  },

  onGroqFastTextChanged: (callback: (enabled: boolean) => void) => {
    const subscription = (_: any, enabled: boolean) => callback(enabled)
    ipcRenderer.on('groq-fast-text-changed', subscription)
    return () => {
      ipcRenderer.removeListener('groq-fast-text-changed', subscription)
    }
  },

  onModelChanged: (callback: (modelId: string) => void) => {
    const subscription = (_: any, modelId: string) => callback(modelId)
    ipcRenderer.on('model-changed', subscription)
    return () => {
      ipcRenderer.removeListener('model-changed', subscription)
    }
  },

  onOllamaPullProgress: (callback: (data: { status: string; percent: number }) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on('ollama:pull-progress', subscription)
    return () => {
      ipcRenderer.removeListener('ollama:pull-progress', subscription)
    }
  },

  onOllamaPullComplete: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on('ollama:pull-complete', subscription)
    return () => {
      ipcRenderer.removeListener('ollama:pull-complete', subscription)
    }
  },

  // Theme API
  getThemeMode: () => ipcRenderer.invoke('theme:get-mode'),
  setThemeMode: (mode: 'system' | 'light' | 'dark') => ipcRenderer.invoke('theme:set-mode', mode),
  onThemeChanged: (callback: (data: { mode: 'system' | 'light' | 'dark', resolved: 'light' | 'dark' }) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on('theme:changed', subscription)
    return () => {
      ipcRenderer.removeListener('theme:changed', subscription)
    }
  },

  // Calendar API
  calendarConnect: () => ipcRenderer.invoke('calendar-connect'),
  calendarDisconnect: () => ipcRenderer.invoke('calendar-disconnect'),
  getCalendarStatus: () => ipcRenderer.invoke('get-calendar-status'),
  getUpcomingEvents: () => ipcRenderer.invoke('get-upcoming-events'),
  calendarRefresh: () => ipcRenderer.invoke('calendar-refresh'),

  // Auto-Update
  onUpdateAvailable: (callback: (info: any) => void) => {
    const subscription = (_: any, info: any) => callback(info)
    ipcRenderer.on("update-available", subscription)
    return () => {
      ipcRenderer.removeListener("update-available", subscription)
    }
  },
  onUpdateDownloaded: (callback: (info: any) => void) => {
    const subscription = (_: any, info: any) => callback(info)
    ipcRenderer.on("update-downloaded", subscription)
    return () => {
      ipcRenderer.removeListener("update-downloaded", subscription)
    }
  },
  onUpdateChecking: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("update-checking", subscription)
    return () => {
      ipcRenderer.removeListener("update-checking", subscription)
    }
  },
  onUpdateNotAvailable: (callback: (info: any) => void) => {
    const subscription = (_: any, info: any) => callback(info)
    ipcRenderer.on("update-not-available", subscription)
    return () => {
      ipcRenderer.removeListener("update-not-available", subscription)
    }
  },
  onUpdateError: (callback: (err: string) => void) => {
    const subscription = (_: any, err: string) => callback(err)
    ipcRenderer.on("update-error", subscription)
    return () => {
      ipcRenderer.removeListener("update-error", subscription)
    }
  },
  onDownloadProgress: (callback: (progressObj: any) => void) => {
    const subscription = (_: any, progressObj: any) => callback(progressObj)
    ipcRenderer.on("download-progress", subscription)
    return () => {
      ipcRenderer.removeListener("download-progress", subscription)
    }
  },
  restartAndInstall: () => ipcRenderer.invoke("quit-and-install-update"),
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  downloadUpdate: () => ipcRenderer.invoke("download-update"),
  testReleaseFetch: () => ipcRenderer.invoke("test-release-fetch"),

  // RAG API
  ragQueryMeeting: (meetingId: string, query: string, traceContext?: LlmTraceActionContext) => ipcRenderer.invoke('rag:query-meeting', { meetingId, query, traceContext }),
  ragQueryLive: (query: string, traceContext?: LlmTraceActionContext) => ipcRenderer.invoke('rag:query-live', { query, traceContext }),
  ragQueryGlobal: (query: string, traceContext?: LlmTraceActionContext) => ipcRenderer.invoke('rag:query-global', { query, traceContext }),
  ragCancelQuery: (options: { meetingId?: string; global?: boolean }) => ipcRenderer.invoke('rag:cancel-query', options),
  ragIsMeetingProcessed: (meetingId: string) => ipcRenderer.invoke('rag:is-meeting-processed', meetingId),
  ragGetQueueStatus: () => ipcRenderer.invoke('rag:get-queue-status'),
  ragRetryEmbeddings: () => ipcRenderer.invoke('rag:retry-embeddings'),
  
  onIncompatibleProviderWarning: (callback: (data: { count: number, oldProvider: string, newProvider: string }) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on('embedding:incompatible-provider-warning', subscription)
    return () => {
      ipcRenderer.removeListener('embedding:incompatible-provider-warning', subscription)
    }
  },
  reindexIncompatibleMeetings: () => ipcRenderer.invoke('rag:reindex-incompatible-meetings'),

  onRAGStreamChunk: (callback: (data: { meetingId?: string; global?: boolean; chunk: string }) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on('rag:stream-chunk', subscription)
    return () => {
      ipcRenderer.removeListener('rag:stream-chunk', subscription)
    }
  },
  onRAGStreamComplete: (callback: (data: { meetingId?: string; global?: boolean }) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on('rag:stream-complete', subscription)
    return () => {
      ipcRenderer.removeListener('rag:stream-complete', subscription)
    }
  },
  onRAGStreamError: (callback: (data: { meetingId?: string; global?: boolean; error: string }) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on('rag:stream-error', subscription)
    return () => {
      ipcRenderer.removeListener('rag:stream-error', subscription)
    }
  },

  // Keybind Management
  getKeybinds: () => ipcRenderer.invoke('keybinds:get-all'),
  setKeybind: (id: string, accelerator: string) => ipcRenderer.invoke('keybinds:set', id, accelerator),
  resetKeybinds: () => ipcRenderer.invoke('keybinds:reset'),
  onKeybindsUpdate: (callback: (keybinds: Array<any>) => void) => {
    const subscription = (_: any, keybinds: any) => callback(keybinds)
    ipcRenderer.on('keybinds:update', subscription)
    return () => {
      ipcRenderer.removeListener('keybinds:update', subscription)
    }
  },

  // Donation API
  getDonationStatus: () => ipcRenderer.invoke("get-donation-status"),
  markDonationToastShown: () => ipcRenderer.invoke("mark-donation-toast-shown"),
  setDonationComplete: () => ipcRenderer.invoke('set-donation-complete'),

  // Profile Engine API
  profileUploadResume: (filePath: string) => ipcRenderer.invoke('profile:upload-resume', filePath),
  profileGetStatus: () => ipcRenderer.invoke('profile:get-status'),
  profileSetMode: (enabled: boolean) => ipcRenderer.invoke('profile:set-mode', enabled),
  profileDelete: () => ipcRenderer.invoke('profile:delete'),
  profileGetProfile: () => ipcRenderer.invoke('profile:get-profile'),
  profileSelectFile: () => ipcRenderer.invoke('profile:select-file'),

  // JD & Research API
  profileUploadJD: (filePath: string) => ipcRenderer.invoke('profile:upload-jd', filePath),
  profileDeleteJD: () => ipcRenderer.invoke('profile:delete-jd'),
  profileResearchCompany: (companyName: string) => ipcRenderer.invoke('profile:research-company', companyName),
  profileGenerateNegotiation: () => ipcRenderer.invoke('profile:generate-negotiation'),

  // Project Library API
  projectLibraryListProjects: () => ipcRenderer.invoke('projectLibrary:listProjects'),
  projectLibraryUpsertProject: (project: any) => ipcRenderer.invoke('projectLibrary:upsertProject', project),
  projectLibraryAttachAssets: (payload: { projectId: string; filePaths: string[] }) => ipcRenderer.invoke('projectLibrary:attachAssets', payload),
  projectLibraryAttachRepo: (payload: { projectId: string; repoPath: string }) => ipcRenderer.invoke('projectLibrary:attachRepo', payload),
  projectLibraryGetProjectFacts: (projectId: string) => ipcRenderer.invoke('projectLibrary:getProjectFacts', projectId),
  projectLibrarySetActiveProjects: (projectIds: string[]) => ipcRenderer.invoke('projectLibrary:setActiveProjects', projectIds),
  projectLibrarySetAnswerMode: (mode: 'strict' | 'polished') => ipcRenderer.invoke('projectLibrary:setAnswerMode', mode),
  projectLibrarySetJDBias: (enabled: boolean) => ipcRenderer.invoke('projectLibrary:setJDBias', enabled),
  projectLibrarySelectAssets: () => ipcRenderer.invoke('projectLibrary:selectAssets'),
  projectLibrarySelectRepo: () => ipcRenderer.invoke('projectLibrary:selectRepo'),

  // Google Search API
  setGoogleSearchApiKey: (apiKey: string) => ipcRenderer.invoke('set-google-search-api-key', apiKey),
  setGoogleSearchCseId: (cseId: string) => ipcRenderer.invoke('set-google-search-cse-id', cseId),

  // Dynamic Model Discovery
  fetchProviderModels: (provider: 'gemini' | 'groq' | 'openai' | 'claude' | 'alibaba', config: LlmProviderConfig) => ipcRenderer.invoke('fetch-provider-models', provider, config),
  setProviderPreferredModel: (provider: 'gemini' | 'groq' | 'openai' | 'claude' | 'alibaba', modelId: string) => ipcRenderer.invoke('set-provider-preferred-model', provider, modelId),

  // License Management
  licenseActivate: (key: string) => ipcRenderer.invoke('license:activate', key),
  licenseCheckPremium: () => ipcRenderer.invoke('license:check-premium'),
  licenseDeactivate: () => ipcRenderer.invoke('license:deactivate'),
  licenseGetHardwareId: () => ipcRenderer.invoke('license:get-hardware-id'),

  // Overlay Opacity (Stealth Mode)
  setOverlayOpacity: (opacity: number) => ipcRenderer.invoke('set-overlay-opacity', opacity),
  onOverlayOpacityChanged: (callback: (opacity: number) => void) => {
    const subscription = (_: any, opacity: number) => callback(opacity)
    ipcRenderer.on('overlay-opacity-changed', subscription)
    return () => {
      ipcRenderer.removeListener('overlay-opacity-changed', subscription)
    }
  },

  // Cropper API
  cropperConfirmed: (bounds: Electron.Rectangle) => ipcRenderer.send('cropper-confirmed', bounds),
  cropperCancelled: () => ipcRenderer.send('cropper-cancelled'),
  onResetCropper: (callback: (data: { hudPosition: { x: number; y: number } }) => void) => {
    const subscription = (_: Electron.IpcRendererEvent, data: { hudPosition: { x: number; y: number } }) => callback(data)
    ipcRenderer.on('reset-cropper', subscription)
    return () => {
      ipcRenderer.removeListener('reset-cropper', subscription)
    }
  },
} as ElectronAPI)
