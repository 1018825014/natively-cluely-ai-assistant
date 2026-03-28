"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSttBenchmarkReport = buildSttBenchmarkReport;
function buildSttBenchmarkReport(results) {
    const glossaryTerms = results.glossary.entries.map((entry) => entry.term);
    const metrics = Object.fromEntries(Object.values(results.summary.byProvider).map((provider) => [
        provider.providerId,
        mapProviderMetrics(provider),
    ]));
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
function mapProviderMetrics(provider) {
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
function roundTo(value) {
    return Math.round(value * 1000) / 1000;
}
//# sourceMappingURL=SttBenchmark.js.map
