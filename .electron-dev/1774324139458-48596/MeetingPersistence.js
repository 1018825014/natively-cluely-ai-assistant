"use strict";
// MeetingPersistence.ts
// Handles meeting lifecycle: stop, save, and recovery.
// Extracted from IntelligenceManager to decouple DB operations from LLM orchestration.
Object.defineProperty(exports, "__esModule", { value: true });
exports.MeetingPersistence = void 0;
const DatabaseManager_1 = require("./db/DatabaseManager");
const llm_1 = require("./llm");
const crypto = require('crypto');
class MeetingPersistence {
    session;
    llmHelper;
    constructor(session, llmHelper) {
        this.session = session;
        this.llmHelper = llmHelper;
    }
    /**
     * Stops the meeting immediately, snapshots data, and triggers background processing.
     * Returns immediately so UI can switch.
     */
    async stopMeeting() {
        console.log('[MeetingPersistence] Stopping meeting and queueing save...');
        // 0. Force-save any pending interim transcript
        this.session.flushInterimTranscript();
        // 1. Snapshot valid data BEFORE resetting
        const durationMs = Date.now() - this.session.getSessionStartTime();
        if (durationMs < 1000) {
            console.log("Meeting too short, ignoring.");
            this.session.reset();
            return;
        }
        const snapshot = {
            transcript: [...this.session.getFullTranscript()],
            usage: [...this.session.getFullUsage()],
            startTime: this.session.getSessionStartTime(),
            durationMs: durationMs,
            context: this.session.getFullSessionContext()
        };
        // 2. Reset state immediately so new meeting can start or UI is clean
        this.session.reset();
        const meetingId = crypto.randomUUID();
        this.processAndSaveMeeting(snapshot, meetingId).catch(err => {
            console.error('[MeetingPersistence] Background processing failed:', err);
        });
        // 4. Initial Save (Placeholder)
        const minutes = Math.floor(durationMs / 60000);
        const seconds = ((durationMs % 60000) / 1000).toFixed(0);
        const durationStr = `${minutes}:${Number(seconds) < 10 ? '0' : ''}${seconds}`;
        const placeholder = {
            id: meetingId,
            title: "Processing...",
            date: new Date().toISOString(),
            duration: durationStr,
            summary: "Generating summary...",
            detailedSummary: { actionItems: [], keyPoints: [] },
            transcript: snapshot.transcript,
            usage: snapshot.usage,
            isProcessed: false
        };
        try {
            DatabaseManager_1.DatabaseManager.getInstance().saveMeeting(placeholder, snapshot.startTime, durationMs);
            // Notify Frontend
            const wins = require('electron').BrowserWindow.getAllWindows();
            wins.forEach((w) => w.webContents.send('meetings-updated'));
        }
        catch (e) {
            console.error("Failed to save placeholder", e);
        }
    }
    /**
     * Heavy lifting: LLM Title, Summary, and DB Write
     */
    async processAndSaveMeeting(data, meetingId) {
        let title = "Untitled Session";
        let summaryData = { actionItems: [], keyPoints: [] };
        const metadata = this.session.getMeetingMetadata();
        let calendarEventId;
        let source = 'manual';
        if (metadata) {
            if (metadata.title)
                title = metadata.title;
            if (metadata.calendarEventId)
                calendarEventId = metadata.calendarEventId;
            if (metadata.source)
                source = metadata.source;
        }
        try {
            // Generate Title (only if not set by calendar)
            if (!metadata || !metadata.title) {
                const titlePrompt = `请为这段会议内容生成一个简洁的 3-6 个词标题。只输出标题文本，不要加引号，也不要加任何口语化前缀。`;
                const groqTitlePrompt = llm_1.GROQ_TITLE_PROMPT;
                const generatedTitle = await this.llmHelper.generateMeetingSummary(titlePrompt, data.context.substring(0, 5000), groqTitlePrompt);
                if (generatedTitle)
                    title = generatedTitle.replace(/["*]/g, '').trim();
            }
            // Generate Structured Summary
            if (data.transcript.length > 2) {
                const summaryPrompt = `你是一名安静的会议总结助手。请把这段对话整理成简洁的内部会议笔记。
    
    RULES:
    - 不要编造上下文里没有的信息
    - 如果能从讨论中自然推出隐含的行动项或下一步，可以适度补出
    - 不要解释或定义提到的概念
    - 不要使用“这场会议主要讨论了……”这类空泛套话
    - 不要提到 transcript、AI 或 summary 之类字样
    - 语气不要像 AI 助手
    - 整体风格像资深 PM 写给自己的内部笔记
    
    STYLE: 冷静、中性、专业、便于快速浏览。使用短 bullet，不要出现子 bullet。
    
    只返回合法 JSON（不要加 markdown 代码块）：
    {
      "overview": "1-2 sentence description of what was discussed",
      "keyPoints": ["3-6 specific bullets - each = one concrete topic or point discussed"],
      "actionItems": ["specific next steps, assigned tasks, or implied follow-ups. If absolutely none found, return empty array"]
    }`;
                const groqSummaryPrompt = llm_1.GROQ_SUMMARY_JSON_PROMPT;
                const generatedSummary = await this.llmHelper.generateMeetingSummary(summaryPrompt, data.context.substring(0, 10000), groqSummaryPrompt);
                if (generatedSummary) {
                    const jsonMatch = generatedSummary.match(/```json\n([\s\S]*?)\n```/) || [null, generatedSummary];
                    const jsonStr = (jsonMatch[1] || generatedSummary).trim();
                    try {
                        summaryData = JSON.parse(jsonStr);
                    }
                    catch (e) {
                        console.error("Failed to parse summary JSON", e);
                    }
                }
            }
            else {
                console.log("Transcript too short for summary generation.");
            }
        }
        catch (e) {
            console.error("Error generating meeting metadata", e);
        }
        try {
            const minutes = Math.floor(data.durationMs / 60000);
            const seconds = ((data.durationMs % 60000) / 1000).toFixed(0);
            const durationStr = `${minutes}:${Number(seconds) < 10 ? '0' : ''}${seconds}`;
            const meetingData = {
                id: meetingId,
                title: title,
                date: new Date().toISOString(),
                duration: durationStr,
                summary: "See detailed summary",
                detailedSummary: summaryData,
                transcript: data.transcript,
                usage: data.usage,
                calendarEventId: calendarEventId,
                source: source,
                isProcessed: true
            };
            DatabaseManager_1.DatabaseManager.getInstance().saveMeeting(meetingData, data.startTime, data.durationMs);
            // Clear metadata
            this.session.clearMeetingMetadata();
            // Notify Frontend to refresh list
            const wins = require('electron').BrowserWindow.getAllWindows();
            wins.forEach((w) => w.webContents.send('meetings-updated'));
        }
        catch (error) {
            console.error('[MeetingPersistence] Failed to save meeting:', error);
        }
    }
    /**
     * Recover meetings that were started but not fully processed (e.g. app crash)
     */
    async recoverUnprocessedMeetings() {
        console.log('[MeetingPersistence] Checking for unprocessed meetings...');
        const db = DatabaseManager_1.DatabaseManager.getInstance();
        const unprocessed = db.getUnprocessedMeetings();
        if (unprocessed.length === 0) {
            console.log('[MeetingPersistence] No unprocessed meetings found.');
            return;
        }
        console.log(`[MeetingPersistence] Found ${unprocessed.length} unprocessed meetings. recovering...`);
        for (const m of unprocessed) {
            try {
                const details = db.getMeetingDetails(m.id);
                if (!details)
                    continue;
                console.log(`[MeetingPersistence] Recovering meeting ${m.id}...`);
                const context = details.transcript?.map(t => {
                    const label = t.speaker === 'interviewer' ? 'INTERVIEWER' :
                        t.speaker === 'user' ? 'ME' : 'ASSISTANT';
                    return `[${label}]: ${t.text}`;
                }).join('\n') || "";
                const parts = details.duration.split(':');
                const durationMs = ((parseInt(parts[0]) * 60) + parseInt(parts[1])) * 1000;
                const startTime = new Date(details.date).getTime();
                const snapshot = {
                    transcript: details.transcript,
                    usage: details.usage,
                    startTime: startTime,
                    durationMs: durationMs,
                    context: context
                };
                await this.processAndSaveMeeting(snapshot, m.id);
                console.log(`[MeetingPersistence] Recovered meeting ${m.id}`);
            }
            catch (e) {
                console.error(`[MeetingPersistence] Failed to recover meeting ${m.id}`, e);
            }
        }
    }
}
exports.MeetingPersistence = MeetingPersistence;
//# sourceMappingURL=MeetingPersistence.js.map