"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecapLLM = void 0;
const prompts_1 = require("./prompts");
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
            const stream = this.llmHelper.streamChat(context, undefined, undefined, prompts_1.UNIVERSAL_RECAP_PROMPT);
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
            // Use our universal helper
            yield* this.llmHelper.streamChat(context, undefined, undefined, prompts_1.UNIVERSAL_RECAP_PROMPT);
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