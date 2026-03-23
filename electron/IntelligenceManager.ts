// IntelligenceManager.ts
// Thin facade that delegates to focused sub-modules.
// Maintains full backward compatibility — all existing callers continue to work unchanged.
//
// Sub-modules:
//   SessionTracker     — state, transcript arrays, context management, epoch compaction
//   IntelligenceEngine — LLM mode routing (6 modes), event emission
//   MeetingPersistence — meeting stop/save/recovery

import { EventEmitter } from 'events';
import { LLMHelper } from './LLMHelper';
import { SessionTracker, LiveTranscriptSegment } from './SessionTracker';
import { IntelligenceEngine } from './IntelligenceEngine';
import { MeetingPersistence } from './MeetingPersistence';

// Re-export types for backward compatibility
export type { TranscriptSegment, SuggestionTrigger, ContextItem, LiveTranscriptSegment } from './SessionTracker';
export type { IntelligenceMode, IntelligenceModeEvents } from './IntelligenceEngine';

export const GEMINI_FLASH_MODEL = "gemini-3.1-flash-lite-preview";

/**
 * IntelligenceManager - Facade for the intelligence layer.
 * 
 * Delegates to:
 * - SessionTracker:     context, transcripts, epoch summaries
 * - IntelligenceEngine: LLM modes (assist, whatToSay, followUp, recap, manual, followUpQuestions)
 * - MeetingPersistence: meeting stop/save/recovery
 */
export class IntelligenceManager extends EventEmitter {
    private session: SessionTracker;
    private engine: IntelligenceEngine;
    private persistence: MeetingPersistence;

    constructor(llmHelper: LLMHelper) {
        super();
        this.session = new SessionTracker();
        this.engine = new IntelligenceEngine(llmHelper, this.session);
        this.persistence = new MeetingPersistence(this.session, llmHelper);

        // Forward all engine events through the facade
        this.forwardEngineEvents();
    }

    /**
     * Forward all events from IntelligenceEngine through this facade
     * so existing listeners on IntelligenceManager continue to work.
     */
    private forwardEngineEvents(): void {
        const events = [
            'assist_update', 'suggested_answer', 'suggested_answer_token',
            'refined_answer', 'refined_answer_token',
            'recap', 'recap_token',
            'follow_up_questions_update', 'follow_up_questions_token',
            'manual_answer_started', 'manual_answer_result',
            'mode_changed', 'error'
        ];

        for (const event of events) {
            this.engine.on(event, (...args: any[]) => {
                this.emit(event, ...args);
            });
        }
    }

    // ============================================
    // LLM Initialization (delegates to engine)
    // ============================================

    initializeLLMs(): void {
        this.engine.initializeLLMs();
    }

    reinitializeLLMs(): void {
        this.engine.reinitializeLLMs();
    }

    // ============================================
    // Context Management (delegates to session)
    // ============================================

    setMeetingMetadata(metadata: any): void {
        this.session.setMeetingMetadata(metadata);
    }

    private emitLiveTranscriptUpdated(): void {
        this.emit('live_transcript_updated', this.session.getLiveTranscriptState());
    }

    addTranscript(segment: import('./SessionTracker').TranscriptSegment, skipRefinementCheck: boolean = false): void {
        if (skipRefinementCheck) {
            // Direct add without refinement detection
            this.session.addTranscript(segment);
        } else {
            // Let the engine handle transcript + refinement detection
            this.engine.handleTranscript(segment, false);
        }
        this.emitLiveTranscriptUpdated();
    }

    addAssistantMessage(text: string): void {
        this.session.addAssistantMessage(text);
    }

    getContext(lastSeconds: number = 120) {
        return this.session.getContext(lastSeconds);
    }

    getLastAssistantMessage(): string | null {
        return this.session.getLastAssistantMessage();
    }

    getAssistantResponseHistory() {
        return this.session.getAssistantResponseHistory();
    }

    getFormattedContext(lastSeconds: number = 120): string {
        return this.session.getFormattedContext(lastSeconds);
    }

    getLastInterviewerTurn(): string | null {
        return this.session.getLastInterviewerTurn();
    }

