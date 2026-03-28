"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FollowUpQuestionsLLM = void 0;
const prompts_1 = require("./prompts");
class FollowUpQuestionsLLM {
    llmHelper;
    constructor(llmHelper) {
        this.llmHelper = llmHelper;
    }
    async generate(context) {
        try {
            const stream = this.llmHelper.streamChat(context, undefined, undefined, prompts_1.UNIVERSAL_FOLLOW_UP_QUESTIONS_PROMPT);
            let full = "";
            for await (const chunk of stream)
                full += chunk;
            return full;
        }
        catch (e) {
            console.error("[FollowUpQuestionsLLM] Failed:", e);
            return "";
        }
    }
    async *generateStream(context) {
        try {
            yield* this.llmHelper.streamChat(context, undefined, undefined, prompts_1.UNIVERSAL_FOLLOW_UP_QUESTIONS_PROMPT);
        }
        catch (e) {
            console.error("[FollowUpQuestionsLLM] Stream Failed:", e);
        }
    }
}
exports.FollowUpQuestionsLLM = FollowUpQuestionsLLM;
//# sourceMappingURL=FollowUpQuestionsLLM.js.map
