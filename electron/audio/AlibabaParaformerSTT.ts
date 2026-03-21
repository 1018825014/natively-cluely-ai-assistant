import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { RECOGNITION_LANGUAGES } from '../config/languages';
import { TechnicalGlossaryConfig, normalizeTechnicalGlossaryConfig } from '../stt/TechnicalGlossary';

const ALIBABA_WS_URL = 'wss://dashscope.aliyuncs.com/api-ws/v1/inference';
const KEEPALIVE_INTERVAL_MS = 15_000;
const RECOMMENDED_CHUNK_MS = 100;
const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30_000;

export class AlibabaParaformerSTT extends EventEmitter {
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

    private sampleRate = 16000;
    private numChannels = 1;
    private model = 'paraformer-realtime-v2';
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
        this.sampleRate = rate;
        console.log(`[AlibabaParaformer] Sample rate set to ${rate}`);
    }

    public setAudioChannelCount(count: number): void {
        this.numChannels = count;
        console.log(`[AlibabaParaformer] Channel count set to ${count}`);
    }

    public setRecognitionLanguage(key: string): void {
        const config = RECOGNITION_LANGUAGES[key];
        if (!config) return;

        const nextHints = this.mapLanguageHints(config.iso639);
        const changed = JSON.stringify(nextHints) !== JSON.stringify(this.languageHints);
        this.languageHints = nextHints;

        if (changed && this.isActive) {
            console.log('[AlibabaParaformer] Language hints changed while active. Restarting session...');
            this.restartSession();
        }
    }

    public setTechnicalGlossaryConfig(config?: TechnicalGlossaryConfig | null): void {
        const normalized = normalizeTechnicalGlossaryConfig(config);
        const changed = JSON.stringify(normalized) !== JSON.stringify(this.glossaryConfig);
        this.glossaryConfig = normalized;

        if (changed && this.isActive) {
            console.log('[AlibabaParaformer] Glossary config changed while active. Restarting session...');
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

        const monoChunk = this.ensureMono(chunk);
        const uploadChunks = this.bufferIncomingAudio(monoChunk);

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
            'user-agent': 'natively-stt-compare/1.0',
        };

        if (this.glossaryConfig.alibabaWorkspaceId) {
            headers['X-DashScope-WorkSpace'] = this.glossaryConfig.alibabaWorkspaceId;
        }

        console.log(`[AlibabaParaformer] Connecting (model=${this.model}, rate=${this.sampleRate}, ch=${this.numChannels})...`);

        this.ws = new WebSocket(ALIBABA_WS_URL, { headers });

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
                console.error('[AlibabaParaformer] Failed to parse message:', error);
            }
        });

        this.ws.on('error', (error: Error) => {
            console.error('[AlibabaParaformer] WebSocket error:', error.message);
            this.emit('error', error);
        });

        this.ws.on('close', (code: number, reason: Buffer) => {
            this.taskStarted = false;
            this.isConnecting = false;
            this.clearKeepAlive();
            console.log(`[AlibabaParaformer] Closed (code=${code}, reason=${reason.toString() || 'none'})`);

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

    private sendRunTask(): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        const parameters: Record<string, any> = {
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

        console.log(`[AlibabaParaformer] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`);

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

    private ensureMono(chunk: Buffer): Buffer {
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
        const samplesPerChunk = Math.max(1, Math.round(this.sampleRate * (RECOMMENDED_CHUNK_MS / 1000)));
        return samplesPerChunk * 2;
    }

    private mapLanguageHints(languageCode: string): string[] {
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
