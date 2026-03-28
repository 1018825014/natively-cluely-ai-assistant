"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CalendarManager = void 0;
const electron_1 = require("electron");
const axios_1 = __importDefault(require("axios"));
const http_1 = __importDefault(require("http"));
const url_1 = __importDefault(require("url"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const events_1 = require("events");
// Configuration
// In a real app, these should be in environment variables or build configs
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "YOUR_CLIENT_ID_HERE";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "YOUR_CLIENT_SECRET_HERE";
const REDIRECT_URI = "http://localhost:11111/auth/callback";
const SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"];
const TOKEN_PATH = path_1.default.join(electron_1.app.getPath('userData'), 'calendar_tokens.enc');
if (GOOGLE_CLIENT_ID === "YOUR_CLIENT_ID_HERE" || GOOGLE_CLIENT_SECRET === "YOUR_CLIENT_SECRET_HERE") {
    console.warn('[CalendarManager] Google OAuth credentials are using defaults. Calendar features will not work until valid credentials are provided via env vars.');
}
class CalendarManager extends events_1.EventEmitter {
    static instance;
    accessToken = null;
    refreshToken = null;
    expiryDate = null;
    isConnected = false;
    updateInterval = null;
    constructor() {
        super();
        // Tokens loaded in init() to ensure safeStorage is ready
    }
    static getInstance() {
        if (!CalendarManager.instance) {
            CalendarManager.instance = new CalendarManager();
        }
        return CalendarManager.instance;
    }
    init() {
        this.loadTokens();
    }
    // =========================================================================
    // Auth Flow
    // =========================================================================
    async startAuthFlow() {
        return new Promise((resolve, reject) => {
            // 1. Create Loopback Server
            const server = http_1.default.createServer(async (req, res) => {
                try {
                    if (req.url?.startsWith('/auth/callback')) {
                        const qs = new url_1.default.URL(req.url, 'http://localhost:11111').searchParams;
                        const code = qs.get('code');
                        const error = qs.get('error');
                        if (error) {
                            res.end('Authentication failed! You can close this window.');
                            server.close();
                            reject(new Error(error));
                            return;
                        }
                        if (code) {
                            res.end('Authentication successful! You can close this window and return to Natively.');
                            server.close();
                            // 2. Exchange code for tokens
                            await this.exchangeCodeForToken(code);
                            resolve();
                        }
                    }
                }
                catch (err) {
                    res.end('Authentication error.');
                    server.close();
                    reject(err);
                }
            });
            server.listen(11111, () => {
                // 3. Open Browser
                const authUrl = this.getAuthUrl();
                electron_1.shell.openExternal(authUrl);
            });
            server.on('error', (err) => {
                reject(err);
            });
        });
    }
    async disconnect() {
        this.accessToken = null;
        this.refreshToken = null;
        this.expiryDate = null;
        this.isConnected = false;
        if (fs_1.default.existsSync(TOKEN_PATH)) {
            fs_1.default.unlinkSync(TOKEN_PATH);
        }
        this.emit('connection-changed', false);
    }
    getConnectionStatus() {
        // We don't store email in tokens usually, but we could fetch it.
        // For now, simpler boolean.
        return { connected: this.isConnected };
    }
    getAuthUrl() {
        const params = new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID,
            redirect_uri: REDIRECT_URI,
            response_type: 'code',
            scope: SCOPES.join(' '),
            access_type: 'offline', // For refresh token
            prompt: 'consent' // Force prompts to ensure we get refresh token
        });
        return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    }
    async exchangeCodeForToken(code) {
        try {
            const response = await axios_1.default.post('https://oauth2.googleapis.com/token', {
                code,
                client_id: GOOGLE_CLIENT_ID,
                client_secret: GOOGLE_CLIENT_SECRET,
                redirect_uri: REDIRECT_URI,
                grant_type: 'authorization_code'
            });
            this.handleTokenResponse(response.data);
        }
        catch (error) {
            console.error('[CalendarManager] Token exchange failed:', error);
            throw error;
        }
    }
    // =========================================================================
    // Refresh Logic (NEW)
    // =========================================================================
    async refreshState() {
        console.log('[CalendarManager] Refreshing state (Reality Reconciliation)...');
        // 1. Reset Soft Heuristics
        // Clear existing reminder timeouts to prevent double scheduling or stale alerts
        this.reminderTimeouts.forEach(t => clearTimeout(t));
        this.reminderTimeouts = [];
        // 2. Calendar Re-sync & Temporal Re-evaluation
        if (this.isConnected) {
            // Force fetch will also re-schedule reminders based on NEW time
            await this.getUpcomingEvents(true);
        }
        else {
            console.log('[CalendarManager] Calendar not connected, skipping fetch.');
        }
        // 3. Emit update to UI
        // We emit 'updated' so the frontend knows to re-fetch via getUpcomingEvents
        // or we could push the data. usually ipcHandlers just call getUpcomingEvents.
        this.emit('events-updated');
    }
    handleTokenResponse(data) {
        this.accessToken = data.access_token;
        if (data.refresh_token) {
            this.refreshToken = data.refresh_token; // Only returned on first consent
        }
        this.expiryDate = Date.now() + (data.expires_in * 1000);
        this.isConnected = true;
        this.saveTokens();
        this.emit('connection-changed', true);
        // Initial fetch
        this.fetchUpcomingEvents();
    }
    async refreshAccessToken() {
        if (!this.refreshToken) {
            throw new Error('No refresh token available');
        }
        try {
            const response = await axios_1.default.post('https://oauth2.googleapis.com/token', {
                client_id: GOOGLE_CLIENT_ID,
                client_secret: GOOGLE_CLIENT_SECRET,
                refresh_token: this.refreshToken,
                grant_type: 'refresh_token'
            });
            this.handleTokenResponse(response.data);
        }
        catch (error) {
            console.error('[CalendarManager] Token refresh failed:', error);
            // If refresh fails (e.g. revoked), disconnect
            this.disconnect();
        }
    }
    // =========================================================================
    // Token Storage (Encrypted)
    // =========================================================================
    saveTokens() {
        if (!electron_1.safeStorage.isEncryptionAvailable()) {
            console.warn('[CalendarManager] Encryption not available, skipping token save');
            return;
        }
        const data = JSON.stringify({
            accessToken: this.accessToken,
            refreshToken: this.refreshToken,
            expiryDate: this.expiryDate
        });
        const encrypted = electron_1.safeStorage.encryptString(data);
        const tmpPath = TOKEN_PATH + '.tmp';
        fs_1.default.writeFileSync(tmpPath, encrypted);
        fs_1.default.renameSync(tmpPath, TOKEN_PATH);
    }
    loadTokens() {
        if (!fs_1.default.existsSync(TOKEN_PATH))
            return;
        try {
            if (!electron_1.safeStorage.isEncryptionAvailable())
                return;
            const encrypted = fs_1.default.readFileSync(TOKEN_PATH);
            const decrypted = electron_1.safeStorage.decryptString(encrypted);
            const data = JSON.parse(decrypted);
            this.accessToken = data.accessToken;
            this.refreshToken = data.refreshToken;
            this.expiryDate = data.expiryDate;
            if (this.accessToken && this.refreshToken) {
                this.isConnected = true;
                // Check expiry
                if (this.expiryDate && Date.now() >= this.expiryDate) {
                    this.refreshAccessToken();
                }
            }
        }
        catch (error) {
            console.error('[CalendarManager] Failed to load tokens:', error);
        }
    }
    // =========================================================================
    // Reminders
    // =========================================================================
    reminderTimeouts = [];
    scheduleReminders(events) {
        // Clear existing
        this.reminderTimeouts.forEach(t => clearTimeout(t));
        this.reminderTimeouts = [];
        const now = Date.now();
        events.forEach(event => {
            const startStr = event.startTime;
            if (!startStr)
                return;
            const startTime = new Date(startStr).getTime();
            // Reminder time: 2 minutes before
            const reminderTime = startTime - (2 * 60 * 1000);
            if (reminderTime > now) {
                const delay = reminderTime - now;
                // Only schedule if within next 24h (which fetch already limits)
                if (delay < 24 * 60 * 60 * 1000) {
                    const timeout = setTimeout(() => {
                        this.showNotification(event);
                    }, delay);
                    this.reminderTimeouts.push(timeout);
                }
            }
        });
    }
    showNotification(event) {
        const { Notification } = require('electron');
        const notif = new Notification({
            title: 'Meeting starting soon',
            body: `"${event.title}" starts in 2 minutes. Start Natively?`,
            actions: [
                { type: 'button', text: 'Start Meeting' },
                { type: 'button', text: 'Dismiss' }
            ],
            sound: true
        });
        notif.on('action', (event_unused, index) => {
            if (index === 0) {
                // Start Meeting
                // We need to tell the main process to open window and start meeting
                // Ideally we emit an event that AppState listens to
                this.emit('start-meeting-requested', event);
            }
        });
        notif.on('click', () => {
            // Just open window
            this.emit('open-requested');
        });
        notif.show();
    }
    // =========================================================================
    // Fetch Logic
    // =========================================================================
    async getUpcomingEvents(force = false) {
        if (!this.isConnected || !this.accessToken)
            return [];
        // Check expiry
        if (this.expiryDate && Date.now() >= this.expiryDate - 60000) {
            await this.refreshAccessToken();
        }
        const events = await this.fetchEventsInternal();
        this.scheduleReminders(events);
        return events;
    }
    async fetchEventsInternal() {
        if (!this.accessToken)
            return [];
        const now = new Date();
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        try {
            const response = await axios_1.default.get('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
                headers: {
                    Authorization: `Bearer ${this.accessToken}`
                },
                params: {
                    timeMin: now.toISOString(),
                    timeMax: tomorrow.toISOString(),
                    singleEvents: true,
                    orderBy: 'startTime'
                }
            });
            const items = response.data.items || [];
            return items
                .filter((item) => {
                // Filter: >= 5 mins, no all-day
                if (!item.start.dateTime || !item.end.dateTime)
                    return false; // All-day events have .date instead of .dateTime
                const start = new Date(item.start.dateTime).getTime();
                const end = new Date(item.end.dateTime).getTime();
                const durationMins = (end - start) / 60000;
                return durationMins >= 5;
            })
                .map((item) => ({
                id: item.id,
                title: item.summary || '(No Title)',
                startTime: item.start.dateTime,
                endTime: item.end.dateTime,
                link: this.resolveMeetingLink(item),
                source: 'google'
            }));
        }
        catch (error) {
            console.error('[CalendarManager] Failed to fetch events:', error);
            return [];
        }
    }
    // Intelligent Link Extraction
    resolveMeetingLink(item) {
        // 1. Prefer explicit Hangout link (Google Meet) if valid
        if (item.hangoutLink)
            return item.hangoutLink;
        // 2. Parse description for other providers
        if (!item.description)
            return undefined;
        return this.extractMeetingLink(item.description);
    }
    extractMeetingLink(description) {
        // Regex for common meeting providers
        // Matches zoom.us, teams.microsoft.com, meet.google.com, webex.com
        const providerRegex = /(https?:\/\/(?:[a-z0-9-]+\.)?(?:zoom\.us|teams\.microsoft\.com|meet\.google\.com|webex\.com)\/[^\s<>"']+)/gi;
        const matches = description.match(providerRegex);
        if (matches && matches.length > 0) {
            // Deduplicate
            const unique = [...new Set(matches)];
            // Return the first valid provider link
            return unique[0];
        }
        // Fallback: Generic URL (less strict, but riskier)
        // const genericUrlRegex = /(https?:\/\/[^\s<>"']+)/g;
        // ... avoided to prevent picking up random links like "docs.google.com"
        return undefined;
    }
    // Background fetcher could go here if needed
    async fetchUpcomingEvents() {
        // wrapper to just cache or trigger updates
        return this.getUpcomingEvents();
    }
}
exports.CalendarManager = CalendarManager;
//# sourceMappingURL=CalendarManager.js.map
