import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

export type PromptLabActionId =
  | "what_to_answer"
  | "follow_up_refine"
  | "recap"
  | "follow_up_questions"
  | "answer";

export type PromptLabFixedFieldKey = "system_prompt" | "voice_prompt" | "image_prompt";

type PromptOverrideStore = Partial<Record<PromptLabActionId, Partial<Record<PromptLabFixedFieldKey, string>>>>;

export class PromptOverrideManager {
  private static instance: PromptOverrideManager | null = null;

  private readonly overridesPath: string;
  private overrides: PromptOverrideStore = {};
  private loaded = false;

  private constructor() {
    this.overridesPath = path.join(app.getPath("userData"), "prompt-overrides.json");
  }

  public static getInstance(): PromptOverrideManager {
    if (!PromptOverrideManager.instance) {
      PromptOverrideManager.instance = new PromptOverrideManager();
    }

    return PromptOverrideManager.instance;
  }

  public getOverride(action: PromptLabActionId, fieldKey: PromptLabFixedFieldKey): string | null {
    this.ensureLoaded();
    const value = this.overrides[action]?.[fieldKey];
    return typeof value === "string" && value.trim().length > 0 ? value : null;
  }

  public getAllOverrides(): PromptOverrideStore {
    this.ensureLoaded();
    return JSON.parse(JSON.stringify(this.overrides));
  }

  public resolvePrompt(action: PromptLabActionId, fieldKey: PromptLabFixedFieldKey, fallback: string): string {
    return this.getOverride(action, fieldKey) ?? fallback;
  }

  public setOverride(action: PromptLabActionId, fieldKey: PromptLabFixedFieldKey, value: string): void {
    this.ensureLoaded();
    const trimmed = value.trim();

    if (!trimmed) {
      this.resetOverride(action, fieldKey);
      return;
    }

    if (!this.overrides[action]) {
      this.overrides[action] = {};
    }

    this.overrides[action]![fieldKey] = value;
    this.persist();
  }

  public resetOverride(action: PromptLabActionId, fieldKey: PromptLabFixedFieldKey): void {
    this.ensureLoaded();

    if (!this.overrides[action]) return;

    delete this.overrides[action]![fieldKey];
    if (Object.keys(this.overrides[action] || {}).length === 0) {
      delete this.overrides[action];
    }

    this.persist();
  }

  private ensureLoaded(): void {
    if (this.loaded) return;
    this.loaded = true;

    try {
      if (!fs.existsSync(this.overridesPath)) {
        this.overrides = {};
        return;
      }

      const raw = fs.readFileSync(this.overridesPath, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        this.overrides = parsed;
      }
    } catch (error) {
      console.warn("[PromptOverrideManager] Failed to load prompt overrides:", error);
      this.overrides = {};
    }
  }

  private persist(): void {
    try {
      fs.mkdirSync(path.dirname(this.overridesPath), { recursive: true });
      fs.writeFileSync(this.overridesPath, JSON.stringify(this.overrides, null, 2), "utf8");
    } catch (error) {
      console.warn("[PromptOverrideManager] Failed to persist prompt overrides:", error);
    }
  }
}
