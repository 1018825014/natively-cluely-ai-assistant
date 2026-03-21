import {
    TechnicalGlossaryConfig,
    extractGlossaryHits,
    normalizeTechnicalGlossaryConfig,
} from './TechnicalGlossary';

export type CompareSpeaker = 'interviewer' | 'user';

export interface SttCompareProviderDescriptor {
    id: string;
    label: string;
    kind: 'primary' | 'shadow';
    available: boolean;
    reason?: string;
}

export interface SttCompareSegment {
    text: string;
    final: boolean;
    confidence: number;
    timestamp: number;
    latencyMs: number | null;
}

export interface SttCompareProviderResult {
    providerId: string;
    label: string;
    partialText: string;
    finalText: string;
    firstPartialLatencyMs: number | null;
    finalLatencyMs: number | null;
    errors: string[];
    segments: SttCompareSegment[];
    termHits: string[];
}

export interface SttCompareUtterance {
    id: string;
    speaker: CompareSpeaker;
    startedAt: number;
    endedAt: number | null;
    audioChunkCount: number;
    audioBytes: number;
    providerResults: Record<string, SttCompareProviderResult>;
}

export interface SttCompareProviderSummary {
    providerId: string;
    label: string;
    totalUtterances: number;
    utterancesWithFinal: number;
    avgFirstPartialLatencyMs: number | null;
    avgFinalLatencyMs: number | null;
    errorCount: number;
    technicalTerms: string[];
    technicalTermHitCount: number;
}

export interface SttCompareResults {
    active: boolean;
    startedAt: number | null;
    stoppedAt: number | null;
    primaryProviderId: string | null;
    providers: SttCompareProviderDescriptor[];
    glossary: TechnicalGlossaryConfig;
    utterances: SttCompareUtterance[];
    summary: {
        totalUtterances: number;
        byProvider: Record<string, SttCompareProviderSummary>;
    };
}

type SpeakerState = {
    currentUtteranceId: string | null;
};

export class SttCompareRecorder {
    private active = false;
    private startedAt: number | null = null;
    private stoppedAt: number | null = null;
    private primaryProviderId: string | null = null;
    private providers = new Map<string, SttCompareProviderDescriptor>();
    private utterances: SttCompareUtterance[] = [];
    private speakerState: Record<CompareSpeaker, SpeakerState> = {
        interviewer: { currentUtteranceId: null },
        user: { currentUtteranceId: null },
    };
    private glossary: TechnicalGlossaryConfig = normalizeTechnicalGlossaryConfig();

    public start(primaryProviderId: string, providers: SttCompareProviderDescriptor[], glossary?: TechnicalGlossaryConfig | null): void {
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
        this.glossary = normalizeTechnicalGlossaryConfig(glossary);
    }

    public stop(): void {
        this.active = false;
        this.stoppedAt = Date.now();
    }

    public isActive(): boolean {
        return this.active;
    }

    public getPrimaryProviderId(): string | null {
        return this.primaryProviderId;
    }

    public updateProviders(primaryProviderId: string, providers: SttCompareProviderDescriptor[]): void {
        this.primaryProviderId = primaryProviderId;
        this.providers = new Map(providers.map((provider) => [provider.id, provider]));
    }

    public updateGlossary(glossary?: TechnicalGlossaryConfig | null): void {
        this.glossary = normalizeTechnicalGlossaryConfig(glossary);
        for (const utterance of this.utterances) {
            for (const result of Object.values(utterance.providerResults)) {
                result.termHits = extractGlossaryHits(
                    result.finalText || result.partialText,
                    this.glossary
                );
            }
        }
    }

    public recordAudioChunk(speaker: CompareSpeaker, chunkLength: number, timestamp: number = Date.now()): SttCompareUtterance {
        const utterance = this.ensureUtterance(speaker, timestamp);
        utterance.audioChunkCount += 1;
        utterance.audioBytes += chunkLength;
        return utterance;
    }

