"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_PROVIDER_MODELS = exports.DEFAULT_ALIBABA_BASE_URL = exports.DEFAULT_OPENAI_BASE_URL = void 0;
exports.normalizeOpenAICompatibleBaseUrl = normalizeOpenAICompatibleBaseUrl;
exports.getDefaultProviderModel = getDefaultProviderModel;
exports.detectCloudProviderFromModel = detectCloudProviderFromModel;
exports.isOpenAICompatibleProvider = isOpenAICompatibleProvider;
exports.filterOpenAICompatibleModelIds = filterOpenAICompatibleModelIds;
exports.DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
exports.DEFAULT_ALIBABA_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
exports.DEFAULT_PROVIDER_MODELS = {
    openai: {
        preferred: 'gpt-5.4',
        fast: 'gpt-5.4-mini',
    },
    alibaba: {
        preferred: 'qwen3.5-plus',
        fast: 'qwen3.5-flash',
    },
};
function normalizeOpenAICompatibleBaseUrl(provider, rawBaseUrl) {
    const fallback = provider === 'openai' ? exports.DEFAULT_OPENAI_BASE_URL : exports.DEFAULT_ALIBABA_BASE_URL;
    const trimmed = (rawBaseUrl || '').trim();
    if (!trimmed) {
        return fallback;
    }
    let normalized = trimmed.replace(/\/+$/, '');
    normalized = normalized.replace(/\/responses$/i, '');
    normalized = normalized.replace(/\/chat\/completions$/i, '');
    if (!/\/v\d+(?:beta)?$/i.test(normalized) && /\/v\d+(?:beta)?\//i.test(normalized)) {
        normalized = normalized.replace(/(\/v\d+(?:beta)?).*/i, '$1');
    }
    return normalized;
}
function getDefaultProviderModel(provider, kind = 'preferred') {
    return exports.DEFAULT_PROVIDER_MODELS[provider][kind];
}
function detectCloudProviderFromModel(modelId) {
    const lower = (modelId || '').toLowerCase();
    if (!lower)
        return null;
    if (lower.startsWith('gpt-') || lower.startsWith('o1-') || lower.startsWith('o3-') || lower.startsWith('o4-')) {
        return 'openai';
    }
    if (lower.includes('qwen')) {
        return 'alibaba';
    }
    if (lower.startsWith('claude-')) {
        return 'claude';
    }
    if (lower.startsWith('gemini-') || lower.startsWith('models/')) {
        return 'gemini';
    }
    if (lower.startsWith('llama-') || lower.startsWith('mixtral-') || lower.startsWith('gemma-') || lower.includes('llama')) {
        return 'groq';
    }
    return null;
}
function isOpenAICompatibleProvider(provider) {
    return provider === 'openai' || provider === 'alibaba';
}
function filterOpenAICompatibleModelIds(provider, modelIds) {
    const sorted = [...modelIds].sort((a, b) => a.localeCompare(b));
    if (provider === 'openai') {
        return sorted.filter((modelId) => {
            const lower = modelId.toLowerCase();
            if (lower.includes('audio') || lower.includes('realtime') || lower.includes('embedding')) {
                return false;
            }
            return lower.startsWith('gpt-') || /^o[134]/.test(lower);
        });
    }
    return sorted.filter((modelId) => {
        const lower = modelId.toLowerCase();
        if (!lower.includes('qwen'))
            return false;
        if (lower.includes('embedding') || lower.includes('tts') || lower.includes('audio')) {
            return false;
        }
        return true;
    });
}
//# sourceMappingURL=LlmProviderProfiles.js.map