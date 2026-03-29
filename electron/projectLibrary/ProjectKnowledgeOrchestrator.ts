import path from "path";
import { ProjectAssetParser } from "./ProjectAssetParser";
import { ProjectKnowledgeStore } from "./ProjectKnowledgeStore";
import {
  AnswerMode,
  AssetRecord,
  DocType,
  JDProfile,
  ParsedAssetContent,
  ProjectRecord,
  RepoAttachmentSummary,
  ResumeIdentity,
  ResumeImportMapping,
  ResumeImportPreview,
  ResumeImportPreviewProject,
  ResumeProjectInput,
} from "./types";

type GenerateContentFn = (contents: Array<{ text: string }>) => Promise<string>;
type EmbedFn = (text: string) => Promise<number[]>;

type PendingResumePreview = {
  filePath: string;
  resumeText: string;
  preview: ResumeImportPreview;
};

function clampProjectCount(value: number | null | undefined): number {
  const numeric = Number(value || 3);
  return Math.min(5, Math.max(1, Number.isFinite(numeric) ? Math.round(numeric) : 3));
}

function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function extractJsonBlock(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    return trimmed;
  }
  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objectMatch) return objectMatch[0];
  const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
  return arrayMatch ? arrayMatch[0] : null;
}

function dedupeList(values: string[] | undefined): string[] {
  return Array.from(new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))).slice(0, 20);
}

function snippet(text: string, length: number = 320): string {
  return text.replace(/\s+/g, " ").trim().slice(0, length);
}

function chunkText(text: string, size: number = 1100, overlap: number = 200): string[] {
  const normalized = text.replace(/\r/g, "").trim();
  if (!normalized) return [];

  const paragraphs = normalized.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (!current) {
      current = paragraph;
      continue;
    }

    if ((current + "\n\n" + paragraph).length <= size) {
      current += `\n\n${paragraph}`;
      continue;
    }

    chunks.push(current);
    const carry = current.slice(Math.max(0, current.length - overlap));
    current = `${carry}\n\n${paragraph}`.slice(-size);
  }

  if (current) chunks.push(current);

  const normalizedChunks = chunks.length ? chunks : [normalized];
  const finalChunks: string[] = [];
  for (const chunk of normalizedChunks) {
    if (chunk.length <= size) {
      finalChunks.push(chunk);
      continue;
    }
    for (let index = 0; index < chunk.length; index += size - overlap) {
      finalChunks.push(chunk.slice(index, index + size));
    }
  }

  return finalChunks.slice(0, 48);
}

function inferRoleFromResume(text: string): string | undefined {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  return lines.slice(1, 6).find((line) => /engineer|developer|architect|scientist|manager|student|intern/i.test(line));
}

function extractEmail(text: string): string | undefined {
  return text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
}

function inferName(text: string): string | undefined {
  const firstLine = text.split("\n").map((line) => line.trim()).find(Boolean);
  if (!firstLine || firstLine.length > 80) return undefined;
  return firstLine;
}

function inferSkills(text: string): string[] {
  const candidates = [
    "react",
    "typescript",
    "javascript",
    "node",
    "python",
    "java",
    "go",
    "rust",
    "aws",
    "gcp",
    "docker",
    "kubernetes",
    "postgres",
    "mysql",
    "redis",
    "rag",
    "llm",
    "agent",
    "graphql",
    "next.js",
    "vite",
    "electron",
  ];
  const lower = text.toLowerCase();
  return candidates.filter((candidate) => lower.includes(candidate)).slice(0, 16);
}

function splitResumeSections(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split(/\n{2,}/)
    .map((section) => section.trim())
    .filter((section) => section.length > 40);
}

function inferProjectTitleFromSection(section: string, index: number, maxProjects: number): string {
  const firstLine = section
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  if (firstLine && firstLine.length <= 80) {
    return firstLine;
  }

  return maxProjects === 1 ? "主要项目" : `项目 ${index + 1}`;
}

