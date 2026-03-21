import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { EvidenceHit, JDProfile, ProjectFactCard, ProjectLibraryState, ProjectRecord, ResumeIdentity } from "./types";

type SettingKey =
  | "identity"
  | "skills"
  | "knowledge_enabled"
  | "answer_mode"
  | "active_project_ids"
  | "active_jd"
  | "jd_bias_enabled"
  | "last_evidence_hits";

type ChunkRow = {
  id: string;
  project_id: string;
  asset_id: string;
  chunk_index: number;
  chunk_type: string;
  content: string;
  embedding_json: string | null;
  metadata_json: string | null;
  project_title: string;
  asset_name: string;
  asset_kind: string;
};

function normalizeList(values: any): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .slice(0, 24);
}

function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || !b.length || a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (!magA || !magB) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9_./-]{2,}/g) || []).slice(0, 32);
}

function keywordScore(query: string, content: string): number {
  const normalizedQuery = query.trim().toLowerCase();
  const normalizedContent = content.toLowerCase();
  let score = 0;

  if (normalizedQuery && normalizedContent.includes(normalizedQuery)) {
    score += 1;
  }

  const terms = tokenize(query);
  if (!terms.length) return score;

  const overlap = terms.filter((term) => normalizedContent.includes(term)).length;
  score += overlap / Math.max(terms.length, 1);
  return score;
}

