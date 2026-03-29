import React, { useEffect, useState } from "react";
import { AlertTriangle, FolderOpen, Globe, Info, RefreshCw } from "lucide-react";

interface GeneralSettingsProps {}

type RuntimeLogEntryView = {
  timestamp: string;
  level: "debug" | "info" | "warn" | "error";
  source: string;
  message: string;
  details?: string;
};

export const GeneralSettings: React.FC<GeneralSettingsProps> = () => {
  const [recognitionLanguage, setRecognitionLanguage] = useState("chinese");
  const [availableLanguages, setAvailableLanguages] = useState<Record<string, any>>({});

  const [aiResponseLanguage, setAiResponseLanguage] = useState("Chinese");
  const [availableAiLanguages, setAvailableAiLanguages] = useState<any[]>([]);

  const [serviceAccountPath, setServiceAccountPath] = useState("");
  const [runtimeLogInfo, setRuntimeLogInfo] = useState<{ logDirectory: string; currentLogFile: string } | null>(null);
  const [runtimeLogEntries, setRuntimeLogEntries] = useState<RuntimeLogEntryView[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [logError, setLogError] = useState("");

  const loadRuntimeLogs = async () => {
    if (!window.electronAPI?.getRuntimeLogInfo || !window.electronAPI?.getRuntimeLogEntries) {
      return;
    }

    setIsLoadingLogs(true);
    setLogError("");

    try {
      const [info, entries] = await Promise.all([
        window.electronAPI.getRuntimeLogInfo(),
        window.electronAPI.getRuntimeLogEntries({ limit: 20, levels: ["warn", "error"] }),
      ]);

      setRuntimeLogInfo(info);
      setRuntimeLogEntries(entries);
    } catch (error) {
      console.error("[GeneralSettings] Failed to load runtime logs:", error);
      setLogError(error instanceof Error ? error.message : "加载运行日志失败");
    } finally {
      setIsLoadingLogs(false);
    }
  };

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const creds = await window.electronAPI?.getStoredCredentials?.();
        if (creds?.googleServiceAccountPath) {
          setServiceAccountPath(creds.googleServiceAccountPath);
        }
      } catch (error) {
        console.error("[GeneralSettings] Failed to load stored credentials:", error);
      }

      try {
        if (window.electronAPI?.getRecognitionLanguages) {
          const langs = await window.electronAPI.getRecognitionLanguages();
          setAvailableLanguages(langs);

          const storedStt = await window.electronAPI.getSttLanguage();
          setRecognitionLanguage(storedStt || "chinese");
        }

        if (window.electronAPI?.getAiResponseLanguages) {
          const aiLangs = await window.electronAPI.getAiResponseLanguages();
          setAvailableAiLanguages(aiLangs);

          const storedAi = await window.electronAPI.getAiResponseLanguage();
          setAiResponseLanguage(storedAi || "Chinese");
        }
      } catch (error) {
        console.error("[GeneralSettings] Failed to load language settings:", error);
      }
    };

    loadInitialData();
    loadRuntimeLogs();
  }, []);

  const handleLanguageChange = async (key: string) => {
    setRecognitionLanguage(key);
    if (window.electronAPI?.setRecognitionLanguage) {
      await window.electronAPI.setRecognitionLanguage(key);
    }
  };

  const handleAiLanguageChange = async (key: string) => {
    setAiResponseLanguage(key);
    if (window.electronAPI?.setAiResponseLanguage) {
      await window.electronAPI.setAiResponseLanguage(key);
    }
  };

  const handleSelectServiceAccount = async () => {
    try {
      const result = await window.electronAPI.selectServiceAccount();
      if (result.success && result.path) {
        setServiceAccountPath(result.path);
      }
    } catch (error) {
      console.error("[GeneralSettings] Failed to select service account:", error);
    }
  };

  const handleOpenLogDirectory = async () => {
    if (!window.electronAPI?.openRuntimeLogDirectory) {
      return;
    }

    setLogError("");

    try {
      const result = await window.electronAPI.openRuntimeLogDirectory();
      if (!result.success) {
        setLogError(result.error || "打开日志目录失败");
        return;
      }

      setRuntimeLogInfo({
        logDirectory: result.logDirectory,
        currentLogFile: result.currentLogFile,
      });
    } catch (error) {
      console.error("[GeneralSettings] Failed to open runtime log directory:", error);
      setLogError(error instanceof Error ? error.message : "打开日志目录失败");
    }
  };

  const getLogLevelClasses = (level: RuntimeLogEntryView["level"]) => {
    if (level === "error") return "bg-red-500/10 text-red-400 border-red-500/20";
    if (level === "warn") return "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
    return "bg-white/5 text-text-secondary border-border-subtle";
  };

  return (
    <div className="space-y-8 animated fadeIn">
      <div>
        <h3 className="text-lg font-bold text-text-primary mb-2">通用设置</h3>
        <p className="text-xs text-text-secondary mb-4">应用基础偏好、语言设置和本地诊断信息。</p>

        <div className="space-y-4">
          <div className="bg-bg-item-surface rounded-xl p-5 border border-border-subtle">
            <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">Google 语音识别 JSON 凭据</label>
            <div className="flex gap-3">
              <div className="flex-1 bg-bg-input border border-border-subtle rounded-lg px-4 py-2.5 text-xs text-text-secondary truncate flex items-center">
                {serviceAccountPath || "未选择文件"}
              </div>
              <button
                onClick={handleSelectServiceAccount}
                className="bg-bg-input hover:bg-bg-secondary border border-border-subtle text-text-primary px-5 py-2.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap"
              >
                选择文件
              </button>
            </div>
            <p className="text-xs text-text-tertiary mt-2">如果你希望通过服务账号使用 Google 语音识别，可在这里配置。</p>
          </div>

          <div className="bg-bg-item-surface rounded-xl p-5 border border-border-subtle">
            <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">语音识别语言</label>
            <div className="relative inline-block">
              <select
                value={recognitionLanguage}
                onChange={(e) => handleLanguageChange(e.target.value)}
                className="appearance-none bg-bg-input border border-border-subtle rounded-lg pl-5 pr-10 py-2.5 text-xs text-text-primary focus:outline-none focus:border-accent-primary transition-colors"
              >
                {Object.entries(availableLanguages).map(([key, lang]) => (
                  <option key={key} value={key}>
                    {lang.label}
                  </option>
                ))}
              </select>
              <Globe size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
            </div>
            <p className="text-xs text-text-tertiary mt-2">实时转写会优先使用这里设置的语言。</p>
          </div>

          <div className="bg-bg-item-surface rounded-xl p-5 border border-border-subtle">
            <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">AI 回复语言</label>
            <div className="relative inline-block">
              <select
                value={aiResponseLanguage}
                onChange={(e) => handleAiLanguageChange(e.target.value)}
                className="appearance-none bg-bg-input border border-border-subtle rounded-lg pl-5 pr-10 py-2.5 text-xs text-text-primary focus:outline-none focus:border-accent-primary transition-colors"
              >
                {availableAiLanguages.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.label}
                  </option>
                ))}
              </select>
              <Info size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
            </div>
            <p className="text-xs text-text-tertiary mt-2">推荐答案和总结会优先使用这里设置的输出语言。</p>
          </div>

          <div className="bg-bg-item-surface rounded-xl p-5 border border-border-subtle">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">运行日志</label>
                <p className="text-xs text-text-tertiary">
                  存放在本地应用数据目录下，用于记录主进程错误、渲染进程崩溃、告警以及未处理的 Promise 异常。
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={loadRuntimeLogs}
                  className="inline-flex items-center gap-2 bg-bg-input hover:bg-bg-secondary border border-border-subtle text-text-primary px-3 py-2 rounded-lg text-xs font-medium transition-colors"
                >
                  <RefreshCw size={13} />
                  刷新
                </button>
                <button
                  onClick={handleOpenLogDirectory}
                  className="inline-flex items-center gap-2 bg-bg-input hover:bg-bg-secondary border border-border-subtle text-text-primary px-3 py-2 rounded-lg text-xs font-medium transition-colors"
                >
                  <FolderOpen size={13} />
                  打开目录
                </button>
              </div>
            </div>

            {runtimeLogInfo && (
              <div className="space-y-2 mb-4">
                <div className="bg-bg-input border border-border-subtle rounded-lg px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-text-tertiary mb-1">日志目录</div>
                  <div className="text-xs text-text-secondary break-all font-mono">{runtimeLogInfo.logDirectory}</div>
                </div>
                <div className="bg-bg-input border border-border-subtle rounded-lg px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-text-tertiary mb-1">当前日志文件</div>
                  <div className="text-xs text-text-secondary break-all font-mono">{runtimeLogInfo.currentLogFile}</div>
                </div>
              </div>
            )}

            {logError && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>{logError}</span>
              </div>
            )}

            <div className="border border-border-subtle rounded-xl overflow-hidden bg-bg-input/60">
              <div className="px-3 py-2 border-b border-border-subtle text-[11px] uppercase tracking-wide text-text-tertiary">
                最近的告警与错误
              </div>
              <div className="max-h-80 overflow-y-auto p-3 space-y-3">
                {isLoadingLogs ? (
                  <div className="text-xs text-text-secondary">正在加载运行日志...</div>
                ) : runtimeLogEntries.length > 0 ? (
                  runtimeLogEntries.map((entry, index) => (
                    <div key={`${entry.timestamp}-${index}`} className="rounded-lg border border-border-subtle bg-bg-item-surface px-3 py-3">
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${getLogLevelClasses(entry.level)}`}>
                          {entry.level}
                        </span>
                        <span className="text-[11px] text-text-tertiary">{new Date(entry.timestamp).toLocaleString()}</span>
                      </div>
                      <div className="text-xs font-medium text-text-primary mb-1 break-all">{entry.source}</div>
                      <div className="text-xs text-text-secondary whitespace-pre-wrap break-words">{entry.message}</div>
                      {entry.details && (
                        <pre className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-black/20 px-3 py-2 text-[11px] text-text-tertiary font-mono">
                          {entry.details}
                        </pre>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-text-secondary">暂时没有新的告警或错误。</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
