import { BrowserWindow, screen, app } from "electron";
import path from "node:path";

const isDev = process.env.NODE_ENV === "development";
const devServerUrl = process.env.VITE_DEV_SERVER_URL || "http://localhost:5180";

const startUrl = isDev
    ? devServerUrl
    : `file://${path.join(app.getAppPath(), "dist/index.html")}`;

const DEFAULT_COMPARE_WIDTH = 1500;
const DEFAULT_COMPARE_HEIGHT = 940;
const MIN_COMPARE_WIDTH = 1100;
const MIN_COMPARE_HEIGHT = 760;

export class SttCompareWindowHelper {
    private window: BrowserWindow | null = null;
    private contentProtection = false;
    private opacityTimeout: NodeJS.Timeout | null = null;

    public getWindow(): BrowserWindow | null {
        return this.window;
    }

    public openWindow(anchorWindow?: BrowserWindow | null): void {
        if (!this.window || this.window.isDestroyed()) {
            this.createWindow(anchorWindow);
            return;
        }

        if (this.window.isMinimized()) {
            this.window.restore();
        }

        this.ensureVisibleOnScreen(anchorWindow);
        this.showWindow();
    }

    public closeWindow(): void {
        if (this.window && !this.window.isDestroyed()) {
            this.window.close();
        }
    }

    public setContentProtection(enable: boolean): void {
        this.contentProtection = enable;
        if (this.window && !this.window.isDestroyed()) {
            this.window.setContentProtection(enable);
        }
    }

    private createWindow(anchorWindow?: BrowserWindow | null): void {
        const bounds = this.getInitialBounds(anchorWindow);

        this.window = new BrowserWindow({
            ...bounds,
            minWidth: MIN_COMPARE_WIDTH,
            minHeight: MIN_COMPARE_HEIGHT,
            frame: true,
            transparent: false,
            backgroundColor: "#0f1115",
            autoHideMenuBar: true,
            show: false,
            resizable: true,
            maximizable: true,
            minimizable: true,
            fullscreenable: true,
            alwaysOnTop: true,
            skipTaskbar: false,
            title: "Natively Fun-ASR 对比",
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, "preload.js"),
                backgroundThrottling: false,
            }
        });

        this.window.setContentProtection(this.contentProtection);

        if (process.platform === "darwin") {
            this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
            this.window.setAlwaysOnTop(true, "floating");
        }

        this.window.loadURL(`${startUrl}?window=stt-compare`).catch(error => {
            console.error("[SttCompareWindowHelper] Failed to load STT Compare window:", error);
        });

        this.window.once("ready-to-show", () => {
            this.showWindow();
        });

        this.window.on("closed", () => {
            this.window = null;
        });
    }

    private showWindow(): void {
        if (!this.window || this.window.isDestroyed()) return;

        if (process.platform === "win32" && this.contentProtection) {
            this.window.setOpacity(0);
            this.window.show();
            this.window.setContentProtection(true);

            if (this.opacityTimeout) clearTimeout(this.opacityTimeout);
            this.opacityTimeout = setTimeout(() => {
                if (!this.window || this.window.isDestroyed()) return;
                this.window.setOpacity(1);
                this.window.focus();
            }, 60);
            return;
        }

        this.window.setContentProtection(this.contentProtection);
        this.window.show();
        this.window.focus();
    }

    private getInitialBounds(anchorWindow?: BrowserWindow | null): Electron.Rectangle {
        const display = anchorWindow && !anchorWindow.isDestroyed()
            ? screen.getDisplayMatching(anchorWindow.getBounds())
            : screen.getPrimaryDisplay();
        const { workArea } = display;

        const width = Math.min(DEFAULT_COMPARE_WIDTH, workArea.width);
        const height = Math.min(DEFAULT_COMPARE_HEIGHT, workArea.height);
        const x = Math.round(workArea.x + (workArea.width - width) / 2);
        const y = Math.round(workArea.y + (workArea.height - height) / 2);

        return { x, y, width, height };
    }

    private ensureVisibleOnScreen(anchorWindow?: BrowserWindow | null): void {
        if (!this.window || this.window.isDestroyed()) return;

        const currentBounds = this.window.getBounds();
        const display = anchorWindow && !anchorWindow.isDestroyed()
            ? screen.getDisplayMatching(anchorWindow.getBounds())
            : screen.getDisplayMatching(currentBounds);
        const { workArea } = display;

        const width = Math.min(Math.max(currentBounds.width, MIN_COMPARE_WIDTH), workArea.width);
        const height = Math.min(Math.max(currentBounds.height, MIN_COMPARE_HEIGHT), workArea.height);
        const x = Math.min(Math.max(currentBounds.x, workArea.x), workArea.x + workArea.width - width);
        const y = Math.min(Math.max(currentBounds.y, workArea.y), workArea.y + workArea.height - height);

        this.window.setBounds({ x, y, width, height });
    }
}
