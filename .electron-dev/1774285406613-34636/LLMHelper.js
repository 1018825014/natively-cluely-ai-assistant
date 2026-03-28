"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LLMHelper = void 0;
const genai_1 = require("@google/genai");
const groq_sdk_1 = __importDefault(require("groq-sdk"));
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const fs_1 = __importDefault(require("fs"));
const sharp_1 = __importDefault(require("sharp"));
const ModelVersionManager_1 = require("./services/ModelVersionManager");
const prompts_1 = require("./llm/prompts");
const curlUtils_1 = require("./utils/curlUtils");
const curl_to_json_1 = __importDefault(require("@bany/curl-to-json"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const axios_1 = __importDefault(require("axios"));
const RateLimiter_1 = require("./services/RateLimiter");
const LlmProviderProfiles_1 = require("./services/LlmProviderProfiles");
const OpenAICompatibleResponses_1 = require("./services/OpenAICompatibleResponses");
const LlmTraceRecorder_1 = require("./services/LlmTraceRecorder");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
// Model constant for Gemini 3 Flash
const GEMINI_FLASH_MODEL = "gemini-3.1-flash-lite-preview";
const GEMINI_PRO_MODEL = "gemini-3.1-pro-preview";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const OPENAI_MODEL = "gpt-5.4";
const OPENAI_FAST_MODEL = "gpt-5.4-mini";
const ALIBABA_MODEL = "qwen3.5-plus";
const ALIBABA_FAST_MODEL = "qwen3.5-flash";
const CLAUDE_MODEL = "claude-sonnet-4-6";
const MAX_OUTPUT_TOKENS = 65536;
const CLAUDE_MAX_OUTPUT_TOKENS = 64000;
// Simple prompt for image analysis (not interview copilot - kept separate)
const IMAGE_ANALYSIS_PROMPT = `Analyze concisely. Be direct. No markdown formatting. Return plain text only.`;
class LLMHelper {
    client = null;
    groqClient = null;
    openaiClient = null;
    alibabaClient = null;
    claudeClient = null;
    apiKey = null;
    groqApiKey = null;
    openaiApiKey = null;
    alibabaApiKey = null;
    claudeApiKey = null;
    openaiBaseUrl = LlmProviderProfiles_1.DEFAULT_OPENAI_BASE_URL;
    alibabaBaseUrl = LlmProviderProfiles_1.DEFAULT_ALIBABA_BASE_URL;
    openaiPreferredModel = OPENAI_MODEL;
    openaiFastModel = OPENAI_FAST_MODEL;
    alibabaPreferredModel = ALIBABA_MODEL;
    alibabaFastModel = ALIBABA_FAST_MODEL;
    providerCapabilities = {
        openai: null,
        alibaba: null,
    };
    useOllama = false;
    ollamaModel = "llama3.2";
    ollamaUrl = "http://localhost:11434";
    ollamaStartedByApp = false;
    geminiModel = GEMINI_FLASH_MODEL;
    customProvider = null;
    activeCurlProvider = null;
    groqFastTextMode = false;
    knowledgeOrchestrator = null;
    aiResponseLanguage = 'English';
    sttLanguage = 'english-us';
    // Rate limiters per provider to prevent 429 errors on free tiers
    rateLimiters;
    // Self-improving model version manager for vision analysis
    modelVersionManager;
    currentProviderId = 'gemini';
    constructor(apiKey, useOllama = false, ollamaModel, ollamaUrl, groqApiKey, openaiApiKey, claudeApiKey) {
        this.useOllama = useOllama;
        // Initialize rate limiters
        this.rateLimiters = (0, RateLimiter_1.createProviderRateLimiters)();
        // Initialize model version manager
        this.modelVersionManager = new ModelVersionManager_1.ModelVersionManager();
        // Initialize Groq client if API key provided
        if (groqApiKey) {
            this.groqApiKey = groqApiKey;
            this.groqClient = new groq_sdk_1.default({ apiKey: groqApiKey });
            console.log(`[LLMHelper] Groq client initialized with model: ${GROQ_MODEL}`);
        }
        // Initialize OpenAI client if API key provided
        if (openaiApiKey) {
            this.setOpenAICompatibleProviderConfig('openai', { apiKey: openaiApiKey });
            console.log(`[LLMHelper] OpenAI client initialized with model: ${OPENAI_MODEL}`);
        }
        // Initialize Claude client if API key provided
        if (claudeApiKey) {
            this.claudeApiKey = claudeApiKey;
            this.claudeClient = new sdk_1.default({ apiKey: claudeApiKey });
            console.log(`[LLMHelper] Claude client initialized with model: ${CLAUDE_MODEL}`);
        }
        if (useOllama) {
            this.ollamaUrl = ollamaUrl || "http://localhost:11434";
            this.ollamaModel = ollamaModel || "gemma:latest"; // Default fallback
            // console.log(`[LLMHelper] Using Ollama with model: ${this.ollamaModel}`)
            // Auto-detect and use first available model if specified model doesn't exist
            this.initializeOllamaModel();
        }
        else if (apiKey) {
            this.apiKey = apiKey;
            // Initialize with v1alpha API version for Gemini 3 support
            this.client = new genai_1.GoogleGenAI({
                apiKey: apiKey,
                httpOptions: { apiVersion: "v1alpha" }
            });
            // console.log(`[LLMHelper] Using Google Gemini 3 with model: ${this.geminiModel} (v1alpha API)`)
        }
        else {
            console.warn("[LLMHelper] No API key provided. Client will be uninitialized until key is set.");
        }
    }
    setApiKey(apiKey) {
        this.apiKey = apiKey;
        this.client = new genai_1.GoogleGenAI({
            apiKey: apiKey,
            httpOptions: { apiVersion: "v1alpha" }
        });
        console.log("[LLMHelper] Gemini API Key updated.");
    }
    setGroqApiKey(apiKey) {
        this.groqApiKey = apiKey;
        this.groqClient = new groq_sdk_1.default({ apiKey });
        console.log("[LLMHelper] Groq API Key updated.");
    }
    setOpenaiApiKey(apiKey) {
        this.setOpenAICompatibleProviderConfig('openai', { apiKey });
        console.log("[LLMHelper] OpenAI API Key updated.");
    }
    setOpenAICompatibleProviderConfig(provider, config) {
        const normalizedConfig = {
            preferredModel: (0, LlmProviderProfiles_1.getDefaultProviderModel)(provider),
            fastModel: (0, LlmProviderProfiles_1.getDefaultProviderModel)(provider, 'fast'),
            ...config,
        };
        if (provider === 'openai') {
            if (normalizedConfig.apiKey !== undefined)
                this.openaiApiKey = normalizedConfig.apiKey || null;
            if (normalizedConfig.baseUrl)
                this.openaiBaseUrl = normalizedConfig.baseUrl;
            if (normalizedConfig.preferredModel)
                this.openaiPreferredModel = normalizedConfig.preferredModel;
            if (normalizedConfig.fastModel)
                this.openaiFastModel = normalizedConfig.fastModel;
            this.openaiClient = (0, OpenAICompatibleResponses_1.createOpenAICompatibleClient)('openai', {
                apiKey: this.openaiApiKey || undefined,
                baseUrl: this.openaiBaseUrl,
            });
            this.providerCapabilities.openai = null;
            return;
        }
        if (normalizedConfig.apiKey !== undefined)
            this.alibabaApiKey = normalizedConfig.apiKey || null;
        if (normalizedConfig.baseUrl)
            this.alibabaBaseUrl = normalizedConfig.baseUrl;
        if (normalizedConfig.preferredModel)
            this.alibabaPreferredModel = normalizedConfig.preferredModel;
        if (normalizedConfig.fastModel)
            this.alibabaFastModel = normalizedConfig.fastModel;
        this.alibabaClient = (0, OpenAICompatibleResponses_1.createOpenAICompatibleClient)('alibaba', {
            apiKey: this.alibabaApiKey || undefined,
            baseUrl: this.alibabaBaseUrl,
        });
        this.providerCapabilities.alibaba = null;
    }
    setProviderCapabilities(provider, capabilities) {
        this.providerCapabilities[provider] = capabilities;
    }
    setClaudeApiKey(apiKey) {
        this.claudeApiKey = apiKey;
        this.claudeClient = new sdk_1.default({ apiKey });
        console.log("[LLMHelper] Claude API Key updated.");
    }
    /**
     * Initialize the self-improving model version manager.
     * Should be called after all API keys are configured.
     * Triggers initial model discovery and starts background scheduler.
     */
    async initModelVersionManager() {
        this.modelVersionManager.setApiKeys({
            openai: this.openaiBaseUrl === LlmProviderProfiles_1.DEFAULT_OPENAI_BASE_URL ? this.openaiApiKey : null,
            gemini: this.apiKey,
            claude: this.claudeApiKey,
            groq: this.groqApiKey,
        });
        await this.modelVersionManager.initialize();
        console.log(this.modelVersionManager.getSummary());
    }
    /**
     * Scrub all API keys from memory to minimize exposure window.
     * Called on app quit.
     */
    scrubKeys() {
        this.apiKey = null;
        this.groqApiKey = null;
        this.openaiApiKey = null;
        this.alibabaApiKey = null;
        this.claudeApiKey = null;
        this.client = null;
        this.groqClient = null;
        this.openaiClient = null;
        this.alibabaClient = null;
        this.claudeClient = null;
        // Destroy rate limiters
        if (this.rateLimiters) {
            Object.values(this.rateLimiters).forEach(rl => rl.destroy());
        }
        // Stop model version manager background scheduler
        this.modelVersionManager.stopScheduler();
        console.log('[LLMHelper] Keys scrubbed from memory');
    }
    setGroqFastTextMode(enabled) {
        this.groqFastTextMode = enabled;
        console.log(`[LLMHelper] Groq Fast Text Mode: ${enabled}`);
    }
    getGroqFastTextMode() {
        return this.groqFastTextMode;
    }
    getAiResponseLanguage() {
        return this.aiResponseLanguage;
    }
    // --- Model Type Checkers ---
    isOpenAiModel(modelId) {
        return modelId.startsWith("gpt-") || modelId.startsWith("o1-") || modelId.startsWith("o3-") || modelId.includes("openai");
    }
    isAlibabaModel(modelId) {
        return modelId.toLowerCase().includes("qwen");
    }
    isClaudeModel(modelId) {
        return modelId.startsWith("claude-");
    }
    isGroqModel(modelId) {
        return modelId.startsWith("llama-") || modelId.startsWith("mixtral-") || modelId.startsWith("gemma-");
    }
    isGeminiModel(modelId) {
        return modelId.startsWith("gemini-") || modelId.startsWith("models/");
    }
    // ---------------------------
    currentModelId = GEMINI_FLASH_MODEL;
    formatModelLabel(modelId) {
        if (!modelId)
            return '';
        return modelId.replace(/[-_]/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
    }
    createRouteInfo(provider, modelId, isFastPath) {
        return {
            provider,
            modelId,
            modelLabel: this.formatModelLabel(modelId),
            isFastPath,
        };
    }
    getCurrentModelRouteInfo() {
        if (this.activeCurlProvider) {
            return this.createRouteInfo("custom", this.activeCurlProvider.id, false);
        }
        if (this.customProvider) {
            return this.createRouteInfo("custom", this.customProvider.id, false);
        }
        if (this.useOllama) {
            return this.createRouteInfo("ollama", this.ollamaModel, false);
        }
        return this.createRouteInfo(this.currentProviderId, this.currentModelId, false);
    }
    getPreferredFastTextRouteInfo() {
        if (this.openaiClient) {
            return this.createRouteInfo("openai", this.openaiFastModel, true);
        }
        if (this.alibabaClient) {
            return this.createRouteInfo("alibaba", this.alibabaFastModel, true);
        }
        if (this.groqClient) {
            return this.createRouteInfo("groq", GROQ_MODEL, true);
        }
        return null;
    }
    getInitialStreamChatRouteInfo(imagePaths, options = {}) {
        const isMultimodal = !!(imagePaths?.length);
        if (!options.disableFastPath && this.groqFastTextMode && !isMultimodal) {
            return this.getPreferredFastTextRouteInfo() || this.getCurrentModelRouteInfo();
        }
        return this.getCurrentModelRouteInfo();
    }
    shouldSkipParallelStrongAnswer(imagePaths) {
        const strongRoute = this.getCurrentModelRouteInfo();
        const primaryRoute = this.getInitialStreamChatRouteInfo(imagePaths);
        if (!primaryRoute) {
            return true;
        }
        return primaryRoute.provider === strongRoute.provider && primaryRoute.modelId === strongRoute.modelId;
    }
    getOpenAICompatibleClient(provider) {
        return provider === 'openai' ? this.openaiClient : this.alibabaClient;
    }
    getPreferredOpenAICompatibleModel(provider, options = {}) {
        if (options.explicitModel)
            return options.explicitModel;
        if (provider === 'openai') {
            return options.useFast ? this.openaiFastModel : this.openaiPreferredModel;
        }
        return options.useFast ? this.alibabaFastModel : this.alibabaPreferredModel;
    }
    async buildResponsesInput(userMessage, imagePaths) {
        const content = [{ type: 'input_text', text: userMessage }];
        for (const imagePath of imagePaths || []) {
            if (!fs_1.default.existsSync(imagePath))
                continue;
            const imageData = await fs_1.default.promises.readFile(imagePath);
            content.push({
                type: 'input_image',
                image_url: `data:image/png;base64,${imageData.toString("base64")}`,
            });
        }
        return [{ role: 'user', content }];
    }
    extractResponsesOutputText(response) {
        if (typeof response?.output_text === 'string' && response.output_text.trim()) {
            return response.output_text;
        }
        const outputItems = response?.output || [];
        for (const item of outputItems) {
            if (!Array.isArray(item?.content))
                continue;
            for (const part of item.content) {
                if (typeof part?.text === 'string' && part.text.trim()) {
                    return part.text;
                }
            }
        }
        return "";
    }
    async generateWithOpenAICompatible(provider, userMessage, systemPrompt, imagePaths, modelOverride) {
        const client = this.getOpenAICompatibleClient(provider);
        if (!client)
            throw new Error(`${provider} client not initialized`);
        await this.rateLimiters.openai.acquire();
        const response = await client.responses.create({
            model: this.getPreferredOpenAICompatibleModel(provider, { explicitModel: modelOverride }),
            ...(systemPrompt ? { instructions: systemPrompt } : {}),
            input: await this.buildResponsesInput(userMessage, imagePaths),
            max_output_tokens: MAX_OUTPUT_TOKENS,
        });
        return this.extractResponsesOutputText(response);
    }
    async *streamWithOpenAICompatible(provider, userMessage, imagePaths, systemPrompt, modelOverride) {
        const client = this.getOpenAICompatibleClient(provider);
        if (!client)
            throw new Error(`${provider} client not initialized`);
        await this.rateLimiters.openai.acquire();
        const stream = await client.responses.create({
            model: this.getPreferredOpenAICompatibleModel(provider, { explicitModel: modelOverride }),
            ...(systemPrompt ? { instructions: systemPrompt } : {}),
            input: await this.buildResponsesInput(userMessage, imagePaths),
            max_output_tokens: MAX_OUTPUT_TOKENS,
            stream: true,
        });
        for await (const event of stream) {
            if (event.type === 'response.output_text.delta' && event.delta) {
                yield event.delta;
            }
            if (event.type === 'response.completed') {
                return;
            }
        }
    }
    setModel(modelId, customProviders = []) {
        // Map UI short codes to internal Model IDs
        let targetModelId = modelId;
        if (modelId === 'gemini')
            targetModelId = GEMINI_FLASH_MODEL;
        if (modelId === 'gemini-pro')
            targetModelId = GEMINI_PRO_MODEL;
        if (modelId === 'gpt-4o')
            targetModelId = OPENAI_MODEL;
        if (modelId === 'claude')
            targetModelId = CLAUDE_MODEL;
        if (modelId === 'llama')
            targetModelId = GROQ_MODEL;
        if (targetModelId.startsWith('ollama-')) {
            this.useOllama = true;
            this.ollamaModel = targetModelId.replace('ollama-', '');
            this.customProvider = null;
            this.activeCurlProvider = null;
            console.log(`[LLMHelper] Switched to Ollama: ${this.ollamaModel}`);
            return;
        }
        const custom = customProviders.find(p => p.id === targetModelId);
        if (custom) {
            this.useOllama = false;
            this.customProvider = null;
            // Treat text-only custom providers as CurlProviders (responsePath optional)
            this.activeCurlProvider = custom;
            this.currentProviderId = 'gemini';
            console.log(`[LLMHelper] Switched to cURL Provider: ${custom.name}`);
            return;
        }
        // Standard Cloud Models
        this.useOllama = false;
        this.customProvider = null;
        this.currentModelId = targetModelId;
        this.activeCurlProvider = null;
        this.currentProviderId = (0, LlmProviderProfiles_1.detectCloudProviderFromModel)(targetModelId) || 'gemini';
        // Update specific model props if needed
        if (targetModelId === GEMINI_PRO_MODEL)
            this.geminiModel = GEMINI_PRO_MODEL;
        if (targetModelId === GEMINI_FLASH_MODEL)
            this.geminiModel = GEMINI_FLASH_MODEL;
        console.log(`[LLMHelper] Switched to Cloud Model: ${targetModelId}`);
    }
    switchToCurl(provider) {
        this.useOllama = false;
        this.customProvider = null;
        this.activeCurlProvider = provider;
        console.log(`[LLMHelper] Switched to cURL provider: ${provider.name}`);
    }
    cleanJsonResponse(text) {
        // Remove markdown code block syntax if present
        text = text.replace(/^```(?:json)?\n/, '').replace(/\n```$/, '');
        // Remove any leading/trailing whitespace
        text = text.trim();
        return text;
    }
    async callOllama(prompt) {
        try {
            const response = await fetch(`${this.ollamaUrl}/api/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: this.ollamaModel,
                    prompt: prompt,
                    stream: false,
                    options: {
                        temperature: 0.7,
                        top_p: 0.9,
                    }
                }),
            });
            if (!response.ok) {
                throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();
            return data.response;
        }
        catch (error) {
            // console.error("[LLMHelper] Error calling Ollama:", error)
            throw new Error(`Failed to connect to Ollama: ${error.message}. Make sure Ollama is running on ${this.ollamaUrl}`);
        }
    }
    async checkOllamaAvailable() {
        try {
            const response = await fetch(`${this.ollamaUrl}/api/tags`);
            return response.ok;
        }
        catch {
            return false;
        }
    }
    async initializeOllamaModel() {
        try {
            const availableModels = await this.getOllamaModels();
            if (availableModels.length === 0) {
                // console.warn("[LLMHelper] No Ollama models found")
                return;
            }
            // Check if current model exists, if not use the first available
            if (!availableModels.includes(this.ollamaModel)) {
                this.ollamaModel = availableModels[0];
                // console.log(`[LLMHelper] Auto-selected first available model: ${this.ollamaModel}`)
            }
            // Test the selected model works
            await this.callOllama("Hello");
            // console.log(`[LLMHelper] Successfully initialized with model: ${this.ollamaModel}`)
        }
        catch (error) {
            // console.error(`[LLMHelper] Failed to initialize Ollama model: ${error.message}`)
            // Try to use first available model as fallback
            try {
                const models = await this.getOllamaModels();
                if (models.length > 0) {
                    this.ollamaModel = models[0];
                    // console.log(`[LLMHelper] Fallback to: ${this.ollamaModel}`)
                }
            }
            catch (fallbackError) {
                // console.error(`[LLMHelper] Fallback also failed: ${fallbackError.message}`)
            }
        }
    }
    /**
     * Generate content using Gemini 3 Flash (text reasoning)
     * Used by IntelligenceManager for mode-specific prompts
     * NOTE: Migrated from Pro to Flash for consistency
     */
    async generateWithPro(contents) {
        if (!this.client)
            throw new Error("Gemini client not initialized");
        await this.rateLimiters.gemini.acquire();
        // console.log(`[LLMHelper] Calling ${GEMINI_FLASH_MODEL}...`)
        const response = await this.client.models.generateContent({
            model: GEMINI_PRO_MODEL,
            contents: contents,
            config: {
                maxOutputTokens: MAX_OUTPUT_TOKENS,
                temperature: 0.3, // Lower = faster, more focused
            }
        });
        return response.text || "";
    }
    /**
     * Generate content using Gemini 3 Flash (audio + fast multimodal)
     * CRITICAL: Audio input MUST use this model, not Pro
     */
    async generateWithFlash(contents) {
        if (!this.client)
            throw new Error("Gemini client not initialized");
        await this.rateLimiters.gemini.acquire();
        // console.log(`[LLMHelper] Calling ${GEMINI_FLASH_MODEL}...`)
        const response = await this.client.models.generateContent({
            model: GEMINI_FLASH_MODEL,
            contents: contents,
            config: {
                maxOutputTokens: MAX_OUTPUT_TOKENS,
                temperature: 0.3, // Lower = faster, more focused
            }
        });
        return response.text || "";
    }
    /**
     * Post-process the response
     * NOTE: Truncation/clamping removed - response length is handled in prompts
     */
    processResponse(text) {
        // Basic cleaning
        let clean = this.cleanJsonResponse(text);
        // Truncation/clamping removed - prompts already handle response length
        // clean = clampResponse(clean, 3, 60);
        // Filter out fallback phrases
        const fallbackPhrases = [
            "I'm not sure",
            "It depends",
            "I can't answer",
            "I don't know",
            "我不太确定",
            "这要看情况",
            "我没法回答",
            "我不知道",
            "抱歉，这部分信息不能提供"
        ];
        if (fallbackPhrases.some(phrase => clean.toLowerCase().includes(phrase.toLowerCase()))) {
            throw new Error("Filtered fallback response");
        }
        return clean;
    }
    /**
     * Retry logic with exponential backoff
     * Specifically handles 503 Service Unavailable
     */
    async withRetry(fn, retries = 3) {
        let delay = 400;
        for (let i = 0; i < retries; i++) {
            try {
                return await fn();
            }
            catch (e) {
                // Only retry on 503 or overload errors
                if (!e.message?.includes("503") && !e.message?.includes("overloaded"))
                    throw e;
                console.warn(`[LLMHelper] 503 Overload. Retrying in ${delay}ms...`);
                await new Promise(r => setTimeout(r, delay));
                delay *= 2;
            }
        }
        throw new Error("Model busy, try again");
    }
    /**
     * Generate content using the currently selected model
     */
    async generateContent(contents, modelIdOverride) {
        if (!this.client)
            throw new Error("Gemini client not initialized");
        const targetModel = modelIdOverride || this.geminiModel;
        console.log(`[LLMHelper] Calling ${targetModel}...`);
        return this.withRetry(async () => {
            // @ts-ignore
            const response = await this.client.models.generateContent({
                model: targetModel,
                contents: contents,
                config: {
                    maxOutputTokens: MAX_OUTPUT_TOKENS,
                    temperature: 0.4,
                }
            });
            // Debug: log full response structure
            // console.log(`[LLMHelper] Full response:`, JSON.stringify(response, null, 2).substring(0, 500))
            const candidate = response.candidates?.[0];
            if (!candidate) {
                console.error("[LLMHelper] No candidates returned!");
                console.error("[LLMHelper] Full response:", JSON.stringify(response, null, 2).substring(0, 1000));
                return "";
            }
            if (candidate.finishReason && candidate.finishReason !== "STOP") {
                console.warn(`[LLMHelper] Generation stopped with reason: ${candidate.finishReason}`);
                console.warn(`[LLMHelper] Safety ratings:`, JSON.stringify(candidate.safetyRatings));
            }
            // Try multiple ways to access text - handle different response structures
            let text = "";
            // Method 1: Direct response.text
            if (response.text) {
                text = response.text;
            }
            // Method 2: candidate.content.parts array (check all parts)
            else if (candidate.content?.parts) {
                const parts = Array.isArray(candidate.content.parts) ? candidate.content.parts : [candidate.content.parts];
                for (const part of parts) {
                    if (part?.text) {
                        text += part.text;
                    }
                }
            }
            // Method 3: candidate.content directly (if it's a string)
            else if (typeof candidate.content === 'string') {
                text = candidate.content;
            }
            if (!text || text.trim().length === 0) {
                console.error("[LLMHelper] Candidate found but text is empty.");
                console.error("[LLMHelper] Response structure:", JSON.stringify({
                    hasResponseText: !!response.text,
                    candidateFinishReason: candidate.finishReason,
                    candidateContent: candidate.content,
                    candidateParts: candidate.content?.parts,
                }, null, 2));
                if (candidate.finishReason === "MAX_TOKENS") {
                    return "Response was truncated due to length limit. Please try a shorter question or break it into parts.";
                }
                return "";
            }
            console.log(`[LLMHelper] Extracted text length: ${text.length}`);
            return text;
        });
    }
    async extractProblemFromImages(imagePaths) {
        try {
            const prompt = `你是一名辅助分析助手。请结合这些图片内容，提取以下信息，并按 JSON 格式返回：\n{
  "problem_statement": "A clear statement of the problem or situation depicted in the images.",
  "context": "Relevant background or context from the images.",
  "suggested_responses": ["First possible answer or action", "Second possible answer or action", "..."],
  "reasoning": "Explanation of why these suggestions are appropriate."
}\n重要：只返回 JSON 对象本身，不要带 markdown 格式或代码块。`;
            const text = await this.generateWithVisionFallback(IMAGE_ANALYSIS_PROMPT, prompt, imagePaths);
            return JSON.parse(this.cleanJsonResponse(text));
        }
        catch (error) {
            // console.error("Error extracting problem from images:", error)
            throw error;
        }
    }
    async generateSolution(problemInfo) {
        const prompt = `已知下面这个问题或场景：\n${JSON.stringify(problemInfo, null, 2)}\n\n请按以下 JSON 格式给出结果：\n{
  "solution": {
    "code": "The code or main answer here.",
    "problem_statement": "Restate the problem or situation.",
    "context": "Relevant background/context.",
    "suggested_responses": ["First possible answer or action", "Second possible answer or action", "..."],
    "reasoning": "Explanation of why these suggestions are appropriate."
  }
}\n重要：只返回 JSON 对象本身，不要带 markdown 格式或代码块。`;
        try {
            const text = await this.generateWithVisionFallback(IMAGE_ANALYSIS_PROMPT, prompt);
            const parsed = JSON.parse(this.cleanJsonResponse(text));
            return parsed;
        }
        catch (error) {
            throw error;
        }
    }
    async debugSolutionWithImages(problemInfo, currentCode, debugImagePaths) {
        try {
            const prompt = `你是一名辅助分析助手。已知：\n1. 原始问题或场景：${JSON.stringify(problemInfo, null, 2)}\n2. 当前的回答或处理方式：${currentCode}\n3. 图片中提供的调试信息\n\n请分析这些调试信息，并按以下 JSON 格式给出反馈：\n{
  "solution": {
    "code": "The code or main answer here.",
    "problem_statement": "Restate the problem or situation.",
    "context": "Relevant background/context.",
    "suggested_responses": ["First possible answer or action", "Second possible answer or action", "..."],
    "reasoning": "Explanation of why these suggestions are appropriate."
  }
}\n重要：只返回 JSON 对象本身，不要带 markdown 格式或代码块。`;
            const text = await this.generateWithVisionFallback(IMAGE_ANALYSIS_PROMPT, prompt, debugImagePaths);
            const parsed = JSON.parse(this.cleanJsonResponse(text));
            return parsed;
        }
        catch (error) {
            throw error;
        }
    }
    /**
     * NEW: Helper to process image: resize to max 1536px and compress to JPEG 80%
     * drastically reduces token usage and upload time.
     */
    async processImage(path) {
        try {
            const imageBuffer = await fs_1.default.promises.readFile(path);
            // Resize and compress
            const processedBuffer = await (0, sharp_1.default)(imageBuffer)
                .resize({
                width: 1536,
                height: 1536,
                fit: 'inside', // Maintain aspect ratio, max dimension 1536
                withoutEnlargement: true
            })
                .jpeg({ quality: 80 }) // 80% quality JPEG is much smaller than PNG
                .toBuffer();
            return {
                mimeType: "image/jpeg",
                data: processedBuffer.toString("base64")
            };
        }
        catch (error) {
            console.error("[LLMHelper] Failed to process image with sharp:", error);
            // Fallback to raw read if sharp fails
            const data = await fs_1.default.promises.readFile(path);
            return {
                mimeType: "image/png",
                data: data.toString("base64")
            };
        }
    }
    async analyzeImageFiles(imagePaths) {
        try {
            const prompt = `Describe the content of ${imagePaths.length > 1 ? 'these images' : 'this image'} in a short, concise answer. If it contains code or a problem, solve it.`;
            LlmTraceRecorder_1.llmTraceRecorder.updateResolvedInput({
                message: prompt,
                context: "",
                systemPrompt: prompts_1.HARD_SYSTEM_PROMPT,
                imagePaths,
            });
            const text = await this.generateWithVisionFallback(prompts_1.HARD_SYSTEM_PROMPT, prompt, imagePaths);
            return { text: text, timestamp: Date.now() };
        }
        catch (error) {
            console.error("Error analyzing image files:", error);
            return {
                text: `I couldn't analyze the screen right now (${error.message}). Please try again.`,
                timestamp: Date.now()
            };
        }
    }
    async generateWithInternalTextFallback(systemPrompt, userPrompt, options = {}) {
        const finalSystemPrompt = options.applyLanguageInstruction
            ? this.injectLanguageInstruction(systemPrompt)
            : systemPrompt;
        const finalGroqSystemPrompt = options.groqSystemPrompt
            ? (options.applyLanguageInstruction
                ? this.injectLanguageInstruction(options.groqSystemPrompt)
                : options.groqSystemPrompt)
            : finalSystemPrompt;
        const timeoutMs = options.timeoutMs ?? 45000;
        const maxRotations = options.maxRotations ?? 3;
        const tokenEstimate = Math.ceil(userPrompt.length / 4);
        const combinedGeminiPrompt = `${finalSystemPrompt}\n\n${userPrompt}`;
        const combinedGroqPrompt = `${finalGroqSystemPrompt}\n\n${userPrompt}`;
        const openaiModel = this.openaiPreferredModel || this.modelVersionManager.getTextTieredModels(ModelVersionManager_1.TextModelFamily.OPENAI).tier1;
        const alibabaModel = this.alibabaPreferredModel || ALIBABA_MODEL;
        const geminiFlashModel = this.modelVersionManager.getTextTieredModels(ModelVersionManager_1.TextModelFamily.GEMINI_FLASH).tier1;
        const geminiProModel = this.modelVersionManager.getTextTieredModels(ModelVersionManager_1.TextModelFamily.GEMINI_PRO).tier1;
        const claudeModel = this.modelVersionManager.getTextTieredModels(ModelVersionManager_1.TextModelFamily.CLAUDE).tier1;
        const groqModel = this.modelVersionManager.getTextTieredModels(ModelVersionManager_1.TextModelFamily.GROQ).tier1;
        const providers = [];
        if (this.openaiClient) {
            providers.push({
                name: `OpenAI (${openaiModel})`,
                execute: () => this.generateWithOpenai(userPrompt, finalSystemPrompt, undefined, openaiModel)
            });
        }
        if (this.alibabaClient) {
            providers.push({
                name: `Alibaba (${alibabaModel})`,
                execute: () => this.generateWithAlibaba(userPrompt, finalSystemPrompt, undefined, alibabaModel)
            });
        }
        const groqAllowed = !options.skipGroqAboveTokens || tokenEstimate < options.skipGroqAboveTokens;
        if (this.groqClient && groqAllowed) {
            providers.push({
                name: `Groq (${groqModel})`,
                execute: () => this.generateWithGroq(combinedGroqPrompt)
            });
        }
        if (this.claudeClient) {
            providers.push({
                name: `Claude (${claudeModel})`,
                execute: () => this.generateWithClaude(userPrompt, finalSystemPrompt)
            });
        }
        if (this.client) {
            providers.push({
                name: `Gemini Flash (${geminiFlashModel})`,
                execute: () => this.tryGenerateResponse(combinedGeminiPrompt, undefined, geminiFlashModel)
            });
            providers.push({
                name: `Gemini Pro (${geminiProModel})`,
                execute: () => this.tryGenerateResponse(combinedGeminiPrompt, undefined, geminiProModel)
            });
        }
        if (this.customProvider) {
            providers.push({
                name: `Custom Provider (${this.customProvider.name})`,
                execute: () => this.executeCustomProvider(this.customProvider.curlCommand, combinedGeminiPrompt, finalSystemPrompt, userPrompt, "")
            });
        }
        if (this.activeCurlProvider && !this.customProvider) {
            providers.push({
                name: `cURL Provider (${this.activeCurlProvider.name})`,
                execute: () => this.chatWithCurl(userPrompt, finalSystemPrompt)
            });
        }
        if (this.useOllama) {
            providers.push({
                name: `Ollama (${this.ollamaModel})`,
                execute: () => this.callOllama(combinedGeminiPrompt)
            });
        }
        if (providers.length === 0) {
            throw new Error("No LLM provider configured");
        }
        for (let rotation = 0; rotation < maxRotations; rotation++) {
            if (rotation > 0) {
                const backoffMs = 1000 * rotation;
                console.log(`[LLMHelper] Internal text fallback rotation ${rotation + 1}/${maxRotations} after ${backoffMs}ms backoff...`);
                await this.delay(backoffMs);
            }
            for (const provider of providers) {
                try {
                    console.log(`[LLMHelper] Attempting internal text provider ${provider.name}...`);
                    const text = await this.withTimeout(provider.execute(), timeoutMs, provider.name);
                    if (text && text.trim().length > 0) {
                        console.log(`[LLMHelper] Internal text provider ${provider.name} succeeded.`);
                        return this.processResponse(text);
                    }
                    console.warn(`[LLMHelper] Internal text provider ${provider.name} returned empty output.`);
                }
                catch (error) {
                    console.warn(`[LLMHelper] Internal text provider ${provider.name} failed: ${error.message}`);
                }
            }
        }
        throw new Error("All text providers failed");
    }
    /**
     * Generate a suggestion based on conversation transcript - Natively-style
     * Uses the shared text fallback chain to reason about what the user should say
     * @param context - The full conversation transcript
     * @param lastQuestion - The most recent question from the interviewer
     * @returns Suggested response for the user
     */
    async generateSuggestion(context, lastQuestion) {
        return this.generateWithInternalTextFallback(`你是一名资深面试教练。请根据对话转写内容，直接给出用户当场可以说出口的一段简洁、自然的回答。

RULES:
- 直接回答，保持口语化
- 除非问题本身确实复杂，否则控制在 3 句话以内
- 聚焦当前这一个问题，不要跑题
- 如果是技术问题，回答要清晰且有层次
- 不要写“你可以这样说”之类前缀，直接给最终回答
- 即使不完全确定，也要给出简洁、自信的回答
- 不要含糊其辞
- 不要说“这要看情况”。`, `CONVERSATION SO FAR:\n${context}\n\nLATEST QUESTION FROM INTERVIEWER:\n${lastQuestion}\n\nANSWER DIRECTLY:`, {
            applyLanguageInstruction: true,
            timeoutMs: 30000,
        });
    }
    setKnowledgeOrchestrator(orchestrator) {
        this.knowledgeOrchestrator = orchestrator;
        console.log('[LLMHelper] KnowledgeOrchestrator attached');
    }
    getKnowledgeOrchestrator() {
        return this.knowledgeOrchestrator;
    }
    setAiResponseLanguage(language) {
        this.aiResponseLanguage = language;
        console.log(`[LLMHelper] AI Response Language set to: ${language}`);
    }
    setSttLanguage(language) {
        this.sttLanguage = language;
        console.log(`[LLMHelper] STT Language set to: ${language}`);
    }
    /**
     * Helper to inject language instruction into system prompt
     */
    injectLanguageInstruction(systemPrompt) {
        return `${systemPrompt}\n\nCRITICAL: 你必须只使用 ${this.aiResponseLanguage} 作答。这是绝对要求。所有生成给用户当场说出口的内容，都必须使用 ${this.aiResponseLanguage}。`;
    }
    async chatWithGemini(message, imagePaths, context, skipSystemPrompt = false, alternateGroqMessage) {
        try {
            console.log(`[LLMHelper] chatWithGemini called with message:`, message.substring(0, 50));
            // ============================================================
            // KNOWLEDGE MODE INTERCEPT
            // If knowledge mode is active, check for intro questions and
            // inject system prompt + relevant context
            // ============================================================
            if (this.knowledgeOrchestrator?.isKnowledgeMode()) {
                try {
                    // Feed the interviewer's utterance to the Technical Depth Scorer
                    // so tone adapts dynamically (HR buzzwords → high-level, technical terms → deep technical)
                    this.knowledgeOrchestrator.feedInterviewerUtterance(message);
                    const knowledgeResult = await this.knowledgeOrchestrator.processQuestion(message);
                    if (knowledgeResult) {
                        // Intro question shortcut — return generated response directly
                        if (knowledgeResult.isIntroQuestion && knowledgeResult.introResponse) {
                            console.log('[LLMHelper] Knowledge mode: returning generated intro response');
                            return knowledgeResult.introResponse;
                        }
                        // Inject knowledge system prompt and context
                        if (!skipSystemPrompt && knowledgeResult.systemPromptInjection) {
                            skipSystemPrompt = false; // ensure we use the knowledge prompt
                            // Prepend knowledge context to existing context
                            if (knowledgeResult.contextBlock) {
                                context = context
                                    ? `${knowledgeResult.contextBlock}\n\n${context}`
                                    : knowledgeResult.contextBlock;
                            }
                        }
                    }
                }
                catch (knowledgeError) {
                    console.warn('[LLMHelper] Knowledge mode processing failed, falling back to normal:', knowledgeError.message);
                }
            }
            const isMultimodal = !!(imagePaths?.length);
            // Helper to build combined prompts for Groq/Gemini
            const buildMessage = (systemPrompt) => {
                if (skipSystemPrompt) {
                    return context
                        ? `CONTEXT:\n${context}\n\nUSER QUESTION:\n${message}`
                        : message;
                }
                return context
                    ? `${systemPrompt}\n\nCONTEXT:\n${context}\n\nUSER QUESTION:\n${message}`
                    : `${systemPrompt}\n\n${message}`;
            };
            // For OpenAI/Claude: separate system prompt + user message
            const userContent = context
                ? `CONTEXT:\n${context}\n\nUSER QUESTION:\n${message}`
                : message;
            const finalGeminiPrompt = this.injectLanguageInstruction(prompts_1.HARD_SYSTEM_PROMPT);
            const finalGroqPrompt = alternateGroqMessage || this.injectLanguageInstruction(prompts_1.GROQ_SYSTEM_PROMPT);
            const combinedMessages = {
                gemini: buildMessage(finalGeminiPrompt),
                groq: buildMessage(finalGroqPrompt),
            };
            LlmTraceRecorder_1.llmTraceRecorder.updateResolvedInput({
                message,
                context: context || "",
                systemPrompt: skipSystemPrompt ? "" : prompts_1.HARD_SYSTEM_PROMPT,
                imagePaths: imagePaths || [],
                userContent,
            });
            // GROQ FAST TEXT OVERRIDE (Text-Only)
            if (false && this.groqFastTextMode && !isMultimodal && this.groqClient) {
                console.log(`[LLMHelper] ⚡️ Groq Fast Text Mode Active. Routing to Groq...`);
                try {
                    return await this.generateWithGroq(combinedMessages.groq);
                }
                catch (e) {
                    console.warn("[LLMHelper] Groq Fast Text failed, falling back to standard routing:", e.message);
                    // Fall through to standard routing
                }
            }
            // System prompts for OpenAI/Claude (skipped if skipSystemPrompt)
            const openaiSystemPrompt = skipSystemPrompt ? undefined : this.injectLanguageInstruction(prompts_1.OPENAI_SYSTEM_PROMPT);
            const claudeSystemPrompt = skipSystemPrompt ? undefined : this.injectLanguageInstruction(prompts_1.CLAUDE_SYSTEM_PROMPT);
            if (this.groqFastTextMode && !isMultimodal) {
                console.log(`[LLMHelper] Fast text mode active. Trying OpenAI/Alibaba/Groq fast-path.`);
                const fastProviders = [];
                if (this.openaiClient) {
                    fastProviders.push({
                        name: `OpenAI Fast (${this.openaiFastModel})`,
                        execute: () => this.generateWithOpenai(userContent, openaiSystemPrompt, undefined, this.openaiFastModel)
                    });
                }
                if (this.alibabaClient) {
                    fastProviders.push({
                        name: `Alibaba Fast (${this.alibabaFastModel})`,
                        execute: () => this.generateWithAlibaba(userContent, openaiSystemPrompt, undefined, this.alibabaFastModel)
                    });
                }
                if (this.groqClient) {
                    fastProviders.push({
                        name: `Groq Fast (${GROQ_MODEL})`,
                        execute: () => this.generateWithGroq(combinedMessages.groq)
                    });
                }
                for (const provider of fastProviders) {
                    try {
                        console.log(`[LLMHelper] Trying fast-path provider ${provider.name}...`);
                        return await provider.execute();
                    }
                    catch (e) {
                        console.warn(`[LLMHelper] Fast-path provider ${provider.name} failed:`, e.message);
                    }
                }
            }
            if (this.useOllama) {
                return await this.callOllama(combinedMessages.gemini);
            }
            if (this.activeCurlProvider) {
                return await this.chatWithCurl(message, skipSystemPrompt ? undefined : prompts_1.CUSTOM_SYSTEM_PROMPT);
            }
            if (this.customProvider) {
                console.log(`[LLMHelper] Using Custom Provider: ${this.customProvider.name}`);
                // For non-streaming call — use rich CUSTOM prompts since custom providers can be cloud models
                const response = await this.executeCustomProvider(this.customProvider.curlCommand, combinedMessages.gemini, skipSystemPrompt ? "" : prompts_1.CUSTOM_SYSTEM_PROMPT, message, context || "", imagePaths?.[0]);
                return this.processResponse(response);
            }
            // --- Direct Routing based on Selected Model ---
            if (this.isOpenAiModel(this.currentModelId) && this.openaiClient) {
                return await this.generateWithOpenai(userContent, openaiSystemPrompt, imagePaths, this.currentModelId);
            }
            if (this.isAlibabaModel(this.currentModelId) && this.alibabaClient) {
                return await this.generateWithAlibaba(userContent, openaiSystemPrompt, imagePaths, this.currentModelId);
            }
            if (this.isClaudeModel(this.currentModelId) && this.claudeClient) {
                return await this.generateWithClaude(userContent, claudeSystemPrompt, imagePaths);
            }
            if (this.isGroqModel(this.currentModelId) && this.groqClient) {
                if (isMultimodal && imagePaths) {
                    return await this.generateWithGroqMultimodal(userContent, imagePaths, openaiSystemPrompt);
                }
                return await this.generateWithGroq(combinedMessages.groq);
            }
            const providers = [];
            // Get auto-discovered text model IDs from ModelVersionManager
            const textOpenAI = this.openaiPreferredModel || this.modelVersionManager.getTextTieredModels(ModelVersionManager_1.TextModelFamily.OPENAI).tier1;
            const textAlibaba = this.alibabaPreferredModel;
            const textGeminiFlash = this.modelVersionManager.getTextTieredModels(ModelVersionManager_1.TextModelFamily.GEMINI_FLASH).tier1;
            const textGeminiPro = this.modelVersionManager.getTextTieredModels(ModelVersionManager_1.TextModelFamily.GEMINI_PRO).tier1;
            const textClaude = this.modelVersionManager.getTextTieredModels(ModelVersionManager_1.TextModelFamily.CLAUDE).tier1;
            const textGroq = this.modelVersionManager.getTextTieredModels(ModelVersionManager_1.TextModelFamily.GROQ).tier1;
            if (isMultimodal) {
                // MULTIMODAL PROVIDER ORDER: OpenAI -> Alibaba -> Gemini Flash -> Claude -> Gemini Pro -> Groq
                if (this.openaiClient) {
                    providers.push({ name: `OpenAI (${textOpenAI})`, execute: () => this.generateWithOpenai(userContent, openaiSystemPrompt, imagePaths, textOpenAI) });
                }
                if (this.alibabaClient) {
                    providers.push({ name: `Alibaba (${textAlibaba})`, execute: () => this.generateWithAlibaba(userContent, openaiSystemPrompt, imagePaths, textAlibaba) });
                }
                if (this.client) {
                    providers.push({
                        name: `Gemini Flash (${textGeminiFlash})`,
                        execute: () => this.tryGenerateResponse(combinedMessages.gemini, imagePaths, textGeminiFlash)
                    });
                }
                if (this.claudeClient) {
                    providers.push({ name: `Claude (${textClaude})`, execute: () => this.generateWithClaude(userContent, claudeSystemPrompt, imagePaths) });
                }
                if (this.client) {
                    providers.push({
                        name: `Gemini Pro (${textGeminiPro})`,
                        execute: () => this.tryGenerateResponse(combinedMessages.gemini, imagePaths, textGeminiPro)
                    });
                }
                if (this.groqClient) {
                    providers.push({
                        name: `Groq (meta-llama/llama-4-scout-17b-16e-instruct)`,
                        execute: () => this.generateWithGroqMultimodal(userContent, imagePaths, openaiSystemPrompt)
                    });
                }
            }
            else {
                // TEXT-ONLY ORDER: OpenAI -> Alibaba -> Groq -> Claude -> Gemini Flash -> Gemini Pro
                if (this.openaiClient) {
                    providers.push({ name: `OpenAI (${textOpenAI})`, execute: () => this.generateWithOpenai(userContent, openaiSystemPrompt, undefined, textOpenAI) });
                }
                if (this.alibabaClient) {
                    providers.push({ name: `Alibaba (${textAlibaba})`, execute: () => this.generateWithAlibaba(userContent, openaiSystemPrompt, undefined, textAlibaba) });
                }
                if (this.groqClient) {
                    providers.push({ name: `Groq (${textGroq})`, execute: () => this.generateWithGroq(combinedMessages.groq) });
                }
                if (this.claudeClient) {
                    providers.push({ name: `Claude (${textClaude})`, execute: () => this.generateWithClaude(userContent, claudeSystemPrompt) });
                }
                if (this.client) {
                    providers.push({
                        name: `Gemini Flash (${textGeminiFlash})`,
                        execute: () => this.tryGenerateResponse(combinedMessages.gemini, undefined, textGeminiFlash)
                    });
                    providers.push({
                        name: `Gemini Pro (${textGeminiPro})`,
                        execute: () => this.tryGenerateResponse(combinedMessages.gemini, undefined, textGeminiPro)
                    });
                }
            }
            if (providers.length === 0) {
                return "No AI providers configured. Please add at least one API key in Settings.";
            }
            // ============================================================
            // RELENTLESS RETRY: Try all providers, then retry entire chain
            // with exponential backoff. Max 2 full rotations.
            // ============================================================
            const MAX_FULL_ROTATIONS = 3;
            for (let rotation = 0; rotation < MAX_FULL_ROTATIONS; rotation++) {
                if (rotation > 0) {
                    const backoffMs = 1000 * rotation;
                    console.log(`[LLMHelper] 🔄 Non-streaming rotation ${rotation + 1}/${MAX_FULL_ROTATIONS} after ${backoffMs}ms backoff...`);
                    await this.delay(backoffMs);
                }
                for (const provider of providers) {
                    try {
                        console.log(`[LLMHelper] ${rotation === 0 ? '🚀' : '🔁'} Attempting ${provider.name}...`);
                        const rawResponse = await provider.execute();
                        if (rawResponse && rawResponse.trim().length > 0) {
                            console.log(`[LLMHelper] ✅ ${provider.name} succeeded`);
                            return this.processResponse(rawResponse);
                        }
                        console.warn(`[LLMHelper] ⚠️ ${provider.name} returned empty response`);
                    }
                    catch (error) {
                        console.warn(`[LLMHelper] ⚠️ ${provider.name} failed: ${error.message}`);
                    }
                }
            }
            // All exhausted
            console.error("[LLMHelper] ❌ All non-streaming providers exhausted");
            return "I apologize, but I couldn't generate a response. Please try again.";
        }
        catch (error) {
            console.error("[LLMHelper] Critical Error in chatWithGemini:", error);
            if (error.message.includes("503") || error.message.includes("overloaded")) {
                return "The AI service is currently overloaded. Please try again in a moment.";
            }
            if (error.message.includes("API key")) {
                return "Authentication failed. Please check your API key in settings.";
            }
            return `I encountered an error: ${error.message || "Unknown error"}. Please try again.`;
        }
    }
    /**
     * Generate content using only reasoning-capable models.
     * Priority: OpenAI → Claude → Gemini Pro → Groq (last resort).
     * Used for structured JSON output tasks (resume/JD/company research).
     * NOTE: Does NOT mutate this.geminiModel — calls Gemini Pro directly to avoid race conditions.
     */
    async generateContentStructured(message) {
        const providers = [];
        // Priority 1: OpenAI
        if (this.openaiClient) {
            providers.push({ name: `OpenAI (${this.openaiPreferredModel})`, execute: () => this.generateWithOpenai(message) });
        }
        // Priority 2: Alibaba/Qwen
        if (this.alibabaClient) {
            providers.push({
                name: `Alibaba (${this.alibabaPreferredModel})`,
                execute: () => this.generateWithAlibaba(message, undefined, undefined, this.alibabaPreferredModel)
            });
        }
        // Priority 3: Claude
        if (this.claudeClient) {
            providers.push({ name: `Claude (${CLAUDE_MODEL})`, execute: () => this.generateWithClaude(message) });
        }
        // Priority 4: Gemini Pro (Skip Flash, and don't mutate this.geminiModel to avoid race conditions)
        if (this.client) {
            providers.push({
                name: `Gemini Pro (${GEMINI_PRO_MODEL})`,
                execute: async () => {
                    // Call the API directly with the Pro model instead of touching shared state
                    const response = await this.withRetry(async () => {
                        // @ts-ignore
                        const res = await this.client.models.generateContent({
                            model: GEMINI_PRO_MODEL,
                            contents: [{ role: 'user', parts: [{ text: message }] }],
                            config: { maxOutputTokens: MAX_OUTPUT_TOKENS, temperature: 0.4 }
                        });
                        const candidate = res.candidates?.[0];
                        if (!candidate)
                            return '';
                        if (res.text)
                            return res.text;
                        const parts = candidate.content?.parts ?? [];
                        return (Array.isArray(parts) ? parts : [parts]).map((p) => p?.text ?? '').join('');
                    });
                    return response;
                }
            });
        }
        // Priority 5: Groq (Fallback despite JSON hallucination risks)
        if (this.groqClient) {
            providers.push({ name: `Groq (${GROQ_MODEL}) fallback`, execute: () => this.generateWithGroq(message) });
        }
        if (providers.length === 0) {
            throw new Error('No reasoning model available. Please configure an OpenAI, Alibaba, Claude, Gemini, or Groq API key.');
        }
        for (const provider of providers) {
            try {
                console.log(`[LLMHelper] 🧠 Structured generation: trying ${provider.name}...`);
                const result = await provider.execute();
                if (result && result.trim().length > 0) {
                    console.log(`[LLMHelper] ✅ Structured generation succeeded with ${provider.name}`);
                    return result;
                }
                console.warn(`[LLMHelper] ⚠️ ${provider.name} returned empty response`);
            }
            catch (error) {
                console.warn(`[LLMHelper] ⚠️ Structured generation: ${provider.name} failed: ${error.message}`);
            }
        }
        throw new Error('All reasoning models failed for structured generation');
    }
    async generateWithGroq(fullMessage) {
        if (!this.groqClient)
            throw new Error("Groq client not initialized");
        await this.rateLimiters.groq.acquire();
        // Non-streaming Groq call
        const response = await this.groqClient.chat.completions.create({
            model: GROQ_MODEL,
            messages: [{ role: "user", content: fullMessage }],
            temperature: 0.4,
            max_tokens: 8192,
            stream: false
        });
        return response.choices[0]?.message?.content || "";
    }
    /**
     * Non-streaming OpenAI generation with proper system/user separation
     */
    async generateWithOpenai(userMessage, systemPrompt, imagePaths, modelOverride) {
        return this.generateWithOpenAICompatible('openai', userMessage, systemPrompt, imagePaths, modelOverride);
    }
    async generateWithAlibaba(userMessage, systemPrompt, imagePaths, modelOverride) {
        return this.generateWithOpenAICompatible('alibaba', userMessage, systemPrompt, imagePaths, modelOverride);
    }
    // The handler for cURL requests
    async chatWithCurl(userMessage, systemPrompt) {
        if (!this.activeCurlProvider)
            throw new Error("No cURL provider active");
        const { curlCommand, responsePath } = this.activeCurlProvider;
        // 1. Parse cURL to config object
        // @ts-ignore
        const curlConfig = (0, curl_to_json_1.default)(curlCommand);
        // 2. Prepare Variables
        // We combine System Prompt + User Message into {{TEXT}} for simplicity in raw mode, 
        // or you can support {{SYSTEM}} if you want to get fancy later.
        const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${userMessage}` : userMessage;
        const variables = {
            TEXT: fullPrompt.replace(/\n/g, "\\n").replace(/"/g, '\\"') // Basic escaping
        };
        // 3. Inject Variables into URL, Headers, and Body
        const url = (0, curlUtils_1.deepVariableReplacer)(curlConfig.url, variables);
        const headers = (0, curlUtils_1.deepVariableReplacer)(curlConfig.header || {}, variables);
        const data = (0, curlUtils_1.deepVariableReplacer)(curlConfig.data || {}, variables);
        // 4. Execute
        try {
            const response = await (0, axios_1.default)({
                method: curlConfig.method || 'POST',
                url: url,
                headers: headers,
                data: data
            });
            // 5. Extract Answer
            // If user didn't specify a path, try to guess or dump string
            if (!responsePath)
                return JSON.stringify(response.data);
            const answer = (0, curlUtils_1.getByPath)(response.data, responsePath);
            if (typeof answer === 'string')
                return answer;
            return JSON.stringify(answer); // Fallback if they pointed to an object
        }
        catch (error) {
            console.error("[LLMHelper] cURL Execution Error:", error.message);
            return `Error: ${error.message}`;
        }
    }
    /**
     * Non-streaming Claude generation with proper system/user separation
     */
    async generateWithClaude(userMessage, systemPrompt, imagePaths) {
        if (!this.claudeClient)
            throw new Error("Claude client not initialized");
        await this.rateLimiters.claude.acquire();
        const content = [];
        if (imagePaths?.length) {
            for (const p of imagePaths) {
                if (fs_1.default.existsSync(p)) {
                    const imageData = await fs_1.default.promises.readFile(p);
                    content.push({
                        type: "image",
                        source: {
                            type: "base64",
                            media_type: "image/png",
                            data: imageData.toString("base64")
                        }
                    });
                }
            }
        }
        content.push({ type: "text", text: userMessage });
        const response = await this.claudeClient.messages.create({
            model: CLAUDE_MODEL,
            max_tokens: CLAUDE_MAX_OUTPUT_TOKENS,
            ...(systemPrompt ? { system: systemPrompt } : {}),
            messages: [{ role: "user", content }],
        });
        const textBlock = response.content.find((block) => block.type === 'text');
        return textBlock?.text || "";
    }
    /**
     * Executes a custom cURL provider defined by the user
     */
    async executeCustomProvider(curlCommand, combinedMessage, systemPrompt, rawUserMessage, context, imagePath, responsePath) {
        // 1. Parse cURL to JSON object
        const requestConfig = (0, curl_to_json_1.default)(curlCommand);
        // 2. Prepare Image (if any)
        let base64Image = "";
        if (imagePath) {
            try {
                const imageData = await fs_1.default.promises.readFile(imagePath);
                base64Image = imageData.toString("base64");
            }
            catch (e) {
                console.warn("Failed to read image for Custom Provider:", e);
            }
        }
        // 3. Prepare Variables
        const variables = {
            TEXT: combinedMessage, // Deprecated but kept for compat: System + Context + User
            PROMPT: combinedMessage, // Alias for TEXT
            SYSTEM_PROMPT: systemPrompt, // Raw System Prompt
            USER_MESSAGE: rawUserMessage, // Raw User Message
            CONTEXT: context, // Raw Context
            IMAGE_BASE64: base64Image, // Base64 encoded image string
        };
        // 4. Inject Variables into URL, Headers, and Body
        const url = (0, curlUtils_1.deepVariableReplacer)(requestConfig.url, variables);
        const headers = (0, curlUtils_1.deepVariableReplacer)(requestConfig.header || {}, variables);
        const body = (0, curlUtils_1.deepVariableReplacer)(requestConfig.data || {}, variables);
        // 5. Execute Fetch
        try {
            const method = requestConfig.method || 'POST';
            const requestInit = {
                method,
                headers,
            };
            if (!['GET', 'HEAD'].includes(method.toUpperCase())) {
                requestInit.body = typeof body === 'string' ? body : JSON.stringify(body);
            }
            const response = await fetch(url, requestInit);
            const rawText = await response.text();
            const { data, text } = this.parseCustomProviderResponse(rawText, responsePath);
            console.log(`[LLMHelper] Custom Provider raw response:`, (typeof data === 'string' ? data : JSON.stringify(data)).substring(0, 1000));
            if (!response.ok) {
                const errorPreview = (typeof data === 'string' ? data : JSON.stringify(data)).substring(0, 200);
                throw new Error(`Custom Provider HTTP ${response.status}: ${errorPreview}`);
            }
            // 6. Extract Answer - try configured path first, then common formats
            const extracted = text;
            console.log(`[LLMHelper] Custom Provider extracted text length: ${extracted.length}`);
            return extracted;
        }
        catch (error) {
            console.error("Custom Provider Error:", error);
            throw error;
        }
    }
    /**
     * Try to extract text content from common LLM API response formats.
     * Supports: Ollama, OpenAI, Anthropic, and generic formats.
     */
    extractFromCommonFormats(data, fallbackToJson = true) {
        if (!data || typeof data === 'string')
            return data || "";
        // Ollama format: { response: "..." }
        if (typeof data.response === 'string')
            return data.response;
        // OpenAI format: { choices: [{ message: { content: "..." } }] }
        if (data.choices?.[0]?.message?.content)
            return data.choices[0].message.content;
        // OpenAI delta/streaming format: { choices: [{ delta: { content: "..." } }] }
        if (data.choices?.[0]?.delta?.content)
            return data.choices[0].delta.content;
        // Anthropic format: { content: [{ text: "..." }] }
        if (Array.isArray(data.content) && data.content[0]?.text)
            return data.content[0].text;
        // Generic text field
        if (typeof data.text === 'string')
            return data.text;
        // Generic output field
        if (typeof data.output === 'string')
            return data.output;
        // Generic result field
        if (typeof data.result === 'string')
            return data.result;
        if (!fallbackToJson) {
            return "";
        }
        // Fallback: stringify the whole response
        console.warn("[LLMHelper] Could not extract text from custom provider response, returning raw JSON");
        return JSON.stringify(data);
    }
    extractFromCustomProviderPayload(data, responsePath) {
        if (responsePath?.trim()) {
            const extracted = (0, curlUtils_1.getByPath)(data, responsePath.trim());
            if (typeof extracted === 'string')
                return extracted;
            if (extracted !== undefined && extracted !== null)
                return JSON.stringify(extracted);
        }
        return this.extractFromCommonFormats(data);
    }
    extractStreamingTextFromCustomProviderPayload(data, responsePath) {
        if (responsePath?.trim()) {
            const extracted = (0, curlUtils_1.getByPath)(data, responsePath.trim());
            if (typeof extracted === 'string')
                return extracted;
            if (typeof extracted === 'number' || typeof extracted === 'boolean')
                return String(extracted);
            return "";
        }
        return this.extractFromCommonFormats(data, false);
    }
    splitConcatenatedJsonPayloads(rawText) {
        const payloads = [];
        let start = -1;
        let depth = 0;
        let inString = false;
        let escaping = false;
        for (let i = 0; i < rawText.length; i++) {
            const char = rawText[i];
            if (start === -1) {
                if (/\s/.test(char))
                    continue;
                if (char !== "{" && char !== "[")
                    return null;
                start = i;
                depth = 1;
                inString = false;
                escaping = false;
                continue;
            }
            if (inString) {
                if (escaping) {
                    escaping = false;
                    continue;
                }
                if (char === "\\") {
                    escaping = true;
                    continue;
                }
                if (char === "\"") {
                    inString = false;
                }
                continue;
            }
            if (char === "\"") {
                inString = true;
                continue;
            }
            if (char === "{" || char === "[") {
                depth++;
                continue;
            }
            if (char === "}" || char === "]") {
                depth--;
                if (depth < 0)
                    return null;
                if (depth === 0) {
                    const segment = rawText.slice(start, i + 1).trim();
                    try {
                        payloads.push(JSON.parse(segment));
                    }
                    catch {
                        return null;
                    }
                    start = -1;
                }
            }
        }
        if (inString || escaping || depth !== 0 || start !== -1) {
            return null;
        }
        return payloads.length > 1 ? payloads : null;
    }
    normalizeCustomProviderPlainTextFragment(fragment) {
        const normalized = fragment
            .split(/\r?\n/)
            .map(line => line.trim())
            .map(line => {
            if (!line || line === "[DONE]" || line === "data:")
                return "";
            if (line.startsWith("event:"))
                return "";
            if (line.startsWith("data:")) {
                const rest = line.substring(5).trim();
                if (!rest || rest === "[DONE]")
                    return "";
                return rest;
            }
            return line;
        })
            .filter(Boolean)
            .join("\n");
        return normalized.trim();
    }
    parseCustomProviderSequence(rawText, responsePath) {
        const parts = [];
        let start = -1;
        let depth = 0;
        let inString = false;
        let escaping = false;
        let textBuffer = "";
        const flushTextBuffer = () => {
            const normalized = this.normalizeCustomProviderPlainTextFragment(textBuffer);
            if (normalized) {
                parts.push({ type: "text", value: normalized });
            }
            textBuffer = "";
        };
        for (let i = 0; i < rawText.length; i++) {
            const char = rawText[i];
            if (start === -1) {
                if (char === "{" || char === "[") {
                    flushTextBuffer();
                    start = i;
                    depth = 1;
                    inString = false;
                    escaping = false;
                    continue;
                }
                textBuffer += char;
                continue;
            }
            if (inString) {
                if (escaping) {
                    escaping = false;
                    continue;
                }
                if (char === "\\") {
                    escaping = true;
                    continue;
                }
                if (char === "\"") {
                    inString = false;
                }
                continue;
            }
            if (char === "\"") {
                inString = true;
                continue;
            }
            if (char === "{" || char === "[") {
                depth++;
                continue;
            }
            if (char === "}" || char === "]") {
                depth--;
                if (depth < 0)
                    return null;
                if (depth === 0) {
                    const segment = rawText.slice(start, i + 1).trim();
                    try {
                        parts.push({ type: "payload", value: JSON.parse(segment) });
                    }
                    catch {
                        return null;
                    }
                    start = -1;
                }
            }
        }
        if (inString || escaping || depth !== 0 || start !== -1) {
            return null;
        }
        flushTextBuffer();
        const payloads = parts
            .filter((part) => part.type === "payload")
            .map(part => part.value);
        if (payloads.length === 0) {
            return null;
        }
        return {
            data: payloads,
            text: parts
                .map(part => part.type === "text"
                ? part.value
                : this.extractStreamingTextFromCustomProviderPayload(part.value, responsePath))
                .filter(Boolean)
                .join("")
        };
    }
    parseCustomProviderResponse(rawText, responsePath) {
        const trimmed = rawText.trim();
        if (!trimmed)
            return { data: {}, text: "" };
        const lines = trimmed.split(/\r?\n/);
        const structuredPayloads = [];
        const structuredTexts = [];
        let sawStructured = false;
        for (const line of lines) {
            const parsed = this.parseStreamLine(line, responsePath);
            if (parsed) {
                sawStructured = true;
                structuredPayloads.push(parsed.payload);
                if (parsed.text) {
                    structuredTexts.push(parsed.text);
                }
                continue;
            }
            const sequencedLine = this.parseCustomProviderSequence(line, responsePath);
            if (sequencedLine) {
                sawStructured = true;
                structuredPayloads.push(...sequencedLine.data);
                if (sequencedLine.text) {
                    structuredTexts.push(sequencedLine.text);
                }
            }
        }
        if (sawStructured) {
            return {
                data: structuredPayloads.length > 0 ? structuredPayloads : trimmed,
                text: structuredTexts.join('')
            };
        }
        try {
            const data = JSON.parse(trimmed);
            return {
                data,
                text: this.extractFromCustomProviderPayload(data, responsePath)
            };
        }
        catch {
            const sequenced = this.parseCustomProviderSequence(trimmed, responsePath);
            if (sequenced) {
                return sequenced;
            }
            return {
                data: trimmed,
                text: trimmed
            };
        }
    }
    /**
     * Map UNIVERSAL (local model) prompts to richer CUSTOM prompts.
     * Custom providers can be any cloud model, so they get detailed prompts.
     */
    mapToCustomPrompt(prompt) {
        // Map from concise UNIVERSAL to rich CUSTOM equivalents
        if (prompt === prompts_1.UNIVERSAL_SYSTEM_PROMPT || prompt === prompts_1.HARD_SYSTEM_PROMPT)
            return prompts_1.CUSTOM_SYSTEM_PROMPT;
        if (prompt === prompts_1.UNIVERSAL_ANSWER_PROMPT)
            return prompts_1.CUSTOM_ANSWER_PROMPT;
        if (prompt === prompts_1.UNIVERSAL_WHAT_TO_ANSWER_PROMPT)
            return prompts_1.CUSTOM_WHAT_TO_ANSWER_PROMPT;
        if (prompt === prompts_1.UNIVERSAL_RECAP_PROMPT)
            return prompts_1.CUSTOM_RECAP_PROMPT;
        if (prompt === prompts_1.UNIVERSAL_FOLLOWUP_PROMPT)
            return prompts_1.CUSTOM_FOLLOWUP_PROMPT;
        if (prompt === prompts_1.UNIVERSAL_FOLLOW_UP_QUESTIONS_PROMPT)
            return prompts_1.CUSTOM_FOLLOW_UP_QUESTIONS_PROMPT;
        if (prompt === prompts_1.UNIVERSAL_ASSIST_PROMPT)
            return prompts_1.CUSTOM_ASSIST_PROMPT;
        // If it's already a different override (e.g. user-supplied), pass through
        return prompt;
    }
    async tryGenerateResponse(fullMessage, imagePaths, modelIdOverride) {
        let rawResponse;
        if (imagePaths?.length) {
            const contents = [{ text: fullMessage }];
            for (const p of imagePaths) {
                if (fs_1.default.existsSync(p)) {
                    const imageData = await fs_1.default.promises.readFile(p);
                    contents.push({
                        inlineData: {
                            mimeType: "image/png",
                            data: imageData.toString("base64")
                        }
                    });
                }
            }
            // Use current model for multimodal (allows Pro fallback)
            if (this.client) {
                rawResponse = await this.generateContent(contents, modelIdOverride);
            }
            else {
                throw new Error("No LLM provider configured");
            }
        }
        else {
            // Text-only chat
            if (this.useOllama) {
                rawResponse = await this.callOllama(fullMessage);
            }
            else if (this.client) {
                rawResponse = await this.generateContent([{ text: fullMessage }], modelIdOverride);
            }
            else {
                throw new Error("No LLM provider configured");
            }
        }
        return rawResponse || "";
    }
    /**
     * Non-streaming multimodal response from Groq using Llama 4 Scout
     */
    async generateWithGroqMultimodal(userMessage, imagePaths, systemPrompt) {
        if (!this.groqClient)
            throw new Error("Groq client not initialized");
        const messages = [];
        if (systemPrompt) {
            messages.push({ role: "system", content: systemPrompt });
        }
        const contentParts = [{ type: "text", text: userMessage }];
        for (const p of imagePaths) {
            if (fs_1.default.existsSync(p)) {
                const imageData = await fs_1.default.promises.readFile(p);
                contentParts.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageData.toString("base64")}` } });
            }
        }
        messages.push({ role: "user", content: contentParts });
        const response = await this.groqClient.chat.completions.create({
            model: "meta-llama/llama-4-scout-17b-16e-instruct",
            messages,
            temperature: 1,
            max_completion_tokens: 28672,
            top_p: 1,
            stream: false,
            stop: null
        });
        return response.choices[0]?.message?.content || "";
    }
    /**
     * Universal non-streaming fallback helper for internal operations (screenshot analysis, problem extraction, etc.)
     *
     * THREE-TIER RETRY ROTATION (self-improving):
     *   Tier 1: Pinned stable models (promoted only when 2+ minor versions behind)
     *   Tier 2: Latest auto-discovered models (updated every ~14 days) — 1st retry
     *   Tier 3: Same as Tier 2 — 2nd retry (with backoff between tiers)
     *
     * Provider order per tier: OpenAI -> Gemini Flash -> Claude -> Gemini Pro -> Groq Scout
     * After all cloud tiers: Custom Provider -> cURL Provider -> Ollama
     */
    async generateWithVisionFallback(systemPrompt, userPrompt, imagePaths = []) {
        const isMultimodal = imagePaths.length > 0;
        // Helper: build a provider attempt for a given family + model ID
        const buildProviderForFamily = (family, modelId) => {
            switch (family) {
                case ModelVersionManager_1.ModelFamily.OPENAI:
                    if (!this.openaiClient)
                        return null;
                    return {
                        name: `OpenAI (${modelId})`,
                        execute: () => this.generateWithOpenai(userPrompt, systemPrompt, isMultimodal ? imagePaths : undefined, modelId)
                    };
                case ModelVersionManager_1.ModelFamily.GEMINI_FLASH:
                    if (!this.client)
                        return null;
                    if (isMultimodal) {
                        return {
                            name: `Gemini Flash (${modelId})`,
                            execute: async () => {
                                const contents = [{ text: `${systemPrompt}\n\n${userPrompt}` }];
                                for (const p of imagePaths) {
                                    if (fs_1.default.existsSync(p)) {
                                        const { mimeType, data } = await this.processImage(p);
                                        contents.push({ inlineData: { mimeType, data } });
                                    }
                                }
                                return await this.generateContent(contents, modelId);
                            }
                        };
                    }
                    return {
                        name: `Gemini Flash (${modelId})`,
                        execute: () => this.generateContent([{ text: `${systemPrompt}\n\n${userPrompt}` }], modelId)
                    };
                case ModelVersionManager_1.ModelFamily.CLAUDE:
                    if (!this.claudeClient)
                        return null;
                    return {
                        name: `Claude (${modelId})`,
                        execute: () => this.generateWithClaude(userPrompt, systemPrompt, isMultimodal ? imagePaths : undefined)
                    };
                case ModelVersionManager_1.ModelFamily.GEMINI_PRO:
                    if (!this.client)
                        return null;
                    if (isMultimodal) {
                        return {
                            name: `Gemini Pro (${modelId})`,
                            execute: async () => {
                                const contents = [{ text: `${systemPrompt}\n\n${userPrompt}` }];
                                for (const p of imagePaths) {
                                    if (fs_1.default.existsSync(p)) {
                                        const { mimeType, data } = await this.processImage(p);
                                        contents.push({ inlineData: { mimeType, data } });
                                    }
                                }
                                return await this.generateContent(contents, modelId);
                            }
                        };
                    }
                    return {
                        name: `Gemini Pro (${modelId})`,
                        execute: () => this.generateContent([{ text: `${systemPrompt}\n\n${userPrompt}` }], modelId)
                    };
                case ModelVersionManager_1.ModelFamily.GROQ_LLAMA:
                    if (!this.groqClient)
                        return null;
                    if (isMultimodal) {
                        return {
                            name: `Groq (${modelId})`,
                            execute: () => this.generateWithGroqMultimodal(userPrompt, imagePaths, systemPrompt)
                        };
                    }
                    return {
                        name: `Groq (${modelId})`,
                        execute: () => this.generateWithGroq(`${systemPrompt}\n\n${userPrompt}`)
                    };
                default:
                    return null;
            }
        };
        // ──────────────────────────────────────────────────────────────────
        // Build 3-tier retry rotation from ModelVersionManager
        // ──────────────────────────────────────────────────────────────────
        const allTiers = this.modelVersionManager.getAllVisionTiers();
        const alibabaVisionModel = this.alibabaPreferredModel || ALIBABA_MODEL;
        const buildTierProviders = (tierKey) => {
            const result = [];
            if (this.alibabaClient) {
                result.push({
                    name: `Alibaba (${alibabaVisionModel})`,
                    execute: () => this.generateWithAlibaba(userPrompt, systemPrompt, isMultimodal ? imagePaths : undefined, alibabaVisionModel)
                });
            }
            for (const entry of allTiers) {
                const modelId = entry[tierKey];
                const attempt = buildProviderForFamily(entry.family, modelId);
                if (attempt)
                    result.push(attempt);
            }
            return result;
        };
        const tier1Providers = buildTierProviders('tier1');
        const tier2Providers = buildTierProviders('tier2');
        const tier3Providers = buildTierProviders('tier3'); // Same as tier2 — pure retry
        // ──────────────────────────────────────────────────────────────────
        // Local fallback providers (appended after all cloud tiers)
        // ──────────────────────────────────────────────────────────────────
        const localProviders = [];
        if (this.customProvider) {
            if (isMultimodal) {
                localProviders.push({
                    name: `Custom Provider (${this.customProvider.name})`,
                    execute: () => this.executeCustomProvider(this.customProvider.curlCommand, `${systemPrompt}\n\n${userPrompt}`, systemPrompt, userPrompt, "", imagePaths[0])
                });
            }
            else {
                localProviders.push({
                    name: `Custom Provider (${this.customProvider.name})`,
                    execute: () => this.executeCustomProvider(this.customProvider.curlCommand, `${systemPrompt}\n\n${userPrompt}`, systemPrompt, userPrompt, "")
                });
            }
        }
        if (this.activeCurlProvider && !this.customProvider) {
            localProviders.push({
                name: `cURL Provider (${this.activeCurlProvider.name})`,
                execute: () => this.chatWithCurl(userPrompt, systemPrompt)
            });
        }
        if (this.useOllama) {
            localProviders.push({
                name: `Ollama (${this.ollamaModel})`,
                execute: () => this.callOllama(`${systemPrompt}\n\n${userPrompt}`)
            });
        }
        // ──────────────────────────────────────────────────────────────────
        // Execute 3-tier rotation with exponential backoff between tiers
        // ──────────────────────────────────────────────────────────────────
        const tiers = [
            { label: 'Tier 1 (Stable)', providers: tier1Providers },
            { label: 'Tier 2 (Latest)', providers: tier2Providers },
            { label: 'Tier 3 (Retry)', providers: tier3Providers },
        ];
        for (let tierIndex = 0; tierIndex < tiers.length; tierIndex++) {
            const tier = tiers[tierIndex];
            if (tier.providers.length === 0)
                continue;
            // Exponential backoff between tiers (skip for first tier)
            if (tierIndex > 0) {
                const backoffMs = 1000 * Math.pow(2, tierIndex - 1);
                console.log(`[LLMHelper] 🔄 Escalating to ${tier.label} after ${backoffMs}ms backoff...`);
                await new Promise(resolve => setTimeout(resolve, backoffMs));
            }
            for (const provider of tier.providers) {
                try {
                    const emoji = tierIndex === 0 ? '🚀' : tierIndex === 1 ? '🔁' : '🆘';
                    console.log(`[LLMHelper] ${emoji} [${tier.label}] Attempting ${provider.name}...`);
                    const result = await provider.execute();
                    if (result && result.trim().length > 0) {
                        console.log(`[LLMHelper] ✅ [${tier.label}] ${provider.name} succeeded.`);
                        return result;
                    }
                    console.warn(`[LLMHelper] ⚠️ [${tier.label}] ${provider.name} returned empty response`);
                }
                catch (err) {
                    console.warn(`[LLMHelper] ⚠️ [${tier.label}] ${provider.name} failed: ${err.message}`);
                    // Event-driven discovery: trigger on 404 / model-not-found errors
                    const errMsg = (err.message || '').toLowerCase();
                    if (errMsg.includes('404') || errMsg.includes('not found') || errMsg.includes('deprecated')) {
                        this.modelVersionManager.onModelError(provider.name).catch(() => { });
                    }
                }
            }
        }
        // ──────────────────────────────────────────────────────────────────
        // Local fallback — absolute last resort after all cloud tiers exhausted
        // ──────────────────────────────────────────────────────────────────
        for (const provider of localProviders) {
            try {
                console.log(`[LLMHelper] 🏠 [Local Fallback] Attempting ${provider.name}...`);
                const result = await provider.execute();
                if (result && result.trim().length > 0) {
                    console.log(`[LLMHelper] ✅ [Local Fallback] ${provider.name} succeeded.`);
                    return result;
                }
            }
            catch (err) {
                console.warn(`[LLMHelper] ⚠️ [Local Fallback] ${provider.name} failed: ${err.message}`);
            }
        }
        throw new Error("All AI providers failed across all 3 tiers and local fallbacks.");
    }
    /**
     * Stream chat response with Groq-first fallback chain for text-only,
     * and Gemini-only for multimodal (images)
     *
     * TEXT-ONLY FALLBACK CHAIN:
     * 1. Groq (llama-3.3-70b-versatile) - Primary
     * 2. Gemini Flash - 1st fallback
     * 3. Gemini Flash + Pro parallel - 2nd fallback
     * 4. Gemini Flash retries (max 3) - Last resort
     *
     * MULTIMODAL: Gemini-only (existing logic)
     */
    async *streamChatWithGemini(message, imagePaths, context, skipSystemPrompt = false) {
        console.log(`[LLMHelper] streamChatWithGemini called with message:`, message.substring(0, 50));
        const isMultimodal = !!(imagePaths?.length);
        // Build single-string messages for Groq/Gemini (which use combined prompts)
        const buildCombinedMessage = (systemPrompt) => {
            const finalPrompt = skipSystemPrompt ? systemPrompt : this.injectLanguageInstruction(systemPrompt);
            if (skipSystemPrompt) {
                return context
                    ? `CONTEXT:\n${context}\n\nUSER QUESTION:\n${message}`
                    : message;
            }
            return context
                ? `${finalPrompt}\n\nCONTEXT:\n${context}\n\nUSER QUESTION:\n${message}`
                : `${finalPrompt}\n\n${message}`;
        };
        // For OpenAI/Claude: separate system prompt + user message (proper API pattern)
        const userContent = context
            ? `CONTEXT:\n${context}\n\nUSER QUESTION:\n${message}`
            : message;
        const combinedMessages = {
            gemini: buildCombinedMessage(prompts_1.HARD_SYSTEM_PROMPT),
            groq: buildCombinedMessage(prompts_1.GROQ_SYSTEM_PROMPT),
        };
        LlmTraceRecorder_1.llmTraceRecorder.updateResolvedInput({
            message,
            context: context || "",
            systemPrompt: skipSystemPrompt ? "" : prompts_1.HARD_SYSTEM_PROMPT,
            imagePaths: imagePaths || [],
            userContent,
        });
        if (this.useOllama) {
            const response = await this.callOllama(combinedMessages.gemini);
            yield response;
            return;
        }
        const providers = [];
        // System prompts for OpenAI/Claude (skipped if skipSystemPrompt)
        const openaiSystemPrompt = skipSystemPrompt ? undefined : this.injectLanguageInstruction(prompts_1.OPENAI_SYSTEM_PROMPT);
        const claudeSystemPrompt = skipSystemPrompt ? undefined : this.injectLanguageInstruction(prompts_1.CLAUDE_SYSTEM_PROMPT);
        if (this.groqFastTextMode && !isMultimodal) {
            console.log(`[LLMHelper] Fast text mode active for streaming. Trying OpenAI/Alibaba/Groq fast-path.`);
            const fastProviders = [];
            if (this.openaiClient) {
                fastProviders.push({
                    name: `OpenAI Fast (${this.openaiFastModel})`,
                    execute: () => this.streamWithOpenai(userContent, openaiSystemPrompt, this.openaiFastModel)
                });
            }
            if (this.alibabaClient) {
                fastProviders.push({
                    name: `Alibaba Fast (${this.alibabaFastModel})`,
                    execute: () => this.streamWithAlibaba(userContent, openaiSystemPrompt, this.alibabaFastModel)
                });
            }
            if (this.groqClient) {
                fastProviders.push({
                    name: `Groq Fast (${GROQ_MODEL})`,
                    execute: () => this.streamWithGroq(combinedMessages.groq)
                });
            }
            for (const provider of fastProviders) {
                try {
                    console.log(`[LLMHelper] Trying streaming fast-path provider ${provider.name}...`);
                    yield* provider.execute();
                    return;
                }
                catch (err) {
                    console.warn(`[LLMHelper] Streaming fast-path provider ${provider.name} failed: ${err.message}`);
                }
            }
        }
        // Get auto-discovered text model IDs from ModelVersionManager
        const textOpenAI = this.openaiPreferredModel || this.modelVersionManager.getTextTieredModels(ModelVersionManager_1.TextModelFamily.OPENAI).tier1;
        const textAlibaba = this.alibabaPreferredModel;
        const textGeminiFlash = this.modelVersionManager.getTextTieredModels(ModelVersionManager_1.TextModelFamily.GEMINI_FLASH).tier1;
        const textGeminiPro = this.modelVersionManager.getTextTieredModels(ModelVersionManager_1.TextModelFamily.GEMINI_PRO).tier1;
        const textClaude = this.modelVersionManager.getTextTieredModels(ModelVersionManager_1.TextModelFamily.CLAUDE).tier1;
        const textGroq = this.modelVersionManager.getTextTieredModels(ModelVersionManager_1.TextModelFamily.GROQ).tier1;
        if (isMultimodal) {
            // MULTIMODAL PROVIDER ORDER: OpenAI -> Gemini Flash -> Claude -> Gemini Pro -> Groq Scout 4
            if (this.openaiClient) {
                providers.push({ name: `OpenAI (${textOpenAI})`, execute: () => this.streamWithOpenaiMultimodal(userContent, imagePaths, openaiSystemPrompt, textOpenAI) });
            }
            if (this.alibabaClient) {
                providers.push({ name: `Alibaba (${textAlibaba})`, execute: () => this.streamWithAlibabaMultimodal(userContent, imagePaths, openaiSystemPrompt, textAlibaba) });
            }
            if (this.client) {
                providers.push({ name: `Gemini Flash (${textGeminiFlash})`, execute: () => this.streamWithGeminiModel(combinedMessages.gemini, textGeminiFlash, imagePaths) });
            }
            if (this.claudeClient) {
                providers.push({ name: `Claude (${textClaude})`, execute: () => this.streamWithClaudeMultimodal(userContent, imagePaths, claudeSystemPrompt) });
            }
            if (this.client) {
                providers.push({ name: `Gemini Pro (${textGeminiPro})`, execute: () => this.streamWithGeminiModel(combinedMessages.gemini, textGeminiPro, imagePaths) });
            }
            if (this.groqClient) {
                providers.push({ name: `Groq (meta-llama/llama-4-scout-17b-16e-instruct)`, execute: () => this.streamWithGroqMultimodal(userContent, imagePaths, openaiSystemPrompt) });
            }
        }
        else {
            // TEXT-ONLY PROVIDER ORDER: Groq → OpenAI → Claude → Gemini Flash → Gemini Pro
            if (this.openaiClient) {
                providers.push({ name: `OpenAI (${textOpenAI})`, execute: () => this.streamWithOpenai(userContent, openaiSystemPrompt, textOpenAI) });
            }
            if (this.alibabaClient) {
                providers.push({ name: `Alibaba (${textAlibaba})`, execute: () => this.streamWithAlibaba(userContent, openaiSystemPrompt, textAlibaba) });
            }
            if (this.groqClient) {
                providers.push({ name: `Groq (${textGroq})`, execute: () => this.streamWithGroq(combinedMessages.groq) });
            }
            if (this.claudeClient) {
                providers.push({ name: `Claude (${textClaude})`, execute: () => this.streamWithClaude(userContent, claudeSystemPrompt) });
            }
            if (this.client) {
                providers.push({ name: `Gemini Flash (${textGeminiFlash})`, execute: () => this.streamWithGeminiModel(combinedMessages.gemini, textGeminiFlash) });
                providers.push({ name: `Gemini Pro (${textGeminiPro})`, execute: () => this.streamWithGeminiModel(combinedMessages.gemini, textGeminiPro) });
            }
        }
        if (providers.length === 0) {
            yield "No AI providers configured. Please add at least one API key in Settings.";
            return;
        }
        // ============================================================
        // RELENTLESS RETRY: Try all providers, then retry entire chain
        // with exponential backoff. Max 2 full rotations.
        // ============================================================
        const MAX_FULL_ROTATIONS = 3;
        for (let rotation = 0; rotation < MAX_FULL_ROTATIONS; rotation++) {
            if (rotation > 0) {
                const backoffMs = 1000 * rotation;
                console.log(`[LLMHelper] 🔄 Starting rotation ${rotation + 1}/${MAX_FULL_ROTATIONS} after ${backoffMs}ms backoff...`);
                await this.delay(backoffMs);
            }
            for (let i = 0; i < providers.length; i++) {
                const provider = providers[i];
                try {
                    console.log(`[LLMHelper] ${rotation === 0 ? '🚀' : '🔁'} Attempting ${provider.name}...`);
                    yield* provider.execute();
                    console.log(`[LLMHelper] ✅ ${provider.name} stream completed successfully`);
                    return; // SUCCESS — exit immediately
                }
                catch (err) {
                    console.warn(`[LLMHelper] ⚠️ ${provider.name} failed: ${err.message}`);
                    // Continue to next provider
                }
            }
        }
        // Truly exhausted after all rotations
        console.error(`[LLMHelper] ❌ All providers exhausted after ${MAX_FULL_ROTATIONS} rotations`);
        yield "All AI services are currently unavailable. Please check your API keys and try again.";
    }
    /**
     * Universal Stream Chat - Routes to correct provider based on currentModelId
     */
    async *streamChat(message, imagePaths, context, systemPromptOverride, // Optional override (defaults to HARD_SYSTEM_PROMPT)
    routeOptions = {}) {
        // ============================================================
        // KNOWLEDGE MODE INTERCEPT (Streaming)
        // ============================================================
        if (this.knowledgeOrchestrator?.isKnowledgeMode()) {
            try {
                const knowledgeResult = await this.knowledgeOrchestrator.processQuestion(message);
                if (knowledgeResult) {
                    // Intro question shortcut — yield generated response directly
                    if (knowledgeResult.isIntroQuestion && knowledgeResult.introResponse) {
                        console.log('[LLMHelper] Knowledge mode (stream): returning generated intro response');
                        yield knowledgeResult.introResponse;
                        return;
                    }
                    // Inject knowledge system prompt
                    if (knowledgeResult.systemPromptInjection) {
                        systemPromptOverride = knowledgeResult.systemPromptInjection;
                    }
                    // Inject knowledge context
                    if (knowledgeResult.contextBlock) {
                        context = context
                            ? `${knowledgeResult.contextBlock}\n\n${context}`
                            : knowledgeResult.contextBlock;
                    }
                }
            }
            catch (knowledgeError) {
                console.warn('[LLMHelper] Knowledge mode (stream) processing failed, falling back:', knowledgeError.message);
            }
        }
        // Preparation
        const isMultimodal = !!(imagePaths?.length);
        // Determine the system prompt to use
        // logic: if override provided, use it. otherwise use HARD_SYSTEM_PROMPT (which is the universal base)
        const baseSystemPrompt = systemPromptOverride || prompts_1.HARD_SYSTEM_PROMPT;
        const finalSystemPrompt = this.injectLanguageInstruction(baseSystemPrompt);
        // Helper to build combined user message
        const userContent = context
            ? `CONTEXT:\n${context}\n\nUSER QUESTION:\n${message}`
            : message;
        LlmTraceRecorder_1.llmTraceRecorder.updateResolvedInput({
            message,
            context: context || "",
            systemPrompt: baseSystemPrompt,
            imagePaths: imagePaths || [],
            userContent,
        });
        if (!routeOptions.disableFastPath && this.groqFastTextMode && !isMultimodal) {
            console.log(`[LLMHelper] Fast text mode active (streamChat). Trying OpenAI/Alibaba/Groq fast-path.`);
            const fastProviders = [];
            if (this.openaiClient) {
                fastProviders.push({
                    name: `OpenAI Fast (${this.openaiFastModel})`,
                    route: this.createRouteInfo('openai', this.openaiFastModel, true),
                    execute: () => this.streamWithOpenai(userContent, finalSystemPrompt, this.openaiFastModel)
                });
            }
            if (this.alibabaClient) {
                fastProviders.push({
                    name: `Alibaba Fast (${this.alibabaFastModel})`,
                    route: this.createRouteInfo('alibaba', this.alibabaFastModel, true),
                    execute: () => this.streamWithAlibaba(userContent, finalSystemPrompt, this.alibabaFastModel)
                });
            }
            if (this.groqClient) {
                fastProviders.push({
                    name: `Groq Fast (${GROQ_MODEL})`,
                    route: this.createRouteInfo('groq', GROQ_MODEL, true),
                    execute: () => this.streamWithGroq(`${finalSystemPrompt}\n\n${userContent}`)
                });
            }
            for (const provider of fastProviders) {
                try {
                    console.log(`[LLMHelper] Trying streamChat fast-path provider ${provider.name}...`);
                    routeOptions.onRouteSelected?.(provider.route);
                    yield* provider.execute();
                    return;
                }
                catch (e) {
                    console.warn(`[LLMHelper] streamChat fast-path provider ${provider.name} failed: ${e.message}`);
                }
            }
        }
        // GROQ FAST TEXT OVERRIDE (Text-Only)
        if (false && this.groqFastTextMode && !isMultimodal && this.groqClient) {
            console.log(`[LLMHelper] ⚡️ Groq Fast Text Mode Active (Streaming). Routing to Groq...`);
            try {
                const groqSystem = systemPromptOverride || prompts_1.GROQ_SYSTEM_PROMPT;
                const finalGroqSystem = this.injectLanguageInstruction(groqSystem);
                const groqFullMessage = `${finalGroqSystem}\n\n${userContent}`;
                yield* this.streamWithGroq(groqFullMessage);
                return;
            }
            catch (e) {
                console.warn("[LLMHelper] Groq Fast Text streaming failed, falling back:", e.message);
                // Fall through
            }
        }
        // 1. Ollama Streaming
        if (this.useOllama) {
            routeOptions.onRouteSelected?.(this.createRouteInfo('ollama', this.ollamaModel, false));
            yield* this.streamWithOllama(message, context, finalSystemPrompt);
            return;
        }
        // 2. Custom Provider Streaming (via cURL - Non-streaming fallback for now)
        if (this.activeCurlProvider) {
            routeOptions.onRouteSelected?.(this.createRouteInfo('custom', this.activeCurlProvider.id, false));
            const response = await this.executeCustomProvider(this.activeCurlProvider.curlCommand, userContent, finalSystemPrompt, message, context || "", imagePaths?.[0], this.activeCurlProvider.responsePath);
            yield response;
            return;
        }
        // 3. Cloud Provider Routing
        // OpenAI
        if (this.isOpenAiModel(this.currentModelId) && this.openaiClient) {
            const openAiSystem = systemPromptOverride || prompts_1.OPENAI_SYSTEM_PROMPT;
            const finalOpenAiSystem = this.injectLanguageInstruction(openAiSystem);
            routeOptions.onRouteSelected?.(this.createRouteInfo('openai', this.currentModelId, false));
            if (isMultimodal && imagePaths) {
                yield* this.streamWithOpenaiMultimodal(userContent, imagePaths, finalOpenAiSystem, this.currentModelId);
            }
            else {
                yield* this.streamWithOpenai(userContent, finalOpenAiSystem, this.currentModelId);
            }
            return;
        }
        // Alibaba/Qwen
        if (this.isAlibabaModel(this.currentModelId) && this.alibabaClient) {
            routeOptions.onRouteSelected?.(this.createRouteInfo('alibaba', this.currentModelId, false));
            if (isMultimodal && imagePaths) {
                yield* this.streamWithAlibabaMultimodal(userContent, imagePaths, finalSystemPrompt, this.currentModelId);
            }
            else {
                yield* this.streamWithAlibaba(userContent, finalSystemPrompt, this.currentModelId);
            }
            return;
        }
        // Claude
        if (this.isClaudeModel(this.currentModelId) && this.claudeClient) {
            const claudeSystem = systemPromptOverride || prompts_1.CLAUDE_SYSTEM_PROMPT;
            const finalClaudeSystem = this.injectLanguageInstruction(claudeSystem);
            routeOptions.onRouteSelected?.(this.createRouteInfo('claude', this.currentModelId, false));
            if (isMultimodal && imagePaths) {
                yield* this.streamWithClaudeMultimodal(userContent, imagePaths, finalClaudeSystem);
            }
            else {
                yield* this.streamWithClaude(userContent, finalClaudeSystem);
            }
            return;
        }
        // Groq (Text + Multimodal)
        if (this.isGroqModel(this.currentModelId) && this.groqClient) {
            routeOptions.onRouteSelected?.(this.createRouteInfo('groq', this.currentModelId, false));
            if (isMultimodal && imagePaths) {
                // Route multimodal to Groq Llama 4 Scout (vision-capable)
                const groqSystem = systemPromptOverride || prompts_1.OPENAI_SYSTEM_PROMPT;
                const finalGroqSystem = this.injectLanguageInstruction(groqSystem);
                yield* this.streamWithGroqMultimodal(userContent, imagePaths, finalGroqSystem);
                return;
            }
            // Text-only Groq
            const groqSystem = systemPromptOverride ? baseSystemPrompt : prompts_1.GROQ_SYSTEM_PROMPT;
            const finalGroqSystem = this.injectLanguageInstruction(groqSystem);
            const groqFullMessage = `${finalGroqSystem}\n\n${userContent}`;
            yield* this.streamWithGroq(groqFullMessage);
            return;
        }
        // 4. Gemini Routing & Fallback
        if (this.client) {
            // Direct model use if specified
            if (this.isGeminiModel(this.currentModelId)) {
                const fullMsg = `${finalSystemPrompt}\n\n${userContent}`;
                routeOptions.onRouteSelected?.(this.createRouteInfo('gemini', this.currentModelId, false));
                yield* this.streamWithGeminiModel(fullMsg, this.currentModelId, imagePaths);
                return;
            }
            // Race strategy (default)
            const raceMsg = `${finalSystemPrompt}\n\n${userContent}`;
            routeOptions.onRouteSelected?.(this.createRouteInfo('gemini', this.geminiModel, false));
            yield* this.streamWithGeminiParallelRace(raceMsg, imagePaths);
        }
        else {
            throw new Error("No LLM provider available");
        }
    }
    /**
     * Stream response from Groq
     */
    async *streamWithGroq(fullMessage) {
        if (!this.groqClient)
            throw new Error("Groq client not initialized");
        const stream = await this.groqClient.chat.completions.create({
            model: GROQ_MODEL,
            messages: [{ role: "user", content: fullMessage }],
            stream: true,
            temperature: 0.4,
            max_tokens: 8192,
        });
        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
                yield content;
            }
        }
    }
    /**
     * Stream multimodal (image + text) response from Groq using Llama 4 Scout as a last resort
     */
    async *streamWithGroqMultimodal(userMessage, imagePaths, systemPrompt) {
        if (!this.groqClient)
            throw new Error("Groq client not initialized");
        const messages = [];
        if (systemPrompt) {
            messages.push({ role: "system", content: systemPrompt });
        }
        const contentParts = [{ type: "text", text: userMessage }];
        for (const p of imagePaths) {
            if (fs_1.default.existsSync(p)) {
                // Groq requires base64 URL format for images, similar to OpenAI
                const imageData = await fs_1.default.promises.readFile(p);
                contentParts.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageData.toString("base64")}` } });
            }
        }
        messages.push({ role: "user", content: contentParts });
        const stream = await this.groqClient.chat.completions.create({
            model: "meta-llama/llama-4-scout-17b-16e-instruct",
            messages,
            stream: true,
            max_tokens: 8192,
            temperature: 1,
            top_p: 1,
            stop: null
        });
        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
                yield content;
            }
        }
    }
    /**
     * Stream response from OpenAI with proper system/user message separation
     */
    async *streamWithOpenai(userMessage, systemPrompt, modelOverride) {
        yield* this.streamWithOpenAICompatible('openai', userMessage, undefined, systemPrompt, modelOverride);
    }
    /**
     * Stream response from Claude with proper system/user message separation
     */
    async *streamWithClaude(userMessage, systemPrompt) {
        if (!this.claudeClient)
            throw new Error("Claude client not initialized");
        const stream = await this.claudeClient.messages.stream({
            model: CLAUDE_MODEL,
            max_tokens: CLAUDE_MAX_OUTPUT_TOKENS,
            ...(systemPrompt ? { system: systemPrompt } : {}),
            messages: [{ role: "user", content: userMessage }],
        });
        for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                yield event.delta.text;
            }
        }
    }
    /**
     * Stream multimodal (image + text) response from OpenAI with system/user separation
     */
    async *streamWithOpenaiMultimodal(userMessage, imagePaths, systemPrompt, modelOverride) {
        yield* this.streamWithOpenAICompatible('openai', userMessage, imagePaths, systemPrompt, modelOverride);
    }
    async *streamWithAlibaba(userMessage, systemPrompt, modelOverride) {
        yield* this.streamWithOpenAICompatible('alibaba', userMessage, undefined, systemPrompt, modelOverride);
    }
    async *streamWithAlibabaMultimodal(userMessage, imagePaths, systemPrompt, modelOverride) {
        yield* this.streamWithOpenAICompatible('alibaba', userMessage, imagePaths, systemPrompt, modelOverride);
    }
    /**
     * Stream multimodal (image + text) response from Claude with system/user separation
     */
    async *streamWithClaudeMultimodal(userMessage, imagePaths, systemPrompt) {
        if (!this.claudeClient)
            throw new Error("Claude client not initialized");
        const imageContentParts = [];
        for (const p of imagePaths) {
            if (fs_1.default.existsSync(p)) {
                const imageData = await fs_1.default.promises.readFile(p);
                imageContentParts.push({
                    type: "image",
                    source: {
                        type: "base64",
                        media_type: "image/png",
                        data: imageData.toString("base64")
                    }
                });
            }
        }
        const stream = await this.claudeClient.messages.stream({
            model: CLAUDE_MODEL,
            max_tokens: CLAUDE_MAX_OUTPUT_TOKENS,
            ...(systemPrompt ? { system: systemPrompt } : {}),
            messages: [{
                    role: "user",
                    content: [
                        ...imageContentParts,
                        { type: "text", text: userMessage }
                    ]
                }],
        });
        for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                yield event.delta.text;
            }
        }
    }
    /**
     * Stream response from a specific Gemini model
     */
    async *streamWithGeminiModel(fullMessage, model, imagePaths) {
        if (!this.client)
            throw new Error("Gemini client not initialized");
        const contents = [{ text: fullMessage }];
        if (imagePaths?.length) {
            for (const p of imagePaths) {
                if (fs_1.default.existsSync(p)) {
                    const imageData = await fs_1.default.promises.readFile(p);
                    contents.push({
                        inlineData: {
                            mimeType: "image/png",
                            data: imageData.toString("base64")
                        }
                    });
                }
            }
        }
        const streamResult = await this.client.models.generateContentStream({
            model: model,
            contents: contents,
            config: {
                maxOutputTokens: MAX_OUTPUT_TOKENS,
                temperature: 0.4,
            }
        });
        // @ts-ignore
        const stream = streamResult.stream || streamResult;
        for await (const chunk of stream) {
            let chunkText = "";
            if (typeof chunk.text === 'function') {
                chunkText = chunk.text();
            }
            else if (typeof chunk.text === 'string') {
                chunkText = chunk.text;
            }
            else if (chunk.candidates?.[0]?.content?.parts?.[0]?.text) {
                chunkText = chunk.candidates[0].content.parts[0].text;
            }
            if (chunkText) {
                yield chunkText;
            }
        }
    }
    /**
     * Race Flash and Pro streams, return whichever succeeds first
     */
    async *streamWithGeminiParallelRace(fullMessage, imagePaths) {
        if (!this.client)
            throw new Error("Gemini client not initialized");
        // Start both streams
        const flashPromise = this.collectStreamResponse(fullMessage, GEMINI_FLASH_MODEL, imagePaths);
        const proPromise = this.collectStreamResponse(fullMessage, GEMINI_PRO_MODEL, imagePaths);
        // Race - whoever finishes first wins
        const result = await Promise.any([flashPromise, proPromise]);
        // Yield the collected response character by character to simulate streaming
        // (Or yield in chunks for efficiency)
        const chunkSize = 10;
        for (let i = 0; i < result.length; i += chunkSize) {
            yield result.substring(i, i + chunkSize);
        }
    }
    /**
     * Collect full response from a Gemini model (non-streaming for race)
     */
    async collectStreamResponse(fullMessage, model, imagePaths) {
        if (!this.client)
            throw new Error("Gemini client not initialized");
        const contents = [{ text: fullMessage }];
        if (imagePaths?.length) {
            for (const p of imagePaths) {
                if (fs_1.default.existsSync(p)) {
                    const imageData = await fs_1.default.promises.readFile(p);
                    contents.push({
                        inlineData: {
                            mimeType: "image/png",
                            data: imageData.toString("base64")
                        }
                    });
                }
            }
        }
        const response = await this.client.models.generateContent({
            model: model,
            contents: contents,
            config: {
                maxOutputTokens: MAX_OUTPUT_TOKENS,
                temperature: 0.4,
            }
        });
        return response.text || "";
    }
    // --- OLLAMA STREAMING ---
    async *streamWithOllama(message, context, systemPrompt = prompts_1.UNIVERSAL_SYSTEM_PROMPT) {
        const fullPrompt = context
            ? `SYSTEM: ${systemPrompt}\nCONTEXT: ${context}\nUSER: ${message}`
            : `SYSTEM: ${systemPrompt}\nUSER: ${message}`;
        try {
            const response = await fetch(`${this.ollamaUrl}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.ollamaModel,
                    prompt: fullPrompt,
                    stream: true,
                    options: { temperature: 0.7 }
                })
            });
            if (!response.body)
                throw new Error("No response body from Ollama");
            // iterate over the readable stream
            // @ts-ignore
            for await (const chunk of response.body) {
                const text = new TextDecoder().decode(chunk);
                // Ollama sends JSON objects per line
                const lines = text.split('\n').filter(l => l.trim());
                for (const line of lines) {
                    try {
                        const json = JSON.parse(line);
                        if (json.response)
                            yield json.response;
                        if (json.done)
                            return;
                    }
                    catch (e) {
                        // ignore partial json
                    }
                }
            }
        }
        catch (e) {
            console.error("Ollama streaming failed", e);
            yield "Error: Failed to stream from Ollama.";
        }
    }
    // --- CUSTOM PROVIDER STREAMING ---
    async *streamWithCustom(message, context, imagePaths, systemPrompt = prompts_1.UNIVERSAL_SYSTEM_PROMPT) {
        if (!this.customProvider)
            return;
        // We reuse the executeCustomProvider logic but we need it to stream.
        // If the user provided a curl command, it might support streaming (SSE) or not.
        // If we execute it via Child Process, we can read stdout stream.
        // 1. Prepare command with variables
        // Re-use logic from executeCustomProvider to replace variables
        // But we can't easily reuse the function since it awaits the whole fetch.
        // So we'll implement a simplified streaming version using our existing variable replacer and node-fetch.
        const curlCommand = this.customProvider.curlCommand;
        const requestConfig = (0, curl_to_json_1.default)(curlCommand);
        let base64Image = "";
        if (imagePaths?.length) {
            try {
                // Use the first image for custom providers (they typically only support one)
                const data = await fs_1.default.promises.readFile(imagePaths[0]);
                base64Image = data.toString("base64");
            }
            catch (e) { }
        }
        const combinedMessage = context ? `${context}\n\n${message}` : message;
        const variables = {
            TEXT: combinedMessage,
            PROMPT: combinedMessage,
            SYSTEM_PROMPT: systemPrompt,
            USER_MESSAGE: message,
            CONTEXT: context || "",
            IMAGE_BASE64: base64Image,
        };
        const url = (0, curlUtils_1.deepVariableReplacer)(requestConfig.url, variables);
        const headers = (0, curlUtils_1.deepVariableReplacer)(requestConfig.header || {}, variables);
        const body = (0, curlUtils_1.deepVariableReplacer)(requestConfig.data || {}, variables);
        try {
            const response = await fetch(url, {
                method: requestConfig.method || 'POST',
                headers: headers,
                body: JSON.stringify(body)
            });
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Custom Provider HTTP ${response.status}: ${errorText.substring(0, 200)}`);
                yield `Error: Custom Provider returned HTTP ${response.status}`;
                return;
            }
            if (!response.body)
                return;
            // Collect all chunks to handle both SSE streaming and non-SSE JSON responses
            let fullBody = "";
            let yieldedAny = false;
            // @ts-ignore
            for await (const chunk of response.body) {
                const text = new TextDecoder().decode(chunk);
                fullBody += text;
                const lines = text.split('\n');
                for (const line of lines) {
                    if (line.trim().length === 0)
                        continue;
                    const parsed = this.parseStreamLine(line, this.customProvider.responsePath);
                    if (parsed?.text) {
                        yield parsed.text;
                        yieldedAny = true;
                        continue;
                    }
                    const sequenced = this.parseCustomProviderSequence(line, this.customProvider.responsePath);
                    if (sequenced?.text) {
                        yield sequenced.text;
                        yieldedAny = true;
                    }
                    else if (sequenced?.data?.length) {
                        for (const payload of sequenced.data) {
                            const extracted = this.extractStreamingTextFromCustomProviderPayload(payload, this.customProvider.responsePath);
                            if (extracted) {
                                yield extracted;
                                yieldedAny = true;
                            }
                        }
                    }
                }
            }
            // If no stream content was yielded, parse the full body so concatenated JSON,
            // SSE payloads, and non-streaming JSON all follow the same extraction path.
            if (!yieldedAny && fullBody.trim().length > 0) {
                const parsedBody = this.parseCustomProviderResponse(fullBody, this.customProvider.responsePath);
                if (parsedBody.text) {
                    yield parsedBody.text;
                }
                else if (typeof parsedBody.data === "string" &&
                    parsedBody.data.length < 5000 &&
                    !parsedBody.data.trim().startsWith("{")) {
                    yield parsedBody.data.trim();
                }
            }
        }
        catch (e) {
            console.error("Custom streaming failed", e);
            yield "Error streaming from custom provider.";
        }
    }
    parseStreamLine(line, responsePath) {
        const trimmed = line.trim();
        if (!trimmed)
            return null;
        // 1. Handle SSE (data: ...)
        if (trimmed.startsWith("data:")) {
            if (trimmed === "data: [DONE]")
                return null;
            try {
                const json = JSON.parse(trimmed.substring(5).trim());
                return {
                    kind: 'sse',
                    payload: json,
                    text: this.extractStreamingTextFromCustomProviderPayload(json, responsePath)
                };
            }
            catch {
                return null;
            }
        }
        // 2. Handle raw JSON chunks (Ollama/Generic)
        if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
            try {
                const json = JSON.parse(trimmed);
                return {
                    kind: 'json',
                    payload: json,
                    text: this.extractStreamingTextFromCustomProviderPayload(json, responsePath)
                };
            }
            catch {
                return null;
            }
        }
        return null;
    }
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    isUsingOllama() {
        return this.useOllama;
    }
    async getOllamaModels() {
        const baseUrl = (this.ollamaUrl || "http://127.0.0.1:11434").replace('localhost', '127.0.0.1');
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1000); // Fast 1s timeout
            const response = await fetch(`${baseUrl}/api/tags`, {
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (!response.ok)
                return [];
            const data = await response.json();
            if (data && data.models) {
                return data.models.map((m) => m.name);
            }
            return [];
        }
        catch (error) {
            // Silently catch connection refused/timeout errors. 
            // OllamaManager handles logging the startup status.
            return [];
        }
    }
    async forceRestartOllama() {
        try {
            console.log("[LLMHelper] Attempting to force restart Ollama...");
            // 1. Check for process on port 11434
            try {
                const { stdout } = await execAsync(`lsof -t -i:11434`);
                const pid = stdout.trim();
                if (pid) {
                    console.log(`[LLMHelper] Found blocking PID: ${pid}. Killing...`);
                    await execAsync(`kill -9 ${pid}`);
                }
            }
            catch (e) {
                // lsof returns 1 if no process found, which throws error in execAsync
                // Ignore unless it's a real error
            }
            // 2. Restart Ollama through the Manager (which handles polling and background spawn)
            // We don't want to use exec('ollama serve') here directly anymore to avoid duplicate tracking
            const { OllamaManager } = require('./services/OllamaManager');
            await OllamaManager.getInstance().init();
            return true;
        }
        catch (error) {
            console.error("[LLMHelper] Failed to restart Ollama:", error);
            return false;
        }
    }
    getCurrentProvider() {
        if (this.customProvider || this.activeCurlProvider)
            return "custom";
        return this.useOllama ? "ollama" : this.currentProviderId;
    }
    getCurrentModel() {
        if (this.customProvider)
            return this.customProvider.name;
        if (this.activeCurlProvider)
            return this.activeCurlProvider.id;
        return this.useOllama ? this.ollamaModel : this.currentModelId;
    }
    /**
     * Get the Gemini client for mode-specific LLMs
     * Used by AnswerLLM, AssistLLM, FollowUpLLM, RecapLLM
     * RETURNS A PROXY client that handles retries and fallbacks transparently
     */
    getGeminiClient() {
        if (!this.client)
            return null;
        return this.createRobustClient(this.client);
    }
    /**
     * Get the Groq client for mode-specific LLMs
     */
    getGroqClient() {
        return this.groqClient;
    }
    /**
     * Check if Groq is available
     */
    hasGroq() {
        return this.groqClient !== null;
    }
    /**
     * Get the OpenAI client for mode-specific LLMs
     */
    getOpenaiClient() {
        return this.openaiClient;
    }
    /**
     * Get the Claude client for mode-specific LLMs
     */
    getClaudeClient() {
        return this.claudeClient;
    }
    /**
     * Check if OpenAI is available
     */
    hasOpenai() {
        return this.openaiClient !== null;
    }
    /**
     * Check if Claude is available
     */
    hasClaude() {
        return this.claudeClient !== null;
    }
    /**
     * Stream with Groq using a specific prompt, with Gemini fallback
     * Used by mode-specific LLMs (RecapLLM, FollowUpLLM, WhatToAnswerLLM)
     * @param groqMessage - Message with Groq-optimized prompt
     * @param geminiMessage - Message with Gemini prompt (for fallback)
     * @param config - Optional temperature and max tokens
     */
    async *streamWithGroqOrGemini(groqMessage, geminiMessage, config) {
        const temperature = config?.temperature ?? 0.3;
        const maxTokens = config?.maxTokens ?? 8192;
        // Try Groq first if available
        if (this.groqClient) {
            try {
                console.log(`[LLMHelper] 🚀 Mode-specific Groq stream starting...`);
                const stream = await this.groqClient.chat.completions.create({
                    model: GROQ_MODEL,
                    messages: [{ role: "user", content: groqMessage }],
                    stream: true,
                    temperature: temperature,
                    max_tokens: maxTokens,
                });
                for await (const chunk of stream) {
                    const content = chunk.choices[0]?.delta?.content;
                    if (content) {
                        yield content;
                    }
                }
                console.log(`[LLMHelper] ✅ Mode-specific Groq stream completed`);
                return; // Success - done
            }
            catch (err) {
                console.warn(`[LLMHelper] ⚠️ Groq mode-specific failed: ${err.message}, falling back to Gemini`);
            }
        }
        // Fallback to Gemini
        if (this.client) {
            console.log(`[LLMHelper] 🔄 Falling back to Gemini for mode-specific request...`);
            yield* this.streamWithGeminiModel(geminiMessage, GEMINI_FLASH_MODEL);
        }
        else {
            throw new Error("No LLM provider available");
        }
    }
    /**
     * Creates a proxy around the real Gemini client to intercept generation calls
     * and apply robust retry/fallback logic without modifying consumer code.
     */
    createRobustClient(realClient) {
        // We proxy the 'models' property to intercept 'generateContent'
        const modelsProxy = new Proxy(realClient.models, {
            get: (target, prop, receiver) => {
                if (prop === 'generateContent') {
                    return async (args) => {
                        return this.generateWithFallback(realClient, args);
                    };
                }
                return Reflect.get(target, prop, receiver);
            }
        });
        // We proxy the client itself to return our modelsProxy
        return new Proxy(realClient, {
            get: (target, prop, receiver) => {
                if (prop === 'models') {
                    return modelsProxy;
                }
                return Reflect.get(target, prop, receiver);
            }
        });
    }
    /**
     * ROBUST GENERATION STRATEGY (SPECULATIVE PARALLEL EXECUTION)
     * 1. Attempt with original model (Flash).
     * 2. If it fails/empties:
     *    - IMMEDIATELY launch two requests in parallel:
     *      a) Retry Flash (Attempt 2)
     *      b) Start Pro (Backup)
     * 3. Return whichever finishes successfully first (prioritizing Flash if both fast).
     * 4. If both fail, try Flash one last time (Attempt 3).
     * 5. If that fails, throw error.
     */
    async generateWithFallback(client, args) {
        const originalModel = args.model;
        // Helper to check for valid content
        const isValidResponse = (response) => {
            const candidate = response.candidates?.[0];
            if (!candidate)
                return false;
            // Check for text content
            if (response.text && response.text.trim().length > 0)
                return true;
            if (candidate.content?.parts?.[0]?.text && candidate.content.parts[0].text.trim().length > 0)
                return true;
            if (typeof candidate.content === 'string' && candidate.content.trim().length > 0)
                return true;
            return false;
        };
        // 1. Initial Attempt (Flash)
        try {
            const response = await client.models.generateContent({
                ...args,
                model: originalModel
            });
            if (isValidResponse(response))
                return response;
            console.warn(`[LLMHelper] Initial ${originalModel} call returned empty/invalid response.`);
        }
        catch (error) {
            console.warn(`[LLMHelper] Initial ${originalModel} call failed: ${error.message}`);
        }
        console.log(`[LLMHelper] 🚀 Triggering Speculative Parallel Retry (Flash + Pro)...`);
        // 2. Parallel Execution (Retry Flash vs Pro)
        // We create promises for both but treat them carefully
        const flashRetryPromise = (async () => {
            // Small delay before retry to let system settle? No, user said "immediately"
            try {
                const res = await client.models.generateContent({ ...args, model: originalModel });
                if (isValidResponse(res))
                    return { type: 'flash', res };
                throw new Error("Empty Flash Response");
            }
            catch (e) {
                throw e;
            }
        })();
        const proBackupPromise = (async () => {
            try {
                // Pro might be slower, but it's the robust backup
                const res = await client.models.generateContent({ ...args, model: GEMINI_PRO_MODEL });
                if (isValidResponse(res))
                    return { type: 'pro', res };
                throw new Error("Empty Pro Response");
            }
            catch (e) {
                throw e;
            }
        })();
        // 3. Race / Fallback Logic
        try {
            // We want Flash if it succeeds, but will accept Pro if Flash fails
            // If Flash finishes first and success -> return Flash
            // If Pro finishes first -> wait for Flash? Or return Pro?
            // User said: "if the gemini 3 flash again fails the gemini 3 pro response can be immediatly displayed"
            // This implies we prioritize Flash's *result*, but if Flash fails, we want Pro.
            // We use Promise.any to get the first *successful* result
            const winner = await Promise.any([flashRetryPromise, proBackupPromise]);
            console.log(`[LLMHelper] Parallel race won by: ${winner.type}`);
            return winner.res;
        }
        catch (aggregateError) {
            console.warn(`[LLMHelper] Both parallel retry attempts failed.`);
        }
        // 4. Last Resort: Flash Final Retry
        console.log(`[LLMHelper] ⚠️ All parallel attempts failed. Trying Flash one last time...`);
        try {
            return await client.models.generateContent({ ...args, model: originalModel });
        }
        catch (finalError) {
            console.error(`[LLMHelper] Final retry failed.`);
            throw finalError;
        }
    }
    async withTimeout(promise, timeoutMs, operationName) {
        let timeoutHandle;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutHandle = setTimeout(() => reject(new Error(`${operationName} timed out after ${timeoutMs}ms`)), timeoutMs);
        });
        return Promise.race([
            promise.then(result => {
                clearTimeout(timeoutHandle);
                return result;
            }),
            timeoutPromise
        ]);
    }
    /**
     * Robust Meeting Summary Generation
     * Uses the shared provider-aware text fallback chain for summary/title generation.
     */
    async generateMeetingSummary(systemPrompt, context, groqSystemPrompt) {
        console.log(`[LLMHelper] generateMeetingSummary called. Context length: ${context.length}`);
        const tokenCount = Math.ceil(context.length / 4);
        console.log(`[LLMHelper] Estimated tokens: ${tokenCount}`);
        const strictSystemPrompt = `${systemPrompt}

CRITICAL OUTPUT CONTRACT:
- 必须严格遵守要求的输出格式。
- 只返回最终答案。
- 除非任务明确要求，否则不要添加解释、前言、评论或 markdown 代码块。
- 如果任务要求返回 JSON，就只返回合法 JSON。
- 如果任务要求标题，就只返回标题文本。
- 如果任务要求一句话，就只返回一句话。`;
        const strictRequest = `${strictSystemPrompt}\n\nMEETING CONTEXT:\n${context}\n\n只返回要求的结果。`;
        try {
            const structuredResult = await this.generateContentStructured(strictRequest);
            if (structuredResult && structuredResult.trim().length > 0) {
                return this.processResponse(structuredResult);
            }
        }
        catch (error) {
            console.warn(`[LLMHelper] Structured meeting summary path failed: ${error.message}`);
        }
        return this.generateWithInternalTextFallback(strictSystemPrompt, `MEETING CONTEXT:\n${context}\n\n只返回要求的结果。`, {
            groqSystemPrompt,
            timeoutMs: tokenCount >= 100000 ? 60000 : 45000,
            maxRotations: 3,
            skipGroqAboveTokens: 100000,
        });
        // ATTEMPT 1: Groq (if text-only and within limits)
        // Groq Llama 3.3 70b has ~128k context, let's be safe with 100k
        if (this.groqClient && tokenCount < 100000) {
            console.log(`[LLMHelper] Attempting Groq for summary...`);
            try {
                const groqPrompt = groqSystemPrompt || systemPrompt;
                // Use non-streaming for summary
                const response = await this.withTimeout(this.groqClient.chat.completions.create({
                    model: GROQ_MODEL,
                    messages: [
                        { role: "system", content: groqPrompt },
                        { role: "user", content: `Context:\n${context}` }
                    ],
                    temperature: 0.3,
                    max_tokens: 8192,
                    stream: false
                }), 45000, "Groq Summary");
                const text = response.choices[0]?.message?.content || "";
                if (text.trim().length > 0) {
                    console.log(`[LLMHelper] ✅ Groq summary generated successfully.`);
                    return this.processResponse(text);
                }
            }
            catch (e) {
                console.warn(`[LLMHelper] ⚠️ Groq summary failed: ${e.message}. Falling back to Gemini...`);
            }
        }
        else {
            if (tokenCount >= 100000) {
                console.log(`[LLMHelper] Context too large for Groq (${tokenCount} tokens). Skipping straight to Gemini.`);
            }
        }
        // ATTEMPT 2: Gemini Flash (with 2 retries = 3 attempts total)
        console.log(`[LLMHelper] Attempting Gemini Flash for summary...`);
        const contents = [{ text: `${systemPrompt}\n\nCONTEXT:\n${context}` }];
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const text = await this.withTimeout(this.generateWithFlash(contents), 45000, `Gemini Flash Summary (Attempt ${attempt})`);
                if (text.trim().length > 0) {
                    console.log(`[LLMHelper] ✅ Gemini Flash summary generated successfully (Attempt ${attempt}).`);
                    return this.processResponse(text);
                }
            }
            catch (e) {
                console.warn(`[LLMHelper] ⚠️ Gemini Flash attempt ${attempt}/3 failed: ${e.message}`);
                if (attempt < 3) {
                    await new Promise(r => setTimeout(r, 1000 * attempt)); // Linear backoff
                }
            }
        }
        // ATTEMPT 3: Gemini Pro (Infinite-ish loop)
        // User requested "call gemini 3 pro until summary is generated"
        // We will cap it at 5 heavily backed-off retries to avoid hanging processes forever,
        // but effectively this acts as a very persistent retry.
        console.log(`[LLMHelper] ⚠️ Flash exhausted. Switching to Gemini Pro for robust retry...`);
        const maxProRetries = 5;
        if (!this.client)
            throw new Error("Gemini client not initialized");
        for (let attempt = 1; attempt <= maxProRetries; attempt++) {
            try {
                console.log(`[LLMHelper] 🔄 Gemini Pro Attempt ${attempt}/${maxProRetries}...`);
                const response = await this.withTimeout(
                // @ts-ignore
                this.client.models.generateContent({
                    model: GEMINI_PRO_MODEL,
                    contents: contents,
                    config: {
                        maxOutputTokens: MAX_OUTPUT_TOKENS,
                        temperature: 0.3,
                    }
                }), 60000, `Gemini Pro Summary (Attempt ${attempt})`);
                const text = response.text || "";
                if (text.trim().length > 0) {
                    console.log(`[LLMHelper] ✅ Gemini Pro summary generated successfully.`);
                    return this.processResponse(text);
                }
            }
            catch (e) {
                console.warn(`[LLMHelper] ⚠️ Gemini Pro attempt ${attempt} failed: ${e.message}`);
                // Aggressive backoff for Pro: 2s, 4s, 8s, 16s, 32s
                const backoff = 2000 * Math.pow(2, attempt - 1);
                console.log(`[LLMHelper] Waiting ${backoff}ms before next retry...`);
                await new Promise(r => setTimeout(r, backoff));
            }
        }
        throw new Error("Failed to generate summary after all fallback attempts.");
    }
    async switchToOllama(model, url) {
        this.useOllama = true;
        if (url)
            this.ollamaUrl = url;
        if (model) {
            this.ollamaModel = model;
        }
        else {
            // Auto-detect first available model
            await this.initializeOllamaModel();
        }
        // console.log(`[LLMHelper] Switched to Ollama: ${this.ollamaModel} at ${this.ollamaUrl}`);
    }
    async switchToGemini(apiKey, modelId) {
        if (modelId) {
            this.geminiModel = modelId;
        }
        if (apiKey) {
            this.apiKey = apiKey;
            this.client = new genai_1.GoogleGenAI({
                apiKey: apiKey,
                httpOptions: { apiVersion: "v1alpha" }
            });
        }
        else if (!this.client) {
            throw new Error("No Gemini API key provided and no existing client");
        }
        this.useOllama = false;
        this.customProvider = null;
        // console.log(`[LLMHelper] Switched to Gemini: ${this.geminiModel}`);
    }
    async switchToCustom(provider) {
        this.customProvider = provider;
        this.useOllama = false;
        this.client = null;
        this.groqClient = null;
        this.openaiClient = null;
        this.claudeClient = null;
        console.log(`[LLMHelper] Switched to Custom Provider: ${provider.name}`);
    }
    async testConnection() {
        try {
            if (this.useOllama) {
                const available = await this.checkOllamaAvailable();
                if (!available) {
                    return { success: false, error: `Ollama not available at ${this.ollamaUrl}` };
                }
                // Test with a simple prompt
                await this.callOllama("Hello");
                return { success: true };
            }
            else {
                if (!this.client) {
                    return { success: false, error: "No Gemini client configured" };
                }
                // Test with a simple prompt using the selected model
                const text = await this.generateContent([{ text: "Hello" }]);
                if (text) {
                    return { success: true };
                }
                else {
                    return { success: false, error: "Empty response from Gemini" };
                }
            }
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    }
    /**
     * Universal Chat (Non-streaming)
     */
    async chat(message, imagePaths, context, systemPromptOverride) {
        let fullResponse = "";
        for await (const chunk of this.streamChat(message, imagePaths, context, systemPromptOverride)) {
            fullResponse += chunk;
        }
        return fullResponse;
    }
}
exports.LLMHelper = LLMHelper;
//# sourceMappingURL=LLMHelper.js.map
