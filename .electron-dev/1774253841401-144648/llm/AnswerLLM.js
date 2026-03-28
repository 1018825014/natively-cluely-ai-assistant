"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnswerLLM = void 0;
const prompts_1 = require("./prompts");
class AnswerLLM {
    llmHelper;
    constructor(llmHelper) {
        this.llmHelper = llmHelper;
    }
    /**
     * Generate a spoken interview answer
     */
    async generate(question, context) {
        try {
            // Use LLMHelper's streamChat but collect all tokens since this method is non-streaming
            // We use UNIVERSAL_ANSWER_PROMPT as override
            const stream = this.llmHelper.streamChat(question, undefined, context, prompts_1.UNIVERSAL_ANSWER_PROMPT);
            let fullResponse = "";
            for await (const chunk of stream) {
                fullResponse += chunk;
            }
            return fullResponse.trim();
        }
        catch (error) {
            console.error("[AnswerLLM] Generation failed:", error);
            return "";
        }
    }
}
exports.AnswerLLM = AnswerLLM;
//# sourceMappingURL=AnswerLLM.js.map