"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WindowHelper = void 0;
const electron_1 = require("electron");
const node_path_1 = __importDefault(require("node:path"));
const isEnvDev = process.env.NODE_ENV === "development";
const isPackaged = electron_1.app.isPackaged;
const inAppBundle = process.execPath.includes('.app/') || process.execPath.includes('.app\\');
console.log(`[WindowHelper] isEnvDev: ${isEnvDev}, isPackaged: ${isPackaged}, inAppBundle: ${inAppBundle}`);
// Force production mode if running as packaged app or inside app bundle
const isDev = isEnvDev && !isPackaged;
const DEFAULT_OVERLAY_WIDTH = 1080;
const DEFAULT_OVERLAY_HEIGHT = 760;
const MIN_OVERLAY_WIDTH = 860;
const MIN_OVERLAY_HEIGHT = 600;
const devServerUrl = process.env.VITE_DEV_SERVER_URL || "http://localhost:5180";
const startUrl = isDev
    ? devServerUrl
    : `file://${node_path_1.default.join(__dirname, "../../dist/index.html")}`;
class WindowHelper {
    launcherWindow = null;
    overlayWindow = null;
    isWindowVisible = false;
    overlayIsMaximized = false;
    overlayRestoreBounds = null;
    // Position/Size tracking for Launcher
    launcherPosition = null;
    launcherSize = null;
    // Track current window mode (persists even when overlay is hidden via Cmd+B)
    currentWindowMode = 'launcher';
    appState;
    contentProtection = false;
    opacityTimeout = null;
    // Initialize with explicit number type and 0 value
    screenWidth = 0;
    screenHeight = 0;
    // Movement variables (apply to active window)
    step = 20;
    currentX = 0;
    currentY = 0;
    constructor(appState) {
        this.appState = appState;
    }
    getOverlayAlwaysOnTopLevel() {
        return process.platform === 'win32' ? 'screen-saver' : 'floating';
    }
    getOverlayWindowState() {
        const overlayBounds = this.overlayWindow && !this.overlayWindow.isDestroyed()
            ? this.overlayWindow.getBounds()
            : null;
        return {
            visible: this.isWindowVisible,
            mode: this.currentWindowMode,
            overlayVisible: !!(this.overlayWindow && !this.overlayWindow.isDestroyed() && this.overlayWindow.isVisible()),
            launcherVisible: !!(this.launcherWindow && !this.launcherWindow.isDestroyed() && this.launcherWindow.isVisible()),
            overlayAlwaysOnTop: !!(this.overlayWindow && !this.overlayWindow.isDestroyed() && this.overlayWindow.isAlwaysOnTop()),
            overlayFocused: !!(this.overlayWindow && !this.overlayWindow.isDestroyed() && this.overlayWindow.isFocused()),
            isMaximized: this.overlayIsMaximized,
            bounds: overlayBounds ? { ...overlayBounds } : null,
            restorableBounds: this.overlayRestoreBounds ? { ...this.overlayRestoreBounds } : null
        };
    }
    getOverlayDisplayWorkArea(bounds) {
        if (!bounds && this.overlayWindow && !this.overlayWindow.isDestroyed()) {
            bounds = this.overlayWindow.getBounds();
        }
        if (bounds) {
            return electron_1.screen.getDisplayMatching(bounds).workArea;
        }
        return electron_1.screen.getPrimaryDisplay().workArea;
    }
    broadcastWindowVisibilityState() {
        const payload = this.getOverlayWindowState();
        [this.launcherWindow, this.overlayWindow].forEach((win) => {
            if (win && !win.isDestroyed()) {
                win.webContents.send('window-visibility-changed', payload);
            }
        });
    }
    logOverlayState(context) {
        console.log(`[WindowHelper] ${context}:`, JSON.stringify(this.getOverlayWindowState()));
    }
    setOverlayTemporaryTopmost(enabled, context, options = {}) {
        if (!this.overlayWindow || this.overlayWindow.isDestroyed())
            return;
        const { focusWindow = false, broadcast = true, log = true } = options;
        if (enabled) {
            const level = this.getOverlayAlwaysOnTopLevel();
            this.overlayWindow.setAlwaysOnTop(true, level);
            this.overlayWindow.moveTop();
        }
        else if (this.overlayWindow.isAlwaysOnTop()) {
            this.overlayWindow.setAlwaysOnTop(false);
        }
        if (focusWindow && this.overlayWindow.isVisible()) {
            this.overlayWindow.focus();
            if (!this.overlayWindow.webContents.isDestroyed()) {
                this.overlayWindow.webContents.focus();
            }
        }
        if (broadcast) {
            this.broadcastWindowVisibilityState();
        }
        if (log) {
            this.logOverlayState(`overlayTopmost:${context}`);
        }
    }
    setContentProtection(enable) {
        this.contentProtection = enable;
        this.applyContentProtection(enable);
    }
    applyContentProtection(enable) {
        const windows = [this.launcherWindow, this.overlayWindow];
        windows.forEach(win => {
            if (win && !win.isDestroyed()) {
                win.setContentProtection(enable);
            }
        });
    }
    setWindowDimensions(width, height) {
        const activeWindow = this.getMainWindow(); // Gets currently focused/relevant window
        if (!activeWindow || activeWindow.isDestroyed())
            return;
        const [currentX, currentY] = activeWindow.getPosition();
        const primaryDisplay = electron_1.screen.getPrimaryDisplay();
        const workArea = primaryDisplay.workAreaSize;
        const maxAllowedWidth = Math.floor(workArea.width * 0.9);
        const newWidth = Math.min(width, maxAllowedWidth);
        const newHeight = Math.ceil(height);
        const maxX = workArea.width - newWidth;
        const newX = Math.min(Math.max(currentX, 0), maxX);
        activeWindow.setBounds({
            x: newX,
            y: currentY,
            width: newWidth,
            height: newHeight
        });
        // Update internal tracking if it's launcher
        if (activeWindow === this.launcherWindow) {
            this.launcherSize = { width: newWidth, height: newHeight };
            this.launcherPosition = { x: newX, y: currentY };
        }
    }
    // Dedicated method for overlay window resizing - decoupled from launcher
    setOverlayDimensions(width, height) {
        if (!this.overlayWindow || this.overlayWindow.isDestroyed())
            return;
        console.log('[WindowHelper] setOverlayDimensions:', width, height);
        if (this.overlayIsMaximized)
            return;
        const [currentX, currentY] = this.overlayWindow.getPosition();
        this.setOverlayBounds({ x: currentX, y: currentY, width, height });
    }
    setOverlayBounds(bounds) {
        if (!this.overlayWindow || this.overlayWindow.isDestroyed())
            return;
        if (this.overlayIsMaximized)
            return;
        const workArea = this.getOverlayDisplayWorkArea(bounds);
        const newWidth = Math.max(bounds.width, MIN_OVERLAY_WIDTH);
        const newHeight = Math.max(bounds.height, MIN_OVERLAY_HEIGHT);
        const maxX = workArea.x + Math.max(workArea.width - Math.min(newWidth, workArea.width), 0);
        const maxY = workArea.y + Math.max(workArea.height - Math.min(newHeight, workArea.height), 0);
        const newX = Math.min(Math.max(bounds.x, workArea.x), maxX);
        const newY = Math.min(Math.max(bounds.y, workArea.y), maxY);
        this.overlayWindow.setBounds({
            x: Math.round(newX),
            y: Math.round(newY),
            width: Math.round(newWidth),
            height: Math.round(newHeight)
        });
        this.broadcastWindowVisibilityState();
    }
    maximizeOverlayToWorkArea() {
        if (!this.overlayWindow || this.overlayWindow.isDestroyed())
            return;
        if (!this.overlayIsMaximized) {
            this.overlayRestoreBounds = this.overlayWindow.getBounds();
        }
        const workArea = this.getOverlayDisplayWorkArea();
        this.overlayIsMaximized = true;
        this.overlayWindow.setBounds({
            x: Math.round(workArea.x),
            y: Math.round(workArea.y),
            width: Math.round(workArea.width),
            height: Math.round(workArea.height)
        });
        this.broadcastWindowVisibilityState();
    }
    restoreOverlayBounds() {
        if (!this.overlayWindow || this.overlayWindow.isDestroyed())
            return;
        if (!this.overlayIsMaximized || !this.overlayRestoreBounds)
            return;
        const restoreBounds = { ...this.overlayRestoreBounds };
        this.overlayIsMaximized = false;
        this.overlayRestoreBounds = null;
        this.overlayWindow.setBounds(restoreBounds);
        this.broadcastWindowVisibilityState();
    }
    createWindow() {
        if (this.launcherWindow !== null)
            return; // Already created
        const primaryDisplay = electron_1.screen.getPrimaryDisplay();
        const workArea = primaryDisplay.workArea;
        this.screenWidth = workArea.width;
        this.screenHeight = workArea.height;
        // Fixed dimensions per user request
        const width = 1200;
        const height = 800;
        // Calculate centered X, and top-centered Y (5% from top)
        const x = Math.round(workArea.x + (workArea.width - width) / 2);
        // Ensure y is at least workArea.y (don't go offscreen top)
        const topMargin = Math.round(workArea.height * 0.05);
        const y = Math.round(workArea.y + topMargin);
        // --- 1. Create Launcher Window ---
        const launcherSettings = {
            width: width,
            height: height,
            x: x,
            y: y,
            minWidth: 600,
            minHeight: 400,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: node_path_1.default.join(__dirname, "preload.js"),
                scrollBounce: true,
                webSecurity: !isDev, // DEBUG: Disable web security only in dev
            },
            show: false, // DEBUG: Force show -> Fixed white screen, now relies on ready-to-show
            titleBarStyle: 'hiddenInset',
            trafficLightPosition: { x: 14, y: 14 },
            vibrancy: 'under-window',
            visualEffectState: 'followWindow',
            transparent: true,
            hasShadow: true,
            backgroundColor: "#00000000",
            focusable: true,
            resizable: true,
            movable: true,
            center: true,
            icon: (() => {
                const isMac = process.platform === "darwin";
                const isWin = process.platform === "win32";
                const mode = this.appState.getDisguise();
                if (mode === 'none') {
                    if (isMac) {
                        return electron_1.app.isPackaged
                            ? node_path_1.default.join(process.resourcesPath, "natively.icns")
                            : node_path_1.default.resolve(__dirname, "../../assets/natively.icns");
                    }
                    else if (isWin) {
                        return electron_1.app.isPackaged
                            ? node_path_1.default.join(process.resourcesPath, "assets/icons/win/icon.ico")
                            : node_path_1.default.resolve(__dirname, "../../assets/icons/win/icon.ico");
                    }
                    else {
                        return electron_1.app.isPackaged
                            ? node_path_1.default.join(process.resourcesPath, "icon.png")
                            : node_path_1.default.resolve(__dirname, "../../assets/icon.png");
                    }
                }
                // Disguise mode icons
                let iconName = "terminal.png";
                if (mode === 'settings')
                    iconName = "settings.png";
                if (mode === 'activity')
                    iconName = "activity.png";
                const platformDir = isWin ? "win" : "mac";
                return electron_1.app.isPackaged
                    ? node_path_1.default.join(process.resourcesPath, `assets/fakeicon/${platformDir}/${iconName}`)
                    : node_path_1.default.resolve(__dirname, `../../assets/fakeicon/${platformDir}/${iconName}`);
            })()
        };
        console.log(`[WindowHelper] Icon Path: ${launcherSettings.icon}`);
        console.log(`[WindowHelper] Start URL: ${startUrl}`);
        try {
            this.launcherWindow = new electron_1.BrowserWindow(launcherSettings);
            console.log('[WindowHelper] BrowserWindow created successfully');
        }
        catch (err) {
            console.error('[WindowHelper] Failed to create BrowserWindow:', err);
            return;
        }
        this.launcherWindow.setContentProtection(this.contentProtection);
        this.launcherWindow.loadURL(`${startUrl}?window=launcher`)
            .then(() => console.log('[WindowHelper] loadURL success'))
            .catch((e) => { console.error("[WindowHelper] Failed to load URL:", e); });
        this.launcherWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
            console.error(`[WindowHelper] did-fail-load: ${errorCode} ${errorDescription}`);
        });
        // if (isDev) {
        //   this.launcherWindow.webContents.openDevTools({ mode: 'detach' }); // DEBUG: Open DevTools
        // }
        // --- 2. Create Overlay Window (Hidden initially) ---
        const overlaySettings = {
            width: DEFAULT_OVERLAY_WIDTH,
            height: DEFAULT_OVERLAY_HEIGHT,
            minWidth: MIN_OVERLAY_WIDTH,
            minHeight: MIN_OVERLAY_HEIGHT,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: node_path_1.default.join(__dirname, "preload.js"),
                scrollBounce: true,
            },
            show: false,
            frame: false, // Frameless
            transparent: true,
            backgroundColor: "#00000000",
            alwaysOnTop: false,
            focusable: true,
            resizable: false, // Enforce automatic resizing only
            movable: true,
            skipTaskbar: true, // Don't show separately in dock/taskbar
            hasShadow: false, // Prevent shadow from adding perceived size/artifacts
        };
        this.overlayWindow = new electron_1.BrowserWindow(overlaySettings);
        this.overlayWindow.setContentProtection(this.contentProtection);
        if (process.platform === "darwin") {
            this.overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
            this.overlayWindow.setHiddenInMissionControl(true);
        }
        this.overlayWindow.loadURL(`${startUrl}?window=overlay`).catch(e => {
            console.error('[WindowHelper] Failed to load Overlay URL:', e);
        });
        // --- 3. Startup Sequence ---
        this.launcherWindow.once('ready-to-show', () => {
            this.switchToLauncher();
            this.isWindowVisible = true;
        });
        this.setupWindowListeners();
    }
    setupWindowListeners() {
        if (!this.launcherWindow)
            return;
        this.launcherWindow.on("move", () => {
            if (this.launcherWindow) {
                const bounds = this.launcherWindow.getBounds();
                this.launcherPosition = { x: bounds.x, y: bounds.y };
                this.appState.settingsWindowHelper.reposition(bounds);
            }
        });
        this.launcherWindow.on("resize", () => {
            if (this.launcherWindow) {
                const bounds = this.launcherWindow.getBounds();
                this.launcherSize = { width: bounds.width, height: bounds.height };
                this.appState.settingsWindowHelper.reposition(bounds);
            }
        });
        this.launcherWindow.on("closed", () => {
            this.launcherWindow = null;
            // If launcher closes, we should probably quit app or close overlay
            if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
                this.overlayWindow.close();
            }
            this.overlayWindow = null;
            this.isWindowVisible = false;
        });
        // Listen for overlay close if independent closing acts as "Stop Meeting"
        if (this.overlayWindow) {
            this.overlayWindow.on("move", () => {
                if (!this.overlayWindow || this.overlayWindow.isDestroyed())
                    return;
                if (!this.overlayIsMaximized) {
                    this.overlayRestoreBounds = null;
                }
                this.broadcastWindowVisibilityState();
            });
            this.overlayWindow.on("resize", () => {
                if (!this.overlayWindow || this.overlayWindow.isDestroyed())
                    return;
                this.broadcastWindowVisibilityState();
            });
            this.overlayWindow.on("blur", () => {
                this.setOverlayTemporaryTopmost(false, 'blur');
            });
            this.overlayWindow.on('close', (e) => {
                // Prevent accidental closing via cmd+w if we want to enforce workflow? 
                // Or treat as end meeting. simpler to treat as hiding for now.
                if (this.isWindowVisible && this.overlayWindow?.isVisible()) {
                    e.preventDefault();
                    this.switchToLauncher();
                    // Notify backend meeting ended? Handled via IPC ideally.
                }
            });
        }
    }
    // Helper to get whichever window should be treated as "Main" for IPC
    getMainWindow() {
        if (this.currentWindowMode === 'overlay' && this.overlayWindow) {
            return this.overlayWindow;
        }
        return this.launcherWindow;
    }
    // Specific getters if needed
    getLauncherWindow() { return this.launcherWindow; }
    getOverlayWindow() { return this.overlayWindow; }
    getCurrentWindowMode() { return this.currentWindowMode; }
    isVisible() {
        return this.isWindowVisible;
    }
    hideMainWindow() {
        // Hide BOTH
        this.setOverlayTemporaryTopmost(false, 'hideMainWindow', { broadcast: false, log: false });
        this.launcherWindow?.hide();
        this.overlayWindow?.hide();
        this.isWindowVisible = false;
        this.broadcastWindowVisibilityState();
        this.logOverlayState('hideMainWindow');
    }
    showMainWindow() {
        // Show the window corresponding to the current mode
        if (this.currentWindowMode === 'overlay') {
            this.switchToOverlay();
        }
        else {
            this.switchToLauncher();
        }
    }
    toggleMainWindow() {
        if (this.isWindowVisible) {
            this.hideMainWindow();
        }
        else {
            this.showMainWindow();
        }
    }
    toggleOverlayWindow() {
        this.toggleMainWindow();
    }
    centerAndShowWindow() {
        // Default to launcher
        this.switchToLauncher();
        this.launcherWindow?.center();
    }
    // --- Swapping Logic ---
    switchToOverlay(options = {}) {
        console.log('[WindowHelper] Switching to OVERLAY');
        const { activateTemporarily = false } = options;
        this.currentWindowMode = 'overlay';
        this.setOverlayTemporaryTopmost(false, 'switchToOverlay:prepare', { broadcast: false, log: false });
        // Show Overlay FIRST
        if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
            if (this.overlayIsMaximized) {
                this.maximizeOverlayToWorkArea();
            }
            else {
                const workArea = this.getOverlayDisplayWorkArea();
                const currentBounds = this.overlayWindow.getBounds();
                const targetWidth = Math.max(currentBounds.width, DEFAULT_OVERLAY_WIDTH);
                const targetHeight = Math.max(currentBounds.height, DEFAULT_OVERLAY_HEIGHT);
                const x = Math.floor(workArea.x + (workArea.width - targetWidth) / 2);
                const y = Math.floor(workArea.y + (workArea.height - targetHeight) / 2);
                this.setOverlayBounds({ x, y, width: targetWidth, height: targetHeight });
            }
            if (process.platform === 'win32' && this.contentProtection) {
                // Opacity Shield: Show at 0 opacity first to prevent frame leak
                this.overlayWindow.setOpacity(0);
                this.overlayWindow.show();
                this.overlayWindow.setContentProtection(true);
                // Small delay to ensure Windows DWM processes the flag before making it opaque
                if (this.opacityTimeout)
                    clearTimeout(this.opacityTimeout);
                this.opacityTimeout = setTimeout(() => {
                    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
                        this.overlayWindow.setOpacity(1);
                        if (activateTemporarily) {
                            this.setOverlayTemporaryTopmost(true, 'switchToOverlay:delayed', { focusWindow: true, log: false });
                        }
                        else {
                            this.overlayWindow.focus();
                            if (!this.overlayWindow.webContents.isDestroyed()) {
                                this.overlayWindow.webContents.focus();
                            }
                        }
                    }
                }, 60);
            }
            else {
                this.overlayWindow.setContentProtection(this.contentProtection);
                this.overlayWindow.show();
                if (activateTemporarily) {
                    this.setOverlayTemporaryTopmost(true, 'switchToOverlay:show', { focusWindow: true, log: false });
                }
                else {
                    this.overlayWindow.focus();
                    if (!this.overlayWindow.webContents.isDestroyed()) {
                        this.overlayWindow.webContents.focus();
                    }
                }
            }
            this.isWindowVisible = true;
            this.broadcastWindowVisibilityState();
            this.logOverlayState('switchToOverlay');
        }
        // Hide Launcher SECOND
        if (this.launcherWindow && !this.launcherWindow.isDestroyed()) {
            this.launcherWindow.hide();
        }
    }
    switchToLauncher() {
        console.log('[WindowHelper] Switching to LAUNCHER');
        this.currentWindowMode = 'launcher';
        this.setOverlayTemporaryTopmost(false, 'switchToLauncher', { broadcast: false, log: false });
        // Show Launcher FIRST
        if (this.launcherWindow && !this.launcherWindow.isDestroyed()) {
            if (process.platform === 'win32' && this.contentProtection) {
                // Opacity Shield: Show at 0 opacity first
                this.launcherWindow.setOpacity(0);
                this.launcherWindow.show();
                this.launcherWindow.setContentProtection(true);
                if (this.opacityTimeout)
                    clearTimeout(this.opacityTimeout);
                this.opacityTimeout = setTimeout(() => {
                    if (this.launcherWindow && !this.launcherWindow.isDestroyed()) {
                        this.launcherWindow.setOpacity(1);
                        this.launcherWindow.focus();
                    }
                }, 60);
            }
            else {
                this.launcherWindow.setContentProtection(this.contentProtection);
                this.launcherWindow.show();
                this.launcherWindow.focus();
            }
            this.isWindowVisible = true;
        }
        // Hide Overlay SECOND
        if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
            this.overlayWindow.hide();
        }
        this.broadcastWindowVisibilityState();
        this.logOverlayState('switchToLauncher');
    }
    activateOverlayWindow() {
        if (!this.overlayWindow || this.overlayWindow.isDestroyed())
            return;
        if (!this.overlayWindow.isVisible()) {
            this.switchToOverlay({ activateTemporarily: true });
            return;
        }
        this.setOverlayTemporaryTopmost(true, 'activateOverlayWindow', { focusWindow: true });
    }
    // Simplified setWindowMode that just calls switchers
    setWindowMode(mode) {
        if (mode === 'launcher') {
            this.switchToLauncher();
        }
        else {
            this.switchToOverlay();
        }
    }
    // --- Window Movement (Applies to Overlay mostly, but generalized to active) ---
    moveActiveWindow(dx, dy) {
        const win = this.getMainWindow();
        if (!win)
            return;
        const [x, y] = win.getPosition();
        win.setPosition(x + dx, y + dy);
        this.currentX = x + dx;
        this.currentY = y + dy;
    }
    moveWindowRight() { this.moveActiveWindow(this.step, 0); }
    moveWindowLeft() { this.moveActiveWindow(-this.step, 0); }
    moveWindowDown() { this.moveActiveWindow(0, this.step); }
    moveWindowUp() { this.moveActiveWindow(0, -this.step); }
}
exports.WindowHelper = WindowHelper;
//# sourceMappingURL=WindowHelper.js.map