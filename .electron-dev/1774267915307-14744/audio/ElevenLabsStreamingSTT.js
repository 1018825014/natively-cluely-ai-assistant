"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ElevenLabsStreamingSTT = void 0;
const events_1 = require("events");
const ws_1 = __importDefault(require("ws"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const languages_1 = require("../config/languages");
const ELEVENLABS_WS_URL = 'wss://api.elevenlabs.io/v1/speech-to-text/realtime';
class ElevenLabsStreamingSTT extends events_1.EventEmitter {
    apiKey;
    ws = null;
    isActive = false;
    shouldReconnect = false;
    reconnectAttempts = 0;
    reconnectTimer = null;
    inputSampleRate = 48000; // what the mic/system audio captures at
    targetSampleRate = 16000; // what ElevenLabs Scribe v2 requires
    buffer = [];
    isConnecting = false;
    isSessionReady = false;
    languageCode = 'en'; // Default to English
    debugWriteStream = null;
    // Chunk buffering properties (250ms @ 16k = 4000 samples)
    pcmAccumulator = [];
    pcmAccumulatorLen = 0;
    SEND_THRESHOLD_SAMPLES = 4000;
    debugMessageCount = 0;
    constructor(apiKey) {
        super();
        this.apiKey = apiKey;
        // Open a debug file only in development to avoid disk fill-up in production
        if (process.env.NODE_ENV === 'development') {
            try {
                const debugPath = path.join(os.homedir(), 'elevenlabs_debug.raw');
                this.debugWriteStream = fs.createWriteStream(debugPath);
                console.log(`[ElevenLabsStreaming] Audio debug stream opened at: ${debugPath}`);
            }
            catch (e) {
                console.error('[ElevenLabsStreaming] Failed to open debug stream:', e);
            }
        }
    }
    setSampleRate(rate) {
        this.inputSampleRate = rate;
        console.log(`[ElevenLabsStreaming] Input sample rate set to ${rate}Hz`);
        // We always downsample to 16000Hz for ElevenLabs
    }
    /** No-op - channel count is expected to be mono by ElevenLabs Scribe */
    setAudioChannelCount(_count) { }
    /** Recognition language - maps Natively key to ISO-639-1 for ElevenLabs */
    setRecognitionLanguage(key) {
        const config = languages_1.RECOGNITION_LANGUAGES[key];
        if (config) {
            const newCode = config.iso639;
            if (this.languageCode !== newCode) {
                console.log(`[ElevenLabsStreaming] Language changed: ${this.languageCode} -> ${newCode}`);
                this.languageCode = newCode;
                if (this.isActive) {
                    console.log('[ElevenLabsStreaming] Restarting session to apply new language...');
                    this.stop();
                    this.start();
                }
            }
        }
    }
    /** No-op - credentials passed via API key */
    setCredentials(_path) { }
    start() {
        if (this.isActive)
            return; // Already active
        if (this.isConnecting)
            return; // Already mid-connect (prevents double-connect race)
        this.shouldReconnect = true;
        this.reconnectAttempts = 0;
        this.connect();
    }
    stop() {
        this.shouldReconnect = false;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws) {
            this.ws.removeAllListeners();
            this.ws.close();
            this.ws = null;
        }
        this.isActive = false;
        this.isConnecting = false;
        this.isSessionReady = false;
        this.buffer = [];
        this.pcmAccumulator = [];
        this.pcmAccumulatorLen = 0;
        if (this.debugWriteStream) {
            this.debugWriteStream.end();
            this.debugWriteStream = null;
        }
        console.log('[ElevenLabsStreaming] Stopped');
    }
    /**
     * Write raw PCM audio data.
     * ElevenLabs WebSocket expects "input_audio_chunk" in base64 16-bit PCM.
     * Note: Input from Natively DSP is 32-bit Float PCM (F32).
     */
    write(chunk) {
        if (!this.isActive)
            return;
        if (!this.ws || this.ws.readyState !== ws_1.default.OPEN || !this.isSessionReady) {
            this.buffer.push(chunk);
            if (this.buffer.length > 500) {
                this.buffer.shift(); // Cap buffer size
                console.warn('[ElevenLabsStreaming] Buffer full — oldest audio chunk dropped.');
            }
            if (!this.isConnecting && this.shouldReconnect && !this.reconnectTimer) {
                console.log('[ElevenLabsStreaming] WS not ready. Lazy connecting on new audio...');
                this.connect();
            }
            return;
        }
        // Snapshot ws reference before async operations to guard against concurrent close
        const ws = this.ws;
        try {
            // The input buffer from the native module is ALREADY 16-bit PCM (Int16LE).
            // Do NOT read it as Float32.
            const inputS16 = new Int16Array(chunk.buffer, chunk.byteOffset, chunk.byteLength / 2);
            let outputS16;
            if (this.inputSampleRate === this.targetSampleRate) {
                // No downsampling needed
                outputS16 = inputS16;
            }
            else {
                // Downsample from inputSampleRate (e.g. 48000) to 16000Hz
                const downsampleFactor = this.inputSampleRate / this.targetSampleRate;
                const outputLength = Math.floor(inputS16.length / downsampleFactor);
                outputS16 = new Int16Array(outputLength);
                for (let i = 0; i < outputLength; i++) {
                    // Simple decimation (take every Nth sample)
                    outputS16[i] = inputS16[Math.floor(i * downsampleFactor)];
                }
            }
            // Write to debug file
            if (this.debugWriteStream) {
                // Use full slice args to avoid copying the whole backing ArrayBuffer
                this.debugWriteStream.write(Buffer.from(outputS16.buffer, outputS16.byteOffset, outputS16.byteLength));
            }
            // Accumulate
            this.pcmAccumulator.push(outputS16);
            this.pcmAccumulatorLen += outputS16.length;
            if (this.pcmAccumulatorLen >= this.SEND_THRESHOLD_SAMPLES) {
                // Combine
                const combined = new Int16Array(this.pcmAccumulatorLen);
                let offset = 0;
                for (const arr of this.pcmAccumulator) {
                    combined.set(arr, offset);
                    offset += arr.length;
                }
                // Reset
                this.pcmAccumulator = [];
                this.pcmAccumulatorLen = 0;
                const base64 = Buffer.from(combined.buffer, combined.byteOffset, combined.byteLength).toString('base64');
                // ElevenLabs Scribe v2 requires fields message_type and audio_base_64
                // Use the snapshot captured earlier to avoid null-dereference from concurrent close
                if (ws && ws.readyState === ws_1.default.OPEN) {
                    ws.send(JSON.stringify({
                        message_type: 'input_audio_chunk',
                        audio_base_64: base64,
                    }));
                }
            }
        }
        catch (err) {
            console.warn('[ElevenLabsStreaming] write failed:', err);
        }
    }
    connect() {
        if (this.isConnecting)
            return;
        this.isConnecting = true;
        this.isSessionReady = false;
        console.log(`[ElevenLabsStreaming] Connecting... key=${this.apiKey?.slice(0, 8)}...`);
        // raw WebSocket URL with parameters
        let url = `${ELEVENLABS_WS_URL}?model_id=scribe_v2_realtime&include_timestamps=true&sample_rate=${this.targetSampleRate}`;
        // Add language hints to prevent regional language hallucinations
        if (this.languageCode) {
            url += `&language_code=${this.languageCode}&include_language_detection=true`;
        }
        console.log(`[ElevenLabsStreaming] Connecting with URL: ${url.replace(this.apiKey, '***')}`);
        this.ws = new ws_1.default(url, {
            headers: {
                'xi-api-key': this.apiKey,
            }
        });
        this.ws.on('open', () => {
            this.isActive = true;
            this.isConnecting = false;
            this.reconnectAttempts = 0;
            console.log('[ElevenLabsStreaming] Connected');
            // Note: ElevenLabs might require waiting for 'session_started' before sending.
            // We'll flush the buffer in 'session_started'.
        });
        this.ws.on('message', (data) => {
            try {
                const rawStr = data.toString();
                if (this.debugMessageCount < 10) {
                    console.log(`[ElevenLabsStreaming] RAW[${this.debugMessageCount}]:`, rawStr);
                    this.debugMessageCount++;
                }
                const msg = JSON.parse(rawStr);
                // Note: The websocket API might use "type" or "message_type"
                const msgType = msg.type || msg.message_type;
                switch (msgType) {
                    case 'session_started':
                        console.log('[ElevenLabsStreaming] Session started:', msg.config);
                        this.isSessionReady = true;
                        // Flush buffered audio now that session is strictly ready
                        while (this.buffer.length > 0) {
                            const chunk = this.buffer.shift();
                            if (chunk) {
                                this.write(chunk);
                            }
                        }
                        break;
                    case 'partial_transcript':
                        if (msg.text) {
                            this.emit('transcript', {
                                text: msg.text,
                                isFinal: false,
                                confidence: 1.0
                            });
                        }
                        break;
                    case 'committed_transcript':
                        if (msg.text) {
                            this.emit('transcript', {
                                text: msg.text,
                                isFinal: true,
                                confidence: 1.0
                            });
                        }
                        break;
                    case 'auth_error':
                        console.error('[ElevenLabsStreaming] Auth error — check key scope/permissions in ElevenLabs dashboard:', msg);
                        this.emit('error', msg);
                        // Stop reconnection loops for auth failures to save API credits
                        this.shouldReconnect = false;
                        if (this.ws) {
                            this.ws.close();
                        }
                        break;
                    default:
                        // Log other messages for debugging (e.g. metadata or unknowns)
                        if (msg.error) {
                            console.error('[ElevenLabsStreaming] Server error:', msg.error);
                            this.emit('error', msg.error);
                        }
                        else {
                            console.log('[ElevenLabsStreaming] Received message:', msgType, Object.keys(msg));
                        }
                }
            }
            catch (err) {
                console.error('[ElevenLabsStreaming] Failed to parse message:', err);
            }
        });
        this.ws.on('close', (code, reason) => {
            // Null out the ws reference immediately to prevent stale reuse
            this.ws = null;
            this.isConnecting = false;
            this.isSessionReady = false;
            console.log(`[ElevenLabsStreaming] Closed: code=${code} reason=${reason}`);
            if (this.shouldReconnect && code !== 1000) {
                this.scheduleReconnect();
            }
            else {
                // If not reconnecting, mark session as truly inactive
                this.isActive = false;
            }
        });
        this.ws.on('error', (err) => {
            console.error('[ElevenLabsStreaming] WS error:', err);
            this.emit('error', err);
        });
    }
    scheduleReconnect() {
        if (!this.shouldReconnect)
            return;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        this.reconnectAttempts++;
        console.log(`[ElevenLabsStreaming] Reconnecting in ${delay}ms...`);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (this.shouldReconnect) {
                this.connect();
            }
        }, delay);
    }
}
exports.ElevenLabsStreamingSTT = ElevenLabsStreamingSTT;
//# sourceMappingURL=ElevenLabsStreamingSTT.js.map
