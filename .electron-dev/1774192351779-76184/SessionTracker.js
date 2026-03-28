"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionTracker = void 0;
const crypto_1 = require("crypto");
class SessionTracker {
    static FINAL_REFINEMENT_WINDOW_MS = 5000;
    static INTERVIEWER_SENTENCE_PAUSE_MS = 1800;
    static INTERVIEWER_REVISION_GRACE_MS = 2500;
    static MAX_ACTIVE_INTERVIEWER_CHARS = 260;
    static MIN_SENTENCE_LENGTH_FOR_PAUSE_SPLIT = 24;
    contextItems = [];
    contextWindowDuration = 120;
    maxContextItems = 500;
    lastAssistantMessage = null;
    assistantResponseHistory = [];
    currentMeetingMetadata = null;
    fullTranscript = [];
    fullUsage = [];
    sessionStartTime = Date.now();
    static MAX_EPOCH_SUMMARIES = 5;
    transcriptEpochSummaries = [];
    isCompacting = false;
    liveTranscriptSegments = [];
    lastInterimInterviewer = null;
    liveTranscriptHasEdits = false;
    recapLLM = null;
    setRecapLLM(recapLLM) {
        this.recapLLM = recapLLM;
    }
    setMeetingMetadata(metadata) {
        this.currentMeetingMetadata = metadata;
    }
    getMeetingMetadata() {
        return this.currentMeetingMetadata;
    }
    clearMeetingMetadata() {
        this.currentMeetingMetadata = null;
    }
    addTranscript(segment) {
        if (!segment.final)
            return null;
        if (segment.speaker === 'interviewer')
            return this.handleTranscript(segment);
        const role = this.mapSpeakerToRole(segment.speaker);
        const text = segment.text.trim();
        if (!text)
            return null;
        const normalizedSegment = {
            ...segment,
            id: segment.id || this.createSegmentId(),
            text,
            final: true,
            status: 'final',
        };
        const lastItem = this.contextItems[this.contextItems.length - 1];
        const lastTranscript = this.fullTranscript[this.fullTranscript.length - 1];
        if (lastItem && lastItem.role === role) {
            const timeDelta = Math.abs(lastItem.timestamp - normalizedSegment.timestamp);
            if (timeDelta < 500 && this.normalizeTranscriptForComparison(lastItem.text) === this.normalizeTranscriptForComparison(text)) {
                if (text.length > lastItem.text.length) {
                    lastItem.text = text;
                    lastItem.timestamp = normalizedSegment.timestamp;
                    if (lastTranscript && this.mapSpeakerToRole(lastTranscript.speaker) === role && this.normalizeTranscriptForComparison(lastTranscript.text) === this.normalizeTranscriptForComparison(text)) {
                        lastTranscript.text = text;
                        lastTranscript.timestamp = normalizedSegment.timestamp;
                    }
                }
                return null;
            }
            if (timeDelta <= SessionTracker.FINAL_REFINEMENT_WINDOW_MS && this.isTranscriptRefinement(lastItem.text, text)) {
                const refinedText = this.chooseMoreCompleteTranscript(lastItem.text, text);
                if (refinedText === lastItem.text)
                    return null;
                lastItem.text = refinedText;
                lastItem.timestamp = normalizedSegment.timestamp;
                if (lastTranscript && this.mapSpeakerToRole(lastTranscript.speaker) === role && this.isTranscriptRefinement(lastTranscript.text, refinedText)) {
                    lastTranscript.text = refinedText;
                    lastTranscript.timestamp = normalizedSegment.timestamp;
                    lastTranscript.confidence = normalizedSegment.confidence ?? lastTranscript.confidence;
                }
                return null;
            }
        }
        this.contextItems.push({ id: normalizedSegment.id, role, text, timestamp: normalizedSegment.timestamp });
        this.evictOldEntries();
        const isInternalPrompt = text.startsWith("You are a real-time interview assistant") || text.startsWith("You are a helper") || text.startsWith("CONTEXT:");
        if (!isInternalPrompt) {
            this.fullTranscript.push(normalizedSegment);
            void this.compactTranscriptIfNeeded().catch(e => console.warn('[SessionTracker] compactTranscript error (non-fatal):', e));
        }
        return { role };
    }
    addAssistantMessage(text) {
        if (!text)
            return;
        const cleanText = text.trim();
        if (cleanText.length < 10)
            return;
        if (cleanText.includes("I'm not sure") || cleanText.includes("I can't answer"))
            return;
        const segmentId = this.createSegmentId();
        const timestamp = Date.now();
        this.contextItems.push({ id: segmentId, role: 'assistant', text: cleanText, timestamp });
        this.fullTranscript.push({
            id: segmentId,
            speaker: 'assistant',
            text: cleanText,
            timestamp,
            final: true,
            confidence: 1,
            status: 'final',
        });
        void this.compactTranscriptIfNeeded().catch(e => console.warn('[SessionTracker] compactTranscript error (non-fatal):', e));
        this.lastAssistantMessage = cleanText;
        this.assistantResponseHistory.push({ text: cleanText, timestamp, questionContext: this.getLastInterviewerTurn() || 'unknown' });
        if (this.assistantResponseHistory.length > 10) {
            this.assistantResponseHistory = this.assistantResponseHistory.slice(-10);
        }
        this.evictOldEntries();
    }
    handleTranscript(segment) {
        if (segment.speaker === 'interviewer')
            return this.handleInterviewerTranscript(segment);
        return this.addTranscript(segment);
    }
    commitLiveTranscriptSegment(id) {
        const target = id ? this.liveTranscriptSegments.find(segment => segment.id === id) : this.getActiveInterviewerSegment();
        if (!target || target.status === 'final')
            return null;
        return this.finalizeInterviewerSegment(target.id, Date.now());
    }
    editLiveTranscriptSegment(id, nextText) {
        const trimmed = nextText.trim();
        if (!trimmed)
            return null;
        const target = this.liveTranscriptSegments.find(segment => segment.id === id);
        if (!target)
            return null;
        target.text = trimmed;
        target.updatedAt = Date.now();
        target.edited = true;
        this.liveTranscriptHasEdits = true;
        if (target.status === 'active') {
            this.lastInterimInterviewer = this.toTranscriptSegment(target, false);
        }
        else {
            this.syncCommittedInterviewerSegment(target);
        }
        return this.cloneLiveSegment(target);
    }
    getLiveTranscriptState() {
        return this.liveTranscriptSegments.map(segment => this.cloneLiveSegment(segment));
    }
    hasEditedLiveTranscript() {
        return this.liveTranscriptHasEdits;
    }
    getTranscriptForRag(includeActiveInterviewer = true) {
        const segments = this.fullTranscript.map(segment => ({ speaker: segment.speaker, text: segment.text, timestamp: segment.timestamp }));
        if (includeActiveInterviewer && this.lastInterimInterviewer?.text.trim()) {
            const lastFinal = segments[segments.length - 1];
            const interim = {
                speaker: this.lastInterimInterviewer.speaker,
                text: this.lastInterimInterviewer.text.trim(),
                timestamp: this.lastInterimInterviewer.timestamp,
            };
            const isDuplicate = lastFinal && lastFinal.speaker === interim.speaker && this.normalizeTranscriptForComparison(lastFinal.text) === this.normalizeTranscriptForComparison(interim.text);
            if (!isDuplicate)
                segments.push(interim);
        }
        return segments;
    }
    getContext(lastSeconds = 120) {
        const cutoff = Date.now() - (lastSeconds * 1000);
        const items = this.contextItems.filter(item => item.timestamp >= cutoff);
        const interim = this.lastInterimInterviewer;
        if (interim && interim.text.trim().length > 0 && interim.timestamp >= cutoff) {
            const duplicate = items.some(item => item.role === 'interviewer' &&
                Math.abs(item.timestamp - interim.timestamp) < 500 &&
                this.normalizeTranscriptForComparison(item.text) === this.normalizeTranscriptForComparison(interim.text));
            if (!duplicate) {
                items.push({ id: interim.id, role: 'interviewer', text: interim.text, timestamp: interim.timestamp });
            }
        }
        return items.sort((left, right) => left.timestamp - right.timestamp);
    }
    getLastAssistantMessage() {
        return this.lastAssistantMessage;
    }
    getAssistantResponseHistory() {
        return this.assistantResponseHistory;
    }
    getLastInterimInterviewer() {
        return this.lastInterimInterviewer;
    }
    getFormattedContext(lastSeconds = 120) {
        return this.getContext(lastSeconds).map(item => {
            const label = item.role === 'interviewer' ? 'INTERVIEWER' : item.role === 'user' ? 'ME' : 'ASSISTANT (PREVIOUS SUGGESTION)';
            return `[${label}]: ${item.text}`;
        }).join('\n');
    }
    getLastInterviewerTurn() {
        if (this.lastInterimInterviewer?.text.trim())
            return this.lastInterimInterviewer.text;
        for (let i = this.contextItems.length - 1; i >= 0; i -= 1) {
            if (this.contextItems[i].role === 'interviewer')
                return this.contextItems[i].text;
        }
        return null;
    }
    getFullSessionContext() {
        const recentTranscript = this.fullTranscript.map(segment => {
            const role = this.mapSpeakerToRole(segment.speaker);
            const label = role === 'interviewer' ? 'INTERVIEWER' : role === 'user' ? 'ME' : 'ASSISTANT';
            return `[${label}]: ${segment.text}`;
        }).join('\n');
        if (this.transcriptEpochSummaries.length > 0) {
            const epochContext = this.transcriptEpochSummaries.join('\n---\n');
            return `[SESSION HISTORY - EARLIER DISCUSSION]\n${epochContext}\n\n[RECENT TRANSCRIPT]\n${recentTranscript}`;
        }
        return recentTranscript;
    }
    getFullTranscript() {
        return this.fullTranscript.map(segment => ({ ...segment }));
    }
    getFullUsage() {
        return this.fullUsage;
    }
    getSessionStartTime() {
        return this.sessionStartTime;
    }
    capUsageArray() {
        if (this.fullUsage.length > 500) {
            this.fullUsage = this.fullUsage.slice(-500);
        }
    }
    logUsage(type, question, answer) {
        this.fullUsage.push({ type, timestamp: Date.now(), question, answer });
    }
    pushUsage(entry) {
        this.fullUsage.push(entry);
        this.capUsageArray();
    }
    flushInterimTranscript() {
        if (this.lastInterimInterviewer?.id) {
            this.commitLiveTranscriptSegment(this.lastInterimInterviewer.id);
        }
    }
    reset() {
        this.contextItems = [];
        this.fullTranscript = [];
        this.fullUsage = [];
        this.transcriptEpochSummaries = [];
        this.sessionStartTime = Date.now();
        this.lastAssistantMessage = null;
        this.assistantResponseHistory = [];
        this.lastInterimInterviewer = null;
        this.liveTranscriptSegments = [];
        this.liveTranscriptHasEdits = false;
    }
    mapSpeakerToRole(speaker) {
        if (speaker === 'user')
            return 'user';
        if (speaker === 'assistant')
            return 'assistant';
        return 'interviewer';
    }
    createSegmentId() {
        return (0, crypto_1.randomUUID)();
    }
    cloneLiveSegment(segment) {
        return { ...segment };
    }
    handleInterviewerTranscript(segment) {
        const nextText = segment.text.trim();
        if (!nextText)
            return null;
        const timestamp = segment.timestamp || Date.now();
        const current = this.getActiveInterviewerSegment();
        if (!current) {
            const liveSegment = {
                id: this.createSegmentId(),
                speaker: 'interviewer',
                text: nextText,
                timestamp,
                updatedAt: timestamp,
                status: segment.final ? 'final' : 'active',
                edited: false,
                lastProviderText: nextText,
                lastProviderTimestamp: timestamp,
                confidence: segment.confidence,
            };
            this.liveTranscriptSegments.push(liveSegment);
            if (segment.final) {
                this.syncCommittedInterviewerSegment(liveSegment);
                this.lastInterimInterviewer = null;
            }
            else {
                this.lastInterimInterviewer = this.toTranscriptSegment(liveSegment, false);
            }
            return { role: 'interviewer' };
        }
        if (this.shouldStartNewInterviewerSegment(current, nextText, timestamp)) {
            this.finalizeInterviewerSegment(current.id, current.updatedAt);
            return this.handleInterviewerTranscript(segment);
        }
        current.text = current.edited
            ? this.appendTailWithoutOverwritingEdits(current, nextText)
            : this.mergeProviderTranscript(current.lastProviderText, nextText, current.text);
        current.updatedAt = Math.max(timestamp, current.updatedAt);
        current.lastProviderText = nextText;
        current.lastProviderTimestamp = timestamp;
        current.confidence = segment.confidence ?? current.confidence;
        if (segment.final || current.text.length >= SessionTracker.MAX_ACTIVE_INTERVIEWER_CHARS) {
            this.finalizeInterviewerSegment(current.id, timestamp);
        }
        else {
            this.lastInterimInterviewer = this.toTranscriptSegment(current, false);
        }
        return { role: 'interviewer' };
    }
    shouldStartNewInterviewerSegment(current, nextProviderText, nextTimestamp) {
        if (current.status === 'final')
            return true;
        const pauseBaseline = current.lastProviderTimestamp ?? current.updatedAt;
        const pauseMs = Math.abs(nextTimestamp - pauseBaseline);
        const endedSentence = /[\u3002\uFF01\uFF1F.!?]$/.test(current.text.trim());
        const looksLikeRevision = this.isTranscriptRefinement(current.lastProviderText || current.text, nextProviderText);
        if (current.text.length >= SessionTracker.MAX_ACTIVE_INTERVIEWER_CHARS)
            return true;
        if (endedSentence && pauseMs >= 600)
            return true;
        if (pauseMs >= SessionTracker.INTERVIEWER_SENTENCE_PAUSE_MS && current.text.trim().length >= SessionTracker.MIN_SENTENCE_LENGTH_FOR_PAUSE_SPLIT) {
            return true;
        }
        if (!looksLikeRevision && pauseMs > SessionTracker.INTERVIEWER_REVISION_GRACE_MS)
            return true;
        return false;
    }
    mergeProviderTranscript(previousProviderText, nextProviderText, currentVisibleText) {
        if (!previousProviderText)
            return nextProviderText.trim();
        if (!nextProviderText)
            return currentVisibleText.trim();
        if (this.isTranscriptRefinement(previousProviderText, nextProviderText)) {
            return this.chooseMoreCompleteTranscript(currentVisibleText, nextProviderText).trim();
        }
        return `${currentVisibleText.trim()} ${nextProviderText.trim()}`.trim();
    }
    appendTailWithoutOverwritingEdits(current, nextProviderText) {
        const previousProviderText = current.lastProviderText || '';
        if (!previousProviderText)
            return current.text;
        if (nextProviderText.startsWith(previousProviderText)) {
            const tail = nextProviderText.slice(previousProviderText.length);
            return tail.trim() ? `${current.text}${tail}`.trim() : current.text;
        }
        if (nextProviderText.includes(previousProviderText)) {
            const tail = nextProviderText.slice(nextProviderText.indexOf(previousProviderText) + previousProviderText.length);
            return tail.trim() ? `${current.text}${tail}`.trim() : current.text;
        }
        return current.text;
    }
    finalizeInterviewerSegment(id, timestamp) {
        const target = this.liveTranscriptSegments.find(segment => segment.id === id);
        if (!target)
            return null;
        target.status = 'final';
        target.updatedAt = Math.max(timestamp, target.updatedAt);
        this.lastInterimInterviewer = null;
        this.syncCommittedInterviewerSegment(target);
        return this.cloneLiveSegment(target);
    }
    syncCommittedInterviewerSegment(segment) {
        const text = segment.text.trim();
        if (!text)
            return;
        const contextItem = {
            id: segment.id,
            role: 'interviewer',
            text,
            timestamp: segment.updatedAt,
        };
        const transcriptSegment = {
            id: segment.id,
            speaker: 'interviewer',
            text,
            timestamp: segment.updatedAt,
            final: true,
            confidence: segment.confidence,
            edited: segment.edited,
            lastProviderText: segment.lastProviderText,
            lastProviderTimestamp: segment.lastProviderTimestamp,
            status: 'final',
        };
        const contextIndex = this.contextItems.findIndex(item => item.id === segment.id);
        const transcriptIndex = this.fullTranscript.findIndex(item => item.id === segment.id);
        if (contextIndex >= 0)
            this.contextItems[contextIndex] = contextItem;
        else
            this.contextItems.push(contextItem);
        if (transcriptIndex >= 0)
            this.fullTranscript[transcriptIndex] = transcriptSegment;
        else {
            this.fullTranscript.push(transcriptSegment);
            void this.compactTranscriptIfNeeded().catch(e => console.warn('[SessionTracker] compactTranscript error (non-fatal):', e));
        }
        this.contextItems.sort((left, right) => left.timestamp - right.timestamp);
        this.fullTranscript.sort((left, right) => left.timestamp - right.timestamp);
        this.evictOldEntries();
    }
    toTranscriptSegment(segment, final) {
        return {
            id: segment.id,
            speaker: segment.speaker,
            text: segment.text,
            timestamp: segment.updatedAt,
            final,
            confidence: segment.confidence,
            edited: segment.edited,
            lastProviderText: segment.lastProviderText,
            lastProviderTimestamp: segment.lastProviderTimestamp,
            status: final ? 'final' : 'active',
        };
    }
    getActiveInterviewerSegment() {
        for (let index = this.liveTranscriptSegments.length - 1; index >= 0; index -= 1) {
            if (this.liveTranscriptSegments[index].status === 'active')
                return this.liveTranscriptSegments[index];
        }
        return undefined;
    }
    normalizeTranscriptForComparison(text) {
        return text.trim().replace(/\s+/g, '').replace(/[\u3002\uFF01\uFF1F\uFF1B\uFF1A\uFF0C,.!?;:]/g, '');
    }
    computeEditDistance(left, right) {
        const rows = left.length + 1;
        const cols = right.length + 1;
        const matrix = Array.from({ length: rows }, () => new Array(cols).fill(0));
        for (let row = 0; row < rows; row += 1)
            matrix[row][0] = row;
        for (let col = 0; col < cols; col += 1)
            matrix[0][col] = col;
        for (let row = 1; row < rows; row += 1) {
            for (let col = 1; col < cols; col += 1) {
                const substitutionCost = left[row - 1] === right[col - 1] ? 0 : 1;
                matrix[row][col] = Math.min(matrix[row - 1][col] + 1, matrix[row][col - 1] + 1, matrix[row - 1][col - 1] + substitutionCost);
            }
        }
        return matrix[left.length][right.length];
    }
    computeLongestCommonSubsequenceLength(left, right) {
        const rows = left.length + 1;
        const cols = right.length + 1;
        const matrix = Array.from({ length: rows }, () => new Array(cols).fill(0));
        for (let row = 1; row < rows; row += 1) {
            for (let col = 1; col < cols; col += 1) {
                if (left[row - 1] === right[col - 1])
                    matrix[row][col] = matrix[row - 1][col - 1] + 1;
                else
                    matrix[row][col] = Math.max(matrix[row - 1][col], matrix[row][col - 1]);
            }
        }
        return matrix[left.length][right.length];
    }
    calculateTranscriptSimilarity(previousText, nextText) {
        const previous = this.normalizeTranscriptForComparison(previousText);
        const next = this.normalizeTranscriptForComparison(nextText);
        if (!previous || !next)
            return 0;
        if (previous === next)
            return 1;
        return 1 - (this.computeEditDistance(previous, next) / Math.max(previous.length, next.length));
    }
    calculateTranscriptOverlap(previousText, nextText) {
        const previous = this.normalizeTranscriptForComparison(previousText);
        const next = this.normalizeTranscriptForComparison(nextText);
        if (!previous || !next)
            return 0;
        return this.computeLongestCommonSubsequenceLength(previous, next) / Math.min(previous.length, next.length);
    }
    isTranscriptRefinement(previousText, nextText) {
        const previous = this.normalizeTranscriptForComparison(previousText);
        const next = this.normalizeTranscriptForComparison(nextText);
        if (!previous || !next)
            return false;
        if (previous === next)
            return true;
        if (next.startsWith(previous) || previous.startsWith(next))
            return true;
        if (Math.min(previous.length, next.length) < 16)
            return false;
        return this.calculateTranscriptSimilarity(previous, next) >= 0.72 || this.calculateTranscriptOverlap(previous, next) >= 0.78;
    }
    chooseMoreCompleteTranscript(previousText, nextText) {
        const previous = previousText.trim();
        const next = nextText.trim();
        const previousNormalized = this.normalizeTranscriptForComparison(previous);
        const nextNormalized = this.normalizeTranscriptForComparison(next);
        if (nextNormalized.length > previousNormalized.length)
            return next;
        if (nextNormalized === previousNormalized && next.length >= previous.length)
            return next;
        return previous;
    }
    evictOldEntries() {
        const cutoff = Date.now() - (this.contextWindowDuration * 1000);
        this.contextItems = this.contextItems.filter(item => item.timestamp >= cutoff);
        if (this.contextItems.length > this.maxContextItems) {
            this.contextItems = this.contextItems.slice(-this.maxContextItems);
        }
    }
    async compactTranscriptIfNeeded() {
        if (this.fullTranscript.length <= 1800 || this.isCompacting)
            return;
        this.isCompacting = true;
        try {
            const summarizeCount = Math.max(300, Math.floor(this.fullTranscript.length * 0.3));
            const oldEntries = this.fullTranscript.slice(0, summarizeCount);
            let summary = this.buildEpochFallbackSummary(oldEntries);
            if (this.recapLLM) {
                try {
                    const context = oldEntries.map(item => {
                        const role = this.mapSpeakerToRole(item.speaker);
                        const label = role === 'interviewer' ? 'INTERVIEWER' : role === 'user' ? 'ME' : 'ASSISTANT';
                        return `[${label}]: ${item.text}`;
                    }).join('\n');
                    const recap = await this.recapLLM.generate(context);
                    if (recap && recap.trim().length > 0)
                        summary = recap.trim();
                }
                catch {
                    // Fall back to the lightweight summary below.
                }
            }
            this.transcriptEpochSummaries.push(summary);
            if (this.transcriptEpochSummaries.length > SessionTracker.MAX_EPOCH_SUMMARIES) {
                this.transcriptEpochSummaries = this.transcriptEpochSummaries.slice(-SessionTracker.MAX_EPOCH_SUMMARIES);
            }
            this.fullTranscript = this.fullTranscript.slice(summarizeCount);
        }
        finally {
            this.isCompacting = false;
        }
    }
    buildEpochFallbackSummary(entries) {
        const lines = entries.slice(0, 20).map(entry => {
            const role = this.mapSpeakerToRole(entry.speaker);
            const label = role === 'interviewer' ? 'INTERVIEWER' : role === 'user' ? 'ME' : 'ASSISTANT';
            return `[${label}]: ${entry.text}`;
        });
        if (entries.length > lines.length) {
            lines.push(`... ${entries.length - lines.length} earlier transcript entries omitted ...`);
        }
        return lines.join('\n');
    }
}
exports.SessionTracker = SessionTracker;
//# sourceMappingURL=SessionTracker.js.map