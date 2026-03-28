"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionTracker = void 0;
const crypto_1 = require("crypto");
class SessionTracker {
    static FINAL_REFINEMENT_WINDOW_MS = 5000;
    static SOFT_INTERVIEWER_SEGMENT_CHARS = 200;
    static RECENT_DUPLICATE_INTERVIEWER_WINDOW_MS = 15000;
    static SENTENCE_BOUNDARY_REGEX = /[。！？!?；;]$/;
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
        if (!segment.final && segment.speaker !== 'interviewer' && segment.speaker !== 'user')
            return null;
        if (segment.speaker === 'interviewer' || segment.speaker === 'user')
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
        if (segment.speaker === 'interviewer' || segment.speaker === 'user')
            return this.handleLiveSpeakerTranscript(segment);
        return this.addTranscript(segment);
    }
    commitLiveTranscriptSegment(id, speaker = 'interviewer') {
        const target = id ? this.liveTranscriptSegments.find(segment => segment.id === id) : this.getActiveLiveSegment(speaker);
        if (!target || target.status === 'final')
            return null;
        return this.finalizeLiveTranscriptSegment(target.id, Date.now());
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
            if (target.speaker === 'interviewer') {
                this.lastInterimInterviewer = this.toTranscriptSegment(target, false);
            }
        }
        else {
            this.syncCommittedInterviewerSegment(target);
        }
        return this.cloneLiveSegment(target);
    }
    mergeLiveTranscriptSegmentWithPrevious(id) {
        const currentIndex = this.liveTranscriptSegments.findIndex(segment => segment.id === id);
        if (currentIndex <= 0)
            return null;
        const current = this.liveTranscriptSegments[currentIndex];
        const previousIndex = this.findPreviousSameSpeakerSegmentIndex(currentIndex, current.speaker);
        if (previousIndex < 0)
            return null;
        const previous = this.liveTranscriptSegments[previousIndex];
        const mergedText = this.mergeSegmentTexts(previous.text, current.text);
        if (!mergedText.trim())
            return null;
        const boundaryOffset = this.computeMergeBoundaryOffset(previous.text, current.text, mergedText);
        const nextUpdatedAt = Math.max(previous.updatedAt, current.updatedAt);
        const nextTimestamp = Math.min(previous.timestamp, current.timestamp);
        const nextStatus = current.status === 'active' || previous.status === 'active' ? 'active' : 'final';
        const nextEdited = previous.edited || current.edited;
        const nextLastProviderText = nextStatus === 'active'
            ? (current.lastProviderText || previous.lastProviderText || mergedText)
            : (previous.lastProviderText || current.lastProviderText || mergedText);
        const nextLastProviderTimestamp = Math.max(previous.lastProviderTimestamp || 0, current.lastProviderTimestamp || 0) || undefined;
        previous.text = mergedText;
        previous.timestamp = nextTimestamp;
        previous.updatedAt = nextUpdatedAt;
        previous.status = nextStatus;
        previous.edited = nextEdited;
        previous.lastProviderText = nextLastProviderText;
        previous.lastProviderTimestamp = nextLastProviderTimestamp;
        previous.confidence = current.confidence ?? previous.confidence;
        this.liveTranscriptSegments.splice(currentIndex, 1);
        this.removeCommittedSegmentById(current.id);
        if (nextStatus === 'active') {
            this.removeCommittedSegmentById(previous.id);
        }
        if (previous.speaker === 'interviewer') {
            this.lastInterimInterviewer = nextStatus === 'active'
                ? this.toTranscriptSegment(previous, false)
                : null;
        }
        if (nextStatus === 'final') {
            this.syncCommittedInterviewerSegment(previous);
        }
        return {
            state: this.getLiveTranscriptState(),
            mergedIntoId: previous.id,
            cursorPosition: boundaryOffset,
        };
    }
    getLiveTranscriptState() {
        return this.liveTranscriptSegments.map(segment => this.cloneLiveSegment(segment));
    }
    clearLiveTranscriptSegments(speaker) {
        this.liveTranscriptSegments = this.liveTranscriptSegments.filter(segment => segment.speaker !== speaker);
        if (speaker === 'interviewer') {
            this.lastInterimInterviewer = null;
        }
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
    handleLiveSpeakerTranscript(segment) {
        const nextText = segment.text.trim();
        if (!nextText)
            return null;
        const timestamp = segment.timestamp || Date.now();
        const speaker = this.mapSpeakerToRole(segment.speaker);
        if (speaker !== 'interviewer' && speaker !== 'user')
            return null;
        const current = this.getActiveLiveSegment(speaker);
        const canonicalIncomingText = current
            ? nextText
            : this.stripCommittedPrefixFromIncoming(nextText, this.buildTranscriptPrefixCandidates(speaker));
        if (!current) {
            if (!canonicalIncomingText && this.hasRecentSpeakerDuplicate(speaker, nextText, timestamp)) {
                return null;
            }
            if (canonicalIncomingText && this.hasRecentSpeakerDuplicate(speaker, canonicalIncomingText, timestamp)) {
                return null;
            }
        }
        const effectiveIncomingText = canonicalIncomingText || nextText;
        if (!current) {
            const liveSegment = {
                id: this.createSegmentId(),
                speaker,
                text: effectiveIncomingText,
                timestamp,
                updatedAt: timestamp,
                status: 'active',
                edited: false,
                lastProviderText: nextText,
                lastProviderTimestamp: timestamp,
                confidence: segment.confidence,
            };
            this.liveTranscriptSegments.push(liveSegment);
            this.applyLiveSegmentState(liveSegment, {
                isIncomingFinal: segment.final,
                timestamp,
                confidence: segment.confidence,
            });
            return { role: speaker };
        }
        current.text = current.edited
            ? this.appendTailWithoutOverwritingEdits(current, nextText)
            : this.mergeProviderTranscript(current.lastProviderText, nextText, current.text);
        current.updatedAt = Math.max(timestamp, current.updatedAt);
        current.lastProviderText = nextText;
        current.lastProviderTimestamp = timestamp;
        current.confidence = segment.confidence ?? current.confidence;
        this.applyLiveSegmentState(current, {
            isIncomingFinal: segment.final,
            timestamp,
            confidence: segment.confidence,
        });
        return { role: speaker };
    }
    mergeProviderTranscript(previousProviderText, nextProviderText, currentVisibleText) {
        if (!previousProviderText)
            return nextProviderText.trim();
        if (!nextProviderText)
            return currentVisibleText.trim();
        const previousVisible = currentVisibleText.trim();
        const providerAndVisibleDiffer = this.normalizeTranscriptForComparison(previousProviderText) !== this.normalizeTranscriptForComparison(previousVisible);
        if (providerAndVisibleDiffer) {
            if (nextProviderText.startsWith(previousProviderText)) {
                const tail = nextProviderText.slice(previousProviderText.length).trim();
                return tail ? `${previousVisible} ${tail}`.trim() : previousVisible;
            }
            if (nextProviderText.includes(previousProviderText)) {
                const tail = nextProviderText.slice(nextProviderText.indexOf(previousProviderText) + previousProviderText.length).trim();
                return tail ? `${previousVisible} ${tail}`.trim() : previousVisible;
            }
        }
        if (this.isTranscriptRefinement(previousProviderText, nextProviderText)) {
            return this.chooseMoreCompleteTranscript(currentVisibleText, nextProviderText).trim();
        }
        return `${currentVisibleText.trim()} ${nextProviderText.trim()}`.trim();
    }
    appendTailWithoutOverwritingEdits(current, nextProviderText) {
        const previousProviderText = current.lastProviderText || '';
        const currentVisibleText = current.text.trim();
        if (!previousProviderText)
            return currentVisibleText;
        if (nextProviderText.startsWith(currentVisibleText)) {
            const tail = nextProviderText.slice(currentVisibleText.length);
            return tail.trim() ? `${currentVisibleText}${tail}`.trim() : currentVisibleText;
        }
        if (nextProviderText.includes(currentVisibleText)) {
            const tail = nextProviderText.slice(nextProviderText.indexOf(currentVisibleText) + currentVisibleText.length);
            return tail.trim() ? `${currentVisibleText}${tail}`.trim() : currentVisibleText;
        }
        if (nextProviderText.startsWith(previousProviderText)) {
            const tail = nextProviderText.slice(previousProviderText.length);
            return tail.trim() ? `${currentVisibleText}${tail}`.trim() : currentVisibleText;
        }
        if (nextProviderText.includes(previousProviderText)) {
            const tail = nextProviderText.slice(nextProviderText.indexOf(previousProviderText) + previousProviderText.length);
            return tail.trim() ? `${currentVisibleText}${tail}`.trim() : currentVisibleText;
        }
        return currentVisibleText;
    }
    hasRecentSpeakerDuplicate(speaker, nextText, timestamp) {
        if (!nextText.trim())
            return false;
        for (const segment of this.getRecentLiveSegments(speaker)) {
            if (!segment.text.trim())
                continue;
            if (Math.abs(timestamp - segment.updatedAt) > SessionTracker.RECENT_DUPLICATE_INTERVIEWER_WINDOW_MS) {
                continue;
            }
            if (this.normalizeTranscriptForComparison(segment.text) === this.normalizeTranscriptForComparison(nextText)) {
                return true;
            }
        }
        return false;
    }
    getRecentLiveSegments(speaker, limit = 8) {
        const items = [];
        for (let index = this.liveTranscriptSegments.length - 1; index >= 0 && items.length < limit; index -= 1) {
            if (this.liveTranscriptSegments[index].speaker === speaker) {
                items.push(this.liveTranscriptSegments[index]);
            }
        }
        return items;
    }
    buildTranscriptPrefixCandidates(speaker) {
        const recentSegments = this.getRecentLiveSegments(speaker);
        const candidates = [
            ...recentSegments.map(segment => segment.text),
            ...recentSegments.map(segment => segment.lastProviderText),
        ];
        const cumulativeFinalSegments = recentSegments
            .filter(segment => segment.status === 'final')
            .slice()
            .reverse();
        let cumulativeText = '';
        for (const segment of cumulativeFinalSegments) {
            cumulativeText = cumulativeText
                ? `${cumulativeText} ${segment.text.trim()}`.trim()
                : segment.text.trim();
            candidates.push(cumulativeText);
        }
        return candidates;
    }
    stripCommittedPrefixFromIncoming(nextText, previousTexts) {
        const incoming = nextText.trim();
        if (!incoming)
            return incoming;
        let bestRemainder = incoming;
        let bestRemovedNormalizedLength = 0;
        for (const previousText of previousTexts) {
            const candidate = previousText?.trim();
            if (!candidate)
                continue;
            const remainder = this.stripTranscriptPrefixOnce(incoming, candidate);
            const removedNormalizedLength = this.normalizeTranscriptForComparison(incoming).length -
                this.normalizeTranscriptForComparison(remainder).length;
            if (removedNormalizedLength > bestRemovedNormalizedLength) {
                bestRemainder = remainder;
                bestRemovedNormalizedLength = removedNormalizedLength;
            }
        }
        return bestRemainder;
    }
    stripTranscriptPrefixOnce(incomingText, prefixText) {
        const incoming = incomingText.trim();
        const prefix = prefixText.trim();
        if (!incoming || !prefix)
            return incoming;
        if (incoming === prefix)
            return '';
        if (incoming.startsWith(prefix)) {
            return incoming.slice(prefix.length).trim();
        }
        const normalizedIncoming = this.normalizeTranscriptForComparison(incoming);
        const normalizedPrefix = this.normalizeTranscriptForComparison(prefix);
        if (!normalizedIncoming || !normalizedPrefix || !normalizedIncoming.startsWith(normalizedPrefix)) {
            return incoming;
        }
        let matchedNormalizedChars = 0;
        let cutIndex = 0;
        for (let index = 0; index < incoming.length; index += 1) {
            const char = incoming[index];
            if (!/[\s\u3002\uFF01\uFF1F\uFF1B\uFF1A\uFF0C,.!?;:]/.test(char)) {
                matchedNormalizedChars += 1;
            }
            cutIndex = index + 1;
            if (matchedNormalizedChars >= normalizedPrefix.length) {
                break;
            }
        }
        return incoming.slice(cutIndex).trim();
    }
    finalizeLiveTranscriptSegment(id, timestamp) {
        const target = this.liveTranscriptSegments.find(segment => segment.id === id);
        if (!target)
            return null;
        target.status = 'final';
        target.updatedAt = Math.max(timestamp, target.updatedAt);
        if (target.speaker === 'interviewer') {
            this.lastInterimInterviewer = null;
        }
        this.syncCommittedInterviewerSegment(target);
        return this.cloneLiveSegment(target);
    }
    applyLiveSegmentState(current, options) {
        if (current.speaker !== 'interviewer') {
            if (options.isIncomingFinal) {
                this.finalizeLiveTranscriptSegment(current.id, options.timestamp);
            }
            return;
        }
        const chunks = this.splitInterviewerIntoChunks(current.text);
        if (chunks.length === 0)
            return;
        if (chunks.length === 1) {
            current.text = chunks[0];
            if (options.isIncomingFinal) {
                this.finalizeLiveTranscriptSegment(current.id, options.timestamp);
            }
            else {
                this.lastInterimInterviewer = this.toTranscriptSegment(current, false);
            }
            return;
        }
        current.text = chunks[0];
        current.confidence = options.confidence ?? current.confidence;
        this.finalizeLiveTranscriptSegment(current.id, options.timestamp);
        for (let index = 1; index < chunks.length; index += 1) {
            const isLast = index === chunks.length - 1;
            const nextSegment = {
                id: this.createSegmentId(),
                speaker: 'interviewer',
                text: chunks[index],
                timestamp: options.timestamp,
                updatedAt: options.timestamp,
                status: isLast && !options.isIncomingFinal ? 'active' : 'final',
                edited: current.edited,
                lastProviderText: isLast ? current.lastProviderText : chunks[index],
                lastProviderTimestamp: current.lastProviderTimestamp,
                confidence: options.confidence ?? current.confidence,
            };
            if (this.hasRecentSpeakerDuplicate('interviewer', nextSegment.text, options.timestamp)) {
                continue;
            }
            this.liveTranscriptSegments.push(nextSegment);
            if (nextSegment.status === 'final') {
                this.syncCommittedInterviewerSegment(nextSegment);
                this.lastInterimInterviewer = null;
            }
            else {
                this.lastInterimInterviewer = this.toTranscriptSegment(nextSegment, false);
            }
        }
    }
    splitInterviewerIntoChunks(text) {
        const trimmed = text.trim();
        if (!trimmed)
            return [];
        const chunks = [];
        let currentChunk = '';
        for (const char of trimmed) {
            currentChunk += char;
            if (SessionTracker.SENTENCE_BOUNDARY_REGEX.test(char) &&
                currentChunk.trim().length >= SessionTracker.SOFT_INTERVIEWER_SEGMENT_CHARS) {
                chunks.push(currentChunk.trim());
                currentChunk = '';
            }
        }
        if (currentChunk.trim()) {
            chunks.push(currentChunk.trim());
        }
        return chunks;
    }
    findPreviousSameSpeakerSegmentIndex(index, speaker) {
        for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
            if (this.liveTranscriptSegments[cursor].speaker === speaker) {
                return cursor;
            }
        }
        return -1;
    }
    mergeSegmentTexts(previousText, currentText) {
        const previous = previousText.trimEnd();
        const current = currentText.trimStart();
        if (!previous)
            return current;
        if (!current)
            return previous;
        const lastChar = previous[previous.length - 1];
        const firstChar = current[0];
        const hasCjkBoundary = /[\u3400-\u9fff]/.test(lastChar) || /[\u3400-\u9fff]/.test(firstChar);
        const needsSpace = !hasCjkBoundary &&
            !/\s$/.test(previous) &&
            !/^\s/.test(current) &&
            !/[.,!?;:)\]]/.test(firstChar);
        return `${previous}${needsSpace ? ' ' : ''}${current}`.trim();
    }
    computeMergeBoundaryOffset(previousText, currentText, mergedText) {
        const previous = previousText.trimEnd();
        const current = currentText.trimStart();
        if (!previous)
            return 0;
        if (!current)
            return previous.length;
        const lastChar = previous[previous.length - 1];
        const firstChar = current[0];
        const hasCjkBoundary = /[\u3400-\u9fff]/.test(lastChar) || /[\u3400-\u9fff]/.test(firstChar);
        const needsSpace = !hasCjkBoundary &&
            !/\s$/.test(previous) &&
            !/^\s/.test(current) &&
            !/[.,!?;:)\]]/.test(firstChar);
        const boundary = previous.length + (needsSpace ? 1 : 0);
        return Math.min(boundary, mergedText.length);
    }
    removeCommittedSegmentById(id) {
        const contextIndex = this.contextItems.findIndex(item => item.id === id);
        if (contextIndex >= 0) {
            this.contextItems.splice(contextIndex, 1);
        }
        const transcriptIndex = this.fullTranscript.findIndex(item => item.id === id);
        if (transcriptIndex >= 0) {
            this.fullTranscript.splice(transcriptIndex, 1);
        }
    }
    syncCommittedInterviewerSegment(segment) {
        const text = segment.text.trim();
        if (!text)
            return;
        const role = this.mapSpeakerToRole(segment.speaker);
        const contextItem = {
            id: segment.id,
            role,
            text,
            timestamp: segment.updatedAt,
        };
        const transcriptSegment = {
            id: segment.id,
            speaker: segment.speaker,
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
        let recentContextDuplicateIndex = -1;
        for (let index = this.contextItems.length - 1; index >= 0; index -= 1) {
            const item = this.contextItems[index];
            if (item.id === segment.id || item.role !== role)
                continue;
            if (Math.abs(item.timestamp - segment.updatedAt) > SessionTracker.RECENT_DUPLICATE_INTERVIEWER_WINDOW_MS)
                continue;
            if (this.normalizeTranscriptForComparison(item.text) === this.normalizeTranscriptForComparison(text)) {
                recentContextDuplicateIndex = index;
                break;
            }
        }
        let recentTranscriptDuplicateIndex = -1;
        for (let index = this.fullTranscript.length - 1; index >= 0; index -= 1) {
            const item = this.fullTranscript[index];
            if (item.id === segment.id || item.speaker !== segment.speaker)
                continue;
            if (Math.abs(item.timestamp - segment.updatedAt) > SessionTracker.RECENT_DUPLICATE_INTERVIEWER_WINDOW_MS)
                continue;
            if (this.normalizeTranscriptForComparison(item.text) === this.normalizeTranscriptForComparison(text)) {
                recentTranscriptDuplicateIndex = index;
                break;
            }
        }
        if (contextIndex >= 0)
            this.contextItems[contextIndex] = contextItem;
        else if (recentContextDuplicateIndex >= 0)
            this.contextItems[recentContextDuplicateIndex] = contextItem;
        else
            this.contextItems.push(contextItem);
        if (transcriptIndex >= 0)
            this.fullTranscript[transcriptIndex] = transcriptSegment;
        else if (recentTranscriptDuplicateIndex >= 0)
            this.fullTranscript[recentTranscriptDuplicateIndex] = transcriptSegment;
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
    getActiveLiveSegment(speaker) {
        for (let index = this.liveTranscriptSegments.length - 1; index >= 0; index -= 1) {
            if (this.liveTranscriptSegments[index].speaker === speaker && this.liveTranscriptSegments[index].status === 'active') {
                return this.liveTranscriptSegments[index];
            }
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
