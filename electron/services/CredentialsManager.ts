/**
 * CredentialsManager - Secure storage for API keys and service account paths
 * Uses Electron's safeStorage API for encryption at rest
 */

import { app, safeStorage } from 'electron';
import fs from 'fs';
import path from 'path';
import {
    DEFAULT_TECHNICAL_GLOSSARY,
    TechnicalGlossaryConfig,
    parseTechnicalGlossaryText,
    normalizeTechnicalGlossaryConfig,
} from '../stt/TechnicalGlossary';
import {
    getDefaultProviderModel,
    normalizeOpenAICompatibleBaseUrl,
    OpenAICompatibleProviderConfig,
    OpenAICompatibleProviderId,
} from './LlmProviderProfiles';

const SECURE_CREDENTIALS_PATH = path.join(app.getPath('userData'), 'credentials.enc');
const SETTINGS_PATH = path.join(app.getPath('userData'), 'credentials.settings.json');
const LEGACY_PLAINTEXT_PATH = SECURE_CREDENTIALS_PATH + '.json';

const SECURE_CREDENTIAL_FIELDS: Array<keyof StoredCredentials> = [
    'geminiApiKey',
    'groqApiKey',
    'openaiApiKey',
    'claudeApiKey',
    'alibabaLlmApiKey',
    'groqSttApiKey',
    'openAiSttApiKey',
    'deepgramApiKey',
    'elevenLabsApiKey',
    'azureApiKey',
    'ibmWatsonApiKey',
    'sonioxApiKey',
    'alibabaSttApiKey',
    'googleSearchApiKey',
    'customProviders',
    'curlProviders',
];

const PLAIN_CREDENTIAL_FIELDS: Array<keyof StoredCredentials> = [
    'openaiBaseUrl',
    'alibabaLlmBaseUrl',
    'googleServiceAccountPath',
    'defaultModel',
    'sttProvider',
    'groqSttModel',
    'azureRegion',
    'ibmWatsonRegion',
    'technicalGlossaryConfig',
    'sttLanguage',
    'aiResponseLanguage',
    'googleSearchCseId',
    'geminiPreferredModel',
    'groqPreferredModel',
    'openaiPreferredModel',
    'claudePreferredModel',
    'alibabaPreferredModel',
];

function pickCredentialFields(source: StoredCredentials, fields: Array<keyof StoredCredentials>): StoredCredentials {
    const picked: StoredCredentials = {};
    for (const field of fields) {
        const value = source[field];
        if (value !== undefined) {
            (picked as any)[field] = value;
        }
    }
    return picked;
}

function normalizeStoredCredentials(input: StoredCredentials): StoredCredentials {
    return {
        ...input,
        technicalGlossaryConfig: normalizeTechnicalGlossaryConfig(input.technicalGlossaryConfig || DEFAULT_TECHNICAL_GLOSSARY),
    };
}

export interface CustomProvider {
    id: string;
    name: string;
    curlCommand: string;
    responsePath?: string;
}

export interface CurlProvider {
    id: string;
    name: string;
    curlCommand: string;
    responsePath: string; // e.g. "choices[0].message.content"
}

export interface StoredCredentials {
    geminiApiKey?: string;
    groqApiKey?: string;
    openaiApiKey?: string;
    openaiBaseUrl?: string;
    claudeApiKey?: string;
    alibabaLlmApiKey?: string;
    alibabaLlmBaseUrl?: string;
    googleServiceAccountPath?: string;
    customProviders?: CustomProvider[];
    curlProviders?: CurlProvider[];
    defaultModel?: string;
    // STT Provider settings
    sttProvider?: 'google' | 'groq' | 'openai' | 'deepgram' | 'elevenlabs' | 'azure' | 'ibmwatson' | 'soniox' | 'alibaba';
    groqSttApiKey?: string;
    groqSttModel?: string;
    openAiSttApiKey?: string;
    deepgramApiKey?: string;
    elevenLabsApiKey?: string;
    azureApiKey?: string;
    azureRegion?: string;
    ibmWatsonApiKey?: string;
    ibmWatsonRegion?: string;
    sonioxApiKey?: string;
    alibabaSttApiKey?: string;
    technicalGlossaryConfig?: TechnicalGlossaryConfig;
    sttLanguage?: string;
    aiResponseLanguage?: string;
    // Google Custom Search
    googleSearchApiKey?: string;
    googleSearchCseId?: string;
    // Dynamic model discovery preferred models per provider
    geminiPreferredModel?: string;
    groqPreferredModel?: string;
    openaiPreferredModel?: string;
    claudePreferredModel?: string;
    alibabaPreferredModel?: string;
}

