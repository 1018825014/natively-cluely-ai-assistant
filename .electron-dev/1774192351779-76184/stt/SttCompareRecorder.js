"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SttCompareRecorder = void 0;
const TechnicalGlossary_1 = require("./TechnicalGlossary");
class SttCompareRecorder {
    active = false;
    startedAt = null;
    stoppedAt = null;
    primaryProviderId = null;
    providers = new Map();
    utterances = [];
    speakerState = {
        interviewer: { currentUtteranceId: null },
        user: { currentUtteranceId: null },
    };
    glossary = (0, TechnicalGlossary_1.normalizeTechnicalGlossaryConfig)();
    start(primaryProviderId, providers, glossary) {
        this.active = true;
        this.startedAt = Date.now();
        this.stoppedAt = null;
        this.primaryProviderId = primaryProviderId;
        this.providers = new Map(providers.map((provider) => [provider.id, provider]));
        this.utterances = [];
        this.speakerState = {
            interviewer: { currentUtteranceId: null },
            user: { currentUtteranceId: null },
        };
        this.glossary = (0, TechnicalGlossary_1.normalizeTechnicalGlossaryConfig)(glossary);
    }
    stop() {
        this.active = false;
        this.stoppedAt = Date.now();
    }
    isActive() {
        return this.active;
    }
    getPrimaryProviderId() {
        return this.primaryProviderId;
    }
    updateProviders(primaryProviderId, providers) {
        this.primaryProviderId = primaryProviderId;
        this.providers = new Map(providers.map((provider) => [provider.id, provider]));
    }
    updateGlossary(glossary) {
        this.glossary = (0, TechnicalGlossary_1.normalizeTechnicalGlossaryConfig)(glossary);
        for (const utterance of this.utterances) {
            for (const result of Object.values(utterance.providerResults)) {
                result.termHits = (0, TechnicalGlossary_1.extractGlossaryHits)(result.finalText || result.partialText, this.glossary);
            }
        }
    }
    recordAudioChunk(speaker, chunkLength, timestamp = Date.now()) {
        const utterance = this.ensureUtterance(speaker, timestamp);
        utterance.audioChunkCount += 1;
        utterance.audioBytes += chunkLength;
        return utterance;
    }
    markSpeechEnded(speaker, timestamp = Date.now()) {
        const utterance = this.getCurrentUtterance(speaker);
        if (!utterance)
            return;
        utterance.endedAt = timestamp;
    }
    recordTranscript(providerId, speaker, segment, timestamp = Date.now()) {
        if (!segment.text?.trim())
            return;
        const utterance = this.ensureUtterance(speaker, timestamp);
        const provider = this.providers.get(providerId) || {
            id: providerId,
            label: providerId,
            kind: 'shadow',
            available: true,
        };
        const result = this.ensureProviderResult(utterance, provider);
        const latencyMs = utterance.startedAt ? Math.max(0, timestamp - utterance.startedAt) : null;
        result.segments.push({
            text: segment.text,
            final: segment.isFinal,
            confidence: segment.confidence,
            timestamp,
            latencyMs,
        });
        if (!segment.isFinal) {
            result.partialText = segment.text;
            if (result.firstPartialLatencyMs === null) {
                result.firstPartialLatencyMs = latencyMs;
            }
        }
        else {
            result.finalText = appendTranscript(result.finalText, segment.text);
            result.finalLatencyMs = latencyMs;
        }
        result.termHits = (0, TechnicalGlossary_1.extractGlossaryHits)(result.finalText || result.partialText, this.glossary);
    }
    recordError(providerId, speaker, message, timestamp = Date.now()) {
        const utterance = this.ensureUtterance(speaker, timestamp);
        const provider = this.providers.get(providerId) || {
            id: providerId,
            label: providerId,
            kind: 'shadow',
            available: true,
        };
        const result = this.ensureProviderResult(utterance, provider);
        result.errors.push(message);
    }
    getResults() {
        const byProvider = {};
        for (const provider of this.providers.values()) {
            const utteranceResults = this.utterances
                .map((utterance) => utterance.providerResults[provider.id])
                .filter((result) => Boolean(result));
            const firstPartialLatencies = utteranceResults
                .map((result) => result.firstPartialLatencyMs)
                .filter((value) => typeof value === 'number');
            const finalLatencies = utteranceResults
                .map((result) => result.finalLatencyMs)
                .filter((value) => typeof value === 'number');
            const technicalTerms = Array.from(new Set(utteranceResults.flatMap((result) => result.termHits))).sort((a, b) => a.localeCompare(b));
            const errorCount = utteranceResults.reduce((sum, result) => sum + result.errors.length, 0);
            byProvider[provider.id] = {
                providerId: provider.id,
                label: provider.label,
                totalUtterances: utteranceResults.length,
                utterancesWithFinal: utteranceResults.filter((result) => Boolean(result.finalText.trim())).length,
                avgFirstPartialLatencyMs: averageOrNull(firstPartialLatencies),
                avgFinalLatencyMs: averageOrNull(finalLatencies),
                errorCount,
                technicalTerms,
                technicalTermHitCount: technicalTerms.length,
            };
        }
        return {
            active: this.active,
            startedAt: this.startedAt,
            stoppedAt: this.stoppedAt,
            primaryProviderId: this.primaryProviderId,
            providers: Array.from(this.providers.values()),
            glossary: this.glossary,
            utterances: this.utterances.map((utterance) => ({
                ...utterance,
                providerResults: Object.fromEntries(Object.entries(utterance.providerResults).map(([providerId, result]) => [
                    providerId,
                    {
                        ...result,
                        errors: [...result.errors],
                        segments: result.segments.map((segment) => ({ ...segment })),
                        termHits: [...result.termHits],
                    },
                ])),
            })),
            summary: {
                totalUtterances: this.utterances.length,
                byProvider,
            },
        };
    }
    ensureUtterance(speaker, timestamp) {
        const current = this.getCurrentUtterance(speaker);
        if (current && current.endedAt === null) {
            return current;
        }
        const utterance = {
            id: `${speaker}-${timestamp}-${this.utterances.length + 1}`,
            speaker,
            startedAt: timestamp,
            endedAt: null,
            audioChunkCount: 0,
            audioBytes: 0,
            providerResults: {},
        };
        this.utterances.push(utterance);
        this.speakerState[speaker].currentUtteranceId = utterance.id;
        return utterance;
    }
    getCurrentUtterance(speaker) {
        const currentUtteranceId = this.speakerState[speaker].currentUtteranceId;
        if (!currentUtteranceId)
            return null;
        return this.utterances.find((utterance) => utterance.id === currentUtteranceId) || null;
    }
    ensureProviderResult(utterance, provider) {
        if (!utterance.providerResults[provider.id]) {
            utterance.providerResults[provider.id] = {
                providerId: provider.id,
                label: provider.label,
                partialText: '',
                finalText: '',
                firstPartialLatencyMs: null,
                finalLatencyMs: null,
                errors: [],
                segments: [],
                termHits: [],
            };
        }
        return utterance.providerResults[provider.id];
    }
}
exports.SttCompareRecorder = SttCompareRecorder;
function appendTranscript(existingText, nextText) {
    const trimmedExisting = existingText.trim();
    const trimmedNext = nextText.trim();
    if (!trimmedExisting)
        return trimmedNext;
    if (!trimmedNext)
        return trimmedExisting;
    if (trimmedExisting.endsWith(trimmedNext))
        return trimmedExisting;
    if (trimmedNext.startsWith(trimmedExisting))
        return trimmedNext;
    return `${trimmedExisting} ${trimmedNext}`.trim();
}
function averageOrNull(values) {
    if (values.length === 0)
        return null;
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}
//# sourceMappingURL=SttCompareRecorder.js.map
