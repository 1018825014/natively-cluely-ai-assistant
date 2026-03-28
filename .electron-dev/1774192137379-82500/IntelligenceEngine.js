"use strict";
// IntelligenceEngine.ts
// LLM mode routing and orchestration.
// Extracted from IntelligenceManager to decouple LLM logic from state management.
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntelligenceEngine = void 0;
const events_1 = require("events");
const LlmTraceRecorder_1 = require("./services/LlmTraceRecorder");
const llm_1 = require("./llm");
// Refinement intent detection (refined to avoid false positives)
function detectRefinementIntent(userText) {
    const lowercased = userText.toLowerCase().trim();
    const refinementPatterns = [
        { pattern: /make it shorter|shorten this|be brief/i, intent: 'shorten' },
        { pattern: /make it longer|expand on this|elaborate more/i, intent: 'expand' },
        { pattern: /rephrase that|say it differently|put it another way/i, intent: 'rephrase' },
        { pattern: /give me an example|provide an instance/i, intent: 'add_example' },
        { pattern: /make it more confident|be more assertive|sound stronger/i, intent: 'more_confident' },
        { pattern: /make it casual|be less formal|sound relaxed/i, intent: 'more_casual' },
        { pattern: /make it formal|be more professional|sound professional/i, intent: 'more_formal' },
        { pattern: /simplify this|make it simpler|explain specifically/i, intent: 'simplify' },
    ];
    for (const { pattern, intent } of refinementPatterns) {
        if (pattern.test(lowercased)) {
            return { isRefinement: true, intent };
        }
    }
    return { isRefinement: false, intent: '' };
}
class IntelligenceEngine extends events_1.EventEmitter {
    // Mode state
    activeMode = 'idle';
    assistCancellationToken = null;
    // Mode-specific LLMs
    answerLLM = null;
    assistLLM = null;
    followUpLLM = null;
    recapLLM = null;
    followUpQuestionsLLM = null;
    whatToAnswerLLM = null;
    // Keep reference to LLMHelper for client access
    llmHelper;
    // Reference to SessionTracker for context
    session;
    // Timestamps for tracking
    lastTranscriptTime = 0;
    lastTriggerTime = 0;
    triggerCooldown = 3000; // 3 seconds
    constructor(llmHelper, session) {
        super();
        this.llmHelper = llmHelper;
        this.session = session;
        this.initializeLLMs();
    }
    getLLMHelper() {
        return this.llmHelper;
    }
    createRecommendationRequestId() {
        return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }
    toRecommendationMeta(lane, requestId, route) {
        return {
            lane,
            requestId,
            modelId: route?.modelId,
            modelLabel: route?.modelLabel,
        };
    }
    getRecapLLM() {
        return this.recapLLM;
    }
    // ============================================
    // LLM Initialization
    // ============================================
    /**
     * Initialize or Re-Initialize mode-specific LLMs with shared Gemini client and Groq client
     * Must be called after API keys are updated.
     */
    initializeLLMs() {
        console.log(`[IntelligenceEngine] Initializing LLMs with LLMHelper`);
        this.answerLLM = new llm_1.AnswerLLM(this.llmHelper);
        this.assistLLM = new llm_1.AssistLLM(this.llmHelper);
        this.followUpLLM = new llm_1.FollowUpLLM(this.llmHelper);
        this.recapLLM = new llm_1.RecapLLM(this.llmHelper);
        this.followUpQuestionsLLM = new llm_1.FollowUpQuestionsLLM(this.llmHelper);
        this.whatToAnswerLLM = new llm_1.WhatToAnswerLLM(this.llmHelper);
        // Sync RecapLLM reference to SessionTracker for epoch compaction
        this.session.setRecapLLM(this.recapLLM);
    }
    reinitializeLLMs() {
        this.initializeLLMs();
    }
    // ============================================
    // Transcript Handling (delegates to SessionTracker)
    // ============================================
    /**
     * Process transcript from native audio, and trigger follow-up if appropriate
     */
    handleTranscript(segment, skipRefinementCheck = false) {
        const result = this.session.handleTranscript(segment);
        this.lastTranscriptTime = Date.now();
        // Check for follow-up intent if user is speaking
        if (result && !skipRefinementCheck && result.role === 'user' && this.session.getLastAssistantMessage()) {
            const { isRefinement, intent } = detectRefinementIntent(segment.text.trim());
            if (isRefinement) {
                this.runFollowUp(intent, segment.text.trim());
            }
        }
    }
    /**
     * Handle suggestion trigger from native audio service
     * This is the primary auto-trigger path
     */
    async handleSuggestionTrigger(trigger) {
        if (trigger.confidence < 0.5) {
            return;
        }
        await this.runWhatShouldISay(trigger.lastQuestion, trigger.confidence);
    }
    // ============================================
    // Mode Executors
    // ============================================
    /**
     * MODE 1: Assist (Passive)
     * Low-priority observational insights
     */
    async runAssistMode() {
        if (this.activeMode !== 'idle' && this.activeMode !== 'assist') {
            return null;
        }
        if (this.assistCancellationToken) {
            this.assistCancellationToken.abort();
        }
        this.assistCancellationToken = new AbortController();
        this.setMode('assist');
        try {
            if (!this.assistLLM) {
                this.setMode('idle');
                return null;
            }
            const context = this.session.getFormattedContext(60);
            if (!context) {
                this.setMode('idle');
                return null;
            }
            const insight = await this.assistLLM.generate(context);
            if (this.assistCancellationToken?.signal.aborted) {
                return null;
            }
            if (insight) {
                this.emit('assist_update', insight);
            }
            this.setMode('idle');
            return insight;
        }
        catch (error) {
            if (error.name === 'AbortError') {
                return null;
            }
            this.emit('error', error, 'assist');
            this.setMode('idle');
            return null;
        }
    }
    /**
     * MODE 2: What Should I Say (Primary)
     * Manual trigger - uses clean transcript pipeline for question inference
     * NEVER returns null - always provides a usable response
     */
    async runWhatShouldISay(question, confidence = 0.8, imagePaths, requestId) {
        const now = Date.now();
        const fallbackAnswer = "Could you repeat that? I want to make sure I address your question properly.";
        const displayQuestion = question || 'What to Answer';
        const effectiveRequestId = requestId || this.createRecommendationRequestId();
        if (now - this.lastTriggerTime < this.triggerCooldown) {
            return null;
        }
        if (this.assistCancellationToken) {
            this.assistCancellationToken.abort();
            this.assistCancellationToken = null;
        }
        this.setMode('what_to_say');
        this.lastTriggerTime = now;
        try {
            const primaryInitialRoute = this.llmHelper.getInitialStreamChatRouteInfo(imagePaths) || this.llmHelper.getCurrentModelRouteInfo();
            const strongInitialRoute = this.llmHelper.getCurrentModelRouteInfo();
            const shouldSkipStrong = this.llmHelper.shouldSkipParallelStrongAnswer(imagePaths);
            this.emit('suggested_answer_status', {
                status: 'started',
                question: displayQuestion,
                confidence,
                ...this.toRecommendationMeta('primary', effectiveRequestId, primaryInitialRoute),
            });
            if (shouldSkipStrong) {
                this.emit('suggested_answer_status', {
                    status: 'skipped',
                    question: displayQuestion,
                    confidence,
                    message: 'Primary lane is already using the current default model.',
                    ...this.toRecommendationMeta('strong', effectiveRequestId, strongInitialRoute),
                });
            }
            else {
                this.emit('suggested_answer_status', {
                    status: 'started',
                    question: displayQuestion,
                    confidence,
                    ...this.toRecommendationMeta('strong', effectiveRequestId, strongInitialRoute),
                });
            }
            if (!this.whatToAnswerLLM) {
                const fallbackConfiguredAnswer = !this.answerLLM
                    ? "Please configure your API Keys in Settings to use this feature."
                    : await this.answerLLM.generate(question || '', this.session.getFormattedContext(180));
                if (!shouldSkipStrong) {
                    this.emit('suggested_answer_status', {
                        status: 'skipped',
                        question: displayQuestion,
                        confidence,
                        message: 'Strong-model lane is unavailable in legacy answer mode.',
                        ...this.toRecommendationMeta('strong', effectiveRequestId, strongInitialRoute),
                    });
                }
                const primaryAnswer = fallbackConfiguredAnswer || fallbackAnswer;
                this.session.addAssistantMessage(primaryAnswer);
                this.emit('suggested_answer', {
                    answer: primaryAnswer,
                    question: displayQuestion,
                    confidence,
                    ...this.toRecommendationMeta('primary', effectiveRequestId, primaryInitialRoute),
                });
                this.emit('suggested_answer_status', {
                    status: 'completed',
                    question: displayQuestion,
                    confidence,
                    ...this.toRecommendationMeta('primary', effectiveRequestId, primaryInitialRoute),
                });
                this.setMode('idle');
                return primaryAnswer;
            }
            const contextItems = this.session.getContext(180);
            const lastInterim = this.session.getLastInterimInterviewer();
            if (lastInterim && lastInterim.text.trim().length > 0) {
                const lastItem = contextItems[contextItems.length - 1];
                const isDuplicate = lastItem &&
                    lastItem.role === 'interviewer' &&
                    (lastItem.text === lastInterim.text || Math.abs(lastItem.timestamp - lastInterim.timestamp) < 1000);
                if (!isDuplicate) {
                    console.log(`[IntelligenceEngine] Injecting interim transcript: "${lastInterim.text.substring(0, 50)}..."`);
                    contextItems.push({
                        role: 'interviewer',
                        text: lastInterim.text,
                        timestamp: lastInterim.timestamp
                    });
                }
            }
            const transcriptTurns = contextItems.map(item => ({
                role: item.role,
                text: item.text,
                timestamp: item.timestamp
            }));
            const preparedTranscript = (0, llm_1.prepareTranscriptForWhatToAnswer)(transcriptTurns, 12);
            const temporalContext = (0, llm_1.buildTemporalContext)(contextItems, this.session.getAssistantResponseHistory(), 180);
            const lastInterviewerTurn = this.session.getLastInterviewerTurn();
            const intentResult = await (0, llm_1.classifyIntent)(lastInterviewerTurn, preparedTranscript, this.session.getAssistantResponseHistory().length);
            console.log(`[IntelligenceEngine] Temporal RAG: ${temporalContext.previousResponses.length} responses, tone: ${temporalContext.toneSignals[0]?.type || 'neutral'}, intent: ${intentResult.intent}${imagePaths?.length ? `, with ${imagePaths.length} image(s)` : ''}`);
            const runLane = async (lane, options) => {
                return LlmTraceRecorder_1.llmTraceRecorder.runWithScope({ lane, stage: 'what_to_answer' }, async () => {
                    let fullAnswer = "";
                    let latestRoute = options.initialRoute;
                    try {
                        const stream = this.whatToAnswerLLM.generateStream(preparedTranscript, temporalContext, intentResult, imagePaths, {
                            disableFastPath: options.disableFastPath,
                            onRouteSelected: (route) => {
                                latestRoute = route;
                            }
                        });
                        for await (const token of stream) {
                            this.emit('suggested_answer_token', {
                                token,
                                question: displayQuestion,
                                confidence,
                                ...this.toRecommendationMeta(lane, effectiveRequestId, latestRoute),
                            });
                            fullAnswer += token;
                        }
                    }
                    catch (laneError) {
                        console.warn(`[IntelligenceEngine] ${lane} lane failed: ${laneError.message}`);
                        if (lane === 'primary') {
                            fullAnswer = fallbackAnswer;
                        }
                        else {
                            this.emit('suggested_answer_status', {
                                status: 'error',
                                question: displayQuestion,
                                confidence,
                                message: laneError.message,
                                ...this.toRecommendationMeta(lane, effectiveRequestId, latestRoute),
                            });
                            return null;
                        }
                    }
                    if (!fullAnswer || fullAnswer.trim().length < 5) {
                        if (lane === 'primary') {
                            fullAnswer = fallbackAnswer;
                        }
                        else {
                            this.emit('suggested_answer_status', {
                                status: 'error',
                                question: displayQuestion,
                                confidence,
                                message: 'No strong-model answer was generated.',
                                ...this.toRecommendationMeta(lane, effectiveRequestId, latestRoute),
                            });
                            return null;
                        }
                    }
                    this.emit('suggested_answer', {
                        answer: fullAnswer,
                        question: displayQuestion,
                        confidence,
                        ...this.toRecommendationMeta(lane, effectiveRequestId, latestRoute),
                    });
                    this.emit('suggested_answer_status', {
                        status: 'completed',
                        question: displayQuestion,
                        confidence,
                        ...this.toRecommendationMeta(lane, effectiveRequestId, latestRoute),
                    });
                    return fullAnswer;
                });
            };
            const [primaryAnswer, strongAnswer] = await Promise.all([
                runLane('primary', { disableFastPath: false, initialRoute: primaryInitialRoute }),
                shouldSkipStrong
                    ? Promise.resolve(null)
                    : runLane('strong', { disableFastPath: true, initialRoute: strongInitialRoute }),
            ]);
            if (primaryAnswer && primaryAnswer !== fallbackAnswer) {
                this.session.addAssistantMessage(primaryAnswer);
                this.session.pushUsage({
                    type: 'assist',
                    timestamp: Date.now(),
                    question: displayQuestion,
                    answer: primaryAnswer
                });
            }
            this.setMode('idle');
            return primaryAnswer || strongAnswer || fallbackAnswer;
        }
        catch (error) {
            this.emit('error', error, 'what_to_say');
            this.setMode('idle');
            return fallbackAnswer;
        }
    }
    /**
     * MODE 3: Follow-Up (Refinement)
     * Modify the last assistant message
     */
    async runFollowUp(intent, userRequest, source) {
        console.log(`[IntelligenceEngine] runFollowUp called with intent: ${intent}`);
        const lane = source?.lane || 'primary';
        const requestId = source?.requestId || this.createRecommendationRequestId();
        const lastMsg = source?.answer || this.session.getLastAssistantMessage();
        if (!lastMsg) {
            console.warn('[IntelligenceEngine] No lastAssistantMessage found for follow-up');
            return null;
        }
        this.setMode('follow_up');
        try {
            if (!this.followUpLLM) {
                console.error('[IntelligenceEngine] FollowUpLLM not initialized');
                this.setMode('idle');
                return null;
            }
            const context = this.session.getFormattedContext(60);
            const refinementRequest = userRequest || intent;
            let latestRoute = this.llmHelper.getInitialStreamChatRouteInfo(undefined, {
                disableFastPath: lane === 'strong',
            }) || this.llmHelper.getCurrentModelRouteInfo();
            let fullRefined = "";
            await LlmTraceRecorder_1.llmTraceRecorder.runWithScope({ lane, stage: 'follow_up' }, async () => {
                const stream = this.followUpLLM.generateStream(lastMsg, refinementRequest, context, {
                    disableFastPath: lane === 'strong',
                    onRouteSelected: (route) => {
                        latestRoute = route;
                    }
                });
                for await (const token of stream) {
                    this.emit('refined_answer_token', {
                        token,
                        intent,
                        ...this.toRecommendationMeta(lane, requestId, latestRoute),
                    });
                    fullRefined += token;
                }
            });
            if (fullRefined) {
                if (lane === 'primary') {
                    this.session.addAssistantMessage(fullRefined);
                }
                this.emit('refined_answer', {
                    answer: fullRefined,
                    intent,
                    ...this.toRecommendationMeta(lane, requestId, latestRoute),
                });
                const intentMap = {
                    'shorten': 'Shorten Answer',
                    'expand': 'Expand Answer',
                    'rephrase': 'Rephrase Answer',
                    'add_example': 'Add Example',
                    'more_confident': 'Make More Confident',
                    'more_casual': 'Make More Casual',
                    'more_formal': 'Make More Formal',
                    'simplify': 'Simplify Answer'
                };
                const displayQuestion = userRequest || intentMap[intent] || `Refining: ${intent}`;
                if (lane === 'primary') {
                    this.session.pushUsage({
                        type: 'followup',
                        timestamp: Date.now(),
                        question: displayQuestion,
                        answer: fullRefined
                    });
                }
            }
            this.setMode('idle');
            return fullRefined;
        }
        catch (error) {
            this.emit('error', error, 'follow_up');
            this.setMode('idle');
            return null;
        }
    }
    /**
     * MODE 4: Recap (Summary)
     * Neutral conversation summary
     */
    async runRecap() {
        console.log('[IntelligenceEngine] runRecap called');
        this.setMode('recap');
        try {
            if (!this.recapLLM) {
                console.error('[IntelligenceEngine] RecapLLM not initialized');
                this.setMode('idle');
                return null;
            }
            const context = this.session.getFormattedContext(120);
            if (!context) {
                console.warn('[IntelligenceEngine] No context available for recap');
                this.setMode('idle');
                return null;
            }
            let fullSummary = "";
            await LlmTraceRecorder_1.llmTraceRecorder.runWithScope({ stage: 'recap' }, async () => {
                const stream = this.recapLLM.generateStream(context);
                for await (const token of stream) {
                    this.emit('recap_token', token);
                    fullSummary += token;
                }
            });
            if (fullSummary) {
                this.emit('recap', fullSummary);
                this.session.pushUsage({
                    type: 'chat',
                    timestamp: Date.now(),
                    question: 'Recap Meeting',
                    answer: fullSummary
                });
            }
            this.setMode('idle');
            return fullSummary;
        }
        catch (error) {
            this.emit('error', error, 'recap');
            this.setMode('idle');
            return null;
        }
    }
    /**
     * MODE 6: Follow-Up Questions
     * Suggest strategic questions for the user to ask
     */
    async runFollowUpQuestions() {
        console.log('[IntelligenceEngine] runFollowUpQuestions called');
        this.setMode('follow_up_questions');
        try {
            if (!this.followUpQuestionsLLM) {
                console.error('[IntelligenceEngine] FollowUpQuestionsLLM not initialized');
                this.setMode('idle');
                return null;
            }
            const context = this.session.getFormattedContext(120);
            if (!context) {
                console.warn('[IntelligenceEngine] No context available for follow-up questions');
                this.setMode('idle');
                return null;
            }
            let fullQuestions = "";
            await LlmTraceRecorder_1.llmTraceRecorder.runWithScope({ stage: 'follow_up_questions' }, async () => {
                const stream = this.followUpQuestionsLLM.generateStream(context);
                for await (const token of stream) {
                    this.emit('follow_up_questions_token', token);
                    fullQuestions += token;
                }
            });
            if (fullQuestions) {
                this.emit('follow_up_questions_update', fullQuestions);
                this.session.pushUsage({
                    type: 'followup_questions',
                    timestamp: Date.now(),
                    question: 'Generate Follow-up Questions',
                    answer: fullQuestions
                });
            }
            this.setMode('idle');
            return fullQuestions;
        }
        catch (error) {
            this.emit('error', error, 'follow_up_questions');
            this.setMode('idle');
            return null;
        }
    }
    /**
     * MODE 5: Manual Answer (Fallback)
     * Explicit bypass when auto-detection fails
     */
    async runManualAnswer(question) {
        this.emit('manual_answer_started');
        this.setMode('manual');
        try {
            if (!this.answerLLM) {
                this.setMode('idle');
                return null;
            }
            const context = this.session.getFormattedContext(120);
            const answer = await this.answerLLM.generate(question, context);
            if (answer) {
                this.session.addAssistantMessage(answer);
                this.emit('manual_answer_result', answer, question);
                this.session.pushUsage({
                    type: 'chat',
                    timestamp: Date.now(),
                    question: question,
                    answer: answer
                });
            }
            this.setMode('idle');
            return answer;
        }
        catch (error) {
            this.emit('error', error, 'manual');
            this.setMode('idle');
            return null;
        }
    }
    // ============================================
    // State Management
    // ============================================
    setMode(mode) {
        if (this.activeMode !== mode) {
            this.activeMode = mode;
            this.emit('mode_changed', mode);
        }
    }
    getActiveMode() {
        return this.activeMode;
    }
    /**
     * Reset engine state (cancels any in-flight operations)
     */
    reset() {
        this.activeMode = 'idle';
        if (this.assistCancellationToken) {
            this.assistCancellationToken.abort();
            this.assistCancellationToken = null;
        }
    }
}
exports.IntelligenceEngine = IntelligenceEngine;
//# sourceMappingURL=IntelligenceEngine.js.map
