// electron/services/OllamaManager.ts
import { spawn, ChildProcess } from 'child_process';
import treeKill from 'tree-kill';

const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434/api/tags';
const DEFAULT_WAIT_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 500;

export class OllamaManager {
    private static instance: OllamaManager;
    private ollamaProcess: ChildProcess | null = null;
    private isAppManaged: boolean = false;
    private ensureRunningPromise: Promise<boolean> | null = null;
    private stopRequested = false;

    private constructor() {}

    public static getInstance(): OllamaManager {
        if (!OllamaManager.instance) {
            OllamaManager.instance = new OllamaManager();
        }
        return OllamaManager.instance;
    }

    /**
     * Initialize the manager. Checks if Ollama is running, starts it if not.
     */
    public async init(): Promise<void> {
        await this.ensureRunning();
    }

    /**
     * Ping the local Ollama server to see if it responds.
     */
    private async checkIsRunning(): Promise<boolean> {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1000); // 1s timeout
            
            const response = await fetch(DEFAULT_OLLAMA_URL, {
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            return response.ok;
        } catch (error) {
            // ECONNREFUSED or timeout means it's not running
            return false;
        }
    }

    /**
     * Ensure Ollama is reachable, starting it if necessary.
     */
    public async ensureRunning(timeoutMs: number = DEFAULT_WAIT_TIMEOUT_MS): Promise<boolean> {
        if (await this.checkIsRunning()) {
            console.log('[OllamaManager] Ollama is already running. App will not manage its lifecycle.');
            this.isAppManaged = false;
            return true;
        }

        if (this.ensureRunningPromise) {
            return this.ensureRunningPromise;
        }

        this.stopRequested = false;
        this.ensureRunningPromise = this.ensureRunningInternal(timeoutMs).finally(() => {
            this.ensureRunningPromise = null;
        });

        return this.ensureRunningPromise;
    }

    /**
     * Spawns the 'ollama serve' command invisibly.
     */
    private startOllama(): boolean {
        try {
            this.isAppManaged = true;
            
            this.ollamaProcess = spawn('ollama', ['serve'], {
                detached: false, // Keep attached to app lifecycle
                windowsHide: true, // Hide terminal on Windows
                stdio: 'ignore' // We don't care about its logs
            });

            this.ollamaProcess.on('error', (err) => {
                console.error('[OllamaManager] Failed to start Ollama. Is it installed?', err.message);
                this.isAppManaged = false;
                this.ollamaProcess = null;
            });

            this.ollamaProcess.on('close', (code) => {
                console.log(`[OllamaManager] Process exited with code ${code}`);
                this.ollamaProcess = null;
            });

            return true;
        } catch (err) {
            console.error('[OllamaManager] Exception while spawning Ollama:', err);
            this.isAppManaged = false;
            return false;
        }
    }

    /**
     * Polls until Ollama responds or times out.
     */
    private async ensureRunningInternal(timeoutMs: number): Promise<boolean> {
        console.log('[OllamaManager] Checking if Ollama is already running...');

        if (await this.checkIsRunning()) {
            console.log('[OllamaManager] Ollama is already running. App will not manage its lifecycle.');
            this.isAppManaged = false;
            return true;
        }

        console.log('[OllamaManager] Ollama not detected. Attempting to start in background...');
        if (!this.ollamaProcess) {
            const started = this.startOllama();
            if (!started) {
                return false;
            }
        }

        const deadline = Date.now() + timeoutMs;
        let attempt = 0;

        while (Date.now() < deadline) {
            if (await this.checkIsRunning()) {
                console.log('[OllamaManager] Successfully connected to Ollama.');
                return true;
            }

            if (this.stopRequested) {
                console.log('[OllamaManager] Stop requested while waiting for Ollama.');
                return false;
            }

            if (this.isAppManaged && !this.ollamaProcess) {
                console.log('[OllamaManager] Managed Ollama process exited before becoming ready.');
                return false;
            }

            attempt += 1;
            if (attempt % 10 === 0) {
                console.log(`[OllamaManager] Waiting for Ollama... (${Math.round((Date.now() - (deadline - timeoutMs)) / 1000)}s elapsed)`);
            }

            await this.sleep(POLL_INTERVAL_MS);
        }

        console.log(`[OllamaManager] Timeout: Failed to connect to Ollama after ${Math.round(timeoutMs / 1000)} seconds.`);
        return false;
    }

    private async sleep(ms: number): Promise<void> {
        await new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * Kills the Ollama process ONLY if this app started it.
     * Called when Electron is quitting.
     */
    public stop(): void {
        this.stopRequested = true;

        if (this.isAppManaged && this.ollamaProcess && this.ollamaProcess.pid) {
            console.log('[OllamaManager] App is quitting. Terminating managed Ollama process tree...');
            try {
                // Use tree-kill to ensure Ollama and all its nested runner processes die
                treeKill(this.ollamaProcess.pid, 'SIGTERM', (err) => {
                    if (err) {
                        console.error('[OllamaManager] Failed to tree-kill Ollama process:', err);
                    } else {
                        console.log('[OllamaManager] Successfully killed Ollama process tree.');
                    }
                });
            } catch (e) {
                console.error('[OllamaManager] Exception during kill:', e);
            }
        }

        this.isAppManaged = false;
        this.ollamaProcess = null;
    }
}
