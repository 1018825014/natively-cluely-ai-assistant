"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FollowUpLLM = void 0;
const PromptLabService_1 = require("../services/PromptLabService");
class FollowUpLLM {
    llmHelper;
    constructor(llmHelper) {
        this.llmHelper = llmHelper;
    }
    async generate(previousAnswer, refinementRequest, context, routeOptions) {
        try {
            const built = PromptLabService_1.PromptLabService.getInstance().buildFollowUpExecution({
                previousAnswer,
                refinementRequest,
                context,
            }, this.llmHelper);
            const stream = this.llmHelper.streamChat(built.message, undefined, context, built.systemPrompt, routeOptions);
            let full = "";
            for await (const chunk of stream)
                full += chunk;
            return full;
        }
        catch (e) {
            console.error("[FollowUpLLM] Failed:", e);
            return "";
        }
    }
    async *generateStream(previousAnswer, refinementRequest, context, routeOptions) {
        try {
            const built = PromptLabService_1.PromptLabService.getInstance().buildFollowUpExecution({
                previousAnswer,
                refinementRequest,
                context,
                lane: routeOptions?.disableFastPath ? 'strong' : 'primary',
            }, this.llmHelper);
            yield* this.llmHelper.streamChat(built.message, undefined, context, built.systemPrompt, routeOptions);
        }
        catch (e) {
            console.error("[FollowUpLLM] Stream Failed:", e);
        }
    }
}
exports.FollowUpLLM = FollowUpLLM;
//# sourceMappingURL=FollowUpLLM.js.map
