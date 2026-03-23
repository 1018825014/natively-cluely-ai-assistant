import React, { useEffect, useMemo, useState } from "react";
import { Braces, Check, Copy, RefreshCw, RotateCcw } from "lucide-react";

type PromptLabActionId =
  | "what_to_answer"
  | "follow_up_refine"
  | "recap"
  | "follow_up_questions"
  | "answer";

type PromptLabFieldKind = "fixed" | "dynamic" | "runtime" | "transcript";

type PromptLabFieldPreview = {
  key: string;
  label: string;
  kind: PromptLabFieldKind;
  editable: boolean;
  scope: "fixed" | "meeting" | "runtime" | "transcript";
  text: string;
  baseText: string;
  charCount: number;
  summaryStart: string;
  summaryEnd: string;
  overrideActive: boolean;
  description?: string;
};

type PromptLabActionPreview = {
  action: PromptLabActionId;
  title: string;
  fixedPromptBase: string;
  fixedPromptResolved: string;
  fixedFields: PromptLabFieldPreview[];
  dynamicFields: PromptLabFieldPreview[];
  runtimeFields: PromptLabFieldPreview[];
  transcriptSummaries: Array<unknown>;
  hasUserOverrides: boolean;
  execution: {
    systemPrompt?: string;
    contextPrompt?: string;
    message?: string;
    imagePaths: string[];
    runtime: Record<string, unknown>;
  };
};

type PromptLabEntry = PromptLabFieldPreview & {
  entryId: string;
  groupLabel: string;
};

type SaveState = "idle" | "pending" | "saving" | "saved" | "error";

const ACTIONS: Array<{ id: PromptLabActionId; label: string; description: string }> = [
  { id: "what_to_answer", label: "怎么回答", description: "预览下一次“怎么回答”请求的输入。" },
  { id: "follow_up_refine", label: "精简润色", description: "预览追问精简时使用的输入。" },
  { id: "recap", label: "总结", description: "预览总结动作使用的提示词输入。" },
  { id: "follow_up_questions", label: "追问建议", description: "预览下一次追问建议请求的输入。" },
  { id: "answer", label: "作答", description: "预览底部“作答”动作使用的参数。" },
];

const SAVE_STATE_LABELS: Record<SaveState, string> = {
  idle: "未修改",
  pending: "等待保存",
  saving: "保存中",
  saved: "已保存",
  error: "保存失败",
};

const getInitialAction = (): PromptLabActionId => {
  const action = new URLSearchParams(window.location.search).get("action");
  if (action && ACTIONS.some(item => item.id === action)) {
    return action as PromptLabActionId;
  }

  return "what_to_answer";
};

const buildEntries = (preview: PromptLabActionPreview | null): PromptLabEntry[] => {
  if (!preview) return [];

  const fixedEntries = preview.fixedFields.map(field => ({
    ...field,
    entryId: `fixed:${field.key}`,
    groupLabel: "固定",
  }));
  const dynamicEntries = preview.dynamicFields.map(field => ({
    ...field,
    entryId: `dynamic:${field.key}`,
    groupLabel: "动态",
  }));
  const runtimeEntries = preview.runtimeFields.map(field => ({
    ...field,
    entryId: `${field.kind}:${field.key}`,
    groupLabel: field.kind === "transcript" ? "转写" : "运行时",
  }));

  return [...fixedEntries, ...dynamicEntries, ...runtimeEntries];
};

const renderScopeLabel = (entry: PromptLabEntry) => {
  if (entry.scope === "fixed") return "长期";
  if (entry.scope === "meeting") return "会议级";
  if (entry.scope === "transcript") return "转写";
  return "运行时";
};

const renderKindLabel = (kind: PromptLabFieldKind) => {
  if (kind === "fixed") return "固定";
  if (kind === "dynamic") return "动态";
  if (kind === "transcript") return "转写";
  return "运行时";
};

