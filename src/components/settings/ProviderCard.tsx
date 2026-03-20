import React, { useEffect, useRef, useState } from 'react';
import {
    Trash2,
    AlertCircle,
    CheckCircle,
    ExternalLink,
    Loader2,
    ChevronDown,
    Check,
    RefreshCw
} from 'lucide-react';

interface FetchedModel {
    id: string;
    label: string;
}

interface ProviderCardProps {
    providerId: 'gemini' | 'groq' | 'openai' | 'claude';
    providerName: string;
    apiKey: string;
    preferredModel?: string;
    hasStoredKey: boolean;
    onKeyChange: (key: string) => void;
    onSaveKey: () => Promise<void>;
    onRemoveKey: () => void;
    onTestConnection: () => void;
    testStatus: 'idle' | 'testing' | 'success' | 'error';
    testError?: string;
    savingStatus: boolean;
    savedStatus: boolean;
    keyPlaceholder: string;
    keyUrl: string;
    onPreferredModelChange?: (modelId: string) => void;
}

export const ProviderCard: React.FC<ProviderCardProps> = ({
    providerId,
    providerName,
    apiKey,
    preferredModel,
    hasStoredKey,
    onKeyChange,
    onSaveKey,
    onRemoveKey,
    onTestConnection,
    testStatus,
    testError,
    savingStatus,
    savedStatus,
    keyPlaceholder,
    keyUrl,
    onPreferredModelChange,
}) => {
    const [fetchedModels, setFetchedModels] = useState<FetchedModel[]>([]);
    const [isFetching, setIsFetching] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [selectedModel, setSelectedModel] = useState<string>(preferredModel || '');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const savedRef = useRef(savedStatus);
    const savingRef = useRef(savingStatus);
    savedRef.current = savedStatus;
    savingRef.current = savingStatus;

    useEffect(() => {
        if (!apiKey.trim()) return;

        const timer = setTimeout(() => {
            if (!savedRef.current && !savingRef.current) {
                onSaveKey().catch(console.error);
            }
        }, 5000);

        return () => clearTimeout(timer);
    }, [apiKey, onSaveKey]);

    useEffect(() => {
        if (preferredModel) {
            setSelectedModel(preferredModel);
        }
    }, [preferredModel]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleFetchModels = async () => {
        setIsFetching(true);
        setFetchError(null);

        try {
            if (apiKey.trim()) {
                await onSaveKey();
            }

            const keyToUse = apiKey.trim() || '';
            // @ts-ignore
            const result = await window.electronAPI?.fetchProviderModels(providerId, keyToUse);

            if (result?.success && result.models) {
                setFetchedModels(result.models);

                if (result.models.length > 0) {
                    const existsInList = result.models.some((model: FetchedModel) => model.id === selectedModel);
                    if (!existsInList) {
                        const firstModel = result.models[0].id;
                        setSelectedModel(firstModel);
                        // @ts-ignore
                        await window.electronAPI?.setProviderPreferredModel(providerId, firstModel);
                        onPreferredModelChange?.(firstModel);
                    }
                }
            } else {
                setFetchError(result?.error || '拉取模型失败');
            }
        } catch (e: any) {
            setFetchError(e.message || '拉取模型失败');
        } finally {
            setIsFetching(false);
        }
    };

    const handleSelectModel = async (modelId: string) => {
        setSelectedModel(modelId);
        setIsDropdownOpen(false);

        try {
            // @ts-ignore
            await window.electronAPI?.setProviderPreferredModel(providerId, modelId);
            onPreferredModelChange?.(modelId);
        } catch (e) {
            console.error('Failed to save preferred model:', e);
        }
    };

    const selectedOption = fetchedModels.find((model) => model.id === selectedModel);

    return (
        <div className="bg-bg-item-surface rounded-xl p-5 border border-border-subtle">
            <div className="mb-2 flex items-center justify-between">
                <label className="flex items-center text-xs font-medium text-text-primary uppercase tracking-wide">
                    {providerName} API Key
                    {hasStoredKey && <span className="ml-2 text-green-500 normal-case">已保存</span>}
                </label>
                <button
                    onClick={() => {
                        // @ts-ignore
                        window.electronAPI?.openExternal(keyUrl);
                    }}
                    className="text-xs text-text-tertiary hover:text-text-primary flex items-center gap-1 transition-colors"
                    title={`获取 ${providerName} API Key`}
                >
                    <span className="text-[10px] uppercase tracking-wide">获取 Key</span>
                    <ExternalLink size={12} />
                </button>
            </div>

            <div className="flex gap-2 mb-3">
                <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => onKeyChange(e.target.value)}
                    placeholder={hasStoredKey ? '************' : keyPlaceholder}
                    className="flex-1 bg-bg-input border border-border-subtle rounded-lg px-4 py-2.5 text-xs text-text-primary focus:outline-none focus:border-accent-primary transition-colors"
                />
                <button
                    onClick={onSaveKey}
                    disabled={savingStatus || !apiKey.trim()}
                    className={`px-5 py-2.5 rounded-lg text-xs font-medium transition-colors ${
                        savedStatus
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-bg-input hover:bg-bg-secondary border border-border-subtle text-text-primary disabled:opacity-50'
                    }`}
                >
                    {savingStatus ? '保存中...' : savedStatus ? '已保存' : '保存'}
                </button>
                {hasStoredKey && (
                    <button
                        onClick={onRemoveKey}
                        className="px-2.5 py-2.5 rounded-lg text-xs font-medium text-text-tertiary hover:text-red-500 hover:bg-red-500/10 transition-all"
                        title="移除 API Key"
                    >
                        <Trash2 size={16} strokeWidth={1.5} />
                    </button>
                )}
            </div>

            <div className="flex items-center justify-between mb-3 w-full">
                <button
                    onClick={onTestConnection}
                    disabled={(!apiKey.trim() && !hasStoredKey) || testStatus === 'testing'}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors border border-border-subtle flex items-center gap-2 shrink-0 ${
                        testStatus === 'success'
                            ? 'bg-green-500/10 text-green-500 border-green-500/20'
                            : testStatus === 'error'
                                ? 'bg-red-500/10 text-red-500 border-red-500/20'
                                : 'bg-bg-input hover:bg-bg-elevated text-text-primary'
                    }`}
                    title={testError || '测试连接'}
                >
                    {testStatus === 'testing' ? <><Loader2 size={12} className="animate-spin" /> 测试中...</> :
                        testStatus === 'success' ? <><CheckCircle size={12} /> 已连接</> :
                            testStatus === 'error' ? <><AlertCircle size={12} /> 错误</> :
                                <>{/* No Icon */} 测试连接</>}
                </button>

                {fetchedModels.length > 0 || preferredModel ? (
                    <div className="relative flex-1 max-w-[200px] mx-4" ref={dropdownRef}>
                        <button
                            onClick={() => fetchedModels.length > 0 && setIsDropdownOpen(!isDropdownOpen)}
                            className={`w-full bg-bg-input border border-border-subtle rounded-md px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent-primary flex items-center justify-between transition-colors ${
                                fetchedModels.length > 0 ? 'hover:bg-bg-elevated' : 'opacity-80 cursor-default'
                            }`}
                            type="button"
                        >
                            <span className="truncate pr-2">{selectedOption ? selectedOption.label : (preferredModel || '选择模型')}</span>
                            <ChevronDown
                                size={14}
                                className={`text-text-secondary transition-transform ${isDropdownOpen ? 'rotate-180' : ''} ${fetchedModels.length === 0 ? 'opacity-50' : ''}`}
                            />
                        </button>

                        {isDropdownOpen && fetchedModels.length > 0 && (
                            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 w-full min-w-[200px] bg-bg-elevated border border-border-subtle rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto animated fadeIn">
                                <div className="p-1 space-y-0.5">
                                    {fetchedModels.map((model) => (
                                        <button
                                            key={model.id}
                                            onClick={() => handleSelectModel(model.id)}
                                            className={`w-full text-left px-3 py-2 text-xs rounded-md flex items-center justify-between group transition-colors ${
                                                selectedModel === model.id
                                                    ? 'bg-bg-input hover:bg-bg-elevated text-text-primary'
                                                    : 'text-text-secondary hover:bg-bg-input hover:text-text-primary'
                                            }`}
                                            type="button"
                                        >
                                            <span className="truncate">{model.label}</span>
                                            {selectedModel === model.id && <Check size={14} className="text-accent-primary shrink-0 ml-2" />}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex-1 mx-4" />
                )}

                {hasStoredKey ? (
                    <button
                        onClick={handleFetchModels}
                        disabled={isFetching}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors border border-border-subtle flex items-center gap-2 shrink-0 ${
                            isFetching
                                ? 'bg-bg-input text-text-secondary'
                                : 'bg-accent-primary/10 text-accent-primary border-accent-primary/20 hover:bg-accent-primary/20'
                        }`}
                    >
                        {isFetching ? (
                            <><Loader2 size={12} className="animate-spin" /> 获取中...</>
                        ) : (
                            <><RefreshCw size={12} /> 拉取模型</>
                        )}
                    </button>
                ) : (
                    <span className="w-[110px]" />
                )}
            </div>

            {testError && <p className="text-[10px] text-red-400 mt-1.5 mb-2">{testError}</p>}
            {fetchError && <p className="text-[10px] text-red-400 mt-1.5 mb-2">拉取模型失败：{fetchError}</p>}
        </div>
    );
};
