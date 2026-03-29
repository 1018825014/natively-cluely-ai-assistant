export enum DocType {
  RESUME = "resume",
  JD = "jd",
}

export type AnswerMode = "strict" | "polished";

export type ProjectAssetKind =
  | "resume"
  | "jd"
  | "pdf"
  | "docx"
  | "txt"
  | "md"
  | "ipynb"
  | "image"
  | "transcript"
  | "repo"
  | "code_file"
  | "code_summary"
  | "text";

export interface ProjectFactCard {
  title: string;
  role?: string;
  summary: string;
  responsibilities: string[];
  techStack: string[];
  modules: string[];
  metrics: string[];
  highlights: string[];
  keywords: string[];
}

export interface ResumeIdentity {
  name?: string;
  email?: string;
  role?: string;
  summary?: string;
}

export interface JDProfile {
  title?: string;
  company?: string;
  location?: string;
  level?: string;
  summary?: string;
  technologies: string[];
  requirements: string[];
  keywords: string[];
  compensationHint?: string;
}

export interface ResumeProjectInput {
  id?: string;
  title: string;
  summary?: string;
  role?: string;
  responsibilities?: string[];
  techStack?: string[];
  modules?: string[];
  metrics?: string[];
  highlights?: string[];
  keywords?: string[];
  sourceExcerpt?: string;
  isActive?: boolean;
}

export interface ResumeImportPreviewProject extends ResumeProjectInput {
  previewId: string;
  sourceExcerpt?: string;
}

export interface ResumeImportPreview {
  filePath: string;
  identity: ResumeIdentity;
  skills: string[];
  projectCount: number;
  projects: ResumeImportPreviewProject[];
  createdAt: string;
}

export interface ResumeImportMapping {
  previewId: string;
  projectId?: string | null;
}

export interface ProjectRecord {
  id: string;
  title: string;
  summary: string;
  factCard: ProjectFactCard;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  assetCount?: number;
  chunkCount?: number;
}

export interface AssetRecord {
  id: string;
  projectId: string;
  kind: ProjectAssetKind;
  name: string;
  sourcePath: string | null;
  status: "ready" | "processing" | "failed";
  metadata: Record<string, any>;
  rawText?: string;
  createdAt?: string;
  updatedAt?: string;
  chunkCount?: number;
}

export interface ParsedAssetContent {
  kind: ProjectAssetKind;
  name: string;
  sourcePath: string;
  text: string;
  metadata?: Record<string, any>;
}

export interface RepoAttachmentSummary {
  repoRoot: string;
  repoName: string;
  sourcePath: string | null;
  repoAssetId?: string;
  codeFileCount: number;
  totalAssets: number;
}

export interface EvidenceHit {
  id: string;
  projectId: string;
  projectTitle: string;
  label: string;
  sourceType: "project_card" | "document" | "code" | "transcript" | "jd";
  score: number;
  content: string;
  snippet: string;
  metadata?: Record<string, any>;
}

export interface KnowledgeStatus {
  hasResume: boolean;
  hasJD: boolean;
  activeMode: boolean;
  answerMode: AnswerMode;
  jdBiasEnabled: boolean;
  activeProjectIds: string[];
  resumeSummary?: {
    name?: string;
    role?: string;
    totalExperienceYears?: number;
    projectCount?: number;
  };
}

export interface ProjectLibraryState {
  identity: ResumeIdentity;
  skills: string[];
  projects: ProjectRecord[];
  activeProjectIds: string[];
  answerMode: AnswerMode;
  profileMode: boolean;
  hasActiveJD: boolean;
  activeJD: JDProfile | null;
  jdBiasEnabled: boolean;
  lastEvidenceHits: EvidenceHit[];
  preferredResumeProjectCount: number;
}
