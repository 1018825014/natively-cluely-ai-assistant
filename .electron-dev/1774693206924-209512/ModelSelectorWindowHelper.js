"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelSelectorWindowHelper = void 0;
const electron_1 = require("electron");
const node_path_1 = __importDefault(require("node:path"));
const isDev = process.env.NODE_ENV === "development";
const devServerUrl = process.env.VITE_DEV_SERVER_URL || "http://localhost:5180";
const startUrl = isDev
    ? devServerUrl
    : `file://${node_path_1.default.join(electron_1.app.getAppPath(), "dist/index.html")}`;
class ModelSelectorWindowHelper {
    window = null;
    contentProtection = false;
    opacityTimeout = null;
    // Store offsets relative to main window if needed, but absolute positioning is simpler for dropdowns
    lastBlurTime = 0;
    ignoreBlur = false;
    constructor() { }
    setIgnoreBlur(ignore) {
        this.ignoreBlur = ignore;
    }
    windowHelper = null;
    setWindowHelper(wh) {
        this.windowHelper = wh;
    }
    getWindow() {
        return this.window;
    }
    preloadWindow() {
        if (!this.window || this.window.isDestroyed()) {
            this.createWindow(-10000, -10000, false);
        }
    }
    showWindow(x, y) {
        if (!this.window || this.window.isDestroyed()) {
            this.createWindow(x, y);
            return;
        }
        // Set parent and align window settings
        const mainWin = this.windowHelper?.getMainWindow();
        const isOverlay = mainWin === this.windowHelper?.getOverlayWindow();
        if (mainWin && !mainWin.isDestroyed()) {
            this.window.setParentWindow(mainWin);
        }
        if (process.platform === "darwin") {
            // Align with parent window behavior
            this.window.setVisibleOnAllWorkspaces(isOverlay, { visibleOnFullScreen: isOverlay });
            this.window.setAlwaysOnTop(isOverlay, "floating");
            // Always hide from MC as it's a dropdown
            this.window.setHiddenInMissionControl(true);
        }
        // Standard dropdown positioning
        this.window.setPosition(Math.round(x), Math.round(y));
        this.ensureVisibleOnScreen();
        if (process.platform === 'win32' && this.contentProtection) {
            this.window.setOpacity(0);
            this.window.show();
            this.window.setContentProtection(true);
            if (this.opacityTimeout)
                clearTimeout(this.opacityTimeout);
            this.opacityTimeout = setTimeout(() => {
                if (this.window && !this.window.isDestroyed()) {
                    this.window.setOpacity(1);
                    this.window.focus();
                }
            }, 60);
        }
        else {
            this.window.setContentProtection(this.contentProtection);
            this.window.show();
            this.window.focus();
        }
    }
    hideWindow() {
        if (this.window && !this.window.isDestroyed()) {
            this.window.setParentWindow(null);
            this.window.hide();
            // Restore focus
            const mainWin = this.windowHelper?.getMainWindow();
            if (mainWin && !mainWin.isDestroyed() && mainWin.isVisible()) {
                mainWin.focus();
            }
        }
    }
    toggleWindow(x, y) {
        if (this.window && !this.window.isDestroyed()) {
            // Fix: If window was just closed by blur (e.g. clicking the toggle button), don't re-open immediately
            if (!this.window.isVisible() && (Date.now() - this.lastBlurTime < 250)) {
                return;
            }
            if (this.window.isVisible()) {
                this.hideWindow();
            }
            else {
                this.showWindow(x, y);
            }
        }
        else {
            this.createWindow(x, y);
        }
    }
    closeWindow() {
        this.hideWindow();
    }
    createWindow(x, y, showWhenReady = true) {
        const windowSettings = {
            width: 140,
            height: 200,
            frame: false,
            transparent: true,
            resizable: false,
            fullscreenable: false,
            hasShadow: false,
            alwaysOnTop: true,
            backgroundColor: "#00000000",
            show: false,
            skipTaskbar: true,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: node_path_1.default.join(__dirname, "preload.js"),
                backgroundThrottling: false
            }
        };
        if (x !== undefined && y !== undefined) {
            windowSettings.x = Math.round(x);
            windowSettings.y = Math.round(y);
        }
        this.window = new electron_1.BrowserWindow(windowSettings);
        if (process.platform === "darwin") {
            // Initial defaults - will be updated in showWindow
            this.window.setHiddenInMissionControl(true);
        }
        // Apply content protection for Undetectable Mode
        console.log(`[ModelSelectorWindowHelper] Creating window with Content Protection: ${this.contentProtection}`);
        this.window.setContentProtection(this.contentProtection);
        // Load with query param for routing
        const url = isDev
            ? `${startUrl}?window=model-selector`
            : `${startUrl}?window=model-selector`;
        this.window.loadURL(url).catch(e => {
            console.error('[ModelSelectorWindowHelper] Failed to load URL:', e);
        });
        this.window.once('ready-to-show', () => {
            if (showWhenReady) {
                this.showWindow(this.window?.getBounds().x || 0, this.window?.getBounds().y || 0);
            }
        });
        // Close on blur (click outside)
        this.window.on('blur', () => {
            if (this.ignoreBlur)
                return;
            this.lastBlurTime = Date.now();
            this.hideWindow();
        });
    }
    ensureVisibleOnScreen() {
        if (!this.window)
            return;
        const { x, y, width, height } = this.window.getBounds();
        const display = electron_1.screen.getDisplayNearestPoint({ x, y });
        const bounds = display.workArea;
        let newX = x;
        let newY = y;
        // Keep within horizontal bounds
        if (x + width > bounds.x + bounds.width) {
            newX = bounds.x + bounds.width - width;
        }
        if (x < bounds.x) {
            newX = bounds.x;
        }
        // Keep within vertical bounds
        if (y + height > bounds.y + bounds.height) {
            newY = bounds.y + bounds.height - height;
        }
        if (y < bounds.y) {
            newY = bounds.y;
        }
        this.window.setPosition(newX, newY);
    }
    setContentProtection(enable) {
        console.log(`[ModelSelectorWindowHelper] Setting content protection to: ${enable}`);
        this.contentProtection = enable;
        if (this.window && !this.window.isDestroyed()) {
            this.window.setContentProtection(enable);
        }
    }
}
exports.ModelSelectorWindowHelper = ModelSelectorWindowHelper;
//# sourceMappingURL=ModelSelectorWindowHelper.js.map