    logUsage(type: string, question: string, answer: string): void {
        this.session.logUsage(type, question, answer);
    }

    getLiveTranscriptState(): LiveTranscriptSegment[] {
        return this.session.getLiveTranscriptState();
    }

    editLiveTranscriptSegment(id: string, text: string): LiveTranscriptSegment | null {
        const updated = this.session.editLiveTranscriptSegment(id, text);
        if (updated) this.emitLiveTranscriptUpdated();
        return updated;
    }

    mergeLiveTranscriptSegmentWithPrevious(id: string): { state: LiveTranscriptSegment[]; mergedIntoId: string; cursorPosition: number } | null {
        const result = this.session.mergeLiveTranscriptSegmentWithPrevious(id);
        if (result) this.emitLiveTranscriptUpdated();
        return result;
    }

    commitLiveTranscriptSegment(id?: string, speaker: 'interviewer' | 'user' = 'interviewer'): LiveTranscriptSegment | null {
        const committed = this.session.commitLiveTranscriptSegment(id, speaker);
        if (committed) this.emitLiveTranscriptUpdated();
        return committed;
    }

    maybeCommitLiveTranscriptSegment(id?: string, speaker: 'interviewer' | 'user' = 'interviewer'): LiveTranscriptSegment | null {
        const committed = this.session.maybeCommitLiveTranscriptSegment(id, speaker);
        this.emitLiveTranscriptUpdated();
        return committed;
    }

    hasEditedLiveTranscript(): boolean {
        return this.session.hasEditedLiveTranscript();
    }

    getTranscriptForRag(includeActiveInterviewer: boolean = true): Array<{ speaker: string; text: string; timestamp: number }> {
        return this.session.getTranscriptForRag(includeActiveInterviewer);
    }

    // ============================================
    // Transcript Handling (delegates to engine)
    // ============================================

    handleTranscript(segment: import('./SessionTracker').TranscriptSegment): void {
        this.engine.handleTranscript(segment);
        this.emitLiveTranscriptUpdated();
    }

    async handleSuggestionTrigger(trigger: import('./SessionTracker').SuggestionTrigger): Promise<void> {
        return this.engine.handleSuggestionTrigger(trigger);
    }

    // ============================================
    // Mode Executors (delegates to engine)
    // ============================================

    async runAssistMode(): Promise<string | null> {
        return this.engine.runAssistMode();
    }

    async runWhatShouldISay(question?: string, confidence?: number, imagePaths?: string[], requestId?: string): Promise<string | null> {
        return this.engine.runWhatShouldISay(question, confidence, imagePaths, requestId);
    }

    async runFollowUp(
        intent: string,
        userRequest?: string,
        source?: { lane?: 'primary' | 'strong'; answer?: string; requestId?: string }
    ): Promise<string | null> {
        return this.engine.runFollowUp(intent, userRequest, source);
    }

    async runRecap(): Promise<string | null> {
        return this.engine.runRecap();
    }

    async runFollowUpQuestions(): Promise<string | null> {
        return this.engine.runFollowUpQuestions();
    }

    async runManualAnswer(question: string): Promise<string | null> {
        return this.engine.runManualAnswer(question);
    }

    // ============================================
    // State Management
    // ============================================

    getActiveMode() {
        return this.engine.getActiveMode();
    }

    setMode(mode: import('./IntelligenceEngine').IntelligenceMode): void {
        // This was private in the original, but kept for compatibility
        (this.engine as any).setMode(mode);
    }

    // ============================================
    // Meeting Lifecycle (delegates to persistence)
    // ============================================

    async stopMeeting(): Promise<void> {
        await this.persistence.stopMeeting();
        this.emitLiveTranscriptUpdated();
    }

    async recoverUnprocessedMeetings(): Promise<void> {
        return this.persistence.recoverUnprocessedMeetings();
    }

    // ============================================
    // Reset (resets all sub-modules)
    // ============================================

    reset(): void {
        this.session.reset();
        this.engine.reset();
        this.emitLiveTranscriptUpdated();
    }
}
