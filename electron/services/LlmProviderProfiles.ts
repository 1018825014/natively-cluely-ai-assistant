export type CloudProviderId = 'gemini' | 'groq' | 'openai' | 'claude' | 'alibaba';
export type OpenAICompatibleProviderId = 'openai' | 'alibaba';

export interface OpenAICompatibleProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  preferredModel?: string;
  fastModel?: string;
}

export interface ProviderCapabilities {
  checkedAt: number;
  supportsModels: boolean;
  supportsResponses: boolean;
  supportsStreaming: boolean;
  supportsPreviousResponseId: boolean;
  previousResponseIdPreservesContext: boolean;
  notes: string[];
}

export const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
export const DEFAULT_ALIBABA_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

export const DEFAULT_PROVIDER_MODELS: Record<OpenAICompatibleProviderId, { preferred: string; fast: string }> = {
  openai: {
    preferred: 'gpt-5.4',
    fast: 'gpt-5.4-mini',
  },
  alibaba: {
    preferred: 'qwen3.5-plus',
    fast: 'qwen3.5-flash',
  },
};

export function normalizeOpenAICompatibleBaseUrl(
  provider: OpenAICompatibleProviderId,
  rawBaseUrl?: string | null
): string {
  const fallback = provider === 'openai' ? DEFAULT_OPENAI_BASE_URL : DEFAULT_ALIBABA_BASE_URL;
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

export function getDefaultProviderModel(
  provider: OpenAICompatibleProviderId,
  kind: 'preferred' | 'fast' = 'preferred'
): string {
  return DEFAULT_PROVIDER_MODELS[provider][kind];
}

export function detectCloudProviderFromModel(modelId: string): CloudProviderId | null {
  const lower = (modelId || '').toLowerCase();

  if (!lower) return null;
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

export function isOpenAICompatibleProvider(provider: CloudProviderId): provider is OpenAICompatibleProviderId {
  return provider === 'openai' || provider === 'alibaba';
}

export function filterOpenAICompatibleModelIds(provider: OpenAICompatibleProviderId, modelIds: string[]): string[] {
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
    if (!lower.includes('qwen')) return false;
    if (lower.includes('embedding') || lower.includes('tts') || lower.includes('audio')) {
      return false;
    }
    return true;
  });
}
