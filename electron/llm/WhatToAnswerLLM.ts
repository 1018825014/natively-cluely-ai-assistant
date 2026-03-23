import { LLMHelper, StreamChatRouteOptions } from "../LLMHelper";
import { TemporalContext } from "./TemporalContextBuilder";
import { IntentResult } from "./IntentClassifier";
import { PromptLabService } from "../services/PromptLabService";

export class WhatToAnswerLLM {
    private llmHelper: LLMHelper;

    constructor(llmHelper: LLMHelper) {
        this.llmHelper = llmHelper;
    }

    // Deprecated non-streaming method (redirect to streaming or implement if needed)
    async generate(cleanedTranscript: string): Promise<string> {
        // Simple wrapper around stream
        const stream = this.generateStream(cleanedTranscript);
        let full = "";
        for await (const chunk of stream) full += chunk;
        return full;
    }

    async *generateStream(
        cleanedTranscript: string,
        temporalContext?: TemporalContext,
        intentResult?: IntentResult,
        imagePaths?: string[],
        routeOptions?: StreamChatRouteOptions
    ): AsyncGenerator<string> {
        try {
            const promptLabService = PromptLabService.getInstance();
            const built = promptLabService.buildWhatToAnswerExecution({
                cleanedTranscript,
                temporalContext,
                intentResult,
                imagePaths,
            }, this.llmHelper);

            yield* this.llmHelper.streamChat(
                built.message,
                imagePaths,
                undefined,
                built.systemPrompt,
                routeOptions
            );

        } catch (error) {
            console.error("[WhatToAnswerLLM] Stream failed:", error);
            yield "Could you repeat that? I want to make sure I address your question properly.";
        }
    }
}
