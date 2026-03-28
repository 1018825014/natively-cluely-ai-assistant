"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatToAnswerLLM = void 0;
const PromptLabService_1 = require("../services/PromptLabService");
class WhatToAnswerLLM {
    llmHelper;
    constructor(llmHelper) {
        this.llmHelper = llmHelper;
    }
    // Deprecated non-streaming method (redirect to streaming or implement if needed)
    async generate(cleanedTranscript) {
        // Simple wrapper around stream
        const stream = this.generateStream(cleanedTranscript);
        let full = "";
        for await (const chunk of stream)
            full += chunk;
        return full;
    }
    async *generateStream(cleanedTranscript, temporalContext, intentResult, imagePaths, routeOptions) {
        try {
            const promptLabService = PromptLabService_1.PromptLabService.getInstance();
            const built = promptLabService.buildWhatToAnswerExecution({
                cleanedTranscript,
                temporalContext,
                intentResult,
                imagePaths,
            }, this.llmHelper);
            yield* this.llmHelper.streamChat(built.message, imagePaths, undefined, built.systemPrompt, routeOptions);
        }
        catch (error) {
            console.error("[WhatToAnswerLLM] Stream failed:", error);
            yield "Could you repeat that? I want to make sure I address your question properly.";
        }
    }
}
exports.WhatToAnswerLLM = WhatToAnswerLLM;
//# sourceMappingURL=WhatToAnswerLLM.js.map