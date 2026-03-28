"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.KeybindManager = exports.DEFAULT_KEYBINDS = void 0;
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
exports.DEFAULT_KEYBINDS = [
    // General
    { id: 'general:toggle-visibility', label: 'Show / Hide / Focus Window', accelerator: 'CommandOrControl+B', isGlobal: true, defaultAccelerator: 'CommandOrControl+B' },
    { id: 'general:process-screenshots', label: 'Process Screenshots', accelerator: 'CommandOrControl+Enter', isGlobal: false, defaultAccelerator: 'CommandOrControl+Enter' },
    { id: 'general:reset-cancel', label: 'Reset / Cancel', accelerator: 'CommandOrControl+R', isGlobal: false, defaultAccelerator: 'CommandOrControl+R' },
    { id: 'general:take-screenshot', label: 'Take Screenshot', accelerator: 'CommandOrControl+H', isGlobal: true, defaultAccelerator: 'CommandOrControl+H' },
    { id: 'general:selective-screenshot', label: 'Selective Screenshot', accelerator: 'CommandOrControl+Shift+H', isGlobal: true, defaultAccelerator: 'CommandOrControl+Shift+H' },
    // Chat - Window Local (Handled via Menu or Renderer logic, but centralized here)
    { id: 'chat:whatToAnswer', label: 'What to Answer', accelerator: 'CommandOrControl+1', isGlobal: false, defaultAccelerator: 'CommandOrControl+1' },
    { id: 'chat:shorten', label: 'Shorten', accelerator: 'CommandOrControl+2', isGlobal: false, defaultAccelerator: 'CommandOrControl+2' },
    { id: 'chat:followUp', label: 'Follow Up', accelerator: 'CommandOrControl+3', isGlobal: false, defaultAccelerator: 'CommandOrControl+3' },
    { id: 'chat:recap', label: 'Recap', accelerator: 'CommandOrControl+4', isGlobal: false, defaultAccelerator: 'CommandOrControl+4' },
    { id: 'chat:answer', label: 'Answer / Record', accelerator: 'CommandOrControl+5', isGlobal: false, defaultAccelerator: 'CommandOrControl+5' },
    { id: 'chat:scrollUp', label: 'Scroll Up', accelerator: 'CommandOrControl+Up', isGlobal: false, defaultAccelerator: 'CommandOrControl+Up' },
    { id: 'chat:scrollDown', label: 'Scroll Down', accelerator: 'CommandOrControl+Down', isGlobal: false, defaultAccelerator: 'CommandOrControl+Down' },
    // Window Movement
    { id: 'window:move-up', label: 'Move Window Up', accelerator: 'CommandOrControl+Up', isGlobal: false, defaultAccelerator: 'CommandOrControl+Up' },
    { id: 'window:move-down', label: 'Move Window Down', accelerator: 'CommandOrControl+Down', isGlobal: false, defaultAccelerator: 'CommandOrControl+Down' },
    { id: 'window:move-left', label: 'Move Window Left', accelerator: 'CommandOrControl+Left', isGlobal: false, defaultAccelerator: 'CommandOrControl+Left' },
    { id: 'window:move-right', label: 'Move Window Right', accelerator: 'CommandOrControl+Right', isGlobal: false, defaultAccelerator: 'CommandOrControl+Right' },
];
class KeybindManager {
    static instance;
    keybinds = new Map();
    filePath;
    windowHelper; // Type avoided for circular dep, passed in init
    onUpdateCallbacks = [];
    onShortcutTriggeredCallbacks = [];
    constructor() {
        this.filePath = path_1.default.join(electron_1.app.getPath('userData'), 'keybinds.json');
        this.load();
    }
    onUpdate(callback) {
        this.onUpdateCallbacks.push(callback);
    }
    onShortcutTriggered(callback) {
        this.onShortcutTriggeredCallbacks.push(callback);
    }
    static getInstance() {
        if (!KeybindManager.instance) {
            KeybindManager.instance = new KeybindManager();
        }
        return KeybindManager.instance;
    }
    setWindowHelper(windowHelper) {
        this.windowHelper = windowHelper;
        // Re-register globals now that we have the helper
        this.registerGlobalShortcuts();
    }
    load() {
        // 1. Load Defaults
        exports.DEFAULT_KEYBINDS.forEach(kb => this.keybinds.set(kb.id, { ...kb }));
        // 2. Load Overrides
        try {
            if (fs_1.default.existsSync(this.filePath)) {
                const data = JSON.parse(fs_1.default.readFileSync(this.filePath, 'utf-8'));
                // Validate and merge
                for (const fileKb of data) {
                    if (this.keybinds.has(fileKb.id)) {
                        const current = this.keybinds.get(fileKb.id);
                        current.accelerator = fileKb.accelerator;
                        this.keybinds.set(fileKb.id, current);
                    }
                }
            }
        }
        catch (error) {
            console.error('[KeybindManager] Failed to load keybinds:', error);
        }
    }
    save() {
        try {
            const data = Array.from(this.keybinds.values()).map(kb => ({
                id: kb.id,
                accelerator: kb.accelerator
            }));
            const tmpPath = this.filePath + '.tmp';
            fs_1.default.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
            fs_1.default.renameSync(tmpPath, this.filePath);
        }
        catch (error) {
            console.error('[KeybindManager] Failed to save keybinds:', error);
        }
    }
    getKeybind(id) {
        return this.keybinds.get(id)?.accelerator;
    }
    getAllKeybinds() {
        return Array.from(this.keybinds.values());
    }
    setKeybind(id, accelerator) {
        if (!this.keybinds.has(id))
            return;
        const kb = this.keybinds.get(id);
        kb.accelerator = accelerator;
        this.keybinds.set(id, kb);
        this.save();
        this.registerGlobalShortcuts(); // Re-register if it was a global one
        this.broadcastUpdate();
    }
    resetKeybinds() {
        this.keybinds.clear();
        exports.DEFAULT_KEYBINDS.forEach(kb => this.keybinds.set(kb.id, { ...kb }));
        this.save();
        this.registerGlobalShortcuts();
        this.broadcastUpdate();
    }
    registerGlobalShortcuts() {
        electron_1.globalShortcut.unregisterAll();
        // Register global shortcuts
        this.keybinds.forEach(kb => {
            if (kb.isGlobal && kb.accelerator && kb.accelerator.trim() !== '') {
                try {
                    electron_1.globalShortcut.register(kb.accelerator, () => {
                        this.onShortcutTriggeredCallbacks.forEach(cb => cb(kb.id));
                    });
                }
                catch (e) {
                    console.error(`[KeybindManager] Failed to register global shortcut ${kb.accelerator}:`, e);
                }
            }
        });
        this.updateMenu();
    }
    updateMenu() {
        const toggleKb = this.keybinds.get('general:toggle-visibility');
        const toggleAccelerator = toggleKb ? toggleKb.accelerator : 'CommandOrControl+B';
        const template = [
            {
                label: electron_1.app.name,
                submenu: [
                    { role: 'about' },
                    { type: 'separator' },
                    { role: 'services' },
                    { type: 'separator' },
                    { role: 'hide', accelerator: 'CommandOrControl+Option+H' },
                    { role: 'hideOthers', accelerator: 'CommandOrControl+Option+Shift+H' },
                    { role: 'unhide' },
                    { type: 'separator' },
                    { role: 'quit' }
                ]
            },
            {
                role: 'editMenu'
            },
            {
                label: 'View',
                submenu: [
                    {
                        label: 'Show / Hide / Focus Window',
                        accelerator: toggleAccelerator,
                        click: () => {
                            // Require AppState dynamically to avoid circular dependencies
                            const { AppState } = require('../main');
                            AppState.getInstance().toggleMainWindow();
                        }
                    },
                    { type: 'separator' },
                    {
                        label: 'Move Window Up',
                        accelerator: this.getKeybind('window:move-up') || 'CommandOrControl+Up',
                        click: () => this.windowHelper?.moveWindowUp()
                    },
                    {
                        label: 'Move Window Down',
                        accelerator: this.getKeybind('window:move-down') || 'CommandOrControl+Down',
                        click: () => this.windowHelper?.moveWindowDown()
                    },
                    {
                        label: 'Move Window Left',
                        accelerator: this.getKeybind('window:move-left') || 'CommandOrControl+Left',
                        click: () => this.windowHelper?.moveWindowLeft()
                    },
                    {
                        label: 'Move Window Right',
                        accelerator: this.getKeybind('window:move-right') || 'CommandOrControl+Right',
                        click: () => this.windowHelper?.moveWindowRight()
                    },
                    { type: 'separator' },
                    { role: 'reload' },
                    { role: 'forceReload' },
                    { role: 'toggleDevTools' },
                    { type: 'separator' },
                    { role: 'resetZoom' },
                    { role: 'zoomIn' },
                    { role: 'zoomOut' },
                    { type: 'separator' },
                    { role: 'togglefullscreen' }
                ]
            },
            {
                role: 'windowMenu'
            },
            {
                role: 'help',
                submenu: [
                    {
                        label: 'Learn More',
                        click: async () => {
                            const { shell } = require('electron');
                            await shell.openExternal('https://electronjs.org');
                        }
                    }
                ]
            }
        ];
        const menu = electron_1.Menu.buildFromTemplate(template);
        electron_1.Menu.setApplicationMenu(menu);
        console.log('[KeybindManager] Application menu updated');
    }
    broadcastUpdate() {
        // Notify main process listeners
        this.onUpdateCallbacks.forEach(cb => cb());
        const windows = electron_1.BrowserWindow.getAllWindows();
        const allKeybinds = this.getAllKeybinds();
        windows.forEach(win => {
            if (!win.isDestroyed()) {
                win.webContents.send('keybinds:update', allKeybinds);
            }
        });
    }
    setupIpcHandlers() {
        electron_1.ipcMain.handle('keybinds:get-all', () => {
            return this.getAllKeybinds();
        });
        electron_1.ipcMain.handle('keybinds:set', (_, id, accelerator) => {
            console.log(`[KeybindManager] Set ${id} -> ${accelerator}`);
            this.setKeybind(id, accelerator);
            return true;
        });
        electron_1.ipcMain.handle('keybinds:reset', () => {
            console.log('[KeybindManager] Reset defaults');
            this.resetKeybinds();
            return this.getAllKeybinds();
        });
    }
}
exports.KeybindManager = KeybindManager;
//# sourceMappingURL=KeybindManager.js.map