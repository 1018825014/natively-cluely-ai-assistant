import { app, BrowserWindow, WebContents, shell } from "electron";
import fs from "fs";
import path from "path";
import util from "util";

export type RuntimeLogLevel = "debug" | "info" | "warn" | "error";

export type RuntimeLogEntry = {
  timestamp: string;
  level: RuntimeLogLevel;
  source: string;
  message: string;
  details?: string;
};

export type RendererLogPayload = {
  level?: RuntimeLogLevel;
  type?: string;
  source?: string;
  context?: string;
  message?: string;
  details?: string;
  stack?: string;
  componentStack?: string;
  windowUrl?: string;
};

type LogQuery = {
  limit?: number;
  levels?: RuntimeLogLevel[];
};

const LOG_RETENTION_DAYS = 14;
const MAX_RECENT_FILES = 5;
const MAX_MESSAGE_LENGTH = 6000;

class RuntimeLogger {
  private static instance: RuntimeLogger | null = null;

  private started = false;
  private processHandlersInstalled = false;
  private consolePatched = false;
  private cleanupCompleted = false;
  private attachedWebContents = new WeakSet<WebContents>();
  private attachedWindows = new WeakSet<BrowserWindow>();
  private pendingEntries: RuntimeLogEntry[] = [];

  private readonly originalConsole = {
    debug: console.debug.bind(console),
    info: console.info.bind(console),
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  static getInstance(): RuntimeLogger {
    if (!RuntimeLogger.instance) {
      RuntimeLogger.instance = new RuntimeLogger();
    }
    return RuntimeLogger.instance;
  }

  installProcessHandlers(): void {
    if (this.processHandlersInstalled) return;
    this.processHandlersInstalled = true;

    process.stdout?.on?.("error", () => {});
    process.stderr?.on?.("error", () => {});

    this.patchConsole();

    process.on("uncaughtException", (error) => {
      this.record("error", "process", "Uncaught exception", this.formatValue(error));
    });

    process.on("unhandledRejection", (reason) => {
      this.record("error", "process", "Unhandled promise rejection", this.formatValue(reason));
    });
  }

  start(): void {
    if (this.started) return;

    this.started = true;
    this.ensureLogDirectory();
    this.flushPendingEntries();
    this.attachElectronListeners();
    this.cleanupOldLogs();

    this.record("info", "runtime-logger", "Runtime logging started", JSON.stringify(this.getInfo(), null, 2));
  }

  getInfo(): { logDirectory: string; currentLogFile: string } {
    const logDirectory = path.join(app.getPath("userData"), "logs");
    return {
      logDirectory,
      currentLogFile: path.join(logDirectory, `runtime-${this.getLocalDatePart(new Date())}.log`),
    };
  }

  async openLogDirectory(): Promise<string | null> {
    this.ensureLogDirectory();
    const { logDirectory } = this.getInfo();
    const result = await shell.openPath(logDirectory);
    return result || null;
  }

  getRecentEntries(query: LogQuery = {}): RuntimeLogEntry[] {
    const limit = Math.max(1, Math.min(query.limit ?? 50, 500));
    const levelFilter = new Set(query.levels ?? ["warn", "error"]);
    const { logDirectory } = this.getInfo();

    if (!fs.existsSync(logDirectory)) {
      return [];
    }

    const files = fs
      .readdirSync(logDirectory)
      .filter(name => /^runtime-\d{4}-\d{2}-\d{2}\.log$/.test(name))
      .sort((a, b) => b.localeCompare(a))
      .slice(0, MAX_RECENT_FILES);

    const entries: RuntimeLogEntry[] = [];

    for (const fileName of files) {
      const filePath = path.join(logDirectory, fileName);
      const raw = fs.readFileSync(filePath, "utf8");
      const lines = raw.split(/\r?\n/).filter(Boolean).reverse();

      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as RuntimeLogEntry;
          if (!levelFilter.has(entry.level)) continue;
          entries.push(entry);
          if (entries.length >= limit) {
            return entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
          }
        } catch {
          continue;
        }
      }
    }

    return entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  captureRendererReport(payload: RendererLogPayload): void {
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

    this.record(
      payload.level ?? "error",
      sourceParts.join(":") || "renderer",
      payload.message?.trim() || "Renderer report",
      detailParts.join("\n\n") || undefined
    );
  }

  private attachElectronListeners(): void {
    app.on("web-contents-created", (_, contents) => {
      this.attachWebContents(contents);
    });

    app.on("browser-window-created", (_, window) => {
      this.attachWindow(window);
    });
  }

