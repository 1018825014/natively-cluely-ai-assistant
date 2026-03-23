import { LLMHelper } from "../LLMHelper";
import { PromptLabService } from "../services/PromptLabService";

export class FollowUpQuestionsLLM {
    private llmHelper: LLMHelper;

    constructor(llmHelper: LLMHelper) {
        this.llmHelper = llmHelper;
    }

    async generate(context: string): Promise<string> {
        try {
            const built = PromptLabService.getInstance().buildFollowUpQuestionsExecution({ context }, this.llmHelper);
            const stream = this.llmHelper.streamChat(context, undefined, undefined, built.systemPrompt);
            let full = "";
            for await (const chunk of stream) full += chunk;
            return full;
        } catch (e) {
            console.error("[FollowUpQuestionsLLM] Failed:", e);
            return "";
        }
    }

    async *generateStream(context: string): AsyncGenerator<string> {
        try {
            const built = PromptLabService.getInstance().buildFollowUpQuestionsExecution({ context }, this.llmHelper);
            yield* this.llmHelper.streamChat(context, undefined, undefined, built.systemPrompt);
        } catch (e) {
            console.error("[FollowUpQuestionsLLM] Stream Failed:", e);
        }
    }
}
