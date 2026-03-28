"use strict";
// IntelligenceManager.ts
// Thin facade that delegates to focused sub-modules.
// Maintains full backward compatibility — all existing callers continue to work unchanged.
//
// Sub-modules:
//   SessionTracker     — state, transcript arrays, context management, epoch compaction
//   IntelligenceEngine — LLM mode routing (6 modes), event emission
//   MeetingPersistence — meeting stop/save/recovery
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntelligenceManager = exports.GEMINI_FLASH_MODEL = void 0;
const events_1 = require("events");
const SessionTracker_1 = require("./SessionTracker");
const IntelligenceEngine_1 = require("./IntelligenceEngine");
const MeetingPersistence_1 = require("./MeetingPersistence");
exports.GEMINI_FLASH_MODEL = "gemini-3.1-flash-lite-preview";
/**
 * IntelligenceManager - Facade for the intelligence layer.
 *
 * Delegates to:
 * - SessionTracker:     context, transcripts, epoch summaries
 * - IntelligenceEngine: LLM modes (assist, whatToSay, followUp, recap, manual, followUpQuestions)
 * - MeetingPersistence: meeting stop/save/recovery
 */
class IntelligenceManager extends events_1.EventEmitter {
    session;
    engine;
    persistence;
    constructor(llmHelper) {
        super();
        this.session = new SessionTracker_1.SessionTracker();
        this.engine = new IntelligenceEngine_1.IntelligenceEngine(llmHelper, this.session);
        this.persistence = new MeetingPersistence_1.MeetingPersistence(this.session, llmHelper);
        // Forward all engine events through the facade
        this.forwardEngineEvents();
    }
    /**
     * Forward all events from IntelligenceEngine through this facade
     * so existing listeners on IntelligenceManager continue to work.
     */
    forwardEngineEvents() {
        const events = [
            'assist_update', 'suggested_answer', 'suggested_answer_token',
            'refined_answer', 'refined_answer_token',
            'recap', 'recap_token',
            'follow_up_questions_update', 'follow_up_questions_token',
            'manual_answer_started', 'manual_answer_result',
            'mode_changed', 'error'
        ];
        for (const event of events) {
            this.engine.on(event, (...args) => {
                this.emit(event, ...args);
            });
        }
    }
    // ============================================
    // LLM Initialization (delegates to engine)
    // ============================================
    initializeLLMs() {
        this.engine.initializeLLMs();
    }
    reinitializeLLMs() {
        this.engine.reinitializeLLMs();
    }
    // ============================================
    // Context Management (delegates to session)
    // ============================================
    setMeetingMetadata(metadata) {
        this.session.setMeetingMetadata(metadata);
    }
    emitLiveTranscriptUpdated() {
        this.emit('live_transcript_updated', this.session.getLiveTranscriptState());
    }
    addTranscript(segment, skipRefinementCheck = false) {
        if (skipRefinementCheck) {
            // Direct add without refinement detection
            this.session.addTranscript(segment);
        }
        else {
            // Let the engine handle transcript + refinement detection
            this.engine.handleTranscript(segment, false);
        }
        this.emitLiveTranscriptUpdated();
    }
    addAssistantMessage(text) {
        this.session.addAssistantMessage(text);
    }
    getContext(lastSeconds = 120) {
        return this.session.getContext(lastSeconds);
    }
    getLastAssistantMessage() {
        return this.session.getLastAssistantMessage();
    }
    getFormattedContext(lastSeconds = 120) {
        return this.session.getFormattedContext(lastSeconds);
    }
    getLastInterviewerTurn() {
        return this.session.getLastInterviewerTurn();
    }
    logUsage(type, question, answer) {
        this.session.logUsage(type, question, answer);
    }
    getLiveTranscriptState() {
        return this.session.getLiveTranscriptState();
    }
    editLiveTranscriptSegment(id, text) {
        const updated = this.session.editLiveTranscriptSegment(id, text);
        if (updated)
            this.emitLiveTranscriptUpdated();
        return updated;
    }
    mergeLiveTranscriptSegmentWithPrevious(id) {
        const result = this.session.mergeLiveTranscriptSegmentWithPrevious(id);
        if (result)
            this.emitLiveTranscriptUpdated();
        return result;
    }
    commitLiveTranscriptSegment(id, speaker = 'interviewer') {
        const committed = this.session.commitLiveTranscriptSegment(id, speaker);
        if (committed)
            this.emitLiveTranscriptUpdated();
        return committed;
    }
    hasEditedLiveTranscript() {
        return this.session.hasEditedLiveTranscript();
    }
    getTranscriptForRag(includeActiveInterviewer = true) {
        return this.session.getTranscriptForRag(includeActiveInterviewer);
    }
    // ============================================
    // Transcript Handling (delegates to engine)
    // ============================================
    handleTranscript(segment) {
        this.engine.handleTranscript(segment);
        this.emitLiveTranscriptUpdated();
    }
    async handleSuggestionTrigger(trigger) {
        return this.engine.handleSuggestionTrigger(trigger);
    }
    // ============================================
    // Mode Executors (delegates to engine)
    // ============================================
    async runAssistMode() {
        return this.engine.runAssistMode();
    }
    async runWhatShouldISay(question, confidence, imagePaths, requestId) {
        return this.engine.runWhatShouldISay(question, confidence, imagePaths, requestId);
    }
    async runFollowUp(intent, userRequest, source) {
        return this.engine.runFollowUp(intent, userRequest, source);
    }
    async runRecap() {
        return this.engine.runRecap();
    }
    async runFollowUpQuestions() {
        return this.engine.runFollowUpQuestions();
    }
    async runManualAnswer(question) {
        return this.engine.runManualAnswer(question);
    }
    // ============================================
    // State Management
    // ============================================
    getActiveMode() {
        return this.engine.getActiveMode();
    }
    setMode(mode) {
        // This was private in the original, but kept for compatibility
        this.engine.setMode(mode);
    }
    // ============================================
    // Meeting Lifecycle (delegates to persistence)
    // ============================================
    async stopMeeting() {
        await this.persistence.stopMeeting();
        this.emitLiveTranscriptUpdated();
    }
    async recoverUnprocessedMeetings() {
        return this.persistence.recoverUnprocessedMeetings();
    }
    // ============================================
    // Reset (resets all sub-modules)
    // ============================================
    reset() {
        this.session.reset();
        this.engine.reset();
        this.emitLiveTranscriptUpdated();
    }
}
exports.IntelligenceManager = IntelligenceManager;
//# sourceMappingURL=IntelligenceManager.js.map
