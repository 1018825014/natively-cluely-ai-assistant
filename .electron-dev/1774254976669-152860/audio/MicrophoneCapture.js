"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MicrophoneCapture = void 0;
const events_1 = require("events");
// Load the native module
let NativeModule = null;
try {
    NativeModule = require('natively-audio');
}
catch (e) {
    console.error('[MicrophoneCapture] Failed to load native module:', e);
}
const { MicrophoneCapture: RustMicCapture } = NativeModule || {};
class MicrophoneCapture extends events_1.EventEmitter {
    monitor = null;
    isRecording = false;
    deviceId = null;
    constructor(deviceId) {
        super();
        this.deviceId = deviceId || null;
        if (!RustMicCapture) {
            console.error('[MicrophoneCapture] Rust class implementation not found.');
        }
        else {
            console.log(`[MicrophoneCapture] Initialized wrapper. Device ID: ${this.deviceId || 'default'}`);
            try {
                console.log('[MicrophoneCapture] Creating native monitor (Eager Init)...');
                this.monitor = new RustMicCapture(this.deviceId);
            }
            catch (e) {
                console.error('[MicrophoneCapture] Failed to create native monitor:', e);
                // We don't throw here to allow app to start, but start() will fail
            }
        }
    }
    getSampleRate() {
        if (this.monitor && typeof this.monitor.get_sample_rate === 'function') {
            const nativeRate = this.monitor.get_sample_rate();
            console.log(`[MicrophoneCapture] Real native rate: ${nativeRate}`);
            return nativeRate;
        }
        return 48000; // Safe default for most modern mics before native initialization
    }
    /**
     * Start capturing microphone audio
     */
    start() {
        if (this.isRecording)
            return;
        if (!RustMicCapture) {
            console.error('[MicrophoneCapture] Cannot start: Rust module missing');
            return;
        }
        // Monitor should be ready from constructor
        if (!this.monitor) {
            console.log('[MicrophoneCapture] Monitor not initialized. Re-initializing...');
            try {
                this.monitor = new RustMicCapture(this.deviceId);
            }
            catch (e) {
                this.emit('error', e);
                return;
            }
        }
        try {
            console.log('[MicrophoneCapture] Starting native capture...');
            this.monitor.start((chunk) => {
                if (chunk && chunk.length > 0) {
                    // Debug: log occasionally
                    if (Math.random() < 0.05) {
                        console.log(`[MicrophoneCapture] Emitting chunk: ${chunk.length} bytes to JS`);
                    }
                    this.emit('data', Buffer.from(chunk));
                }
            }, () => {
                // Speech-ended callback from Rust SilenceSuppressor
                this.emit('speech_ended');
            });
            this.isRecording = true;
            this.emit('start');
        }
        catch (error) {
            console.error('[MicrophoneCapture] Failed to start:', error);
            this.emit('error', error);
        }
    }
    /**
     * Stop capturing
     */
    stop() {
        if (!this.isRecording)
            return;
        console.log('[MicrophoneCapture] Stopping capture...');
        try {
            this.monitor?.stop();
        }
        catch (e) {
            console.error('[MicrophoneCapture] Error stopping:', e);
        }
        // DO NOT destroy monitor here. Keep it alive for seamless restart.
        // this.monitor = null; 
        this.isRecording = false;
        this.emit('stop');
    }
    destroy() {
        this.stop();
        this.monitor = null;
    }
}
exports.MicrophoneCapture = MicrophoneCapture;
//# sourceMappingURL=MicrophoneCapture.js.map
