"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FunASRRealtimeSTT = void 0;
const events_1 = require("events");
const ws_1 = __importDefault(require("ws"));
const uuid_1 = require("uuid");
const languages_1 = require("../config/languages");
const TechnicalGlossary_1 = require("../stt/TechnicalGlossary");
const AlibabaHotwordSync_1 = require("../stt/AlibabaHotwordSync");
const FUN_ASR_WS_URL = 'wss://dashscope.aliyuncs.com/api-ws/v1/inference';
const TARGET_SAMPLE_RATE = 16_000;
const KEEPALIVE_INTERVAL_MS = 15_000;
const RECOMMENDED_CHUNK_MS = 100;
const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30_000;
class FunASRRealtimeSTT extends events_1.EventEmitter {
    apiKey;
    ws = null;
    isActive = false;
    shouldReconnect = false;
    isConnecting = false;
    taskStarted = false;
    reconnectAttempts = 0;
    reconnectTimer = null;
    keepAliveTimer = null;
    buffer = [];
    pendingAudioBuffer = Buffer.alloc(0);
    taskId = (0, uuid_1.v4)();
    inputSampleRate = TARGET_SAMPLE_RATE;
    numChannels = 1;
    model = AlibabaHotwordSync_1.FUN_ASR_REALTIME_TARGET_MODEL;
    languageHints = [];
    glossaryConfig = (0, TechnicalGlossary_1.normalizeTechnicalGlossaryConfig)();
    constructor(apiKey) {
        super();
        this.apiKey = apiKey.trim();
    }
    setApiKey(apiKey) {
        this.apiKey = apiKey.trim();
    }
    setSampleRate(rate) {
        this.inputSampleRate = rate;
        console.log(`[FunASRRealtime] Input sample rate set to ${rate}`);
    }
    setAudioChannelCount(count) {
        this.numChannels = count;
        console.log(`[FunASRRealtime] Channel count set to ${count}`);
    }
    setRecognitionLanguage(key) {
        const config = languages_1.RECOGNITION_LANGUAGES[key];
        if (!config)
            return;
        const nextHints = this.mapLanguageHints(config.iso639);
        const changed = JSON.stringify(nextHints) !== JSON.stringify(this.languageHints);
        this.languageHints = nextHints;
        if (changed && this.isActive) {
            console.log('[FunASRRealtime] Language hints changed while active. Restarting session...');
            this.restartSession();
        }
    }
    setTechnicalGlossaryConfig(config) {
        const normalized = (0, TechnicalGlossary_1.normalizeTechnicalGlossaryConfig)(config);
        const changed = JSON.stringify(normalized) !== JSON.stringify(this.glossaryConfig);
        this.glossaryConfig = normalized;
        if (changed && this.isActive) {
            console.log('[FunASRRealtime] Technical glossary changed while active. Restarting session...');
            this.restartSession();
        }
    }
    setCredentials(_path) { }
    notifySpeechEnded() {
        this.flushPendingAudio();
    }
    start() {
        if (this.isActive || this.isConnecting)
            return;
        this.shouldReconnect = true;
        this.reconnectAttempts = 0;
        this.connect();
    }
    stop() {
        this.shouldReconnect = false;
        this.clearTimers();
        this.sendFinishTask();
        if (this.ws) {
            this.ws.removeAllListeners();
            this.ws.close();
            this.ws = null;
        }
        this.isActive = false;
        this.isConnecting = false;
        this.taskStarted = false;
        this.buffer = [];
        this.pendingAudioBuffer = Buffer.alloc(0);
    }
    write(chunk) {
        if (!this.isActive && !this.isConnecting)
            return;
        const pcm16kMono = this.resampleToMono16k(chunk);
        const uploadChunks = this.bufferIncomingAudio(pcm16kMono);
        if (!this.ws || this.ws.readyState !== ws_1.default.OPEN || !this.taskStarted) {
            for (const uploadChunk of uploadChunks) {
                this.buffer.push(uploadChunk);
                if (this.buffer.length > 500) {
                    this.buffer.shift();
                }
            }
            if (!this.isConnecting && this.shouldReconnect && !this.reconnectTimer) {
                this.connect();
            }
            return;
        }
        for (const uploadChunk of uploadChunks) {
            this.ws.send(uploadChunk);
        }
    }
    restartSession() {
        const wasActive = this.shouldReconnect;
        this.stop();
        if (wasActive) {
            this.start();
        }
    }
    connect() {
        if (this.isConnecting)
            return;
        this.isConnecting = true;
        this.taskStarted = false;
        this.taskId = (0, uuid_1.v4)();
        const headers = {
            Authorization: `Bearer ${this.apiKey}`,
            'user-agent': 'natively-funasr-compare/1.0',
        };
        if (this.glossaryConfig.alibabaWorkspaceId) {
            headers['X-DashScope-WorkSpace'] = this.glossaryConfig.alibabaWorkspaceId;
        }
        console.log(`[FunASRRealtime] Connecting (model=${this.model}, inputRate=${this.inputSampleRate}, ch=${this.numChannels})...`);
        this.ws = new ws_1.default(FUN_ASR_WS_URL, { headers });
        this.ws.on('open', () => {
            this.isConnecting = false;
            this.isActive = true;
            this.reconnectAttempts = 0;
            this.sendRunTask();
        });
        this.ws.on('message', (data) => {
            if (typeof data !== 'string' && !(data instanceof Buffer))
                return;
            try {
                const message = JSON.parse(data.toString());
                this.handleMessage(message);
            }
            catch (error) {
                console.error('[FunASRRealtime] Failed to parse message:', error);
            }
        });
        this.ws.on('error', (error) => {
            console.error('[FunASRRealtime] WebSocket error:', error.message);
            this.emit('error', error);
        });
        this.ws.on('close', (code, reason) => {
            this.taskStarted = false;
            this.isConnecting = false;
            this.clearKeepAlive();
            console.log(`[FunASRRealtime] Closed (code=${code}, reason=${reason.toString() || 'none'})`);
            if (this.shouldReconnect && code !== 1000) {
                this.scheduleReconnect();
            }
        });
    }
    handleMessage(message) {
        const event = message?.header?.event;
        switch (event) {
            case 'task-started':
                this.taskStarted = true;
                this.flushBuffer();
                this.startKeepAlive();
                break;
            case 'result-generated': {
                const sentence = message?.payload?.output?.sentence;
                if (!sentence || sentence.heartbeat)
                    return;
                const text = typeof sentence.text === 'string' ? sentence.text.trim() : '';
                if (!text)
                    return;
                this.emit('transcript', {
                    text,
                    isFinal: Boolean(sentence.sentence_end),
                    confidence: 1.0,
                });
                break;
            }
            case 'task-finished':
                console.log('[FunASRRealtime] Task finished');
                break;
            case 'task-failed': {
                const errorMessage = message?.header?.error_message || 'Fun-ASR task failed';
                console.error('[FunASRRealtime] Task failed:', errorMessage);
                this.emit('error', new Error(errorMessage));
                break;
            }
            default:
                break;
        }
    }
    sendRunTask() {
        if (!this.ws || this.ws.readyState !== ws_1.default.OPEN)
            return;
        const parameters = {
            format: 'pcm',
            sample_rate: TARGET_SAMPLE_RATE,
            semantic_punctuation_enabled: true,
            heartbeat: true,
        };
        if (this.languageHints.length > 0) {
            parameters.language_hints = this.languageHints;
        }
        if (this.glossaryConfig.funAsrVocabularyId) {
            parameters.vocabulary_id = this.glossaryConfig.funAsrVocabularyId;
        }
        this.ws.send(JSON.stringify({
            header: {
                action: 'run-task',
                task_id: this.taskId,
                streaming: 'duplex',
            },
            payload: {
                task_group: 'audio',
                task: 'asr',
                function: 'recognition',
                model: this.model,
                parameters,
                input: {},
            },
        }));
    }
    sendFinishTask() {
        if (!this.ws || this.ws.readyState !== ws_1.default.OPEN || !this.taskStarted)
            return;
        this.flushPendingAudio();
        try {
            this.ws.send(JSON.stringify({
                header: {
                    action: 'finish-task',
                    task_id: this.taskId,
                    streaming: 'duplex',
                },
                payload: {
                    input: {},
                },
            }));
        }
        catch {
            // Ignore close-time errors.
        }
    }
    flushBuffer() {
        if (!this.ws || this.ws.readyState !== ws_1.default.OPEN || !this.taskStarted)
            return;
        while (this.buffer.length > 0) {
            const chunk = this.buffer.shift();
            if (!chunk)
                continue;
            this.ws.send(chunk);
        }
        this.flushPendingAudio();
    }
    scheduleReconnect() {
        if (!this.shouldReconnect)
            return;
        const delay = Math.min(RECONNECT_BASE_DELAY_MS * Math.pow(2, this.reconnectAttempts), RECONNECT_MAX_DELAY_MS);
        this.reconnectAttempts += 1;
        console.log(`[FunASRRealtime] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (this.shouldReconnect) {
                this.connect();
            }
        }, delay);
    }
    startKeepAlive() {
        this.clearKeepAlive();
        this.keepAliveTimer = setInterval(() => {
            if (this.ws?.readyState === ws_1.default.OPEN) {
                try {
                    this.ws.send(Buffer.alloc(this.getRecommendedChunkBytes()));
                }
                catch {
                    // Ignore keepalive failures.
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
    bufferIncomingAudio(chunk) {
        if (!chunk.length)
            return [];
        this.pendingAudioBuffer = this.pendingAudioBuffer.length > 0
            ? Buffer.concat([this.pendingAudioBuffer, chunk])
            : Buffer.from(chunk);
        const readyChunks = [];
        const targetBytes = this.getRecommendedChunkBytes();
        while (this.pendingAudioBuffer.length >= targetBytes) {
            readyChunks.push(Buffer.from(this.pendingAudioBuffer.subarray(0, targetBytes)));
            this.pendingAudioBuffer = Buffer.from(this.pendingAudioBuffer.subarray(targetBytes));
        }
        return readyChunks;
    }
    flushPendingAudio() {
        if (!this.pendingAudioBuffer.length)
            return;
        const remainder = this.pendingAudioBuffer;
        this.pendingAudioBuffer = Buffer.alloc(0);
        if (!this.ws || this.ws.readyState !== ws_1.default.OPEN || !this.taskStarted) {
            this.buffer.push(remainder);
            return;
        }
        this.ws.send(remainder);
    }
    getRecommendedChunkBytes() {
        const samplesPerChunk = Math.max(1, Math.round(TARGET_SAMPLE_RATE * (RECOMMENDED_CHUNK_MS / 1000)));
        return samplesPerChunk * 2;
    }
    mapLanguageHints(languageCode) {
        const normalized = languageCode.toLowerCase();
        switch (normalized) {
            case 'zh':
            case 'zh-cn':
                return ['zh'];
            case 'en':
                return ['en'];
            case 'ja':
                return ['ja'];
            default:
                return [];
        }
    }
    resampleToMono16k(chunk) {
        const numSamples = chunk.length / 2;
        const inputS16 = new Int16Array(numSamples);
        for (let i = 0; i < numSamples; i += 1) {
            inputS16[i] = chunk.readInt16LE(i * 2);
        }
        let monoS16;
        if (this.numChannels > 1) {
            const monoLength = Math.floor(inputS16.length / this.numChannels);
            monoS16 = new Int16Array(monoLength);
            for (let i = 0; i < monoLength; i += 1) {
                let sum = 0;
                for (let channel = 0; channel < this.numChannels; channel += 1) {
                    sum += inputS16[i * this.numChannels + channel];
                }
                monoS16[i] = Math.round(sum / this.numChannels);
            }
        }
        else {
            monoS16 = inputS16;
        }
        if (this.inputSampleRate === TARGET_SAMPLE_RATE) {
            return Buffer.from(monoS16.buffer);
        }
        const factor = this.inputSampleRate / TARGET_SAMPLE_RATE;
        const outputLength = Math.max(1, Math.floor(monoS16.length / factor));
        const outputS16 = new Int16Array(outputLength);
        for (let i = 0; i < outputLength; i += 1) {
            outputS16[i] = monoS16[Math.floor(i * factor)];
        }
        return Buffer.from(outputS16.buffer);
    }
}
exports.FunASRRealtimeSTT = FunASRRealtimeSTT;
//# sourceMappingURL=FunASRRealtimeSTT.js.map