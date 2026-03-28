"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PromptLabService = void 0;
const prompts_1 = require("../llm/prompts");
const prompts_2 = require("../llm/prompts");
const transcriptCleaner_1 = require("../llm/transcriptCleaner");
const TemporalContextBuilder_1 = require("../llm/TemporalContextBuilder");
const IntentClassifier_1 = require("../llm/IntentClassifier");
const PromptOverrideManager_1 = require("./PromptOverrideManager");
const ANSWER_VOICE_PROMPT_TEMPLATE = `你是一名实时面试助手。用户刚刚复述或转述了面试官的问题。
要求：
1. 提取问题的核心
2. 直接给出用户可以当场说出口的回答
3. 回答要清晰、专业、自然，最好控制在 2-4 句
4. 不要出现“这个问题是在问……”这类前置解释
5. 输出应当适合口头表达，而不是书面说明

只输出最终回答，不要附加其他内容。`;
const ANSWER_IMAGE_PROMPT_TEMPLATE = `你是一名助手。用户提供了一张截图和一句口头问题或指令。
用户说的是： "{{question}}"

要求：
1. 结合截图和用户说的话一起理解
2. 直接给出有帮助的回答
3. 保持简洁。`;
const PROMPT_TITLES = {
    what_to_answer: "怎么回答",
    follow_up_refine: "精简润色",
    recap: "总结",
    follow_up_questions: "追问建议",
    answer: "作答",
};
const FIXED_OVERRIDE_DESCRIPTION = "会跨会议持续生效。";
const MEETING_OVERRIDE_DESCRIPTION = "仅对当前会议生效。";
const TRANSCRIPT_SUMMARY_DESCRIPTION = "这里只展示压缩后的转写摘要。真实转写请在对话面板编辑。";
const RUNTIME_KEY_LABELS = {
    ai_response_language: "AI 回复语言",
    knowledge_mode: "知识模式",
    image_count: "图片数量",
    has_recent_responses: "存在历史回答",
    context_chars: "上下文字符数",
    question_chars: "问题字符数",
    has_images: "是否有截图",
    will_attempt_live_rag: "是否尝试实时 RAG",
    base_system_prompt: "基础系统提示词",
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
        return `${label}\n提供商：暂无\n模型：暂无\n快速路径：false`;
    }
    return [
        label,
        `提供商：${route.provider}`,
        `模型：${route.modelLabel}`,
        `模型 ID：${route.modelId}`,
        `快速路径：${route.isFastPath ? "true" : "false"}`,
    ].join("\n");
};
const formatKeyValueBlock = (title, entries) => {
    return [
        title,
        ...entries.map(([key, value]) => `${RUNTIME_KEY_LABELS[key] || key}：${value === null || typeof value === "undefined" ? "null" : String(value)}`),
    ].join("\n");
};
const renderTemplate = (template, variables) => {
    return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => variables[key] ?? "");
};
const buildTranscriptSummaries = (contextItems) => {
    const speakers = [
        { speaker: "interviewer", label: "面试官转写" },
        { speaker: "user", label: "我的转写" },
    ];
    return speakers.map(({ speaker, label }) => {
        const turns = contextItems.filter(item => item.role === speaker);
        const combinedText = turns.map(item => item.text.trim()).filter(Boolean).join("\n\n");
        const firstText = turns[0]?.text?.trim() || combinedText || "暂无转写。";
        const lastText = turns[turns.length - 1]?.text?.trim() || combinedText || "暂无转写。";
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
        `说话人：${summary.speaker === "interviewer" ? "面试官" : "我"}`,
        `轮次：${summary.turnCount}`,
        `字符数：${summary.charCount}`,
        `开头：${summary.summaryStart || "—"}`,
        `结尾：${summary.summaryEnd || "—"}`,
    ].join("\n");
    return buildFieldPreview(summary.key, summary.label, "transcript", "transcript", text, text, false, false, TRANSCRIPT_SUMMARY_DESCRIPTION);
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
                buildFieldPreview("system_prompt", "系统提示词", "fixed", "fixed", prompts_2.UNIVERSAL_WHAT_TO_ANSWER_PROMPT, systemPrompt, true, systemPrompt !== prompts_2.UNIVERSAL_WHAT_TO_ANSWER_PROMPT, FIXED_OVERRIDE_DESCRIPTION),
            ],
            dynamicFields: [
                buildFieldPreview("intent_block", "意图与回答形态", "dynamic", "meeting", intentBlockBase, resolvedIntentBlock, true, this.hasDynamicOverride("what_to_answer", "intent_block"), MEETING_OVERRIDE_DESCRIPTION),
                buildFieldPreview("previous_responses_block", "历史回答片段", "dynamic", "meeting", previousResponsesBlockBase, resolvedPreviousResponsesBlock, true, this.hasDynamicOverride("what_to_answer", "previous_responses_block"), MEETING_OVERRIDE_DESCRIPTION),
            ],
            runtimeFields: [
                buildFieldPreview("routes", "路由信息", "runtime", "runtime", [
                    formatRouteInfo("主通道", primaryRoute),
                    "",
                    formatRouteInfo("强模型通道", strongRoute),
                    `跳过强模型通道：${skipStrongLane ? "true" : "false"}`,
                ].join("\n"), [
                    formatRouteInfo("主通道", primaryRoute),
                    "",
                    formatRouteInfo("强模型通道", strongRoute),
                    `跳过强模型通道：${skipStrongLane ? "true" : "false"}`,
                ].join("\n"), false, false, "只读的运行时路由信息。"),
                buildFieldPreview("session_flags", "会话标记", "runtime", "runtime", formatKeyValueBlock("会话标记", [
                    ["ai_response_language", llmHelper.getAiResponseLanguage()],
                    ["knowledge_mode", llmHelper.getKnowledgeOrchestrator()?.isKnowledgeMode?.() ? "true" : "false"],
                    ["image_count", imagePaths.length],
                    ["has_recent_responses", input.temporalContext?.hasRecentResponses ? "true" : "false"],
                ]), formatKeyValueBlock("会话标记", [
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
                buildFieldPreview("system_prompt", "系统提示词", "fixed", "fixed", prompts_2.UNIVERSAL_FOLLOWUP_PROMPT, systemPrompt, true, systemPrompt !== prompts_2.UNIVERSAL_FOLLOWUP_PROMPT, FIXED_OVERRIDE_DESCRIPTION),
            ],
            dynamicFields: [
                buildFieldPreview("previous_answer", "上一版回答", "dynamic", "meeting", basePreviousAnswer, previousAnswer, true, this.hasDynamicOverride("follow_up_refine", "previous_answer"), MEETING_OVERRIDE_DESCRIPTION),
                buildFieldPreview("refinement_request", "精简要求", "dynamic", "meeting", baseRefinementRequest, refinementRequest, true, this.hasDynamicOverride("follow_up_refine", "refinement_request"), MEETING_OVERRIDE_DESCRIPTION),
            ],
            runtimeFields: [
                buildFieldPreview("route", "路由信息", "runtime", "runtime", [
                    formatRouteInfo("当前路由", route),
                    `通道：${lane}`,
                    `禁用快速路径：${lane === "strong" ? "true" : "false"}`,
                ].join("\n"), [
                    formatRouteInfo("当前路由", route),
                    `通道：${lane}`,
                    `禁用快速路径：${lane === "strong" ? "true" : "false"}`,
                ].join("\n"), false, false),
                buildFieldPreview("session_flags", "会话标记", "runtime", "runtime", formatKeyValueBlock("会话标记", [
                    ["ai_response_language", llmHelper.getAiResponseLanguage()],
                    ["knowledge_mode", llmHelper.getKnowledgeOrchestrator()?.isKnowledgeMode?.() ? "true" : "false"],
                    ["context_chars", input.context?.length || 0],
                ]), formatKeyValueBlock("会话标记", [
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
                buildFieldPreview("system_prompt", "系统提示词", "fixed", "fixed", prompts_2.UNIVERSAL_RECAP_PROMPT, systemPrompt, true, systemPrompt !== prompts_2.UNIVERSAL_RECAP_PROMPT, FIXED_OVERRIDE_DESCRIPTION),
            ],
            dynamicFields: [],
            runtimeFields: [
                buildFieldPreview("route", "路由信息", "runtime", "runtime", formatRouteInfo("当前路由", route), formatRouteInfo("当前路由", route), false, false),
                buildFieldPreview("session_flags", "会话标记", "runtime", "runtime", formatKeyValueBlock("会话标记", [
                    ["ai_response_language", llmHelper.getAiResponseLanguage()],
                    ["knowledge_mode", llmHelper.getKnowledgeOrchestrator()?.isKnowledgeMode?.() ? "true" : "false"],
                    ["context_chars", input.context.length],
                ]), formatKeyValueBlock("会话标记", [
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
                buildFieldPreview("system_prompt", "系统提示词", "fixed", "fixed", prompts_2.UNIVERSAL_FOLLOW_UP_QUESTIONS_PROMPT, systemPrompt, true, systemPrompt !== prompts_2.UNIVERSAL_FOLLOW_UP_QUESTIONS_PROMPT, FIXED_OVERRIDE_DESCRIPTION),
            ],
            dynamicFields: [],
            runtimeFields: [
                buildFieldPreview("route", "路由信息", "runtime", "runtime", formatRouteInfo("当前路由", route), formatRouteInfo("当前路由", route), false, false),
                buildFieldPreview("session_flags", "会话标记", "runtime", "runtime", formatKeyValueBlock("会话标记", [
                    ["ai_response_language", llmHelper.getAiResponseLanguage()],
                    ["knowledge_mode", llmHelper.getKnowledgeOrchestrator()?.isKnowledgeMode?.() ? "true" : "false"],
                    ["context_chars", input.context.length],
                ]), formatKeyValueBlock("会话标记", [
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
                buildFieldPreview("voice_prompt", "纯语音提示词模板", "fixed", "fixed", ANSWER_VOICE_PROMPT_TEMPLATE, voicePrompt, true, voicePrompt !== ANSWER_VOICE_PROMPT_TEMPLATE, FIXED_OVERRIDE_DESCRIPTION),
                buildFieldPreview("image_prompt", "截图+语音提示词模板", "fixed", "fixed", ANSWER_IMAGE_PROMPT_TEMPLATE, imagePromptTemplate, true, imagePromptTemplate !== ANSWER_IMAGE_PROMPT_TEMPLATE, "会跨会议持续生效。使用 {{question}} 注入口述问题。"),
            ],
            dynamicFields: [
                buildFieldPreview("question", "口述问题", "dynamic", "meeting", baseQuestion, resolvedQuestion, true, this.hasDynamicOverride("answer", "question"), MEETING_OVERRIDE_DESCRIPTION),
            ],
            runtimeFields: [
                buildFieldPreview("delivery_path", "发送路径", "runtime", "runtime", formatKeyValueBlock("发送路径", [
                    ["has_images", hasImages ? "true" : "false"],
                    ["image_count", imagePaths.length],
                    ["will_attempt_live_rag", hasImages ? "false" : "true"],
                    ["base_system_prompt", "HARD_SYSTEM_PROMPT"],
                ]), formatKeyValueBlock("发送路径", [
                    ["has_images", hasImages ? "true" : "false"],
                    ["image_count", imagePaths.length],
                    ["will_attempt_live_rag", hasImages ? "false" : "true"],
                    ["base_system_prompt", "HARD_SYSTEM_PROMPT"],
                ]), false, false),
                buildFieldPreview("route", "路由信息", "runtime", "runtime", formatRouteInfo("当前路由", route), formatRouteInfo("当前路由", route), false, false),
                buildFieldPreview("session_flags", "会话标记", "runtime", "runtime", formatKeyValueBlock("会话标记", [
                    ["ai_response_language", llmHelper.getAiResponseLanguage()],
                    ["knowledge_mode", llmHelper.getKnowledgeOrchestrator()?.isKnowledgeMode?.() ? "true" : "false"],
                    ["question_chars", resolvedQuestion.length],
                ]), formatKeyValueBlock("会话标记", [
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