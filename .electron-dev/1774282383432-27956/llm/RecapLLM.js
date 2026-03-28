"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecapLLM = void 0;
const PromptLabService_1 = require("../services/PromptLabService");
class RecapLLM {
    llmHelper;
    constructor(llmHelper) {
        this.llmHelper = llmHelper;
    }
    /**
     * Generate a neutral conversation summary
     */
    async generate(context) {
        if (!context.trim())
            return "";
        try {
            const built = PromptLabService_1.PromptLabService.getInstance().buildRecapExecution({ context }, this.llmHelper);
            const stream = this.llmHelper.streamChat(context, undefined, undefined, built.systemPrompt);
            let fullResponse = "";
            for await (const chunk of stream)
                fullResponse += chunk;
            return this.clampRecapResponse(fullResponse);
        }
        catch (error) {
            console.error("[RecapLLM] Generation failed:", error);
            return "";
        }
    }
    /**
     * Generate a neutral conversation summary (Streamed)
     */
    async *generateStream(context) {
        if (!context.trim())
            return;
        try {
            const built = PromptLabService_1.PromptLabService.getInstance().buildRecapExecution({ context }, this.llmHelper);
            yield* this.llmHelper.streamChat(context, undefined, undefined, built.systemPrompt);
        }
        catch (error) {
            console.error("[RecapLLM] Streaming generation failed:", error);
        }
    }
    clampRecapResponse(text) {
        if (!text)
            return "";
        // Simple clamp: max 5 lines
        return text.split('\n').filter(l => l.trim()).slice(0, 5).join('\n');
    }
}
exports.RecapLLM = RecapLLM;
//# sourceMappingURL=RecapLLM.js.map