    public markSpeechEnded(speaker: CompareSpeaker, timestamp: number = Date.now()): void {
        const utterance = this.getCurrentUtterance(speaker);
        if (!utterance) return;
        utterance.endedAt = timestamp;
    }

    public recordTranscript(
        providerId: string,
        speaker: CompareSpeaker,
        segment: { text: string; isFinal: boolean; confidence: number },
        timestamp: number = Date.now()
    ): void {
        if (!segment.text?.trim()) return;

        const utterance = this.ensureUtterance(speaker, timestamp);
        const provider = this.providers.get(providerId) || {
            id: providerId,
            label: providerId,
            kind: 'shadow' as const,
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
        } else {
            result.finalText = appendTranscript(result.finalText, segment.text);
            result.finalLatencyMs = latencyMs;
        }

        result.termHits = extractGlossaryHits(
            result.finalText || result.partialText,
            this.glossary
        );
    }

    public recordError(
        providerId: string,
        speaker: CompareSpeaker,
        message: string,
        timestamp: number = Date.now()
    ): void {
        const utterance = this.ensureUtterance(speaker, timestamp);
        const provider = this.providers.get(providerId) || {
            id: providerId,
            label: providerId,
            kind: 'shadow' as const,
            available: true,
        };
        const result = this.ensureProviderResult(utterance, provider);
        result.errors.push(message);
    }

    public getResults(): SttCompareResults {
        const byProvider: Record<string, SttCompareProviderSummary> = {};

        for (const provider of this.providers.values()) {
            const utteranceResults = this.utterances
                .map((utterance) => utterance.providerResults[provider.id])
                .filter((result): result is SttCompareProviderResult => Boolean(result));

            const firstPartialLatencies = utteranceResults
                .map((result) => result.firstPartialLatencyMs)
                .filter((value): value is number => typeof value === 'number');
            const finalLatencies = utteranceResults
                .map((result) => result.finalLatencyMs)
                .filter((value): value is number => typeof value === 'number');
            const technicalTerms = Array.from(new Set(
                utteranceResults.flatMap((result) => result.termHits)
            )).sort((a, b) => a.localeCompare(b));
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
                providerResults: Object.fromEntries(
                    Object.entries(utterance.providerResults).map(([providerId, result]) => [
                        providerId,
                        {
                            ...result,
                            errors: [...result.errors],
                            segments: result.segments.map((segment) => ({ ...segment })),
                            termHits: [...result.termHits],
                        },
                    ])
                ),
            })),
            summary: {
                totalUtterances: this.utterances.length,
                byProvider,
            },
        };
    }

    private ensureUtterance(speaker: CompareSpeaker, timestamp: number): SttCompareUtterance {
        const current = this.getCurrentUtterance(speaker);
        if (current && current.endedAt === null) {
            return current;
        }

        const utterance: SttCompareUtterance = {
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

    private getCurrentUtterance(speaker: CompareSpeaker): SttCompareUtterance | null {
        const currentUtteranceId = this.speakerState[speaker].currentUtteranceId;
        if (!currentUtteranceId) return null;
        return this.utterances.find((utterance) => utterance.id === currentUtteranceId) || null;
    }

    private ensureProviderResult(
        utterance: SttCompareUtterance,
        provider: SttCompareProviderDescriptor
    ): SttCompareProviderResult {
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

function appendTranscript(existingText: string, nextText: string): string {
    const trimmedExisting = existingText.trim();
    const trimmedNext = nextText.trim();

    if (!trimmedExisting) return trimmedNext;
    if (!trimmedNext) return trimmedExisting;
    if (trimmedExisting.endsWith(trimmedNext)) return trimmedExisting;
    if (trimmedNext.startsWith(trimmedExisting)) return trimmedNext;

    return `${trimmedExisting} ${trimmedNext}`.trim();
}

function averageOrNull(values: number[]): number | null {
    if (values.length === 0) return null;
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}
