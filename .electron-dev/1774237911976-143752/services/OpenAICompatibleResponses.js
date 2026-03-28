"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOpenAICompatibleClient = createOpenAICompatibleClient;
exports.fetchOpenAICompatibleModels = fetchOpenAICompatibleModels;
exports.probeOpenAICompatibleProvider = probeOpenAICompatibleProvider;
const openai_1 = __importDefault(require("openai"));
const LlmProviderProfiles_1 = require("./LlmProviderProfiles");
function createOpenAICompatibleClient(provider, config) {
    const apiKey = config.apiKey?.trim();
    if (!apiKey)
        return null;
    return new openai_1.default({
        apiKey,
        baseURL: (0, LlmProviderProfiles_1.normalizeOpenAICompatibleBaseUrl)(provider, config.baseUrl),
    });
}
async function fetchOpenAICompatibleModels(provider, config) {
    const client = createOpenAICompatibleClient(provider, config);
    if (!client) {
        throw new Error('No API key available. Please save a key first.');
    }
    const models = await client.models.list();
    const ids = (models.data || []).map((model) => model.id).filter(Boolean);
    const filtered = (0, LlmProviderProfiles_1.filterOpenAICompatibleModelIds)(provider, ids);
    return filtered.map((id) => ({ id, label: id }));
}
async function probeOpenAICompatibleProvider(provider, config) {
    const normalizedBaseUrl = (0, LlmProviderProfiles_1.normalizeOpenAICompatibleBaseUrl)(provider, config.baseUrl);
    const capabilities = {
        checkedAt: Date.now(),
        supportsModels: false,
        supportsResponses: false,
        supportsStreaming: false,
        supportsPreviousResponseId: false,
        previousResponseIdPreservesContext: false,
        notes: [],
    };
    try {
        const client = createOpenAICompatibleClient(provider, config);
        if (!client) {
            throw new Error('No API key provided');
        }
        const modelsResponse = await client.models.list();
        const allIds = (modelsResponse.data || []).map((model) => model.id).filter(Boolean);
        const filteredModels = (0, LlmProviderProfiles_1.filterOpenAICompatibleModelIds)(provider, allIds);
        const testedModel = config.preferredModel?.trim() ||
            (filteredModels.includes((0, LlmProviderProfiles_1.getDefaultProviderModel)(provider, 'preferred'))
                ? (0, LlmProviderProfiles_1.getDefaultProviderModel)(provider, 'preferred')
                : filteredModels[0]);
        capabilities.supportsModels = true;
        capabilities.notes.push(`models:${filteredModels.length}`);
        if (!testedModel) {
            return {
                success: false,
                error: 'No compatible model was discovered for this provider.',
                normalizedBaseUrl,
                capabilities,
            };
        }
        const textResponse = await client.responses.create({
            model: testedModel,
            instructions: 'You are a connection test assistant. Reply exactly with the requested token.',
            input: [
                {
                    role: 'user',
                    content: [{ type: 'input_text', text: 'Reply exactly with: ok' }],
                },
            ],
            max_output_tokens: 32,
        });
        capabilities.supportsResponses = true;
        capabilities.notes.push(`text:${textResponse.output_text || ''}`);
        const stream = await client.responses.create({
            model: testedModel,
            input: [
                {
                    role: 'user',
                    content: [{ type: 'input_text', text: 'Reply exactly with: stream-ok' }],
                },
            ],
            max_output_tokens: 32,
            stream: true,
        });
        let sawStreamingDelta = false;
        for await (const event of stream) {
            if (event.type === 'response.output_text.delta') {
                sawStreamingDelta = true;
            }
            if (event.type === 'response.completed') {
                break;
            }
        }
        capabilities.supportsStreaming = sawStreamingDelta;
        capabilities.notes.push(`stream:${sawStreamingDelta ? 'delta' : 'no-delta'}`);
        const secret = `token-${Math.random().toString(36).slice(2, 10)}`;
        const first = await client.responses.create({
            model: testedModel,
            input: [
                {
                    role: 'user',
                    content: [{ type: 'input_text', text: `Remember this token for the next turn: ${secret}. Reply only with: noted` }],
                },
            ],
            max_output_tokens: 32,
        });
        if (first.id) {
            const second = await client.responses.create({
                model: testedModel,
                previous_response_id: first.id,
                input: [
                    {
                        role: 'user',
                        content: [{ type: 'input_text', text: 'What token did I ask you to remember? Reply only with the token.' }],
                    },
                ],
                max_output_tokens: 32,
            });
            capabilities.supportsPreviousResponseId = true;
            capabilities.previousResponseIdPreservesContext = !!second.output_text?.includes(secret);
            capabilities.notes.push(`previous_response_id:${capabilities.previousResponseIdPreservesContext ? 'semantic' : 'accepted-without-context'}`);
        }
        return {
            success: capabilities.supportsResponses,
            normalizedBaseUrl,
            testedModel,
            capabilities,
        };
    }
    catch (error) {
        return {
            success: false,
            error: error?.error?.message || error?.message || 'Connection failed',
            normalizedBaseUrl,
            capabilities,
        };
    }
}
//# sourceMappingURL=OpenAICompatibleResponses.js.map
