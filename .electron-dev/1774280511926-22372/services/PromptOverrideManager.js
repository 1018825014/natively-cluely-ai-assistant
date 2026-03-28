"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PromptOverrideManager = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const electron_1 = require("electron");
class PromptOverrideManager {
    static instance = null;
    overridesPath;
    overrides = {};
    loaded = false;
    constructor() {
        this.overridesPath = node_path_1.default.join(electron_1.app.getPath("userData"), "prompt-overrides.json");
    }
    static getInstance() {
        if (!PromptOverrideManager.instance) {
            PromptOverrideManager.instance = new PromptOverrideManager();
        }
        return PromptOverrideManager.instance;
    }
    getOverride(action, fieldKey) {
        this.ensureLoaded();
        const value = this.overrides[action]?.[fieldKey];
        return typeof value === "string" && value.trim().length > 0 ? value : null;
    }
    getAllOverrides() {
        this.ensureLoaded();
        return JSON.parse(JSON.stringify(this.overrides));
    }
    resolvePrompt(action, fieldKey, fallback) {
        return this.getOverride(action, fieldKey) ?? fallback;
    }
    setOverride(action, fieldKey, value) {
        this.ensureLoaded();
        const trimmed = value.trim();
        if (!trimmed) {
            this.resetOverride(action, fieldKey);
            return;
        }
        if (!this.overrides[action]) {
            this.overrides[action] = {};
        }
        this.overrides[action][fieldKey] = value;
        this.persist();
    }
    resetOverride(action, fieldKey) {
        this.ensureLoaded();
        if (!this.overrides[action])
            return;
        delete this.overrides[action][fieldKey];
        if (Object.keys(this.overrides[action] || {}).length === 0) {
            delete this.overrides[action];
        }
        this.persist();
    }
    ensureLoaded() {
        if (this.loaded)
            return;
        this.loaded = true;
        try {
            if (!node_fs_1.default.existsSync(this.overridesPath)) {
                this.overrides = {};
                return;
            }
            const raw = node_fs_1.default.readFileSync(this.overridesPath, "utf8");
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object") {
                this.overrides = parsed;
            }
        }
        catch (error) {
            console.warn("[PromptOverrideManager] Failed to load prompt overrides:", error);
            this.overrides = {};
        }
    }
    persist() {
        try {
            node_fs_1.default.mkdirSync(node_path_1.default.dirname(this.overridesPath), { recursive: true });
            node_fs_1.default.writeFileSync(this.overridesPath, JSON.stringify(this.overrides, null, 2), "utf8");
        }
        catch (error) {
            console.warn("[PromptOverrideManager] Failed to persist prompt overrides:", error);
        }
    }
}
exports.PromptOverrideManager = PromptOverrideManager;
//# sourceMappingURL=PromptOverrideManager.js.map