export class CredentialsManager {
    private static instance: CredentialsManager;
    private credentials: StoredCredentials = {};

    private constructor() {
        // Load on construction after app ready
    }

    public static getInstance(): CredentialsManager {
        if (!CredentialsManager.instance) {
            CredentialsManager.instance = new CredentialsManager();
        }
        return CredentialsManager.instance;
    }

    /**
     * Initialize - load credentials from disk
     * Must be called after app.whenReady()
     */
    public init(): void {
        this.loadCredentials();
        console.log('[CredentialsManager] Initialized');
    }

    // =========================================================================
    // Getters
    // =========================================================================

    public getGeminiApiKey(): string | undefined {
        return this.credentials.geminiApiKey;
    }

    public getGroqApiKey(): string | undefined {
        return this.credentials.groqApiKey;
    }

    public getOpenaiApiKey(): string | undefined {
        return this.credentials.openaiApiKey;
    }

    public getOpenaiBaseUrl(): string {
        return normalizeOpenAICompatibleBaseUrl('openai', this.credentials.openaiBaseUrl);
    }

    public getClaudeApiKey(): string | undefined {
        return this.credentials.claudeApiKey;
    }

    public getAlibabaLlmApiKey(): string | undefined {
        return this.credentials.alibabaLlmApiKey;
    }

    public getAlibabaLlmBaseUrl(): string {
        return normalizeOpenAICompatibleBaseUrl('alibaba', this.credentials.alibabaLlmBaseUrl);
    }

    public getOpenAICompatibleProviderConfig(provider: OpenAICompatibleProviderId): OpenAICompatibleProviderConfig {
        if (provider === 'openai') {
            return {
                apiKey: this.credentials.openaiApiKey,
                baseUrl: this.getOpenaiBaseUrl(),
                preferredModel: this.credentials.openaiPreferredModel || getDefaultProviderModel('openai'),
                fastModel: getDefaultProviderModel('openai', 'fast'),
            };
        }

        return {
            apiKey: this.credentials.alibabaLlmApiKey,
            baseUrl: this.getAlibabaLlmBaseUrl(),
            preferredModel: this.credentials.alibabaPreferredModel || getDefaultProviderModel('alibaba'),
            fastModel: getDefaultProviderModel('alibaba', 'fast'),
        };
    }

    public getGoogleServiceAccountPath(): string | undefined {
        return this.credentials.googleServiceAccountPath;
    }

    public getCustomProviders(): CustomProvider[] {
        return this.credentials.customProviders || [];
    }

    public getSttProvider(): 'google' | 'groq' | 'openai' | 'deepgram' | 'elevenlabs' | 'azure' | 'ibmwatson' | 'soniox' | 'alibaba' {
        const envProvider = process.env.NATIVELY_STT_PROVIDER as StoredCredentials['sttProvider'] | undefined;
        return envProvider || this.credentials.sttProvider || 'alibaba';
    }

    public getDeepgramApiKey(): string | undefined {
        return process.env.DEEPGRAM_API_KEY || process.env.NATIVELY_DEEPGRAM_API_KEY || this.credentials.deepgramApiKey;
    }

    public getGroqSttApiKey(): string | undefined {
        return this.credentials.groqSttApiKey;
    }

    public getGroqSttModel(): string {
        return this.credentials.groqSttModel || 'whisper-large-v3-turbo';
    }

    public getOpenAiSttApiKey(): string | undefined {
        return this.credentials.openAiSttApiKey;
    }

