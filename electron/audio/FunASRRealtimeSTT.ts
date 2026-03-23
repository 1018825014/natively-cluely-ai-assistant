import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { RECOGNITION_LANGUAGES } from '../config/languages';
import { normalizeTechnicalGlossaryConfig, TechnicalGlossaryConfig } from '../stt/TechnicalGlossary';
import { FUN_ASR_REALTIME_TARGET_MODEL } from '../stt/AlibabaHotwordSync';

const FUN_ASR_WS_URL = 'wss://dashscope.aliyuncs.com/api-ws/v1/inference';
const TARGET_SAMPLE_RATE = 16_000;
const KEEPALIVE_INTERVAL_MS = 15_000;
const RECOMMENDED_CHUNK_MS = 100;
const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30_000;

export class FunASRRealtimeSTT extends EventEmitter {
    private apiKey: string;
    private ws: WebSocket | null = null;
    private isActive = false;
    private shouldReconnect = false;
    private isConnecting = false;
    private taskStarted = false;
    private reconnectAttempts = 0;
    private reconnectTimer: NodeJS.Timeout | null = null;
    private keepAliveTimer: NodeJS.Timeout | null = null;
    private buffer: Buffer[] = [];
    private pendingAudioBuffer = Buffer.alloc(0);
    private taskId = uuidv4();

    private inputSampleRate = TARGET_SAMPLE_RATE;
    private numChannels = 1;
    private model = FUN_ASR_REALTIME_TARGET_MODEL;
    private languageHints: string[] = [];
    private glossaryConfig: TechnicalGlossaryConfig = normalizeTechnicalGlossaryConfig();

    constructor(apiKey: string) {
        super();
        this.apiKey = apiKey.trim();
    }

    public setApiKey(apiKey: string): void {
        this.apiKey = apiKey.trim();
    }

    public setSampleRate(rate: number): void {
        this.inputSampleRate = rate;
        console.log(`[FunASRRealtime] Input sample rate set to ${rate}`);
    }

    public setAudioChannelCount(count: number): void {
        this.numChannels = count;
        console.log(`[FunASRRealtime] Channel count set to ${count}`);
    }

    public setRecognitionLanguage(key: string): void {
        const config = RECOGNITION_LANGUAGES[key];
        if (!config) return;

        const nextHints = this.mapLanguageHints(config.iso639);
        const changed = JSON.stringify(nextHints) !== JSON.stringify(this.languageHints);
        this.languageHints = nextHints;

        if (changed && this.isActive) {
            console.log('[FunASRRealtime] Language hints changed while active. Restarting session...');
            this.restartSession();
        }
    }

    public setTechnicalGlossaryConfig(config?: TechnicalGlossaryConfig | null): void {
        const normalized = normalizeTechnicalGlossaryConfig(config);
        const changed = JSON.stringify(normalized) !== JSON.stringify(this.glossaryConfig);
        this.glossaryConfig = normalized;

        if (changed && this.isActive) {
            console.log('[FunASRRealtime] Technical glossary changed while active. Restarting session...');
            this.restartSession();
        }
    }

    public setCredentials(_path: string): void { }

    public notifySpeechEnded(): void {
        this.flushPendingAudio();
    }

    public start(): void {
        if (this.isActive || this.isConnecting) return;
        this.shouldReconnect = true;
        this.reconnectAttempts = 0;
        this.connect();
    }

