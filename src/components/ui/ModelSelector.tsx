import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check, Cloud, Terminal, Monitor, Server } from 'lucide-react';
import { STANDARD_CLOUD_MODELS, prettifyModelId } from '../../utils/modelUtils';

interface ModelSelectorProps {
    currentModel: string;
    onSelectModel: (model: string) => void;
}

interface CustomProvider {
    id: string;
    name: string;
    curlCommand: string;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({ currentModel, onSelectModel }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'cloud' | 'custom' | 'local'>('cloud');
    const [ollamaModels, setOllamaModels] = useState<string[]>([]);
    const [customProviders, setCustomProviders] = useState<CustomProvider[]>([]);
    const [cloudModels, setCloudModels] = useState<{ id: string; name: string; desc: string; provider: string }[]>([]);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (!isOpen) return;

        const loadData = async () => {
            try {
                const custom = await window.electronAPI?.getCustomProviders() as CustomProvider[];
                if (custom) {
                    setCustomProviders(custom);
                }

                const local = await window.electronAPI?.getAvailableOllamaModels() as string[];
                if (local) {
                    setOllamaModels(local);
                }

                // @ts-ignore
                const creds = await window.electronAPI?.getStoredCredentials?.();
                const nextCloudModels: { id: string; name: string; desc: string; provider: string }[] = [];

                for (const [prov, cfg] of Object.entries(STANDARD_CLOUD_MODELS)) {
                    if (!cfg.hasKeyCheck(creds)) continue;

                    cfg.ids.forEach((id, i) => {
                        nextCloudModels.push({
                            id,
                            name: cfg.names[i],
                            desc: cfg.descs[i],
                            provider: prov,
                        });
                    });

                    const preferredModel = creds?.[cfg.pmKey];
                    if (preferredModel && !cfg.ids.includes(preferredModel)) {
                        nextCloudModels.push({
                            id: preferredModel,
                            name: prettifyModelId(preferredModel),
                            desc: `${prov.charAt(0).toUpperCase() + prov.slice(1)} 首选`,
                            provider: prov,
                        });
                    }
                }

                setCloudModels(nextCloudModels);
            } catch (e) {
                console.error("Failed to load models:", e);
            }
        };

        loadData();
    }, [isOpen]);

    const handleSelect = (model: string) => {
        onSelectModel(model);
        setIsOpen(false);
    };

    const getModelDisplayName = (model: string) => {
        if (model.startsWith('ollama-')) return model.replace('ollama-', '');
        if (model === 'gemini-3.1-flash-lite-preview') return 'Gemini 3.1 Flash';
        if (model === 'gemini-3.1-pro-preview') return 'Gemini 3.1 Pro';
        if (model === 'llama-3.3-70b-versatile') return 'Groq Llama 3.3';
        if (model === 'gpt-5.4') return 'GPT 5.4';
        if (model === 'claude-sonnet-4-6') return 'Sonnet 4.6';

        const cloudModel = cloudModels.find((item) => item.id === model);
        if (cloudModel) return cloudModel.name;

        const customProvider = customProviders.find((item) => item.id === model || item.name === model);
        if (customProvider) return customProvider.name;

        return model;
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-3 py-1.5 bg-bg-input hover:bg-bg-elevated border border-border-subtle rounded-lg transition-colors text-xs font-medium text-text-primary max-w-[150px]"
            >
                <span className="truncate">{getModelDisplayName(currentModel)}</span>
                <ChevronDown size={14} className={`shrink-0 text-text-secondary transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute bottom-full left-0 mb-2 w-64 bg-bg-item-surface border border-border-subtle rounded-xl shadow-xl z-50 overflow-hidden animated fadeIn">
                    <div className="flex border-b border-border-subtle bg-bg-input/50">
                        <button
                            onClick={() => setActiveTab('cloud')}
                            className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors ${activeTab === 'cloud' ? 'text-accent-primary bg-bg-item-surface border-t-2 border-t-accent-primary' : 'text-text-secondary hover:text-text-primary'}`}
                        >
                            云端
                        </button>
                        <button
                            onClick={() => setActiveTab('custom')}
                            className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors ${activeTab === 'custom' ? 'text-accent-primary bg-bg-item-surface border-t-2 border-t-accent-primary' : 'text-text-secondary hover:text-text-primary'}`}
                        >
                            自定义
                        </button>
                        <button
                            onClick={() => setActiveTab('local')}
                            className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors ${activeTab === 'local' ? 'text-accent-primary bg-bg-item-surface border-t-2 border-t-accent-primary' : 'text-text-secondary hover:text-text-primary'}`}
                        >
                            本地
                        </button>
                    </div>

                    <div className="p-2 max-h-64 overflow-y-auto">
                        {activeTab === 'cloud' && (
                            <div className="space-y-1">
                                {cloudModels.length === 0 ? (
                                    <div className="text-center py-6 text-text-tertiary">
                                        <p className="text-xs mb-2">还没有配置云端提供商。</p>
                                        <p className="text-[10px] opacity-70">去设置里添加 API Key。</p>
                                    </div>
                                ) : (
                                    cloudModels.map((model, idx) => {
                                        const prevProvider = idx > 0 ? cloudModels[idx - 1].provider : null;
                                        const showDivider = prevProvider && prevProvider !== model.provider;
                                        const icon = model.provider === 'gemini' ? <Monitor size={14} /> : <Cloud size={14} />;

                                        return (
                                            <React.Fragment key={model.id}>
                                                {showDivider && <div className="h-px bg-border-subtle my-1" />}
                                                <ModelOption
                                                    id={model.id}
                                                    name={model.name}
                                                    desc={model.desc}
                                                    icon={icon}
                                                    selected={currentModel === model.id}
                                                    onSelect={() => handleSelect(model.id)}
                                                />
                                            </React.Fragment>
                                        );
                                    })
                                )}
                            </div>
                        )}

                        {activeTab === 'custom' && (
                            <div className="space-y-1">
                                {customProviders.length === 0 ? (
                                    <div className="text-center py-6 text-text-tertiary">
                                        <p className="text-xs mb-2">还没有自定义提供商。</p>
                                        <button className="text-[10px] text-accent-primary hover:underline">去设置里管理</button>
                                    </div>
                                ) : (
                                    customProviders.map((provider) => (
                                        <ModelOption
                                            key={provider.id}
                                            id={provider.id}
                                            name={provider.name}
                                            desc="自定义 cURL"
                                            icon={<Terminal size={14} />}
                                            selected={currentModel === provider.id}
                                            onSelect={() => handleSelect(provider.id)}
                                        />
                                    ))
                                )}
                            </div>
                        )}

                        {activeTab === 'local' && (
                            <div className="space-y-1">
                                {ollamaModels.length === 0 ? (
                                    <div className="text-center py-6 text-text-tertiary">
                                        <p className="text-xs">未找到 Ollama 模型。</p>
                                        <p className="text-[10px] mt-1 opacity-70">请先确认 Ollama 正在运行。</p>
                                    </div>
                                ) : (
                                    ollamaModels.map((model) => (
                                        <ModelOption
                                            key={model}
                                            id={`ollama-${model}`}
                                            name={model}
                                            desc="本地"
                                            icon={<Server size={14} />}
                                            selected={currentModel === `ollama-${model}`}
                                            onSelect={() => handleSelect(`ollama-${model}`)}
                                        />
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

interface ModelOptionProps {
    id: string;
    name: string;
    desc: string;
    icon: React.ReactNode;
    selected: boolean;
    onSelect: () => void;
}

const ModelOption: React.FC<ModelOptionProps> = ({ name, desc, icon, selected, onSelect }) => (
    <button
        onClick={onSelect}
        className={`w-full flex items-center justify-between p-2 rounded-lg transition-colors group ${selected ? 'bg-accent-primary/10' : 'hover:bg-bg-input'}`}
    >
        <div className="flex items-center gap-3">
            <div className={`p-1.5 rounded-md ${selected ? 'bg-accent-primary/20 text-accent-primary' : 'bg-bg-elevated text-text-secondary group-hover:text-text-primary'}`}>
                {icon}
            </div>
            <div className="text-left">
                <div className={`text-xs font-medium truncate max-w-[140px] ${selected ? 'text-accent-primary' : 'text-text-primary'}`}>{name}</div>
                <div className="text-[10px] text-text-tertiary">{desc}</div>
            </div>
        </div>
        {selected && <Check size={14} className="text-accent-primary" />}
    </button>
);