    public getElevenLabsApiKey(): string | undefined {
        return this.credentials.elevenLabsApiKey;
    }

    public getAzureApiKey(): string | undefined {
        return this.credentials.azureApiKey;
    }

    public getAzureRegion(): string {
        return this.credentials.azureRegion || 'eastus';
    }

    public getIbmWatsonApiKey(): string | undefined {
        return this.credentials.ibmWatsonApiKey;
    }

    public getIbmWatsonRegion(): string {
        return this.credentials.ibmWatsonRegion || 'us-south';
    }

    public getSonioxApiKey(): string | undefined {
        return this.credentials.sonioxApiKey;
    }

    public getAlibabaSttApiKey(): string | undefined {
        return process.env.ALIBABA_STT_API_KEY || process.env.NATIVELY_ALIBABA_STT_API_KEY || this.credentials.alibabaSttApiKey;
    }

    public getTechnicalGlossaryConfig(): TechnicalGlossaryConfig {
        const envGlossaryPath = process.env.NATIVELY_TECHNICAL_GLOSSARY_PATH || process.env.TECHNICAL_GLOSSARY_PATH;
        const envGlossaryText = process.env.NATIVELY_TECHNICAL_GLOSSARY_TEXT;
        const baseConfig = normalizeTechnicalGlossaryConfig(this.credentials.technicalGlossaryConfig || DEFAULT_TECHNICAL_GLOSSARY);

        let envConfig = baseConfig;

        if (envGlossaryPath && fs.existsSync(envGlossaryPath)) {
            const rawText = fs.readFileSync(envGlossaryPath, 'utf-8');
            envConfig = parseTechnicalGlossaryText(rawText, baseConfig);
        } else if (envGlossaryText?.trim()) {
            envConfig = parseTechnicalGlossaryText(envGlossaryText, baseConfig);
        }

        return normalizeTechnicalGlossaryConfig({
            ...envConfig,
            alibabaWorkspaceId: process.env.NATIVELY_ALIBABA_WORKSPACE_ID || envConfig.alibabaWorkspaceId,
            alibabaVocabularyId: process.env.NATIVELY_ALIBABA_VOCABULARY_ID || envConfig.alibabaVocabularyId,
            funAsrVocabularyId: process.env.NATIVELY_FUN_ASR_VOCABULARY_ID || envConfig.funAsrVocabularyId,
        });
    }

    public getGoogleSearchApiKey(): string | undefined {
        return this.credentials.googleSearchApiKey;
    }

    public getGoogleSearchCseId(): string | undefined {
        return this.credentials.googleSearchCseId;
    }

    public getSttLanguage(): string {
        return process.env.NATIVELY_STT_LANGUAGE || this.credentials.sttLanguage || 'chinese';
    }

    public getAiResponseLanguage(): string {
        return this.credentials.aiResponseLanguage || 'Chinese';
    }

    public getDefaultModel(): string {
        if (this.credentials.defaultModel?.trim()) {
            return this.credentials.defaultModel;
        }
        if (this.credentials.openaiApiKey?.trim()) {
            return this.credentials.openaiPreferredModel || getDefaultProviderModel('openai');
        }
        if (this.credentials.alibabaLlmApiKey?.trim()) {
            return this.credentials.alibabaPreferredModel || getDefaultProviderModel('alibaba');
        }
        return 'gemini-3.1-flash-lite-preview';
    }

    public getAllCredentials(): StoredCredentials {
        return { ...this.credentials };
    }

    // =========================================================================
    // Setters (auto-save)
    // =========================================================================

