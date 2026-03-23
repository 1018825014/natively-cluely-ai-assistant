import { LLMHelper } from "../LLMHelper";
import { PromptLabService } from "../services/PromptLabService";

export class RecapLLM {
    private llmHelper: LLMHelper;

    constructor(llmHelper: LLMHelper) {
        this.llmHelper = llmHelper;
    }

    /**
     * Generate a neutral conversation summary
     */
    async generate(context: string): Promise<string> {
        if (!context.trim()) return "";
        try {
            const built = PromptLabService.getInstance().buildRecapExecution({ context }, this.llmHelper);
            const stream = this.llmHelper.streamChat(context, undefined, undefined, built.systemPrompt);
            let fullResponse = "";
            for await (const chunk of stream) fullResponse += chunk;
            return this.clampRecapResponse(fullResponse);
        } catch (error) {
            console.error("[RecapLLM] Generation failed:", error);
            return "";
        }
    }

    /**
     * Generate a neutral conversation summary (Streamed)
     */
    async *generateStream(context: string): AsyncGenerator<string> {
        if (!context.trim()) return;
        try {
            const built = PromptLabService.getInstance().buildRecapExecution({ context }, this.llmHelper);
            yield* this.llmHelper.streamChat(context, undefined, undefined, built.systemPrompt);
        } catch (error) {
            console.error("[RecapLLM] Streaming generation failed:", error);
        }
    }

    private clampRecapResponse(text: string): string {
        if (!text) return "";
        // Simple clamp: max 5 lines
        return text.split('\n').filter(l => l.trim()).slice(0, 5).join('\n');
    }
}
