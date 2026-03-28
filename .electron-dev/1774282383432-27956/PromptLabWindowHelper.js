"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PromptLabWindowHelper = void 0;
const electron_1 = require("electron");
const node_path_1 = __importDefault(require("node:path"));
const isDev = process.env.NODE_ENV === "development";
const devServerUrl = process.env.VITE_DEV_SERVER_URL || "http://localhost:5180";
const startUrl = isDev
    ? devServerUrl
    : `file://${node_path_1.default.join(electron_1.app.getAppPath(), "dist/index.html")}`;
const DEFAULT_PROMPT_LAB_WIDTH = 1320;
const DEFAULT_PROMPT_LAB_HEIGHT = 900;
const MIN_PROMPT_LAB_WIDTH = 980;
const MIN_PROMPT_LAB_HEIGHT = 680;
class PromptLabWindowHelper {
    window = null;
    contentProtection = false;
    opacityTimeout = null;
    getWindow() {
        return this.window;
    }
    openWindow(anchorWindow, action) {
        if (!this.window || this.window.isDestroyed()) {
            this.createWindow(anchorWindow, action);
            return;
        }
        if (this.window.isMinimized()) {
            this.window.restore();
        }
        this.ensureVisibleOnScreen(anchorWindow);
        this.showWindow();
        if (action) {
            this.window.webContents.send("prompt-lab:focus-action", action);
        }
    }
    closeWindow() {
        if (this.window && !this.window.isDestroyed()) {
            this.window.close();
        }
    }
    setContentProtection(enable) {
        this.contentProtection = enable;
        if (this.window && !this.window.isDestroyed()) {
            this.window.setContentProtection(enable);
        }
    }
    createWindow(anchorWindow, action) {
        const bounds = this.getInitialBounds(anchorWindow);
        const actionParam = action ? `&action=${encodeURIComponent(action)}` : "";
        this.window = new electron_1.BrowserWindow({
            ...bounds,
            minWidth: MIN_PROMPT_LAB_WIDTH,
            minHeight: MIN_PROMPT_LAB_HEIGHT,
            frame: true,
            transparent: false,
            backgroundColor: "#111111",
            autoHideMenuBar: true,
            show: false,
            resizable: true,
            maximizable: true,
            minimizable: true,
            fullscreenable: true,
            alwaysOnTop: true,
            skipTaskbar: false,
            title: "Natively Prompt Lab",
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: node_path_1.default.join(__dirname, "preload.js"),
                backgroundThrottling: false,
            },
        });
        this.window.setContentProtection(this.contentProtection);
        if (process.platform === "darwin") {
            this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
            this.window.setAlwaysOnTop(true, "floating");
        }
        this.window.loadURL(`${startUrl}?window=prompt-lab${actionParam}`).catch((error) => {
            console.error("[PromptLabWindowHelper] Failed to load Prompt Lab window:", error);
        });
        this.window.once("ready-to-show", () => {
            this.showWindow();
            if (action) {
                this.window?.webContents.send("prompt-lab:focus-action", action);
            }
        });
        this.window.on("closed", () => {
            this.window = null;
        });
    }
    showWindow() {
        if (!this.window || this.window.isDestroyed())
            return;
        if (process.platform === "win32" && this.contentProtection) {
            this.window.setOpacity(0);
            this.window.show();
            this.window.setContentProtection(true);
            if (this.opacityTimeout)
                clearTimeout(this.opacityTimeout);
            this.opacityTimeout = setTimeout(() => {
                if (!this.window || this.window.isDestroyed())
                    return;
                this.window.setOpacity(1);
                this.window.focus();
            }, 60);
            return;
        }
        this.window.setContentProtection(this.contentProtection);
        this.window.show();
        this.window.focus();
    }
    getInitialBounds(anchorWindow) {
        const display = anchorWindow && !anchorWindow.isDestroyed()
            ? electron_1.screen.getDisplayMatching(anchorWindow.getBounds())
            : electron_1.screen.getPrimaryDisplay();
        const { workArea } = display;
        const width = Math.min(DEFAULT_PROMPT_LAB_WIDTH, workArea.width);
        const height = Math.min(DEFAULT_PROMPT_LAB_HEIGHT, workArea.height);
        const x = Math.round(workArea.x + (workArea.width - width) / 2);
        const y = Math.round(workArea.y + (workArea.height - height) / 2);
        return { x, y, width, height };
    }
    ensureVisibleOnScreen(anchorWindow) {
        if (!this.window || this.window.isDestroyed())
            return;
        const currentBounds = this.window.getBounds();
        const display = anchorWindow && !anchorWindow.isDestroyed()
            ? electron_1.screen.getDisplayMatching(anchorWindow.getBounds())
            : electron_1.screen.getDisplayMatching(currentBounds);
        const { workArea } = display;
        const width = Math.min(Math.max(currentBounds.width, MIN_PROMPT_LAB_WIDTH), workArea.width);
        const height = Math.min(Math.max(currentBounds.height, MIN_PROMPT_LAB_HEIGHT), workArea.height);
        const x = Math.min(Math.max(currentBounds.x, workArea.x), workArea.x + workArea.width - width);
        const y = Math.min(Math.max(currentBounds.y, workArea.y), workArea.y + workArea.height - height);
        this.window.setBounds({ x, y, width, height });
    }
}
exports.PromptLabWindowHelper = PromptLabWindowHelper;
//# sourceMappingURL=PromptLabWindowHelper.js.map