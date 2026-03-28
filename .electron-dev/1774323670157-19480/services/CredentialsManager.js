"use strict";
/**
 * CredentialsManager - Secure storage for API keys and service account paths
 * Uses Electron's safeStorage API for encryption at rest
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CredentialsManager = void 0;
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const TechnicalGlossary_1 = require("../stt/TechnicalGlossary");
const LlmProviderProfiles_1 = require("./LlmProviderProfiles");
const CREDENTIALS_PATH = path_1.default.join(electron_1.app.getPath('userData'), 'credentials.enc');
class CredentialsManager {
    static instance;
    credentials = {};
    constructor() {
        // Load on construction after app ready
    }
    static getInstance() {
        if (!CredentialsManager.instance) {
            CredentialsManager.instance = new CredentialsManager();
        }
        return CredentialsManager.instance;
    }
    /**
     * Initialize - load credentials from disk
     * Must be called after app.whenReady()
     */
    init() {
        this.loadCredentials();
        console.log('[CredentialsManager] Initialized');
    }
    // =========================================================================
    // Getters
    // =========================================================================
    getGeminiApiKey() {
        return this.credentials.geminiApiKey;
    }
    getGroqApiKey() {
        return this.credentials.groqApiKey;
    }
    getOpenaiApiKey() {
        return this.credentials.openaiApiKey;
    }
    getOpenaiBaseUrl() {
        return (0, LlmProviderProfiles_1.normalizeOpenAICompatibleBaseUrl)('openai', this.credentials.openaiBaseUrl);
    }
    getClaudeApiKey() {
        return this.credentials.claudeApiKey;
    }
    getAlibabaLlmApiKey() {
        return this.credentials.alibabaLlmApiKey;
    }
    getAlibabaLlmBaseUrl() {
        return (0, LlmProviderProfiles_1.normalizeOpenAICompatibleBaseUrl)('alibaba', this.credentials.alibabaLlmBaseUrl);
    }
    getOpenAICompatibleProviderConfig(provider) {
        if (provider === 'openai') {
            return {
                apiKey: this.credentials.openaiApiKey,
                baseUrl: this.getOpenaiBaseUrl(),
                preferredModel: this.credentials.openaiPreferredModel || (0, LlmProviderProfiles_1.getDefaultProviderModel)('openai'),
                fastModel: (0, LlmProviderProfiles_1.getDefaultProviderModel)('openai', 'fast'),
            };
        }
        return {
            apiKey: this.credentials.alibabaLlmApiKey,
            baseUrl: this.getAlibabaLlmBaseUrl(),
            preferredModel: this.credentials.alibabaPreferredModel || (0, LlmProviderProfiles_1.getDefaultProviderModel)('alibaba'),
            fastModel: (0, LlmProviderProfiles_1.getDefaultProviderModel)('alibaba', 'fast'),
        };
    }
    getGoogleServiceAccountPath() {
        return this.credentials.googleServiceAccountPath;
    }
    getCustomProviders() {
        return this.credentials.customProviders || [];
    }
    getSttProvider() {
        const envProvider = process.env.NATIVELY_STT_PROVIDER;
        return envProvider || this.credentials.sttProvider || 'alibaba';
    }
    getDeepgramApiKey() {
        return process.env.DEEPGRAM_API_KEY || process.env.NATIVELY_DEEPGRAM_API_KEY || this.credentials.deepgramApiKey;
    }
    getGroqSttApiKey() {
        return this.credentials.groqSttApiKey;
    }
    getGroqSttModel() {
        return this.credentials.groqSttModel || 'whisper-large-v3-turbo';
    }
    getOpenAiSttApiKey() {
        return this.credentials.openAiSttApiKey;
    }
    getElevenLabsApiKey() {
        return this.credentials.elevenLabsApiKey;
    }
    getAzureApiKey() {
        return this.credentials.azureApiKey;
    }
    getAzureRegion() {
        return this.credentials.azureRegion || 'eastus';
    }
    getIbmWatsonApiKey() {
        return this.credentials.ibmWatsonApiKey;
    }
    getIbmWatsonRegion() {
        return this.credentials.ibmWatsonRegion || 'us-south';
    }
    getSonioxApiKey() {
        return this.credentials.sonioxApiKey;
    }
    getAlibabaSttApiKey() {
        return process.env.ALIBABA_STT_API_KEY || process.env.NATIVELY_ALIBABA_STT_API_KEY || this.credentials.alibabaSttApiKey;
    }
    getTechnicalGlossaryConfig() {
        const envGlossaryPath = process.env.NATIVELY_TECHNICAL_GLOSSARY_PATH || process.env.TECHNICAL_GLOSSARY_PATH;
        const envGlossaryText = process.env.NATIVELY_TECHNICAL_GLOSSARY_TEXT;
        const baseConfig = (0, TechnicalGlossary_1.normalizeTechnicalGlossaryConfig)(this.credentials.technicalGlossaryConfig || TechnicalGlossary_1.DEFAULT_TECHNICAL_GLOSSARY);
        let envConfig = baseConfig;
        if (envGlossaryPath && fs_1.default.existsSync(envGlossaryPath)) {
            const rawText = fs_1.default.readFileSync(envGlossaryPath, 'utf-8');
            envConfig = (0, TechnicalGlossary_1.parseTechnicalGlossaryText)(rawText, baseConfig);
        }
        else if (envGlossaryText?.trim()) {
            envConfig = (0, TechnicalGlossary_1.parseTechnicalGlossaryText)(envGlossaryText, baseConfig);
        }
        return (0, TechnicalGlossary_1.normalizeTechnicalGlossaryConfig)({
            ...envConfig,
            alibabaWorkspaceId: process.env.NATIVELY_ALIBABA_WORKSPACE_ID || envConfig.alibabaWorkspaceId,
            alibabaVocabularyId: process.env.NATIVELY_ALIBABA_VOCABULARY_ID || envConfig.alibabaVocabularyId,
            funAsrVocabularyId: process.env.NATIVELY_FUN_ASR_VOCABULARY_ID || envConfig.funAsrVocabularyId,
        });
    }
    getGoogleSearchApiKey() {
        return this.credentials.googleSearchApiKey;
    }
    getGoogleSearchCseId() {
        return this.credentials.googleSearchCseId;
    }
    getSttLanguage() {
        return process.env.NATIVELY_STT_LANGUAGE || this.credentials.sttLanguage || 'english-us';
    }
    getAiResponseLanguage() {
        return this.credentials.aiResponseLanguage || 'English';
    }
    getDefaultModel() {
        if (this.credentials.defaultModel?.trim()) {
            return this.credentials.defaultModel;
        }
        if (this.credentials.openaiApiKey?.trim()) {
            return this.credentials.openaiPreferredModel || (0, LlmProviderProfiles_1.getDefaultProviderModel)('openai');
        }
        if (this.credentials.alibabaLlmApiKey?.trim()) {
            return this.credentials.alibabaPreferredModel || (0, LlmProviderProfiles_1.getDefaultProviderModel)('alibaba');
        }
        return 'gemini-3.1-flash-lite-preview';
    }
    getAllCredentials() {
        return { ...this.credentials };
    }
    // =========================================================================
    // Setters (auto-save)
    // =========================================================================
    setGeminiApiKey(key) {
        this.credentials.geminiApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] Gemini API Key updated');
    }
    setGroqApiKey(key) {
        this.credentials.groqApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] Groq API Key updated');
    }
    setOpenaiApiKey(key) {
        this.credentials.openaiApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] OpenAI API Key updated');
    }
    setOpenaiProviderConfig(config) {
        if (config.apiKey !== undefined)
            this.credentials.openaiApiKey = config.apiKey;
        if (config.baseUrl !== undefined) {
            this.credentials.openaiBaseUrl = (0, LlmProviderProfiles_1.normalizeOpenAICompatibleBaseUrl)('openai', config.baseUrl);
        }
        if (config.preferredModel !== undefined)
            this.credentials.openaiPreferredModel = config.preferredModel;
        this.saveCredentials();
        console.log('[CredentialsManager] OpenAI provider config updated');
    }
    setClaudeApiKey(key) {
        this.credentials.claudeApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] Claude API Key updated');
    }
    setAlibabaLlmProviderConfig(config) {
        if (config.apiKey !== undefined)
            this.credentials.alibabaLlmApiKey = config.apiKey;
        if (config.baseUrl !== undefined) {
            this.credentials.alibabaLlmBaseUrl = (0, LlmProviderProfiles_1.normalizeOpenAICompatibleBaseUrl)('alibaba', config.baseUrl);
        }
        if (config.preferredModel !== undefined)
            this.credentials.alibabaPreferredModel = config.preferredModel;
        this.saveCredentials();
        console.log('[CredentialsManager] Alibaba LLM provider config updated');
    }
    setGoogleServiceAccountPath(filePath) {
        this.credentials.googleServiceAccountPath = filePath;
        this.saveCredentials();
        console.log('[CredentialsManager] Google Service Account path updated');
    }
    setSttProvider(provider) {
        this.credentials.sttProvider = provider;
        this.saveCredentials();
        console.log(`[CredentialsManager] STT Provider set to: ${provider}`);
    }
    setDeepgramApiKey(key) {
        this.credentials.deepgramApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] Deepgram API Key updated');
    }
    setGroqSttApiKey(key) {
        this.credentials.groqSttApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] Groq STT API Key updated');
    }
    setOpenAiSttApiKey(key) {
        this.credentials.openAiSttApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] OpenAI STT API Key updated');
    }
    setGroqSttModel(model) {
        this.credentials.groqSttModel = model;
        this.saveCredentials();
        console.log(`[CredentialsManager] Groq STT Model set to: ${model}`);
    }
    setElevenLabsApiKey(key) {
        this.credentials.elevenLabsApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] ElevenLabs API Key updated');
    }
    setAzureApiKey(key) {
        this.credentials.azureApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] Azure API Key updated');
    }
    setAzureRegion(region) {
        this.credentials.azureRegion = region;
        this.saveCredentials();
        console.log(`[CredentialsManager] Azure Region set to: ${region}`);
    }
    setIbmWatsonApiKey(key) {
        this.credentials.ibmWatsonApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] IBM Watson API Key updated');
    }
    setIbmWatsonRegion(region) {
        this.credentials.ibmWatsonRegion = region;
        this.saveCredentials();
        console.log(`[CredentialsManager] IBM Watson Region set to: ${region}`);
    }
    setSonioxApiKey(key) {
        this.credentials.sonioxApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] Soniox API Key updated');
    }
    setAlibabaSttApiKey(key) {
        this.credentials.alibabaSttApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] Alibaba STT API Key updated');
    }
    setTechnicalGlossaryConfig(config) {
        this.credentials.technicalGlossaryConfig = (0, TechnicalGlossary_1.normalizeTechnicalGlossaryConfig)(config);
        this.saveCredentials();
        console.log('[CredentialsManager] Technical glossary config updated');
    }
    setGoogleSearchApiKey(key) {
        this.credentials.googleSearchApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] Google Search API Key updated');
    }
    setGoogleSearchCseId(cseId) {
        this.credentials.googleSearchCseId = cseId;
        this.saveCredentials();
        console.log('[CredentialsManager] Google Search CSE ID updated');
    }
    setSttLanguage(language) {
        this.credentials.sttLanguage = language;
        this.saveCredentials();
        console.log(`[CredentialsManager] STT Language set to: ${language}`);
    }
    setAiResponseLanguage(language) {
        this.credentials.aiResponseLanguage = language;
        this.saveCredentials();
        console.log(`[CredentialsManager] AI Response Language set to: ${language}`);
    }
    setDefaultModel(model) {
        this.credentials.defaultModel = model;
        this.saveCredentials();
        console.log(`[CredentialsManager] Default Model set to: ${model}`);
    }
    getPreferredModel(provider) {
        const key = `${provider}PreferredModel`;
        return this.credentials[key];
    }
    setPreferredModel(provider, modelId) {
        const key = `${provider}PreferredModel`;
        this.credentials[key] = modelId;
        this.saveCredentials();
        console.log(`[CredentialsManager] ${provider} preferred model set to: ${modelId}`);
    }
    saveCustomProvider(provider) {
        if (!this.credentials.customProviders) {
            this.credentials.customProviders = [];
        }
        // Check if exists, update if so
        const index = this.credentials.customProviders.findIndex(p => p.id === provider.id);
        if (index !== -1) {
            this.credentials.customProviders[index] = provider;
        }
        else {
            this.credentials.customProviders.push(provider);
        }
        this.saveCredentials();
        console.log(`[CredentialsManager] Custom Provider '${provider.name}' saved`);
    }
    deleteCustomProvider(id) {
        if (!this.credentials.customProviders)
            return;
        this.credentials.customProviders = this.credentials.customProviders.filter(p => p.id !== id);
        this.saveCredentials();
        console.log(`[CredentialsManager] Custom Provider '${id}' deleted`);
    }
    getCurlProviders() {
        return this.credentials.curlProviders || [];
    }
    saveCurlProvider(provider) {
        if (!this.credentials.curlProviders) {
            this.credentials.curlProviders = [];
        }
        const index = this.credentials.curlProviders.findIndex(p => p.id === provider.id);
        if (index !== -1) {
            this.credentials.curlProviders[index] = provider;
        }
        else {
            this.credentials.curlProviders.push(provider);
        }
        this.saveCredentials();
        console.log(`[CredentialsManager] Curl Provider '${provider.name}' saved`);
    }
    deleteCurlProvider(id) {
        if (!this.credentials.curlProviders)
            return;
        this.credentials.curlProviders = this.credentials.curlProviders.filter(p => p.id !== id);
        this.saveCredentials();
        console.log(`[CredentialsManager] Curl Provider '${id}' deleted`);
    }
    clearAll() {
        this.scrubMemory();
        if (fs_1.default.existsSync(CREDENTIALS_PATH)) {
            fs_1.default.unlinkSync(CREDENTIALS_PATH);
        }
        const plaintextPath = CREDENTIALS_PATH + '.json';
        if (fs_1.default.existsSync(plaintextPath)) {
            fs_1.default.unlinkSync(plaintextPath);
        }
        console.log('[CredentialsManager] All credentials cleared');
    }
    /**
     * Scrub all API keys from memory to minimize exposure window.
     * Called on app quit and credential clear.
     */
    scrubMemory() {
        // Overwrite each string field with empty before discarding
        for (const key of Object.keys(this.credentials)) {
            const val = this.credentials[key];
            if (typeof val === 'string') {
                this.credentials[key] = '';
            }
        }
        this.credentials = {};
        console.log('[CredentialsManager] Memory scrubbed');
    }
    // =========================================================================
    // Storage (Encrypted)
    // =========================================================================
    saveCredentials() {
        try {
            if (!electron_1.safeStorage.isEncryptionAvailable()) {
                console.warn('[CredentialsManager] Encryption not available, falling back to plaintext');
                // Fallback: save as plaintext (less secure, but functional)
                const plainPath = CREDENTIALS_PATH + '.json';
                const tmpPlain = plainPath + '.tmp';
                fs_1.default.writeFileSync(tmpPlain, JSON.stringify(this.credentials));
                fs_1.default.renameSync(tmpPlain, plainPath);
                return;
            }
            const data = JSON.stringify(this.credentials);
            const encrypted = electron_1.safeStorage.encryptString(data);
            const tmpEnc = CREDENTIALS_PATH + '.tmp';
            fs_1.default.writeFileSync(tmpEnc, encrypted);
            fs_1.default.renameSync(tmpEnc, CREDENTIALS_PATH);
        }
        catch (error) {
            console.error('[CredentialsManager] Failed to save credentials:', error);
        }
    }
    loadCredentials() {
        try {
            // Try encrypted file first
            if (fs_1.default.existsSync(CREDENTIALS_PATH)) {
                if (!electron_1.safeStorage.isEncryptionAvailable()) {
                    console.warn('[CredentialsManager] Encryption not available for load');
                    return;
                }
                const encrypted = fs_1.default.readFileSync(CREDENTIALS_PATH);
                const decrypted = electron_1.safeStorage.decryptString(encrypted);
                try {
                    const parsed = JSON.parse(decrypted);
                    if (typeof parsed === 'object' && parsed !== null) {
                        this.credentials = parsed;
                        this.credentials.technicalGlossaryConfig = (0, TechnicalGlossary_1.normalizeTechnicalGlossaryConfig)(this.credentials.technicalGlossaryConfig || TechnicalGlossary_1.DEFAULT_TECHNICAL_GLOSSARY);
                        console.log('[CredentialsManager] Loaded encrypted credentials');
                    }
                    else {
                        throw new Error('Decrypted credentials is not a valid object');
                    }
                }
                catch (parseError) {
                    console.error('[CredentialsManager] Failed to parse decrypted credentials — file may be corrupted. Starting fresh:', parseError);
                    this.credentials = {};
                }
                // Clean up any leftover plaintext fallback file to eliminate the data leak
                const plaintextPath = CREDENTIALS_PATH + '.json';
                if (fs_1.default.existsSync(plaintextPath)) {
                    try {
                        fs_1.default.unlinkSync(plaintextPath);
                        console.log('[CredentialsManager] Removed stale plaintext credential file');
                    }
                    catch (cleanupErr) {
                        console.warn('[CredentialsManager] Could not remove stale plaintext file:', cleanupErr);
                    }
                }
                return;
            }
            // Fallback: try plaintext file
            const plaintextPath = CREDENTIALS_PATH + '.json';
            if (fs_1.default.existsSync(plaintextPath)) {
                const data = fs_1.default.readFileSync(plaintextPath, 'utf-8');
                try {
                    const parsed = JSON.parse(data);
                    if (typeof parsed === 'object' && parsed !== null) {
                        this.credentials = parsed;
                        this.credentials.technicalGlossaryConfig = (0, TechnicalGlossary_1.normalizeTechnicalGlossaryConfig)(this.credentials.technicalGlossaryConfig || TechnicalGlossary_1.DEFAULT_TECHNICAL_GLOSSARY);
                        console.log('[CredentialsManager] Loaded plaintext credentials');
                    }
                    else {
                        throw new Error('Plaintext credentials is not a valid object');
                    }
                }
                catch (parseError) {
                    console.error('[CredentialsManager] Failed to parse plaintext credentials — file may be corrupted. Starting fresh:', parseError);
                    this.credentials = {};
                }
                return;
            }
            console.log('[CredentialsManager] No stored credentials found');
            this.credentials.technicalGlossaryConfig = (0, TechnicalGlossary_1.normalizeTechnicalGlossaryConfig)(TechnicalGlossary_1.DEFAULT_TECHNICAL_GLOSSARY);
        }
        catch (error) {
            console.error('[CredentialsManager] Failed to load credentials:', error);
            this.credentials = {};
            this.credentials.technicalGlossaryConfig = (0, TechnicalGlossary_1.normalizeTechnicalGlossaryConfig)(TechnicalGlossary_1.DEFAULT_TECHNICAL_GLOSSARY);
        }
    }
}
exports.CredentialsManager = CredentialsManager;
//# sourceMappingURL=CredentialsManager.js.map