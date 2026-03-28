"use strict";
// ipcHandlers.ts
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeIpcHandlers = initializeIpcHandlers;
const electron_1 = require("electron");
const DatabaseManager_1 = require("./db/DatabaseManager"); // Import Database Manager
const path = __importStar(require("path"));
const types_1 = require("./projectLibrary/types");
const AudioDevices_1 = require("./audio/AudioDevices");
const curl_to_json_1 = __importDefault(require("@bany/curl-to-json"));
const curlUtils_1 = require("./utils/curlUtils");
const OpenAICompatibleResponses_1 = require("./services/OpenAICompatibleResponses");
const RuntimeLogger_1 = require("./services/RuntimeLogger");
const LlmTraceRecorder_1 = require("./services/LlmTraceRecorder");
const languages_1 = require("./config/languages");
function initializeIpcHandlers(appState) {
    const safeHandle = (channel, listener) => {
        electron_1.ipcMain.removeHandler(channel);
        electron_1.ipcMain.handle(channel, listener);
    };
    const buildTraceAction = (fallback, traceContext) => ({
        ...fallback,
        ...(traceContext?.actionId ? { id: traceContext.actionId } : {}),
        ...(traceContext?.type ? { type: traceContext.type } : {}),
        ...(traceContext?.label ? { label: traceContext.label } : {}),
        ...(traceContext?.requestId ? { requestId: traceContext.requestId } : {}),
    });
    const syncOpenAICompatibleProvider = (provider) => {
        const { CredentialsManager } = require('./services/CredentialsManager');
        const cm = CredentialsManager.getInstance();
        const llmHelper = appState.processingHelper.getLLMHelper();
        llmHelper.setOpenAICompatibleProviderConfig(provider, cm.getOpenAICompatibleProviderConfig(provider));
    };
    const sanitizeLlmProviderConfig = (config) => ({
        ...(config?.apiKey?.trim() ? { apiKey: config.apiKey.trim() } : {}),
        ...(config?.baseUrl?.trim() ? { baseUrl: config.baseUrl.trim() } : {}),
        ...(config?.preferredModel?.trim() ? { preferredModel: config.preferredModel.trim() } : {}),
    });
    electron_1.ipcMain.removeAllListeners("runtime-log:renderer-report");
    electron_1.ipcMain.on("runtime-log:renderer-report", (_event, payload) => {
        RuntimeLogger_1.runtimeLogger.captureRendererReport(payload);
    });
    safeHandle("runtime-log:get-info", async () => {
        return RuntimeLogger_1.runtimeLogger.getInfo();
    });
    safeHandle("runtime-log:get-entries", async (_event, query) => {
        return RuntimeLogger_1.runtimeLogger.getRecentEntries(query);
    });
    safeHandle("runtime-log:open-directory", async () => {
        const error = await RuntimeLogger_1.runtimeLogger.openLogDirectory();
        return {
            success: !error,
            ...(error ? { error } : {}),
            ...RuntimeLogger_1.runtimeLogger.getInfo(),
        };
    });
    safeHandle("llm-trace:get-info", async () => {
        return LlmTraceRecorder_1.llmTraceRecorder.getInfo();
    });
    safeHandle("llm-trace:get-actions", async (_event, query) => {
        return LlmTraceRecorder_1.llmTraceRecorder.getRecentActions(query);
    });
    safeHandle("llm-trace:open-directory", async () => {
        const error = await LlmTraceRecorder_1.llmTraceRecorder.openTraceDirectory();
        return {
            success: !error,
            ...(error ? { error } : {}),
            ...LlmTraceRecorder_1.llmTraceRecorder.getInfo(),
        };
    });
    safeHandle("llm-trace:clear-session", async () => {
        return {
            success: true,
            ...LlmTraceRecorder_1.llmTraceRecorder.clearCurrentSession(),
        };
    });
    safeHandle("live-transcript:get-state", async () => {
        return appState.getIntelligenceManager().getLiveTranscriptState();
    });
    safeHandle("live-transcript:edit-segment", async (_event, payload) => {
        const intelligenceManager = appState.getIntelligenceManager();
        const updated = intelligenceManager.editLiveTranscriptSegment(payload.id, payload.text);
        if (!updated) {
            return { success: false, error: 'Segment not found' };
        }
        if (appState.getRAGManager()?.isLiveIndexingActive('live-meeting-current')) {
            try {
                await appState.resyncLiveMeetingRag();
            }
            catch (error) {
                console.warn('[IPC] Failed to resync live RAG after transcript edit:', error);
            }
        }
        return { success: true, segment: updated, state: intelligenceManager.getLiveTranscriptState() };
    });
    safeHandle("live-transcript:commit-segment", async (_event, payload) => {
        const intelligenceManager = appState.getIntelligenceManager();
        const committed = intelligenceManager.commitLiveTranscriptSegment(payload?.id);
        if (!committed) {
            return { success: false, error: 'Segment not found or already final' };
        }
        if (appState.getRAGManager()?.isLiveIndexingActive('live-meeting-current')) {
            try {
                await appState.resyncLiveMeetingRag();
            }
            catch (error) {
                console.warn('[IPC] Failed to resync live RAG after transcript commit:', error);
            }
        }
        return { success: true, segment: committed, state: intelligenceManager.getLiveTranscriptState() };
    });
    const extractTextFromCustomProviderResponse = (data, fallbackToJson = true) => {
        if (!data)
            return "";
        if (typeof data === 'string')
            return data;
        if (typeof data.response === 'string')
            return data.response;
        if (data.choices?.[0]?.message?.content)
            return data.choices[0].message.content;
        if (data.choices?.[0]?.delta?.content)
            return data.choices[0].delta.content;
        if (Array.isArray(data.content) && data.content[0]?.text)
            return data.content[0].text;
        if (typeof data.text === 'string')
            return data.text;
        if (typeof data.output === 'string')
            return data.output;
        if (typeof data.result === 'string')
            return data.result;
        return fallbackToJson ? JSON.stringify(data) : "";
    };
    const extractTextFromCustomProviderPayload = (data, responsePath) => {
        if (responsePath?.trim()) {
            const extracted = (0, curlUtils_1.getByPath)(data, responsePath.trim());
            if (typeof extracted === 'string')
                return extracted;
            if (extracted !== undefined && extracted !== null)
                return JSON.stringify(extracted, null, 2);
            return "";
        }
        return extractTextFromCustomProviderResponse(data);
    };
    const extractStreamingTextFromCustomProviderPayload = (data, responsePath) => {
        if (responsePath?.trim()) {
            const extracted = (0, curlUtils_1.getByPath)(data, responsePath.trim());
            if (typeof extracted === 'string')
                return extracted;
            if (typeof extracted === 'number' || typeof extracted === 'boolean')
                return String(extracted);
            return "";
        }
        return extractTextFromCustomProviderResponse(data, false);
    };
    const splitConcatenatedJsonPayloads = (rawText) => {
        const payloads = [];
        let start = -1;
        let depth = 0;
        let inString = false;
        let escaping = false;
        for (let i = 0; i < rawText.length; i++) {
            const char = rawText[i];
            if (start === -1) {
                if (/\s/.test(char))
                    continue;
                if (char !== '{' && char !== '[')
                    return null;
                start = i;
                depth = 1;
                inString = false;
                escaping = false;
                continue;
            }
            if (inString) {
                if (escaping) {
                    escaping = false;
                    continue;
                }
                if (char === '\\') {
                    escaping = true;
                    continue;
                }
                if (char === '"') {
                    inString = false;
                }
                continue;
            }
            if (char === '"') {
                inString = true;
                continue;
            }
            if (char === '{' || char === '[') {
                depth++;
                continue;
            }
            if (char === '}' || char === ']') {
                depth--;
                if (depth < 0)
                    return null;
                if (depth === 0) {
                    const segment = rawText.slice(start, i + 1).trim();
                    try {
                        payloads.push(JSON.parse(segment));
                    }
                    catch {
                        return null;
                    }
                    start = -1;
                }
            }
        }
        if (inString || escaping || depth !== 0 || start !== -1) {
            return null;
        }
        return payloads.length > 1 ? payloads : null;
    };
    const normalizeCustomProviderPlainTextFragment = (fragment) => {
        const normalized = fragment
            .split(/\r?\n/)
            .map(line => line.trim())
            .map(line => {
            if (!line || line === '[DONE]' || line === 'data:')
                return '';
            if (line.startsWith('event:'))
                return '';
            if (line.startsWith('data:')) {
                const rest = line.substring(5).trim();
                if (!rest || rest === '[DONE]')
                    return '';
                return rest;
            }
            return line;
        })
            .filter(Boolean)
            .join('\n');
        return normalized.trim();
    };
    const parseCustomProviderSequence = (rawText, responsePath) => {
        const parts = [];
        let start = -1;
        let depth = 0;
        let inString = false;
        let escaping = false;
        let textBuffer = '';
        const flushTextBuffer = () => {
            const normalized = normalizeCustomProviderPlainTextFragment(textBuffer);
            if (normalized) {
                parts.push({ type: 'text', value: normalized });
            }
            textBuffer = '';
        };
        for (let i = 0; i < rawText.length; i++) {
            const char = rawText[i];
            if (start === -1) {
                if (char === '{' || char === '[') {
                    flushTextBuffer();
                    start = i;
                    depth = 1;
                    inString = false;
                    escaping = false;
                    continue;
                }
                textBuffer += char;
                continue;
            }
            if (inString) {
                if (escaping) {
                    escaping = false;
                    continue;
                }
                if (char === '\\') {
                    escaping = true;
                    continue;
                }
                if (char === '"') {
                    inString = false;
                }
                continue;
            }
            if (char === '"') {
                inString = true;
                continue;
            }
            if (char === '{' || char === '[') {
                depth++;
                continue;
            }
            if (char === '}' || char === ']') {
                depth--;
                if (depth < 0)
                    return null;
                if (depth === 0) {
                    const segment = rawText.slice(start, i + 1).trim();
                    try {
                        parts.push({ type: 'payload', value: JSON.parse(segment) });
                    }
                    catch {
                        return null;
                    }
                    start = -1;
                }
            }
        }
        if (inString || escaping || depth !== 0 || start !== -1) {
            return null;
        }
        flushTextBuffer();
        const payloads = parts
            .filter((part) => part.type === 'payload')
            .map(part => part.value);
        if (payloads.length === 0) {
            return null;
        }
        return {
            data: payloads,
            extractedText: parts
                .map(part => part.type === 'text'
                ? part.value
                : extractStreamingTextFromCustomProviderPayload(part.value, responsePath))
                .filter(Boolean)
                .join('')
        };
    };
    const parseCustomProviderRawResponse = (rawText, responsePath) => {
        const trimmed = rawText.trim();
        if (!trimmed)
            return { data: {}, extractedText: "" };
        const lines = trimmed.split(/\r?\n/);
        const structuredPayloads = [];
        const structuredTexts = [];
        let sawStructured = false;
        for (const line of lines) {
            const current = line.trim();
            if (current.startsWith('data:')) {
                if (current === 'data: [DONE]') {
                    sawStructured = true;
                    continue;
                }
                try {
                    const payload = JSON.parse(current.substring(5).trim());
                    sawStructured = true;
                    structuredPayloads.push(payload);
                    const extracted = extractStreamingTextFromCustomProviderPayload(payload, responsePath);
                    if (extracted)
                        structuredTexts.push(extracted);
                    continue;
                }
                catch {
                    // Fall through to sequence parsing below for mixed lines.
                }
            }
            const sequenced = parseCustomProviderSequence(line, responsePath);
            if (sequenced) {
                sawStructured = true;
                structuredPayloads.push(...sequenced.data);
                if (sequenced.extractedText)
                    structuredTexts.push(sequenced.extractedText);
            }
        }
        if (sawStructured) {
            return {
                data: structuredPayloads.length > 0 ? structuredPayloads : trimmed,
                extractedText: structuredTexts.join('')
            };
        }
        try {
            const data = JSON.parse(trimmed);
            return {
                data,
                extractedText: extractTextFromCustomProviderPayload(data, responsePath)
            };
        }
        catch {
            const sequenced = parseCustomProviderSequence(trimmed, responsePath);
            if (sequenced) {
                return sequenced;
            }
            return {
                data: trimmed,
                extractedText: trimmed
            };
        }
    };
    const toPreviewString = (value) => {
        if (value === undefined)
            return "";
        if (typeof value === 'string')
            return value;
        try {
            return JSON.stringify(value, null, 2);
        }
        catch {
            return String(value);
        }
    };
    // --- NEW Test Helper ---
    safeHandle("test-release-fetch", async () => {
        try {
            console.log("[IPC] Manual Test Fetch triggered (forcing refresh)...");
            const { ReleaseNotesManager } = require('./update/ReleaseNotesManager');
            const notes = await ReleaseNotesManager.getInstance().fetchReleaseNotes('latest', true);
            if (notes) {
                console.log("[IPC] Notes fetched for:", notes.version);
                const info = {
                    version: notes.version || 'latest',
                    files: [],
                    path: '',
                    sha512: '',
                    releaseName: notes.summary,
                    releaseNotes: notes.fullBody,
                    parsedNotes: notes
                };
                // Send to renderer
                appState.getMainWindow()?.webContents.send("update-available", info);
                return { success: true };
            }
            return { success: false, error: "No notes returned" };
        }
        catch (err) {
            console.error("[IPC] test-release-fetch failed:", err);
            return { success: false, error: err.message };
        }
    });
    safeHandle("license:activate", async (event, key) => {
        try {
            const { LicenseManager } = require('../premium/electron/services/LicenseManager');
            return await LicenseManager.getInstance().activateLicense(key);
        }
        catch (err) {
            // Only show generic message if the premium module itself is missing.
            // activateLicense() returns {success:false, error} for all expected failures
            // (bad key, network error, etc.) — it should never throw in normal operation.
            console.error('[IPC] license:activate unexpected error:', err);
            return { success: false, error: 'Premium features not available in this build.' };
        }
    });
    safeHandle("license:check-premium", async () => {
        try {
            const { LicenseManager } = require('../premium/electron/services/LicenseManager');
            return LicenseManager.getInstance().isPremium();
        }
        catch {
            return false;
        }
    });
    safeHandle("license:deactivate", async () => {
        try {
            const { LicenseManager } = require('../premium/electron/services/LicenseManager');
            LicenseManager.getInstance().deactivate();
            // Auto-disable knowledge mode when license is removed
            try {
                const orchestrator = appState.getKnowledgeOrchestrator();
                if (orchestrator) {
                    orchestrator.setKnowledgeMode(false);
                    console.log('[IPC] Knowledge mode auto-disabled due to license deactivation');
                }
            }
            catch (e) { /* ignore */ }
        }
        catch { /* LicenseManager not available */ }
        return { success: true };
    });
    safeHandle("license:get-hardware-id", async () => {
        try {
            const { LicenseManager } = require('../premium/electron/services/LicenseManager');
            return LicenseManager.getInstance().getHardwareId();
        }
        catch {
            return 'unavailable';
        }
    });
    safeHandle("get-recognition-languages", async () => {
        return languages_1.RECOGNITION_LANGUAGES;
    });
    safeHandle("get-ai-response-languages", async () => {
        return languages_1.AI_RESPONSE_LANGUAGES;
    });
    safeHandle("set-ai-response-language", async (_, language) => {
        const { CredentialsManager } = require('./services/CredentialsManager');
        CredentialsManager.getInstance().setAiResponseLanguage(language);
        appState.processingHelper?.getLLMHelper?.().setAiResponseLanguage?.(language);
        return { success: true };
    });
    safeHandle("get-stt-language", async () => {
        const { CredentialsManager } = require('./services/CredentialsManager');
        return CredentialsManager.getInstance().getSttLanguage();
    });
    safeHandle("get-ai-response-language", async () => {
        const { CredentialsManager } = require('./services/CredentialsManager');
        return CredentialsManager.getInstance().getAiResponseLanguage();
    });
    safeHandle("update-content-dimensions", async (event, { width, height }) => {
        if (!width || !height)
            return;
        const senderWebContents = event.sender;
        const settingsWin = appState.settingsWindowHelper.getSettingsWindow();
        const overlayWin = appState.getWindowHelper().getOverlayWindow();
        const launcherWin = appState.getWindowHelper().getLauncherWindow();
        if (settingsWin && !settingsWin.isDestroyed() && settingsWin.webContents.id === senderWebContents.id) {
            appState.settingsWindowHelper.setWindowDimensions(settingsWin, width, height);
        }
        else if (overlayWin && !overlayWin.isDestroyed() && overlayWin.webContents.id === senderWebContents.id) {
            // NativelyInterface logic - Resize ONLY the overlay window using dedicated method
            appState.getWindowHelper().setOverlayDimensions(width, height);
        }
    });
    safeHandle("set-overlay-bounds", async (event, bounds) => {
        if (!bounds)
            return;
        const overlayWin = appState.getWindowHelper().getOverlayWindow();
        const senderWebContents = event.sender;
        if (overlayWin && !overlayWin.isDestroyed() && overlayWin.webContents.id === senderWebContents.id) {
            appState.getWindowHelper().setOverlayBounds(bounds);
        }
        return { success: true };
    });
    safeHandle("set-window-mode", async (event, mode) => {
        appState.getWindowHelper().setWindowMode(mode);
        return { success: true };
    });
    safeHandle("delete-screenshot", async (event, filePath) => {
        // Guard: only allow deletion of files within the app's own userData directory
        const userDataDir = electron_1.app.getPath('userData');
        const resolved = path.resolve(filePath);
        if (!resolved.startsWith(userDataDir + path.sep)) {
            console.warn('[IPC] delete-screenshot: path outside userData rejected:', filePath);
            return { success: false, error: 'Path not allowed' };
        }
        return appState.deleteScreenshot(resolved);
    });
    safeHandle("take-screenshot", async () => {
        try {
            const screenshotPath = await appState.takeScreenshot();
            const preview = await appState.getImagePreview(screenshotPath);
            return { path: screenshotPath, preview };
        }
        catch (error) {
            // console.error("Error taking screenshot:", error)
            throw error;
        }
    });
    safeHandle("take-selective-screenshot", async () => {
        try {
            const screenshotPath = await appState.takeSelectiveScreenshot();
            const preview = await appState.getImagePreview(screenshotPath);
            return { path: screenshotPath, preview };
        }
        catch (error) {
            if (error.message === "Selection cancelled") {
                return { cancelled: true };
            }
            throw error;
        }
    });
    safeHandle("get-screenshots", async () => {
        // console.log({ view: appState.getView() })
        try {
            let previews = [];
            if (appState.getView() === "queue") {
                previews = await Promise.all(appState.getScreenshotQueue().map(async (path) => ({
                    path,
                    preview: await appState.getImagePreview(path)
                })));
            }
            else {
                previews = await Promise.all(appState.getExtraScreenshotQueue().map(async (path) => ({
                    path,
                    preview: await appState.getImagePreview(path)
                })));
            }
            // previews.forEach((preview: any) => console.log(preview.path))
            return previews;
        }
        catch (error) {
            // console.error("Error getting screenshots:", error)
            throw error;
        }
    });
    safeHandle("toggle-window", async () => {
        appState.toggleMainWindow();
    });
    safeHandle("show-window", async () => {
        // Default show main window (Launcher usually)
        appState.showMainWindow();
    });
    safeHandle("hide-window", async () => {
        appState.hideMainWindow();
    });
    safeHandle("get-overlay-window-state", async () => {
        return appState.getWindowHelper().getOverlayWindowState();
    });
    safeHandle("reset-queues", async () => {
        try {
            appState.clearQueues();
            // console.log("Screenshot queues have been cleared.")
            return { success: true };
        }
        catch (error) {
            // console.error("Error resetting queues:", error)
            return { success: false, error: error.message };
        }
    });
    // Donation IPC Handlers
    safeHandle("get-donation-status", async () => {
        const { DonationManager } = require('./DonationManager');
        const manager = DonationManager.getInstance();
        return {
            shouldShow: manager.shouldShowToaster(),
            hasDonated: manager.getDonationState().hasDonated,
            lifetimeShows: manager.getDonationState().lifetimeShows
        };
    });
    safeHandle("mark-donation-toast-shown", async () => {
        const { DonationManager } = require('./DonationManager');
        DonationManager.getInstance().markAsShown();
        return { success: true };
    });
    safeHandle("set-donation-complete", async () => {
        const { DonationManager } = require('./DonationManager');
        DonationManager.getInstance().setHasDonated(true);
        return { success: true };
    });
    // Generate suggestion from transcript - Natively-style text-only reasoning
    safeHandle("generate-suggestion", async (event, context, lastQuestion) => {
        try {
            const suggestion = await appState.processingHelper.getLLMHelper().generateSuggestion(context, lastQuestion);
            return { suggestion };
        }
        catch (error) {
            // console.error("Error generating suggestion:", error)
            throw error;
        }
    });
    safeHandle("finalize-mic-stt", async () => {
        appState.finalizeMicSTT();
    });
    // IPC handler for analyzing image from file path
    safeHandle("analyze-image-file", async (event, filePath, traceContext) => {
        return LlmTraceRecorder_1.llmTraceRecorder.runWithAction(buildTraceAction({
            type: "image_analysis",
            label: "Image analysis",
        }, traceContext), async () => {
            // Guard: only allow reading files within the app's own userData directory
            const userDataDir = electron_1.app.getPath('userData');
            const resolved = path.resolve(filePath);
            if (!resolved.startsWith(userDataDir + path.sep)) {
                console.warn('[IPC] analyze-image-file: path outside userData rejected:', filePath);
                throw new Error('Path not allowed');
            }
            LlmTraceRecorder_1.llmTraceRecorder.updateResolvedInput({
                filePath: resolved,
                imagePaths: [resolved],
            });
            try {
                const result = await appState.processingHelper.getLLMHelper().analyzeImageFiles([resolved]);
                LlmTraceRecorder_1.llmTraceRecorder.appendStep({
                    kind: "app",
                    stage: "image_analysis_result",
                    responseBody: result,
                });
                return result;
            }
            catch (error) {
                throw error;
            }
        });
    });
    safeHandle("gemini-chat", async (event, message, imagePaths, context, options) => {
        try {
            const result = await appState.processingHelper.getLLMHelper().chatWithGemini(message, imagePaths, context, options?.skipSystemPrompt);
            console.log(`[IPC] gemini - chat response: `, result ? result.substring(0, 50) : "(empty)");
            // Don't process empty responses
            if (!result || result.trim().length === 0) {
                console.warn("[IPC] Empty response from LLM, not updating IntelligenceManager");
                return "I apologize, but I couldn't generate a response. Please try again.";
            }
            // Sync with IntelligenceManager so Follow-Up/Recap work
            const intelligenceManager = appState.getIntelligenceManager();
            // 1. Add user question to context (as 'user')
            // CRITICAL: Skip refinement check to prevent auto-triggering follow-up logic
            // The user's manual question is a NEW input, not a refinement of previous answer.
            intelligenceManager.addTranscript({
                text: message,
                speaker: 'user',
                timestamp: Date.now(),
                final: true
            }, true);
            // 2. Add assistant response and set as last message
            console.log(`[IPC] Updating IntelligenceManager with assistant message...`);
            intelligenceManager.addAssistantMessage(result);
            console.log(`[IPC] Updated IntelligenceManager.Last message: `, intelligenceManager.getLastAssistantMessage()?.substring(0, 50));
            // Log Usage
            intelligenceManager.logUsage('chat', message, result);
            return result;
        }
        catch (error) {
            // console.error("Error in gemini-chat handler:", error);
            throw error;
        }
    });
    // Streaming IPC Handler
    safeHandle("gemini-chat-stream", async (event, message, imagePaths, context, options) => {
        return LlmTraceRecorder_1.llmTraceRecorder.runWithAction(buildTraceAction({
            type: "manual_submit",
            label: "Manual submit",
        }, options?.traceContext), async () => {
            try {
                console.log("[IPC] gemini-chat-stream started using LLMHelper.streamChat");
                const llmHelper = appState.processingHelper.getLLMHelper();
                // Update IntelligenceManager with USER message immediately
                const intelligenceManager = appState.getIntelligenceManager();
                intelligenceManager.addTranscript({
                    text: message,
                    speaker: 'user',
                    timestamp: Date.now(),
                    final: true
                }, true);
                let fullResponse = "";
                let autoInjectedContext = false;
                LlmTraceRecorder_1.llmTraceRecorder.updateResolvedInput({
                    message,
                    imagePaths: imagePaths || [],
                    context: context || "",
                    skipSystemPrompt: Boolean(options?.skipSystemPrompt),
                    autoInjectedContext: false,
                });
                // Context Injection for "Answer" button (100s rolling window)
                if (!context) {
                    try {
                        const autoContext = intelligenceManager.getFormattedContext(100);
                        if (autoContext && autoContext.trim().length > 0) {
                            context = autoContext;
                            autoInjectedContext = true;
                            console.log(`[IPC] Auto - injected 100s context for gemini - chat - stream(${context.length} chars)`);
                        }
                    }
                    catch (ctxErr) {
                        console.warn("[IPC] Failed to auto-inject context:", ctxErr);
                    }
                }
                LlmTraceRecorder_1.llmTraceRecorder.updateResolvedInput({
                    context: context || "",
                    autoInjectedContext,
                });
                try {
                    const stream = llmHelper.streamChat(message, imagePaths, context, options?.skipSystemPrompt ? "" : undefined);
                    for await (const token of stream) {
                        event.sender.send("gemini-stream-token", token);
                        fullResponse += token;
                    }
                    event.sender.send("gemini-stream-done");
                    if (fullResponse.trim().length > 0) {
                        intelligenceManager.addAssistantMessage(fullResponse);
                        intelligenceManager.logUsage('chat', message, fullResponse);
                        LlmTraceRecorder_1.llmTraceRecorder.appendStep({
                            kind: "app",
                            stage: "assistant_result",
                            responseBody: fullResponse,
                        });
                    }
                }
                catch (streamError) {
                    console.error("[IPC] Streaming error:", streamError);
                    event.sender.send("gemini-stream-error", streamError.message || "Unknown streaming error");
                    throw streamError;
                }
                return null;
            }
            catch (error) {
                console.error("[IPC] Error in gemini-chat-stream setup:", error);
                throw error;
            }
        });
    });
    safeHandle("quit-app", () => {
        electron_1.app.quit();
    });
    safeHandle("quit-and-install-update", () => {
        console.log('[IPC] quit-and-install-update handler called');
        appState.quitAndInstallUpdate();
    });
    safeHandle("delete-meeting", async (_, id) => {
        return DatabaseManager_1.DatabaseManager.getInstance().deleteMeeting(id);
    });
    safeHandle("check-for-updates", async () => {
        await appState.checkForUpdates();
    });
    safeHandle("download-update", async () => {
        appState.downloadUpdate();
    });
    // Window movement handlers
    safeHandle("move-window-left", async () => {
        appState.moveWindowLeft();
    });
    safeHandle("move-window-right", async () => {
        appState.moveWindowRight();
    });
    safeHandle("move-window-up", async () => {
        appState.moveWindowUp();
    });
    safeHandle("move-window-down", async () => {
        appState.moveWindowDown();
    });
    safeHandle("center-and-show-window", async () => {
        appState.centerAndShowWindow();
    });
    // Settings Window
    safeHandle("toggle-settings-window", (event, { x, y } = {}) => {
        appState.settingsWindowHelper.toggleWindow(x, y);
    });
    safeHandle("close-settings-window", () => {
        appState.settingsWindowHelper.closeWindow();
    });
    safeHandle("set-undetectable", async (_, state) => {
        appState.setUndetectable(state);
        return { success: true };
    });
    safeHandle("set-disguise", async (_, mode) => {
        appState.setDisguise(mode);
        return { success: true };
    });
    safeHandle("get-undetectable", async () => {
        return appState.getUndetectable();
    });
    safeHandle("get-disguise", async () => {
        return appState.getDisguise();
    });
    safeHandle("set-open-at-login", async (_, openAtLogin) => {
        electron_1.app.setLoginItemSettings({
            openAtLogin,
            openAsHidden: false,
            path: electron_1.app.getPath('exe') // Explicitly point to executable for production reliability
        });
        return { success: true };
    });
    safeHandle("get-open-at-login", async () => {
        const settings = electron_1.app.getLoginItemSettings();
        return settings.openAtLogin;
    });
    // LLM Model Management Handlers
    safeHandle("get-current-llm-config", async () => {
        try {
            const llmHelper = appState.processingHelper.getLLMHelper();
            return {
                provider: llmHelper.getCurrentProvider(),
                model: llmHelper.getCurrentModel(),
                isOllama: llmHelper.isUsingOllama()
            };
        }
        catch (error) {
            // console.error("Error getting current LLM config:", error);
            throw error;
        }
    });
    safeHandle("get-available-ollama-models", async () => {
        try {
            const llmHelper = appState.processingHelper.getLLMHelper();
            const models = await llmHelper.getOllamaModels();
            return models;
        }
        catch (error) {
            // console.error("Error getting Ollama models:", error);
            throw error;
        }
    });
    safeHandle("switch-to-ollama", async (_, model, url) => {
        try {
            const llmHelper = appState.processingHelper.getLLMHelper();
            await llmHelper.switchToOllama(model, url);
            return { success: true };
        }
        catch (error) {
            // console.error("Error switching to Ollama:", error);
            return { success: false, error: error.message };
        }
    });
    safeHandle("force-restart-ollama", async () => {
        try {
            const llmHelper = appState.processingHelper.getLLMHelper();
            const success = await llmHelper.forceRestartOllama();
            return { success };
        }
        catch (error) {
            console.error("Error force restarting Ollama:", error);
            return { success: false, error: error.message };
        }
    });
    safeHandle('restart-ollama', async () => {
        try {
            // First try to kill it if it's running
            await appState.processingHelper.getLLMHelper().forceRestartOllama();
            // The forceRestartOllama now calls OllamaManager.getInstance().init() internally
            // so we don't need to do it again here.
            return true;
        }
        catch (error) {
            console.error("[IPC restart-ollama] Failed to restart:", error);
            return false;
        }
    });
    safeHandle("ensure-ollama-running", async () => {
        try {
            const { OllamaManager } = require('./services/OllamaManager');
            await OllamaManager.getInstance().init();
            return { success: true };
        }
        catch (error) {
            return { success: false, message: error.message };
        }
    });
    safeHandle("switch-to-gemini", async (_, apiKey, modelId) => {
        try {
            const llmHelper = appState.processingHelper.getLLMHelper();
            await llmHelper.switchToGemini(apiKey, modelId);
            // Persist API key if provided
            if (apiKey) {
                const { CredentialsManager } = require('./services/CredentialsManager');
                CredentialsManager.getInstance().setGeminiApiKey(apiKey);
            }
            return { success: true };
        }
        catch (error) {
            // console.error("Error switching to Gemini:", error);
            return { success: false, error: error.message };
        }
    });
    // Dedicated API key setters (for Settings UI Save buttons)
    safeHandle("set-gemini-api-key", async (_, apiKey) => {
        try {
            const { CredentialsManager } = require('./services/CredentialsManager');
            CredentialsManager.getInstance().setGeminiApiKey(apiKey);
            // Also update the LLMHelper immediately
            const llmHelper = appState.processingHelper.getLLMHelper();
            llmHelper.setApiKey(apiKey);
            // Re-init IntelligenceManager
            appState.getIntelligenceManager().initializeLLMs();
            return { success: true };
        }
        catch (error) {
            console.error("Error saving Gemini API key:", error);
            return { success: false, error: error.message };
        }
    });
    safeHandle("set-groq-api-key", async (_, apiKey) => {
        try {
            const { CredentialsManager } = require('./services/CredentialsManager');
            CredentialsManager.getInstance().setGroqApiKey(apiKey);
            // Also update the LLMHelper immediately
            const llmHelper = appState.processingHelper.getLLMHelper();
            llmHelper.setGroqApiKey(apiKey);
            // Re-init IntelligenceManager
            appState.getIntelligenceManager().initializeLLMs();
            return { success: true };
        }
        catch (error) {
            console.error("Error saving Groq API key:", error);
            return { success: false, error: error.message };
        }
    });
    safeHandle("set-openai-api-key", async (_, apiKey) => {
        try {
            const { CredentialsManager } = require('./services/CredentialsManager');
            CredentialsManager.getInstance().setOpenaiApiKey(apiKey);
            // Also update the LLMHelper immediately
            const llmHelper = appState.processingHelper.getLLMHelper();
            llmHelper.setOpenaiApiKey(apiKey);
            // Re-init IntelligenceManager
            appState.getIntelligenceManager().initializeLLMs();
            return { success: true };
        }
        catch (error) {
            console.error("Error saving OpenAI API key:", error);
            return { success: false, error: error.message };
        }
    });
    safeHandle("set-claude-api-key", async (_, apiKey) => {
        try {
            const { CredentialsManager } = require('./services/CredentialsManager');
            CredentialsManager.getInstance().setClaudeApiKey(apiKey);
            // Also update the LLMHelper immediately
            const llmHelper = appState.processingHelper.getLLMHelper();
            llmHelper.setClaudeApiKey(apiKey);
            // Re-init IntelligenceManager
            appState.getIntelligenceManager().initializeLLMs();
            return { success: true };
        }
        catch (error) {
            console.error("Error saving Claude API key:", error);
            return { success: false, error: error.message };
        }
    });
    // Custom Provider Handlers
    safeHandle("get-custom-providers", async () => {
        try {
            const { CredentialsManager } = require('./services/CredentialsManager');
            const cm = CredentialsManager.getInstance();
            // Merge new Curl Providers with legacy Custom Providers
            // New ones take precedence if IDs conflict (though unlikely as UUIDs)
            const curlProviders = cm.getCurlProviders();
            const legacyProviders = cm.getCustomProviders() || [];
            return [...curlProviders, ...legacyProviders];
        }
        catch (error) {
            console.error("Error getting custom providers:", error);
            return [];
        }
    });
    safeHandle("save-custom-provider", async (_, provider) => {
        try {
            const { CredentialsManager } = require('./services/CredentialsManager');
            // Save as CurlProvider (supports responsePath)
            CredentialsManager.getInstance().saveCurlProvider(provider);
            return { success: true };
        }
        catch (error) {
            console.error("Error saving custom provider:", error);
            return { success: false, error: error.message };
        }
    });
    safeHandle("delete-custom-provider", async (_, id) => {
        try {
            const { CredentialsManager } = require('./services/CredentialsManager');
            // Try deleting from both storages to be safe
            CredentialsManager.getInstance().deleteCurlProvider(id);
            CredentialsManager.getInstance().deleteCustomProvider(id);
            return { success: true };
        }
        catch (error) {
            console.error("Error deleting custom provider:", error);
            return { success: false, error: error.message };
        }
    });
    safeHandle("switch-to-custom-provider", async (_, providerId) => {
        try {
            const { CredentialsManager } = require('./services/CredentialsManager');
            const provider = CredentialsManager.getInstance().getCustomProviders().find((p) => p.id === providerId);
            if (!provider) {
                throw new Error("Provider not found");
            }
            const llmHelper = appState.processingHelper.getLLMHelper();
            await llmHelper.switchToCustom(provider);
            // Re-init IntelligenceManager (optional, but good for consistency)
            appState.getIntelligenceManager().initializeLLMs();
            return { success: true };
        }
        catch (error) {
            console.error("Error switching to custom provider:", error);
            return { success: false, error: error.message };
        }
    });
    // cURL Provider Handlers
    safeHandle("get-curl-providers", async () => {
        try {
            const { CredentialsManager } = require('./services/CredentialsManager');
            return CredentialsManager.getInstance().getCurlProviders();
        }
        catch (error) {
            console.error("Error getting curl providers:", error);
            return [];
        }
    });
    safeHandle("save-curl-provider", async (_, provider) => {
        try {
            const { CredentialsManager } = require('./services/CredentialsManager');
            CredentialsManager.getInstance().saveCurlProvider(provider);
            return { success: true };
        }
        catch (error) {
            console.error("Error saving curl provider:", error);
            return { success: false, error: error.message };
        }
    });
    safeHandle("delete-curl-provider", async (_, id) => {
        try {
            const { CredentialsManager } = require('./services/CredentialsManager');
            CredentialsManager.getInstance().deleteCurlProvider(id);
            return { success: true };
        }
        catch (error) {
            console.error("Error deleting curl provider:", error);
            return { success: false, error: error.message };
        }
    });
    safeHandle("switch-to-curl-provider", async (_, providerId) => {
        try {
            const { CredentialsManager } = require('./services/CredentialsManager');
            const provider = CredentialsManager.getInstance().getCurlProviders().find((p) => p.id === providerId);
            if (!provider) {
                throw new Error("Provider not found");
            }
            const llmHelper = appState.processingHelper.getLLMHelper();
            await llmHelper.switchToCurl(provider);
            // Re-init IntelligenceManager (optional, but good for consistency)
            appState.getIntelligenceManager().initializeLLMs();
            return { success: true };
        }
        catch (error) {
            console.error("Error switching to curl provider:", error);
            return { success: false, error: error.message };
        }
    });
    safeHandle("test-custom-provider-connection", async (_, provider) => {
        console.log(`[IPC] Received test-custom-provider-connection request for provider: ${provider?.name || 'Unnamed Provider'}`);
        try {
            if (!provider?.curlCommand || !provider.curlCommand.trim()) {
                return { success: false, error: 'No cURL command provided' };
            }
            const requestConfig = (0, curl_to_json_1.default)(provider.curlCommand);
            const method = (requestConfig.method || 'POST').toUpperCase();
            const testPrompt = "Return exactly the word OK. This is a connection test.";
            const variables = {
                TEXT: testPrompt,
                PROMPT: testPrompt,
                SYSTEM_PROMPT: "You are a connection test assistant. Reply with OK.",
                USER_MESSAGE: "Return exactly OK.",
                CONTEXT: "This request is only checking whether the provider can be reached successfully.",
                IMAGE_BASE64: "",
            };
            const url = (0, curlUtils_1.deepVariableReplacer)(requestConfig.url, variables);
            const headers = (0, curlUtils_1.deepVariableReplacer)(requestConfig.header || {}, variables);
            const body = (0, curlUtils_1.deepVariableReplacer)(requestConfig.data || {}, variables);
            const requestInit = {
                method,
                headers,
            };
            if (!['GET', 'HEAD'].includes(method)) {
                const hasBody = body !== undefined &&
                    body !== null &&
                    !(typeof body === 'object' && !Array.isArray(body) && Object.keys(body).length === 0);
                if (hasBody) {
                    requestInit.body = typeof body === 'string' ? body : JSON.stringify(body);
                }
            }
            const response = await fetch(url, requestInit);
            const rawText = await response.text();
            const { data, extractedText } = parseCustomProviderRawResponse(rawText, provider.responsePath?.trim());
            if (!response.ok) {
                const errorPayload = typeof data === 'string' ? data : JSON.stringify(data);
                throw new Error(`HTTP ${response.status}: ${errorPayload || response.statusText}`);
            }
            let extractedPreview = "";
            if (provider.responsePath?.trim()) {
                const extracted = (0, curlUtils_1.getByPath)(data, provider.responsePath.trim());
                if (extracted === undefined) {
                    return {
                        success: false,
                        error: `Connected, but responsePath "${provider.responsePath}" did not match the response.`,
                        preview: {
                            requestUrl: url,
                            method,
                            status: response.status,
                            responsePath: provider.responsePath.trim(),
                            rawResponse: toPreviewString(data),
                            extractedResponse: "",
                        },
                    };
                }
                const normalized = typeof extracted === 'string' ? extracted : JSON.stringify(extracted, null, 2);
                if (!normalized?.trim()) {
                    return {
                        success: false,
                        error: `Connected, but responsePath "${provider.responsePath}" returned empty content.`,
                        preview: {
                            requestUrl: url,
                            method,
                            status: response.status,
                            responsePath: provider.responsePath.trim(),
                            rawResponse: toPreviewString(data),
                            extractedResponse: normalized,
                        },
                    };
                }
                extractedPreview = normalized;
            }
            else {
                const extracted = extractedText;
                if (!extracted?.trim()) {
                    return {
                        success: false,
                        error: 'Connected, but no usable response text was returned.',
                        preview: {
                            requestUrl: url,
                            method,
                            status: response.status,
                            responsePath: '',
                            rawResponse: toPreviewString(data),
                            extractedResponse: extracted,
                        },
                    };
                }
                extractedPreview = extracted;
            }
            return {
                success: true,
                preview: {
                    requestUrl: url,
                    method,
                    status: response.status,
                    responsePath: provider.responsePath?.trim() || '',
                    rawResponse: toPreviewString(data),
                    extractedResponse: extractedPreview,
                },
            };
        }
        catch (error) {
            const rawMsg = error?.message || 'Connection failed';
            const msg = sanitizeErrorMessage(rawMsg);
            console.error("Custom provider connection test failed:", msg);
            return { success: false, error: msg };
        }
    });
    // Get stored API keys (masked for UI display)
    safeHandle("get-stored-credentials", async () => {
        try {
            const { CredentialsManager } = require('./services/CredentialsManager');
            const creds = CredentialsManager.getInstance().getAllCredentials();
            // Return masked versions for security (just indicate if set)
            const hasKey = (key) => !!(key && key.trim().length > 0);
            const manager = CredentialsManager.getInstance();
            return {
                hasGeminiKey: hasKey(creds.geminiApiKey),
                hasGroqKey: hasKey(creds.groqApiKey),
                hasOpenaiKey: hasKey(creds.openaiApiKey),
                hasClaudeKey: hasKey(creds.claudeApiKey),
                hasAlibabaLlmKey: hasKey(creds.alibabaLlmApiKey),
                openaiBaseUrl: manager.getOpenaiBaseUrl(),
                alibabaLlmBaseUrl: manager.getAlibabaLlmBaseUrl(),
                googleServiceAccountPath: creds.googleServiceAccountPath || null,
                sttProvider: manager.getSttProvider(),
                groqSttModel: creds.groqSttModel || 'whisper-large-v3-turbo',
                hasSttGroqKey: hasKey(creds.groqSttApiKey),
                hasSttOpenaiKey: hasKey(creds.openAiSttApiKey),
                hasDeepgramKey: hasKey(manager.getDeepgramApiKey()),
                hasElevenLabsKey: hasKey(creds.elevenLabsApiKey),
                hasAzureKey: hasKey(creds.azureApiKey),
                azureRegion: creds.azureRegion || 'eastus',
                hasIbmWatsonKey: hasKey(creds.ibmWatsonApiKey),
                ibmWatsonRegion: creds.ibmWatsonRegion || 'us-south',
                hasSonioxKey: hasKey(creds.sonioxApiKey),
                hasAlibabaKey: hasKey(manager.getAlibabaSttApiKey()),
                technicalGlossaryConfig: manager.getTechnicalGlossaryConfig(),
                hasGoogleSearchKey: hasKey(creds.googleSearchApiKey),
                hasGoogleSearchCseId: hasKey(creds.googleSearchCseId),
                // Dynamic Model Discovery - preferred models
                geminiPreferredModel: creds.geminiPreferredModel || undefined,
                groqPreferredModel: creds.groqPreferredModel || undefined,
                openaiPreferredModel: creds.openaiPreferredModel || undefined,
                claudePreferredModel: creds.claudePreferredModel || undefined,
                alibabaPreferredModel: creds.alibabaPreferredModel || undefined,
            };
        }
        catch (error) {
            return { hasGeminiKey: false, hasGroqKey: false, hasOpenaiKey: false, hasClaudeKey: false, hasAlibabaLlmKey: false, openaiBaseUrl: '', alibabaLlmBaseUrl: '', googleServiceAccountPath: null, sttProvider: 'google', groqSttModel: 'whisper-large-v3-turbo', hasSttGroqKey: false, hasSttOpenaiKey: false, hasDeepgramKey: false, hasElevenLabsKey: false, hasAzureKey: false, azureRegion: 'eastus', hasIbmWatsonKey: false, ibmWatsonRegion: 'us-south', hasSonioxKey: false, hasAlibabaKey: false, technicalGlossaryConfig: null, hasGoogleSearchKey: false, hasGoogleSearchCseId: false };
        }
    });
    // ==========================================
    // Dynamic Model Discovery Handlers
    // ==========================================
    safeHandle("fetch-provider-models", async (_, provider, config) => {
        try {
            const { CredentialsManager } = require('./services/CredentialsManager');
            const cm = CredentialsManager.getInstance();
            const sanitizedConfig = sanitizeLlmProviderConfig(config);
            let providerConfig = { ...sanitizedConfig };
            if (provider === 'openai' || provider === 'alibaba') {
                providerConfig = {
                    ...cm.getOpenAICompatibleProviderConfig(provider),
                    ...sanitizedConfig,
                };
            }
            else if (!providerConfig.apiKey) {
                if (provider === 'gemini')
                    providerConfig.apiKey = cm.getGeminiApiKey();
                else if (provider === 'groq')
                    providerConfig.apiKey = cm.getGroqApiKey();
                else if (provider === 'claude')
                    providerConfig.apiKey = cm.getClaudeApiKey();
            }
            if (!providerConfig.apiKey) {
                return { success: false, error: 'No API key available. Please save a key first.' };
            }
            const { fetchProviderModels } = require('./utils/modelFetcher');
            const models = await fetchProviderModels(provider, providerConfig);
            return { success: true, models };
        }
        catch (error) {
            console.error(`[IPC] Failed to fetch ${provider} models:`, error);
            const msg = error?.response?.data?.error?.message || error.message || 'Failed to fetch models';
            return { success: false, error: msg };
        }
    });
    safeHandle("set-provider-preferred-model", async (_, provider, modelId) => {
        try {
            const { CredentialsManager } = require('./services/CredentialsManager');
            const cm = CredentialsManager.getInstance();
            cm.setPreferredModel(provider, modelId);
            if (provider === 'openai' || provider === 'alibaba') {
                syncOpenAICompatibleProvider(provider);
            }
        }
        catch (error) {
            console.error(`[IPC] Failed to set preferred model for ${provider}:`, error);
        }
    });
    // ==========================================
    // STT Provider Management Handlers
    // ==========================================
    safeHandle("set-stt-provider", async (_, provider) => {
        try {
            const { CredentialsManager } = require('./services/CredentialsManager');
            CredentialsManager.getInstance().setSttProvider(provider);
            // Reconfigure the audio pipeline to use the new STT provider
            await appState.reconfigureSttProvider();
            return { success: true };
        }
        catch (error) {
            console.error("Error setting STT provider:", error);
            return { success: false, error: error.message };
        }
    });
    safeHandle("get-stt-provider", async () => {
        try {
            const { CredentialsManager } = require('./services/CredentialsManager');
            return CredentialsManager.getInstance().getSttProvider();
        }
        catch (error) {
            return 'google';
        }
    });
    safeHandle("set-groq-stt-api-key", async (_, apiKey) => {
        try {
            const { CredentialsManager } = require('./services/CredentialsManager');
            CredentialsManager.getInstance().setGroqSttApiKey(apiKey);
            await appState.reconfigureSttProvider();
            appState.refreshSttCompareSession();
            return { success: true };
        }
        catch (error) {
            console.error("Error saving Groq STT API key:", error);
            return { success: false, error: error.message };
        }
    });
    safeHandle("set-openai-stt-api-key", async (_, apiKey) => {
        try {
            const { CredentialsManager } = require('./services/CredentialsManager');
            CredentialsManager.getInstance().setOpenAiSttApiKey(apiKey);
            await appState.reconfigureSttProvider();
            appState.refreshSttCompareSession();
            return { success: true };
        }
        catch (error) {
            console.error("Error saving OpenAI STT API key:", error);
            return { success: false, error: error.message };
        }
    });
    safeHandle("set-deepgram-api-key", async (_, apiKey) => {
        try {
            const { CredentialsManager } = require('./services/CredentialsManager');
            CredentialsManager.getInstance().setDeepgramApiKey(apiKey);
            await appState.reconfigureSttProvider();
            appState.refreshSttCompareSession();
            return { success: true };
        }
        catch (error) {
            console.error("Error saving Deepgram API key:", error);
            return { success: false, error: error.message };
        }
    });
    safeHandle("set-groq-stt-model", async (_, model) => {
        try {
            const { CredentialsManager } = require('./services/CredentialsManager');
            CredentialsManager.getInstance().setGroqSttModel(model);
            // Reconfigure the audio pipeline to use the new model
            await appState.reconfigureSttProvider();
            return { success: true };
        }
        catch (error) {
            console.error("Error setting Groq STT model:", error);
            return { success: false, error: error.message };
        }
    });
    safeHandle("set-elevenlabs-api-key", async (_, apiKey) => {
        try {
            const { CredentialsManager } = require('./services/CredentialsManager');
            CredentialsManager.getInstance().setElevenLabsApiKey(apiKey);
            await appState.reconfigureSttProvider();
            appState.refreshSttCompareSession();
            return { success: true };
        }
        catch (error) {
            console.error("Error saving ElevenLabs API key:", error);
            return { success: false, error: error.message };
        }
    });
    safeHandle("set-azure-api-key", async (_, apiKey) => {
        try {
            const { CredentialsManager } = require('./services/CredentialsManager');
            CredentialsManager.getInstance().setAzureApiKey(apiKey);
            await appState.reconfigureSttProvider();
            appState.refreshSttCompareSession();
            return { success: true };
        }
        catch (error) {
            console.error("Error saving Azure API key:", error);
            return { success: false, error: error.message };
        }
    });
    safeHandle("set-azure-region", async (_, region) => {
        try {
            const { CredentialsManager } = require('./services/CredentialsManager');
            CredentialsManager.getInstance().setAzureRegion(region);
            // Reconfigure the pipeline since region changes the endpoint URL
            await appState.reconfigureSttProvider();
            return { success: true };
        }
        catch (error) {
            console.error("Error setting Azure region:", error);
            return { success: false, error: error.message };
        }
    });
    safeHandle("set-ibmwatson-api-key", async (_, apiKey) => {
        try {
            const { CredentialsManager } = require('./services/CredentialsManager');
            CredentialsManager.getInstance().setIbmWatsonApiKey(apiKey);
            await appState.reconfigureSttProvider();
            appState.refreshSttCompareSession();
            return { success: true };
        }
        catch (error) {
            console.error("Error saving IBM Watson API key:", error);
            return { success: false, error: error.message };
        }
    });
    safeHandle("set-soniox-api-key", async (_, apiKey) => {
        try {
            const { CredentialsManager } = require('./services/CredentialsManager');
            CredentialsManager.getInstance().setSonioxApiKey(apiKey);
            await appState.reconfigureSttProvider();
            appState.refreshSttCompareSession();
            return { success: true };
        }
        catch (error) {
            console.error("Error saving Soniox API key:", error);
            return { success: false, error: error.message };
        }
    });
    safeHandle("set-openai-provider-config", async (_, config) => {
        try {
            const { CredentialsManager } = require('./services/CredentialsManager');
            CredentialsManager.getInstance().setOpenaiProviderConfig(config);
            syncOpenAICompatibleProvider('openai');
            appState.getIntelligenceManager().initializeLLMs();
            return { success: true };
        }
        catch (error) {
            console.error("Error saving OpenAI provider config:", error);
            return { success: false, error: error.message };
        }
    });
    safeHandle("set-alibaba-llm-provider-config", async (_, config) => {
        try {
            const { CredentialsManager } = require('./services/CredentialsManager');
            CredentialsManager.getInstance().setAlibabaLlmProviderConfig(config);
            syncOpenAICompatibleProvider('alibaba');
            appState.getIntelligenceManager().initializeLLMs();
            return { success: true };
        }
        catch (error) {
            console.error("Error saving Alibaba provider config:", error);
            return { success: false, error: error.message };
        }
    });
    safeHandle("set-alibaba-stt-api-key", async (_, apiKey) => {
        try {
            const { CredentialsManager } = require('./services/CredentialsManager');
            CredentialsManager.getInstance().setAlibabaSttApiKey(apiKey);
            await appState.reconfigureSttProvider();
            appState.refreshSttCompareSession();
            return { success: true };
        }
        catch (error) {
            console.error("Error saving Alibaba STT API key:", error);
            return { success: false, error: error.message };
        }
    });
    safeHandle("get-technical-glossary", async () => {
        try {
            const { CredentialsManager } = require('./services/CredentialsManager');
            return CredentialsManager.getInstance().getTechnicalGlossaryConfig();
        }
        catch (error) {
            console.error("Error getting technical glossary:", error);
            return null;
        }
    });
    safeHandle("set-technical-glossary", async (_, config) => {
        try {
            appState.setTechnicalGlossaryConfig(config);
            return { success: true };
        }
        catch (error) {
            console.error("Error saving technical glossary:", error);
            return { success: false, error: error.message };
        }
    });
    // Helper to sanitize error messages (remove API key references)
    const sanitizeErrorMessage = (msg) => {
        // Remove patterns like ": sk-***...***" or ": sdasdada***...dwwC"
        return msg.replace(/:\s*[a-zA-Z0-9*]+\*+[a-zA-Z0-9*]+\.?$/g, '').trim();
    };
    safeHandle("test-stt-connection", async (_, provider, apiKey, region) => {
        console.log(`[IPC] Received test - stt - connection request for provider: ${provider} `);
        try {
            const normalizedApiKey = apiKey.trim();
            if (provider === 'deepgram') {
                // Test Deepgram via WebSocket connection
                const WebSocket = require('ws');
                return await new Promise((resolve) => {
                    const url = 'wss://api.deepgram.com/v1/listen?model=nova-3&encoding=linear16&sample_rate=16000&channels=1';
                    const ws = new WebSocket(url, {
                        headers: { Authorization: `Token ${normalizedApiKey}` },
                    });
                    const timeout = setTimeout(() => {
                        ws.close();
                        resolve({ success: false, error: 'Connection timed out' });
                    }, 15000);
                    ws.on('open', () => {
                        clearTimeout(timeout);
                        try {
                            ws.send(JSON.stringify({ type: 'CloseStream' }));
                        }
                        catch { }
                        ws.close();
                        resolve({ success: true });
                    });
                    ws.on('error', (err) => {
                        clearTimeout(timeout);
                        resolve({ success: false, error: err.message || 'Connection failed' });
                    });
                });
            }
            if (provider === 'soniox') {
                // Test Soniox via WebSocket connection
                const WebSocket = require('ws');
                return await new Promise((resolve) => {
                    const ws = new WebSocket('wss://stt-rt.soniox.com/transcribe-websocket');
                    const timeout = setTimeout(() => {
                        ws.close();
                        resolve({ success: false, error: 'Connection timed out' });
                    }, 15000);
                    ws.on('open', () => {
                        // Send a minimal config to validate the API key
                        ws.send(JSON.stringify({
                            api_key: normalizedApiKey,
                            model: 'stt-rt-v4',
                            audio_format: 'pcm_s16le',
                            sample_rate: 16000,
                            num_channels: 1,
                        }));
                    });
                    ws.on('message', (msg) => {
                        clearTimeout(timeout);
                        try {
                            const res = JSON.parse(msg.toString());
                            if (res.error_code) {
                                resolve({ success: false, error: `${res.error_code}: ${res.error_message}` });
                            }
                            else {
                                resolve({ success: true });
                            }
                        }
                        catch {
                            resolve({ success: true });
                        }
                        ws.close();
                    });
                    ws.on('error', (err) => {
                        clearTimeout(timeout);
                        resolve({ success: false, error: err.message || 'Connection failed' });
                    });
                });
            }
            if (provider === 'alibaba') {
                const WebSocket = require('ws');
                const { v4: uuidv4 } = require('uuid');
                const { CredentialsManager } = require('./services/CredentialsManager');
                const glossaryConfig = CredentialsManager.getInstance().getTechnicalGlossaryConfig();
                return await new Promise((resolve) => {
                    const headers = {
                        Authorization: `Bearer ${normalizedApiKey}`,
                        'user-agent': 'natively-stt-test/1.0',
                    };
                    if (glossaryConfig?.alibabaWorkspaceId) {
                        headers['X-DashScope-WorkSpace'] = glossaryConfig.alibabaWorkspaceId;
                    }
                    const taskId = uuidv4();
                    const ws = new WebSocket('wss://dashscope.aliyuncs.com/api-ws/v1/inference', { headers });
                    const timeout = setTimeout(() => {
                        ws.close();
                        resolve({ success: false, error: 'Connection timed out' });
                    }, 15000);
                    ws.on('open', () => {
                        ws.send(JSON.stringify({
                            header: {
                                action: 'run-task',
                                task_id: taskId,
                                streaming: 'duplex',
                            },
                            payload: {
                                task_group: 'audio',
                                task: 'asr',
                                function: 'recognition',
                                model: 'paraformer-realtime-v2',
                                parameters: {
                                    format: 'pcm',
                                    sample_rate: 16000,
                                    punctuation_prediction_enabled: true,
                                    inverse_text_normalization_enabled: true,
                                    semantic_punctuation_enabled: true,
                                    heartbeat: true,
                                    ...(glossaryConfig?.alibabaVocabularyId ? { vocabulary_id: glossaryConfig.alibabaVocabularyId } : {}),
                                },
                                input: {},
                            },
                        }));
                    });
                    ws.on('message', (msg) => {
                        try {
                            const res = JSON.parse(msg.toString());
                            const eventType = res?.header?.event;
                            if (eventType === 'task-started') {
                                clearTimeout(timeout);
                                try {
                                    ws.send(JSON.stringify({
                                        header: {
                                            action: 'finish-task',
                                            task_id: taskId,
                                            streaming: 'duplex',
                                        },
                                        payload: {
                                            input: {},
                                        },
                                    }));
                                }
                                catch { }
                                ws.close();
                                resolve({ success: true });
                            }
                            else if (eventType === 'task-failed') {
                                clearTimeout(timeout);
                                ws.close();
                                resolve({ success: false, error: res?.header?.error_message || 'Alibaba task failed' });
                            }
                        }
                        catch {
                            // ignore parse failures while waiting for task-started
                        }
                    });
                    ws.on('error', (err) => {
                        clearTimeout(timeout);
                        resolve({ success: false, error: err.message || 'Connection failed' });
                    });
                });
            }
            const axios = require('axios');
            const FormData = require('form-data');
            // Generate a tiny silent WAV (0.5s of silence at 16kHz mono 16-bit)
            const numSamples = 8000;
            const pcmData = Buffer.alloc(numSamples * 2);
            const wavHeader = Buffer.alloc(44);
            wavHeader.write('RIFF', 0);
            wavHeader.writeUInt32LE(36 + pcmData.length, 4);
            wavHeader.write('WAVE', 8);
            wavHeader.write('fmt ', 12);
            wavHeader.writeUInt32LE(16, 16);
            wavHeader.writeUInt16LE(1, 20);
            wavHeader.writeUInt16LE(1, 22);
            wavHeader.writeUInt32LE(16000, 24);
            wavHeader.writeUInt32LE(32000, 28);
            wavHeader.writeUInt16LE(2, 32);
            wavHeader.writeUInt16LE(16, 34);
            wavHeader.write('data', 36);
            wavHeader.writeUInt32LE(pcmData.length, 40);
            const testWav = Buffer.concat([wavHeader, pcmData]);
            if (provider === 'elevenlabs') {
                // ElevenLabs: Use /v1/voices to validate the API key (minimal scope required).
                // Scoped keys may lack speech_to_text or user_read but still be usable once permissions are added.
                try {
                    await axios.get('https://api.elevenlabs.io/v1/voices', {
                        headers: { 'xi-api-key': normalizedApiKey },
                        timeout: 10000,
                    });
                }
                catch (elErr) {
                    const elStatus = elErr?.response?.data?.detail?.status;
                    // If the error is "invalid_api_key", the key itself is wrong — fail.
                    // Any other error (missing permission, etc.) means the key IS valid, just possibly scoped.
                    if (elStatus === 'invalid_api_key') {
                        throw elErr;
                    }
                    // Key is valid but scoped — pass with a warning
                    console.log('[IPC] ElevenLabs key is valid but may have restricted scopes. Saving key.');
                }
            }
            else if (provider === 'azure') {
                // Azure: raw binary with subscription key
                const azureRegion = region || 'eastus';
                await axios.post(`https://${azureRegion}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US`, testWav, {
                    headers: { 'Ocp-Apim-Subscription-Key': normalizedApiKey, 'Content-Type': 'audio/wav' },
                    timeout: 15000,
                });
            }
            else if (provider === 'ibmwatson') {
                // IBM Watson: raw binary with Basic auth
                const ibmRegion = region || 'us-south';
                await axios.post(`https://api.${ibmRegion}.speech-to-text.watson.cloud.ibm.com/v1/recognize`, testWav, {
                    headers: {
                        Authorization: `Basic ${Buffer.from(`apikey:${normalizedApiKey}`).toString('base64')}`,
                        'Content-Type': 'audio/wav',
                    },
                    timeout: 15000,
                });
            }
            else {
                // Groq / OpenAI: multipart FormData
                const endpoint = provider === 'groq'
                    ? 'https://api.groq.com/openai/v1/audio/transcriptions'
                    : 'https://api.openai.com/v1/audio/transcriptions';
                const model = provider === 'groq' ? 'whisper-large-v3-turbo' : 'whisper-1';
                const form = new FormData();
                form.append('file', testWav, { filename: 'test.wav', contentType: 'audio/wav' });
                form.append('model', model);
                await axios.post(endpoint, form, {
                    headers: {
                        Authorization: `Bearer ${normalizedApiKey}`,
                        ...form.getHeaders(),
                    },
                    timeout: 15000,
                });
            }
            return { success: true };
        }
        catch (error) {
            const respData = error?.response?.data;
            const rawMsg = respData?.error?.message || respData?.detail?.message || respData?.message || error.message || 'Connection failed';
            const msg = sanitizeErrorMessage(rawMsg);
            console.error("STT connection test failed:", msg);
            return { success: false, error: msg };
        }
    });
    safeHandle("test-llm-connection", async (_, provider, config) => {
        console.log(`[IPC] Received test-llm-connection request for provider: ${provider}`);
        try {
            const { CredentialsManager } = require('./services/CredentialsManager');
            const creds = CredentialsManager.getInstance();
            const sanitizedConfig = sanitizeLlmProviderConfig(config);
            let providerConfig = { ...sanitizedConfig };
            if (provider === 'openai' || provider === 'alibaba') {
                providerConfig = {
                    ...creds.getOpenAICompatibleProviderConfig(provider),
                    ...sanitizedConfig,
                };
            }
            else if (!providerConfig.apiKey?.trim()) {
                if (provider === 'gemini')
                    providerConfig.apiKey = creds.getGeminiApiKey();
                else if (provider === 'groq')
                    providerConfig.apiKey = creds.getGroqApiKey();
                else if (provider === 'claude')
                    providerConfig.apiKey = creds.getClaudeApiKey();
            }
            if (!providerConfig.apiKey || !providerConfig.apiKey.trim()) {
                return { success: false, error: 'No API key provided' };
            }
            const axios = require('axios');
            let response;
            if (provider === 'gemini') {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent`;
                response = await axios.post(url, {
                    contents: [{ parts: [{ text: "Hello" }] }]
                }, {
                    headers: { 'x-goog-api-key': providerConfig.apiKey },
                    timeout: 15000
                });
            }
            else if (provider === 'groq') {
                response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
                    model: "llama-3.3-70b-versatile",
                    messages: [{ role: "user", content: "Hello" }]
                }, {
                    headers: { Authorization: `Bearer ${providerConfig.apiKey}` },
                    timeout: 15000
                });
            }
            else if (provider === 'openai' || provider === 'alibaba') {
                const probe = await (0, OpenAICompatibleResponses_1.probeOpenAICompatibleProvider)(provider, providerConfig);
                appState.processingHelper.getLLMHelper().setProviderCapabilities(provider, probe.capabilities);
                const diagnostics = [
                    `Base URL: ${probe.normalizedBaseUrl}`,
                    `Models: ${probe.capabilities.supportsModels ? 'ok' : 'failed'}`,
                    `Responses: ${probe.capabilities.supportsResponses ? 'ok' : 'failed'}`,
                    `Streaming: ${probe.capabilities.supportsStreaming ? 'ok' : 'failed'}`,
                    `previous_response_id: ${probe.capabilities.supportsPreviousResponseId ? (probe.capabilities.previousResponseIdPreservesContext ? 'semantic' : 'accepted-without-context') : 'disabled'}`,
                    ...probe.capabilities.notes,
                ];
                if (probe.success) {
                    return { success: true, diagnostics };
                }
                return { success: false, error: sanitizeErrorMessage(probe.error || 'Connection failed'), diagnostics };
            }
            else if (provider === 'claude') {
                response = await axios.post('https://api.anthropic.com/v1/messages', {
                    model: "claude-sonnet-4-6",
                    max_tokens: 10,
                    messages: [{ role: "user", content: "Hello" }]
                }, {
                    headers: {
                        'x-api-key': providerConfig.apiKey,
                        'anthropic-version': '2023-06-01',
                        'content-type': 'application/json'
                    },
                    timeout: 15000
                });
            }
            if (response && (response.status === 200 || response.status === 201)) {
                return { success: true };
            }
            else {
                return { success: false, error: 'Request failed with status ' + response?.status };
            }
        }
        catch (error) {
            console.error("LLM connection test failed:", error);
            const rawMsg = error?.response?.data?.error?.message || error?.response?.data?.message || (error.response?.data?.error?.type ? `${error.response.data.error.type}: ${error.response.data.error.message}` : error.message) || 'Connection failed';
            const msg = sanitizeErrorMessage(rawMsg);
            return { success: false, error: msg, diagnostics: [] };
        }
    });
    safeHandle("get-groq-fast-text-mode", () => {
        try {
            const llmHelper = appState.processingHelper.getLLMHelper();
            return { enabled: llmHelper.getGroqFastTextMode() };
        }
        catch (error) {
            return { enabled: false };
        }
    });
    // Set Groq Fast Text Mode
    safeHandle("set-groq-fast-text-mode", (_, enabled) => {
        try {
            const llmHelper = appState.processingHelper.getLLMHelper();
            llmHelper.setGroqFastTextMode(enabled);
            // Broadcast to all windows
            electron_1.BrowserWindow.getAllWindows().forEach(win => {
                win.webContents.send('groq-fast-text-changed', enabled);
            });
            return { success: true };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    });
    safeHandle("set-model", async (_, modelId) => {
        try {
            const llmHelper = appState.processingHelper.getLLMHelper();
            const { CredentialsManager } = require('./services/CredentialsManager');
            const cm = CredentialsManager.getInstance();
            // Get all providers (Curl + Custom)
            const curlProviders = cm.getCurlProviders();
            const legacyProviders = cm.getCustomProviders() || [];
            const allProviders = [...curlProviders, ...legacyProviders];
            llmHelper.setModel(modelId, allProviders);
            // Close the selector window if open
            appState.modelSelectorWindowHelper.hideWindow();
            // Broadcast to all windows so NativelyInterface can update its selector (session-only update)
            electron_1.BrowserWindow.getAllWindows().forEach(win => {
                if (!win.isDestroyed()) {
                    win.webContents.send('model-changed', modelId);
                }
            });
            return { success: true };
        }
        catch (error) {
            console.error("Error setting model:", error);
            return { success: false, error: error.message };
        }
    });
    // Persist default model (from Settings) + update runtime + broadcast to all windows
    safeHandle("set-default-model", async (_, modelId) => {
        try {
            const { CredentialsManager } = require('./services/CredentialsManager');
            const cm = CredentialsManager.getInstance();
            cm.setDefaultModel(modelId);
            // Also update the runtime model
            const llmHelper = appState.processingHelper.getLLMHelper();
            const curlProviders = cm.getCurlProviders();
            const legacyProviders = cm.getCustomProviders() || [];
            const allProviders = [...curlProviders, ...legacyProviders];
            llmHelper.setModel(modelId, allProviders);
            // Close the selector window if open
            appState.modelSelectorWindowHelper.hideWindow();
            // Broadcast to all windows so NativelyInterface can update its selector
            electron_1.BrowserWindow.getAllWindows().forEach(win => {
                if (!win.isDestroyed()) {
                    win.webContents.send('model-changed', modelId);
                }
            });
            return { success: true };
        }
        catch (error) {
            console.error("Error setting default model:", error);
            return { success: false, error: error.message };
        }
    });
    // Read the persisted default model
    safeHandle("get-default-model", async () => {
        try {
            const { CredentialsManager } = require('./services/CredentialsManager');
            const cm = CredentialsManager.getInstance();
            return { model: cm.getDefaultModel() };
        }
        catch (error) {
            console.error("Error getting default model:", error);
            return { model: 'gemini-3.1-flash-lite-preview' };
        }
    });
    // --- Model Selector Window IPC ---
    safeHandle("show-model-selector", (_, coords) => {
        appState.modelSelectorWindowHelper.showWindow(coords.x, coords.y);
    });
    safeHandle("hide-model-selector", () => {
        appState.modelSelectorWindowHelper.hideWindow();
    });
    safeHandle("toggle-model-selector", (_, coords) => {
        appState.modelSelectorWindowHelper.toggleWindow(coords.x, coords.y);
    });
    // Native Audio Service Handlers
    // Native Audio handlers removed as part of migration to driverless architecture
    safeHandle("native-audio-status", async () => {
        // Always return true or pseudo-status since it's "driverless"
        return { connected: true };
    });
    safeHandle("get-input-devices", async () => {
        return AudioDevices_1.AudioDevices.getInputDevices();
    });
    safeHandle("get-output-devices", async () => {
        return AudioDevices_1.AudioDevices.getOutputDevices();
    });
    safeHandle("start-audio-test", async (event, deviceId) => {
        appState.startAudioTest(deviceId);
        return { success: true };
    });
    safeHandle("stop-audio-test", async () => {
        appState.stopAudioTest();
        return { success: true };
    });
    safeHandle("set-recognition-language", async (_, key) => {
        appState.setRecognitionLanguage(key);
        return { success: true };
    });
    safeHandle("start-stt-compare-session", async () => {
        appState.startSttCompareSession();
        return { success: true };
    });
    safeHandle("stop-stt-compare-session", async () => {
        appState.stopSttCompareSession();
        return { success: true };
    });
    safeHandle("get-stt-compare-results", async () => {
        return appState.getSttCompareResults();
    });
    safeHandle("export-stt-benchmark-report", async () => {
        return appState.exportSttBenchmarkReport();
    });
    // ==========================================
    // Meeting Lifecycle Handlers
    // ==========================================
    safeHandle("start-meeting", async (event, metadata) => {
        try {
            await appState.startMeeting(metadata);
            return { success: true };
        }
        catch (error) {
            console.error("Error starting meeting:", error);
            return { success: false, error: error.message };
        }
    });
    safeHandle("end-meeting", async () => {
        try {
            await appState.endMeeting();
            return { success: true };
        }
        catch (error) {
            console.error("Error ending meeting:", error);
            return { success: false, error: error.message };
        }
    });
    safeHandle("get-recent-meetings", async () => {
        // Fetch from SQLite (limit 50)
        return DatabaseManager_1.DatabaseManager.getInstance().getRecentMeetings(50);
    });
    safeHandle("get-meeting-details", async (event, id) => {
        // Helper to fetch full details
        return DatabaseManager_1.DatabaseManager.getInstance().getMeetingDetails(id);
    });
    safeHandle("update-meeting-title", async (_, { id, title }) => {
        return DatabaseManager_1.DatabaseManager.getInstance().updateMeetingTitle(id, title);
    });
    safeHandle("update-meeting-summary", async (_, { id, updates }) => {
        return DatabaseManager_1.DatabaseManager.getInstance().updateMeetingSummary(id, updates);
    });
    safeHandle("seed-demo", async () => {
        DatabaseManager_1.DatabaseManager.getInstance().seedDemoMeeting();
        // Trigger RAG processing for the new demo meeting
        const ragManager = appState.getRAGManager();
        if (ragManager && ragManager.isReady()) {
            ragManager.reprocessMeeting('demo-meeting').catch(console.error);
        }
        return { success: true };
    });
    safeHandle("flush-database", async () => {
        const result = DatabaseManager_1.DatabaseManager.getInstance().clearAllData();
        return { success: result };
    });
    safeHandle("open-external", async (event, url) => {
        try {
            const parsed = new URL(url);
            if (['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
                await electron_1.shell.openExternal(url);
            }
            else {
                console.warn(`[IPC] Blocked potentially unsafe open-external: ${url}`);
            }
        }
        catch {
            console.warn(`[IPC] Invalid URL in open-external: ${url}`);
        }
    });
    // ==========================================
    // Intelligence Mode Handlers
    // ==========================================
    // MODE 1: Assist (Passive observation)
    safeHandle("generate-assist", async () => {
        try {
            const intelligenceManager = appState.getIntelligenceManager();
            const insight = await intelligenceManager.runAssistMode();
            return { insight };
        }
        catch (error) {
            throw error;
        }
    });
    // MODE 2: What Should I Say (Primary auto-answer)
    safeHandle("generate-what-to-say", async (_, question, imagePaths, requestId) => {
        return LlmTraceRecorder_1.llmTraceRecorder.runWithAction({
            id: requestId,
            type: "what_to_answer",
            label: "How to answer",
            requestId,
        }, async () => {
            try {
                const intelligenceManager = appState.getIntelligenceManager();
                LlmTraceRecorder_1.llmTraceRecorder.updateResolvedInput({
                    question: question || "",
                    imagePaths: imagePaths || [],
                    requestId: requestId || "",
                });
                const answer = await intelligenceManager.runWhatShouldISay(question, 0.8, imagePaths, requestId);
                return { answer, question: question || 'inferred from context' };
            }
            catch (error) {
                return {
                    question: question || 'unknown'
                };
            }
        });
    });
    // MODE 3: Follow-Up (Refinement)
    safeHandle("generate-follow-up", async (_, intent, userRequest, source) => {
        return LlmTraceRecorder_1.llmTraceRecorder.runWithAction({
            id: source?.requestId,
            type: "follow_up",
            label: "Follow-up",
            requestId: source?.requestId,
        }, async () => {
            try {
                const intelligenceManager = appState.getIntelligenceManager();
                LlmTraceRecorder_1.llmTraceRecorder.updateResolvedInput({
                    intent,
                    userRequest: userRequest || "",
                    lane: source?.lane || "primary",
                    sourceAnswer: source?.answer || "",
                    requestId: source?.requestId || "",
                });
                const refined = await intelligenceManager.runFollowUp(intent, userRequest, source);
                return { refined, intent };
            }
            catch (error) {
                throw error;
            }
        });
    });
    // MODE 4: Recap (Summary)
    safeHandle("generate-recap", async () => {
        return LlmTraceRecorder_1.llmTraceRecorder.runWithAction({
            type: "recap",
            label: "Recap",
        }, async () => {
            try {
                const intelligenceManager = appState.getIntelligenceManager();
                const summary = await intelligenceManager.runRecap();
                return { summary };
            }
            catch (error) {
                throw error;
            }
        });
    });
    // MODE 6: Follow-Up Questions
    safeHandle("generate-follow-up-questions", async () => {
        return LlmTraceRecorder_1.llmTraceRecorder.runWithAction({
            type: "follow_up_questions",
            label: "Follow-up questions",
        }, async () => {
            try {
                const intelligenceManager = appState.getIntelligenceManager();
                const questions = await intelligenceManager.runFollowUpQuestions();
                return { questions };
            }
            catch (error) {
                throw error;
            }
        });
    });
    // MODE 5: Manual Answer (Fallback)
    safeHandle("submit-manual-question", async (_, question) => {
        try {
            const intelligenceManager = appState.getIntelligenceManager();
            const answer = await intelligenceManager.runManualAnswer(question);
            return { answer, question };
        }
        catch (error) {
            throw error;
        }
    });
    // Get current intelligence context
    safeHandle("get-intelligence-context", async () => {
        try {
            const intelligenceManager = appState.getIntelligenceManager();
            return {
                context: intelligenceManager.getFormattedContext(),
                lastAssistantMessage: intelligenceManager.getLastAssistantMessage(),
                activeMode: intelligenceManager.getActiveMode()
            };
        }
        catch (error) {
            throw error;
        }
    });
    // Reset intelligence state
    safeHandle("reset-intelligence", async () => {
        try {
            const intelligenceManager = appState.getIntelligenceManager();
            intelligenceManager.reset();
            return { success: true };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    });
    // Service Account Selection
    safeHandle("select-service-account", async () => {
        try {
            const result = await electron_1.dialog.showOpenDialog({
                properties: ['openFile'],
                filters: [{ name: 'JSON', extensions: ['json'] }]
            });
            if (result.canceled || result.filePaths.length === 0) {
                return { success: false, cancelled: true };
            }
            const filePath = result.filePaths[0];
            // Update backend state immediately
            appState.updateGoogleCredentials(filePath);
            // Persist the path for future sessions
            const { CredentialsManager } = require('./services/CredentialsManager');
            CredentialsManager.getInstance().setGoogleServiceAccountPath(filePath);
            return { success: true, path: filePath };
        }
        catch (error) {
            console.error("Error selecting service account:", error);
            return { success: false, error: error.message };
        }
    });
    // ==========================================
    // Theme System Handlers
    // ==========================================
    safeHandle("theme:get-mode", () => {
        const tm = appState.getThemeManager();
        return {
            mode: tm.getMode(),
            resolved: tm.getResolvedTheme()
        };
    });
    safeHandle("theme:set-mode", (_, mode) => {
        appState.getThemeManager().setMode(mode);
        return { success: true };
    });
    // ==========================================
    // Calendar Integration Handlers
    // ==========================================
    safeHandle("calendar-connect", async () => {
        try {
            const { CalendarManager } = require('./services/CalendarManager');
            await CalendarManager.getInstance().startAuthFlow();
            return { success: true };
        }
        catch (error) {
            console.error("Calendar auth error:", error);
            return { success: false, error: error.message };
        }
    });
    safeHandle("calendar-disconnect", async () => {
        const { CalendarManager } = require('./services/CalendarManager');
        await CalendarManager.getInstance().disconnect();
        return { success: true };
    });
    safeHandle("get-calendar-status", async () => {
        const { CalendarManager } = require('./services/CalendarManager');
        return CalendarManager.getInstance().getConnectionStatus();
    });
    safeHandle("get-upcoming-events", async () => {
        const { CalendarManager } = require('./services/CalendarManager');
        return CalendarManager.getInstance().getUpcomingEvents();
    });
    safeHandle("calendar-refresh", async () => {
        const { CalendarManager } = require('./services/CalendarManager');
        await CalendarManager.getInstance().refreshState();
        return { success: true };
    });
    // ==========================================
    // Follow-up Email Handlers
    // ==========================================
    safeHandle("generate-followup-email", async (_, input) => {
        try {
            const { FOLLOWUP_EMAIL_PROMPT, GROQ_FOLLOWUP_EMAIL_PROMPT } = require('./llm/prompts');
            const { buildFollowUpEmailPromptInput } = require('./utils/emailUtils');
            const llmHelper = appState.processingHelper.getLLMHelper();
            // Build the context string from input
            const contextString = buildFollowUpEmailPromptInput(input);
            // Build prompts
            const geminiPrompt = `${FOLLOWUP_EMAIL_PROMPT}\n\nMEETING DETAILS:\n${contextString}`;
            const groqPrompt = `${GROQ_FOLLOWUP_EMAIL_PROMPT}\n\nMEETING DETAILS:\n${contextString}`;
            // Use chatWithGemini with alternateGroqMessage for fallback
            const emailBody = await llmHelper.chatWithGemini(geminiPrompt, undefined, undefined, true, groqPrompt);
            return emailBody;
        }
        catch (error) {
            console.error("Error generating follow-up email:", error);
            throw error;
        }
    });
    safeHandle("extract-emails-from-transcript", async (_, transcript) => {
        try {
            const { extractEmailsFromTranscript } = require('./utils/emailUtils');
            return extractEmailsFromTranscript(transcript);
        }
        catch (error) {
            console.error("Error extracting emails:", error);
            return [];
        }
    });
    safeHandle("get-calendar-attendees", async (_, eventId) => {
        try {
            const { CalendarManager } = require('./services/CalendarManager');
            const cm = CalendarManager.getInstance();
            // Try to get attendees from the event
            const events = await cm.getUpcomingEvents();
            const event = events?.find((e) => e.id === eventId);
            if (event && event.attendees) {
                return event.attendees.map((a) => ({
                    email: a.email,
                    name: a.displayName || a.email?.split('@')[0] || ''
                })).filter((a) => a.email);
            }
            return [];
        }
        catch (error) {
            console.error("Error getting calendar attendees:", error);
            return [];
        }
    });
    safeHandle("open-mailto", async (_, { to, subject, body }) => {
        try {
            const { buildMailtoLink } = require('./utils/emailUtils');
            const mailtoUrl = buildMailtoLink(to, subject, body);
            await electron_1.shell.openExternal(mailtoUrl);
            return { success: true };
        }
        catch (error) {
            console.error("Error opening mailto:", error);
            return { success: false, error: error.message };
        }
    });
    // ==========================================
    // RAG (Retrieval-Augmented Generation) Handlers
    // ==========================================
    // Store active query abort controllers for cancellation
    const activeRAGQueries = new Map();
    // Query meeting with RAG (meeting-scoped)
    safeHandle("rag:query-meeting", async (event, { meetingId, query, traceContext }) => {
        return LlmTraceRecorder_1.llmTraceRecorder.runWithAction(buildTraceAction({
            type: "rag_query_meeting",
            label: "Meeting RAG",
        }, traceContext), async () => {
            const ragManager = appState.getRAGManager();
            LlmTraceRecorder_1.llmTraceRecorder.updateResolvedInput({ meetingId, query });
            if (!ragManager || !ragManager.isReady()) {
                console.log("[RAG] Not ready, falling back to regular chat");
                LlmTraceRecorder_1.llmTraceRecorder.appendStep({
                    kind: "rag",
                    stage: "fallback",
                    responseBody: { reason: "RAG_NOT_READY" },
                });
                return { fallback: true };
            }
            if (!ragManager.isMeetingProcessed(meetingId) && !ragManager.isLiveIndexingActive(meetingId)) {
                console.log(`[RAG] Meeting ${meetingId} not processed and no JIT indexing, falling back to regular chat`);
                LlmTraceRecorder_1.llmTraceRecorder.appendStep({
                    kind: "rag",
                    stage: "fallback",
                    responseBody: { reason: "MEETING_NOT_PROCESSED", meetingId },
                });
                return { fallback: true };
            }
            const abortController = new AbortController();
            const queryKey = `meeting-${meetingId}`;
            activeRAGQueries.set(queryKey, abortController);
            try {
                const stream = ragManager.queryMeeting(meetingId, query, abortController.signal);
                for await (const chunk of stream) {
                    if (abortController.signal.aborted)
                        break;
                    event.sender.send("rag:stream-chunk", { meetingId, chunk });
                }
                event.sender.send("rag:stream-complete", { meetingId });
                return { success: true };
            }
            catch (error) {
                if (error.name !== 'AbortError') {
                    const msg = error.message || "";
                    if (msg.includes('NO_RELEVANT_CONTEXT') || msg.includes('NO_MEETING_EMBEDDINGS')) {
                        console.log(`[RAG] Query failed with '${msg}', falling back to regular chat`);
                        LlmTraceRecorder_1.llmTraceRecorder.appendStep({
                            kind: "rag",
                            stage: "fallback",
                            responseBody: { reason: msg, meetingId },
                        });
                        return { fallback: true };
                    }
                    console.error("[RAG] Query error:", error);
                    event.sender.send("rag:stream-error", { meetingId, error: msg });
                }
                return { success: false, error: error.message };
            }
            finally {
                activeRAGQueries.delete(queryKey);
            }
        });
    });
    // Query live meeting with JIT RAG
    safeHandle("rag:query-live", async (event, { query, traceContext }) => {
        return LlmTraceRecorder_1.llmTraceRecorder.runWithAction(buildTraceAction({
            type: "rag_query_live",
            label: "Live RAG",
        }, traceContext), async () => {
            const ragManager = appState.getRAGManager();
            LlmTraceRecorder_1.llmTraceRecorder.updateResolvedInput({ query, meetingId: "live-meeting-current" });
            if (!ragManager || !ragManager.isReady()) {
                LlmTraceRecorder_1.llmTraceRecorder.appendStep({
                    kind: "rag",
                    stage: "fallback",
                    responseBody: { reason: "RAG_NOT_READY" },
                });
                return { fallback: true };
            }
            if (!ragManager.isLiveIndexingActive('live-meeting-current')) {
                LlmTraceRecorder_1.llmTraceRecorder.appendStep({
                    kind: "rag",
                    stage: "fallback",
                    responseBody: { reason: "LIVE_INDEXING_NOT_ACTIVE" },
                });
                return { fallback: true };
            }
            const abortController = new AbortController();
            const queryKey = `live-${Date.now()}`;
            activeRAGQueries.set(queryKey, abortController);
            try {
                const stream = ragManager.queryMeeting('live-meeting-current', query, abortController.signal);
                for await (const chunk of stream) {
                    if (abortController.signal.aborted)
                        break;
                    event.sender.send("rag:stream-chunk", { live: true, chunk });
                }
                event.sender.send("rag:stream-complete", { live: true });
                return { success: true };
            }
            catch (error) {
                if (error.name !== 'AbortError') {
                    const msg = error.message || "";
                    if (msg.includes('NO_RELEVANT_CONTEXT') || msg.includes('NO_MEETING_EMBEDDINGS')) {
                        console.log(`[RAG] JIT query failed with '${msg}', falling back to regular live chat`);
                        LlmTraceRecorder_1.llmTraceRecorder.appendStep({
                            kind: "rag",
                            stage: "fallback",
                            responseBody: { reason: msg },
                        });
                        return { fallback: true };
                    }
                    console.error("[RAG] Live query error:", error);
                    event.sender.send("rag:stream-error", { live: true, error: msg });
                }
                return { success: false, error: error.message };
            }
            finally {
                activeRAGQueries.delete(queryKey);
            }
        });
    });
    // Query global (cross-meeting search)
    safeHandle("rag:query-global", async (event, { query, traceContext }) => {
        return LlmTraceRecorder_1.llmTraceRecorder.runWithAction(buildTraceAction({
            type: "rag_query_global",
            label: "Global RAG",
        }, traceContext), async () => {
            const ragManager = appState.getRAGManager();
            LlmTraceRecorder_1.llmTraceRecorder.updateResolvedInput({ query });
            if (!ragManager || !ragManager.isReady()) {
                LlmTraceRecorder_1.llmTraceRecorder.appendStep({
                    kind: "rag",
                    stage: "fallback",
                    responseBody: { reason: "RAG_NOT_READY" },
                });
                return { fallback: true };
            }
            const abortController = new AbortController();
            const queryKey = `global-${Date.now()}`;
            activeRAGQueries.set(queryKey, abortController);
            try {
                const stream = ragManager.queryGlobal(query, abortController.signal);
                for await (const chunk of stream) {
                    if (abortController.signal.aborted)
                        break;
                    event.sender.send("rag:stream-chunk", { global: true, chunk });
                }
                event.sender.send("rag:stream-complete", { global: true });
                return { success: true };
            }
            catch (error) {
                if (error.name !== 'AbortError') {
                    event.sender.send("rag:stream-error", { global: true, error: error.message });
                }
                return { success: false, error: error.message };
            }
            finally {
                activeRAGQueries.delete(queryKey);
            }
        });
    });
    // Cancel active RAG query
    safeHandle("rag:cancel-query", async (_, { meetingId, global }) => {
        const queryKey = global ? 'global' : `meeting-${meetingId}`;
        // Cancel any matching key
        for (const [key, controller] of activeRAGQueries) {
            if (key.startsWith(queryKey) || (global && key.startsWith('global'))) {
                controller.abort();
                activeRAGQueries.delete(key);
            }
        }
        return { success: true };
    });
    // Check if meeting has RAG embeddings
    safeHandle('rag:is-meeting-processed', async (_, meetingId) => {
        try {
            const ragManager = appState.getRAGManager();
            if (!ragManager)
                throw new Error('RAGManager not initialized');
            return ragManager.isMeetingProcessed(meetingId);
        }
        catch (error) {
            console.error('[IPC rag:is-meeting-processed] Error:', error);
            return false;
        }
    });
    safeHandle('rag:reindex-incompatible-meetings', async () => {
        try {
            const ragManager = appState.getRAGManager();
            if (!ragManager)
                throw new Error('RAGManager not initialized');
            await ragManager.reindexIncompatibleMeetings();
            return { success: true };
        }
        catch (error) {
            console.error('[IPC rag:reindex-incompatible-meetings] Error:', error);
            return { success: false, error: error.message };
        }
    });
    // Get RAG queue status
    safeHandle("rag:get-queue-status", async () => {
        const ragManager = appState.getRAGManager();
        if (!ragManager)
            return { pending: 0, processing: 0, completed: 0, failed: 0 };
        return ragManager.getQueueStatus();
    });
    // Retry pending embeddings
    safeHandle("rag:retry-embeddings", async () => {
        const ragManager = appState.getRAGManager();
        if (!ragManager)
            return { success: false };
        await ragManager.retryPendingEmbeddings();
        return { success: true };
    });
    // ==========================================
    // Profile Engine IPC Handlers
    // ==========================================
    safeHandle("profile:upload-resume", async (_, filePath) => {
        try {
            console.log(`[IPC] profile:upload-resume called with: ${filePath}`);
            const orchestrator = appState.getKnowledgeOrchestrator();
            if (!orchestrator) {
                return { success: false, error: 'Knowledge engine not initialized. Please ensure API keys are configured.' };
            }
            const result = await orchestrator.ingestDocument(filePath, types_1.DocType.RESUME);
            return result;
        }
        catch (error) {
            console.error('[IPC] profile:upload-resume error:', error);
            return { success: false, error: error.message };
        }
    });
    safeHandle("profile:get-status", async () => {
        try {
            const orchestrator = appState.getKnowledgeOrchestrator();
            if (!orchestrator) {
                return { hasProfile: false, profileMode: false };
            }
            // Map new KnowledgeStatus back to legacy UI shape temporarily
            const status = orchestrator.getStatus();
            return {
                hasProfile: status.hasResume,
                profileMode: status.activeMode,
                name: status.resumeSummary?.name,
                role: status.resumeSummary?.role,
                totalExperienceYears: status.resumeSummary?.totalExperienceYears
            };
        }
        catch (error) {
            return { hasProfile: false, profileMode: false };
        }
    });
    safeHandle("profile:set-mode", async (_, enabled) => {
        try {
            const orchestrator = appState.getKnowledgeOrchestrator();
            if (!orchestrator) {
                return { success: false, error: 'Knowledge engine not initialized' };
            }
            orchestrator.setKnowledgeMode(enabled);
            return { success: true };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    });
    safeHandle("profile:delete", async () => {
        try {
            const orchestrator = appState.getKnowledgeOrchestrator();
            if (!orchestrator) {
                return { success: false, error: 'Knowledge engine not initialized' };
            }
            orchestrator.deleteDocumentsByType(types_1.DocType.RESUME);
            return { success: true };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    });
    safeHandle("profile:get-profile", async () => {
        try {
            const orchestrator = appState.getKnowledgeOrchestrator();
            if (!orchestrator)
                return null;
            return orchestrator.getProfileData();
        }
        catch (error) {
            return null;
        }
    });
    safeHandle("profile:select-file", async () => {
        try {
            const result = await electron_1.dialog.showOpenDialog({
                properties: ['openFile'],
                filters: [
                    { name: 'Resume Files', extensions: ['pdf', 'docx', 'txt'] }
                ]
            });
            if (result.canceled || result.filePaths.length === 0) {
                return { cancelled: true };
            }
            return { success: true, filePath: result.filePaths[0] };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    });
    // ==========================================
    // JD & Research IPC Handlers
    // ==========================================
    safeHandle("profile:upload-jd", async (_, filePath) => {
        try {
            console.log(`[IPC] profile:upload-jd called with: ${filePath}`);
            const orchestrator = appState.getKnowledgeOrchestrator();
            if (!orchestrator) {
                return { success: false, error: 'Knowledge engine not initialized. Please ensure API keys are configured.' };
            }
            const result = await orchestrator.ingestDocument(filePath, types_1.DocType.JD);
            return result;
        }
        catch (error) {
            console.error('[IPC] profile:upload-jd error:', error);
            return { success: false, error: error.message };
        }
    });
    safeHandle("profile:delete-jd", async () => {
        try {
            const orchestrator = appState.getKnowledgeOrchestrator();
            if (!orchestrator) {
                return { success: false, error: 'Knowledge engine not initialized' };
            }
            orchestrator.deleteDocumentsByType(types_1.DocType.JD);
            return { success: true };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    });
    safeHandle("profile:research-company", async (_, companyName) => {
        return {
            success: false,
            error: `Company research is not part of the current open-source project library build. "${companyName}" was not processed.`,
        };
    });
    safeHandle("profile:generate-negotiation", async () => {
        return {
            success: false,
            error: 'Negotiation scripts are not part of the current open-source project library build.',
        };
    });
    safeHandle("projectLibrary:listProjects", async () => {
        const orchestrator = appState.getKnowledgeOrchestrator();
        if (!orchestrator)
            return [];
        return orchestrator.listProjects();
    });
    safeHandle("projectLibrary:upsertProject", async (_, project) => {
        try {
            const orchestrator = appState.getKnowledgeOrchestrator();
            if (!orchestrator) {
                return { success: false, error: 'Knowledge engine not initialized' };
            }
            const saved = orchestrator.upsertProject(project);
            return { success: true, project: saved };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    });
    safeHandle("projectLibrary:attachAssets", async (_, { projectId, filePaths }) => {
        try {
            const orchestrator = appState.getKnowledgeOrchestrator();
            if (!orchestrator) {
                return { success: false, error: 'Knowledge engine not initialized' };
            }
            return await orchestrator.attachAssets(projectId, filePaths);
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    });
    safeHandle("projectLibrary:attachRepo", async (_, { projectId, repoPath }) => {
        try {
            const orchestrator = appState.getKnowledgeOrchestrator();
            if (!orchestrator) {
                return { success: false, error: 'Knowledge engine not initialized' };
            }
            return await orchestrator.attachRepo(projectId, repoPath);
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    });
    safeHandle("projectLibrary:getProjectFacts", async (_, projectId) => {
        const orchestrator = appState.getKnowledgeOrchestrator();
        if (!orchestrator)
            return null;
        return orchestrator.getProjectFacts(projectId);
    });
    safeHandle("projectLibrary:setActiveProjects", async (_, projectIds) => {
        try {
            const orchestrator = appState.getKnowledgeOrchestrator();
            if (!orchestrator) {
                return { success: false, error: 'Knowledge engine not initialized' };
            }
            const state = orchestrator.setActiveProjects(projectIds);
            return { success: true, state };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    });
    safeHandle("projectLibrary:setAnswerMode", async (_, mode) => {
        try {
            const orchestrator = appState.getKnowledgeOrchestrator();
            if (!orchestrator) {
                return { success: false, error: 'Knowledge engine not initialized' };
            }
            const state = orchestrator.setAnswerMode(mode);
            return { success: true, state };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    });
    safeHandle("projectLibrary:setJDBias", async (_, enabled) => {
        try {
            const orchestrator = appState.getKnowledgeOrchestrator();
            if (!orchestrator) {
                return { success: false, error: 'Knowledge engine not initialized' };
            }
            const state = orchestrator.setJDBiasEnabled(enabled);
            return { success: true, state };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    });
    safeHandle("projectLibrary:selectAssets", async () => {
        try {
            const result = await electron_1.dialog.showOpenDialog({
                properties: ['openFile', 'multiSelections'],
                filters: [
                    { name: 'Project Assets', extensions: ['pdf', 'docx', 'txt', 'md', 'png', 'jpg', 'jpeg', 'webp', 'ipynb', 'json', 'ts', 'tsx', 'js', 'jsx', 'py'] }
                ]
            });
            if (result.canceled || result.filePaths.length === 0) {
                return { cancelled: true };
            }
            return { success: true, filePaths: result.filePaths };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    });
    safeHandle("projectLibrary:selectRepo", async () => {
        try {
            const result = await electron_1.dialog.showOpenDialog({
                properties: ['openDirectory']
            });
            if (result.canceled || result.filePaths.length === 0) {
                return { cancelled: true };
            }
            return { success: true, repoPath: result.filePaths[0] };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    });
    // ==========================================
    // Google Search API Credentials
    // ==========================================
    safeHandle("set-google-search-api-key", async (_, apiKey) => {
        try {
            const { CredentialsManager } = require('./services/CredentialsManager');
            CredentialsManager.getInstance().setGoogleSearchApiKey(apiKey);
            return { success: true };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    });
    safeHandle("set-google-search-cse-id", async (_, cseId) => {
        try {
            const { CredentialsManager } = require('./services/CredentialsManager');
            CredentialsManager.getInstance().setGoogleSearchCseId(cseId);
            return { success: true };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    });
    // ==========================================
    // Overlay Opacity (Stealth Mode)
    // ==========================================
    safeHandle("set-overlay-opacity", async (_, opacity) => {
        // Clamp to valid range
        const clamped = Math.min(1.0, Math.max(0.15, opacity));
        // Broadcast to all renderer windows so the overlay picks it up in real-time
        electron_1.BrowserWindow.getAllWindows().forEach(win => {
            if (!win.isDestroyed()) {
                win.webContents.send('overlay-opacity-changed', clamped);
            }
        });
        return;
    });
}
//# sourceMappingURL=ipcHandlers.js.map
