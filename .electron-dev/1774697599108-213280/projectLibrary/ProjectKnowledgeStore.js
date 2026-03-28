"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectKnowledgeStore = void 0;
const path_1 = __importDefault(require("path"));
const crypto_1 = require("crypto");
function clampProjectCount(value) {
    const numeric = Number(value || 3);
    return Math.min(5, Math.max(1, Number.isFinite(numeric) ? Math.round(numeric) : 3));
}
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
function emptyFactCard(title, summary) {
    return {
        title,
        summary,
        responsibilities: [],
        techStack: [],
        modules: [],
        metrics: [],
        highlights: [],
        keywords: [],
    };
}
function mapProjectRow(row) {
    return {
        id: row.id,
        title: row.title,
        summary: row.summary || "",
        factCard: safeJsonParse(row.fact_card_json, emptyFactCard(row.title, row.summary || "")),
        isActive: Boolean(row.is_active),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        assetCount: Number(row.asset_count || 0),
        chunkCount: Number(row.chunk_count || 0),
    };
}
function mapAssetRow(row) {
    return {
        id: row.id,
        projectId: row.project_id,
        kind: row.kind,
        name: row.name,
        sourcePath: row.source_path,
        status: row.status,
        metadata: safeJsonParse(row.metadata_json, {}),
        rawText: row.raw_text || "",
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        chunkCount: Number(row.chunk_count || 0),
    };
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
        if (this.getSetting("resume_project_count", null) === null) {
            this.setSetting("resume_project_count", 3);
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
    touchProjects(projectIds) {
        const uniqueIds = Array.from(new Set(projectIds.filter(Boolean)));
        if (!uniqueIds.length)
            return;
        const update = this.db.prepare(`UPDATE project_library_projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`);
        for (const projectId of uniqueIds) {
            update.run(projectId);
        }
    }
    clearAllProjects() {
        this.db.prepare(`DELETE FROM project_library_projects`).run();
        this.setSetting("active_project_ids", []);
        this.setSetting("last_evidence_hits", []);
    }
    deleteProject(projectId) {
        this.deleteProjects([projectId]);
    }
    deleteProjects(projectIds) {
        const uniqueIds = Array.from(new Set(projectIds.filter(Boolean)));
        if (!uniqueIds.length)
            return;
        const del = this.db.prepare(`DELETE FROM project_library_projects WHERE id = ?`);
        const tx = this.db.transaction(() => {
            for (const projectId of uniqueIds) {
                del.run(projectId);
            }
        });
        tx();
        const remainingIds = new Set(this.listProjects().map((project) => project.id));
        const filteredActive = this.getActiveProjectIds().filter((projectId) => remainingIds.has(projectId));
        this.setActiveProjectIds(filteredActive);
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
    setPreferredResumeProjectCount(projectCount) {
        this.setSetting("resume_project_count", clampProjectCount(projectCount));
    }
    getPreferredResumeProjectCount() {
        return clampProjectCount(this.getSetting("resume_project_count", 3));
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
        return row ? mapProjectRow(row) : null;
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
        return rows.map(mapProjectRow);
    }
    getAsset(assetId) {
        const row = this.db
            .prepare(`
        SELECT
          a.*,
          COUNT(DISTINCT c.id) AS chunk_count
        FROM project_library_assets a
        LEFT JOIN project_library_chunks c ON c.asset_id = a.id
        WHERE a.id = ?
        GROUP BY a.id
      `)
            .get(assetId);
        return row ? mapAssetRow(row) : null;
    }
    listAssets(projectId) {
        const rows = this.db
            .prepare(`
        SELECT
          a.*,
          COUNT(DISTINCT c.id) AS chunk_count
        FROM project_library_assets a
        LEFT JOIN project_library_chunks c ON c.asset_id = a.id
        WHERE a.project_id = ?
        GROUP BY a.id
        ORDER BY a.updated_at DESC, a.created_at DESC
      `)
            .all(projectId);
        return rows.map(mapAssetRow);
    }
    listAssetsByKind(kind) {
        const rows = kind
            ? this.db
                .prepare(`
            SELECT
              a.*,
              COUNT(DISTINCT c.id) AS chunk_count
            FROM project_library_assets a
            LEFT JOIN project_library_chunks c ON c.asset_id = a.id
            WHERE a.kind = ?
            GROUP BY a.id
            ORDER BY a.updated_at DESC, a.created_at DESC
          `)
                .all(kind)
            : this.db
                .prepare(`
            SELECT
              a.*,
              COUNT(DISTINCT c.id) AS chunk_count
            FROM project_library_assets a
            LEFT JOIN project_library_chunks c ON c.asset_id = a.id
            GROUP BY a.id
            ORDER BY a.updated_at DESC, a.created_at DESC
          `)
                .all();
        return rows.map(mapAssetRow);
    }
    listRepos(projectId) {
        const assets = this.listAssets(projectId);
        const grouped = new Map();
        for (const asset of assets) {
            if (asset.kind !== "repo" && asset.kind !== "code_file")
                continue;
            const repoRoot = asset.metadata?.repoRoot || (asset.kind === "repo" ? asset.sourcePath : null);
            if (!repoRoot)
                continue;
            const existing = grouped.get(repoRoot) || {
                repoRoot,
                repoName: asset.metadata?.repoName || path_1.default.basename(repoRoot),
                sourcePath: asset.sourcePath,
                repoAssetId: undefined,
                codeFileCount: 0,
                totalAssets: 0,
            };
            existing.totalAssets += 1;
            if (asset.kind === "code_file") {
                existing.codeFileCount += 1;
            }
            if (asset.kind === "repo") {
                existing.repoAssetId = asset.id;
                existing.sourcePath = asset.sourcePath;
                existing.repoName = asset.metadata?.repoName || asset.name || existing.repoName;
            }
            grouped.set(repoRoot, existing);
        }
        return Array.from(grouped.values()).sort((a, b) => a.repoName.localeCompare(b.repoName));
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
        this.touchProjects([projectId]);
        return this.getAsset(assetId);
    }
    replaceAssetChunks(assetId, asset, chunks) {
        const existing = this.db
            .prepare(`SELECT id, project_id, kind, name, source_path, metadata_json FROM project_library_assets WHERE id = ?`)
            .get(assetId);
        if (!existing)
            return null;
        const projectId = existing.project_id;
        const mergedMetadata = asset.metadata ?? safeJsonParse(existing.metadata_json, {});
        const replace = this.db.transaction(() => {
            this.db.prepare(`DELETE FROM project_library_chunks WHERE asset_id = ?`).run(assetId);
            this.db
                .prepare(`
          UPDATE project_library_assets
          SET kind = ?, name = ?, source_path = ?, status = 'ready', raw_text = ?, metadata_json = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `)
                .run(asset.kind || existing.kind, asset.name || existing.name, asset.sourcePath === undefined ? existing.source_path : asset.sourcePath, asset.rawText, JSON.stringify(mergedMetadata), assetId);
            const insertChunk = this.db.prepare(`
        INSERT INTO project_library_chunks (
          id, project_id, asset_id, chunk_index, chunk_type, content, embedding_json, token_count, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
            chunks.forEach((chunk, index) => {
                insertChunk.run((0, crypto_1.randomUUID)(), projectId, assetId, index, chunk.chunkType, chunk.content, chunk.embedding ? JSON.stringify(chunk.embedding) : null, chunk.content.split(/\s+/).filter(Boolean).length, JSON.stringify(chunk.metadata || {}));
            });
        });
        replace();
        this.touchProjects([projectId]);
        return this.getAsset(assetId);
    }
    deleteAsset(assetId) {
        this.deleteAssets([assetId]);
    }
    deleteAssets(assetIds) {
        const uniqueIds = Array.from(new Set(assetIds.filter(Boolean)));
        if (!uniqueIds.length)
            return;
        const projectIds = [];
        const selectProject = this.db.prepare(`SELECT project_id FROM project_library_assets WHERE id = ?`);
        const remove = this.db.prepare(`DELETE FROM project_library_assets WHERE id = ?`);
        const tx = this.db.transaction(() => {
            for (const assetId of uniqueIds) {
                const row = selectProject.get(assetId);
                if (row?.project_id)
                    projectIds.push(row.project_id);
                remove.run(assetId);
            }
        });
        tx();
        this.touchProjects(projectIds);
    }
    deleteDocumentsByKind(kind) {
        const assets = this.listAssetsByKind(kind);
        this.deleteAssets(assets.map((asset) => asset.id));
    }
    getProjectFacts(projectId) {
        return this.getProject(projectId)?.factCard || null;
    }
    searchEvidence(projectIds, query, queryEmbedding, limit) {
        const activeProjects = projectIds.length
            ? projectIds
            : this.listProjects()
                .filter((project) => project.isActive)
                .map((project) => project.id);
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
        const validProjectIds = new Set(projects.map((project) => project.id));
        const preferredActiveIds = this.getActiveProjectIds().filter((projectId) => validProjectIds.has(projectId));
        const activeProjectIds = preferredActiveIds.length
            ? preferredActiveIds
            : projects.filter((project) => project.isActive).map((project) => project.id);
        if (preferredActiveIds.length !== this.getActiveProjectIds().length) {
            this.setActiveProjectIds(activeProjectIds);
        }
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
            preferredResumeProjectCount: this.getPreferredResumeProjectCount(),
        };
    }
}
exports.ProjectKnowledgeStore = ProjectKnowledgeStore;
//# sourceMappingURL=ProjectKnowledgeStore.js.map