    public stop(): void {
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

    public write(chunk: Buffer): void {
        if (!this.isActive && !this.isConnecting) return;

        const pcm16kMono = this.resampleToMono16k(chunk);
        const uploadChunks = this.bufferIncomingAudio(pcm16kMono);

        if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.taskStarted) {
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

    private restartSession(): void {
        const wasActive = this.shouldReconnect;
        this.stop();
        if (wasActive) {
            this.start();
        }
    }

    private connect(): void {
        if (this.isConnecting) return;

        this.isConnecting = true;
        this.taskStarted = false;
        this.taskId = uuidv4();

        const headers: Record<string, string> = {
            Authorization: `Bearer ${this.apiKey}`,
            'user-agent': 'natively-funasr-compare/1.0',
        };

        if (this.glossaryConfig.alibabaWorkspaceId) {
            headers['X-DashScope-WorkSpace'] = this.glossaryConfig.alibabaWorkspaceId;
        }

        console.log(`[FunASRRealtime] Connecting (model=${this.model}, inputRate=${this.inputSampleRate}, ch=${this.numChannels})...`);

        this.ws = new WebSocket(FUN_ASR_WS_URL, { headers });

        this.ws.on('open', () => {
            this.isConnecting = false;
            this.isActive = true;
            this.reconnectAttempts = 0;
            this.sendRunTask();
        });

        this.ws.on('message', (data: WebSocket.RawData) => {
            if (typeof data !== 'string' && !(data instanceof Buffer)) return;

            try {
                const message = JSON.parse(data.toString());
                this.handleMessage(message);
            } catch (error) {
                console.error('[FunASRRealtime] Failed to parse message:', error);
            }
        });

        this.ws.on('error', (error: Error) => {
            console.error('[FunASRRealtime] WebSocket error:', error.message);
            this.emit('error', error);
        });

        this.ws.on('close', (code: number, reason: Buffer) => {
            this.taskStarted = false;
            this.isConnecting = false;
            this.clearKeepAlive();
            console.log(`[FunASRRealtime] Closed (code=${code}, reason=${reason.toString() || 'none'})`);

            if (this.shouldReconnect && code !== 1000) {
                this.scheduleReconnect();
            }
        });
    }

    private handleMessage(message: any): void {
        const event = message?.header?.event;

        switch (event) {
            case 'task-started':
                this.taskStarted = true;
                this.flushBuffer();
                this.startKeepAlive();
                break;
            case 'result-generated': {
                const sentence = message?.payload?.output?.sentence;
                if (!sentence || sentence.heartbeat) return;

                const text = typeof sentence.text === 'string' ? sentence.text.trim() : '';
                if (!text) return;

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

    private sendRunTask(): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        const parameters: Record<string, any> = {
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

    private sendFinishTask(): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.taskStarted) return;
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
        } catch {
            // Ignore close-time errors.
        }
    }

    private flushBuffer(): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.taskStarted) return;

        while (this.buffer.length > 0) {
            const chunk = this.buffer.shift();
            if (!chunk) continue;
            this.ws.send(chunk);
        }

        this.flushPendingAudio();
    }

    private scheduleReconnect(): void {
        if (!this.shouldReconnect) return;

        const delay = Math.min(
            RECONNECT_BASE_DELAY_MS * Math.pow(2, this.reconnectAttempts),
            RECONNECT_MAX_DELAY_MS
        );
        this.reconnectAttempts += 1;

        console.log(`[FunASRRealtime] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`);

        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (this.shouldReconnect) {
                this.connect();
            }
        }, delay);
    }

    private startKeepAlive(): void {
        this.clearKeepAlive();
        this.keepAliveTimer = setInterval(() => {
            if (this.ws?.readyState === WebSocket.OPEN) {
                try {
                    this.ws.send(Buffer.alloc(this.getRecommendedChunkBytes()));
                } catch {
                    // Ignore keepalive failures.
                }
            }
        }, KEEPALIVE_INTERVAL_MS);
    }

    private clearKeepAlive(): void {
        if (this.keepAliveTimer) {
            clearInterval(this.keepAliveTimer);
            this.keepAliveTimer = null;
        }
    }

    private clearTimers(): void {
        this.clearKeepAlive();
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    private bufferIncomingAudio(chunk: Buffer): Buffer[] {
        if (!chunk.length) return [];

        this.pendingAudioBuffer = this.pendingAudioBuffer.length > 0
            ? Buffer.concat([this.pendingAudioBuffer, chunk])
            : Buffer.from(chunk);

        const readyChunks: Buffer[] = [];
        const targetBytes = this.getRecommendedChunkBytes();

        while (this.pendingAudioBuffer.length >= targetBytes) {
            readyChunks.push(Buffer.from(this.pendingAudioBuffer.subarray(0, targetBytes)));
            this.pendingAudioBuffer = Buffer.from(this.pendingAudioBuffer.subarray(targetBytes));
        }

        return readyChunks;
    }

    private flushPendingAudio(): void {
        if (!this.pendingAudioBuffer.length) return;

        const remainder = this.pendingAudioBuffer;
        this.pendingAudioBuffer = Buffer.alloc(0);

        if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.taskStarted) {
            this.buffer.push(remainder);
            return;
        }

        this.ws.send(remainder);
    }

    private getRecommendedChunkBytes(): number {
        const samplesPerChunk = Math.max(1, Math.round(TARGET_SAMPLE_RATE * (RECOMMENDED_CHUNK_MS / 1000)));
        return samplesPerChunk * 2;
    }

    private mapLanguageHints(languageCode: string): string[] {
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

    private resampleToMono16k(chunk: Buffer): Buffer {
        const numSamples = chunk.length / 2;
        const inputS16 = new Int16Array(numSamples);
        for (let i = 0; i < numSamples; i += 1) {
            inputS16[i] = chunk.readInt16LE(i * 2);
        }

        let monoS16: Int16Array;
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
        } else {
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
