import { LLMHelper, StreamChatRouteOptions } from "../LLMHelper";
import { PromptLabService } from "../services/PromptLabService";

export class FollowUpLLM {
    private llmHelper: LLMHelper;

    constructor(llmHelper: LLMHelper) {
        this.llmHelper = llmHelper;
    }

    async generate(
        previousAnswer: string,
        refinementRequest: string,
        context?: string,
        routeOptions?: StreamChatRouteOptions
    ): Promise<string> {
        try {
            const built = PromptLabService.getInstance().buildFollowUpExecution({
                previousAnswer,
                refinementRequest,
                context,
            }, this.llmHelper);
            const stream = this.llmHelper.streamChat(
                built.message,
                undefined,
                context,
                built.systemPrompt,
                routeOptions
            );
            let full = "";
            for await (const chunk of stream) full += chunk;
            return full;
        } catch (e) {
            console.error("[FollowUpLLM] Failed:", e);
            return "";
        }
    }

    async *generateStream(
        previousAnswer: string,
        refinementRequest: string,
        context?: string,
        routeOptions?: StreamChatRouteOptions
    ): AsyncGenerator<string> {
        try {
            const built = PromptLabService.getInstance().buildFollowUpExecution({
                previousAnswer,
                refinementRequest,
                context,
                lane: routeOptions?.disableFastPath ? 'strong' : 'primary',
            }, this.llmHelper);
            yield* this.llmHelper.streamChat(
                built.message,
                undefined,
                context,
                built.systemPrompt,
                routeOptions
            );
        } catch (e) {
            console.error("[FollowUpLLM] Stream Failed:", e);
        }
    }
}
