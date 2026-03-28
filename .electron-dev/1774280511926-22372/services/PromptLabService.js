"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PromptLabService = void 0;
const prompts_1 = require("../llm/prompts");
const prompts_2 = require("../llm/prompts");
const transcriptCleaner_1 = require("../llm/transcriptCleaner");
const TemporalContextBuilder_1 = require("../llm/TemporalContextBuilder");
const IntentClassifier_1 = require("../llm/IntentClassifier");
const PromptOverrideManager_1 = require("./PromptOverrideManager");
const ANSWER_VOICE_PROMPT_TEMPLATE = `You are a real-time interview assistant. The user just repeated or paraphrased a question from their interviewer.
Instructions:
1. Extract the core question being asked
2. Provide a clear, concise, and professional answer that the user can say out loud
3. Keep the answer conversational but informative (2-4 sentences ideal)
4. Do NOT include phrases like "The question is..." - just give the answer directly
5. Format for speaking out loud, not for reading

Provide only the answer, nothing else.`;
const ANSWER_IMAGE_PROMPT_TEMPLATE = `You are a helper. The user has provided a screenshot and a spoken question or command.
User said: "{{question}}"

Instructions:
1. Analyze the screenshot in the context of what the user said.
2. Provide a direct, helpful answer.
3. Be concise.`;
const PROMPT_TITLES = {
    what_to_answer: "How to answer",
    follow_up_refine: "Shorten / Refine",
    recap: "Recap",
    follow_up_questions: "Follow-up questions",
    answer: "Answer",
};
const EMPTY_ACTION_CONTEXT = {};
const clipSnippet = (text, maxLength = 110) => {
    const trimmed = text.trim();
    if (!trimmed)
        return "";
    if (trimmed.length <= maxLength)
        return trimmed;
    return `${trimmed.slice(0, Math.max(0, maxLength - 3))}...`;
};
const buildFieldPreview = (key, label, kind, scope, baseText, text, editable, overrideActive, description) => ({
    key,
    label,
    kind,
    editable,
    scope,
    text,
    baseText,
    charCount: text.length,
    summaryStart: clipSnippet(text.slice(0, 180)),
    summaryEnd: clipSnippet(text.slice(Math.max(0, text.length - 180))),
    overrideActive,
    description,
});
const formatRouteInfo = (label, route) => {
    if (!route) {
        return `${label}\nprovider: unavailable\nmodel: unavailable\nfast_path: false`;
    }
    return [
        label,
        `provider: ${route.provider}`,
        `model: ${route.modelLabel}`,
        `model_id: ${route.modelId}`,
        `fast_path: ${route.isFastPath ? "true" : "false"}`,
    ].join("\n");
};
const formatKeyValueBlock = (title, entries) => {
    return [
        title,
        ...entries.map(([key, value]) => `${key}: ${value === null || typeof value === "undefined" ? "null" : String(value)}`),
    ].join("\n");
};
const renderTemplate = (template, variables) => {
    return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => variables[key] ?? "");
};
const buildTranscriptSummaries = (contextItems) => {
    const speakers = [
        { speaker: "interviewer", label: "Interviewer transcript" },
        { speaker: "user", label: "You transcript" },
    ];
    return speakers.map(({ speaker, label }) => {
        const turns = contextItems.filter(item => item.role === speaker);
        const combinedText = turns.map(item => item.text.trim()).filter(Boolean).join("\n\n");
        const firstText = turns[0]?.text?.trim() || combinedText || "No transcript yet.";
        const lastText = turns[turns.length - 1]?.text?.trim() || combinedText || "No transcript yet.";
        return {
            key: `transcript:${speaker}`,
            label,
            speaker,
            turnCount: turns.length,
            charCount: combinedText.length,
            summaryStart: clipSnippet(firstText),
            summaryEnd: clipSnippet(lastText),
        };
    });
};
const transcriptSummaryToField = (summary) => {
    const text = [
        `Speaker: ${summary.speaker === "interviewer" ? "Interviewer" : "You"}`,
        `Turns: ${summary.turnCount}`,
        `Characters: ${summary.charCount}`,
        `Start: ${summary.summaryStart || "—"}`,
        `End: ${summary.summaryEnd || "—"}`,
    ].join("\n");
    return buildFieldPreview(summary.key, summary.label, "transcript", "transcript", text, text, false, false, "Compact transcript summary only. Edit the real transcript in the Conversation panel.");
};
class PromptLabService {
    static instance = null;
    fixedManager = PromptOverrideManager_1.PromptOverrideManager.getInstance();
    dynamicOverrides = {};
    actionContexts = {};
    static getInstance() {
        if (!PromptLabService.instance) {
            PromptLabService.instance = new PromptLabService();
        }
        return PromptLabService.instance;
    }
    setActionContext(action, context) {
        this.actionContexts[action] = context ? { ...context } : { ...EMPTY_ACTION_CONTEXT };
    }
    getActionContext(action) {
        return { ...EMPTY_ACTION_CONTEXT, ...(this.actionContexts[action] || {}) };
    }
    resetMeetingState() {
        this.dynamicOverrides = {};
        this.actionContexts = {};
    }
    getFixedOverrides() {
        return this.fixedManager.getAllOverrides();
    }
    resolveFixedPrompt(action, fieldKey, fallback) {
        return this.fixedManager.resolvePrompt(action, fieldKey, fallback);
    }
    setFixedOverride(action, fieldKey, value) {
        this.fixedManager.setOverride(action, fieldKey, value);
    }
    resetFixedOverride(action, fieldKey) {
        this.fixedManager.resetOverride(action, fieldKey);
    }
    resolveDynamicField(action, fieldKey, fallback) {
        const override = this.dynamicOverrides[action]?.[fieldKey];
        return typeof override === "string" ? override : fallback;
    }
    hasDynamicOverride(action, fieldKey) {
        return typeof this.dynamicOverrides[action]?.[fieldKey] === "string";
    }
    setDynamicOverride(action, fieldKey, value) {
        if (!this.dynamicOverrides[action]) {
            this.dynamicOverrides[action] = {};
        }
        this.dynamicOverrides[action][fieldKey] = value;
    }
    resetDynamicOverride(action, fieldKey) {
        if (!this.dynamicOverrides[action])
            return;
        delete this.dynamicOverrides[action][fieldKey];
        if (Object.keys(this.dynamicOverrides[action] || {}).length === 0) {
            delete this.dynamicOverrides[action];
        }
    }
    resetActionDynamicOverrides(action) {
        delete this.dynamicOverrides[action];
    }
    buildWhatToAnswerExecution(input, llmHelper) {
        const imagePaths = input.imagePaths || [];
        const intentBlockBase = input.intentResult
            ? [
                "<intent_and_shape>",
                `DETECTED INTENT: ${input.intentResult.intent}`,
                `ANSWER SHAPE: ${input.intentResult.answerShape}`,
                "</intent_and_shape>",
            ].join("\n")
            : "";
        const previousResponsesBlockBase = input.temporalContext?.hasRecentResponses
            ? [
                "PREVIOUS RESPONSES (Avoid Repetition):",
                ...input.temporalContext.previousResponses.map((response, index) => `${index + 1}. "${response}"`),
            ].join("\n")
            : "";
        const resolvedIntentBlock = this.resolveDynamicField("what_to_answer", "intent_block", intentBlockBase).trim();
        const resolvedPreviousResponsesBlock = this.resolveDynamicField("what_to_answer", "previous_responses_block", previousResponsesBlockBase).trim();
        const contextParts = [resolvedIntentBlock, resolvedPreviousResponsesBlock].filter(Boolean);
        const message = contextParts.length > 0
            ? `${contextParts.join("\n\n")}\n\nCONVERSATION:\n${input.cleanedTranscript}`
            : input.cleanedTranscript;
        const systemPrompt = this.resolveFixedPrompt("what_to_answer", "system_prompt", prompts_2.UNIVERSAL_WHAT_TO_ANSWER_PROMPT);
        const primaryRoute = llmHelper.getInitialStreamChatRouteInfo(imagePaths);
        const strongRoute = llmHelper.getCurrentModelRouteInfo();
        const skipStrongLane = llmHelper.shouldSkipParallelStrongAnswer(imagePaths);
        return {
            systemPrompt,
            message,
            fixedFields: [
                buildFieldPreview("system_prompt", "System prompt", "fixed", "fixed", prompts_2.UNIVERSAL_WHAT_TO_ANSWER_PROMPT, systemPrompt, true, systemPrompt !== prompts_2.UNIVERSAL_WHAT_TO_ANSWER_PROMPT, "Persistent across sessions."),
            ],
            dynamicFields: [
                buildFieldPreview("intent_block", "Intent + answer shape", "dynamic", "meeting", intentBlockBase, resolvedIntentBlock, true, this.hasDynamicOverride("what_to_answer", "intent_block"), "Meeting-scoped override."),
                buildFieldPreview("previous_responses_block", "Previous responses block", "dynamic", "meeting", previousResponsesBlockBase, resolvedPreviousResponsesBlock, true, this.hasDynamicOverride("what_to_answer", "previous_responses_block"), "Meeting-scoped override."),
            ],
            runtimeFields: [
                buildFieldPreview("routes", "Routing", "runtime", "runtime", [
                    formatRouteInfo("Primary route", primaryRoute),
                    "",
                    formatRouteInfo("Strong route", strongRoute),
                    `skip_strong_lane: ${skipStrongLane ? "true" : "false"}`,
                ].join("\n"), [
                    formatRouteInfo("Primary route", primaryRoute),
                    "",
                    formatRouteInfo("Strong route", strongRoute),
                    `skip_strong_lane: ${skipStrongLane ? "true" : "false"}`,
                ].join("\n"), false, false, "Read-only runtime routing details."),
                buildFieldPreview("session_flags", "Session flags", "runtime", "runtime", formatKeyValueBlock("Session flags", [
                    ["ai_response_language", llmHelper.getAiResponseLanguage()],
                    ["knowledge_mode", llmHelper.getKnowledgeOrchestrator()?.isKnowledgeMode?.() ? "true" : "false"],
                    ["image_count", imagePaths.length],
                    ["has_recent_responses", input.temporalContext?.hasRecentResponses ? "true" : "false"],
                ]), formatKeyValueBlock("Session flags", [
                    ["ai_response_language", llmHelper.getAiResponseLanguage()],
                    ["knowledge_mode", llmHelper.getKnowledgeOrchestrator()?.isKnowledgeMode?.() ? "true" : "false"],
                    ["image_count", imagePaths.length],
                    ["has_recent_responses", input.temporalContext?.hasRecentResponses ? "true" : "false"],
                ]), false, false),
            ],
            execution: {
                systemPrompt,
                message,
                imagePaths,
                runtime: {
                    primaryRoute,
                    strongRoute,
                    skipStrongLane,
                },
            },
        };
    }
    buildFollowUpExecution(input, llmHelper) {
        const basePreviousAnswer = input.previousAnswer;
        const baseRefinementRequest = input.refinementRequest;
        const previousAnswer = this.resolveDynamicField("follow_up_refine", "previous_answer", basePreviousAnswer);
        const refinementRequest = this.resolveDynamicField("follow_up_refine", "refinement_request", baseRefinementRequest);
        const message = `PREVIOUS ANSWER:\n${previousAnswer}\n\nREQUEST:\n${refinementRequest}`;
        const systemPrompt = this.resolveFixedPrompt("follow_up_refine", "system_prompt", prompts_2.UNIVERSAL_FOLLOWUP_PROMPT);
        const lane = input.lane || "primary";
        const route = llmHelper.getInitialStreamChatRouteInfo(undefined, { disableFastPath: lane === "strong" });
        return {
            systemPrompt,
            message,
            fixedFields: [
                buildFieldPreview("system_prompt", "System prompt", "fixed", "fixed", prompts_2.UNIVERSAL_FOLLOWUP_PROMPT, systemPrompt, true, systemPrompt !== prompts_2.UNIVERSAL_FOLLOWUP_PROMPT, "Persistent across sessions."),
            ],
            dynamicFields: [
                buildFieldPreview("previous_answer", "Previous answer", "dynamic", "meeting", basePreviousAnswer, previousAnswer, true, this.hasDynamicOverride("follow_up_refine", "previous_answer"), "Meeting-scoped override."),
                buildFieldPreview("refinement_request", "Refinement request", "dynamic", "meeting", baseRefinementRequest, refinementRequest, true, this.hasDynamicOverride("follow_up_refine", "refinement_request"), "Meeting-scoped override."),
            ],
            runtimeFields: [
                buildFieldPreview("route", "Routing", "runtime", "runtime", [
                    formatRouteInfo("Active route", route),
                    `lane: ${lane}`,
                    `disable_fast_path: ${lane === "strong" ? "true" : "false"}`,
                ].join("\n"), [
                    formatRouteInfo("Active route", route),
                    `lane: ${lane}`,
                    `disable_fast_path: ${lane === "strong" ? "true" : "false"}`,
                ].join("\n"), false, false),
                buildFieldPreview("session_flags", "Session flags", "runtime", "runtime", formatKeyValueBlock("Session flags", [
                    ["ai_response_language", llmHelper.getAiResponseLanguage()],
                    ["knowledge_mode", llmHelper.getKnowledgeOrchestrator()?.isKnowledgeMode?.() ? "true" : "false"],
                    ["context_chars", input.context?.length || 0],
                ]), formatKeyValueBlock("Session flags", [
                    ["ai_response_language", llmHelper.getAiResponseLanguage()],
                    ["knowledge_mode", llmHelper.getKnowledgeOrchestrator()?.isKnowledgeMode?.() ? "true" : "false"],
                    ["context_chars", input.context?.length || 0],
                ]), false, false),
            ],
            execution: {
                systemPrompt,
                message,
                imagePaths: [],
                runtime: { lane, route },
            },
        };
    }
    buildRecapExecution(input, llmHelper) {
        const systemPrompt = this.resolveFixedPrompt("recap", "system_prompt", prompts_2.UNIVERSAL_RECAP_PROMPT);
        const route = llmHelper.getInitialStreamChatRouteInfo();
        return {
            systemPrompt,
            message: input.context,
            fixedFields: [
                buildFieldPreview("system_prompt", "System prompt", "fixed", "fixed", prompts_2.UNIVERSAL_RECAP_PROMPT, systemPrompt, true, systemPrompt !== prompts_2.UNIVERSAL_RECAP_PROMPT, "Persistent across sessions."),
            ],
            dynamicFields: [],
            runtimeFields: [
                buildFieldPreview("route", "Routing", "runtime", "runtime", formatRouteInfo("Active route", route), formatRouteInfo("Active route", route), false, false),
                buildFieldPreview("session_flags", "Session flags", "runtime", "runtime", formatKeyValueBlock("Session flags", [
                    ["ai_response_language", llmHelper.getAiResponseLanguage()],
                    ["knowledge_mode", llmHelper.getKnowledgeOrchestrator()?.isKnowledgeMode?.() ? "true" : "false"],
                    ["context_chars", input.context.length],
                ]), formatKeyValueBlock("Session flags", [
                    ["ai_response_language", llmHelper.getAiResponseLanguage()],
                    ["knowledge_mode", llmHelper.getKnowledgeOrchestrator()?.isKnowledgeMode?.() ? "true" : "false"],
                    ["context_chars", input.context.length],
                ]), false, false),
            ],
            execution: {
                systemPrompt,
                message: input.context,
                imagePaths: [],
                runtime: { route },
            },
        };
    }
    buildFollowUpQuestionsExecution(input, llmHelper) {
        const systemPrompt = this.resolveFixedPrompt("follow_up_questions", "system_prompt", prompts_2.UNIVERSAL_FOLLOW_UP_QUESTIONS_PROMPT);
        const route = llmHelper.getInitialStreamChatRouteInfo();
        return {
            systemPrompt,
            message: input.context,
            fixedFields: [
                buildFieldPreview("system_prompt", "System prompt", "fixed", "fixed", prompts_2.UNIVERSAL_FOLLOW_UP_QUESTIONS_PROMPT, systemPrompt, true, systemPrompt !== prompts_2.UNIVERSAL_FOLLOW_UP_QUESTIONS_PROMPT, "Persistent across sessions."),
            ],
            dynamicFields: [],
            runtimeFields: [
                buildFieldPreview("route", "Routing", "runtime", "runtime", formatRouteInfo("Active route", route), formatRouteInfo("Active route", route), false, false),
                buildFieldPreview("session_flags", "Session flags", "runtime", "runtime", formatKeyValueBlock("Session flags", [
                    ["ai_response_language", llmHelper.getAiResponseLanguage()],
                    ["knowledge_mode", llmHelper.getKnowledgeOrchestrator()?.isKnowledgeMode?.() ? "true" : "false"],
                    ["context_chars", input.context.length],
                ]), formatKeyValueBlock("Session flags", [
                    ["ai_response_language", llmHelper.getAiResponseLanguage()],
                    ["knowledge_mode", llmHelper.getKnowledgeOrchestrator()?.isKnowledgeMode?.() ? "true" : "false"],
                    ["context_chars", input.context.length],
                ]), false, false),
            ],
            execution: {
                systemPrompt,
                message: input.context,
                imagePaths: [],
                runtime: { route },
            },
        };
    }
    buildAnswerExecution(input, llmHelper) {
        const baseQuestion = input.question || "";
        const resolvedQuestion = this.resolveDynamicField("answer", "question", baseQuestion);
        const imagePaths = input.imagePaths || [];
        const hasImages = imagePaths.length > 0;
        const voicePrompt = this.resolveFixedPrompt("answer", "voice_prompt", ANSWER_VOICE_PROMPT_TEMPLATE);
        const imagePromptTemplate = this.resolveFixedPrompt("answer", "image_prompt", ANSWER_IMAGE_PROMPT_TEMPLATE);
        const activePrompt = hasImages
            ? renderTemplate(imagePromptTemplate, { question: resolvedQuestion })
            : voicePrompt;
        const route = llmHelper.getInitialStreamChatRouteInfo(imagePaths);
        return {
            activeFixedKey: hasImages ? "image_prompt" : "voice_prompt",
            systemPrompt: prompts_1.HARD_SYSTEM_PROMPT,
            contextPrompt: activePrompt,
            fixedFields: [
                buildFieldPreview("voice_prompt", "Voice-only prompt template", "fixed", "fixed", ANSWER_VOICE_PROMPT_TEMPLATE, voicePrompt, true, voicePrompt !== ANSWER_VOICE_PROMPT_TEMPLATE, "Persistent across sessions."),
                buildFieldPreview("image_prompt", "Image + voice prompt template", "fixed", "fixed", ANSWER_IMAGE_PROMPT_TEMPLATE, imagePromptTemplate, true, imagePromptTemplate !== ANSWER_IMAGE_PROMPT_TEMPLATE, "Persistent across sessions. Use {{question}} to inject the spoken question."),
            ],
            dynamicFields: [
                buildFieldPreview("question", "Spoken question", "dynamic", "meeting", baseQuestion, resolvedQuestion, true, this.hasDynamicOverride("answer", "question"), "Meeting-scoped override."),
            ],
            runtimeFields: [
                buildFieldPreview("delivery_path", "Delivery path", "runtime", "runtime", formatKeyValueBlock("Delivery path", [
                    ["has_images", hasImages ? "true" : "false"],
                    ["image_count", imagePaths.length],
                    ["will_attempt_live_rag", hasImages ? "false" : "true"],
                    ["base_system_prompt", "HARD_SYSTEM_PROMPT"],
                ]), formatKeyValueBlock("Delivery path", [
                    ["has_images", hasImages ? "true" : "false"],
                    ["image_count", imagePaths.length],
                    ["will_attempt_live_rag", hasImages ? "false" : "true"],
                    ["base_system_prompt", "HARD_SYSTEM_PROMPT"],
                ]), false, false),
                buildFieldPreview("route", "Routing", "runtime", "runtime", formatRouteInfo("Active route", route), formatRouteInfo("Active route", route), false, false),
                buildFieldPreview("session_flags", "Session flags", "runtime", "runtime", formatKeyValueBlock("Session flags", [
                    ["ai_response_language", llmHelper.getAiResponseLanguage()],
                    ["knowledge_mode", llmHelper.getKnowledgeOrchestrator()?.isKnowledgeMode?.() ? "true" : "false"],
                    ["question_chars", resolvedQuestion.length],
                ]), formatKeyValueBlock("Session flags", [
                    ["ai_response_language", llmHelper.getAiResponseLanguage()],
                    ["knowledge_mode", llmHelper.getKnowledgeOrchestrator()?.isKnowledgeMode?.() ? "true" : "false"],
                    ["question_chars", resolvedQuestion.length],
                ]), false, false),
            ],
            execution: {
                systemPrompt: prompts_1.HARD_SYSTEM_PROMPT,
                contextPrompt: activePrompt,
                message: resolvedQuestion,
                imagePaths,
                runtime: {
                    route,
                    hasImages,
                    willAttemptLiveRag: !hasImages,
                },
            },
        };
    }
    async getActionPreview(action, intelligenceManager, llmHelper, context) {
        const mergedContext = {
            ...this.getActionContext(action),
            ...(context || {}),
        };
        let built;
        let transcriptSummaries = [];
        switch (action) {
            case "what_to_answer": {
                const contextItems = intelligenceManager.getContext(180);
                const transcriptTurns = contextItems.map(item => ({
                    role: item.role,
                    text: item.text,
                    timestamp: item.timestamp,
                }));
                const cleanedTranscript = (0, transcriptCleaner_1.prepareTranscriptForWhatToAnswer)(transcriptTurns, 12);
                const assistantHistory = intelligenceManager.getAssistantResponseHistory();
                const temporalContext = (0, TemporalContextBuilder_1.buildTemporalContext)(contextItems, assistantHistory, 180);
                const intentResult = await (0, IntentClassifier_1.classifyIntent)(intelligenceManager.getLastInterviewerTurn(), cleanedTranscript, assistantHistory.length);
                built = this.buildWhatToAnswerExecution({
                    cleanedTranscript,
                    temporalContext,
                    intentResult,
                    imagePaths: mergedContext.imagePaths,
                }, llmHelper);
                transcriptSummaries = buildTranscriptSummaries(contextItems);
                break;
            }
            case "follow_up_refine": {
                const lane = mergedContext.lane || "primary";
                const previousAnswer = mergedContext.sourceAnswer || intelligenceManager.getLastAssistantMessage() || "";
                const refinementRequest = mergedContext.userRequest || mergedContext.intent || "shorten";
                const contextText = intelligenceManager.getFormattedContext(60);
                built = this.buildFollowUpExecution({
                    previousAnswer,
                    refinementRequest,
                    context: contextText,
                    lane,
                }, llmHelper);
                transcriptSummaries = buildTranscriptSummaries(intelligenceManager.getContext(60));
                break;
            }
            case "recap": {
                const contextText = intelligenceManager.getFormattedContext(120);
                built = this.buildRecapExecution({ context: contextText }, llmHelper);
                transcriptSummaries = buildTranscriptSummaries(intelligenceManager.getContext(120));
                break;
            }
            case "follow_up_questions": {
                const contextText = intelligenceManager.getFormattedContext(120);
                built = this.buildFollowUpQuestionsExecution({ context: contextText }, llmHelper);
                transcriptSummaries = buildTranscriptSummaries(intelligenceManager.getContext(120));
                break;
            }
            case "answer":
            default: {
                built = this.buildAnswerExecution({
                    question: mergedContext.question,
                    imagePaths: mergedContext.imagePaths,
                }, llmHelper);
                transcriptSummaries = buildTranscriptSummaries(intelligenceManager.getContext(100));
                break;
            }
        }
        const transcriptFields = transcriptSummaries.map(transcriptSummaryToField);
        const fixedKey = built.activeFixedKey;
        const primaryFixedField = fixedKey
            ? built.fixedFields.find(field => field.key === fixedKey) || built.fixedFields[0]
            : built.fixedFields[0];
        return {
            action,
            title: PROMPT_TITLES[action],
            fixedPromptBase: primaryFixedField?.baseText || "",
            fixedPromptResolved: primaryFixedField?.text || "",
            fixedFields: built.fixedFields,
            dynamicFields: built.dynamicFields,
            runtimeFields: [...built.runtimeFields, ...transcriptFields],
            transcriptSummaries,
            hasUserOverrides: [...built.fixedFields, ...built.dynamicFields].some(field => field.overrideActive),
            execution: built.execution,
        };
    }
}
exports.PromptLabService = PromptLabService;
//# sourceMappingURL=PromptLabService.js.map