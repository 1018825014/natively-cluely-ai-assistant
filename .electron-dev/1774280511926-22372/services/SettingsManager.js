"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsManager = void 0;
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
class SettingsManager {
    static instance;
    settings = {};
    settingsPath;
    constructor() {
        if (!electron_1.app.isReady()) {
            throw new Error('[SettingsManager] Cannot initialize before app.whenReady()');
        }
        this.settingsPath = path_1.default.join(electron_1.app.getPath('userData'), 'settings.json');
        this.loadSettings();
    }
    static getInstance() {
        if (!SettingsManager.instance) {
            SettingsManager.instance = new SettingsManager();
        }
        return SettingsManager.instance;
    }
    get(key) {
        return this.settings[key];
    }
    set(key, value) {
        this.settings[key] = value;
        this.saveSettings();
    }
    loadSettings() {
        try {
            if (fs_1.default.existsSync(this.settingsPath)) {
                const data = fs_1.default.readFileSync(this.settingsPath, 'utf8');
                try {
                    const parsed = JSON.parse(data);
                    // Minimal validation to ensure it's an object before assigning
                    if (typeof parsed === 'object' && parsed !== null) {
                        this.settings = parsed;
                        console.log('[SettingsManager] Settings loaded successfully:', JSON.stringify(this.settings));
                    }
                    else {
                        throw new Error('Settings JSON is not a valid object');
                    }
                }
                catch (parseError) {
                    console.error('[SettingsManager] Failed to parse settings.json. Continuing with empty settings. Error:', parseError);
                    this.settings = {};
                }
                console.log('[SettingsManager] Settings loaded');
            }
        }
        catch (e) {
            console.error('[SettingsManager] Failed to read settings file:', e);
            this.settings = {};
        }
    }
    saveSettings() {
        try {
            const tmpPath = this.settingsPath + '.tmp';
            fs_1.default.writeFileSync(tmpPath, JSON.stringify(this.settings, null, 2));
            fs_1.default.renameSync(tmpPath, this.settingsPath);
        }
        catch (e) {
            console.error('[SettingsManager] Failed to save settings:', e);
        }
    }
}
exports.SettingsManager = SettingsManager;
//# sourceMappingURL=SettingsManager.js.map
