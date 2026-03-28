import { randomUUID } from 'crypto';
import { RecapLLM } from './llm';

export interface TranscriptSegment {
    id?: string;
    marker?: string;
    speaker: string;
    text: string;
    timestamp: number;
    final: boolean;
    confidence?: number;
    edited?: boolean;
    lastProviderText?: string;
    lastProviderTimestamp?: number;
    status?: 'active' | 'final';
}

export interface LiveTranscriptSegment {
    id: string;
    speaker: 'interviewer' | 'user';
    text: string;
    timestamp: number;
    updatedAt: number;
    status: 'active' | 'final';
    edited: boolean;
    lastProviderText: string;
    lastProviderTimestamp?: number;
    confidence?: number;
}

export interface SuggestionTrigger {
    context: string;
    lastQuestion: string;
    confidence: number;
}

export interface ContextItem {
    id?: string;
    role: 'interviewer' | 'user' | 'assistant';
    text: string;
    timestamp: number;
}

export interface AssistantResponse {
    text: string;
    timestamp: number;
    questionContext: string;
}

export class SessionTracker {
    private static readonly FINAL_REFINEMENT_WINDOW_MS = 5000;
    private static readonly SOFT_INTERVIEWER_SEGMENT_CHARS = 200;
    private static readonly RECENT_DUPLICATE_INTERVIEWER_WINDOW_MS = 15000;
    private static readonly SENTENCE_BOUNDARY_REGEX = /[\u3002\uFF01\uFF1F!?\uFF1B;.]$/;
    private static readonly TRANSCRIPT_SEPARATOR_REGEX = /[\s\u3002\uFF01\uFF1F\uFF1B\uFF1A\uFF0C,.!?;:]/;
    private static readonly TRANSCRIPT_PUNCTUATION_GLOBAL_REGEX = /[\u3002\uFF01\uFF1F\uFF1B\uFF1A\uFF0C,.!?;:]/g;

    private contextItems: ContextItem[] = [];
    private readonly contextWindowDuration: number = 120;
    private readonly maxContextItems: number = 500;
    private lastAssistantMessage: string | null = null;
    private assistantResponseHistory: AssistantResponse[] = [];
    private currentMeetingMetadata: {
        title?: string;
        calendarEventId?: string;
        source?: 'manual' | 'calendar';
    } | null = null;
    private fullTranscript: TranscriptSegment[] = [];
    private fullUsage: any[] = [];
    private sessionStartTime: number = Date.now();
    private static readonly MAX_EPOCH_SUMMARIES = 5;
    private transcriptEpochSummaries: string[] = [];
    private isCompacting: boolean = false;
    private liveTranscriptSegments: LiveTranscriptSegment[] = [];
    private lastInterimInterviewer: TranscriptSegment | null = null;
    private lastInterimUser: TranscriptSegment | null = null;
    private liveTranscriptHasEdits = false;
    private recapLLM: RecapLLM | null = null;

    public setRecapLLM(recapLLM: RecapLLM | null): void {
        this.recapLLM = recapLLM;
    }

    public setMeetingMetadata(metadata: any): void {
        this.currentMeetingMetadata = metadata;
    }

    public getMeetingMetadata() {
        return this.currentMeetingMetadata;
    }

    public clearMeetingMetadata(): void {
        this.currentMeetingMetadata = null;
    }