    public setGeminiApiKey(key: string): void {
        this.credentials.geminiApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] Gemini API Key updated');
    }

    public setGroqApiKey(key: string): void {
        this.credentials.groqApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] Groq API Key updated');
    }

    public setOpenaiApiKey(key: string): void {
        this.credentials.openaiApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] OpenAI API Key updated');
    }

    public setOpenaiProviderConfig(config: OpenAICompatibleProviderConfig): void {
        if (config.apiKey !== undefined) this.credentials.openaiApiKey = config.apiKey;
        if (config.baseUrl !== undefined) {
            this.credentials.openaiBaseUrl = normalizeOpenAICompatibleBaseUrl('openai', config.baseUrl);
        }
        if (config.preferredModel !== undefined) this.credentials.openaiPreferredModel = config.preferredModel;
        this.saveCredentials();
        console.log('[CredentialsManager] OpenAI provider config updated');
    }

    public setClaudeApiKey(key: string): void {
        this.credentials.claudeApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] Claude API Key updated');
    }

    public setAlibabaLlmProviderConfig(config: OpenAICompatibleProviderConfig): void {
        if (config.apiKey !== undefined) this.credentials.alibabaLlmApiKey = config.apiKey;
        if (config.baseUrl !== undefined) {
            this.credentials.alibabaLlmBaseUrl = normalizeOpenAICompatibleBaseUrl('alibaba', config.baseUrl);
        }
        if (config.preferredModel !== undefined) this.credentials.alibabaPreferredModel = config.preferredModel;
        this.saveCredentials();
        console.log('[CredentialsManager] Alibaba LLM provider config updated');
    }

    public setGoogleServiceAccountPath(filePath: string): void {
        this.credentials.googleServiceAccountPath = filePath;
        this.saveCredentials();
        console.log('[CredentialsManager] Google Service Account path updated');
    }

    public setSttProvider(provider: 'google' | 'groq' | 'openai' | 'deepgram' | 'elevenlabs' | 'azure' | 'ibmwatson' | 'soniox' | 'alibaba'): void {
        this.credentials.sttProvider = provider;
        this.saveCredentials();
        console.log(`[CredentialsManager] STT Provider set to: ${provider}`);
    }

    public setDeepgramApiKey(key: string): void {
        this.credentials.deepgramApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] Deepgram API Key updated');
    }

    public setGroqSttApiKey(key: string): void {
        this.credentials.groqSttApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] Groq STT API Key updated');
    }

    public setOpenAiSttApiKey(key: string): void {
        this.credentials.openAiSttApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] OpenAI STT API Key updated');
    }

    public setGroqSttModel(model: string): void {
        this.credentials.groqSttModel = model;
        this.saveCredentials();
        console.log(`[CredentialsManager] Groq STT Model set to: ${model}`);
    }

    public setElevenLabsApiKey(key: string): void {
        this.credentials.elevenLabsApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] ElevenLabs API Key updated');
    }

    public setAzureApiKey(key: string): void {
        this.credentials.azureApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] Azure API Key updated');
    }

    public setAzureRegion(region: string): void {
        this.credentials.azureRegion = region;
        this.saveCredentials();
        console.log(`[CredentialsManager] Azure Region set to: ${region}`);
    }

    public setIbmWatsonApiKey(key: string): void {
        this.credentials.ibmWatsonApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] IBM Watson API Key updated');
    }

    public setIbmWatsonRegion(region: string): void {
        this.credentials.ibmWatsonRegion = region;
        this.saveCredentials();
        console.log(`[CredentialsManager] IBM Watson Region set to: ${region}`);
    }

    public setSonioxApiKey(key: string): void {
        this.credentials.sonioxApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] Soniox API Key updated');
    }

    public setAlibabaSttApiKey(key: string): void {
        this.credentials.alibabaSttApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] Alibaba STT API Key updated');
    }

    public setTechnicalGlossaryConfig(config: TechnicalGlossaryConfig): void {
        this.credentials.technicalGlossaryConfig = normalizeTechnicalGlossaryConfig(config);
        this.saveCredentials();
        console.log('[CredentialsManager] Technical glossary config updated');
    }

    public setGoogleSearchApiKey(key: string): void {
        this.credentials.googleSearchApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] Google Search API Key updated');
    }

    public setGoogleSearchCseId(cseId: string): void {
        this.credentials.googleSearchCseId = cseId;
        this.saveCredentials();
        console.log('[CredentialsManager] Google Search CSE ID updated');
    }

    public setSttLanguage(language: string): void {
        this.credentials.sttLanguage = language;
        this.saveCredentials();
        console.log(`[CredentialsManager] STT Language set to: ${language}`);
    }

    public setAiResponseLanguage(language: string): void {
        this.credentials.aiResponseLanguage = language;
        this.saveCredentials();
        console.log(`[CredentialsManager] AI Response Language set to: ${language}`);
    }

    public setDefaultModel(model: string): void {
        this.credentials.defaultModel = model;
        this.saveCredentials();
        console.log(`[CredentialsManager] Default Model set to: ${model}`);
    }

    public getPreferredModel(provider: 'gemini' | 'groq' | 'openai' | 'claude' | 'alibaba'): string | undefined {
        const key = `${provider}PreferredModel` as keyof StoredCredentials;
        return this.credentials[key] as string | undefined;
    }

    public setPreferredModel(provider: 'gemini' | 'groq' | 'openai' | 'claude' | 'alibaba', modelId: string): void {
        const key = `${provider}PreferredModel` as keyof StoredCredentials;
        (this.credentials as any)[key] = modelId;
        this.saveCredentials();
        console.log(`[CredentialsManager] ${provider} preferred model set to: ${modelId}`);
    }

    public saveCustomProvider(provider: CustomProvider): void {
        if (!this.credentials.customProviders) {
            this.credentials.customProviders = [];
        }
        const index = this.credentials.customProviders.findIndex(p => p.id === provider.id);
        if (index !== -1) {
            this.credentials.customProviders[index] = provider;
        } else {
            this.credentials.customProviders.push(provider);
        }
        this.saveCredentials();
        console.log(`[CredentialsManager] Custom Provider '${provider.name}' saved`);
    }

    public deleteCustomProvider(id: string): void {
        if (!this.credentials.customProviders) return;
        this.credentials.customProviders = this.credentials.customProviders.filter(p => p.id !== id);
        this.saveCredentials();
        console.log(`[CredentialsManager] Custom Provider '${id}' deleted`);
    }

    public getCurlProviders(): CurlProvider[] {
        return this.credentials.curlProviders || [];
    }

    public saveCurlProvider(provider: CurlProvider): void {
        if (!this.credentials.curlProviders) {
            this.credentials.curlProviders = [];
        }
        const index = this.credentials.curlProviders.findIndex(p => p.id === provider.id);
        if (index !== -1) {
            this.credentials.curlProviders[index] = provider;
        } else {
            this.credentials.curlProviders.push(provider);
        }
        this.saveCredentials();
        console.log(`[CredentialsManager] Curl Provider '${provider.name}' saved`);
    }

    public deleteCurlProvider(id: string): void {
        if (!this.credentials.curlProviders) return;
        this.credentials.curlProviders = this.credentials.curlProviders.filter(p => p.id !== id);
        this.saveCredentials();
        console.log(`[CredentialsManager] Curl Provider '${id}' deleted`);
    }

    public clearAll(): void {
        this.scrubMemory();
        for (const filePath of [SECURE_CREDENTIALS_PATH, SETTINGS_PATH, LEGACY_PLAINTEXT_PATH]) {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
        console.log('[CredentialsManager] All credentials cleared');
    }

    /**
     * Scrub all API keys from memory to minimize exposure window.
     * Called on app quit and credential clear.
     */
    public scrubMemory(): void {
        for (const key of Object.keys(this.credentials) as (keyof StoredCredentials)[]) {
            const val = this.credentials[key];
            if (typeof val === 'string') {
                (this.credentials as any)[key] = '';
            }
        }
        this.credentials = {};
        console.log('[CredentialsManager] Memory scrubbed');
    }

    // =========================================================================
    // Storage (Encrypted)
    // =========================================================================

    private saveCredentials(): void {
        const securePayload = pickCredentialFields(this.credentials, SECURE_CREDENTIAL_FIELDS);
        const plainPayload = pickCredentialFields(this.credentials, PLAIN_CREDENTIAL_FIELDS);

        if (Object.keys(plainPayload).length > 0) {
            const tmpPlain = SETTINGS_PATH + '.tmp';
            fs.writeFileSync(tmpPlain, JSON.stringify(plainPayload));
            fs.renameSync(tmpPlain, SETTINGS_PATH);
        } else if (fs.existsSync(SETTINGS_PATH)) {
            fs.unlinkSync(SETTINGS_PATH);
        }

        if (Object.keys(securePayload).length > 0) {
            if (!safeStorage.isEncryptionAvailable()) {
                throw new Error('当前系统安全存储不可用，无法保存 API Key 或其他敏感凭证。');
            }

            const encrypted = safeStorage.encryptString(JSON.stringify(securePayload));
            const tmpEnc = SECURE_CREDENTIALS_PATH + '.tmp';
            fs.writeFileSync(tmpEnc, encrypted);
            fs.renameSync(tmpEnc, SECURE_CREDENTIALS_PATH);
        } else if (fs.existsSync(SECURE_CREDENTIALS_PATH)) {
            fs.unlinkSync(SECURE_CREDENTIALS_PATH);
        }

        if (fs.existsSync(LEGACY_PLAINTEXT_PATH)) {
            fs.unlinkSync(LEGACY_PLAINTEXT_PATH);
        }
    }

    private loadCredentials(): void {
        try {
            let securePayload: StoredCredentials = {};
            let plainPayload: StoredCredentials = {};
            let legacyPayload: StoredCredentials = {};

            if (fs.existsSync(SECURE_CREDENTIALS_PATH)) {
                if (safeStorage.isEncryptionAvailable()) {
                    const encrypted = fs.readFileSync(SECURE_CREDENTIALS_PATH);
                    const decrypted = safeStorage.decryptString(encrypted);
                    const parsed = JSON.parse(decrypted);
                    if (typeof parsed === 'object' && parsed !== null) {
                        securePayload = parsed;
                        console.log('[CredentialsManager] Loaded encrypted credentials');
                    }
                } else {
                    console.warn('[CredentialsManager] Secure credential file exists, but system secure storage is unavailable. Sensitive fields were not loaded.');
                }
            }

            if (fs.existsSync(SETTINGS_PATH)) {
                const parsed = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
                if (typeof parsed === 'object' && parsed !== null) {
                    plainPayload = parsed;
                    console.log('[CredentialsManager] Loaded plaintext settings');
                }
            }

            if (fs.existsSync(LEGACY_PLAINTEXT_PATH)) {
                const parsed = JSON.parse(fs.readFileSync(LEGACY_PLAINTEXT_PATH, 'utf-8'));
                if (typeof parsed === 'object' && parsed !== null) {
                    legacyPayload = parsed;
                    console.warn('[CredentialsManager] Detected legacy plaintext credential file. Attempting migration.');
                }
            }

            const legacyPlain = pickCredentialFields(legacyPayload, PLAIN_CREDENTIAL_FIELDS);
            const legacySecure = pickCredentialFields(legacyPayload, SECURE_CREDENTIAL_FIELDS);

            this.credentials = normalizeStoredCredentials({
                ...legacyPlain,
                ...plainPayload,
                ...legacySecure,
                ...securePayload,
            });

            if (fs.existsSync(LEGACY_PLAINTEXT_PATH)) {
                if (safeStorage.isEncryptionAvailable()) {
                    this.saveCredentials();
                    fs.unlinkSync(LEGACY_PLAINTEXT_PATH);
                    console.log('[CredentialsManager] Migrated legacy plaintext credentials into split storage');
                } else {
                    this.credentials = normalizeStoredCredentials({
                        ...legacyPlain,
                        ...plainPayload,
                        ...securePayload,
                    });
                    console.warn('[CredentialsManager] Legacy plaintext file still exists, but sensitive fields were ignored because secure storage is unavailable.');
                }
            }

            if (Object.keys(this.credentials).length === 0) {
                console.log('[CredentialsManager] No stored credentials found');
                this.credentials = normalizeStoredCredentials({});
            }
        } catch (error) {
            console.error('[CredentialsManager] Failed to load credentials:', error);
            this.credentials = normalizeStoredCredentials({});
        }
    }
}
