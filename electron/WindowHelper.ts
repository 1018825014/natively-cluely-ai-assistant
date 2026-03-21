
import { BrowserWindow, screen, app } from "electron"
import { AppState } from "./main"
import path from "node:path"

const isEnvDev = process.env.NODE_ENV === "development"
const isPackaged = app.isPackaged;
const inAppBundle = process.execPath.includes('.app/') || process.execPath.includes('.app\\');

console.log(`[WindowHelper] isEnvDev: ${isEnvDev}, isPackaged: ${isPackaged}, inAppBundle: ${inAppBundle}`);

// Force production mode if running as packaged app or inside app bundle
const isDev = isEnvDev && !isPackaged;

const DEFAULT_OVERLAY_WIDTH = 1080;
const DEFAULT_OVERLAY_HEIGHT = 760;
const MIN_OVERLAY_WIDTH = 860;
const MIN_OVERLAY_HEIGHT = 600;

const startUrl = isDev
  ? "http://localhost:5180"
  : `file://${path.join(__dirname, "../../dist/index.html")}`

export class WindowHelper {
  private launcherWindow: BrowserWindow | null = null
  private overlayWindow: BrowserWindow | null = null
  private isWindowVisible: boolean = false
  // Position/Size tracking for Launcher
  private launcherPosition: { x: number; y: number } | null = null
  private launcherSize: { width: number; height: number } | null = null
  // Track current window mode (persists even when overlay is hidden via Cmd+B)
  private currentWindowMode: 'launcher' | 'overlay' = 'launcher'

  private appState: AppState
  private contentProtection: boolean = false
  private opacityTimeout: NodeJS.Timeout | null = null
  private overlayTopmostHeartbeat: NodeJS.Timeout | null = null

  // Initialize with explicit number type and 0 value
  private screenWidth: number = 0
  private screenHeight: number = 0

  // Movement variables (apply to active window)
  private step: number = 20
  private currentX: number = 0
  private currentY: number = 0

  constructor(appState: AppState) {
    this.appState = appState
  }

  private getOverlayAlwaysOnTopLevel(): 'floating' | 'screen-saver' {
    return process.platform === 'win32' ? 'screen-saver' : 'floating'
  }

  public getOverlayWindowState(): {
    visible: boolean
    mode: 'launcher' | 'overlay'
    overlayVisible: boolean
    launcherVisible: boolean
    overlayAlwaysOnTop: boolean
    overlayFocused: boolean
  } {
    return {
      visible: this.isWindowVisible,
      mode: this.currentWindowMode,
      overlayVisible: !!(this.overlayWindow && !this.overlayWindow.isDestroyed() && this.overlayWindow.isVisible()),
      launcherVisible: !!(this.launcherWindow && !this.launcherWindow.isDestroyed() && this.launcherWindow.isVisible()),
      overlayAlwaysOnTop: !!(this.overlayWindow && !this.overlayWindow.isDestroyed() && this.overlayWindow.isAlwaysOnTop()),
      overlayFocused: !!(this.overlayWindow && !this.overlayWindow.isDestroyed() && this.overlayWindow.isFocused())
    }
  }

