"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SystemAudioCapture = void 0;
const events_1 = require("events");
let NativeModule = null;
try {
    NativeModule = require('natively-audio');
}
catch (e) {
    console.error('[SystemAudioCapture] Failed to load native module:', e);
}
const { SystemAudioCapture: RustAudioCapture } = NativeModule || {};
class SystemAudioCapture extends events_1.EventEmitter {
    isRecording = false;
    deviceId = null;
    detectedSampleRate = 48000;
    monitor = null;
    constructor(deviceId) {
        super();
        this.deviceId = deviceId || null;
        if (!RustAudioCapture) {
            console.error('[SystemAudioCapture] Rust class implementation not found.');
        }
        else {
            // LAZY INIT: Don't create native monitor here - it causes 1-second audio mute + quality drop
            // The monitor will be created in start() when the meeting actually begins
            console.log(`[SystemAudioCapture] Initialized (lazy). Device ID: ${this.deviceId || 'default'}`);
        }
    }
    getSampleRate() {
        if (this.monitor && typeof this.monitor.get_sample_rate === 'function') {
            const nativeRate = this.monitor.get_sample_rate();
            if (nativeRate !== this.detectedSampleRate) {
                console.log(`[SystemAudioCapture] Real native rate: ${nativeRate}`);
                this.detectedSampleRate = nativeRate;
            }
            return nativeRate;
        }
        return this.detectedSampleRate;
    }
    /**
     * Start capturing audio
     */
    start() {
        if (this.isRecording)
            return;
        if (!RustAudioCapture) {
            console.error('[SystemAudioCapture] Cannot start: Rust module missing');
            return;
        }
        // LAZY INIT: Create monitor here when meeting starts (not in constructor)
        // This prevents the 1-second audio mute + quality drop at app launch
        if (!this.monitor) {
            console.log('[SystemAudioCapture] Creating native monitor (lazy init)...');
            try {
                this.monitor = new RustAudioCapture(this.deviceId);
            }
            catch (e) {
                console.error('[SystemAudioCapture] Failed to create native monitor:', e);
                this.emit('error', e);
                return;
            }
        }
        try {
            console.log('[SystemAudioCapture] Starting native capture...');
            // Fetch real sample rate as soon as monitor starts
            if (typeof this.monitor.get_sample_rate === 'function') {
                this.detectedSampleRate = this.monitor.get_sample_rate();
                console.log(`[SystemAudioCapture] Detected sample rate: ${this.detectedSampleRate}`);
            }
            this.monitor.start((chunk) => {
                // The native module sends raw PCM bytes (Uint8Array) via zero-copy napi::Buffer
                if (chunk && chunk.length > 0) {
                    const buffer = Buffer.from(chunk);
                    this.emit('data', buffer);
                }
            }, () => {
                // Speech-ended callback from Rust SilenceSuppressor
                this.emit('speech_ended');
            });
            this.isRecording = true;
            this.emit('start');
        }
        catch (error) {
            console.error('[SystemAudioCapture] Failed to start:', error);
            this.emit('error', error);
        }
    }
    /**
     * Stop capturing
     */
    stop() {
        if (!this.isRecording)
            return;
        console.log('[SystemAudioCapture] Stopping capture...');
        try {
            this.monitor?.stop();
        }
        catch (e) {
            console.error('[SystemAudioCapture] Error stopping:', e);
        }
        // Destroy monitor so it's recreated fresh on next start()
        this.monitor = null;
        this.isRecording = false;
        this.emit('stop');
    }
}
exports.SystemAudioCapture = SystemAudioCapture;
//# sourceMappingURL=SystemAudioCapture.js.map