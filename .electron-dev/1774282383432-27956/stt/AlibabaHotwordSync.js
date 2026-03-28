"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FUN_ASR_REALTIME_TARGET_MODEL = exports.PARAFORMER_REALTIME_TARGET_MODEL = void 0;
exports.syncAlibabaHotwordConfig = syncAlibabaHotwordConfig;
const axios_1 = __importDefault(require("axios"));
const TechnicalGlossary_1 = require("./TechnicalGlossary");
const CUSTOMIZATION_ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/services/audio/asr/customization';
const HOTWORD_PREFIX = 'natstt';
const MAX_QUERY_ATTEMPTS = 15;
const QUERY_POLL_INTERVAL_MS = 2000;
exports.PARAFORMER_REALTIME_TARGET_MODEL = 'paraformer-realtime-v2';
exports.FUN_ASR_REALTIME_TARGET_MODEL = 'fun-asr-realtime-2026-02-28';
async function syncAlibabaHotwordConfig(config, apiKey) {
    const normalized = (0, TechnicalGlossary_1.normalizeTechnicalGlossaryConfig)(config);
    const trimmedApiKey = apiKey?.trim();
    if (!trimmedApiKey) {
        return {
            config: normalized,
            warnings: ['Alibaba STT API key is not configured. Saved glossary locally without syncing remote hotwords.'],
        };
    }
    const vocabulary = buildVocabulary(normalized);
    if (vocabulary.length === 0) {
        return {
            config: {
                ...normalized,
                alibabaVocabularyId: undefined,
                funAsrVocabularyId: undefined,
            },
            warnings: ['No valid glossary entries were available for Alibaba hotword syncing.'],
        };
    }
    const client = axios_1.default.create({
        headers: buildHeaders(trimmedApiKey, normalized.alibabaWorkspaceId),
        timeout: 20_000,
    });
    const warnings = [];
    const [paraformerResult, funAsrResult] = await Promise.all([
        syncSingleTarget(client, vocabulary, {
            targetModel: exports.PARAFORMER_REALTIME_TARGET_MODEL,
            existingVocabularyId: normalized.alibabaVocabularyId,
        }),
        syncSingleTarget(client, vocabulary, {
            targetModel: exports.FUN_ASR_REALTIME_TARGET_MODEL,
            existingVocabularyId: normalized.funAsrVocabularyId,
        }),
    ]);
    if (paraformerResult.warning)
        warnings.push(paraformerResult.warning);
    if (funAsrResult.warning)
        warnings.push(funAsrResult.warning);
    return {
        config: (0, TechnicalGlossary_1.normalizeTechnicalGlossaryConfig)({
            ...normalized,
            alibabaVocabularyId: paraformerResult.vocabularyId || normalized.alibabaVocabularyId,
            funAsrVocabularyId: funAsrResult.vocabularyId || normalized.funAsrVocabularyId,
            updatedAt: new Date().toISOString(),
        }),
        warnings,
    };
}
async function syncSingleTarget(client, vocabulary, target) {
    try {
        const desiredVocabulary = getNormalizedVocabularySignature(vocabulary);
        const candidateIds = new Set();
        if (target.existingVocabularyId?.trim()) {
            candidateIds.add(target.existingVocabularyId.trim());
        }
        const listResponse = await invokeCustomization(client, {
            action: 'list_vocabulary',
            prefix: HOTWORD_PREFIX,
            page_index: 0,
            page_size: 50,
        });
        const list = Array.isArray(listResponse?.output?.vocabulary_list)
            ? listResponse.output.vocabulary_list
            : [];
        for (const item of list) {
            const vocabularyId = typeof item?.vocabulary_id === 'string' ? item.vocabulary_id.trim() : '';
            if (vocabularyId) {
                candidateIds.add(vocabularyId);
            }
        }
        for (const vocabularyId of candidateIds) {
            const details = await getVocabularyDetails(client, vocabularyId);
            if (!details || details.status !== 'OK' || details.target_model !== target.targetModel) {
                continue;
            }
            const currentSignature = getNormalizedVocabularySignature(Array.isArray(details.vocabulary) ? details.vocabulary : []);
            if (currentSignature === desiredVocabulary) {
                return { vocabularyId };
            }
        }
        const createResponse = await invokeCustomization(client, {
            action: 'create_vocabulary',
            prefix: HOTWORD_PREFIX,
            target_model: target.targetModel,
            vocabulary,
        });
        const createdVocabularyId = typeof createResponse?.output?.vocabulary_id === 'string'
            ? createResponse.output.vocabulary_id.trim()
            : '';
        if (!createdVocabularyId) {
            throw new Error(`Bailian did not return a vocabulary_id for target model "${target.targetModel}".`);
        }
        await waitForVocabularyReady(client, createdVocabularyId);
        return { vocabularyId: createdVocabularyId };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            vocabularyId: target.existingVocabularyId,
            warning: `Failed to sync Alibaba hotwords for ${target.targetModel}: ${message}`,
        };
    }
}
function buildHeaders(apiKey, workspaceId) {
    const headers = {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json; charset=utf-8',
    };
    if (workspaceId?.trim()) {
        headers['X-DashScope-WorkSpace'] = workspaceId.trim();
    }
    return headers;
}
function buildVocabulary(config) {
    return config.entries
        .map((entry) => ({
        text: normalizeHotwordText(entry.term),
        weight: clampHotwordWeight(entry.weight),
    }))
        .filter((entry) => entry.text.length > 0);
}
function clampHotwordWeight(weight) {
    if (typeof weight !== 'number' || !Number.isFinite(weight)) {
        return 4;
    }
    return Math.min(Math.max(Math.round(weight), 1), 5);
}
function normalizeHotwordText(text) {
    const trimmed = text.trim();
    if (!trimmed)
        return '';
    if (/\p{Script=Han}/u.test(trimmed))
        return trimmed;
    try {
        const bytes = Buffer.from(trimmed, 'latin1');
        const decoded = bytes.toString('utf8');
        if (/\p{Script=Han}/u.test(decoded)) {
            return decoded;
        }
    }
    catch {
        // Fall through to the original term when normalization fails.
    }
    return trimmed;
}
function getNormalizedVocabularySignature(vocabulary) {
    return JSON.stringify(vocabulary
        .map((entry) => ({
        text: normalizeHotwordText(entry.text),
        weight: clampHotwordWeight(entry.weight),
    }))
        .sort((left, right) => {
        if (left.text === right.text) {
            return left.weight - right.weight;
        }
        return left.text.localeCompare(right.text);
    }));
}
async function invokeCustomization(client, input) {
    const response = await client.post(CUSTOMIZATION_ENDPOINT, {
        model: 'speech-biasing',
        input,
    });
    return response.data;
}
async function getVocabularyDetails(client, vocabularyId) {
    if (!vocabularyId)
        return null;
    try {
        const response = await invokeCustomization(client, {
            action: 'query_vocabulary',
            vocabulary_id: vocabularyId,
        });
        return response?.output || null;
    }
    catch {
        return null;
    }
}
async function waitForVocabularyReady(client, vocabularyId) {
    for (let attempt = 0; attempt < MAX_QUERY_ATTEMPTS; attempt += 1) {
        const details = await getVocabularyDetails(client, vocabularyId);
        if (details?.status === 'OK') {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, QUERY_POLL_INTERVAL_MS));
    }
    throw new Error(`Vocabulary ${vocabularyId} did not reach OK status in time.`);
}
//# sourceMappingURL=AlibabaHotwordSync.js.map
