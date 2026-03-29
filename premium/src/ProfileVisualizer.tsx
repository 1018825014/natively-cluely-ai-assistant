import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Code2,
  FileText,
  FolderOpen,
  PencilLine,
  RefreshCw,
  Save,
  Trash2,
  Upload,
} from "lucide-react";

type VisualizerProps = {
  profileData?: any;
  onProfileDataChange?: (data: any) => void;
};

function joinList(values: any): string {
  return Array.isArray(values) ? values.join("\n") : "";
}

function parseList(value: string): string[] {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildProjectDraft(project: any) {
  const factCard = project?.factCard || {};
  return {
    id: project?.id || "",
    title: project?.title || factCard.title || "",
    role: factCard.role || "",
    summary: project?.summary || factCard.summary || "",
    responsibilities: joinList(factCard.responsibilities),
    techStack: joinList(factCard.techStack),
    modules: joinList(factCard.modules),
    metrics: joinList(factCard.metrics),
    highlights: joinList(factCard.highlights),
    keywords: joinList(factCard.keywords),
  };
}

export const ProfileVisualizer: React.FC<VisualizerProps> = ({ profileData, onProfileDataChange }) => {
  const [projects, setProjects] = useState<any[]>([]);
  const [libraryState, setLibraryState] = useState<any>(profileData || null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [savingProject, setSavingProject] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [assetSavingId, setAssetSavingId] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [projectDetail, setProjectDetail] = useState<any>(null);
  const [projectDraft, setProjectDraft] = useState<any>(null);
  const [assetDrafts, setAssetDrafts] = useState<Record<string, string>>({});
  const [repoBusyKey, setRepoBusyKey] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newSummary, setNewSummary] = useState("");
  const detailPanelRef = useRef<HTMLDivElement | null>(null);
  const shouldScrollToDetailRef = useRef(false);

  const refresh = async (preferredProjectId?: string) => {
    setLoading(true);
    try {
      const [nextProjects, nextState] = await Promise.all([
        window.electronAPI?.projectLibraryListProjects?.(),
        window.electronAPI?.profileGetProfile?.(),
      ]);
      setProjects(nextProjects || []);
      setLibraryState(nextState || null);
      if (nextState) onProfileDataChange?.(nextState);

      const visibleProjects = (nextProjects?.length ? nextProjects : nextState?.projects) || [];
      const candidateProjectId = preferredProjectId || selectedProjectId || "";
      const targetProjectId = visibleProjects.some((project: any) => project.id === candidateProjectId)
        ? candidateProjectId
        : "";

      if (targetProjectId) {
        await loadProjectDetail(targetProjectId);
      } else {
        setSelectedProjectId("");
        setProjectDetail(null);
        setProjectDraft(null);
        setAssetDrafts({});
      }
    } finally {
      setLoading(false);
    }
  };

  const loadProjectDetail = async (projectId: string, options?: { scrollIntoView?: boolean }) => {
    if (!projectId) return;
    const fallbackProjects = projects.length ? projects : libraryState?.projects || [];
    const fallbackProject = fallbackProjects.find((project: any) => project.id === projectId) || null;
    if (options?.scrollIntoView) {
      shouldScrollToDetailRef.current = true;
    }
    setSelectedProjectId(projectId);
    if (fallbackProject) {
      setProjectDetail((current: any) => (current?.project?.id === projectId ? current : { project: fallbackProject, assets: [], repos: [] }));
      setProjectDraft(buildProjectDraft(fallbackProject));
      setAssetDrafts({});
    }
    setDetailLoading(true);
    try {
      const detail = await window.electronAPI?.projectLibraryGetProjectDetail?.(projectId);
      setProjectDetail(detail || null);
      setProjectDraft(detail?.project ? buildProjectDraft(detail.project) : null);
      const nextDrafts: Record<string, string> = {};
      for (const asset of detail?.assets || []) {
        nextDrafts[asset.id] = asset.rawText || "";
      }
      setAssetDrafts(nextDrafts);
    } catch (error) {
      console.error("[ProfileVisualizer] Failed to load project detail:", error);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    setLibraryState(profileData || null);
    if (profileData) onProfileDataChange?.(profileData);
  }, [profileData, onProfileDataChange]);

  useEffect(() => {
    refresh().catch(() => {});
  }, []);

  useEffect(() => {
    if (!shouldScrollToDetailRef.current || !detailPanelRef.current || !projectDraft) {
      return;
    }

    detailPanelRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    shouldScrollToDetailRef.current = false;
  }, [projectDraft, selectedProjectId]);

  const activeProjectIds: string[] = libraryState?.activeProjectIds || [];
  const currentProjects = projects.length ? projects : libraryState?.projects || [];

  const selectedProject = useMemo(
    () => currentProjects.find((project: any) => project.id === selectedProjectId) || projectDetail?.project || null,
    [currentProjects, projectDetail, selectedProjectId]
  );

  const resumeSourceAsset = useMemo(
    () => (projectDetail?.assets || []).find((asset: any) => asset.kind === "resume") || null,
    [projectDetail]
  );

  const documentAssets = useMemo(
    () =>
      (projectDetail?.assets || []).filter(
        (asset: any) => asset.kind !== "repo" && asset.kind !== "code_file" && asset.kind !== "resume"
      ),
    [projectDetail]
  );

  const repos = useMemo(() => projectDetail?.repos || [], [projectDetail]);

  const toggleProjectActive = async (projectId: string) => {
    const next = activeProjectIds.includes(projectId)
      ? activeProjectIds.filter((id) => id !== projectId)
      : [...activeProjectIds, projectId];

    await window.electronAPI?.projectLibrarySetActiveProjects?.(next);
    await refresh(projectId);
  };

  const attachAssets = async (projectId: string) => {
    const selected = await window.electronAPI?.projectLibrarySelectAssets?.();
    if (selected?.cancelled || !selected?.filePaths?.length) return;
    await window.electronAPI?.projectLibraryAttachAssets?.({ projectId, filePaths: selected.filePaths });
    await refresh(projectId);
  };

  const attachRepo = async (projectId: string) => {
    const selected = await window.electronAPI?.projectLibrarySelectRepo?.();
    if (selected?.cancelled || !selected?.repoPath) return;
    await window.electronAPI?.projectLibraryAttachRepo?.({ projectId, repoPath: selected.repoPath });
    await refresh(projectId);
  };

  const saveNewProject = async () => {
    if (!newTitle.trim()) return;
    setSavingProject(true);
    try {
      const result = await window.electronAPI?.projectLibraryUpsertProject?.({
        title: newTitle.trim(),
        summary: newSummary.trim(),
        responsibilities: [],
        techStack: [],
        modules: [],
        metrics: [],
        highlights: [],
        keywords: [],
      });
      setNewTitle("");
      setNewSummary("");
      await refresh(result?.project?.id);
    } finally {
      setSavingProject(false);
    }
  };

  const saveProjectDraft = async () => {
    if (!projectDraft?.id) return;
    setSavingDraft(true);
    try {
      await window.electronAPI?.projectLibraryUpdateProject?.({
        id: projectDraft.id,
        title: projectDraft.title.trim(),
        role: projectDraft.role.trim(),
        summary: projectDraft.summary.trim(),
        responsibilities: parseList(projectDraft.responsibilities),
        techStack: parseList(projectDraft.techStack),
        modules: parseList(projectDraft.modules),
        metrics: parseList(projectDraft.metrics),
        highlights: parseList(projectDraft.highlights),
        keywords: parseList(projectDraft.keywords),
      });
      await refresh(projectDraft.id);
    } finally {
      setSavingDraft(false);
    }
  };

  const saveAssetText = async (assetId: string) => {
    setAssetSavingId(assetId);
    try {
      await window.electronAPI?.projectLibraryUpdateAssetText?.({
        assetId,
        rawText: assetDrafts[assetId] || "",
      });
      await refresh(selectedProjectId);
    } finally {
      setAssetSavingId("");
    }
  };

  const deleteAsset = async (assetId: string) => {
    await window.electronAPI?.projectLibraryDeleteAsset?.(assetId);
    await refresh(selectedProjectId);
  };

  const deleteProject = async () => {
    if (!selectedProjectId) return;
    if (!window.confirm("确认删除这个项目吗？该项目下的完整内容、附件和仓库索引都会一起删除。")) {
      return;
    }

    await window.electronAPI?.projectLibraryDeleteProject?.(selectedProjectId);
    await refresh();
  };

  const replaceRepo = async (repoRoot: string) => {
    const selected = await window.electronAPI?.projectLibrarySelectRepo?.();
    if (selected?.cancelled || !selected?.repoPath || !selectedProjectId) return;
    setRepoBusyKey(`replace:${repoRoot}`);
    try {
      await window.electronAPI?.projectLibraryReplaceRepo?.({
        projectId: selectedProjectId,
        repoRoot,
        repoPath: selected.repoPath,
      });
      await refresh(selectedProjectId);
    } finally {
      setRepoBusyKey("");
    }
  };

  const reindexRepo = async (repoRoot: string) => {
    if (!selectedProjectId) return;
    setRepoBusyKey(`reindex:${repoRoot}`);
    try {
      await window.electronAPI?.projectLibraryReindexRepo?.({
        projectId: selectedProjectId,
        repoRoot,
      });
      await refresh(selectedProjectId);
    } finally {
      setRepoBusyKey("");
    }
  };

  const deleteRepo = async (repoRoot: string) => {
    if (!selectedProjectId) return;
    setRepoBusyKey(`delete:${repoRoot}`);
    try {
      await window.electronAPI?.projectLibraryDeleteRepo?.({
        projectId: selectedProjectId,
        repoRoot,
      });
      await refresh(selectedProjectId);
    } finally {
      setRepoBusyKey("");
    }
  };

  if (!libraryState?.projects?.length && !projects.length) {
    return null;
  }

  return (
    <div className="mt-5 space-y-5">
      <div className="bg-bg-item-surface rounded-xl border border-border-subtle p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h4 className="text-sm font-bold text-text-primary">{"\u9879\u76ee\u77e5\u8bc6\u5e93"}</h4>
            <p className="text-[11px] text-text-secondary mt-1">
              {"\u8d44\u6599\u4f1a\u5f52\u5c5e\u4e8e\u5355\u4e2a\u9879\u76ee\uff0c\u53f3\u4fa7\u8be6\u60c5\u9762\u677f\u53ef\u76f4\u63a5\u7f16\u8f91\u9879\u76ee\u5361\u3001\u6587\u6863\u6587\u672c\u548c\u4ed3\u5e93\u5165\u53e3\u3002"}
            </p>
          </div>
          <button
            onClick={() => refresh()}
            className="px-3 py-1.5 rounded-full border border-border-subtle text-[11px] text-text-secondary hover:text-text-primary hover:bg-bg-input transition-colors flex items-center gap-1.5"
          >
            {loading ? <RefreshCw size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            {"\u5237\u65b0"}
          </button>
        </div>

        <div className="grid md:grid-cols-3 gap-3">
          <button
            onClick={async () => {
              await window.electronAPI?.profileSetMode?.(!libraryState?.profileMode);
              await refresh(selectedProjectId);
            }}
            className={`rounded-xl border px-4 py-3 text-left transition-colors ${
              libraryState?.profileMode ? "border-emerald-500/30 bg-emerald-500/5" : "border-border-subtle bg-bg-input"
            }`}
          >
            <div className="text-[10px] uppercase tracking-wide text-text-tertiary">{"\u77e5\u8bc6\u5e93\u6a21\u5f0f"}</div>
            <div className="text-sm font-semibold text-text-primary mt-1">
              {libraryState?.profileMode ? "\u5df2\u5f00\u542f" : "\u5df2\u5173\u95ed"}
            </div>
          </button>

          <div className="rounded-xl border border-border-subtle bg-bg-input px-4 py-3">
            <div className="text-[10px] uppercase tracking-wide text-text-tertiary mb-2">{"\u56de\u7b54\u6a21\u5f0f"}</div>
            <div className="flex gap-2">
              {(["strict", "polished"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={async () => {
                    await window.electronAPI?.projectLibrarySetAnswerMode?.(mode);
                    await refresh(selectedProjectId);
                  }}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors ${
                    libraryState?.answerMode === mode
                      ? "bg-text-primary text-bg-main"
                      : "bg-bg-item-surface text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {mode === "strict" ? "\u4e25\u683c" : "\u6da6\u8272"}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={async () => {
              await window.electronAPI?.projectLibrarySetJDBias?.(!libraryState?.jdBiasEnabled);
              await refresh(selectedProjectId);
            }}
            disabled={!libraryState?.hasActiveJD}
            className={`rounded-xl border px-4 py-3 text-left transition-colors ${
              !libraryState?.hasActiveJD
                ? "border-border-subtle bg-bg-input opacity-50 cursor-not-allowed"
                : libraryState?.jdBiasEnabled
                  ? "border-blue-500/30 bg-blue-500/5"
                  : "border-border-subtle bg-bg-input"
            }`}
          >
            <div className="text-[10px] uppercase tracking-wide text-text-tertiary">{"JD \u504f\u5411"}</div>
            <div className="text-sm font-semibold text-text-primary mt-1">
              {!libraryState?.hasActiveJD ? "\u672a\u4e0a\u4f20 JD" : libraryState?.jdBiasEnabled ? "\u5df2\u5f00\u542f" : "\u5df2\u5173\u95ed"}
            </div>
          </button>
        </div>
      </div>

      <div className="bg-bg-item-surface rounded-xl border border-border-subtle p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-sm font-bold text-text-primary">{"\u65b0\u589e\u9879\u76ee"}</h4>
            <p className="text-[11px] text-text-secondary mt-1">
              {"\u5982\u679c\u7b80\u5386\u5bfc\u5165\u6f0f\u6389\u4e86\u9879\u76ee\uff0c\u53ef\u4ee5\u5728\u8fd9\u91cc\u624b\u52a8\u8865\u4e00\u5f20\u9879\u76ee\u5361\u3002"}
            </p>
          </div>
        </div>
        <div className="grid md:grid-cols-[1fr_1.5fr_auto] gap-3">
          <input
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            placeholder="\u9879\u76ee\u6807\u9898"
            className="bg-bg-input border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary"
          />
          <input
            value={newSummary}
            onChange={(event) => setNewSummary(event.target.value)}
            placeholder="\u4e00\u53e5\u8bdd\u6982\u8ff0"
            className="bg-bg-input border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary"
          />
          <button
            onClick={saveNewProject}
            disabled={savingProject || !newTitle.trim()}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              savingProject || !newTitle.trim()
                ? "bg-bg-input text-text-tertiary cursor-not-allowed"
                : "bg-text-primary text-bg-main hover:opacity-90"
            }`}
          >
            {savingProject ? "\u4fdd\u5b58\u4e2d..." : "\u4fdd\u5b58"}
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {currentProjects.map((project: any) => {
          const isActive = activeProjectIds.includes(project.id);
          const factCard = project.factCard || {};
          const tags = factCard.techStack || [];
          const isSelected = project.id === selectedProjectId;

          return (
            <div
              key={project.id}
              onClick={() => loadProjectDetail(project.id, { scrollIntoView: true })}
              className={`bg-bg-item-surface rounded-xl border p-5 cursor-pointer transition-colors ${isSelected ? "border-accent-primary/40" : "border-border-subtle hover:border-accent-primary/20"}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-text-primary truncate">{project.title}</h4>
                    {isActive && <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />}
                    {isSelected && (
                      <span className="px-2 py-0.5 rounded-full bg-accent-primary/10 text-accent-primary text-[10px] font-medium">
                        {"\u5f53\u524d\u7f16\u8f91"}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-text-secondary mt-1 leading-relaxed">
                    {project.summary || factCard.summary || "\u6682\u672a\u586b\u5199\u6982\u8ff0\u3002"}
                  </p>
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {tags.slice(0, 8).map((tag: string) => (
                        <span key={tag} className="px-2 py-1 rounded-md bg-bg-input border border-border-subtle text-[10px] text-text-secondary">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      loadProjectDetail(project.id, { scrollIntoView: true });
                    }}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-medium border transition-colors ${
                      isSelected
                        ? "bg-accent-primary/10 text-accent-primary border-accent-primary/20"
                        : "bg-bg-input text-text-secondary border-border-subtle"
                    }`}
                  >
                    <PencilLine size={12} className="inline mr-1.5" />
                    {isSelected ? "\u5df2\u6253\u5f00" : "\u7ba1\u7406"}
                  </button>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleProjectActive(project.id);
                    }}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors ${
                      isActive
                        ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                        : "bg-bg-input text-text-secondary border border-border-subtle"
                    }`}
                  >
                    {isActive ? "\u5df2\u542f\u7528" : "\u542f\u7528"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {selectedProject && projectDraft ? (
        <div ref={detailPanelRef} className="bg-bg-item-surface rounded-xl border border-border-subtle p-5 space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-bold text-text-primary">{"\u9879\u76ee\u8be6\u60c5"}</h4>
              <p className="text-[11px] text-text-secondary mt-1">
                {"\u4f60\u53ef\u4ee5\u7f16\u8f91\u9762\u8bd5\u9879\u76ee\u5361\u3001\u66f4\u65b0\u9644\u52a0\u6587\u6863\u6587\u672c\uff0c\u6216\u7ba1\u7406 "}
                <span className="text-text-primary">{selectedProject.title}</span>
                {" \u7684\u4ed3\u5e93\u5165\u53e3\u3002"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={deleteProject}
                className="px-3 py-2 rounded-lg text-[11px] font-medium border border-red-500/20 text-red-400 hover:text-red-300 transition-colors flex items-center gap-2"
              >
                <Trash2 size={12} />
                {"删除项目"}
              </button>
              {detailLoading && <RefreshCw size={14} className="animate-spin text-text-secondary" />}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <input value={projectDraft.title} onChange={(e) => setProjectDraft({ ...projectDraft, title: e.target.value })} placeholder="\u9879\u76ee\u6807\u9898" className="bg-bg-input border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary" />
            <input value={projectDraft.role} onChange={(e) => setProjectDraft({ ...projectDraft, role: e.target.value })} placeholder="\u62c5\u4efb\u89d2\u8272" className="bg-bg-input border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary" />
            <textarea value={projectDraft.summary} onChange={(e) => setProjectDraft({ ...projectDraft, summary: e.target.value })} placeholder="\u9879\u76ee\u6982\u8ff0" rows={3} className="md:col-span-2 bg-bg-input border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary resize-y" />
            <textarea value={projectDraft.responsibilities} onChange={(e) => setProjectDraft({ ...projectDraft, responsibilities: e.target.value })} placeholder="\u804c\u8d23\u5185\u5bb9\uff0c\u6bcf\u884c\u4e00\u6761" rows={4} className="bg-bg-input border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary resize-y" />
            <textarea value={projectDraft.techStack} onChange={(e) => setProjectDraft({ ...projectDraft, techStack: e.target.value })} placeholder="\u6280\u672f\u6808\uff0c\u6bcf\u884c\u4e00\u6761" rows={4} className="bg-bg-input border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary resize-y" />
            <textarea value={projectDraft.modules} onChange={(e) => setProjectDraft({ ...projectDraft, modules: e.target.value })} placeholder="\u6a21\u5757\u62c6\u5206\uff0c\u6bcf\u884c\u4e00\u6761" rows={3} className="bg-bg-input border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary resize-y" />
            <textarea value={projectDraft.metrics} onChange={(e) => setProjectDraft({ ...projectDraft, metrics: e.target.value })} placeholder="\u6307\u6807\u6216\u7ed3\u679c\uff0c\u6bcf\u884c\u4e00\u6761" rows={3} className="bg-bg-input border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary resize-y" />
            <textarea value={projectDraft.highlights} onChange={(e) => setProjectDraft({ ...projectDraft, highlights: e.target.value })} placeholder="\u4eae\u70b9\u5185\u5bb9\uff0c\u6bcf\u884c\u4e00\u6761" rows={3} className="bg-bg-input border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary resize-y" />
            <textarea value={projectDraft.keywords} onChange={(e) => setProjectDraft({ ...projectDraft, keywords: e.target.value })} placeholder="\u5173\u952e\u8bcd\uff0c\u6bcf\u884c\u4e00\u6761" rows={3} className="bg-bg-input border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary resize-y" />
          </div>

          <div className="flex flex-wrap gap-2">
            <button onClick={saveProjectDraft} disabled={savingDraft} className="px-3 py-2 rounded-lg text-[11px] font-medium bg-text-primary text-bg-main hover:opacity-90 transition-colors flex items-center gap-2">
              {savingDraft ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />}
              {savingDraft ? "\u4fdd\u5b58\u4e2d..." : "\u4fdd\u5b58\u9879\u76ee"}
            </button>
            <button onClick={() => attachAssets(selectedProjectId)} className="px-3 py-2 rounded-lg text-[11px] font-medium border border-border-subtle bg-bg-input text-text-secondary hover:text-text-primary transition-colors flex items-center gap-2">
              <Upload size={12} />
              {"\u6dfb\u52a0\u8d44\u6599"}
            </button>
            <button onClick={() => attachRepo(selectedProjectId)} className="px-3 py-2 rounded-lg text-[11px] font-medium border border-border-subtle bg-bg-input text-text-secondary hover:text-text-primary transition-colors flex items-center gap-2">
              <FolderOpen size={12} />
              {"\u5173\u8054\u4ed3\u5e93"}
            </button>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <FileText size={14} className="text-text-secondary" />
              <h5 className="text-sm font-semibold text-text-primary">{"项目完整内容"}</h5>
            </div>
            {resumeSourceAsset ? (
              <div className="rounded-lg border border-border-subtle bg-bg-input px-3 py-3 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-text-primary truncate">{resumeSourceAsset.name || selectedProject.title}</div>
                    <div className="text-[10px] uppercase tracking-wide text-text-tertiary mt-1">{"resume"}</div>
                  </div>
                  <button
                    onClick={() => deleteAsset(resumeSourceAsset.id)}
                    className="px-2.5 py-1.5 rounded-md text-[10px] border border-red-500/20 text-red-400 hover:text-red-300 flex items-center gap-1.5"
                  >
                    <Trash2 size={10} />
                    {"删除"}
                  </button>
                </div>
                <textarea
                  value={assetDrafts[resumeSourceAsset.id] || ""}
                  onChange={(e) => setAssetDrafts((prev) => ({ ...prev, [resumeSourceAsset.id]: e.target.value }))}
                  rows={12}
                  className="w-full bg-bg-main border border-border-subtle rounded-lg px-3 py-2 text-xs text-text-primary resize-y"
                />
                <button
                  onClick={() => saveAssetText(resumeSourceAsset.id)}
                  disabled={assetSavingId === resumeSourceAsset.id}
                  className="px-3 py-2 rounded-lg text-[11px] font-medium bg-text-primary text-bg-main hover:opacity-90 transition-colors flex items-center gap-2"
                >
                  {assetSavingId === resumeSourceAsset.id ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />}
                  {assetSavingId === resumeSourceAsset.id ? "\u91cd\u5efa\u4e2d..." : "保存完整内容"}
                </button>
              </div>
            ) : (
              <div className="text-[11px] text-text-secondary border border-dashed border-border-subtle rounded-lg px-3 py-3">
                {"当前项目还没有保存完整来源内容。重新导入简历后，这里会显示并支持直接编辑。"}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Code2 size={14} className="text-text-secondary" />
              <h5 className="text-sm font-semibold text-text-primary">{"\u5df2\u5173\u8054\u4ed3\u5e93"}</h5>
            </div>
            {repos.length === 0 ? (
              <div className="text-[11px] text-text-secondary border border-dashed border-border-subtle rounded-lg px-3 py-3">{"\u6682\u672a\u5173\u8054\u4ed3\u5e93\u3002"}</div>
            ) : (
              repos.map((repo: any) => {
                const replaceKey = `replace:${repo.repoRoot}`;
                const reindexKey = `reindex:${repo.repoRoot}`;
                const deleteKey = `delete:${repo.repoRoot}`;
                const busy = repoBusyKey === replaceKey || repoBusyKey === reindexKey || repoBusyKey === deleteKey;

                return (
                  <div key={repo.repoRoot} className="rounded-lg border border-border-subtle bg-bg-input px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-text-primary truncate">{repo.repoName}</div>
                        <div className="text-[11px] text-text-secondary mt-1 break-all">{repo.sourcePath || repo.repoRoot}</div>
                        <div className="text-[10px] text-text-tertiary mt-2">{repo.codeFileCount} {"\u4e2a\u5df2\u7d22\u5f15\u4ee3\u7801\u6587\u4ef6"}</div>
                      </div>
                      <div className="flex flex-wrap gap-2 shrink-0">
                        <button onClick={() => replaceRepo(repo.repoRoot)} disabled={busy} className="px-2.5 py-1.5 rounded-md text-[10px] border border-border-subtle text-text-secondary hover:text-text-primary">{"\u66ff\u6362\u8def\u5f84"}</button>
                        <button onClick={() => reindexRepo(repo.repoRoot)} disabled={busy} className="px-2.5 py-1.5 rounded-md text-[10px] border border-border-subtle text-text-secondary hover:text-text-primary">{"\u91cd\u5efa\u7d22\u5f15"}</button>
                        <button onClick={() => deleteRepo(repo.repoRoot)} disabled={busy} className="px-2.5 py-1.5 rounded-md text-[10px] border border-red-500/20 text-red-400 hover:text-red-300">{"\u5220\u9664"}</button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <FileText size={14} className="text-text-secondary" />
              <h5 className="text-sm font-semibold text-text-primary">{"\u6587\u6863\u8d44\u6599"}</h5>
            </div>
            {documentAssets.length === 0 ? (
              <div className="text-[11px] text-text-secondary border border-dashed border-border-subtle rounded-lg px-3 py-3">{"\u6682\u672a\u9644\u52a0\u53ef\u7f16\u8f91\u7684\u6587\u6863\u8d44\u6599\u3002"}</div>
            ) : (
              documentAssets.map((asset: any) => (
                <div key={asset.id} className="rounded-lg border border-border-subtle bg-bg-input px-3 py-3 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-text-primary truncate">{asset.name}</div>
                      <div className="text-[10px] uppercase tracking-wide text-text-tertiary mt-1">{asset.kind}</div>
                    </div>
                    <button onClick={() => deleteAsset(asset.id)} className="px-2.5 py-1.5 rounded-md text-[10px] border border-red-500/20 text-red-400 hover:text-red-300 flex items-center gap-1.5">
                      <Trash2 size={10} />
                      {"\u5220\u9664"}
                    </button>
                  </div>
                  <textarea
                    value={assetDrafts[asset.id] || ""}
                    onChange={(e) => setAssetDrafts((prev) => ({ ...prev, [asset.id]: e.target.value }))}
                    rows={8}
                    className="w-full bg-bg-main border border-border-subtle rounded-lg px-3 py-2 text-xs text-text-primary resize-y"
                  />
                  <button
                    onClick={() => saveAssetText(asset.id)}
                    disabled={assetSavingId === asset.id}
                    className="px-3 py-2 rounded-lg text-[11px] font-medium bg-text-primary text-bg-main hover:opacity-90 transition-colors flex items-center gap-2"
                  >
                    {assetSavingId === asset.id ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />}
                    {assetSavingId === asset.id ? "\u91cd\u5efa\u4e2d..." : "\u4fdd\u5b58\u8d44\u6599\u6587\u672c"}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <div ref={detailPanelRef} className="bg-bg-item-surface rounded-xl border border-dashed border-border-subtle p-5">
          <h4 className="text-sm font-bold text-text-primary">{"\u9879\u76ee\u8be6\u60c5"}</h4>
          <p className="text-[11px] text-text-secondary mt-2 leading-relaxed">
            {"\u8bf7\u5148\u9009\u62e9\u4e00\u5f20\u9879\u76ee\u5361\uff0c\u518d\u70b9\u51fb\u201c\u7ba1\u7406\u201d\uff0c\u5373\u53ef\u5728\u8fd9\u91cc\u7f16\u8f91\u9879\u76ee\u5185\u5bb9\u3001\u9644\u4ef6\u548c\u4ed3\u5e93\u3002"}
          </p>
        </div>
      )}

      {libraryState?.lastEvidenceHits?.length > 0 && (
        <div className="bg-bg-item-surface rounded-xl border border-border-subtle p-5">
          <div className="flex items-center gap-2 mb-3">
            <FileText size={14} className="text-text-secondary" />
            <h4 className="text-sm font-bold text-text-primary">{"\u6700\u8fd1\u547d\u4e2d\u7684\u8bc1\u636e"}</h4>
          </div>
          <div className="space-y-3">
            {libraryState.lastEvidenceHits.map((hit: any) => (
              <div key={hit.id} className="rounded-lg border border-border-subtle bg-bg-input px-3 py-2">
                <div className="flex items-center gap-2 text-[11px] text-text-secondary">
                  {hit.sourceType === "code" ? <Code2 size={12} /> : <FileText size={12} />}
                  <span>{hit.projectTitle}</span>
                  <span>/</span>
                  <span>{hit.label}</span>
                </div>
                <div className="text-xs text-text-primary mt-1 leading-relaxed">{hit.snippet}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
