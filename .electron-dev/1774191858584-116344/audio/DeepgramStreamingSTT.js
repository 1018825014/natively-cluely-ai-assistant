"use strict";
/**
 * DeepgramStreamingSTT - WebSocket-based streaming Speech-to-Text using Deepgram.
 *
 * Implements the same EventEmitter interface as GoogleSTT:
 *   Events: 'transcript' ({ text, isFinal, confidence }), 'error' (Error)
 *   Methods: start(), stop(), write(chunk), setSampleRate(), setAudioChannelCount()
 *
 * Sends raw PCM (linear16, 16-bit LE) over WebSocket — NO WAV header.
 * Receives interim and final transcription results in real time.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeepgramStreamingSTT = void 0;
const events_1 = require("events");
const ws_1 = __importDefault(require("ws"));
const languages_1 = require("../config/languages");
const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30000;
const KEEPALIVE_INTERVAL_MS = 15000;
class DeepgramStreamingSTT extends events_1.EventEmitter {
    apiKey;
    ws = null;
    isActive = false;
    shouldReconnect = false;
    sampleRate = 16000;
    numChannels = 1;
    model = 'nova-3';
    languageCode = 'en'; // Default to English
    reconnectAttempts = 0;
    reconnectTimer = null;
    keepAliveTimer = null;
    buffer = [];
    isConnecting = false;
    constructor(apiKey) {
        super();
        this.apiKey = apiKey.trim();
    }
    // =========================================================================
    // Configuration (match GoogleSTT / RestSTT interface)
    // =========================================================================
    setSampleRate(rate) {
        this.sampleRate = rate;
        console.log(`[DeepgramStreaming] Sample rate set to ${rate}`);
    }
    setAudioChannelCount(count) {
        this.numChannels = count;
        console.log(`[DeepgramStreaming] Channel count set to ${count}`);
    }
    /** Set recognition language using ISO-639-1 code */
    setRecognitionLanguage(key) {
        const config = languages_1.RECOGNITION_LANGUAGES[key];
        if (config) {
            // Deepgram Nova-3 does not support Simplified Chinese. Fall back to
            // Nova-2 with zh-CN for the app's built-in Chinese option.
            if (config.iso639 === 'zh') {
                this.model = 'nova-2';
                this.languageCode = 'zh-CN';
            }
            else {
                this.model = 'nova-3';
                this.languageCode = config.iso639;
            }
            console.log(`[DeepgramStreaming] Language set to ${this.languageCode} (model=${this.model})`);
            if (this.isActive) {
                console.log('[DeepgramStreaming] Language changed while active. Restarting...');
                this.stop();
                this.start();
            }
        }
    }
    /** No-op — no Google credentials needed */
    setCredentials(_path) { }
    // =========================================================================
    // Lifecycle
    // =========================================================================
    start() {
        if (this.isActive)
            return;
        this.shouldReconnect = true;
        this.reconnectAttempts = 0;
        this.connect();
    }
    stop() {
        this.shouldReconnect = false;
        this.clearTimers();
        if (this.ws) {
            try {
                // Send Deepgram's graceful close message
                if (this.ws.readyState === ws_1.default.OPEN) {
                    this.ws.send(JSON.stringify({ type: 'CloseStream' }));
                }
            }
            catch {
                // Ignore send errors during shutdown
            }
            this.ws.close();
            this.ws = null;
        }
        this.isActive = false;
        this.isConnecting = false;
        this.buffer = [];
        console.log('[DeepgramStreaming] Stopped');
    }
    // =========================================================================
    // Audio Data
    // =========================================================================
    write(chunk) {
        if (!this.isActive)
            return;
        if (!this.ws || this.ws.readyState !== ws_1.default.OPEN) {
            this.buffer.push(chunk);
            if (this.buffer.length > 500)
                this.buffer.shift(); // Cap buffer size
            if (!this.isConnecting && this.shouldReconnect && !this.reconnectTimer) {
                console.log('[DeepgramStreaming] WS not ready. Lazy connecting on new audio...');
                this.connect();
            }
            return;
        }
        this.ws.send(chunk);
    }
    // =========================================================================
    // WebSocket Connection
    // =========================================================================
    connect() {
        if (this.isConnecting)
            return;
        this.isConnecting = true;
        const url = `wss://api.deepgram.com/v1/listen` +
            `?model=${this.model}` +
            `&encoding=linear16` +
            `&sample_rate=${this.sampleRate}` +
            `&channels=${this.numChannels}` +
            `&language=${this.languageCode}` +
            `&smart_format=true` +
            `&interim_results=true` +
            `&keepalive=true`;
        console.log(`[DeepgramStreaming] Connecting (model=${this.model}, lang=${this.languageCode}, rate=${this.sampleRate}, ch=${this.numChannels})...`);
        this.ws = new ws_1.default(url, {
            headers: {
                Authorization: `Token ${this.apiKey}`,
            },
        });
        this.ws.on('open', () => {
            this.isActive = true;
            this.isConnecting = false;
            this.reconnectAttempts = 0;
            console.log('[DeepgramStreaming] Connected');
            // Send buffered audio
            while (this.buffer.length > 0) {
                const chunk = this.buffer.shift();
                if (chunk && this.ws?.readyState === ws_1.default.OPEN) {
                    this.ws.send(chunk);
                }
            }
            // Start keep-alive pings
            this.startKeepAlive();
        });
        this.ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data.toString());
                // Deepgram response structure:
                // { type: "Results", channel: { alternatives: [{ transcript, confidence }] }, is_final }
                if (msg.type !== 'Results')
                    return;
                const transcript = msg.channel?.alternatives?.[0]?.transcript;
                if (!transcript)
                    return;
                this.emit('transcript', {
                    text: transcript,
                    isFinal: msg.is_final ?? false,
                    confidence: msg.channel?.alternatives?.[0]?.confidence ?? 1.0,
                });
            }
            catch (err) {
                console.error('[DeepgramStreaming] Parse error:', err);
            }
        });
        this.ws.on('error', (err) => {
            console.error('[DeepgramStreaming] WebSocket error:', err.message);
            this.emit('error', err);
        });
        this.ws.on('close', (code, reason) => {
            // Do not force isActive=false; let write() trigger reconnect if isActive is still true
            this.isConnecting = false;
            this.clearKeepAlive();
            console.log(`[DeepgramStreaming] Closed (code=${code}, reason=${reason.toString()})`);
            // Auto-reconnect on unexpected close (excluding silence timeout 1000)
            if (this.shouldReconnect && code !== 1000) {
                this.scheduleReconnect();
            }
        });
    }
    // =========================================================================
    // Reconnection
    // =========================================================================
    scheduleReconnect() {
        if (!this.shouldReconnect)
            return;
        const delay = Math.min(RECONNECT_BASE_DELAY_MS * Math.pow(2, this.reconnectAttempts), RECONNECT_MAX_DELAY_MS);
        this.reconnectAttempts++;
        console.log(`[DeepgramStreaming] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (this.shouldReconnect) {
                this.connect();
            }
        }, delay);
    }
    // =========================================================================
    // Keep-alive
    // =========================================================================
    startKeepAlive() {
        this.clearKeepAlive();
        this.keepAliveTimer = setInterval(() => {
            if (this.ws?.readyState === ws_1.default.OPEN) {
                try {
                    // Send KeepAlive JSON instead of raw ping frame for Deepgram API idle prevention
                    this.ws.send(JSON.stringify({ type: 'KeepAlive' }));
                }
                catch {
                    // Ignore errors
                }
            }
        }, KEEPALIVE_INTERVAL_MS);
    }
    clearKeepAlive() {
        if (this.keepAliveTimer) {
            clearInterval(this.keepAliveTimer);
            this.keepAliveTimer = null;
        }
    }
    clearTimers() {
        this.clearKeepAlive();
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }
}
exports.DeepgramStreamingSTT = DeepgramStreamingSTT;
//# sourceMappingURL=DeepgramStreamingSTT.js.map