"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimiter = void 0;
exports.createProviderRateLimiters = createProviderRateLimiters;
/**
 * RateLimiter - Token bucket rate limiter for LLM API calls
 * Prevents 429 errors on free-tier API plans by queuing requests
 * when the bucket is empty.
 */
class RateLimiter {
    tokens;
    maxTokens;
    refillRatePerSecond;
    lastRefillTime;
    waitQueue = [];
    refillTimer = null;
    /**
     * @param maxTokens - Maximum burst capacity (e.g. 30 for Groq free tier)
     * @param refillRatePerSecond - Tokens added per second (e.g. 0.5 = 30/min)
     */
    constructor(maxTokens, refillRatePerSecond) {
        this.maxTokens = maxTokens;
        this.tokens = maxTokens;
        this.refillRatePerSecond = refillRatePerSecond;
        this.lastRefillTime = Date.now();
        // Refill tokens periodically
        this.refillTimer = setInterval(() => this.refill(), 1000);
    }
    /**
     * Acquire a token. Resolves immediately if available, otherwise waits.
     */
    async acquire() {
        this.refill();
        if (this.tokens >= 1) {
            this.tokens -= 1;
            return;
        }
        // Wait for a token to become available
        return new Promise((resolve) => {
            this.waitQueue.push(resolve);
        });
    }
    refill() {
        const now = Date.now();
        const elapsed = (now - this.lastRefillTime) / 1000;
        const newTokens = elapsed * this.refillRatePerSecond;
        if (newTokens >= 1) {
            this.tokens = Math.min(this.maxTokens, this.tokens + Math.floor(newTokens));
            this.lastRefillTime = now;
            // Wake up waiting requests
            while (this.waitQueue.length > 0 && this.tokens >= 1) {
                this.tokens -= 1;
                const resolve = this.waitQueue.shift();
                resolve();
            }
        }
    }
    destroy() {
        if (this.refillTimer) {
            clearInterval(this.refillTimer);
            this.refillTimer = null;
        }
        // Release all waiting requests
        while (this.waitQueue.length > 0) {
            const resolve = this.waitQueue.shift();
            resolve();
        }
    }
}
exports.RateLimiter = RateLimiter;
/**
 * Pre-configured rate limiters for known providers.
 * These match documented free-tier limits.
 */
function createProviderRateLimiters() {
    return {
        groq: new RateLimiter(6, 0.1), // 6 req/min
        gemini: new RateLimiter(120, 2.0), // 120 req/min
        openai: new RateLimiter(120, 2.0), // 120 req/min
        claude: new RateLimiter(120, 2.0), // 120 req/min
    };
}
//# sourceMappingURL=RateLimiter.js.map