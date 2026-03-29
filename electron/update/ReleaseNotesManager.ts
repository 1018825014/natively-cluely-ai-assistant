import { net } from "electron";
import { getCommercialConfig } from "../services/CommercialConfig";

export interface ReleaseNoteSection {
    title: string;
    items: string[];
}

export interface ParsedReleaseNotes {
    version: string;
    summary: string;
    sections: ReleaseNoteSection[];
    fullBody: string;
    url: string;
    downloadUrl?: string;
}

interface UpdateFeedPayload {
    version?: string;
    summary?: string;
    sections?: ReleaseNoteSection[];
    fullBody?: string;
    url?: string;
    downloadUrl?: string;
}

export class ReleaseNotesManager {
    private static instance: ReleaseNotesManager;
    private cachedNotes: ParsedReleaseNotes | null = null;

    private constructor() { }

    public static getInstance(): ReleaseNotesManager {
        if (!ReleaseNotesManager.instance) {
            ReleaseNotesManager.instance = new ReleaseNotesManager();
        }
        return ReleaseNotesManager.instance;
    }

    public async fetchReleaseNotes(version: string, forceRefresh = false): Promise<ParsedReleaseNotes | null> {
        if (!forceRefresh && this.cachedNotes && (version === 'latest' || this.cachedNotes.version === version)) {
            return this.cachedNotes;
        }

        const feedUrl = getCommercialConfig().updateFeedUrl;
        try {
            const response = await this.makeRequest(feedUrl);
            if (!response) {
                return null;
            }

            const payload = JSON.parse(response) as UpdateFeedPayload;
            const parsed = this.normalizePayload(payload);
            this.cachedNotes = parsed;
            return parsed;
        } catch (error) {
            console.error("[ReleaseNotesManager] Error fetching release notes:", error);
            return null;
        }
    }

    private normalizePayload(payload: UpdateFeedPayload): ParsedReleaseNotes {
        return {
            version: payload.version || 'latest',
            summary: payload.summary || '',
            sections: Array.isArray(payload.sections) ? payload.sections : [],
            fullBody: payload.fullBody || '',
            url: payload.url || getCommercialConfig().downloadUrl,
            downloadUrl: payload.downloadUrl || getCommercialConfig().downloadUrl,
        };
    }

    private makeRequest(url: string): Promise<string | null> {
        return new Promise((resolve) => {
            const request = net.request(url);

            request.on('response', (response) => {
                if (response.statusCode !== 200) {
                    console.warn(`[ReleaseNotesManager] HTTP ${response.statusCode} for ${url}`);
                    resolve(null);
                    return;
                }

                let data = '';
                response.on('data', (chunk) => {
                    data += chunk.toString();
                });

                response.on('end', () => {
                    resolve(data);
                });

                response.on('error', (err) => {
                    console.error("[ReleaseNotesManager] Stream error:", err);
                    resolve(null);
                });
            });

            request.on('error', (err) => {
                console.error("[ReleaseNotesManager] Request error:", err);
                resolve(null);
            });

            request.end();
        });
    }

    public getCachedNotes(): ParsedReleaseNotes | null {
        return this.cachedNotes;
    }
}
