"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlibabaParaformerSTT = void 0;
const events_1 = require("events");
const ws_1 = __importDefault(require("ws"));
const uuid_1 = require("uuid");
const languages_1 = require("../config/languages");
const TechnicalGlossary_1 = require("../stt/TechnicalGlossary");
const ALIBABA_WS_URL = 'wss://dashscope.aliyuncs.com/api-ws/v1/inference';
const KEEPALIVE_INTERVAL_MS = 15_000;
const RECOMMENDED_CHUNK_MS = 100;
const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30_000;
class AlibabaParaformerSTT extends events_1.EventEmitter {
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
    sampleRate = 16000;
    numChannels = 1;
    model = 'paraformer-realtime-v2';
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
        this.sampleRate = rate;
        console.log(`[AlibabaParaformer] Sample rate set to ${rate}`);
    }
    setAudioChannelCount(count) {
        this.numChannels = count;
        console.log(`[AlibabaParaformer] Channel count set to ${count}`);
    }
    setRecognitionLanguage(key) {
        const config = languages_1.RECOGNITION_LANGUAGES[key];
        if (!config)
            return;
        const nextHints = this.mapLanguageHints(config.iso639);
        const changed = JSON.stringify(nextHints) !== JSON.stringify(this.languageHints);
        this.languageHints = nextHints;
        if (changed && this.isActive) {
            console.log('[AlibabaParaformer] Language hints changed while active. Restarting session...');
            this.restartSession();
        }
    }
    setTechnicalGlossaryConfig(config) {
        const normalized = (0, TechnicalGlossary_1.normalizeTechnicalGlossaryConfig)(config);
        const changed = JSON.stringify(normalized) !== JSON.stringify(this.glossaryConfig);
        this.glossaryConfig = normalized;
        if (changed && this.isActive) {
            console.log('[AlibabaParaformer] Glossary config changed while active. Restarting session...');
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
        const monoChunk = this.ensureMono(chunk);
        const uploadChunks = this.bufferIncomingAudio(monoChunk);
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
            'user-agent': 'natively-stt-compare/1.0',
        };
        if (this.glossaryConfig.alibabaWorkspaceId) {
            headers['X-DashScope-WorkSpace'] = this.glossaryConfig.alibabaWorkspaceId;
        }
        console.log(`[AlibabaParaformer] Connecting (model=${this.model}, rate=${this.sampleRate}, ch=${this.numChannels})...`);
        this.ws = new ws_1.default(ALIBABA_WS_URL, { headers });
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
                console.error('[AlibabaParaformer] Failed to parse message:', error);
            }
        });
        this.ws.on('error', (error) => {
            console.error('[AlibabaParaformer] WebSocket error:', error.message);
            this.emit('error', error);
        });
        this.ws.on('close', (code, reason) => {
            this.taskStarted = false;
            this.isConnecting = false;
            this.clearKeepAlive();
            console.log(`[AlibabaParaformer] Closed (code=${code}, reason=${reason.toString() || 'none'})`);
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
                console.log('[AlibabaParaformer] Task finished');
                break;
            case 'task-failed': {
                const errorMessage = message?.header?.error_message || 'Alibaba Paraformer task failed';
                console.error('[AlibabaParaformer] Task failed:', errorMessage);
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
            sample_rate: this.sampleRate,
            disfluency_removal_enabled: false,
            punctuation_prediction_enabled: true,
            inverse_text_normalization_enabled: true,
            semantic_punctuation_enabled: true,
            heartbeat: true,
        };
        if (this.languageHints.length > 0) {
            parameters.language_hints = this.languageHints;
        }
        if (this.glossaryConfig.alibabaVocabularyId) {
            parameters.vocabulary_id = this.glossaryConfig.alibabaVocabularyId;
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
        console.log(`[AlibabaParaformer] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`);
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
    ensureMono(chunk) {
        if (this.numChannels <= 1) {
            return chunk;
        }
        const totalSamples = Math.floor(chunk.length / 2);
        const frameCount = Math.floor(totalSamples / this.numChannels);
        const mixed = Buffer.alloc(frameCount * 2);
        for (let frame = 0; frame < frameCount; frame++) {
            let sum = 0;
            for (let channel = 0; channel < this.numChannels; channel++) {
                const index = (frame * this.numChannels + channel) * 2;
                sum += chunk.readInt16LE(index);
            }
            mixed.writeInt16LE(Math.round(sum / this.numChannels), frame * 2);
        }
        return mixed;
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
        const samplesPerChunk = Math.max(1, Math.round(this.sampleRate * (RECOMMENDED_CHUNK_MS / 1000)));
        return samplesPerChunk * 2;
    }
    mapLanguageHints(languageCode) {
        const normalized = languageCode.toLowerCase();
        switch (normalized) {
            case 'zh':
            case 'zh-cn':
                return ['zh', 'en'];
            case 'en':
                return ['en'];
            case 'ja':
                return ['ja'];
            case 'ko':
                return ['ko'];
            case 'de':
                return ['de'];
            case 'fr':
                return ['fr'];
            case 'ru':
                return ['ru'];
            case 'yue':
                return ['yue'];
            default:
                return [];
        }
    }
}
exports.AlibabaParaformerSTT = AlibabaParaformerSTT;
//# sourceMappingURL=AlibabaParaformerSTT.js.map