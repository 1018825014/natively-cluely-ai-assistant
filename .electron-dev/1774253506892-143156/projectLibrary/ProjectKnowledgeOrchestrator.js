"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectKnowledgeOrchestrator = void 0;
const path_1 = __importDefault(require("path"));
const ProjectAssetParser_1 = require("./ProjectAssetParser");
const types_1 = require("./types");
function safeJsonParse(value, fallback) {
    try {
        return JSON.parse(value);
    }
    catch {
        return fallback;
    }
}
function extractJsonBlock(text) {
    const trimmed = text.trim();
    if (!trimmed)
        return null;
    if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
        return trimmed;
    }
    const objectMatch = trimmed.match(/\{[\s\S]*\}/);
    if (objectMatch)
        return objectMatch[0];
    const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
    return arrayMatch ? arrayMatch[0] : null;
}
function dedupeList(values) {
    return Array.from(new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))).slice(0, 20);
}
function snippet(text, length = 320) {
    return text.replace(/\s+/g, " ").trim().slice(0, length);
}
function chunkText(text, size = 1100, overlap = 200) {
    const normalized = text.replace(/\r/g, "").trim();
    if (!normalized)
        return [];
    const paragraphs = normalized.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
    const chunks = [];
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
    if (current)
        chunks.push(current);
    const normalizedChunks = chunks.length ? chunks : [normalized];
    const finalChunks = [];
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
function inferRoleFromResume(text) {
    const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
    return lines.slice(1, 6).find((line) => /engineer|developer|architect|scientist|manager|student|intern/i.test(line));
}
function extractEmail(text) {
    return text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
}
function inferName(text) {
    const firstLine = text.split("\n").map((line) => line.trim()).find(Boolean);
    if (!firstLine || firstLine.length > 80)
        return undefined;
    return firstLine;
}
function inferSkills(text) {
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
function fallbackProjectsFromResume(text) {
    const sections = text
        .split(/\n{2,}/)
        .map((section) => section.trim())
        .filter((section) => section.length > 40);
    const ranked = sections
        .map((section) => ({
        section,
        score: (section.match(/project|platform|system|pipeline|app|service|architecture|agent|model|deployment|debug|优化|系统|平台|架构/gi) || []).length +
            (section.match(/react|typescript|python|node|llm|rag|aws|docker|redis|postgres/gi) || []).length,
    }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
    if (!ranked.length) {
        return [
            {
                title: "Primary Project",
                summary: snippet(text, 420),
                responsibilities: ["Built and explained the main system end to end."],
                techStack: inferSkills(text),
                modules: [],
                metrics: [],
                highlights: [],
                keywords: inferSkills(text),
            },
        ];
    }
    return ranked.map((item, index) => ({
        title: `Project ${index + 1}`,
        summary: snippet(item.section, 260),
        responsibilities: [snippet(item.section, 200)],
        techStack: inferSkills(item.section),
        modules: [],
        metrics: [],
        highlights: [],
        keywords: inferSkills(item.section),
    }));
}
class ProjectKnowledgeOrchestrator {
    store;
    generateContentFn = null;
    embedFn = null;
    embedQueryFn = null;
    interviewerBuffer = [];
    constructor(store) {
        this.store = store;
    }
    setGenerateContentFn(fn) {
        this.generateContentFn = fn;
    }
    setEmbedFn(fn) {
        this.embedFn = fn;
    }
    setEmbedQueryFn(fn) {
        this.embedQueryFn = fn;
    }
    isKnowledgeMode() {
        return this.store.isKnowledgeEnabled();
    }
    setKnowledgeMode(enabled) {
        this.store.setKnowledgeEnabled(enabled);
    }
    getStatus() {
        const state = this.store.buildState();
        return {
            hasResume: state.projects.length > 0,
            hasJD: state.hasActiveJD,
            activeMode: state.profileMode,
            answerMode: state.answerMode,
            jdBiasEnabled: state.jdBiasEnabled,
            activeProjectIds: state.activeProjectIds,
            resumeSummary: {
                name: state.identity.name,
                role: state.identity.role,
                projectCount: state.projects.length,
            },
        };
    }
    getProfileData() {
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
        };
    }
    listProjects() {
        return this.store.listProjects();
    }
    upsertProject(input) {
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
    getProjectFacts(projectId) {
        return this.store.getProjectFacts(projectId);
    }
    setActiveProjects(projectIds) {
        this.store.setActiveProjectIds(projectIds);
        return this.store.buildState();
    }
    setAnswerMode(mode) {
        this.store.setAnswerMode(mode);
        return this.store.buildState();
    }
    setJDBiasEnabled(enabled) {
        this.store.setJDBiasEnabled(enabled);
        return this.store.buildState();
    }
    deleteDocumentsByType(docType) {
        if (docType === types_1.DocType.RESUME) {
            this.store.clearAllProjects();
            this.store.setIdentity({});
            this.store.setSkills([]);
            this.store.setKnowledgeEnabled(false);
            this.store.setActiveJD(null);
            this.store.setJDBiasEnabled(false);
            return;
        }
        if (docType === types_1.DocType.JD) {
            this.store.setActiveJD(null);
            this.store.setJDBiasEnabled(false);
            this.store.deleteDocumentsByKind(types_1.DocType.JD);
        }
    }
    async ingestDocument(filePath, docType) {
        const parsed = await ProjectAssetParser_1.ProjectAssetParser.parseFile(filePath);
        if (!parsed.text.trim()) {
            return { success: false, error: "No readable text found in the selected file." };
        }
        if (docType === types_1.DocType.RESUME) {
            return this.ingestResume(filePath, parsed.text);
        }
        if (docType === types_1.DocType.JD) {
            return this.ingestJD(filePath, parsed.text);
        }
        return { success: false, error: `Unsupported document type: ${docType}` };
    }
    async attachAssets(projectId, filePaths) {
        const project = this.store.getProject(projectId);
        if (!project)
            return { success: false, error: "Project not found." };
        const attached = [];
        for (const filePath of filePaths) {
            const parsed = await ProjectAssetParser_1.ProjectAssetParser.parseFile(filePath);
            if (!parsed.text.trim())
                continue;
            await this.ingestParsedAsset(projectId, parsed);
            attached.push({ name: parsed.name, kind: parsed.kind });
        }
        return { success: true, attached };
    }
    async attachRepo(projectId, repoPath) {
        const project = this.store.getProject(projectId);
        if (!project)
            return { success: false, error: "Project not found." };
        const parsedAssets = await ProjectAssetParser_1.ProjectAssetParser.parseRepo(repoPath);
        for (const parsed of parsedAssets) {
            if (!parsed.text.trim())
                continue;
            await this.ingestParsedAsset(projectId, parsed);
        }
        return {
            success: true,
            attachedCount: parsedAssets.length,
            repoPath: path_1.default.resolve(repoPath),
        };
    }
    feedInterviewerUtterance(message) {
        if (!message.trim())
            return;
        this.interviewerBuffer.push(message.trim());
        this.interviewerBuffer = this.interviewerBuffer.slice(-6);
    }
    async processQuestion(message) {
        const state = this.store.buildState();
        if (!state.projects.length)
            return null;
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
        const jdContext = state.jdBiasEnabled && state.activeJD
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
            introResponse: null,
            systemPromptInjection: this.buildSystemPrompt(state.answerMode, intent, targetProjects.length > 1),
            contextBlock,
            evidenceHits: finalHits,
        };
    }
    async ingestResume(filePath, resumeText) {
        const extracted = await this.extractResumeKnowledge(resumeText);
        const identity = {
            name: extracted.identity?.name || inferName(resumeText),
            email: extracted.identity?.email || extractEmail(resumeText),
            role: extracted.identity?.role || inferRoleFromResume(resumeText),
            summary: extracted.identity?.summary || "",
        };
        const projects = (extracted.projects?.length ? extracted.projects : fallbackProjectsFromResume(resumeText)).slice(0, 3);
        this.store.clearAllProjects();
        this.store.setIdentity(identity);
        this.store.setSkills(extracted.skills?.length ? extracted.skills : inferSkills(resumeText));
        const createdProjects = [];
        for (const projectInput of projects) {
            const factCard = this.buildFactCardFromInput(projectInput);
            const project = this.store.upsertProject({
                title: factCard.title,
                summary: factCard.summary,
                factCard,
                isActive: true,
            });
            createdProjects.push(project);
            const excerpt = this.buildProjectResumeExcerpt(projectInput, resumeText);
            await this.ingestParsedAsset(project.id, {
                kind: "resume",
                name: path_1.default.basename(filePath),
                sourcePath: filePath,
                text: excerpt,
                metadata: {
                    docType: types_1.DocType.RESUME,
                    source: "resume",
                },
            });
        }
        this.store.setActiveProjectIds(createdProjects.map((project) => project.id));
        return { success: true, projectCount: createdProjects.length, identity };
    }
    async ingestJD(filePath, jdText) {
        const jd = await this.extractJDKnowledge(jdText);
        this.store.setActiveJD(jd);
        this.store.setJDBiasEnabled(false);
        const targetProjectId = this.store.getActiveProjectIds()[0] || this.store.listProjects()[0]?.id;
        if (targetProjectId) {
            await this.ingestParsedAsset(targetProjectId, {
                kind: "jd",
                name: path_1.default.basename(filePath),
                sourcePath: filePath,
                text: jdText,
                metadata: {
                    docType: types_1.DocType.JD,
                    source: "jd",
                    jd,
                },
            });
        }
        return { success: true, jdBiasEnabled: false, jd };
    }
    buildFactCardFromInput(input) {
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
    buildProjectResumeExcerpt(projectInput, resumeText) {
        return [
            `Project title: ${projectInput.title}`,
            projectInput.role ? `Role: ${projectInput.role}` : "",
            projectInput.summary ? `Summary: ${projectInput.summary}` : "",
            projectInput.responsibilities?.length ? `Responsibilities: ${projectInput.responsibilities.join("; ")}` : "",
            projectInput.techStack?.length ? `Tech stack: ${projectInput.techStack.join(", ")}` : "",
            projectInput.metrics?.length ? `Metrics: ${projectInput.metrics.join("; ")}` : "",
            `Resume source excerpt: ${snippet(resumeText, 500)}`,
        ]
            .filter(Boolean)
            .join("\n");
    }
    async ingestParsedAsset(projectId, parsed) {
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
        this.store.replaceProjectChunks(projectId, {
            kind: parsed.kind,
            name: parsed.name,
            sourcePath: parsed.sourcePath,
            rawText: parsed.text,
            metadata: parsed.metadata,
        }, storedChunks);
    }
    async extractResumeKnowledge(resumeText) {
        if (!this.generateContentFn) {
            return {
                identity: {
                    name: inferName(resumeText),
                    email: extractEmail(resumeText),
                    role: inferRoleFromResume(resumeText),
                },
                skills: inferSkills(resumeText),
                projects: fallbackProjectsFromResume(resumeText),
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
- Keep at most 3 projects.
- Prefer the most technically deep projects.
- Use empty arrays instead of null.
- Use concise, concrete summaries.
- Do not mention uncertainty about ownership.

Resume:
${resumeText.slice(0, 12000)}
`;
        try {
            const raw = await this.generateContentFn([{ text: prompt }]);
            const jsonBlock = extractJsonBlock(raw);
            if (!jsonBlock)
                throw new Error("Model did not return JSON.");
            const parsed = safeJsonParse(jsonBlock, {});
            return {
                identity: parsed.identity || {},
                skills: dedupeList(parsed.skills),
                projects: Array.isArray(parsed.projects) ? parsed.projects : [],
            };
        }
        catch (error) {
            console.warn("[ProjectKnowledgeOrchestrator] Failed to extract resume JSON:", error);
            return {
                identity: {
                    name: inferName(resumeText),
                    email: extractEmail(resumeText),
                    role: inferRoleFromResume(resumeText),
                },
                skills: inferSkills(resumeText),
                projects: fallbackProjectsFromResume(resumeText),
            };
        }
    }
    async extractJDKnowledge(jdText) {
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
            if (!jsonBlock)
                throw new Error("Model did not return JSON.");
            const parsed = safeJsonParse(jsonBlock, {});
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
        }
        catch (error) {
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
    classifyQuestion(message) {
        const lower = message.toLowerCase();
        if (/introduce yourself|tell me about yourself|walk me through your background|自我介绍|介绍一下你自己/.test(lower)) {
            return "intro";
        }
        if (/trade[\s-]?off|why|architecture|design|planner|memory|tool routing|为什么|架构|设计|取舍/.test(lower)) {
            return "architecture";
        }
        if (/debug|issue|bug|incident|failure|排查|问题|故障|优化/.test(lower)) {
            return "debugging";
        }
        if (/across projects|examples|what experience|有哪些经验|总结/.test(lower)) {
            return "cross_project";
        }
        return "project_deep_dive";
    }
    selectTargetProjects(message, projects, activeProjectIds, intent) {
        const lowered = message.toLowerCase();
        const explicit = projects.filter((project) => lowered.includes(project.title.toLowerCase()));
        if (explicit.length)
            return explicit;
        const activeProjects = projects.filter((project) => activeProjectIds.includes(project.id));
        if (intent === "intro" || intent === "cross_project") {
            return activeProjects.length ? activeProjects : projects.slice(0, 3);
        }
        if (activeProjects.length === 1)
            return activeProjects;
        return activeProjects.length ? activeProjects : projects.slice(0, 1);
    }
    buildSystemPrompt(mode, intent, multipleProjects) {
        const styleInstruction = mode === "strict"
            ? "Use only claims supported by the provided project knowledge context. If evidence is thin, stay narrow and factual."
            : "Use the same evidence base, but rewrite it into a polished, interview-ready narrative without adding unsupported facts.";
        const scopeInstruction = multipleProjects
            ? "Only synthesize across multiple projects when the question is explicitly cross-project or introductory."
            : "Stay inside the selected project unless the question explicitly asks for broader synthesis.";
        const introInstruction = intent === "intro"
            ? "For self-introduction questions, prioritize the project fact cards and summarize them into a clean first-person narrative."
            : "For deep-dive questions, prioritize the project-local evidence hits and explain design choices concretely.";
        return [
            "You are the user's project-knowledge interview copilot.",
            "Treat every resume item and every attached project-library asset as first-party experience that the user can answer in first person.",
            "Do not question ownership or responsibility boundaries.",
            styleInstruction,
            scopeInstruction,
            introInstruction,
            'Always answer in two sections: "Answer" and "Evidence".',
            'The "Evidence" section must contain 2 to 3 short bullets that summarize the supporting sources.',
        ].join(" ");
    }
    async safeEmbed(fn, text) {
        if (!fn || !text.trim())
            return null;
        try {
            return await fn(text.slice(0, 6000));
        }
        catch (error) {
            console.warn("[ProjectKnowledgeOrchestrator] Embedding unavailable:", error);
            return null;
        }
    }
}
exports.ProjectKnowledgeOrchestrator = ProjectKnowledgeOrchestrator;
//# sourceMappingURL=ProjectKnowledgeOrchestrator.js.map