export default function PromptLabWindow() {
  const [currentAction, setCurrentAction] = useState<PromptLabActionId>(getInitialAction);
  const [preview, setPreview] = useState<PromptLabActionPreview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [editorValue, setEditorValue] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [copied, setCopied] = useState(false);

  const entries = useMemo(() => buildEntries(preview), [preview]);
  const selectedEntry = useMemo(
    () => entries.find(entry => entry.entryId === selectedEntryId) || entries[0] || null,
    [entries, selectedEntryId]
  );

  const loadPreview = async (action: PromptLabActionId) => {
    if (!window.electronAPI?.getPromptLabActionPreview) return;
    setIsLoading(true);
    setError("");

    try {
      const nextPreview = await window.electronAPI.getPromptLabActionPreview(action);
      setPreview(nextPreview);
    } catch (loadError) {
      console.error("[PromptLabWindow] Failed to load action preview:", loadError);
      setError(loadError instanceof Error ? loadError.message : "加载动作预览失败");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadPreview(currentAction);
  }, [currentAction]);

  useEffect(() => {
    if (!window.electronAPI?.onPromptLabFocusAction) return;

    return window.electronAPI.onPromptLabFocusAction((action) => {
      setCurrentAction(action);
    });
  }, []);

  useEffect(() => {
    if (!entries.length) {
      setSelectedEntryId(null);
      return;
    }

    const exists = selectedEntryId && entries.some(entry => entry.entryId === selectedEntryId);
    if (!exists) {
      setSelectedEntryId(entries[0].entryId);
    }
  }, [entries, selectedEntryId]);

  useEffect(() => {
    if (!selectedEntry) {
      setEditorValue("");
      return;
    }

    setEditorValue(selectedEntry.text);
    setSaveState("idle");
  }, [selectedEntry?.entryId, selectedEntry?.text]);

  useEffect(() => {
    if (!selectedEntry?.editable) return;
    if (editorValue === selectedEntry.text) return;

    setSaveState("pending");
    const timeoutId = window.setTimeout(async () => {
      try {
        setSaveState("saving");

        if (selectedEntry.scope === "fixed") {
          await window.electronAPI?.setPromptLabFixedOverride?.({
            action: currentAction,
            fieldKey: selectedEntry.key,
            value: editorValue,
          });
        } else {
          await window.electronAPI?.setPromptLabDynamicOverride?.({
            action: currentAction,
            fieldKey: selectedEntry.key,
            value: editorValue,
          });
        }

        await loadPreview(currentAction);
        setSaveState("saved");
        window.setTimeout(() => setSaveState("idle"), 1200);
      } catch (saveError) {
        console.error("[PromptLabWindow] Failed to save prompt field:", saveError);
        setSaveState("error");
      }
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [editorValue, selectedEntry, currentAction]);

  const handleCopy = async () => {
    if (!selectedEntry) return;
    try {
      await navigator.clipboard.writeText(editorValue || selectedEntry.text || "");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch (copyError) {
      console.error("[PromptLabWindow] Failed to copy field text:", copyError);
    }
  };

  const handleResetField = async () => {
    if (!selectedEntry) return;

    try {
      if (selectedEntry.scope === "fixed") {
        await window.electronAPI?.resetPromptLabFixedOverride?.({
          action: currentAction,
          fieldKey: selectedEntry.key,
        });
      } else if (selectedEntry.scope === "meeting") {
        await window.electronAPI?.resetPromptLabDynamicOverride?.({
          action: currentAction,
          fieldKey: selectedEntry.key,
        });
      } else {
        return;
      }

      await loadPreview(currentAction);
      setSaveState("idle");
    } catch (resetError) {
      console.error("[PromptLabWindow] Failed to reset prompt field:", resetError);
      setSaveState("error");
    }
  };

  const handleResetAllDynamic = async () => {
    try {
      await window.electronAPI?.resetPromptLabActionDynamicOverrides?.({ action: currentAction });
      await loadPreview(currentAction);
    } catch (resetError) {
      console.error("[PromptLabWindow] Failed to reset dynamic overrides:", resetError);
      setError(resetError instanceof Error ? resetError.message : "重置动态覆盖失败");
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0E0E10] text-slate-200">
      <div className="grid min-h-0 w-full grid-cols-[260px_340px_minmax(0,1fr)]">
        <aside className="min-h-0 overflow-y-auto border-r border-white/[0.08] bg-[#121214] px-4 py-5" style={{ scrollbarWidth: "thin", overscrollBehavior: "contain" }}>
          <div className="mb-5 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
            <Braces className="h-4 w-4" />
            <span>提示词实验室</span>
          </div>
          <p className="mb-5 text-sm leading-6 text-slate-500">
            这里会展示下一次 LLM 调用会用到的固定提示词和会议级输入，你也可以直接在这里覆盖它们。
          </p>

          <div className="space-y-2">
            {ACTIONS.map(action => (
              <button
                key={action.id}
                type="button"
                onClick={() => setCurrentAction(action.id)}
                className={`w-full rounded-[18px] border px-3 py-3 text-left transition-colors ${
                  currentAction === action.id
                    ? "border-cyan-400/25 bg-cyan-500/10"
                    : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"
                }`}
              >
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300">
                  {action.label}
                </div>
                <div className="mt-1 text-xs leading-5 text-slate-500">
                  {action.description}
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="min-h-0 overflow-y-auto border-r border-white/[0.08] bg-[#111113] px-4 py-5" style={{ scrollbarWidth: "thin", overscrollBehavior: "contain" }}>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                {preview?.title || ACTIONS.find(item => item.id === currentAction)?.label}
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                这里只显示摘要，点选右侧字段后可以查看或编辑完整内容。
              </p>
            </div>
            {preview?.dynamicFields.some(field => field.overrideActive) && (
              <button
                type="button"
                onClick={handleResetAllDynamic}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-slate-300 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>重置动态项</span>
              </button>
            )}
          </div>

          {isLoading ? (
            <div className="rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-5 text-sm text-slate-400">
              正在加载提示词预览...
            </div>
          ) : entries.length === 0 ? (
            <div className="rounded-[18px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-sm leading-6 text-slate-500">
              当前这个动作还没有可展示的提示词字段。
            </div>
          ) : (
            <div className="space-y-2">
              {entries.map(entry => (
                <button
                  key={entry.entryId}
                  type="button"
                  onClick={() => setSelectedEntryId(entry.entryId)}
                  className={`w-full rounded-[18px] border px-3 py-3 text-left transition-colors ${
                    selectedEntry?.entryId === entry.entryId
                      ? "border-emerald-400/25 bg-emerald-500/10"
                      : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                      {entry.groupLabel}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="rounded-full border border-white/10 bg-black/30 px-2 py-0.5 text-[10px] tracking-[0.14em] text-slate-400">
                        {renderKindLabel(entry.kind)}
                      </span>
                      {entry.overrideActive && (
                        <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-2 py-0.5 text-[10px] tracking-[0.14em] text-cyan-200">
                          已覆盖
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-xs font-medium text-slate-100">
                    {entry.label}
                  </div>
                  <div className="mt-2 text-[11px] leading-5 text-slate-500">
                    <div>{renderScopeLabel(entry)} · {entry.charCount} 字符</div>
                    <div className="mt-1 line-clamp-2 break-words text-slate-400">{entry.summaryStart || "空内容"}</div>
                    {entry.summaryEnd && entry.summaryEnd !== entry.summaryStart && (
                      <div className="mt-1 line-clamp-2 break-words text-slate-500">{entry.summaryEnd}</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <main className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-[#0E0E10]">
          <div className="border-b border-white/[0.08] px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                  {selectedEntry?.label || "请选择一个字段"}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {selectedEntry?.description || "从中间列表里选择一个字段，这里会显示它的完整内容。"}
                </div>
              </div>
              {selectedEntry && (
                <div className="flex items-center gap-2">
                  <div className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] ${
                    saveState === "saving"
                      ? "border-cyan-400/20 bg-cyan-500/10 text-cyan-200"
                      : saveState === "saved"
                        ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200"
                        : saveState === "error"
                          ? "border-red-400/20 bg-red-500/10 text-red-200"
                          : "border-white/10 bg-white/[0.04] text-slate-400"
                  }`}>
                    {SAVE_STATE_LABELS[saveState]}
                  </div>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-slate-300 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copied ? "已复制" : "复制"}</span>
                  </button>
                  {selectedEntry.editable && (
                    <button
                      type="button"
                      onClick={handleResetField}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-slate-300 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>{selectedEntry.scope === "fixed" ? "恢复默认" : "重置字段"}</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="border-b border-red-500/20 bg-red-500/10 px-5 py-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] overflow-hidden">
            <div className="min-h-0 overflow-y-auto px-5 py-5" style={{ scrollbarWidth: "thin", overscrollBehavior: "contain" }}>
              {selectedEntry ? (
                <div className="space-y-4">
                  <div className="rounded-[22px] border border-white/[0.08] bg-white/[0.03] p-4">
                    <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-slate-500">
                      <span>{renderKindLabel(selectedEntry.kind)}</span>
                      <span>·</span>
                      <span>{renderScopeLabel(selectedEntry)}</span>
                      <span>·</span>
                      <span>{selectedEntry.charCount} 字符</span>
                    </div>

                    {selectedEntry.editable ? (
                      <textarea
                        value={editorValue}
                        onChange={(event) => setEditorValue(event.target.value)}
                        spellCheck={false}
                        className="min-h-[420px] w-full resize-none rounded-[18px] border border-white/10 bg-[#111214] px-4 py-4 font-mono text-[12px] leading-6 text-slate-200 outline-none transition-colors placeholder:text-slate-500 focus:border-cyan-400/25"
                        style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                      />
                    ) : (
                      <pre className="min-h-[420px] whitespace-pre-wrap break-words rounded-[18px] border border-white/10 bg-[#111214] px-4 py-4 font-mono text-[12px] leading-6 text-slate-200">
                        {selectedEntry.text || "空内容"}
                      </pre>
                    )}
                  </div>

                  {selectedEntry.baseText !== selectedEntry.text && (
                    <div className="rounded-[22px] border border-white/[0.08] bg-black/20 p-4">
                      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                        {selectedEntry.scope === "fixed" ? "代码默认值" : "自动生成的基础值"}
                      </div>
                      <pre className="max-h-[240px] overflow-auto whitespace-pre-wrap break-words rounded-[18px] border border-white/10 bg-black/25 px-4 py-4 font-mono text-[12px] leading-6 text-slate-400" style={{ scrollbarWidth: "thin" }}>
                        {selectedEntry.baseText || "基础值为空"}
                      </pre>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center rounded-[22px] border border-dashed border-white/10 bg-white/[0.02] px-6 text-sm text-slate-500">
                  请选择一个字段，这里会展示完整提示词内容。
                </div>
              )}
            </div>

            {preview && (
              <div className="border-t border-white/[0.08] px-5 py-3 text-[11px] text-slate-500">
                {preview.hasUserOverrides ? "当前动作已启用覆盖项。" : "当前动作还没有启用覆盖项。"}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
