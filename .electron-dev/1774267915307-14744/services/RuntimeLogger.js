"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runtimeLogger = void 0;
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const util_1 = __importDefault(require("util"));
const LOG_RETENTION_DAYS = 14;
const MAX_RECENT_FILES = 5;
const MAX_MESSAGE_LENGTH = 6000;
class RuntimeLogger {
    static instance = null;
    started = false;
    processHandlersInstalled = false;
    consolePatched = false;
    cleanupCompleted = false;
    attachedWebContents = new WeakSet();
    attachedWindows = new WeakSet();
    pendingEntries = [];
    originalConsole = {
        debug: console.debug.bind(console),
        info: console.info.bind(console),
        log: console.log.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console),
    };
    static getInstance() {
        if (!RuntimeLogger.instance) {
            RuntimeLogger.instance = new RuntimeLogger();
        }
        return RuntimeLogger.instance;
    }
    installProcessHandlers() {
        if (this.processHandlersInstalled)
            return;
        this.processHandlersInstalled = true;
        process.stdout?.on?.("error", () => { });
        process.stderr?.on?.("error", () => { });
        this.patchConsole();
        process.on("uncaughtException", (error) => {
            this.record("error", "process", "Uncaught exception", this.formatValue(error));
        });
        process.on("unhandledRejection", (reason) => {
            this.record("error", "process", "Unhandled promise rejection", this.formatValue(reason));
        });
    }
    start() {
        if (this.started)
            return;
        this.started = true;
        this.ensureLogDirectory();
        this.flushPendingEntries();
        this.attachElectronListeners();
        this.cleanupOldLogs();
        this.record("info", "runtime-logger", "Runtime logging started", JSON.stringify(this.getInfo(), null, 2));
    }
    getInfo() {
        const logDirectory = path_1.default.join(electron_1.app.getPath("userData"), "logs");
        return {
            logDirectory,
            currentLogFile: path_1.default.join(logDirectory, `runtime-${this.getLocalDatePart(new Date())}.log`),
        };
    }
    async openLogDirectory() {
        this.ensureLogDirectory();
        const { logDirectory } = this.getInfo();
        const result = await electron_1.shell.openPath(logDirectory);
        return result || null;
    }
    getRecentEntries(query = {}) {
        const limit = Math.max(1, Math.min(query.limit ?? 50, 500));
        const levelFilter = new Set(query.levels ?? ["warn", "error"]);
        const { logDirectory } = this.getInfo();
        if (!fs_1.default.existsSync(logDirectory)) {
            return [];
        }
        const files = fs_1.default
            .readdirSync(logDirectory)
            .filter(name => /^runtime-\d{4}-\d{2}-\d{2}\.log$/.test(name))
            .sort((a, b) => b.localeCompare(a))
            .slice(0, MAX_RECENT_FILES);
        const entries = [];
        for (const fileName of files) {
            const filePath = path_1.default.join(logDirectory, fileName);
            const raw = fs_1.default.readFileSync(filePath, "utf8");
            const lines = raw.split(/\r?\n/).filter(Boolean).reverse();
            for (const line of lines) {
                try {
                    const entry = JSON.parse(line);
                    if (!levelFilter.has(entry.level))
                        continue;
                    entries.push(entry);
                    if (entries.length >= limit) {
                        return entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
                    }
                }
                catch {
                    continue;
                }
            }
        }
        return entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    }
    captureRendererReport(payload) {
        const detailParts = [
            payload.details?.trim(),
            payload.stack?.trim(),
            payload.componentStack?.trim(),
            payload.windowUrl?.trim() ? `windowUrl: ${payload.windowUrl.trim()}` : "",
        ].filter(Boolean);
        const sourceParts = [
            payload.source?.trim(),
            payload.context?.trim(),
            payload.type?.trim(),
        ].filter(Boolean);
        this.record(payload.level ?? "error", sourceParts.join(":") || "renderer", payload.message?.trim() || "Renderer report", detailParts.join("\n\n") || undefined);
    }
    attachElectronListeners() {
        electron_1.app.on("web-contents-created", (_, contents) => {
            this.attachWebContents(contents);
        });
        electron_1.app.on("browser-window-created", (_, window) => {
            this.attachWindow(window);
        });
    }
    attachWebContents(contents) {
        if (this.attachedWebContents.has(contents))
            return;
        this.attachedWebContents.add(contents);
        contents.on("console-message", (_event, level, message, line, sourceId) => {
            const mappedLevel = this.mapConsoleLevel(level);
            this.record(mappedLevel, `renderer-console:${contents.getType()}`, message, this.buildDetails({
                url: contents.getURL(),
                sourceId,
                line,
            }));
        });
        contents.on("render-process-gone", (_event, details) => {
            this.record("error", `renderer-process:${contents.getType()}`, "Renderer process exited unexpectedly", this.buildDetails({
                url: contents.getURL(),
                reason: details.reason,
                exitCode: details.exitCode,
            }));
        });
        contents.on("preload-error", (_event, preloadPath, error) => {
            this.record("error", `preload:${contents.getType()}`, "Preload script error", this.buildDetails({
                url: contents.getURL(),
                preloadPath,
                error: this.formatValue(error),
            }));
        });
    }
    attachWindow(window) {
        if (this.attachedWindows.has(window))
            return;
        this.attachedWindows.add(window);
        window.on("unresponsive", () => {
            this.record("warn", "browser-window", "Window became unresponsive", this.buildDetails({
                id: window.id,
                title: window.getTitle(),
            }));
        });
        window.on("responsive", () => {
            this.record("info", "browser-window", "Window recovered responsiveness", this.buildDetails({
                id: window.id,
                title: window.getTitle(),
            }));
        });
    }
    patchConsole() {
        if (this.consolePatched)
            return;
        this.consolePatched = true;
        console.debug = (...args) => {
            this.recordFromConsole("debug", "main-console", args);
            try {
                this.originalConsole.debug(...args);
            }
            catch { }
        };
        console.info = (...args) => {
            this.recordFromConsole("info", "main-console", args);
            try {
                this.originalConsole.info(...args);
            }
            catch { }
        };
        console.log = (...args) => {
            this.recordFromConsole("info", "main-console", args);
            try {
                this.originalConsole.log(...args);
            }
            catch { }
        };
        console.warn = (...args) => {
            this.recordFromConsole("warn", "main-console", args);
            try {
                this.originalConsole.warn(...args);
            }
            catch { }
        };
        console.error = (...args) => {
            this.recordFromConsole("error", "main-console", args);
            try {
                this.originalConsole.error(...args);
            }
            catch { }
        };
    }
    recordFromConsole(level, source, args) {
        const message = args.map(arg => this.formatValue(arg)).join(" ");
        this.record(level, source, message);
    }
    record(level, source, message, details) {
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            source,
            message: this.truncate(message),
            ...(details ? { details: this.truncate(details) } : {}),
        };
        if (!this.started) {
            this.pendingEntries.push(entry);
            return;
        }
        this.writeEntry(entry);
    }
    writeEntry(entry) {
        try {
            this.ensureLogDirectory();
            fs_1.default.appendFileSync(this.getInfo().currentLogFile, `${JSON.stringify(entry)}\n`, "utf8");
        }
        catch {
            // Logging must never crash the app.
        }
    }
    flushPendingEntries() {
        if (this.pendingEntries.length === 0)
            return;
        const buffered = [...this.pendingEntries];
        this.pendingEntries.length = 0;
        buffered.forEach(entry => this.writeEntry(entry));
    }
    ensureLogDirectory() {
        const { logDirectory } = this.getInfo();
        fs_1.default.mkdirSync(logDirectory, { recursive: true });
    }
    cleanupOldLogs() {
        if (this.cleanupCompleted)
            return;
        this.cleanupCompleted = true;
        try {
            const { logDirectory } = this.getInfo();
            const cutoff = Date.now() - (LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
            const files = fs_1.default
                .readdirSync(logDirectory)
                .filter(name => /^runtime-\d{4}-\d{2}-\d{2}\.log$/.test(name));
            for (const fileName of files) {
                const filePath = path_1.default.join(logDirectory, fileName);
                const stats = fs_1.default.statSync(filePath);
                if (stats.mtimeMs < cutoff) {
                    fs_1.default.unlinkSync(filePath);
                }
            }
        }
        catch {
            // Cleanup is best-effort only.
        }
    }
    buildDetails(data) {
        const filtered = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined && value !== null && value !== ""));
        if (Object.keys(filtered).length === 0) {
            return undefined;
        }
        return JSON.stringify(filtered, null, 2);
    }
    formatValue(value) {
        if (value instanceof Error) {
            return value.stack || value.message;
        }
        if (typeof value === "string") {
            return value;
        }
        return util_1.default.inspect(value, {
            depth: 4,
            breakLength: 120,
            maxArrayLength: 20,
            maxStringLength: 4000,
            compact: false,
        });
    }
    mapConsoleLevel(level) {
        if (level >= 3)
            return "error";
        if (level === 2)
            return "warn";
        if (level === 1)
            return "info";
        return "debug";
    }
    getLocalDatePart(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }
    truncate(value) {
        if (value.length <= MAX_MESSAGE_LENGTH) {
            return value;
        }
        return `${value.slice(0, MAX_MESSAGE_LENGTH)}... [truncated]`;
    }
}
exports.runtimeLogger = RuntimeLogger.getInstance();
//# sourceMappingURL=RuntimeLogger.js.map