  private broadcastWindowVisibilityState(): void {
    const payload = this.getOverlayWindowState()
    ;[this.launcherWindow, this.overlayWindow].forEach((win) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('window-visibility-changed', payload)
      }
    })
  }

  private logOverlayState(context: string): void {
    console.log(`[WindowHelper] ${context}:`, JSON.stringify(this.getOverlayWindowState()))
  }

  private stopOverlayTopmostHeartbeat(): void {
    if (this.overlayTopmostHeartbeat) {
      clearInterval(this.overlayTopmostHeartbeat)
      this.overlayTopmostHeartbeat = null
    }
  }

  private startOverlayTopmostHeartbeat(): void {
    this.stopOverlayTopmostHeartbeat()

    if (process.platform !== 'win32') return

    this.overlayTopmostHeartbeat = setInterval(() => {
      if (!this.overlayWindow || this.overlayWindow.isDestroyed()) return
      if (!this.isWindowVisible || this.currentWindowMode !== 'overlay' || !this.overlayWindow.isVisible()) return

      this.reinforceOverlayTopmost('heartbeat', false)
    }, 1500)
  }

  private reinforceOverlayTopmost(context: string, focusWindow: boolean): void {
    if (!this.overlayWindow || this.overlayWindow.isDestroyed()) return

    const level = this.getOverlayAlwaysOnTopLevel()
    this.overlayWindow.setAlwaysOnTop(true, level)
    this.overlayWindow.moveTop()

    if (focusWindow) {
      this.overlayWindow.focus()
      if (!this.overlayWindow.webContents.isDestroyed()) {
        this.overlayWindow.webContents.focus()
      }
    }

    this.logOverlayState(`reinforceOverlayTopmost:${context}`)
  }

  public setContentProtection(enable: boolean): void {
    this.contentProtection = enable
    this.applyContentProtection(enable)
  }

  private applyContentProtection(enable: boolean): void {
    const windows = [this.launcherWindow, this.overlayWindow]
    windows.forEach(win => {
      if (win && !win.isDestroyed()) {
        win.setContentProtection(enable);
      }
    });
  }

  public setWindowDimensions(width: number, height: number): void {
    const activeWindow = this.getMainWindow(); // Gets currently focused/relevant window
    if (!activeWindow || activeWindow.isDestroyed()) return

    const [currentX, currentY] = activeWindow.getPosition()
    const primaryDisplay = screen.getPrimaryDisplay()
    const workArea = primaryDisplay.workAreaSize
    const maxAllowedWidth = Math.floor(workArea.width * 0.9)
    const newWidth = Math.min(width, maxAllowedWidth)
    const newHeight = Math.ceil(height)
    const maxX = workArea.width - newWidth
    const newX = Math.min(Math.max(currentX, 0), maxX)

    activeWindow.setBounds({
      x: newX,
      y: currentY,
      width: newWidth,
      height: newHeight
    })

    // Update internal tracking if it's launcher
    if (activeWindow === this.launcherWindow) {
      this.launcherSize = { width: newWidth, height: newHeight }
      this.launcherPosition = { x: newX, y: currentY }
    }
  }

  // Dedicated method for overlay window resizing - decoupled from launcher
  public setOverlayDimensions(width: number, height: number): void {
    if (!this.overlayWindow || this.overlayWindow.isDestroyed()) return
    console.log('[WindowHelper] setOverlayDimensions:', width, height);

    const [currentX, currentY] = this.overlayWindow.getPosition()
    this.setOverlayBounds({ x: currentX, y: currentY, width, height })
  }

  public setOverlayBounds(bounds: { x: number; y: number; width: number; height: number }): void {
    if (!this.overlayWindow || this.overlayWindow.isDestroyed()) return

    const primaryDisplay = screen.getPrimaryDisplay()
    const workArea = primaryDisplay.workArea
    const maxAllowedWidth = Math.floor(workArea.width * 0.9)
    const maxAllowedHeight = Math.floor(workArea.height * 0.9)
    const newWidth = Math.min(Math.max(bounds.width, MIN_OVERLAY_WIDTH), maxAllowedWidth)
    const newHeight = Math.min(Math.max(bounds.height, MIN_OVERLAY_HEIGHT), maxAllowedHeight)
    const maxX = workArea.x + workArea.width - newWidth
    const maxY = workArea.y + workArea.height - newHeight
    const newX = Math.min(Math.max(bounds.x, workArea.x), maxX)
    const newY = Math.min(Math.max(bounds.y, workArea.y), maxY)

    this.overlayWindow.setBounds({
      x: Math.round(newX),
      y: Math.round(newY),
      width: Math.round(newWidth),
      height: Math.round(newHeight)
    })
  }

  public createWindow(): void {
    if (this.launcherWindow !== null) return // Already created

    const primaryDisplay = screen.getPrimaryDisplay()
    const workArea = primaryDisplay.workArea
    this.screenWidth = workArea.width
    this.screenHeight = workArea.height

    // Fixed dimensions per user request
    const width = 1200;
    const height = 800;

    // Calculate centered X, and top-centered Y (5% from top)
    const x = Math.round(workArea.x + (workArea.width - width) / 2);
    // Ensure y is at least workArea.y (don't go offscreen top)
    const topMargin = Math.round(workArea.height * 0.05);
    const y = Math.round(workArea.y + topMargin);

    // --- 1. Create Launcher Window ---
    const launcherSettings: Electron.BrowserWindowConstructorOptions = {
      width: width,
      height: height,
      x: x,
      y: y,
      minWidth: 600,
      minHeight: 400,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, "preload.js"),
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
            return app.isPackaged
              ? path.join(process.resourcesPath, "natively.icns")
              : path.resolve(__dirname, "../../assets/natively.icns");
          } else if (isWin) {
            return app.isPackaged
              ? path.join(process.resourcesPath, "assets/icons/win/icon.ico")
              : path.resolve(__dirname, "../../assets/icons/win/icon.ico");
          } else {
            return app.isPackaged
              ? path.join(process.resourcesPath, "icon.png")
              : path.resolve(__dirname, "../../assets/icon.png");
          }
        }

        // Disguise mode icons
        let iconName = "terminal.png";
        if (mode === 'settings') iconName = "settings.png";
        if (mode === 'activity') iconName = "activity.png";

        const platformDir = isWin ? "win" : "mac";
        return app.isPackaged
          ? path.join(process.resourcesPath, `assets/fakeicon/${platformDir}/${iconName}`)
          : path.resolve(__dirname, `../../assets/fakeicon/${platformDir}/${iconName}`);
      })()
    }

    console.log(`[WindowHelper] Icon Path: ${launcherSettings.icon}`);
    console.log(`[WindowHelper] Start URL: ${startUrl}`);

    try {
      this.launcherWindow = new BrowserWindow(launcherSettings)
      console.log('[WindowHelper] BrowserWindow created successfully');
    } catch (err) {
      console.error('[WindowHelper] Failed to create BrowserWindow:', err);
      return;
    }

    this.launcherWindow.setContentProtection(this.contentProtection)

    this.launcherWindow.loadURL(`${startUrl}?window=launcher`)
      .then(() => console.log('[WindowHelper] loadURL success'))
      .catch((e) => { console.error("[WindowHelper] Failed to load URL:", e) })

    this.launcherWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.error(`[WindowHelper] did-fail-load: ${errorCode} ${errorDescription}`);
    });

    // if (isDev) {
    //   this.launcherWindow.webContents.openDevTools({ mode: 'detach' }); // DEBUG: Open DevTools
    // }

    // --- 2. Create Overlay Window (Hidden initially) ---
    const overlaySettings: Electron.BrowserWindowConstructorOptions = {
      width: DEFAULT_OVERLAY_WIDTH,
      height: DEFAULT_OVERLAY_HEIGHT,
      minWidth: MIN_OVERLAY_WIDTH,
      minHeight: MIN_OVERLAY_HEIGHT,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, "preload.js"),
        scrollBounce: true,
      },
      show: false,
      frame: false, // Frameless
      transparent: true,
      backgroundColor: "#00000000",
      alwaysOnTop: true,
      focusable: true,
      resizable: false, // Enforce automatic resizing only
      movable: true,
      skipTaskbar: true, // Don't show separately in dock/taskbar
      hasShadow: false, // Prevent shadow from adding perceived size/artifacts
    }

    this.overlayWindow = new BrowserWindow(overlaySettings)
    this.overlayWindow.setContentProtection(this.contentProtection)
    this.overlayWindow.setAlwaysOnTop(true, this.getOverlayAlwaysOnTopLevel())

    if (process.platform === "darwin") {
      this.overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
      this.overlayWindow.setHiddenInMissionControl(true)
    }

    this.overlayWindow.loadURL(`${startUrl}?window=overlay`).catch(e => {
        console.error('[WindowHelper] Failed to load Overlay URL:', e);
    })

    // --- 3. Startup Sequence ---
    this.launcherWindow.once('ready-to-show', () => {
      this.switchToLauncher()
      this.isWindowVisible = true
    })

    this.setupWindowListeners()
  }

  private setupWindowListeners(): void {
    if (!this.launcherWindow) return

    this.launcherWindow.on("move", () => {
      if (this.launcherWindow) {
        const bounds = this.launcherWindow.getBounds()
        this.launcherPosition = { x: bounds.x, y: bounds.y }
        this.appState.settingsWindowHelper.reposition(bounds)
      }
    })

    this.launcherWindow.on("resize", () => {
      if (this.launcherWindow) {
        const bounds = this.launcherWindow.getBounds()
        this.launcherSize = { width: bounds.width, height: bounds.height }
        this.appState.settingsWindowHelper.reposition(bounds)
      }
    })

    this.launcherWindow.on("closed", () => {
      this.launcherWindow = null
      // If launcher closes, we should probably quit app or close overlay
      if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
        this.overlayWindow.close()
      }
      this.overlayWindow = null
      this.isWindowVisible = false
    })

    // Listen for overlay close if independent closing acts as "Stop Meeting"
    if (this.overlayWindow) {
      this.overlayWindow.on('close', (e) => {
        // Prevent accidental closing via cmd+w if we want to enforce workflow? 
        // Or treat as end meeting. simpler to treat as hiding for now.
        if (this.isWindowVisible && this.overlayWindow?.isVisible()) {
          e.preventDefault();
          this.switchToLauncher();
          // Notify backend meeting ended? Handled via IPC ideally.
        }
      })
    }
  }

  // Helper to get whichever window should be treated as "Main" for IPC
  public getMainWindow(): BrowserWindow | null {
    if (this.currentWindowMode === 'overlay' && this.overlayWindow) {
      return this.overlayWindow;
    }
    return this.launcherWindow;
  }

  // Specific getters if needed
  public getLauncherWindow(): BrowserWindow | null { return this.launcherWindow }
  public getOverlayWindow(): BrowserWindow | null { return this.overlayWindow }
  public getCurrentWindowMode(): 'launcher' | 'overlay' { return this.currentWindowMode }

  public isVisible(): boolean {
    return this.isWindowVisible
  }

  public hideMainWindow(): void {
    // Hide BOTH
    this.stopOverlayTopmostHeartbeat()
    this.launcherWindow?.hide()
    this.overlayWindow?.hide()
    this.isWindowVisible = false
    this.broadcastWindowVisibilityState()
    this.logOverlayState('hideMainWindow')
  }

  public showMainWindow(): void {
    // Show the window corresponding to the current mode
    if (this.currentWindowMode === 'overlay') {
      this.switchToOverlay();
    } else {
      this.switchToLauncher();
    }
  }

  public toggleMainWindow(): void {
    if (this.isWindowVisible) {
      this.hideMainWindow()
    } else {
      this.showMainWindow()
    }
  }

  public toggleOverlayWindow(): void {
    this.toggleMainWindow();
  }

  public centerAndShowWindow(): void {
    // Default to launcher
    this.switchToLauncher();
    this.launcherWindow?.center();
  }

  // --- Swapping Logic ---

  public switchToOverlay(): void {
    console.log('[WindowHelper] Switching to OVERLAY');
    this.currentWindowMode = 'overlay';

    // Show Overlay FIRST
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      // Reset overlay position to center or last known? 
      // For now, center it nicely
      const primaryDisplay = screen.getPrimaryDisplay()
      const workArea = primaryDisplay.workArea;
      const currentBounds = this.overlayWindow.getBounds();
      const targetWidth = Math.max(currentBounds.width, DEFAULT_OVERLAY_WIDTH);
      const targetHeight = Math.max(currentBounds.height, DEFAULT_OVERLAY_HEIGHT);
      const x = Math.floor(workArea.x + (workArea.width - targetWidth) / 2)
      const y = Math.floor(workArea.y + (workArea.height - targetHeight) / 2)

      this.setOverlayBounds({ x, y, width: targetWidth, height: targetHeight });

      if (process.platform === 'win32' && this.contentProtection) {
        // Opacity Shield: Show at 0 opacity first to prevent frame leak
        this.overlayWindow.setOpacity(0);
        this.overlayWindow.show();
        this.overlayWindow.setContentProtection(true);
        this.reinforceOverlayTopmost('switchToOverlay:show', false)
        // Small delay to ensure Windows DWM processes the flag before making it opaque
        
        if (this.opacityTimeout) clearTimeout(this.opacityTimeout);
        this.opacityTimeout = setTimeout(() => {
          if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
            this.overlayWindow.setOpacity(1);
            this.reinforceOverlayTopmost('switchToOverlay:delayed', true)
          }
        }, 60);
      } else {
        this.overlayWindow.setContentProtection(this.contentProtection);
        this.overlayWindow.show();
        this.reinforceOverlayTopmost('switchToOverlay:show', true)
      }
      this.isWindowVisible = true;
      this.startOverlayTopmostHeartbeat()
      this.broadcastWindowVisibilityState()
      this.logOverlayState('switchToOverlay')
    }

    // Hide Launcher SECOND
    if (this.launcherWindow && !this.launcherWindow.isDestroyed()) {
      this.launcherWindow.hide();
    }
  }

  public switchToLauncher(): void {
    console.log('[WindowHelper] Switching to LAUNCHER');
    this.currentWindowMode = 'launcher';
    this.stopOverlayTopmostHeartbeat()

    // Show Launcher FIRST
    if (this.launcherWindow && !this.launcherWindow.isDestroyed()) {
      if (process.platform === 'win32' && this.contentProtection) {
        // Opacity Shield: Show at 0 opacity first
        this.launcherWindow.setOpacity(0);
        this.launcherWindow.show();
        this.launcherWindow.setContentProtection(true);
        
        if (this.opacityTimeout) clearTimeout(this.opacityTimeout);
        this.opacityTimeout = setTimeout(() => {
          if (this.launcherWindow && !this.launcherWindow.isDestroyed()) {
            this.launcherWindow.setOpacity(1);
            this.launcherWindow.focus();
          }
        }, 60);
      } else {
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

    this.broadcastWindowVisibilityState()
    this.logOverlayState('switchToLauncher')
  }

  // Simplified setWindowMode that just calls switchers
  public setWindowMode(mode: 'launcher' | 'overlay'): void {
    if (mode === 'launcher') {
      this.switchToLauncher();
    } else {
      this.switchToOverlay();
    }
  }

  // --- Window Movement (Applies to Overlay mostly, but generalized to active) ---
  private moveActiveWindow(dx: number, dy: number): void {
    const win = this.getMainWindow();
    if (!win) return;

    const [x, y] = win.getPosition();
    win.setPosition(x + dx, y + dy);

    this.currentX = x + dx;
    this.currentY = y + dy;
  }

  public moveWindowRight(): void { this.moveActiveWindow(this.step, 0) }
  public moveWindowLeft(): void { this.moveActiveWindow(-this.step, 0) }
  public moveWindowDown(): void { this.moveActiveWindow(0, this.step) }
  public moveWindowUp(): void { this.moveActiveWindow(0, -this.step) }
}