function buildFactCardContent(project: ProjectRecord): string {
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

export class ProjectKnowledgeStore {
  constructor(private readonly db: Database.Database) {
    this.db.pragma("foreign_keys = ON");
    this.init();
  }

  private init(): void {
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

  private setSetting(key: SettingKey, value: any): void {
    this.db
      .prepare(`
        INSERT INTO project_library_settings (key, value_json)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json
      `)
      .run(key, JSON.stringify(value));
  }

  private getSetting<T>(key: SettingKey, fallback: T): T {
    const row = this.db.prepare(`SELECT value_json FROM project_library_settings WHERE key = ?`).get(key) as
      | { value_json: string }
      | undefined;
    return safeJsonParse<T>(row?.value_json, fallback);
  }

  public clearAllProjects(): void {
    this.db.prepare(`DELETE FROM project_library_projects`).run();
    this.setSetting("active_project_ids", []);
    this.setSetting("last_evidence_hits", []);
  }

  public setIdentity(identity: ResumeIdentity): void {
    this.setSetting("identity", identity);
  }

  public getIdentity(): ResumeIdentity {
    return this.getSetting("identity", {});
  }

  public setSkills(skills: string[]): void {
    this.setSetting("skills", normalizeList(skills));
  }

  public getSkills(): string[] {
    return this.getSetting("skills", []);
  }

  public setKnowledgeEnabled(enabled: boolean): void {
    this.setSetting("knowledge_enabled", enabled);
  }

  public isKnowledgeEnabled(): boolean {
    return Boolean(this.getSetting("knowledge_enabled", false));
  }

  public setAnswerMode(mode: "strict" | "polished"): void {
    this.setSetting("answer_mode", mode);
  }

  public getAnswerMode(): "strict" | "polished" {
    const mode = this.getSetting<"strict" | "polished">("answer_mode", "strict");
    return mode === "polished" ? "polished" : "strict";
  }

  public setActiveProjectIds(projectIds: string[]): void {
    this.setSetting("active_project_ids", Array.from(new Set(projectIds)));
  }

  public getActiveProjectIds(): string[] {
    return this.getSetting("active_project_ids", []);
  }

  public setActiveJD(jd: JDProfile | null): void {
    this.setSetting("active_jd", jd);
  }

  public getActiveJD(): JDProfile | null {
    return this.getSetting("active_jd", null);
  }

  public setJDBiasEnabled(enabled: boolean): void {
    this.setSetting("jd_bias_enabled", enabled);
  }

  public isJDBiasEnabled(): boolean {
    return Boolean(this.getSetting("jd_bias_enabled", false));
  }

  public setLastEvidenceHits(hits: EvidenceHit[]): void {
    this.setSetting("last_evidence_hits", hits.slice(0, 6));
  }

  public getLastEvidenceHits(): EvidenceHit[] {
    return this.getSetting("last_evidence_hits", []);
  }

  public upsertProject(input: {
    id?: string;
    title: string;
    summary?: string;
    factCard: ProjectFactCard;
    isActive?: boolean;
  }): ProjectRecord {
    const id = input.id || randomUUID();
    const summary = input.summary || input.factCard.summary || "";
    const existing = input.id
      ? (this.db.prepare(`SELECT id FROM project_library_projects WHERE id = ?`).get(input.id) as { id: string } | undefined)
      : undefined;

    if (existing) {
      this.db
        .prepare(`
          UPDATE project_library_projects
          SET title = ?, summary = ?, fact_card_json = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `)
        .run(input.title, summary, JSON.stringify(input.factCard), input.isActive === false ? 0 : 1, id);
    } else {
      this.db
        .prepare(`
          INSERT INTO project_library_projects (id, title, summary, fact_card_json, is_active)
          VALUES (?, ?, ?, ?, ?)
        `)
        .run(id, input.title, summary, JSON.stringify(input.factCard), input.isActive === false ? 0 : 1);
    }

    return this.getProject(id)!;
  }

  public getProject(projectId: string): ProjectRecord | null {
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
      .get(projectId) as any;

    if (!row) return null;
    return {
      id: row.id,
      title: row.title,
      summary: row.summary || "",
      factCard: safeJsonParse<ProjectFactCard>(row.fact_card_json, {
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

  public listProjects(): ProjectRecord[] {
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
      .all() as any[];

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      summary: row.summary || "",
      factCard: safeJsonParse<ProjectFactCard>(row.fact_card_json, {
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

  public replaceProjectChunks(
    projectId: string,
    asset: {
      kind: string;
      name: string;
      sourcePath: string | null;
      rawText: string;
      metadata?: Record<string, any>;
    },
    chunks: Array<{
      chunkType: string;
      content: string;
      embedding?: number[] | null;
      metadata?: Record<string, any>;
    }>
  ): void {
    const assetId = randomUUID();

    this.db
      .prepare(`
        INSERT INTO project_library_assets (id, project_id, kind, name, source_path, status, raw_text, metadata_json)
        VALUES (?, ?, ?, ?, ?, 'ready', ?, ?)
      `)
      .run(
        assetId,
        projectId,
        asset.kind,
        asset.name,
        asset.sourcePath,
        asset.rawText,
        JSON.stringify(asset.metadata || {})
      );

    const insertChunk = this.db.prepare(`
      INSERT INTO project_library_chunks (
        id, project_id, asset_id, chunk_index, chunk_type, content, embedding_json, token_count, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    chunks.forEach((chunk, index) => {
      insertChunk.run(
        randomUUID(),
        projectId,
        assetId,
        index,
        chunk.chunkType,
        chunk.content,
        chunk.embedding ? JSON.stringify(chunk.embedding) : null,
        chunk.content.split(/\s+/).filter(Boolean).length,
        JSON.stringify(chunk.metadata || {})
      );
    });

    this.db
      .prepare(`UPDATE project_library_projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(projectId);
  }

  public deleteDocumentsByKind(kind: string): void {
    const assetIds = this.db.prepare(`SELECT id FROM project_library_assets WHERE kind = ?`).all(kind) as Array<{ id: string }>;
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

  public getProjectFacts(projectId: string): ProjectFactCard | null {
    return this.getProject(projectId)?.factCard || null;
  }

  public searchEvidence(projectIds: string[], query: string, queryEmbedding: number[] | null, limit: number): EvidenceHit[] {
    const activeProjects = projectIds.length ? projectIds : this.listProjects().filter((project) => project.isActive).map((project) => project.id);
    if (!activeProjects.length) return [];

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
      .all(...activeProjects) as ChunkRow[];

    const hits: EvidenceHit[] = [];
    const projectMap = new Map(this.listProjects().map((project) => [project.id, project]));

    for (const projectId of activeProjects) {
      const project = projectMap.get(projectId);
      if (!project) continue;
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
      const embedding = safeJsonParse<number[] | null>(row.embedding_json, null);
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
          ...(safeJsonParse<Record<string, any>>(row.metadata_json, {})),
        },
      });
    }

    return hits
      .filter((hit) => hit.score > 0.08)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  public buildState(): ProjectLibraryState {
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