function fallbackProjectsFromResume(text: string, maxProjects: number): ResumeProjectInput[] {
  const sections = splitResumeSections(text);

  const ranked = sections
    .map((section) => ({
      section,
      score:
        (section.match(/project|platform|system|pipeline|app|service|architecture|agent|model|deployment|debug|浼樺寲|绯荤粺|骞冲彴|鏋舵瀯/gi) || []).length +
        (section.match(/react|typescript|python|node|llm|rag|aws|docker|redis|postgres/gi) || []).length,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxProjects);

  if (!ranked.length) {
    return [
      {
        title: "主要项目",
        summary: snippet(text, 420),
        responsibilities: [snippet(text, 200)],
        techStack: inferSkills(text),
        modules: [],
        metrics: [],
        highlights: [],
        keywords: inferSkills(text),
        sourceExcerpt: text.trim(),
      },
    ];
  }

  return ranked.map((item, index) => ({
    title: inferProjectTitleFromSection(item.section, index, maxProjects),
    summary: snippet(item.section, 260),
    responsibilities: [snippet(item.section, 200)],
    techStack: inferSkills(item.section),
    modules: [] as string[],
    metrics: [] as string[],
    highlights: [] as string[],
    keywords: inferSkills(item.section),
    sourceExcerpt: item.section,
  }));
}

export class ProjectKnowledgeOrchestrator {
  private generateContentFn: GenerateContentFn | null = null;
  private embedFn: EmbedFn | null = null;
  private embedQueryFn: EmbedFn | null = null;
  private interviewerBuffer: string[] = [];
  private pendingResumePreview: PendingResumePreview | null = null;

  constructor(private readonly store: ProjectKnowledgeStore) {}

  public setGenerateContentFn(fn: GenerateContentFn): void {
    this.generateContentFn = fn;
  }

  public setEmbedFn(fn: EmbedFn): void {
    this.embedFn = fn;
  }

  public setEmbedQueryFn(fn: EmbedFn): void {
    this.embedQueryFn = fn;
  }

  public isKnowledgeMode(): boolean {
    return this.store.isKnowledgeEnabled();
  }

  public setKnowledgeMode(enabled: boolean): void {
    this.store.setKnowledgeEnabled(enabled);
  }

  public getStatus() {
    const state = this.store.buildState();
    return {
      hasResume: state.projects.length > 0,
      hasJD: state.hasActiveJD,
      activeMode: state.profileMode,
      answerMode: state.answerMode,
      jdBiasEnabled: state.jdBiasEnabled,
      activeProjectIds: state.activeProjectIds,
      preferredResumeProjectCount: state.preferredResumeProjectCount,
      resumeSummary: {
        name: state.identity.name,
        role: state.identity.role,
        projectCount: state.projects.length,
      },
    };
  }

  public getProfileData(): any {
    const state = this.store.buildState();
    const activeProjects = state.projects.filter((project) => state.activeProjectIds.includes(project.id));

    return {
      identity: state.identity,
      skills: state.skills,
      experienceCount: activeProjects.length,
      projectCount: state.projects.length,
      nodeCount: state.projects.reduce((total, project) => total + (project.assetCount || 0) + (project.chunkCount || 0), 0),
      projects: state.projects,
      activeProjectIds: state.activeProjectIds,
      answerMode: state.answerMode,
      profileMode: state.profileMode,
      hasActiveJD: state.hasActiveJD,
      activeJD: state.activeJD,
      jdBiasEnabled: state.jdBiasEnabled,
      lastEvidenceHits: state.lastEvidenceHits,
      preferredResumeProjectCount: state.preferredResumeProjectCount,
    };
  }

  public listProjects() {
    return this.store.listProjects();
  }

  public getProjectDetail(projectId: string) {
    const project = this.store.getProject(projectId);
    if (!project) return null;
    return {
      project,
      assets: this.store.listAssets(projectId),
      repos: this.store.listRepos(projectId),
    };
  }

  public listProjectAssets(projectId: string) {
    return this.store.listAssets(projectId);
  }

  public listRepos(projectId: string): RepoAttachmentSummary[] {
    return this.store.listRepos(projectId);
  }

  public upsertProject(input: ResumeProjectInput) {
    const factCard = this.buildFactCardFromInput(input);
    const project = this.store.upsertProject({
      id: input.id,
      title: input.title,
      summary: input.summary || factCard.summary,
      factCard,
      isActive: input.isActive,
    });

    const activeProjectIds = this.store.getActiveProjectIds();
    if (!activeProjectIds.length) {
      this.store.setActiveProjectIds([project.id]);
    }

    return project;
  }

  public updateProject(input: ResumeProjectInput) {
    if (!input.id || !this.store.getProject(input.id)) {
      return { success: false, error: "Project not found." };
    }
    const project = this.upsertProject(input);
    return { success: true, project };
  }

  public getProjectFacts(projectId: string) {
    return this.store.getProjectFacts(projectId);
  }

  public setActiveProjects(projectIds: string[]) {
    this.store.setActiveProjectIds(projectIds);
    return this.store.buildState();
  }

  public setAnswerMode(mode: AnswerMode) {
    this.store.setAnswerMode(mode);
    return this.store.buildState();
  }

  public setJDBiasEnabled(enabled: boolean) {
    this.store.setJDBiasEnabled(enabled);
    return this.store.buildState();
  }

  public async deleteProject(projectId: string) {
    const project = this.store.getProject(projectId);
    if (!project) {
      return { success: false, error: "Project not found." };
    }

    const jdAsset = this.store.listAssets(projectId).find((asset) => asset.kind === "jd") || null;
    this.store.deleteProject(projectId);

    const remainingProjects = this.store.listProjects();
    if (!remainingProjects.length) {
      this.store.setIdentity({});
      this.store.setSkills([]);
      this.store.setKnowledgeEnabled(false);
      this.store.setActiveJD(null);
      this.store.setJDBiasEnabled(false);
      return { success: true };
    }

    if (!this.store.getActiveProjectIds().length) {
      this.store.setActiveProjectIds([remainingProjects[0].id]);
    }

    if (jdAsset?.rawText) {
      const jdTargetProjectId = this.store.getActiveProjectIds()[0] || remainingProjects[0].id;
      const existingJdAssets = this.store
        .listAssets(jdTargetProjectId)
        .filter((asset) => asset.kind === "jd")
        .map((asset) => asset.id);

      if (existingJdAssets.length) {
        this.store.deleteAssets(existingJdAssets);
      }

      await this.ingestParsedAsset(jdTargetProjectId, {
        kind: "jd",
        name: jdAsset.name,
        sourcePath: jdAsset.sourcePath || "",
        text: jdAsset.rawText,
        metadata: jdAsset.metadata || {},
      });
    }

    return {
      success: true,
      projects: this.store.listProjects(),
    };
  }

  public deleteDocumentsByType(docType: DocType): void {
    if (docType === DocType.RESUME) {
      this.pendingResumePreview = null;
      this.store.clearAllProjects();
      this.store.setIdentity({});
      this.store.setSkills([]);
      this.store.setKnowledgeEnabled(false);
      this.store.setActiveJD(null);
      this.store.setJDBiasEnabled(false);
      return;
    }

    if (docType === DocType.JD) {
      this.store.setActiveJD(null);
      this.store.setJDBiasEnabled(false);
      this.store.deleteDocumentsByKind(DocType.JD);
    }
  }

  public async ingestDocument(filePath: string, docType: DocType) {
    if (docType === DocType.RESUME) {
      const projectCount = this.store.getPreferredResumeProjectCount();
      const previewResult = await this.previewResumeImport({ filePath, projectCount });
      if (!previewResult.success || !previewResult.preview) return previewResult;
      return this.applyResumeImport({
        filePath,
        projectCount,
        mappings: [],
        editedProjects: previewResult.preview.projects,
        replaceMode: "confirmed_replace",
      });
    }

    const parsed = await ProjectAssetParser.parseFile(filePath);
    if (!parsed.text.trim()) {
      return { success: false, error: "No readable text found in the selected file." };
    }

    if (docType === DocType.JD) {
      return this.ingestJD(filePath, parsed.text);
    }

    return { success: false, error: `Unsupported document type: ${docType}` };
  }

  public async previewResumeImport(payload: { filePath: string; projectCount?: number }) {
    const normalizedCount = clampProjectCount(payload.projectCount ?? this.store.getPreferredResumeProjectCount());
    const parsed = await ProjectAssetParser.parseFile(payload.filePath);
    if (!parsed.text.trim()) {
      return { success: false, error: "No readable text found in the selected file." };
    }

    const preview = await this.buildResumePreview(payload.filePath, parsed.text, normalizedCount);
    this.store.setPreferredResumeProjectCount(normalizedCount);
    this.pendingResumePreview = {
      filePath: path.resolve(payload.filePath),
      resumeText: parsed.text,
      preview,
    };

    return {
      success: true,
      preview,
    };
  }

  public async applyResumeImport(payload: {
    filePath: string;
    projectCount?: number;
    mappings?: ResumeImportMapping[];
    editedProjects?: Array<ResumeProjectInput & { previewId?: string; sourceExcerpt?: string }>;
    replaceMode: "confirmed_replace";
  }) {
    if (payload.replaceMode !== "confirmed_replace") {
      return { success: false, error: "Resume import requires explicit confirmation." };
    }

    const normalizedCount = clampProjectCount(payload.projectCount ?? this.store.getPreferredResumeProjectCount());
    this.store.setPreferredResumeProjectCount(normalizedCount);

    const prepared = await this.getOrCreatePendingPreview(payload.filePath, normalizedCount);
    if (!prepared) {
      return { success: false, error: "Unable to prepare resume preview." };
    }

    const preview = prepared.preview;
    const resumeText = prepared.resumeText;
    const identity: ResumeIdentity = {
      name: preview.identity?.name || inferName(resumeText),
      email: preview.identity?.email || extractEmail(resumeText),
      role: preview.identity?.role || inferRoleFromResume(resumeText),
      summary: preview.identity?.summary || "",
    };

    const editedProjectsByPreviewId = new Map<string, ResumeProjectInput & { previewId?: string; sourceExcerpt?: string }>();
    for (const project of payload.editedProjects || []) {
      const previewId = String(project.previewId || project.id || "").trim();
      if (previewId) editedProjectsByPreviewId.set(previewId, project);
    }

    const finalProjects = preview.projects.map((project) => {
      const edited = editedProjectsByPreviewId.get(project.previewId);
      return this.normalizePreviewProject({
        ...project,
        ...(edited || {}),
        previewId: project.previewId,
      });
    });

    const mappingByPreviewId = new Map<string, string>();
    for (const mapping of payload.mappings || []) {
      if (mapping.previewId && mapping.projectId) {
        mappingByPreviewId.set(mapping.previewId, mapping.projectId);
      }
    }

    const mappedProjectIds = Array.from(mappingByPreviewId.values());
    if (new Set(mappedProjectIds).size !== mappedProjectIds.length) {
      return { success: false, error: "Each existing project can only be mapped once." };
    }

    const existingProjects = this.store.listProjects();
    const existingProjectMap = new Map(existingProjects.map((project) => [project.id, project]));
    const existingJdAsset = this.store.listAssetsByKind("jd")[0] || null;
    const finalProjectIds: string[] = [];

    this.store.setIdentity(identity);
    this.store.setSkills(preview.skills?.length ? preview.skills : inferSkills(resumeText));

    for (const previewProject of finalProjects) {
      const mappedProjectId = mappingByPreviewId.get(previewProject.previewId);
      const factCard = this.buildFactCardFromInput(previewProject);
      const project = this.store.upsertProject({
        id: mappedProjectId && existingProjectMap.has(mappedProjectId) ? mappedProjectId : undefined,
        title: factCard.title,
        summary: factCard.summary,
        factCard,
        isActive: true,
      });

      finalProjectIds.push(project.id);

      const existingResumeAssets = this.store
        .listAssets(project.id)
        .filter((asset) => asset.kind === "resume")
        .map((asset) => asset.id);
      if (existingResumeAssets.length) {
        this.store.deleteAssets(existingResumeAssets);
      }

      const sourceText = String(previewProject.sourceExcerpt || "").trim() || this.buildProjectSourceText(previewProject, resumeText, normalizedCount);
      await this.ingestParsedAsset(project.id, {
        kind: "resume",
        name: path.basename(prepared.filePath),
        sourcePath: prepared.filePath,
        text: sourceText,
        metadata: {
          docType: DocType.RESUME,
          source: "resume",
          previewId: previewProject.previewId,
          projectTitle: previewProject.title,
          isFullSource: true,
        },
      });
    }

    const finalProjectIdSet = new Set(finalProjectIds);
    const projectsToDelete = existingProjects.map((project) => project.id).filter((projectId) => !finalProjectIdSet.has(projectId));
    const shouldReattachJD = Boolean(existingJdAsset && projectsToDelete.includes(existingJdAsset.projectId) && finalProjectIds.length);

    if (projectsToDelete.length) {
      this.store.deleteProjects(projectsToDelete);
    }

    if (shouldReattachJD && existingJdAsset?.rawText) {
      await this.ingestParsedAsset(finalProjectIds[0], {
        kind: "jd",
        name: existingJdAsset.name,
        sourcePath: existingJdAsset.sourcePath || "",
        text: existingJdAsset.rawText,
        metadata: existingJdAsset.metadata || {},
      });
    }

    this.store.setActiveProjectIds(finalProjectIds);
    this.pendingResumePreview = null;

    return {
      success: true,
      projectCount: finalProjectIds.length,
      identity,
      projects: this.store.listProjects(),
    };
  }

  public async attachAssets(projectId: string, filePaths: string[]) {
    const project = this.store.getProject(projectId);
    if (!project) return { success: false, error: "Project not found." };

    const attached: Array<{ name: string; kind: string }> = [];
    for (const filePath of filePaths) {
      const parsed = await ProjectAssetParser.parseFile(filePath);
      if (!parsed.text.trim()) continue;
      await this.ingestParsedAsset(projectId, parsed);
      attached.push({ name: parsed.name, kind: parsed.kind });
    }

    return { success: true, attached };
  }

  public async attachRepo(projectId: string, repoPath: string) {
    const project = this.store.getProject(projectId);
    if (!project) return { success: false, error: "Project not found." };

    const parsedAssets = await ProjectAssetParser.parseRepo(repoPath);
    let attachedCount = 0;
    for (const parsed of parsedAssets) {
      if (!parsed.text.trim()) continue;
      await this.ingestParsedAsset(projectId, parsed);
      attachedCount += 1;
    }

    return {
      success: true,
      attachedCount,
      repoPath: path.resolve(repoPath),
    };
  }

  public async updateAssetText(assetId: string, rawText: string) {
    const asset = this.store.getAsset(assetId);
    if (!asset) return { success: false, error: "Asset not found." };
    if (asset.kind === "repo" || asset.kind === "code_file") {
      return { success: false, error: "Use repo management actions for repository assets." };
    }

    const updatedAsset = await this.rebuildAssetText(asset, rawText);
    if (!updatedAsset) return { success: false, error: "Failed to update asset text." };
    return { success: true, asset: updatedAsset };
  }

  public deleteAsset(assetId: string) {
    const asset = this.store.getAsset(assetId);
    if (!asset) return { success: false, error: "Asset not found." };
    if (asset.kind === "repo" || asset.kind === "code_file") {
      return { success: false, error: "Use repo management actions for repository assets." };
    }

    this.store.deleteAsset(assetId);
    return { success: true };
  }

  public async replaceRepo(projectId: string, repoRoot: string, repoPath: string) {
    const project = this.store.getProject(projectId);
    if (!project) return { success: false, error: "Project not found." };

    this.deleteRepoGroup(projectId, repoRoot);
    return this.attachRepo(projectId, repoPath);
  }

  public async reindexRepo(projectId: string, repoRoot: string) {
    const project = this.store.getProject(projectId);
    if (!project) return { success: false, error: "Project not found." };

    const repo = this.store.listRepos(projectId).find((entry) => entry.repoRoot === repoRoot);
    if (!repo?.sourcePath) {
      return { success: false, error: "Repository source path not found." };
    }

    this.deleteRepoGroup(projectId, repoRoot);
    return this.attachRepo(projectId, repo.sourcePath);
  }

  public deleteRepo(projectId: string, repoRoot: string) {
    const project = this.store.getProject(projectId);
    if (!project) return { success: false, error: "Project not found." };

    this.deleteRepoGroup(projectId, repoRoot);
    return { success: true };
  }

  public feedInterviewerUtterance(message: string): void {
    if (!message.trim()) return;
    this.interviewerBuffer.push(message.trim());
    this.interviewerBuffer = this.interviewerBuffer.slice(-6);
  }

  public async processQuestion(message: string) {
    const state = this.store.buildState();
    if (!state.projects.length) return null;

    const intent = this.classifyQuestion(message);
    const targetProjects = this.selectTargetProjects(message, state.projects, state.activeProjectIds, intent);
    const queryEmbedding = this.embedQueryFn
      ? await this.safeEmbed(this.embedQueryFn, message)
      : this.embedFn
        ? await this.safeEmbed(this.embedFn, message)
        : null;

    const evidenceHits = this.store.searchEvidence(targetProjects.map((project) => project.id), message, queryEmbedding, 6);
    const finalHits = evidenceHits.slice(0, 3);
    this.store.setLastEvidenceHits(finalHits);

    const factBlocks = targetProjects.map((project) => {
      const card = project.factCard;
      return [
        `Project: ${project.title}`,
        card.role ? `Role: ${card.role}` : "",
        `Summary: ${card.summary || project.summary}`,
        card.responsibilities.length ? `Responsibilities: ${card.responsibilities.join("; ")}` : "",
        card.techStack.length ? `Tech stack: ${card.techStack.join(", ")}` : "",
        card.modules.length ? `Modules: ${card.modules.join(", ")}` : "",
        card.metrics.length ? `Metrics: ${card.metrics.join("; ")}` : "",
        card.highlights.length ? `Highlights: ${card.highlights.join("; ")}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    });

    const jdContext =
      state.jdBiasEnabled && state.activeJD
        ? [
            "JD bias is enabled. Use the JD only to rank relevance and adjust wording. Do not invent facts.",
            state.activeJD.title ? `Role target: ${state.activeJD.title}` : "",
            state.activeJD.company ? `Company: ${state.activeJD.company}` : "",
            state.activeJD.technologies.length ? `JD technologies: ${state.activeJD.technologies.join(", ")}` : "",
            state.activeJD.keywords.length ? `JD keywords: ${state.activeJD.keywords.join(", ")}` : "",
            state.activeJD.requirements.length ? `JD requirements: ${state.activeJD.requirements.join("; ")}` : "",
          ]
            .filter(Boolean)
            .join("\n")
        : "";

    const evidenceBlock = finalHits
      .map((hit, index) => {
        return [
          `Evidence ${index + 1}`,
          `Source: ${hit.sourceType} | Project: ${hit.projectTitle} | Label: ${hit.label}`,
          `Snippet: ${snippet(hit.content, 420)}`,
        ].join("\n");
      })
      .join("\n\n");

    const contextBlock = [
      "Project Knowledge Context",
      `Question intent: ${intent}`,
      factBlocks.join("\n\n"),
      evidenceBlock ? `Evidence Hits\n${evidenceBlock}` : "",
      jdContext,
    ]
      .filter(Boolean)
      .join("\n\n");

    return {
      isIntroQuestion: intent === "intro",
      introResponse: null as string | null,
      systemPromptInjection: this.buildSystemPrompt(state.answerMode, intent, targetProjects.length > 1),
      contextBlock,
      evidenceHits: finalHits,
    };
  }

  private async getOrCreatePendingPreview(filePath: string, projectCount: number): Promise<PendingResumePreview | null> {
    const resolvedPath = path.resolve(filePath);
    if (
      this.pendingResumePreview &&
      this.pendingResumePreview.filePath === resolvedPath &&
      this.pendingResumePreview.preview.projectCount === projectCount
    ) {
      return this.pendingResumePreview;
    }

    const previewResult = await this.previewResumeImport({ filePath: resolvedPath, projectCount });
    return previewResult.success && previewResult.preview ? this.pendingResumePreview : null;
  }

  private async buildResumePreview(filePath: string, resumeText: string, projectCount: number): Promise<ResumeImportPreview> {
    const extracted = await this.extractResumeKnowledge(resumeText, projectCount);
    const identity: ResumeIdentity = {
      name: extracted.identity?.name || inferName(resumeText),
      email: extracted.identity?.email || extractEmail(resumeText),
      role: extracted.identity?.role || inferRoleFromResume(resumeText),
      summary: extracted.identity?.summary || "",
    };
    const rawProjects = (extracted.projects?.length ? extracted.projects : fallbackProjectsFromResume(resumeText, projectCount)).slice(0, projectCount);
    const projects = rawProjects.map((project, index) =>
      this.normalizePreviewProject({
        ...project,
        previewId: `preview-${index + 1}`,
        sourceExcerpt: String(project.sourceExcerpt || "").trim() || this.buildProjectSourceText(project, resumeText, projectCount),
      })
    );

    return {
      filePath: path.resolve(filePath),
      identity,
      skills: extracted.skills?.length ? extracted.skills : inferSkills(resumeText),
      projectCount,
      projects,
      createdAt: new Date().toISOString(),
    };
  }

  private normalizePreviewProject(project: ResumeImportPreviewProject): ResumeImportPreviewProject {
    return {
      previewId: project.previewId,
      title: String(project.title || "").trim() || "Untitled Project",
      summary: String(project.summary || "").trim(),
      role: String(project.role || "").trim(),
      responsibilities: dedupeList(project.responsibilities),
      techStack: dedupeList(project.techStack),
      modules: dedupeList(project.modules),
      metrics: dedupeList(project.metrics),
      highlights: dedupeList(project.highlights),
      keywords: dedupeList(project.keywords),
      sourceExcerpt: String(project.sourceExcerpt || "").trim(),
      isActive: project.isActive,
    };
  }

  private deleteRepoGroup(projectId: string, repoRoot: string): void {
    const repoAssetIds = this.store
      .listAssets(projectId)
      .filter((asset) => {
        if (asset.kind !== "repo" && asset.kind !== "code_file") return false;
        const assetRepoRoot = asset.metadata?.repoRoot || (asset.kind === "repo" ? asset.sourcePath : null);
        return assetRepoRoot === repoRoot;
      })
      .map((asset) => asset.id);

    if (repoAssetIds.length) {
      this.store.deleteAssets(repoAssetIds);
    }
  }

  private async ingestJD(filePath: string, jdText: string) {
    const jd = await this.extractJDKnowledge(jdText);
    this.store.setActiveJD(jd);
    this.store.setJDBiasEnabled(false);

    const targetProjectId = this.store.getActiveProjectIds()[0] || this.store.listProjects()[0]?.id;
    if (targetProjectId) {
      const existingJdAssets = this.store
        .listAssets(targetProjectId)
        .filter((asset) => asset.kind === "jd")
        .map((asset) => asset.id);
      if (existingJdAssets.length) {
        this.store.deleteAssets(existingJdAssets);
      }

      await this.ingestParsedAsset(targetProjectId, {
        kind: "jd",
        name: path.basename(filePath),
        sourcePath: filePath,
        text: jdText,
        metadata: {
          docType: DocType.JD,
          source: "jd",
          jd,
        },
      });
    }

    return { success: true, jdBiasEnabled: false, jd };
  }

  private buildFactCardFromInput(input: ResumeProjectInput) {
    return {
      title: input.title,
      role: input.role || "",
      summary: input.summary || "",
      responsibilities: dedupeList(input.responsibilities),
      techStack: dedupeList(input.techStack),
      modules: dedupeList(input.modules),
      metrics: dedupeList(input.metrics),
      highlights: dedupeList(input.highlights),
      keywords: dedupeList(input.keywords),
    };
  }

  private buildProjectSourceText(projectInput: ResumeProjectInput, resumeText: string, projectCount: number): string {
    const normalizedResume = resumeText.replace(/\r/g, "").trim();
    if (!normalizedResume) return "";

    if (projectCount <= 1) {
      return normalizedResume;
    }

    const sections = splitResumeSections(normalizedResume);
    if (!sections.length) {
      return normalizedResume;
    }

    const phrases = Array.from(
      new Set(
        [
          projectInput.title,
          projectInput.role,
          projectInput.summary,
          ...(projectInput.techStack || []),
          ...(projectInput.keywords || []),
          ...(projectInput.responsibilities || []).map((item) => snippet(item, 80)),
          ...(projectInput.highlights || []).map((item) => snippet(item, 80)),
        ]
          .map((value) => String(value || "").trim())
          .filter((value) => value.length >= 2)
      )
    ).slice(0, 24);

    const scoredSections = sections.map((section, index) => {
      const sectionLower = section.toLowerCase();
      let score = 0;

      for (const phrase of phrases) {
        const normalizedPhrase = phrase.toLowerCase();
        if (!sectionLower.includes(normalizedPhrase)) continue;

        if (normalizedPhrase === String(projectInput.title || "").trim().toLowerCase()) {
          score += 8;
        } else if (normalizedPhrase.length >= 18) {
          score += 4;
        } else if (normalizedPhrase.length >= 8) {
          score += 3;
        } else {
          score += 2;
        }
      }

      return { index, section, score };
    });

    const positivelyMatched = scoredSections.filter((item) => item.score > 0).sort((a, b) => a.index - b.index);

    if (positivelyMatched.length) {
      const firstIndex = positivelyMatched[0].index;
      const lastIndex = positivelyMatched[positivelyMatched.length - 1].index;
      return sections.slice(firstIndex, lastIndex + 1).join("\n\n");
    }

    return sections[0] || normalizedResume;
  }

  private async rebuildAssetText(asset: AssetRecord, rawText: string) {
    const parsed: ParsedAssetContent = {
      kind: asset.kind,
      name: asset.name,
      sourcePath: asset.sourcePath || "",
      text: rawText,
      metadata: asset.metadata || {},
    };

    const chunks = chunkText(parsed.text, parsed.kind === "code_file" ? 1500 : 1100, parsed.kind === "code_file" ? 250 : 200);
    const storedChunks: Array<{
      chunkType: string;
      content: string;
      embedding: number[] | null;
      metadata: Record<string, any>;
    }> = [];

    for (const [index, content] of chunks.entries()) {
      const chunkType = parsed.kind === "repo" ? "repo_summary" : parsed.kind === "code_file" ? "code" : "document";
      storedChunks.push({
        chunkType,
        content,
        embedding: await this.safeEmbed(this.embedFn, content),
        metadata: {
          ...(parsed.metadata || {}),
          sourcePath: asset.sourcePath,
          part: index + 1,
        },
      });
    }

    return this.store.replaceAssetChunks(
      asset.id,
      {
        kind: parsed.kind,
        name: parsed.name,
        sourcePath: asset.sourcePath,
        rawText: parsed.text,
        metadata: parsed.metadata,
      },
      storedChunks
    );
  }

  private async ingestParsedAsset(projectId: string, parsed: ParsedAssetContent) {
    const chunks = chunkText(parsed.text, parsed.kind === "code_file" ? 1500 : 1100, parsed.kind === "code_file" ? 250 : 200);
    const storedChunks = [];

    if (parsed.kind === "code_file" && parsed.metadata?.relativePath) {
      storedChunks.push({
        chunkType: "code_summary",
        content: `Code file summary\nPath: ${parsed.metadata.relativePath}\n${parsed.metadata.repoSummary || snippet(parsed.text, 320)}`,
        embedding: await this.safeEmbed(this.embedFn, parsed.metadata.repoSummary || snippet(parsed.text, 320)),
        metadata: parsed.metadata,
      });
    }

    for (const [index, content] of chunks.entries()) {
      const chunkType = parsed.kind === "code_file" ? "code" : parsed.kind === "repo" ? "repo_summary" : "document";
      storedChunks.push({
        chunkType,
        content,
        embedding: await this.safeEmbed(this.embedFn, content),
        metadata: {
          ...(parsed.metadata || {}),
          sourcePath: parsed.sourcePath,
          part: index + 1,
        },
      });
    }

    return this.store.replaceProjectChunks(
      projectId,
      {
        kind: parsed.kind,
        name: parsed.name,
        sourcePath: parsed.sourcePath,
        rawText: parsed.text,
        metadata: parsed.metadata,
      },
      storedChunks
    );
  }

  private async extractResumeKnowledge(
    resumeText: string,
    projectCount: number
  ): Promise<{
    identity?: ResumeIdentity;
    skills?: string[];
    projects?: ResumeProjectInput[];
  }> {
    if (!this.generateContentFn) {
      return {
        identity: {
          name: inferName(resumeText),
          email: extractEmail(resumeText),
          role: inferRoleFromResume(resumeText),
        },
        skills: inferSkills(resumeText),
        projects: fallbackProjectsFromResume(resumeText, projectCount),
      };
    }

    const prompt = `
Extract interview-ready project knowledge from this resume.
Treat every item in the resume as first-party experience.
Return JSON only with this shape:
{
  "identity": { "name": "", "email": "", "role": "", "summary": "" },
  "skills": ["skill"],
  "projects": [
    {
      "title": "",
      "role": "",
      "summary": "",
      "responsibilities": ["..."],
      "techStack": ["..."],
      "modules": ["..."],
      "metrics": ["..."],
      "highlights": ["..."],
      "keywords": ["..."]
    }
  ]
}
Rules:
- Keep at most ${projectCount} projects.
- Prefer the most technically deep projects.
- Use empty arrays instead of null.
- Use concise, concrete summaries.
- Do not mention uncertainty about ownership.
- Preserve the original language of the resume content.
- Do not translate project titles or descriptions unless the source already uses that language.

Resume:
${resumeText.slice(0, 12000)}
`;

    try {
      const raw = await this.generateContentFn([{ text: prompt }]);
      const jsonBlock = extractJsonBlock(raw);
      if (!jsonBlock) throw new Error("Model did not return JSON.");
      const parsed = safeJsonParse<any>(jsonBlock, {});
      return {
        identity: parsed.identity || {},
        skills: dedupeList(parsed.skills),
        projects: Array.isArray(parsed.projects) ? parsed.projects.slice(0, projectCount) : [],
      };
    } catch (error) {
      console.warn("[ProjectKnowledgeOrchestrator] Failed to extract resume JSON:", error);
      return {
        identity: {
          name: inferName(resumeText),
          email: extractEmail(resumeText),
          role: inferRoleFromResume(resumeText),
        },
        skills: inferSkills(resumeText),
        projects: fallbackProjectsFromResume(resumeText, projectCount),
      };
    }
  }

  private async extractJDKnowledge(jdText: string): Promise<JDProfile> {
    if (!this.generateContentFn) {
      return {
        title: jdText.split("\n").map((line) => line.trim()).find(Boolean),
        technologies: inferSkills(jdText),
        requirements: [],
        keywords: inferSkills(jdText),
        summary: snippet(jdText, 320),
      };
    }

    const prompt = `
Extract structured job-description context.
Return JSON only:
{
  "title": "",
  "company": "",
  "location": "",
  "level": "",
  "summary": "",
  "technologies": ["..."],
  "requirements": ["..."],
  "keywords": ["..."],
  "compensationHint": ""
}
Rules:
- Keep technologies and keywords concise.
- Preserve only factual content from the JD.
- Do not add salary data if absent.

JD:
${jdText.slice(0, 12000)}
`;

    try {
      const raw = await this.generateContentFn([{ text: prompt }]);
      const jsonBlock = extractJsonBlock(raw);
      if (!jsonBlock) throw new Error("Model did not return JSON.");
      const parsed = safeJsonParse<any>(jsonBlock, {});
      return {
        title: parsed.title || "",
        company: parsed.company || "",
        location: parsed.location || "",
        level: parsed.level || "",
        summary: parsed.summary || snippet(jdText, 320),
        technologies: dedupeList(parsed.technologies),
        requirements: dedupeList(parsed.requirements),
        keywords: dedupeList(parsed.keywords),
        compensationHint: parsed.compensationHint || "",
      };
    } catch (error) {
      console.warn("[ProjectKnowledgeOrchestrator] Failed to extract JD JSON:", error);
      return {
        title: jdText.split("\n").map((line) => line.trim()).find(Boolean),
        technologies: inferSkills(jdText),
        requirements: [],
        keywords: inferSkills(jdText),
        summary: snippet(jdText, 320),
      };
    }
  }

  private classifyQuestion(message: string): string {
    const lower = message.toLowerCase();
    if (/introduce yourself|tell me about yourself|walk me through your background/.test(lower)) {
      return "intro";
    }
    if (/trade[\s-]?off|why|architecture|design|planner|memory|tool routing/.test(lower)) {
      return "architecture";
    }
    if (/debug|issue|bug|incident|failure/.test(lower)) {
      return "debugging";
    }
    if (/across projects|examples|what experience/.test(lower)) {
      return "cross_project";
    }
    return "project_deep_dive";
  }

  private selectTargetProjects(message: string, projects: ProjectRecord[], activeProjectIds: string[], intent: string): ProjectRecord[] {
    const lowered = message.toLowerCase();
    const explicit = projects.filter((project) => lowered.includes(project.title.toLowerCase()));
    if (explicit.length) return explicit;

    const activeProjects = projects.filter((project) => activeProjectIds.includes(project.id));
    if (intent === "intro" || intent === "cross_project") {
      return activeProjects.length ? activeProjects : projects.slice(0, 3);
    }
    if (activeProjects.length === 1) return activeProjects;
    return activeProjects.length ? activeProjects : projects.slice(0, 1);
  }

  private buildSystemPrompt(mode: AnswerMode, intent: string, multipleProjects: boolean): string {
    const styleInstruction =
      mode === "strict"
        ? "Use only claims supported by the provided project knowledge context. If evidence is thin, stay narrow and factual."
        : "Use the same evidence base, but rewrite it into a polished, interview-ready narrative without adding unsupported facts.";

    const scopeInstruction = multipleProjects
      ? "Only synthesize across multiple projects when the question is explicitly cross-project or introductory."
      : "Stay inside the selected project unless the question explicitly asks for broader synthesis.";

    const introInstruction =
      intent === "intro"
        ? "For self-introduction questions, prioritize the project fact cards and summarize them into a clean first-person narrative."
        : "For deep-dive questions, prioritize the project-local evidence hits and explain design choices concretely.";

    return [
      "You are the user's project-knowledge interview copilot.",
      "Treat every resume item and attached project asset as first-person experience the user can speak about.",
      "Do not question ownership or add caveats about who did the work.",
      styleInstruction,
      scopeInstruction,
      introInstruction,
      'Always structure the response into two sections: "Answer" and "Evidence".',
      '"Evidence" must contain 2 to 3 short bullets summarizing the supporting facts.',
    ].join(" ");
  }

  private async safeEmbed(fn: EmbedFn | null, text: string): Promise<number[] | null> {
    if (!fn || !text.trim()) return null;
    try {
      return await fn(text.slice(0, 6000));
    } catch (error) {
      console.warn("[ProjectKnowledgeOrchestrator] Embedding unavailable:", error);
      return null;
    }
  }
}

