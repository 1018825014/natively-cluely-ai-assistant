"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FollowUpQuestionsLLM = void 0;
const PromptLabService_1 = require("../services/PromptLabService");
class FollowUpQuestionsLLM {
    llmHelper;
    constructor(llmHelper) {
        this.llmHelper = llmHelper;
    }
    async generate(context) {
        try {
            const built = PromptLabService_1.PromptLabService.getInstance().buildFollowUpQuestionsExecution({ context }, this.llmHelper);
            const stream = this.llmHelper.streamChat(context, undefined, undefined, built.systemPrompt);
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
            const built = PromptLabService_1.PromptLabService.getInstance().buildFollowUpQuestionsExecution({ context }, this.llmHelper);
            yield* this.llmHelper.streamChat(context, undefined, undefined, built.systemPrompt);
        }
        catch (e) {
            console.error("[FollowUpQuestionsLLM] Stream Failed:", e);
        }
    }
}
exports.FollowUpQuestionsLLM = FollowUpQuestionsLLM;
//# sourceMappingURL=FollowUpQuestionsLLM.js.map
