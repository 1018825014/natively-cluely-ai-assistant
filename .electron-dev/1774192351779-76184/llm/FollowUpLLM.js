"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FollowUpLLM = void 0;
const prompts_1 = require("./prompts");
class FollowUpLLM {
    llmHelper;
    constructor(llmHelper) {
        this.llmHelper = llmHelper;
    }
    async generate(previousAnswer, refinementRequest, context, routeOptions) {
        try {
            const message = `PREVIOUS ANSWER:\n${previousAnswer}\n\nREQUEST: ${refinementRequest}`;
            const stream = this.llmHelper.streamChat(message, undefined, context, prompts_1.UNIVERSAL_FOLLOWUP_PROMPT, routeOptions);
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
            const message = `PREVIOUS ANSWER:\n${previousAnswer}\n\nREQUEST: ${refinementRequest}`;
            yield* this.llmHelper.streamChat(message, undefined, context, prompts_1.UNIVERSAL_FOLLOWUP_PROMPT, routeOptions);
        }
        catch (e) {
            console.error("[FollowUpLLM] Stream Failed:", e);
        }
    }
}
exports.FollowUpLLM = FollowUpLLM;
//# sourceMappingURL=FollowUpLLM.js.map