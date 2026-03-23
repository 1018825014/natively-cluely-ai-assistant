/**
 * modelFetcher.ts - Dynamic Model Discovery
 * Fetches available models from AI provider APIs
 */

import axios from 'axios';
import {
    normalizeOpenAICompatibleBaseUrl,
    OpenAICompatibleProviderConfig,
} from '../services/LlmProviderProfiles';

export interface ProviderModel {
    id: string;
    label: string;
}

type Provider = 'gemini' | 'groq' | 'openai' | 'claude' | 'alibaba';

/**
 * Fetch available models from a provider's API.
 * Returns a filtered, sorted array of { id, label } objects.
 */
export async function fetchProviderModels(
    provider: Provider,
    config: OpenAICompatibleProviderConfig
): Promise<ProviderModel[]> {
    switch (provider) {
        case 'openai':
            return fetchOpenAICompatibleModels('openai', config);
        case 'alibaba':
            return fetchOpenAICompatibleModels('alibaba', config);
        case 'groq':
            return fetchGroqModels(config.apiKey || '');
        case 'claude':
            return fetchAnthropicModels(config.apiKey || '');
        case 'gemini':
            return fetchGeminiModels(config.apiKey || '');
        default:
            throw new Error(`Unknown provider: ${provider}`);
    }
}

// ─── OpenAI ──────────────────────────────────────────────────────────────────

async function fetchOpenAICompatibleModels(provider: 'openai' | 'alibaba', config: OpenAICompatibleProviderConfig): Promise<ProviderModel[]> {
    const apiKey = config.apiKey || '';
    const baseUrl = normalizeOpenAICompatibleBaseUrl(provider, config.baseUrl);
    const response = await axios.get(`${baseUrl}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 15000,
    });

    const models: any[] = response.data?.data || [];

    const filtered = models.filter((m: any) => {
        const id = (m.id || '').toLowerCase();
        if (provider === 'openai') {
            if (id.includes('audio') || id.includes('realtime') || id.includes('embedding')) return false;
            return id.includes('gpt-4o') || /gpt-[5-9]/.test(id) || /^o[134]/.test(id);
        }
        if (!id.includes('qwen')) return false;
        return !id.includes('embedding') && !id.includes('audio') && !id.includes('tts');
    });

    return filtered
        .map((m: any) => ({ id: m.id, label: m.id }))
        .sort((a, b) => a.label.localeCompare(b.label));
}

// ─── Groq ────────────────────────────────────────────────────────────────────

async function fetchGroqModels(apiKey: string): Promise<ProviderModel[]> {
    const response = await axios.get('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 15000,
    });

    const models: any[] = response.data?.data || [];

    // Only include text/chat models — exclude everything non-chat
    const excludePatterns = [
        'whisper', 'distil', 'guard', 'tool-use',
        'vision-preview', 'tts', 'playai', 'speech',
    ];

    const filtered = models.filter((m: any) => {
        const id = (m.id || '').toLowerCase();
        return !excludePatterns.some(p => id.includes(p));
    });

    return filtered
        .map((m: any) => ({ id: m.id, label: m.id }))
        .sort((a, b) => a.label.localeCompare(b.label));
}

// ─── Anthropic ───────────────────────────────────────────────────────────────

async function fetchAnthropicModels(apiKey: string): Promise<ProviderModel[]> {
    const response = await axios.get('https://api.anthropic.com/v1/models', {
        headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        timeout: 15000,
    });

    const models: any[] = response.data?.data || [];

    // Only include Claude 3.5+ models (haiku, sonnet, opus)
    const filtered = models.filter((m: any) => {
        const id = (m.id || '').toLowerCase();
        if (!id.includes('claude')) return false;
        
        // Match models that are version 3.5, 3.7, 4.0, etc.
        // e.g. claude-3-5-sonnet, claude-3-7-sonnet, claude-4-opus
        const versionMatch = id.match(/claude-(\d+)-(\d+)?/);
        if (versionMatch) {
            const major = parseInt(versionMatch[1], 10);
            const minor = versionMatch[2] ? parseInt(versionMatch[2], 10) : 0;
            if (major > 3 || (major === 3 && minor >= 5)) {
                return true;
            }
        }
        return false;
    });

    return filtered
        .map((m: any) => ({ id: m.id, label: m.display_name || m.id }))
        .sort((a, b) => a.label.localeCompare(b.label));
}

// ─── Gemini ──────────────────────────────────────────────────────────────────

async function fetchGeminiModels(apiKey: string): Promise<ProviderModel[]> {
    const response = await axios.get(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
        {
            timeout: 15000,
        }
    );

    const models: any[] = response.data?.models || [];

    // Only include Gemini 2.5+ models (gemini-2.5-*, gemini-3-*, etc.)
    // Must support generateContent
    const excludePatterns = ['nano', 'custom', 'computer-use', 'banana', 'tts', 'embedding', 'aqa', 'vision'];

    const filtered = models.filter((m: any) => {
        const name = (m.name || '').toLowerCase();
        const displayName = (m.displayName || '').toLowerCase();
        const combined = name + ' ' + displayName;

        // Must support generateContent
        const supportsChat = m.supportedGenerationMethods?.includes('generateContent');
        if (!supportsChat) return false;

        // Must NOT match any exclude patterns
        if (excludePatterns.some(p => combined.includes(p))) return false;

        // Match gemini-2.5, gemini-3, gemini-4, etc. (version 2.5 and above)
        return /gemini-([3-9]|2\.5)/.test(combined);
    });

    return filtered
        .map((m: any) => {
            const id = (m.name || '').replace(/^models\//, '');
            return { id, label: m.displayName || id };
        })
        .sort((a, b) => a.label.localeCompare(b.label));
}