  private attachWebContents(contents: WebContents): void {
    if (this.attachedWebContents.has(contents)) return;
    this.attachedWebContents.add(contents);

    contents.on("console-message", (_event, level, message, line, sourceId) => {
      const mappedLevel = this.mapConsoleLevel(level);
      this.record(
        mappedLevel,
        `renderer-console:${contents.getType()}`,
        message,
        this.buildDetails({
          url: contents.getURL(),
          sourceId,
          line,
        })
      );
    });

    contents.on("render-process-gone", (_event, details) => {
      this.record(
        "error",
        `renderer-process:${contents.getType()}`,
        "Renderer process exited unexpectedly",
        this.buildDetails({
          url: contents.getURL(),
          reason: details.reason,
          exitCode: details.exitCode,
        })
      );
    });

    contents.on("preload-error", (_event, preloadPath, error) => {
      this.record(
        "error",
        `preload:${contents.getType()}`,
        "Preload script error",
        this.buildDetails({
          url: contents.getURL(),
          preloadPath,
          error: this.formatValue(error),
        })
      );
    });
  }

  private attachWindow(window: BrowserWindow): void {
    if (this.attachedWindows.has(window)) return;
    this.attachedWindows.add(window);

    window.on("unresponsive", () => {
      this.record(
        "warn",
        "browser-window",
        "Window became unresponsive",
        this.buildDetails({
          id: window.id,
          title: window.getTitle(),
        })
      );
    });

    window.on("responsive", () => {
      this.record(
        "info",
        "browser-window",
        "Window recovered responsiveness",
        this.buildDetails({
          id: window.id,
          title: window.getTitle(),
        })
      );
    });
  }

  private patchConsole(): void {
    if (this.consolePatched) return;
    this.consolePatched = true;

    console.debug = (...args: any[]) => {
      this.recordFromConsole("debug", "main-console", args);
      try { this.originalConsole.debug(...args); } catch {}
    };

    console.info = (...args: any[]) => {
      this.recordFromConsole("info", "main-console", args);
      try { this.originalConsole.info(...args); } catch {}
    };

    console.log = (...args: any[]) => {
      this.recordFromConsole("info", "main-console", args);
      try { this.originalConsole.log(...args); } catch {}
    };

    console.warn = (...args: any[]) => {
      this.recordFromConsole("warn", "main-console", args);
      try { this.originalConsole.warn(...args); } catch {}
    };

    console.error = (...args: any[]) => {
      this.recordFromConsole("error", "main-console", args);
      try { this.originalConsole.error(...args); } catch {}
    };
  }

  private recordFromConsole(level: RuntimeLogLevel, source: string, args: any[]): void {
    const message = args.map(arg => this.formatValue(arg)).join(" ");
    this.record(level, source, message);
  }

  private record(level: RuntimeLogLevel, source: string, message: string, details?: string): void {
    const entry: RuntimeLogEntry = {
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

  private writeEntry(entry: RuntimeLogEntry): void {
    try {
      this.ensureLogDirectory();
      fs.appendFileSync(this.getInfo().currentLogFile, `${JSON.stringify(entry)}\n`, "utf8");
    } catch {
      // Logging must never crash the app.
    }
  }

  private flushPendingEntries(): void {
    if (this.pendingEntries.length === 0) return;
    const buffered = [...this.pendingEntries];
    this.pendingEntries.length = 0;
    buffered.forEach(entry => this.writeEntry(entry));
  }

  private ensureLogDirectory(): void {
    const { logDirectory } = this.getInfo();
    fs.mkdirSync(logDirectory, { recursive: true });
  }

  private cleanupOldLogs(): void {
    if (this.cleanupCompleted) return;
    this.cleanupCompleted = true;

    try {
      const { logDirectory } = this.getInfo();
      const cutoff = Date.now() - (LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
      const files = fs
        .readdirSync(logDirectory)
        .filter(name => /^runtime-\d{4}-\d{2}-\d{2}\.log$/.test(name));

      for (const fileName of files) {
        const filePath = path.join(logDirectory, fileName);
        const stats = fs.statSync(filePath);
        if (stats.mtimeMs < cutoff) {
          fs.unlinkSync(filePath);
        }
      }
    } catch {
      // Cleanup is best-effort only.
    }
  }

  private buildDetails(data: Record<string, unknown>): string | undefined {
    const filtered = Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== undefined && value !== null && value !== "")
    );

    if (Object.keys(filtered).length === 0) {
      return undefined;
    }

    return JSON.stringify(filtered, null, 2);
  }

  private formatValue(value: unknown): string {
    if (value instanceof Error) {
      return value.stack || value.message;
    }

    if (typeof value === "string") {
      return value;
    }

    return util.inspect(value, {
      depth: 4,
      breakLength: 120,
      maxArrayLength: 20,
      maxStringLength: 4000,
      compact: false,
    });
  }

  private mapConsoleLevel(level: number): RuntimeLogLevel {
    if (level >= 3) return "error";
    if (level === 2) return "warn";
    if (level === 1) return "info";
    return "debug";
  }

  private getLocalDatePart(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  private truncate(value: string): string {
    if (value.length <= MAX_MESSAGE_LENGTH) {
      return value;
    }
    return `${value.slice(0, MAX_MESSAGE_LENGTH)}... [truncated]`;
  }
}

export const runtimeLogger = RuntimeLogger.getInstance();
