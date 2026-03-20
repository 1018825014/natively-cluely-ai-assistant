import React, { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { STANDARD_CLOUD_MODELS, prettifyModelId } from '../utils/modelUtils';

interface ModelOption {
    id: string;
    name: string;
    type: 'cloud' | 'local' | 'custom' | 'ollama';
    provider?: string;
}

const ModelSelectorWindow = () => {
    const [currentModel, setCurrentModel] = useState<string>(() => localStorage.getItem('cached-current-model') || '');
    const [availableModels, setAvailableModels] = useState<ModelOption[]>(() => {
        try {
            const cached = localStorage.getItem('cached-models');
            return cached ? JSON.parse(cached) : [];
        } catch {
            return [];
        }
    });
    const [isLoading, setIsLoading] = useState<boolean>(() => availableModels.length === 0);

    useEffect(() => {
        const loadModels = async () => {
            if (availableModels.length === 0) {
                setIsLoading(true);
            }

            try {
                const creds = await window.electronAPI?.getStoredCredentials?.();
                const customProviders = await window.electronAPI?.getCustomProviders?.() || [];

                let ollamaModels: string[] = [];
                try {
                    let fetchedOllamaModels = await window.electronAPI?.getAvailableOllamaModels?.();

                    if (!fetchedOllamaModels || fetchedOllamaModels.length === 0) {
                        try {
                            // @ts-ignore
                            if (window.electronAPI?.forceRestartOllama) {
                                // @ts-ignore
                                await window.electronAPI.forceRestartOllama();
                                await new Promise((resolve) => setTimeout(resolve, 1500));
                                fetchedOllamaModels = await window.electronAPI?.getAvailableOllamaModels?.();
                            }
                        } catch (e) {
                            console.warn("Retrying Ollama failed", e);
                        }
                    }

                    if (fetchedOllamaModels) {
                        ollamaModels = fetchedOllamaModels;
                    }
                } catch (e) {
                    // Ignore Ollama errors here.
                }

                const models: ModelOption[] = [];

                for (const [provider, cfg] of Object.entries(STANDARD_CLOUD_MODELS)) {
                    if (!cfg.hasKeyCheck(creds)) continue;

                    cfg.ids.forEach((id, index) => {
                        models.push({ id, name: cfg.names[index], type: 'cloud', provider });
                    });

                    const preferredModel = creds?.[cfg.pmKey];
                    if (preferredModel && !cfg.ids.includes(preferredModel)) {
                        models.push({ id: preferredModel, name: prettifyModelId(preferredModel), type: 'cloud', provider });
                    }
                }

                customProviders.forEach((provider: any) => {
                    models.push({ id: provider.id, name: provider.name, type: 'custom' });
                });

                ollamaModels.forEach((model: string) => {
                    models.push({ id: `ollama-${model}`, name: `${model}（本地）`, type: 'ollama' });
                });

                localStorage.setItem('cached-models', JSON.stringify(models));
                setAvailableModels(models);

                const config = await window.electronAPI?.getCurrentLlmConfig?.();
                if (config?.model) {
                    setCurrentModel(config.model);
                    localStorage.setItem('cached-current-model', config.model);
                }
            } catch (err) {
                console.error("Failed to load models:", err);
            } finally {
                setIsLoading(false);
            }
        };

        loadModels();

        const unsubscribe = window.electronAPI?.onModelChanged?.((modelId: string) => {
            setCurrentModel(modelId);
        });

        return () => unsubscribe?.();
    }, []);

    const handleSelectFn = (modelId: string) => {
        setCurrentModel(modelId);
        localStorage.setItem('cached-current-model', modelId);

        window.electronAPI?.setModel(modelId)
            .catch((err: any) => console.error("Failed to set model:", err));
    };

    return (
        <div className="w-fit h-fit bg-transparent flex flex-col">
            <div className="w-[140px] h-[200px] bg-[#1E1E1E]/80 backdrop-blur-md border border-white/10 rounded-[16px] overflow-hidden shadow-2xl shadow-black/40 p-2 flex flex-col animate-scale-in origin-top-left">
                {isLoading ? (
                    <div className="flex items-center justify-center py-4 text-slate-500">
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        <span className="text-xs">正在加载模型...</span>
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto scrollbar-hide flex flex-col gap-0.5">
                        {availableModels.length === 0 ? (
                            <div className="px-4 py-3 text-center text-xs text-slate-500">
                                当前没有可用模型。<br />请检查设置。
                            </div>
                        ) : (
                            availableModels.map((model) => {
                                const isSelected = currentModel === model.id;
                                return (
                                    <button
                                        key={model.id}
                                        onClick={() => handleSelectFn(model.id)}
                                        className={`
                                            w-full text-left px-3 py-2 flex items-center justify-between group transition-colors duration-200 rounded-lg
                                            ${isSelected ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}
                                        `}
                                    >
                                        <span className="text-[12px] font-medium truncate flex-1 min-w-0">{model.name}</span>
                                        {isSelected && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 ml-2" />}
                                    </button>
                                );
                            })
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ModelSelectorWindow;
