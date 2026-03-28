"use strict";
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
exports.llmTraceRecorder = void 0;
const async_hooks_1 = require("async_hooks");
const electron_1 = require("electron");
const axios_1 = __importStar(require("axios"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const LOG_RETENTION_DAYS = 14;
const MAX_RECENT_FILES = 14;
const MAX_MEMORY_ACTIONS = 120;
const MAX_SERIALIZED_CHARS = 2 * 1024 * 1024;
const ACTION_LABELS = {
    what_to_answer: "How to answer",
    follow_up: "Follow-up",
    recap: "Recap",
    follow_up_questions: "Follow-up questions",
    answer: "Answer",
    manual_submit: "Manual submit",
    image_analysis: "Image analysis",
    rag_query_live: "Live RAG",
    rag_query_meeting: "Meeting RAG",
    rag_query_global: "Global RAG",
};
const REDACTED = "[REDACTED]";
const nowIso = () => new Date().toISOString();
const createId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const redactKeyPattern = /(authorization|api[_-]?key|secret|token|password|session|cookie)/i;
const isPlainObject = (value) => {
    return Object.prototype.toString.call(value) === "[object Object]";
};
const safeJsonParse = (value) => {
    try {
        return JSON.parse(value);
    }
    catch {
        return null;
    }
};
const redactString = (value) => {
    return value
        .replace(/Bearer\s+[A-Za-z0-9._\-+/=]+/gi, `Bearer ${REDACTED}`)
        .replace(/("?(?:api[_-]?key|secret|token|authorization|password)"?\s*:\s*)"([^"]+)"/gi, `$1"${REDACTED}"`)
        .replace(/([?&][^=]*(?:key|token|secret|auth)[^=]*=)([^&]+)/gi, `$1${REDACTED}`);
};
const sanitizeValue = (value, keyHint) => {
    if (value == null)
        return value;
    if (keyHint && redactKeyPattern.test(keyHint)) {
        return REDACTED;
    }
    if (typeof value === "string") {
        return redactString(value);
    }
    if (typeof value === "number" || typeof value === "boolean") {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map(item => sanitizeValue(item));
    }
    if (value instanceof URLSearchParams) {
        const next = new URLSearchParams(value.toString());
        for (const key of Array.from(next.keys())) {
            if (redactKeyPattern.test(key)) {
                next.set(key, REDACTED);
            }
        }
        return next.toString();
    }
    if (Buffer.isBuffer(value)) {
        return `[Buffer ${value.byteLength} bytes]`;
    }
    if (value instanceof ArrayBuffer) {
        return `[ArrayBuffer ${value.byteLength} bytes]`;
    }
    if (ArrayBuffer.isView(value)) {
        return `[TypedArray ${value.byteLength} bytes]`;
    }
    if (isPlainObject(value)) {
        return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, sanitizeValue(child, key)]));
    }
    return String(value);
};
const truncateText = (text) => {
    if (text.length <= MAX_SERIALIZED_CHARS) {
        return { text, truncated: false };
    }
    const suffix = `\n\n... [TRUNCATED ${text.length - MAX_SERIALIZED_CHARS} chars]`;
    const headLength = Math.max(0, MAX_SERIALIZED_CHARS - suffix.length);
    return {
        text: `${text.slice(0, headLength)}${suffix}`,
        truncated: true,
    };
};
const serializeSanitized = (value) => {
    if (value == null) {
        return { text: "", truncated: false };
    }
    const sanitized = sanitizeValue(value);
    const text = typeof sanitized === "string"
        ? sanitized
        : JSON.stringify(sanitized, null, 2);
    return truncateText(text);
};
const normalizeHeaders = (headers) => {
    if (!headers)
        return {};
    const entries = [];
    if (typeof Headers !== "undefined" && headers instanceof Headers) {
        headers.forEach((value, key) => {
            entries.push([key, value]);
        });
    }
    else if (headers instanceof axios_1.AxiosHeaders) {
        for (const [key, value] of Object.entries(headers.toJSON())) {
            entries.push([key, value]);
        }
    }
    else if (Array.isArray(headers)) {
        for (const [key, value] of headers) {
            entries.push([key, value]);
        }
    }
    else if (isPlainObject(headers)) {
        for (const [key, value] of Object.entries(headers)) {
            entries.push([key, value]);
        }
    }
    return Object.fromEntries(entries
        .filter(([key]) => !!key)
        .map(([key, value]) => [key, String(sanitizeValue(value, key) ?? "")]));
};
const toBodyPreview = ({ text, truncated }) => ({
    body: text,
    truncated,
});
const readRequestBody = async (input, init) => {
    if (init?.body != null) {
        return serializeRequestBody(init.body);
    }
    if (typeof Request !== "undefined" && input instanceof Request) {
        try {
            const text = await input.clone().text();
            return toBodyPreview(serializeSanitized(text));
        }
        catch {
            return { body: "", truncated: false };
        }
    }
    return { body: "", truncated: false };
};
const serializeRequestBody = async (body) => {
    if (body == null) {
        return { body: "", truncated: false };
    }
    if (typeof body === "string") {
        const parsed = safeJsonParse(body);
        return toBodyPreview(parsed == null ? serializeSanitized(body) : serializeSanitized(parsed));
    }
    if (body instanceof URLSearchParams) {
        return toBodyPreview(serializeSanitized(body));
    }
    if (typeof FormData !== "undefined" && body instanceof FormData) {
        const entries = {};
        body.forEach((value, key) => {
            entries[key] = typeof value === "string" ? value : "[FormData File]";
        });
        return toBodyPreview(serializeSanitized(entries));
    }
    if (Buffer.isBuffer(body)) {
        return toBodyPreview(serializeSanitized(body));
    }
    if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
        return toBodyPreview(serializeSanitized(body));
    }
    if (typeof Blob !== "undefined" && body instanceof Blob) {
        return toBodyPreview(serializeSanitized(`[Blob ${body.size} bytes]`));
    }
    return toBodyPreview(serializeSanitized(String(body)));
};
const inferProvider = (urlText) => {
    const url = urlText.toLowerCase();
    if (url.includes("api.openai.com"))
        return "openai";
    if (url.includes("dashscope") || url.includes("aliyuncs") || url.includes("alibaba"))
        return "alibaba";
    if (url.includes("generativelanguage.googleapis.com"))
        return "gemini";
    if (url.includes("api.groq.com"))
        return "groq";
    if (url.includes("anthropic.com"))
        return "claude";
    if (url.includes("localhost:11434") || url.includes("/api/generate") || url.includes("/api/embeddings"))
        return "ollama";
    return "custom";
};
const inferModel = (urlText, bodyText) => {
    const parsed = safeJsonParse(bodyText);
    if (isPlainObject(parsed) && typeof parsed.model === "string") {
        return parsed.model;
    }
    const match = urlText.match(/models\/([^:/?]+)[/:]/i);
    if (match?.[1]) {
        return decodeURIComponent(match[1]);
    }
    return "";
};
const inferStage = (urlText, bodyText) => {
    const loweredUrl = urlText.toLowerCase();
    if (loweredUrl.includes("embed"))
        return "embedding";
    if (loweredUrl.includes("generatecontentstream"))
        return "stream_generation";
    if (loweredUrl.includes("responses") || loweredUrl.includes("generatecontent") || loweredUrl.includes("chat/completions") || loweredUrl.includes("messages") || loweredUrl.includes("generate")) {
        return "generation";
    }
    const parsed = safeJsonParse(bodyText);
    if (isPlainObject(parsed) && parsed.stream === true) {
        return "stream_generation";
    }
    return "transport";
};
const inferStreamed = (urlText, bodyText, headers) => {
    if (urlText.toLowerCase().includes("stream"))
        return true;
    const parsed = safeJsonParse(bodyText);
    if (isPlainObject(parsed) && parsed.stream === true)
        return true;
    return Object.entries(headers).some(([key, value]) => key.toLowerCase() === "accept" && value.toLowerCase().includes("text/event-stream"));
};
const cloneAction = (action) => JSON.parse(JSON.stringify(action));
class LlmTraceRecorder {
    static instance = null;
    asyncLocalStorage = new async_hooks_1.AsyncLocalStorage();
    actions = new Map();
    actionOrder = [];
    persistedIds = new Set();
    started = false;
    fetchInstalled = false;
    axiosInstalled = false;
    sessionId = createId("llm-trace-session");
    originalFetch = null;
    static getInstance() {
        if (!LlmTraceRecorder.instance) {
            LlmTraceRecorder.instance = new LlmTraceRecorder();
        }
        return LlmTraceRecorder.instance;
    }
    start() {
        if (this.started)
            return;
        this.started = true;
        this.ensureTraceDirectory();
        this.cleanupOldLogs();
        this.installFetchInterceptor();
        this.installAxiosInterceptor();
    }
    getInfo() {
        const logDirectory = this.getTraceDirectory();
        return {
            logDirectory,
            currentLogFile: path_1.default.join(logDirectory, `llm-trace-${this.getLocalDatePart(new Date())}.log`),
            sessionId: this.sessionId,
        };
    }
    async openTraceDirectory() {
        this.ensureTraceDirectory();
        const { logDirectory } = this.getInfo();
        const result = await electron_1.shell.openPath(logDirectory);
        return result || null;
    }
    clearCurrentSession() {
        this.actions.clear();
        this.actionOrder.length = 0;
        this.persistedIds.clear();
        this.sessionId = createId("llm-trace-session");
        this.broadcast({
            kind: "cleared",
            sessionId: this.sessionId,
        });
        return { sessionId: this.sessionId };
    }
    getRecentActions(query = {}) {
        const limit = Math.max(1, Math.min(query.limit ?? 40, 200));
        const typeFilter = query.actionTypes?.length ? new Set(query.actionTypes) : null;
        const memoryActions = this.actionOrder
            .map(id => this.actions.get(id))
            .filter((action) => !!action)
            .filter(action => !typeFilter || typeFilter.has(action.type));
        if (query.currentSessionOnly !== false) {
            return memoryActions.slice(0, limit).map(cloneAction);
        }
        const persisted = this.readPersistedActions(typeFilter);
        const combined = new Map();
        for (const action of [...memoryActions, ...persisted]) {
            const existing = combined.get(action.id);
            if (!existing || (existing.endedAt || existing.startedAt) < (action.endedAt || action.startedAt)) {
                combined.set(action.id, action);
            }
        }
        return Array.from(combined.values())
            .sort((left, right) => (right.endedAt || right.startedAt).localeCompare(left.endedAt || left.startedAt))
            .slice(0, limit)
            .map(cloneAction);
    }
    async runWithAction(init, fn) {
        const action = this.ensureAction(init);
        this.updateAction(action.id, draft => {
            draft.status = "running";
            draft.error = undefined;
            draft.endedAt = undefined;
        });
        const scope = {
            actionId: action.id,
            type: action.type,
            requestId: action.requestId,
        };
        return this.asyncLocalStorage.run(scope, async () => {
            try {
                const result = await fn();
                this.completeAction(action.id);
                return result;
            }
            catch (error) {
                this.failAction(action.id, error);
                throw error;
            }
        });
    }
    async runWithScope(scope, fn) {
        const current = this.asyncLocalStorage.getStore();
        const targetActionId = scope.actionId || current?.actionId;
        if (!targetActionId) {
            return await fn();
        }
        const action = this.actions.get(targetActionId);
        const nextScope = {
            actionId: targetActionId,
            type: scope.type || current?.type || action?.type || "manual_submit",
            requestId: scope.requestId ?? current?.requestId,
            lane: scope.lane ?? current?.lane,
            stage: scope.stage ?? current?.stage,
        };
        return await this.asyncLocalStorage.run(nextScope, async () => fn());
    }
    updateResolvedInput(partial, actionId) {
        const targetActionId = actionId || this.asyncLocalStorage.getStore()?.actionId;
        if (!targetActionId)
            return;
        this.updateAction(targetActionId, draft => {
            draft.resolvedInput = {
                ...(draft.resolvedInput || {}),
                ...sanitizeValue(partial),
            };
        });
    }
    appendStep(input) {
        const actionId = input.actionId || this.asyncLocalStorage.getStore()?.actionId;
        if (!actionId)
            return null;
        const scope = this.asyncLocalStorage.getStore();
        const requestHeadersResult = serializeSanitized(input.requestHeaders || {});
        const requestBodyResult = serializeSanitized(input.requestBody ?? "");
        const responseHeadersResult = serializeSanitized(input.responseHeaders || {});
        const responseBodyResult = serializeSanitized(input.responseBody ?? "");
        const sanitizedUrl = sanitizeValue(input.url || "");
        const id = createId("llm-trace-step");
        const step = {
            id,
            actionId,
            kind: input.kind || "app",
            stage: input.stage,
            lane: input.lane ?? scope?.lane,
            provider: input.provider || "",
            model: input.model || "",
            method: input.method || "",
            url: typeof sanitizedUrl === "string" ? sanitizedUrl : "",
            requestHeaders: requestHeadersResult.text,
            requestBody: requestBodyResult.text,
            responseStatus: input.responseStatus,
            responseHeaders: responseHeadersResult.text,
            responseBody: responseBodyResult.text,
            durationMs: input.durationMs,
            streamed: input.streamed ?? false,
            truncated: Boolean(input.truncated
                || requestHeadersResult.truncated
                || requestBodyResult.truncated
                || responseHeadersResult.truncated
                || responseBodyResult.truncated),
            error: input.error ? String(input.error) : undefined,
            startedAt: input.startedAt || nowIso(),
            endedAt: input.endedAt || nowIso(),
        };
        this.updateAction(actionId, draft => {
            draft.steps.push(step);
        });
        return id;
    }
    getCurrentScope() {
        return this.asyncLocalStorage.getStore();
    }
    installFetchInterceptor() {
        if (this.fetchInstalled || typeof globalThis.fetch !== "function")
            return;
        this.fetchInstalled = true;
        this.originalFetch = globalThis.fetch.bind(globalThis);
        const recorder = this;
        globalThis.fetch = (async function tracedFetch(input, init) {
            const scope = recorder.asyncLocalStorage.getStore();
            if (!scope || !recorder.originalFetch) {
                return recorder.originalFetch(input, init);
            }
            const urlText = typeof input === "string"
                ? input
                : input instanceof URL
                    ? input.toString()
                    : input.url;
            const requestHeaders = normalizeHeaders(init?.headers || (typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined));
            const requestBodyResult = await readRequestBody(input, init);
            const parsedRequest = recorder.parseTransportRequest(urlText, init?.method || (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET"), requestHeaders, requestBodyResult.body, requestBodyResult.truncated);
            const stepId = recorder.createTransportStep(scope.actionId, {
                lane: scope.lane,
                stage: scope.stage || parsedRequest.stage,
                provider: parsedRequest.provider,
                model: parsedRequest.model,
                method: parsedRequest.method,
                url: parsedRequest.url,
                requestHeaders: JSON.stringify(parsedRequest.headers, null, 2),
                requestBody: parsedRequest.body,
                streamed: parsedRequest.streamed,
                truncated: parsedRequest.truncated,
            });
            const started = Date.now();
            try {
                const response = await recorder.originalFetch(input, init);
                const responseHeaders = normalizeHeaders(response.headers);
                void recorder.captureFetchResponse(stepId, response.clone(), {
                    responseHeaders,
                    responseStatus: response.status,
                    durationMs: Date.now() - started,
                });
                return response;
            }
            catch (error) {
                recorder.finalizeTransportStep(stepId, {
                    responseStatus: undefined,
                    responseHeaders: "",
                    responseBody: "",
                    durationMs: Date.now() - started,
                    error: error instanceof Error ? error.message : String(error),
                    endedAt: nowIso(),
                });
                throw error;
            }
        });
    }
    installAxiosInterceptor() {
        if (this.axiosInstalled)
            return;
        this.axiosInstalled = true;
        const recorder = this;
        axios_1.default.interceptors.request.use(async (config) => {
            const scope = recorder.asyncLocalStorage.getStore();
            if (!scope) {
                return config;
            }
            const headers = normalizeHeaders(config.headers);
            const requestBodyResult = await serializeRequestBody(config.data);
            const parsedRequest = recorder.parseTransportRequest(config.url || "", config.method || "GET", headers, requestBodyResult.body, requestBodyResult.truncated);
            const stepId = recorder.createTransportStep(scope.actionId, {
                lane: scope.lane,
                stage: scope.stage || parsedRequest.stage,
                provider: parsedRequest.provider,
                model: parsedRequest.model,
                method: parsedRequest.method,
                url: parsedRequest.url,
                requestHeaders: JSON.stringify(parsedRequest.headers, null, 2),
                requestBody: parsedRequest.body,
                streamed: parsedRequest.streamed,
                truncated: parsedRequest.truncated,
            });
            config.__llmTraceStepId = stepId;
            config.__llmTraceStart = Date.now();
            return config;
        });
        axios_1.default.interceptors.response.use((response) => {
            const config = response.config;
            const stepId = config.__llmTraceStepId;
            if (stepId) {
                const headers = serializeSanitized(normalizeHeaders(response.headers));
                const body = serializeSanitized(response.data);
                recorder.finalizeTransportStep(stepId, {
                    responseStatus: response.status,
                    responseHeaders: headers.text,
                    responseBody: body.text,
                    durationMs: typeof config.__llmTraceStart === "number" ? Date.now() - config.__llmTraceStart : undefined,
                    truncated: headers.truncated || body.truncated,
                    endedAt: nowIso(),
                });
            }
            return response;
        }, (error) => {
            const config = error?.config;
            const stepId = config?.__llmTraceStepId;
            if (stepId) {
                const headers = serializeSanitized(normalizeHeaders(error?.response?.headers));
                const body = serializeSanitized(error?.response?.data ?? error?.message ?? "");
                recorder.finalizeTransportStep(stepId, {
                    responseStatus: error?.response?.status,
                    responseHeaders: headers.text,
                    responseBody: body.text,
                    durationMs: typeof config?.__llmTraceStart === "number" ? Date.now() - config.__llmTraceStart : undefined,
                    error: error instanceof Error ? error.message : String(error),
                    truncated: headers.truncated || body.truncated,
                    endedAt: nowIso(),
                });
            }
            return Promise.reject(error);
        });
    }
    parseTransportRequest(urlText, methodText, headers, bodyText, truncated) {
        const sanitizedUrl = String(sanitizeValue(urlText) || "");
        return {
            method: methodText.toUpperCase(),
            url: sanitizedUrl,
            headers,
            body: bodyText,
            streamed: inferStreamed(sanitizedUrl, bodyText, headers),
            provider: inferProvider(sanitizedUrl),
            model: inferModel(sanitizedUrl, bodyText),
            stage: inferStage(sanitizedUrl, bodyText),
            truncated,
        };
    }
    createTransportStep(actionId, input) {
        const stepId = createId("llm-trace-step");
        const step = {
            id: stepId,
            actionId,
            kind: "transport",
            stage: input.stage,
            lane: input.lane,
            provider: input.provider,
            model: input.model,
            method: input.method,
            url: input.url,
            requestHeaders: input.requestHeaders,
            requestBody: input.requestBody,
            responseStatus: undefined,
            responseHeaders: "",
            responseBody: "",
            durationMs: undefined,
            streamed: input.streamed,
            truncated: input.truncated,
            startedAt: nowIso(),
        };
        this.updateAction(actionId, draft => {
            draft.steps.push(step);
        });
        return stepId;
    }
    async captureFetchResponse(stepId, response, updates) {
        try {
            const bodyText = await response.text();
            const headers = serializeSanitized(updates.responseHeaders);
            const body = serializeSanitized(bodyText);
            this.finalizeTransportStep(stepId, {
                responseStatus: updates.responseStatus,
                responseHeaders: headers.text,
                responseBody: body.text,
                durationMs: updates.durationMs,
                truncated: headers.truncated || body.truncated,
                endedAt: nowIso(),
            });
        }
        catch (error) {
            this.finalizeTransportStep(stepId, {
                responseStatus: updates.responseStatus,
                responseHeaders: serializeSanitized(updates.responseHeaders).text,
                responseBody: "",
                durationMs: updates.durationMs,
                error: error instanceof Error ? error.message : String(error),
                endedAt: nowIso(),
            });
        }
    }
    finalizeTransportStep(stepId, updates) {
        const action = Array.from(this.actions.values()).find(item => item.steps.some(step => step.id === stepId));
        if (!action)
            return;
        this.updateAction(action.id, draft => {
            const step = draft.steps.find(item => item.id === stepId);
            if (!step)
                return;
            Object.assign(step, updates);
            step.truncated = Boolean(step.truncated || updates.truncated);
        });
    }
    ensureAction(init) {
        const actionId = init.id || createId("llm-trace-action");
        const existing = this.actions.get(actionId);
        if (existing) {
            this.updateAction(actionId, draft => {
                draft.type = init.type;
                draft.label = init.label || draft.label || ACTION_LABELS[init.type];
                draft.requestId = init.requestId || draft.requestId;
            });
            return this.actions.get(actionId);
        }
        const action = {
            id: actionId,
            sessionId: this.sessionId,
            type: init.type,
            label: init.label || ACTION_LABELS[init.type],
            requestId: init.requestId,
            startedAt: nowIso(),
            status: "running",
            steps: [],
        };
        this.actions.set(actionId, action);
        this.actionOrder.unshift(actionId);
        if (this.actionOrder.length > MAX_MEMORY_ACTIONS) {
            const removedId = this.actionOrder.pop();
            if (removedId) {
                this.actions.delete(removedId);
            }
        }
        this.broadcast({ kind: "upsert", action: cloneAction(action) });
        return action;
    }
    updateAction(actionId, updater) {
        const action = this.actions.get(actionId);
        if (!action)
            return;
        updater(action);
        this.broadcast({
            kind: "upsert",
            action: cloneAction(action),
        });
    }
    completeAction(actionId) {
        this.updateAction(actionId, draft => {
            draft.status = "completed";
            draft.endedAt = nowIso();
        });
        this.persistAction(actionId);
    }
    failAction(actionId, error) {
        this.updateAction(actionId, draft => {
            draft.status = "error";
            draft.error = error instanceof Error ? error.message : String(error);
            draft.endedAt = nowIso();
        });
        this.persistAction(actionId);
    }
    persistAction(actionId) {
        const action = this.actions.get(actionId);
        if (!action)
            return;
        this.ensureTraceDirectory();
        const filePath = this.getInfo().currentLogFile;
        try {
            fs_1.default.appendFileSync(filePath, `${JSON.stringify(action)}\n`, "utf8");
            this.persistedIds.add(action.id);
        }
        catch (error) {
            console.error("[LlmTraceRecorder] Failed to persist action:", error);
        }
    }
    broadcast(payload) {
        electron_1.BrowserWindow.getAllWindows().forEach(win => {
            if (!win.isDestroyed()) {
                win.webContents.send("llm-trace:update", payload);
            }
        });
    }
    ensureTraceDirectory() {
        fs_1.default.mkdirSync(this.getTraceDirectory(), { recursive: true });
    }
    getTraceDirectory() {
        return path_1.default.join(electron_1.app.getPath("userData"), "logs", "llm-trace");
    }
    getLocalDatePart(date) {
        const year = date.getFullYear();
        const month = `${date.getMonth() + 1}`.padStart(2, "0");
        const day = `${date.getDate()}`.padStart(2, "0");
        return `${year}-${month}-${day}`;
    }
    cleanupOldLogs() {
        const logDirectory = this.getTraceDirectory();
        if (!fs_1.default.existsSync(logDirectory))
            return;
        const cutoff = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
        for (const fileName of fs_1.default.readdirSync(logDirectory)) {
            if (!/^llm-trace-\d{4}-\d{2}-\d{2}\.log$/.test(fileName))
                continue;
            const filePath = path_1.default.join(logDirectory, fileName);
            try {
                const stats = fs_1.default.statSync(filePath);
                if (stats.mtimeMs < cutoff) {
                    fs_1.default.unlinkSync(filePath);
                }
            }
            catch {
                // Ignore cleanup failures.
            }
        }
    }
    readPersistedActions(typeFilter) {
        const logDirectory = this.getTraceDirectory();
        if (!fs_1.default.existsSync(logDirectory))
            return [];
        const files = fs_1.default.readdirSync(logDirectory)
            .filter(name => /^llm-trace-\d{4}-\d{2}-\d{2}\.log$/.test(name))
            .sort((left, right) => right.localeCompare(left))
            .slice(0, MAX_RECENT_FILES);
        const actionMap = new Map();
        for (const fileName of files) {
            const filePath = path_1.default.join(logDirectory, fileName);
            const lines = fs_1.default.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean).reverse();
            for (const line of lines) {
                try {
                    const parsed = JSON.parse(line);
                    if (parsed.sessionId === this.sessionId)
                        continue;
                    if (typeFilter && !typeFilter.has(parsed.type))
                        continue;
                    if (!actionMap.has(parsed.id)) {
                        actionMap.set(parsed.id, parsed);
                    }
                }
                catch {
                    continue;
                }
            }
        }
        return Array.from(actionMap.values())
            .sort((left, right) => (right.endedAt || right.startedAt).localeCompare(left.endedAt || left.startedAt));
    }
}
exports.llmTraceRecorder = LlmTraceRecorder.getInstance();
//# sourceMappingURL=LlmTraceRecorder.js.map