    public addTranscript(segment: TranscriptSegment): { role: 'interviewer' | 'user' | 'assistant' } | null {
        if (!segment.final && segment.speaker !== 'interviewer' && segment.speaker !== 'user') return null;
        if (segment.speaker === 'interviewer' || segment.speaker === 'user') return this.handleTranscript(segment);

        const role = this.mapSpeakerToRole(segment.speaker);
        const text = segment.text.trim();
        if (!text) return null;

        const normalizedSegment: TranscriptSegment = {
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
                if (refinedText === lastItem.text) return null;
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

        const isInternalPrompt =
            text.startsWith("You are a real-time interview assistant") ||
            text.startsWith("You are a helper") ||
            text.startsWith("你是一名实时面试助手") ||
            text.startsWith("你是一名辅助助手") ||
            text.startsWith("CONTEXT:");
        if (!isInternalPrompt) {
            this.fullTranscript.push(normalizedSegment);
            void this.compactTranscriptIfNeeded().catch(e => console.warn('[SessionTracker] compactTranscript error (non-fatal):', e));
        }

        return { role };
    }

    public addAssistantMessage(text: string): void {
        if (!text) return;
        const cleanText = text.trim();
        if (cleanText.length < 10) return;
        if (
            cleanText.includes("I'm not sure") ||
            cleanText.includes("I can't answer") ||
            cleanText.includes("我不太确定") ||
            cleanText.includes("我没法回答") ||
            cleanText.includes("抱歉，这部分信息不能提供")
        ) return;

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

    public handleTranscript(segment: TranscriptSegment): { role: 'interviewer' | 'user' | 'assistant' } | null {
        if (segment.speaker === 'interviewer' || segment.speaker === 'user') return this.handleLiveSpeakerTranscript(segment);
        return this.addTranscript(segment);
    }

    public commitLiveTranscriptSegment(id?: string, speaker: 'interviewer' | 'user' = 'interviewer'): LiveTranscriptSegment | null {
        const target = id ? this.liveTranscriptSegments.find(segment => segment.id === id) : this.getActiveLiveSegment(speaker);
        if (!target || target.status === 'final') return null;
        return this.finalizeLiveTranscriptSegment(target.id, Date.now());
    }

    public maybeCommitLiveTranscriptSegment(id?: string, speaker: 'interviewer' | 'user' = 'interviewer'): LiveTranscriptSegment | null {
        const target = id ? this.liveTranscriptSegments.find(segment => segment.id === id) : this.getActiveLiveSegment(speaker);
        if (!target || target.status === 'final') return null;

        if (!this.shouldFinalizeLiveTranscriptSegment(target)) {
            this.setLastInterimSegment(target.speaker, this.toTranscriptSegment(target, false));
            return null;
        }

        return this.finalizeLiveTranscriptSegment(target.id, Date.now());
    }

    public editLiveTranscriptSegment(id: string, nextText: string): LiveTranscriptSegment | null {
        const trimmed = nextText.trim();
        if (!trimmed) return null;
        const target = this.liveTranscriptSegments.find(segment => segment.id === id);
        if (!target) return null;

        target.text = trimmed;
        target.updatedAt = Date.now();
        target.edited = true;
        this.liveTranscriptHasEdits = true;

        if (target.status === 'active') {
            this.setLastInterimSegment(target.speaker, this.toTranscriptSegment(target, false));
        } else {
            this.syncCommittedInterviewerSegment(target);
        }

        return this.cloneLiveSegment(target);
    }

    public mergeLiveTranscriptSegmentWithPrevious(id: string): { state: LiveTranscriptSegment[]; mergedIntoId: string; cursorPosition: number } | null {
        const currentIndex = this.liveTranscriptSegments.findIndex(segment => segment.id === id);
        if (currentIndex <= 0) return null;

        const current = this.liveTranscriptSegments[currentIndex];
        const previousIndex = this.findPreviousSameSpeakerSegmentIndex(currentIndex, current.speaker);
        if (previousIndex < 0) return null;

        const previous = this.liveTranscriptSegments[previousIndex];
        const mergedText = this.mergeSegmentTexts(previous.text, current.text);
        if (!mergedText.trim()) return null;

        const boundaryOffset = this.computeMergeBoundaryOffset(previous.text, current.text, mergedText);
        const nextUpdatedAt = Math.max(previous.updatedAt, current.updatedAt);
        const nextTimestamp = Math.min(previous.timestamp, current.timestamp);
        const nextStatus = current.status === 'active' || previous.status === 'active' ? 'active' : 'final';
        const nextEdited = true;
        const nextLastProviderText = mergedText;
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

        this.setLastInterimSegment(
            previous.speaker,
            nextStatus === 'active' ? this.toTranscriptSegment(previous, false) : null
        );

        if (nextStatus === 'final') {
            this.syncCommittedInterviewerSegment(previous);
        }

        return {
            state: this.getLiveTranscriptState(),
            mergedIntoId: previous.id,
            cursorPosition: boundaryOffset,
        };
    }

    public getLiveTranscriptState(): LiveTranscriptSegment[] {
        return this.liveTranscriptSegments.map(segment => this.cloneLiveSegment(segment));
    }

    public clearLiveTranscriptSegments(speaker: 'interviewer' | 'user'): void {
        this.liveTranscriptSegments = this.liveTranscriptSegments.filter(segment => segment.speaker !== speaker);
        this.setLastInterimSegment(speaker, null);
    }

    public hasEditedLiveTranscript(): boolean {
        return this.liveTranscriptHasEdits;
    }

    public getTranscriptForRag(includeActiveInterviewer: boolean = true): Array<{ speaker: string; text: string; timestamp: number }> {
        const segments = this.fullTranscript.map(segment => ({ speaker: segment.speaker, text: segment.text, timestamp: segment.timestamp }));
        if (includeActiveInterviewer) {
            const interimSegments = this.getInterimTranscriptSegments();
            for (const interim of interimSegments) {
                const isDuplicate = segments.some((item) =>
                    item.speaker === interim.speaker &&
                    Math.abs(item.timestamp - interim.timestamp) < 500 &&
                    this.normalizeTranscriptForComparison(item.text) === this.normalizeTranscriptForComparison(interim.text)
                );
                if (!isDuplicate) {
                    segments.push({
                        speaker: interim.speaker,
                        text: interim.text.trim(),
                        timestamp: interim.timestamp,
                    });
                }
            }
        }
        return segments.sort((left, right) => left.timestamp - right.timestamp);
    }

    public getContext(lastSeconds: number = 120): ContextItem[] {
        const cutoff = Date.now() - (lastSeconds * 1000);
        const items = this.contextItems.filter(item => item.timestamp >= cutoff);
        const interimSegments = this.getInterimTranscriptSegments();

        for (const interim of interimSegments) {
            if (!interim.text.trim() || interim.timestamp < cutoff) continue;
            const role = this.mapSpeakerToRole(interim.speaker);
            const duplicate = items.some(item =>
                item.role === role &&
                Math.abs(item.timestamp - interim.timestamp) < 500 &&
                this.normalizeTranscriptForComparison(item.text) === this.normalizeTranscriptForComparison(interim.text)
            );
            if (!duplicate) {
                items.push({ id: interim.id, role, text: interim.text, timestamp: interim.timestamp });
            }
        }

        return items.sort((left, right) => left.timestamp - right.timestamp);
    }

    public getLastAssistantMessage(): string | null {
        return this.lastAssistantMessage;
    }

    public getAssistantResponseHistory(): AssistantResponse[] {
        return this.assistantResponseHistory;
    }

    public getLastInterimInterviewer(): TranscriptSegment | null {
        return this.lastInterimInterviewer;
    }

    public getFormattedContext(lastSeconds: number = 120): string {
        return this.getContext(lastSeconds).map(item => {
            const label = item.role === 'interviewer' ? 'INTERVIEWER' : item.role === 'user' ? 'ME' : 'ASSISTANT (PREVIOUS SUGGESTION)';
            return `[${label}]: ${item.text}`;
        }).join('\n');
    }

    public getLastInterviewerTurn(): string | null {
        if (this.lastInterimInterviewer?.text.trim()) return this.lastInterimInterviewer.text;
        for (let i = this.contextItems.length - 1; i >= 0; i -= 1) {
            if (this.contextItems[i].role === 'interviewer') return this.contextItems[i].text;
        }
        return null;
    }

    public getFullSessionContext(): string {
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

    public getFullTranscript(): TranscriptSegment[] {
        return this.fullTranscript.map(segment => ({ ...segment }));
    }

    public getFullUsage(): any[] {
        return this.fullUsage;
    }

    public getSessionStartTime(): number {
        return this.sessionStartTime;
    }

    public capUsageArray(): void {
        if (this.fullUsage.length > 500) {
            this.fullUsage = this.fullUsage.slice(-500);
        }
    }

    public logUsage(type: string, question: string, answer: string): void {
        this.fullUsage.push({ type, timestamp: Date.now(), question, answer });
    }

    public pushUsage(entry: any): void {
        this.fullUsage.push(entry);
        this.capUsageArray();
    }

    public flushInterimTranscript(): void {
        for (const speaker of ['interviewer', 'user'] as const) {
            const interim = this.getLastInterimSegment(speaker);
            if (interim?.id) {
                this.commitLiveTranscriptSegment(interim.id, speaker);
            }
        }
    }

    public reset(): void {
        this.contextItems = [];
        this.fullTranscript = [];
        this.fullUsage = [];
        this.transcriptEpochSummaries = [];
        this.sessionStartTime = Date.now();
        this.lastAssistantMessage = null;
        this.assistantResponseHistory = [];
        this.lastInterimInterviewer = null;
        this.lastInterimUser = null;
        this.liveTranscriptSegments = [];
        this.liveTranscriptHasEdits = false;
    }

    mapSpeakerToRole(speaker: string): 'interviewer' | 'user' | 'assistant' {
        if (speaker === 'user') return 'user';
        if (speaker === 'assistant') return 'assistant';
        return 'interviewer';
    }

    private createSegmentId(): string {
        return randomUUID();
    }

    private cloneLiveSegment(segment: LiveTranscriptSegment): LiveTranscriptSegment {
        return { ...segment };
    }

    private getLastInterimSegment(speaker: 'interviewer' | 'user'): TranscriptSegment | null {
        return speaker === 'interviewer' ? this.lastInterimInterviewer : this.lastInterimUser;
    }

    private setLastInterimSegment(speaker: 'interviewer' | 'user', segment: TranscriptSegment | null): void {
        if (speaker === 'interviewer') {
            this.lastInterimInterviewer = segment;
            return;
        }

        this.lastInterimUser = segment;
    }

    private getInterimTranscriptSegments(): TranscriptSegment[] {
        return (['interviewer', 'user'] as const)
            .map((speaker) => this.getLastInterimSegment(speaker))
            .filter((segment): segment is TranscriptSegment => Boolean(segment));
    }

    private handleLiveSpeakerTranscript(segment: TranscriptSegment): { role: 'interviewer' | 'user' } | null {
        const nextText = segment.text.trim();
        if (!nextText) return null;

        const timestamp = segment.timestamp || Date.now();
        const speaker = this.mapSpeakerToRole(segment.speaker);
        if (speaker !== 'interviewer' && speaker !== 'user') return null;

        const current = this.getActiveLiveSegment(speaker);
        const canonicalIncomingText = current
            ? nextText
            : this.stripCommittedPrefixFromIncoming(
                nextText,
                this.buildTranscriptPrefixCandidates(speaker)
            );

        if (!current) {
            if (!canonicalIncomingText) {
                return null;
            }

            if (this.hasRecentSpeakerDuplicate(speaker, canonicalIncomingText, timestamp)) {
                return null;
            }
        }

        const effectiveIncomingText = canonicalIncomingText || nextText;

        if (!current) {
            const liveSegment: LiveTranscriptSegment = {
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

    private mergeProviderTranscript(previousProviderText: string, nextProviderText: string, currentVisibleText: string): string {
        if (!previousProviderText) return nextProviderText.trim();
        if (!nextProviderText) return currentVisibleText.trim();

        const overlapTailFromVisible = this.extractTailAfterTranscriptOverlap(currentVisibleText, nextProviderText);
        if (overlapTailFromVisible !== null) {
            return overlapTailFromVisible
                ? this.mergeSegmentTexts(currentVisibleText, overlapTailFromVisible)
                : currentVisibleText.trim();
        }

        const overlapTailFromProvider = this.extractTailAfterTranscriptOverlap(previousProviderText, nextProviderText);
        if (overlapTailFromProvider !== null) {
            return overlapTailFromProvider
                ? this.mergeSegmentTexts(currentVisibleText, overlapTailFromProvider)
                : currentVisibleText.trim();
        }

        const previousVisible = currentVisibleText.trim();
        const providerAndVisibleDiffer =
            this.normalizeTranscriptForComparison(previousProviderText) !== this.normalizeTranscriptForComparison(previousVisible);

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

    private appendTailWithoutOverwritingEdits(current: LiveTranscriptSegment, nextProviderText: string): string {
        const previousProviderText = current.lastProviderText || '';
        const currentVisibleText = current.text.trim();
        if (!previousProviderText) return currentVisibleText;

        const overlapTailFromVisible = this.extractTailAfterTranscriptOverlap(currentVisibleText, nextProviderText);
        if (overlapTailFromVisible !== null) {
            return overlapTailFromVisible
                ? this.mergeSegmentTexts(currentVisibleText, overlapTailFromVisible)
                : currentVisibleText;
        }

        const overlapTailFromProvider = this.extractTailAfterTranscriptOverlap(previousProviderText, nextProviderText);
        if (overlapTailFromProvider !== null) {
            return overlapTailFromProvider
                ? this.mergeSegmentTexts(currentVisibleText, overlapTailFromProvider)
                : currentVisibleText;
        }

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

    private buildNormalizedTranscriptMap(text: string): { normalized: string; offsets: number[] } {
        const normalizedChars: string[] = [];
        const offsets: number[] = [];

        for (let index = 0; index < text.length; index += 1) {
            const char = text[index];
            if (SessionTracker.TRANSCRIPT_SEPARATOR_REGEX.test(char)) continue;
            normalizedChars.push(char);
            offsets.push(index + 1);
        }

        return {
            normalized: normalizedChars.join(''),
            offsets,
        };
    }

    private extractTailAfterTranscriptOverlap(baseText: string, incomingText: string): string | null {
        const base = baseText.trim();
        const incoming = incomingText.trim();
        if (!base || !incoming) return null;

        if (incoming.startsWith(base)) {
            return incoming.slice(base.length).trim();
        }

        const directIndex = incoming.indexOf(base);
        if (directIndex >= 0) {
            return incoming.slice(directIndex + base.length).trim();
        }

        const baseMap = this.buildNormalizedTranscriptMap(base);
        const incomingMap = this.buildNormalizedTranscriptMap(incoming);
        if (!baseMap.normalized || !incomingMap.normalized) return null;

        if (baseMap.normalized.includes(incomingMap.normalized)) {
            return '';
        }

        const minimumOverlap = Math.min(8, baseMap.normalized.length, incomingMap.normalized.length);
        if (minimumOverlap <= 0) return null;

        for (let overlapLength = Math.min(baseMap.normalized.length, incomingMap.normalized.length); overlapLength >= minimumOverlap; overlapLength -= 1) {
            const candidateSuffix = baseMap.normalized.slice(-overlapLength);
            const matchIndex = incomingMap.normalized.indexOf(candidateSuffix);
            if (matchIndex < 0) continue;

            const tailCharIndex = matchIndex + overlapLength - 1;
            const tailCutOffset = incomingMap.offsets[tailCharIndex];
            return incoming.slice(tailCutOffset).trim();
        }

        return null;
    }

    private hasRecentSpeakerDuplicate(
        speaker: 'interviewer' | 'user',
        nextText: string,
        timestamp: number
    ): boolean {
        if (!nextText.trim()) return false;

        for (const segment of this.getRecentLiveSegments(speaker)) {
            if (!segment.text.trim()) continue;
            if (Math.abs(timestamp - segment.updatedAt) > SessionTracker.RECENT_DUPLICATE_INTERVIEWER_WINDOW_MS) {
                continue;
            }

            if (this.normalizeTranscriptForComparison(segment.text) === this.normalizeTranscriptForComparison(nextText)) {
                return true;
            }
        }

        return false;
    }

    private getRecentLiveSegments(speaker: 'interviewer' | 'user', limit: number = 8): LiveTranscriptSegment[] {
        const items: LiveTranscriptSegment[] = [];

        for (let index = this.liveTranscriptSegments.length - 1; index >= 0 && items.length < limit; index -= 1) {
            if (this.liveTranscriptSegments[index].speaker === speaker) {
                items.push(this.liveTranscriptSegments[index]);
            }
        }

        return items;
    }

    private buildTranscriptPrefixCandidates(speaker: 'interviewer' | 'user'): Array<string | undefined> {
        const recentSegments = this.getRecentLiveSegments(speaker);
        const candidates: Array<string | undefined> = [
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

    private stripCommittedPrefixFromIncoming(nextText: string, previousTexts: Array<string | undefined>): string {
        const incoming = nextText.trim();
        if (!incoming) return incoming;

        let bestRemainder = incoming;
        let bestRemovedNormalizedLength = 0;

        for (const previousText of previousTexts) {
            const candidate = previousText?.trim();
            if (!candidate) continue;

            const remainder = this.stripTranscriptPrefixOnce(incoming, candidate);
            const removedNormalizedLength =
                this.normalizeTranscriptForComparison(incoming).length -
                this.normalizeTranscriptForComparison(remainder).length;

            if (removedNormalizedLength > bestRemovedNormalizedLength) {
                bestRemainder = remainder;
                bestRemovedNormalizedLength = removedNormalizedLength;
            }
        }

        return bestRemainder;
    }

    private stripTranscriptPrefixOnce(incomingText: string, prefixText: string): string {
        const incoming = incomingText.trim();
        const prefix = prefixText.trim();
        if (!incoming || !prefix) return incoming;
        if (incoming === prefix) return '';

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
            if (!SessionTracker.TRANSCRIPT_SEPARATOR_REGEX.test(char)) {
                matchedNormalizedChars += 1;
            }
            cutIndex = index + 1;
            if (matchedNormalizedChars >= normalizedPrefix.length) {
                break;
            }
        }

        return incoming.slice(cutIndex).trim();
    }

    private finalizeLiveTranscriptSegment(id: string, timestamp: number): LiveTranscriptSegment | null {
        const target = this.liveTranscriptSegments.find(segment => segment.id === id);
        if (!target) return null;

        target.status = 'final';
        target.updatedAt = Math.max(timestamp, target.updatedAt);
        this.setLastInterimSegment(target.speaker, null);
        this.syncCommittedInterviewerSegment(target);
        return this.cloneLiveSegment(target);
    }

    private applyLiveSegmentState(
        current: LiveTranscriptSegment,
        options: {
            isIncomingFinal: boolean;
            timestamp: number;
            confidence?: number;
        }
    ): void {
        if (current.edited) {
            current.text = current.text.trim();
            current.updatedAt = Math.max(options.timestamp, current.updatedAt);
            current.confidence = options.confidence ?? current.confidence;
            if (options.isIncomingFinal && this.shouldFinalizeLiveTranscriptSegment(current)) {
                this.finalizeLiveTranscriptSegment(current.id, options.timestamp);
                return;
            }
            this.setLastInterimSegment(current.speaker, this.toTranscriptSegment(current, false));
            return;
        }

        const chunks = this.splitLiveTranscriptIntoChunks(current.text);
        if (chunks.length === 0) return;

        if (chunks.length === 1) {
            current.text = chunks[0];
            current.updatedAt = Math.max(options.timestamp, current.updatedAt);
            current.confidence = options.confidence ?? current.confidence;
            if (options.isIncomingFinal && this.shouldFinalizeLiveTranscriptSegment(current)) {
                this.finalizeLiveTranscriptSegment(current.id, options.timestamp);
                return;
            }
            this.setLastInterimSegment(current.speaker, this.toTranscriptSegment(current, false));
            return;
        }

        current.text = chunks[0];
        current.updatedAt = Math.max(options.timestamp, current.updatedAt);
        current.confidence = options.confidence ?? current.confidence;
        this.finalizeLiveTranscriptSegment(current.id, options.timestamp);

        for (let index = 1; index < chunks.length; index += 1) {
            const isLast = index === chunks.length - 1;
            const nextText = chunks[index].trim();
            if (!nextText) continue;
            const nextSegment: LiveTranscriptSegment = {
                id: this.createSegmentId(),
                speaker: current.speaker,
                text: nextText,
                timestamp: options.timestamp,
                updatedAt: options.timestamp,
                status: isLast ? 'active' : 'final',
                edited: current.edited,
                lastProviderText: isLast ? current.lastProviderText : nextText,
                lastProviderTimestamp: current.lastProviderTimestamp,
                confidence: options.confidence ?? current.confidence,
            };

            if (!isLast && this.hasRecentSpeakerDuplicate(current.speaker, nextSegment.text, options.timestamp)) {
                continue;
            }

            this.liveTranscriptSegments.push(nextSegment);

            if (nextSegment.status === 'final') {
                this.syncCommittedInterviewerSegment(nextSegment);
                this.setLastInterimSegment(nextSegment.speaker, null);
            } else {
                this.setLastInterimSegment(nextSegment.speaker, this.toTranscriptSegment(nextSegment, false));
            }
        }
    }

    private shouldFinalizeLiveTranscriptSegment(segment: LiveTranscriptSegment): boolean {
        return (
            this.normalizeTranscriptForComparison(segment.text).length >= SessionTracker.SOFT_INTERVIEWER_SEGMENT_CHARS &&
            SessionTracker.SENTENCE_BOUNDARY_REGEX.test(segment.text.trim())
        );
    }

    private splitLiveTranscriptIntoChunks(text: string): string[] {
        const trimmed = text.trim();
        if (!trimmed) return [];

        const chunks: string[] = [];
        let currentChunk = '';

        for (const char of trimmed) {
            currentChunk += char;

            if (
                SessionTracker.SENTENCE_BOUNDARY_REGEX.test(char) &&
                currentChunk.trim().length >= SessionTracker.SOFT_INTERVIEWER_SEGMENT_CHARS
            ) {
                chunks.push(currentChunk.trim());
                currentChunk = '';
            }
        }

        if (currentChunk.trim()) {
            chunks.push(currentChunk.trim());
        }

        return chunks;
    }

    private findPreviousSameSpeakerSegmentIndex(index: number, speaker: 'interviewer' | 'user'): number {
        for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
            if (this.liveTranscriptSegments[cursor].speaker === speaker) {
                return cursor;
            }
        }

        return -1;
    }

    private mergeSegmentTexts(previousText: string, currentText: string): string {
        const previous = previousText.trimEnd();
        const current = currentText.trimStart();
        if (!previous) return current;
        if (!current) return previous;

        const lastChar = previous[previous.length - 1];
        const firstChar = current[0];
        const hasCjkBoundary = /[\u3400-\u9fff]/.test(lastChar) || /[\u3400-\u9fff]/.test(firstChar);
        const needsSpace =
            !hasCjkBoundary &&
            !/\s$/.test(previous) &&
            !/^\s/.test(current) &&
            !/[.,!?;:)\]]/.test(firstChar);

        return `${previous}${needsSpace ? ' ' : ''}${current}`.trim();
    }

    private computeMergeBoundaryOffset(previousText: string, currentText: string, mergedText: string): number {
        const previous = previousText.trimEnd();
        const current = currentText.trimStart();
        if (!previous) return 0;
        if (!current) return previous.length;

        const lastChar = previous[previous.length - 1];
        const firstChar = current[0];
        const hasCjkBoundary = /[\u3400-\u9fff]/.test(lastChar) || /[\u3400-\u9fff]/.test(firstChar);
        const needsSpace =
            !hasCjkBoundary &&
            !/\s$/.test(previous) &&
            !/^\s/.test(current) &&
            !/[.,!?;:)\]]/.test(firstChar);

        const boundary = previous.length + (needsSpace ? 1 : 0);
        return Math.min(boundary, mergedText.length);
    }

    private removeCommittedSegmentById(id: string): void {
        const contextIndex = this.contextItems.findIndex(item => item.id === id);
        if (contextIndex >= 0) {
            this.contextItems.splice(contextIndex, 1);
        }

        const transcriptIndex = this.fullTranscript.findIndex(item => item.id === id);
        if (transcriptIndex >= 0) {
            this.fullTranscript.splice(transcriptIndex, 1);
        }
    }

    private syncCommittedInterviewerSegment(segment: LiveTranscriptSegment): void {
        const text = segment.text.trim();
        if (!text) return;
        const role = this.mapSpeakerToRole(segment.speaker);
        const normalizedText = this.normalizeTranscriptForComparison(text);
        if (!normalizedText) return;

        const liveSegmentIndex = this.liveTranscriptSegments.findIndex(item => item.id === segment.id);
        const redundantLiveSegmentIds: string[] = [];
        let coveredByExistingLiveSegment = false;

        for (let index = this.liveTranscriptSegments.length - 1; index >= 0; index -= 1) {
            const item = this.liveTranscriptSegments[index];
            if (item.id === segment.id || item.speaker !== segment.speaker || item.status !== 'final') continue;
            if (Math.abs(item.updatedAt - segment.updatedAt) > SessionTracker.RECENT_DUPLICATE_INTERVIEWER_WINDOW_MS) continue;

            const itemNormalized = this.normalizeTranscriptForComparison(item.text);
            if (!itemNormalized) continue;

            if (itemNormalized === normalizedText) {
                coveredByExistingLiveSegment = true;
                break;
            }

            if (itemNormalized.includes(normalizedText) && itemNormalized.length >= normalizedText.length) {
                coveredByExistingLiveSegment = true;
                break;
            }

            if (normalizedText.includes(itemNormalized) && normalizedText.length > itemNormalized.length) {
                redundantLiveSegmentIds.push(item.id);
            }
        }

        if (coveredByExistingLiveSegment) {
            if (liveSegmentIndex >= 0) {
                this.liveTranscriptSegments.splice(liveSegmentIndex, 1);
            }
            this.removeCommittedSegmentById(segment.id);
            return;
        }

        redundantLiveSegmentIds.forEach((id) => this.removeCommittedSegmentById(id));
        if (redundantLiveSegmentIds.length > 0) {
            this.liveTranscriptSegments = this.liveTranscriptSegments.filter(item => !redundantLiveSegmentIds.includes(item.id));
        }

        const contextItem: ContextItem = {
            id: segment.id,
            role,
            text,
            timestamp: segment.updatedAt,
        };
        const transcriptSegment: TranscriptSegment = {
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
            if (item.id === segment.id || item.role !== role) continue;
            if (Math.abs(item.timestamp - segment.updatedAt) > SessionTracker.RECENT_DUPLICATE_INTERVIEWER_WINDOW_MS) continue;
            if (this.normalizeTranscriptForComparison(item.text) === this.normalizeTranscriptForComparison(text)) {
                recentContextDuplicateIndex = index;
                break;
            }
        }

        let recentTranscriptDuplicateIndex = -1;
        for (let index = this.fullTranscript.length - 1; index >= 0; index -= 1) {
            const item = this.fullTranscript[index];
            if (item.id === segment.id || item.speaker !== segment.speaker) continue;
            if (Math.abs(item.timestamp - segment.updatedAt) > SessionTracker.RECENT_DUPLICATE_INTERVIEWER_WINDOW_MS) continue;
            if (this.normalizeTranscriptForComparison(item.text) === this.normalizeTranscriptForComparison(text)) {
                recentTranscriptDuplicateIndex = index;
                break;
            }
        }

        if (contextIndex >= 0) this.contextItems[contextIndex] = contextItem;
        else if (recentContextDuplicateIndex >= 0) this.contextItems[recentContextDuplicateIndex] = contextItem;
        else this.contextItems.push(contextItem);

        if (transcriptIndex >= 0) this.fullTranscript[transcriptIndex] = transcriptSegment;
        else if (recentTranscriptDuplicateIndex >= 0) this.fullTranscript[recentTranscriptDuplicateIndex] = transcriptSegment;
        else {
            this.fullTranscript.push(transcriptSegment);
            void this.compactTranscriptIfNeeded().catch(e => console.warn('[SessionTracker] compactTranscript error (non-fatal):', e));
        }

        this.contextItems.sort((left, right) => left.timestamp - right.timestamp);
        this.fullTranscript.sort((left, right) => left.timestamp - right.timestamp);
        this.evictOldEntries();
    }

    private toTranscriptSegment(segment: LiveTranscriptSegment, final: boolean): TranscriptSegment {
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

    private getActiveLiveSegment(speaker: 'interviewer' | 'user'): LiveTranscriptSegment | undefined {
        for (let index = this.liveTranscriptSegments.length - 1; index >= 0; index -= 1) {
            if (this.liveTranscriptSegments[index].speaker === speaker && this.liveTranscriptSegments[index].status === 'active') {
                return this.liveTranscriptSegments[index];
            }
        }
        return undefined;
    }

    private normalizeTranscriptForComparison(text: string): string {
        return text.trim().replace(/\s+/g, '').replace(SessionTracker.TRANSCRIPT_PUNCTUATION_GLOBAL_REGEX, '');
    }

    private computeEditDistance(left: string, right: string): number {
        const rows = left.length + 1;
        const cols = right.length + 1;
        const matrix = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

        for (let row = 0; row < rows; row += 1) matrix[row][0] = row;
        for (let col = 0; col < cols; col += 1) matrix[0][col] = col;

        for (let row = 1; row < rows; row += 1) {
            for (let col = 1; col < cols; col += 1) {
                const substitutionCost = left[row - 1] === right[col - 1] ? 0 : 1;
                matrix[row][col] = Math.min(
                    matrix[row - 1][col] + 1,
                    matrix[row][col - 1] + 1,
                    matrix[row - 1][col - 1] + substitutionCost
                );
            }
        }

        return matrix[left.length][right.length];
    }

    private computeLongestCommonSubsequenceLength(left: string, right: string): number {
        const rows = left.length + 1;
        const cols = right.length + 1;
        const matrix = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

        for (let row = 1; row < rows; row += 1) {
            for (let col = 1; col < cols; col += 1) {
                if (left[row - 1] === right[col - 1]) matrix[row][col] = matrix[row - 1][col - 1] + 1;
                else matrix[row][col] = Math.max(matrix[row - 1][col], matrix[row][col - 1]);
            }
        }

        return matrix[left.length][right.length];
    }

    private calculateTranscriptSimilarity(previousText: string, nextText: string): number {
        const previous = this.normalizeTranscriptForComparison(previousText);
        const next = this.normalizeTranscriptForComparison(nextText);
        if (!previous || !next) return 0;
        if (previous === next) return 1;
        return 1 - (this.computeEditDistance(previous, next) / Math.max(previous.length, next.length));
    }

    private calculateTranscriptOverlap(previousText: string, nextText: string): number {
        const previous = this.normalizeTranscriptForComparison(previousText);
        const next = this.normalizeTranscriptForComparison(nextText);
        if (!previous || !next) return 0;
        return this.computeLongestCommonSubsequenceLength(previous, next) / Math.min(previous.length, next.length);
    }

    private isTranscriptRefinement(previousText: string, nextText: string): boolean {
        const previous = this.normalizeTranscriptForComparison(previousText);
        const next = this.normalizeTranscriptForComparison(nextText);
        if (!previous || !next) return false;
        if (previous === next) return true;
        if (next.startsWith(previous) || previous.startsWith(next)) return true;
        if (Math.min(previous.length, next.length) < 16) return false;
        return this.calculateTranscriptSimilarity(previous, next) >= 0.72 || this.calculateTranscriptOverlap(previous, next) >= 0.78;
    }

    private chooseMoreCompleteTranscript(previousText: string, nextText: string): string {
        const previous = previousText.trim();
        const next = nextText.trim();
        const previousNormalized = this.normalizeTranscriptForComparison(previous);
        const nextNormalized = this.normalizeTranscriptForComparison(next);
        if (nextNormalized.length > previousNormalized.length) return next;
        if (nextNormalized === previousNormalized && next.length >= previous.length) return next;
        return previous;
    }

    private evictOldEntries(): void {
        const cutoff = Date.now() - (this.contextWindowDuration * 1000);
        this.contextItems = this.contextItems.filter(item => item.timestamp >= cutoff);
        if (this.contextItems.length > this.maxContextItems) {
            this.contextItems = this.contextItems.slice(-this.maxContextItems);
        }
    }

    private async compactTranscriptIfNeeded(): Promise<void> {
        if (this.fullTranscript.length <= 1800 || this.isCompacting) return;
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
                    if (recap && recap.trim().length > 0) summary = recap.trim();
                } catch {
                    // Fall back to the lightweight summary below.
                }
            }

            this.transcriptEpochSummaries.push(summary);
            if (this.transcriptEpochSummaries.length > SessionTracker.MAX_EPOCH_SUMMARIES) {
                this.transcriptEpochSummaries = this.transcriptEpochSummaries.slice(-SessionTracker.MAX_EPOCH_SUMMARIES);
            }
            this.fullTranscript = this.fullTranscript.slice(summarizeCount);
        } finally {
            this.isCompacting = false;
        }
    }

    private buildEpochFallbackSummary(entries: TranscriptSegment[]): string {
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
