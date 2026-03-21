import { SttCompareProviderSummary, SttCompareResults } from './SttCompareRecorder';

export interface SttBenchmarkSample {
    id: string;
    speaker: 'interviewer' | 'user';
    referenceText: string;
    audioPath?: string;
    tags?: string[];
}

export interface NormalizedSttResult {
    providerId: string;
    transcript: string;
    latencyFirstPartialMs: number | null;
    latencyFinalMs: number | null;
    errors: string[];
    termHits: string[];
}

export interface SttBenchmarkProviderMetrics {
    providerId: string;
    label: string;
    totalUtterances: number;
    utterancesWithFinal: number;
    finalCoverageRate: number | null;
    avgFirstPartialLatencyMs: number | null;
    avgFinalLatencyMs: number | null;
    errorCount: number;
    failureRate: number | null;
    technicalTerms: string[];
    technicalTermHitCount: number;
    cer: number | null;
    technicalKeywordRecall: number | null;
    truncationRate: number | null;
    notes: string[];
}

export interface SttBenchmarkReport {
    generatedAt: string;
    mode: 'live-compare';
    primaryProviderId: string | null;
    totalUtterances: number;
    glossaryTerms: string[];
    metrics: Record<string, SttBenchmarkProviderMetrics>;
    utterances: SttCompareResults['utterances'];
    limitations: string[];
}

export function buildSttBenchmarkReport(results: SttCompareResults): SttBenchmarkReport {
    const glossaryTerms = results.glossary.entries.map((entry) => entry.term);
    const metrics = Object.fromEntries(
        Object.values(results.summary.byProvider).map((provider) => [
            provider.providerId,
            mapProviderMetrics(provider),
        ])
    );

    return {
        generatedAt: new Date().toISOString(),
        mode: 'live-compare',
        primaryProviderId: results.primaryProviderId,
        totalUtterances: results.summary.totalUtterances,
        glossaryTerms,
        metrics,
        utterances: results.utterances,
        limitations: [
            'CER and technical keyword recall require human-annotated reference transcripts and are not available from live compare alone.',
            'Truncation rate is left null until annotated references or explicit utterance boundary labels are provided.',
            'This report is intended to support provider selection and latency/error inspection during live meetings.',
        ],
    };
}

function mapProviderMetrics(provider: SttCompareProviderSummary): SttBenchmarkProviderMetrics {
    const finalCoverageRate = provider.totalUtterances > 0
        ? roundTo(provider.utterancesWithFinal / provider.totalUtterances)
        : null;
    const failureRate = provider.totalUtterances > 0
        ? roundTo(provider.errorCount / provider.totalUtterances)
        : null;

    return {
        providerId: provider.providerId,
        label: provider.label,
        totalUtterances: provider.totalUtterances,
        utterancesWithFinal: provider.utterancesWithFinal,
        finalCoverageRate,
        avgFirstPartialLatencyMs: provider.avgFirstPartialLatencyMs,
        avgFinalLatencyMs: provider.avgFinalLatencyMs,
        errorCount: provider.errorCount,
        failureRate,
        technicalTerms: provider.technicalTerms,
        technicalTermHitCount: provider.technicalTermHitCount,
        cer: null,
        technicalKeywordRecall: null,
        truncationRate: null,
        notes: [
            'Use exported utterances with manual references to compute CER and technical keyword recall.',
        ],
    };
}

function roundTo(value: number): number {
    return Math.round(value * 1000) / 1000;
}
