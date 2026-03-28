"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_TECHNICAL_GLOSSARY = void 0;
exports.normalizeTechnicalGlossaryConfig = normalizeTechnicalGlossaryConfig;
exports.normalizeTechnicalTermEntry = normalizeTechnicalTermEntry;
exports.buildOpenAITranscriptionPrompt = buildOpenAITranscriptionPrompt;
exports.extractGlossaryHits = extractGlossaryHits;
exports.parseTechnicalGlossaryText = parseTechnicalGlossaryText;
exports.formatTechnicalGlossaryText = formatTechnicalGlossaryText;
exports.DEFAULT_TECHNICAL_GLOSSARY = {
    entries: [
        { term: 'agent', weight: 5 },
        { term: 'tool calling', weight: 5 },
        { term: 'workflow', weight: 4 },
        { term: 'MCP', weight: 5 },
        { term: 'RAG', weight: 5 },
        { term: 'Java', weight: 5 },
        { term: 'Spring', weight: 5 },
        { term: 'Spring Boot', weight: 5 },
        { term: 'MySQL', weight: 5 },
        { term: 'Redis', weight: 5 },
        { term: 'Kafka', weight: 5 },
        { term: 'JVM', weight: 5 },
        { term: '线程池', weight: 5 },
        { term: '分布式锁', weight: 5 },
        { term: '消息队列', weight: 4 },
        { term: '微服务', weight: 4 },
        { term: '面向对象', weight: 3 },
        { term: '并发', weight: 4 },
        { term: '一致性', weight: 4 },
        { term: '幂等', weight: 4 },
    ],
    updatedAt: new Date(0).toISOString(),
};
function normalizeTechnicalGlossaryConfig(config) {
    const entries = (config?.entries || exports.DEFAULT_TECHNICAL_GLOSSARY.entries)
        .map((entry) => normalizeTechnicalTermEntry(entry))
        .filter((entry) => Boolean(entry));
    return {
        entries: entries.length > 0 ? entries : exports.DEFAULT_TECHNICAL_GLOSSARY.entries,
        alibabaWorkspaceId: config?.alibabaWorkspaceId?.trim() || undefined,
        alibabaVocabularyId: config?.alibabaVocabularyId?.trim() || undefined,
        funAsrVocabularyId: config?.funAsrVocabularyId?.trim() || undefined,
        updatedAt: config?.updatedAt || new Date().toISOString(),
    };
}
function normalizeTechnicalTermEntry(entry) {
    if (!entry)
        return null;
    if (typeof entry === 'string') {
        const normalized = entry.trim();
        return normalized ? { term: normalized } : null;
    }
    const normalizedTerm = entry.term?.trim();
    if (!normalizedTerm)
        return null;
    const aliases = Array.isArray(entry.aliases)
        ? entry.aliases.map((alias) => alias.trim()).filter(Boolean)
        : undefined;
    const normalizedWeight = typeof entry.weight === 'number'
        ? Math.max(-6, Math.min(5, Math.round(entry.weight)))
        : undefined;
    return {
        term: normalizedTerm,
        weight: normalizedWeight,
        aliases: aliases && aliases.length > 0 ? aliases : undefined,
    };
}
function buildOpenAITranscriptionPrompt(config) {
    const glossary = normalizeTechnicalGlossaryConfig(config);
    const terms = glossary.entries
        .map((entry) => entry.term.trim())
        .filter(Boolean)
        .slice(0, 60);
    if (terms.length === 0) {
        return '';
    }
    return [
        'Transcribe accurately for a Chinese technical interview.',
        'Prefer these technical terms exactly when they are spoken:',
        terms.join(', '),
        'Preserve mixed Chinese and English technical vocabulary.',
    ].join(' ');
}
function extractGlossaryHits(text, config) {
    if (!text?.trim())
        return [];
    const glossary = normalizeTechnicalGlossaryConfig(config);
    const lowerText = text.toLowerCase();
    const hits = new Set();
    for (const entry of glossary.entries) {
        const candidates = [entry.term, ...(entry.aliases || [])]
            .map((candidate) => candidate.trim())
            .filter(Boolean);
        for (const candidate of candidates) {
            if (lowerText.includes(candidate.toLowerCase())) {
                hits.add(entry.term);
                break;
            }
        }
    }
    return Array.from(hits.values()).sort((a, b) => a.localeCompare(b));
}
function parseTechnicalGlossaryText(rawText, existingConfig) {
    const entries = rawText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
        const [termPart, weightPart] = line.split('|').map((part) => part.trim());
        const weight = weightPart ? Number(weightPart) : undefined;
        return normalizeTechnicalTermEntry({
            term: termPart,
            weight: Number.isFinite(weight) ? weight : undefined,
        });
    })
        .filter((entry) => Boolean(entry));
    return normalizeTechnicalGlossaryConfig({
        ...existingConfig,
        entries,
        updatedAt: new Date().toISOString(),
    });
}
function formatTechnicalGlossaryText(config) {
    const glossary = normalizeTechnicalGlossaryConfig(config);
    return glossary.entries
        .map((entry) => typeof entry.weight === 'number'
        ? `${entry.term} | ${entry.weight}`
        : entry.term)
        .join('\n');
}
//# sourceMappingURL=TechnicalGlossary.js.map
