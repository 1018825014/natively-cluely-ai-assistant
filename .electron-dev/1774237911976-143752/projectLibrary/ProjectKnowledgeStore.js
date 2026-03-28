"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectKnowledgeStore = void 0;
const crypto_1 = require("crypto");
function normalizeList(values) {
    if (!Array.isArray(values))
        return [];
    return values
        .map((value) => String(value || "").trim())
        .filter(Boolean)
        .slice(0, 24);
}
function safeJsonParse(value, fallback) {
    if (!value)
        return fallback;
    try {
        return JSON.parse(value);
    }
    catch {
        return fallback;
    }
}
function cosineSimilarity(a, b) {
    if (!a.length || !b.length || a.length !== b.length)
        return 0;
    let dot = 0;
    let magA = 0;
    let magB = 0;
    for (let i = 0; i < a.length; i += 1) {
        dot += a[i] * b[i];
        magA += a[i] * a[i];
        magB += b[i] * b[i];
    }
    if (!magA || !magB)
        return 0;
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}
function tokenize(text) {
    return (text.toLowerCase().match(/[a-z0-9_./-]{2,}/g) || []).slice(0, 32);
}
function keywordScore(query, content) {
    const normalizedQuery = query.trim().toLowerCase();
    const normalizedContent = content.toLowerCase();
    let score = 0;
    if (normalizedQuery && normalizedContent.includes(normalizedQuery)) {
        score += 1;
    }
    const terms = tokenize(query);
    if (!terms.length)
        return score;
    const overlap = terms.filter((term) => normalizedContent.includes(term)).length;
    score += overlap / Math.max(terms.length, 1);
    return score;
}
function buildFactCardContent(project) {
    const card = project.factCard;
    return [
        `Project: ${project.title}`,
        card.role ? `Role: ${card.role}` : "",
        card.summary ? `Summary: ${card.summary}` : "",
        card.responsibilities.length ? `Responsibilities: ${card.responsibilities.join("; ")}` : "",
        card.techStack.length ? `Tech Stack: ${card.techStack.join(", ")}` : "",
        card.modules.length ? `Modules: ${card.modules.join(", ")}` : "",
        card.metrics.length ? `Metrics: ${card.metrics.join("; ")}` : "",
        card.highlights.length ? `Highlights: ${card.highlights.join("; ")}` : "",
        card.keywords.length ? `Keywords: ${card.keywords.join(", ")}` : "",
    ]
        .filter(Boolean)
        .join("\n");
}
class ProjectKnowledgeStore {
    db;
    constructor(db) {
        this.db = db;
        this.db.pragma("foreign_keys = ON");
        this.init();
    }
    init() {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS project_library_projects (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        summary TEXT,
        fact_card_json TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS project_library_assets (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        source_path TEXT,
        status TEXT NOT NULL,
        raw_text TEXT,
        metadata_json TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(project_id) REFERENCES project_library_projects(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS project_library_chunks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        asset_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        chunk_type TEXT NOT NULL,
        content TEXT NOT NULL,
        embedding_json TEXT,
        token_count INTEGER DEFAULT 0,
        metadata_json TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(project_id) REFERENCES project_library_projects(id) ON DELETE CASCADE,
        FOREIGN KEY(asset_id) REFERENCES project_library_assets(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS project_library_settings (
        key TEXT PRIMARY KEY,
        value_json TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_project_library_assets_project ON project_library_assets(project_id);
      CREATE INDEX IF NOT EXISTS idx_project_library_chunks_project ON project_library_chunks(project_id);
      CREATE INDEX IF NOT EXISTS idx_project_library_chunks_asset ON project_library_chunks(asset_id);
    `);
        if (this.getSetting("answer_mode", null) === null) {
            this.setSetting("answer_mode", "strict");
        }
        if (this.getSetting("knowledge_enabled", null) === null) {
            this.setSetting("knowledge_enabled", false);
        }
        if (this.getSetting("jd_bias_enabled", null) === null) {
            this.setSetting("jd_bias_enabled", false);
        }
    }
    setSetting(key, value) {
        this.db
            .prepare(`
        INSERT INTO project_library_settings (key, value_json)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json
      `)
            .run(key, JSON.stringify(value));
    }
    getSetting(key, fallback) {
        const row = this.db.prepare(`SELECT value_json FROM project_library_settings WHERE key = ?`).get(key);
        return safeJsonParse(row?.value_json, fallback);
    }
    clearAllProjects() {
        this.db.prepare(`DELETE FROM project_library_projects`).run();
        this.setSetting("active_project_ids", []);
        this.setSetting("last_evidence_hits", []);
    }
    setIdentity(identity) {
        this.setSetting("identity", identity);
    }
    getIdentity() {
        return this.getSetting("identity", {});
    }
    setSkills(skills) {
        this.setSetting("skills", normalizeList(skills));
    }
    getSkills() {
        return this.getSetting("skills", []);
    }
    setKnowledgeEnabled(enabled) {
        this.setSetting("knowledge_enabled", enabled);
    }
    isKnowledgeEnabled() {
        return Boolean(this.getSetting("knowledge_enabled", false));
    }
    setAnswerMode(mode) {
        this.setSetting("answer_mode", mode);
    }
    getAnswerMode() {
        const mode = this.getSetting("answer_mode", "strict");
        return mode === "polished" ? "polished" : "strict";
    }
    setActiveProjectIds(projectIds) {
        this.setSetting("active_project_ids", Array.from(new Set(projectIds)));
    }
    getActiveProjectIds() {
        return this.getSetting("active_project_ids", []);
    }
    setActiveJD(jd) {
        this.setSetting("active_jd", jd);
    }
    getActiveJD() {
        return this.getSetting("active_jd", null);
    }
    setJDBiasEnabled(enabled) {
        this.setSetting("jd_bias_enabled", enabled);
    }
    isJDBiasEnabled() {
        return Boolean(this.getSetting("jd_bias_enabled", false));
    }
    setLastEvidenceHits(hits) {
        this.setSetting("last_evidence_hits", hits.slice(0, 6));
    }
    getLastEvidenceHits() {
        return this.getSetting("last_evidence_hits", []);
    }
    upsertProject(input) {
        const id = input.id || (0, crypto_1.randomUUID)();
        const summary = input.summary || input.factCard.summary || "";
        const existing = input.id
            ? this.db.prepare(`SELECT id FROM project_library_projects WHERE id = ?`).get(input.id)
            : undefined;
        if (existing) {
            this.db
                .prepare(`
          UPDATE project_library_projects
          SET title = ?, summary = ?, fact_card_json = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `)
                .run(input.title, summary, JSON.stringify(input.factCard), input.isActive === false ? 0 : 1, id);
        }
        else {
            this.db
                .prepare(`
          INSERT INTO project_library_projects (id, title, summary, fact_card_json, is_active)
          VALUES (?, ?, ?, ?, ?)
        `)
                .run(id, input.title, summary, JSON.stringify(input.factCard), input.isActive === false ? 0 : 1);
        }
        return this.getProject(id);
    }
    getProject(projectId) {
        const row = this.db
            .prepare(`
        SELECT
          p.*,
          COUNT(DISTINCT a.id) AS asset_count,
          COUNT(DISTINCT c.id) AS chunk_count
        FROM project_library_projects p
        LEFT JOIN project_library_assets a ON a.project_id = p.id
        LEFT JOIN project_library_chunks c ON c.project_id = p.id
        WHERE p.id = ?
        GROUP BY p.id
      `)
            .get(projectId);
        if (!row)
            return null;
        return {
            id: row.id,
            title: row.title,
            summary: row.summary || "",
            factCard: safeJsonParse(row.fact_card_json, {
                title: row.title,
                summary: row.summary || "",
                responsibilities: [],
                techStack: [],
                modules: [],
                metrics: [],
                highlights: [],
                keywords: [],
            }),
            isActive: Boolean(row.is_active),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            assetCount: Number(row.asset_count || 0),
            chunkCount: Number(row.chunk_count || 0),
        };
    }
    listProjects() {
        const rows = this.db
            .prepare(`
        SELECT
          p.*,
          COUNT(DISTINCT a.id) AS asset_count,
          COUNT(DISTINCT c.id) AS chunk_count
        FROM project_library_projects p
        LEFT JOIN project_library_assets a ON a.project_id = p.id
        LEFT JOIN project_library_chunks c ON c.project_id = p.id
        GROUP BY p.id
        ORDER BY p.updated_at DESC, p.created_at DESC
      `)
            .all();
        return rows.map((row) => ({
            id: row.id,
            title: row.title,
            summary: row.summary || "",
            factCard: safeJsonParse(row.fact_card_json, {
                title: row.title,
                summary: row.summary || "",
                responsibilities: [],
                techStack: [],
                modules: [],
                metrics: [],
                highlights: [],
                keywords: [],
            }),
            isActive: Boolean(row.is_active),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            assetCount: Number(row.asset_count || 0),
            chunkCount: Number(row.chunk_count || 0),
        }));
    }
    replaceProjectChunks(projectId, asset, chunks) {
        const assetId = (0, crypto_1.randomUUID)();
        this.db
            .prepare(`
        INSERT INTO project_library_assets (id, project_id, kind, name, source_path, status, raw_text, metadata_json)
        VALUES (?, ?, ?, ?, ?, 'ready', ?, ?)
      `)
            .run(assetId, projectId, asset.kind, asset.name, asset.sourcePath, asset.rawText, JSON.stringify(asset.metadata || {}));
        const insertChunk = this.db.prepare(`
      INSERT INTO project_library_chunks (
        id, project_id, asset_id, chunk_index, chunk_type, content, embedding_json, token_count, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        chunks.forEach((chunk, index) => {
            insertChunk.run((0, crypto_1.randomUUID)(), projectId, assetId, index, chunk.chunkType, chunk.content, chunk.embedding ? JSON.stringify(chunk.embedding) : null, chunk.content.split(/\s+/).filter(Boolean).length, JSON.stringify(chunk.metadata || {}));
        });
        this.db
            .prepare(`UPDATE project_library_projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
            .run(projectId);
    }
    deleteDocumentsByKind(kind) {
        const assetIds = this.db.prepare(`SELECT id FROM project_library_assets WHERE kind = ?`).all(kind);
        const deleteChunks = this.db.prepare(`DELETE FROM project_library_chunks WHERE asset_id = ?`);
        const deleteAsset = this.db.prepare(`DELETE FROM project_library_assets WHERE id = ?`);
        const tx = this.db.transaction(() => {
            for (const asset of assetIds) {
                deleteChunks.run(asset.id);
                deleteAsset.run(asset.id);
            }
        });
        tx();
    }
    getProjectFacts(projectId) {
        return this.getProject(projectId)?.factCard || null;
    }
    searchEvidence(projectIds, query, queryEmbedding, limit) {
        const activeProjects = projectIds.length ? projectIds : this.listProjects().filter((project) => project.isActive).map((project) => project.id);
        if (!activeProjects.length)
            return [];
        const placeholders = activeProjects.map(() => "?").join(", ");
        const rows = this.db
            .prepare(`
        SELECT
          c.*,
          p.title AS project_title,
          a.name AS asset_name,
          a.kind AS asset_kind
        FROM project_library_chunks c
        INNER JOIN project_library_projects p ON p.id = c.project_id
        INNER JOIN project_library_assets a ON a.id = c.asset_id
        WHERE c.project_id IN (${placeholders})
      `)
            .all(...activeProjects);
        const hits = [];
        const projectMap = new Map(this.listProjects().map((project) => [project.id, project]));
        for (const projectId of activeProjects) {
            const project = projectMap.get(projectId);
            if (!project)
                continue;
            const content = buildFactCardContent(project);
            const factScore = keywordScore(query, `${project.title}\n${content}`) + 0.25;
            hits.push({
                id: `project-card-${project.id}`,
                projectId: project.id,
                projectTitle: project.title,
                label: "Project Card",
                sourceType: "project_card",
                score: factScore,
                content,
                snippet: content.slice(0, 280),
                metadata: {
                    projectId: project.id,
                },
            });
        }
        for (const row of rows) {
            const keyword = keywordScore(query, `${row.asset_name}\n${row.content}`);
            const embedding = safeJsonParse(row.embedding_json, null);
            const semantic = queryEmbedding && Array.isArray(embedding) ? cosineSimilarity(queryEmbedding, embedding) : 0;
            const score = keyword * 0.45 + semantic * 0.55 + (row.asset_kind === "code_file" ? 0.02 : 0);
            hits.push({
                id: row.id,
                projectId: row.project_id,
                projectTitle: row.project_title,
                label: row.asset_name,
                sourceType: row.asset_kind === "code_file" || row.asset_kind === "repo" ? "code" : "document",
                score,
                content: row.content,
                snippet: row.content.slice(0, 280),
                metadata: {
                    assetKind: row.asset_kind,
                    chunkType: row.chunk_type,
                    ...(safeJsonParse(row.metadata_json, {})),
                },
            });
        }
        return hits
            .filter((hit) => hit.score > 0.08)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }
    buildState() {
        const projects = this.listProjects();
        const activeProjectIds = this.getActiveProjectIds().length
            ? this.getActiveProjectIds()
            : projects.filter((project) => project.isActive).map((project) => project.id);
        return {
            identity: this.getIdentity(),
            skills: this.getSkills(),
            projects,
            activeProjectIds,
            answerMode: this.getAnswerMode(),
            profileMode: this.isKnowledgeEnabled(),
            hasActiveJD: Boolean(this.getActiveJD()),
            activeJD: this.getActiveJD(),
            jdBiasEnabled: this.isJDBiasEnabled(),
            lastEvidenceHits: this.getLastEvidenceHits(),
        };
    }
}
exports.ProjectKnowledgeStore = ProjectKnowledgeStore;
//# sourceMappingURL=ProjectKnowledgeStore.js.map