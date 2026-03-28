"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleSTT = void 0;
const speech_1 = require("@google-cloud/speech");
const events_1 = require("events");
const languages_1 = require("../config/languages");
/**
 * GoogleSTT
 *
 * Manages a bi-directional streaming connection to Google Speech-to-Text.
 * Mirrors the logic previously in Swift:
 * - Handles infinite stream limits by restarting periodically (though less critical for short calls).
 * - Manages authentication via GOOGLE_APPLICATION_CREDENTIALS.
 * - Parses intermediate and final results.
 */
class GoogleSTT extends events_1.EventEmitter {
    client;
    stream = null; // Stream type is complex in google-cloud libs
    isStreaming = false;
    isActive = false;
    // Config
    encoding = 'LINEAR16';
    sampleRateHertz = 16000;
    audioChannelCount = 1; // Default to Mono
    languageCode = 'en-US';
    alternativeLanguageCodes = ['en-IN', 'en-GB']; // Default fallbacks
    constructor() {
        super();
        // ... (credentials setup) ...
        // Note: In production, credentials are set by main.ts via process.env.GOOGLE_APPLICATION_CREDENTIALS
        // or passed explicitly to setCredentials(). We do not load .env files here to avoid ASAR path issues.
        const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
        if (!credentialsPath) {
            console.error('[GoogleSTT] Missing GOOGLE_APPLICATION_CREDENTIALS in environment. Checked CWD:', process.cwd());
        }
        else {
            console.log(`[GoogleSTT] Using credentials from: ${credentialsPath}`);
        }
        this.client = new speech_1.SpeechClient({
            keyFilename: credentialsPath
        });
    }
    setCredentials(keyFilePath) {
        console.log(`[GoogleSTT] Updating credentials to: ${keyFilePath}`);
        process.env.GOOGLE_APPLICATION_CREDENTIALS = keyFilePath;
        this.client = new speech_1.SpeechClient({
            keyFilename: keyFilePath
        });
    }
    setSampleRate(rate) {
        if (this.sampleRateHertz === rate)
            return;
        console.log(`[GoogleSTT] Updating Sample Rate to: ${rate}Hz`);
        this.sampleRateHertz = rate;
        if (this.isStreaming || this.isActive) {
            console.warn('[GoogleSTT] Config changed while active. Restarting stream...');
            this.stop();
            this.start();
        }
    }
    /**
     * No-op for GoogleSTT — Google handles VAD server-side.
     * This method exists for interface consistency with RestSTT so that
     * main.ts can call notifySpeechEnded() without type-casting to `any`.
     */
    notifySpeechEnded() {
        // Intentionally empty. Google STT detects speech boundaries server-side.
    }
    setAudioChannelCount(count) {
        if (this.audioChannelCount === count)
            return;
        console.log(`[GoogleSTT] Updating Channel Count to: ${count}`);
        this.audioChannelCount = count;
        if (this.isStreaming || this.isActive) {
            console.warn('[GoogleSTT] Config changed while active. Restarting stream...');
            this.stop();
            this.start();
        }
    }
    pendingLanguageChange;
    setRecognitionLanguage(key) {
        // Debounce to prevent rapid restarts (e.g. scrolling through list)
        if (this.pendingLanguageChange) {
            clearTimeout(this.pendingLanguageChange);
        }
        this.pendingLanguageChange = setTimeout(() => {
            const config = languages_1.RECOGNITION_LANGUAGES[key];
            if (!config) {
                console.warn(`[GoogleSTT] Unknown language key: ${key}`);
                return;
            }
            console.log(`[GoogleSTT] Updating recognition language to: ${key} (${config.bcp47})`);
            // Update state
            this.languageCode = config.bcp47;
            // Handle variants (English specifically)
            if ('alternates' in config) {
                this.alternativeLanguageCodes = config.alternates;
            }
            else {
                this.alternativeLanguageCodes = [];
            }
            console.log('[GoogleSTT] Primary:', this.languageCode);
            if (this.alternativeLanguageCodes.length > 0) {
                console.log('[GoogleSTT] Alternates:', this.alternativeLanguageCodes.join(', '));
            }
            // Restart if active
            if (this.isStreaming || this.isActive) {
                console.log('[GoogleSTT] Language changed while active. Restarting stream...');
                this.stop();
                this.start();
            }
            this.pendingLanguageChange = undefined;
        }, 250);
    }
    start() {
        if (this.isActive)
            return;
        this.isActive = true;
        console.log('[GoogleSTT] Starting recognition stream...');
        this.startStream();
    }
    stop() {
        if (!this.isActive)
            return;
        console.log('[GoogleSTT] Stopping stream...');
        this.isActive = false;
        this.isStreaming = false;
        if (this.stream) {
            this.stream.end();
            this.stream.destroy();
            this.stream = null;
        }
    }
    buffer = [];
    isConnecting = false;
    lastConnectAttempt = 0;
    write(audioData) {
        if (!this.isActive)
            return;
        if (!this.isStreaming || !this.stream) {
            // Buffer if we are in connecting state, just started, or closed
            this.buffer.push(audioData);
            if (this.buffer.length > 500)
                this.buffer.shift(); // Cap buffer size
            if (!this.isConnecting) {
                if (Date.now() - this.lastConnectAttempt > 1000) {
                    console.log(`[GoogleSTT] Stream not ready. Lazy connecting on new audio...`);
                    this.startStream();
                }
            }
            return;
        }
        // Safety check to prevent "write after destroyed" error
        if (this.stream.destroyed) {
            this.isStreaming = false;
            this.stream = null;
            this.buffer.push(audioData);
            if (this.buffer.length > 500)
                this.buffer.shift(); // Cap buffer size
            if (!this.isConnecting) {
                if (Date.now() - this.lastConnectAttempt > 1000) {
                    console.log(`[GoogleSTT] Stream destroyed. Lazy reconnecting...`);
                    this.startStream();
                }
            }
            return;
        }
        try {
            // Debug log every ~50th write to avoid spam
            if (Math.random() < 0.02) {
                console.log(`[GoogleSTT] Writing ${audioData.length} bytes to stream`);
            }
            if (this.stream.command && this.stream.command.writable) {
                this.stream.write(audioData);
            }
            else if (this.stream.writable) {
                this.stream.write(audioData);
            }
            else {
                console.warn('[GoogleSTT] Stream not writable!');
            }
        }
        catch (err) {
            console.error('[GoogleSTT] Safe write failed:', err);
            this.isStreaming = false;
        }
    }
    flushBuffer() {
        if (!this.stream)
            return;
        while (this.buffer.length > 0) {
            const data = this.buffer.shift();
            if (data) {
                try {
                    this.stream.write(data);
                }
                catch (e) {
                    console.error('[GoogleSTT] Failed to flush buffer chunk:', e);
                }
            }
        }
    }
    startStream() {
        this.lastConnectAttempt = Date.now();
        this.isStreaming = true;
        this.isConnecting = true;
        this.stream = this.client
            .streamingRecognize({
            config: {
                encoding: this.encoding,
                sampleRateHertz: this.sampleRateHertz,
                audioChannelCount: this.audioChannelCount,
                languageCode: this.languageCode,
                enableAutomaticPunctuation: true,
                model: 'latest_long',
                useEnhanced: true,
                alternativeLanguageCodes: this.alternativeLanguageCodes,
            },
            interimResults: true,
        })
            .on('error', (err) => {
            console.error('[GoogleSTT] Stream error:', err);
            this.emit('error', err);
            this.isConnecting = false;
            this.isStreaming = false;
            this.stream = null;
        })
            .on('end', () => {
            console.log('[GoogleSTT] Stream ended server-side (idle timeout)');
            this.isConnecting = false;
            this.isStreaming = false;
            this.stream = null;
        })
            .on('close', () => {
            console.log('[GoogleSTT] Stream closed server-side');
            this.isConnecting = false;
            this.isStreaming = false;
            this.stream = null;
        })
            .on('data', (data) => {
            // ... (existing data handler)
            if (data.results[0] && data.results[0].alternatives[0]) {
                const result = data.results[0];
                const alt = result.alternatives[0];
                const transcript = alt.transcript;
                const isFinal = result.isFinal;
                if (transcript) {
                    this.emit('transcript', {
                        text: transcript,
                        isFinal,
                        confidence: alt.confidence
                    });
                }
            }
        });
        // Initialize writeable check or wait for 'open'? 
        // gRPC streams are usually writeable immediately.
        // We can flush immediately after creation.
        this.isConnecting = false;
        this.flushBuffer();
        console.log('[GoogleSTT] Stream created. Waiting for events...');
    }
}
exports.GoogleSTT = GoogleSTT;
//# sourceMappingURL=GoogleSTT.js.map
