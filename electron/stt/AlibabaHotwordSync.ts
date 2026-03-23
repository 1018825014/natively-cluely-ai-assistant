import axios from 'axios';
import { normalizeTechnicalGlossaryConfig, TechnicalGlossaryConfig } from './TechnicalGlossary';

const CUSTOMIZATION_ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/services/audio/asr/customization';
const HOTWORD_PREFIX = 'natstt';
const MAX_QUERY_ATTEMPTS = 15;
const QUERY_POLL_INTERVAL_MS = 2000;

export const PARAFORMER_REALTIME_TARGET_MODEL = 'paraformer-realtime-v2';
export const FUN_ASR_REALTIME_TARGET_MODEL = 'fun-asr-realtime-2026-02-28';

type VocabularyItem = {
    text: string;
    weight: number;
};

type SyncTarget = {
    targetModel: string;
    existingVocabularyId?: string;
};

type VocabularyDetails = {
    status?: string;
    target_model?: string;
    vocabulary?: VocabularyItem[];
};

export type AlibabaHotwordSyncResult = {
    config: TechnicalGlossaryConfig;
    warnings: string[];
};

export async function syncAlibabaHotwordConfig(
    config?: Partial<TechnicalGlossaryConfig> | null,
    apiKey?: string
): Promise<AlibabaHotwordSyncResult> {
    const normalized = normalizeTechnicalGlossaryConfig(config);
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

    const client = axios.create({
        headers: buildHeaders(trimmedApiKey, normalized.alibabaWorkspaceId),
        timeout: 20_000,
    });

    const warnings: string[] = [];
    const [paraformerResult, funAsrResult] = await Promise.all([
        syncSingleTarget(client, vocabulary, {
            targetModel: PARAFORMER_REALTIME_TARGET_MODEL,
            existingVocabularyId: normalized.alibabaVocabularyId,
        }),
        syncSingleTarget(client, vocabulary, {
            targetModel: FUN_ASR_REALTIME_TARGET_MODEL,
            existingVocabularyId: normalized.funAsrVocabularyId,
        }),
    ]);

    if (paraformerResult.warning) warnings.push(paraformerResult.warning);
    if (funAsrResult.warning) warnings.push(funAsrResult.warning);

    return {
        config: normalizeTechnicalGlossaryConfig({
            ...normalized,
            alibabaVocabularyId: paraformerResult.vocabularyId || normalized.alibabaVocabularyId,
            funAsrVocabularyId: funAsrResult.vocabularyId || normalized.funAsrVocabularyId,
            updatedAt: new Date().toISOString(),
        }),
        warnings,
    };
}

async function syncSingleTarget(
    client: ReturnType<typeof axios.create>,
    vocabulary: VocabularyItem[],
    target: SyncTarget
): Promise<{ vocabularyId?: string; warning?: string }> {
    try {
        const desiredVocabulary = getNormalizedVocabularySignature(vocabulary);
        const candidateIds = new Set<string>();

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

            const currentSignature = getNormalizedVocabularySignature(
                Array.isArray(details.vocabulary) ? details.vocabulary : []
            );

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
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            vocabularyId: target.existingVocabularyId,
            warning: `Failed to sync Alibaba hotwords for ${target.targetModel}: ${message}`,
        };
    }
}

function buildHeaders(apiKey: string, workspaceId?: string): Record<string, string> {
    const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json; charset=utf-8',
    };

    if (workspaceId?.trim()) {
        headers['X-DashScope-WorkSpace'] = workspaceId.trim();
    }

    return headers;
}

function buildVocabulary(config: TechnicalGlossaryConfig): VocabularyItem[] {
    return config.entries
        .map((entry) => ({
            text: normalizeHotwordText(entry.term),
            weight: clampHotwordWeight(entry.weight),
        }))
        .filter((entry) => entry.text.length > 0);
}

function clampHotwordWeight(weight?: number): number {
    if (typeof weight !== 'number' || !Number.isFinite(weight)) {
        return 4;
    }

    return Math.min(Math.max(Math.round(weight), 1), 5);
}

function normalizeHotwordText(text: string): string {
    const trimmed = text.trim();
    if (!trimmed) return '';
    if (/\p{Script=Han}/u.test(trimmed)) return trimmed;

    try {
        const bytes = Buffer.from(trimmed, 'latin1');
        const decoded = bytes.toString('utf8');
        if (/\p{Script=Han}/u.test(decoded)) {
            return decoded;
        }
    } catch {
        // Fall through to the original term when normalization fails.
    }

    return trimmed;
}

function getNormalizedVocabularySignature(vocabulary: VocabularyItem[]): string {
    return JSON.stringify(
        vocabulary
            .map((entry) => ({
                text: normalizeHotwordText(entry.text),
                weight: clampHotwordWeight(entry.weight),
            }))
            .sort((left, right) => {
                if (left.text === right.text) {
                    return left.weight - right.weight;
                }
                return left.text.localeCompare(right.text);
            })
    );
}

async function invokeCustomization(
    client: ReturnType<typeof axios.create>,
    input: Record<string, unknown>
): Promise<any> {
    const response = await client.post(CUSTOMIZATION_ENDPOINT, {
        model: 'speech-biasing',
        input,
    });
    return response.data;
}

async function getVocabularyDetails(
    client: ReturnType<typeof axios.create>,
    vocabularyId: string
): Promise<VocabularyDetails | null> {
    if (!vocabularyId) return null;

    try {
        const response = await invokeCustomization(client, {
            action: 'query_vocabulary',
            vocabulary_id: vocabularyId,
        });
        return response?.output || null;
    } catch {
        return null;
    }
}

async function waitForVocabularyReady(
    client: ReturnType<typeof axios.create>,
    vocabularyId: string
): Promise<void> {
    for (let attempt = 0; attempt < MAX_QUERY_ATTEMPTS; attempt += 1) {
        const details = await getVocabularyDetails(client, vocabularyId);
        if (details?.status === 'OK') {
            return;
        }

        await new Promise((resolve) => setTimeout(resolve, QUERY_POLL_INTERVAL_MS));
    }

    throw new Error(`Vocabulary ${vocabularyId} did not reach OK status in time.`);
}
