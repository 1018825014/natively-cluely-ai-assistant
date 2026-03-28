import React, { useEffect, useMemo, useState } from "react";
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

      const targetProjectId =
        preferredProjectId ||
        selectedProjectId ||
        nextProjects?.[0]?.id ||
        nextState?.projects?.[0]?.id ||
        "";

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

  const loadProjectDetail = async (projectId: string) => {
    if (!projectId) return;
    setDetailLoading(true);
    try {
      const detail = await window.electronAPI?.projectLibraryGetProjectDetail?.(projectId);
      setSelectedProjectId(projectId);
      setProjectDetail(detail || null);
      setProjectDraft(detail?.project ? buildProjectDraft(detail.project) : null);
      const nextDrafts: Record<string, string> = {};
      for (const asset of detail?.assets || []) {
        nextDrafts[asset.id] = asset.rawText || "";
      }
      setAssetDrafts(nextDrafts);
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

  const activeProjectIds: string[] = libraryState?.activeProjectIds || [];
  const currentProjects = projects.length ? projects : libraryState?.projects || [];

  const selectedProject = useMemo(
    () => currentProjects.find((project: any) => project.id === selectedProjectId) || projectDetail?.project || null,
    [currentProjects, projectDetail, selectedProjectId]
  );

  const documentAssets = useMemo(
    () => (projectDetail?.assets || []).filter((asset: any) => asset.kind !== "repo" && asset.kind !== "code_file"),
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
            <h4 className="text-sm font-bold text-text-primary">Project Library</h4>
            <p className="text-[11px] text-text-secondary mt-1">
              Assets stay attached to a single project, and the detail panel lets you edit the card, document text, and repo entrypoints.
            </p>
          </div>
          <button
            onClick={() => refresh()}
            className="px-3 py-1.5 rounded-full border border-border-subtle text-[11px] text-text-secondary hover:text-text-primary hover:bg-bg-input transition-colors flex items-center gap-1.5"
          >
            {loading ? <RefreshCw size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Refresh
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
            <div className="text-[10px] uppercase tracking-wide text-text-tertiary">Knowledge Mode</div>
            <div className="text-sm font-semibold text-text-primary mt-1">{libraryState?.profileMode ? "Enabled" : "Disabled"}</div>
          </button>

          <div className="rounded-xl border border-border-subtle bg-bg-input px-4 py-3">
            <div className="text-[10px] uppercase tracking-wide text-text-tertiary mb-2">Answer Mode</div>
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
                  {mode === "strict" ? "Strict" : "Polished"}
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
            <div className="text-[10px] uppercase tracking-wide text-text-tertiary">JD Bias</div>
            <div className="text-sm font-semibold text-text-primary mt-1">
              {!libraryState?.hasActiveJD ? "No JD Uploaded" : libraryState?.jdBiasEnabled ? "Enabled" : "Disabled"}
            </div>
          </button>
        </div>
      </div>

      <div className="bg-bg-item-surface rounded-xl border border-border-subtle p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-sm font-bold text-text-primary">Add Project</h4>
            <p className="text-[11px] text-text-secondary mt-1">Create an extra manual card when the resume import misses something.</p>
          </div>
        </div>
        <div className="grid md:grid-cols-[1fr_1.5fr_auto] gap-3">
          <input
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            placeholder="Project title"
            className="bg-bg-input border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary"
          />
          <input
            value={newSummary}
            onChange={(event) => setNewSummary(event.target.value)}
            placeholder="One-line summary"
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
            {savingProject ? "Saving..." : "Save"}
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
            <div key={project.id} className={`bg-bg-item-surface rounded-xl border p-5 ${isSelected ? "border-accent-primary/40" : "border-border-subtle"}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-text-primary truncate">{project.title}</h4>
                    {isActive && <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />}
                  </div>
                  <p className="text-[11px] text-text-secondary mt-1 leading-relaxed">
                    {project.summary || factCard.summary || "No summary yet."}
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
                    onClick={() => loadProjectDetail(project.id)}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-medium border transition-colors ${
                      isSelected
                        ? "bg-accent-primary/10 text-accent-primary border-accent-primary/20"
                        : "bg-bg-input text-text-secondary border-border-subtle"
                    }`}
                  >
                    <PencilLine size={12} className="inline mr-1.5" />
                    Manage
                  </button>
                  <button
                    onClick={() => toggleProjectActive(project.id)}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors ${
                      isActive
                        ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                        : "bg-bg-input text-text-secondary border border-border-subtle"
                    }`}
                  >
                    {isActive ? "Active" : "Activate"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {selectedProject && projectDraft && (
        <div className="bg-bg-item-surface rounded-xl border border-border-subtle p-5 space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-bold text-text-primary">Project Detail</h4>
              <p className="text-[11px] text-text-secondary mt-1">
                Edit the interview fact card, update attached document text, or manage repo entrypoints for <span className="text-text-primary">{selectedProject.title}</span>.
              </p>
            </div>
            {detailLoading && <RefreshCw size={14} className="animate-spin text-text-secondary" />}
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <input value={projectDraft.title} onChange={(e) => setProjectDraft({ ...projectDraft, title: e.target.value })} placeholder="Title" className="bg-bg-input border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary" />
            <input value={projectDraft.role} onChange={(e) => setProjectDraft({ ...projectDraft, role: e.target.value })} placeholder="Role" className="bg-bg-input border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary" />
            <textarea value={projectDraft.summary} onChange={(e) => setProjectDraft({ ...projectDraft, summary: e.target.value })} placeholder="Summary" rows={3} className="md:col-span-2 bg-bg-input border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary resize-y" />
            <textarea value={projectDraft.responsibilities} onChange={(e) => setProjectDraft({ ...projectDraft, responsibilities: e.target.value })} placeholder="Responsibilities, one per line" rows={4} className="bg-bg-input border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary resize-y" />
            <textarea value={projectDraft.techStack} onChange={(e) => setProjectDraft({ ...projectDraft, techStack: e.target.value })} placeholder="Tech stack, one per line" rows={4} className="bg-bg-input border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary resize-y" />
            <textarea value={projectDraft.modules} onChange={(e) => setProjectDraft({ ...projectDraft, modules: e.target.value })} placeholder="Modules, one per line" rows={3} className="bg-bg-input border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary resize-y" />
            <textarea value={projectDraft.metrics} onChange={(e) => setProjectDraft({ ...projectDraft, metrics: e.target.value })} placeholder="Metrics, one per line" rows={3} className="bg-bg-input border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary resize-y" />
            <textarea value={projectDraft.highlights} onChange={(e) => setProjectDraft({ ...projectDraft, highlights: e.target.value })} placeholder="Highlights, one per line" rows={3} className="bg-bg-input border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary resize-y" />
            <textarea value={projectDraft.keywords} onChange={(e) => setProjectDraft({ ...projectDraft, keywords: e.target.value })} placeholder="Keywords, one per line" rows={3} className="bg-bg-input border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary resize-y" />
          </div>

          <div className="flex flex-wrap gap-2">
            <button onClick={saveProjectDraft} disabled={savingDraft} className="px-3 py-2 rounded-lg text-[11px] font-medium bg-text-primary text-bg-main hover:opacity-90 transition-colors flex items-center gap-2">
              {savingDraft ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />}
              {savingDraft ? "Saving..." : "Save Project"}
            </button>
            <button onClick={() => attachAssets(selectedProjectId)} className="px-3 py-2 rounded-lg text-[11px] font-medium border border-border-subtle bg-bg-input text-text-secondary hover:text-text-primary transition-colors flex items-center gap-2">
              <Upload size={12} />
              Attach Assets
            </button>
            <button onClick={() => attachRepo(selectedProjectId)} className="px-3 py-2 rounded-lg text-[11px] font-medium border border-border-subtle bg-bg-input text-text-secondary hover:text-text-primary transition-colors flex items-center gap-2">
              <FolderOpen size={12} />
              Attach Repo
            </button>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Code2 size={14} className="text-text-secondary" />
              <h5 className="text-sm font-semibold text-text-primary">Attached Repos</h5>
            </div>
            {repos.length === 0 ? (
              <div className="text-[11px] text-text-secondary border border-dashed border-border-subtle rounded-lg px-3 py-3">No repo attached yet.</div>
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
                        <div className="text-[10px] text-text-tertiary mt-2">{repo.codeFileCount} indexed code files</div>
                      </div>
                      <div className="flex flex-wrap gap-2 shrink-0">
                        <button onClick={() => replaceRepo(repo.repoRoot)} disabled={busy} className="px-2.5 py-1.5 rounded-md text-[10px] border border-border-subtle text-text-secondary hover:text-text-primary">Replace</button>
                        <button onClick={() => reindexRepo(repo.repoRoot)} disabled={busy} className="px-2.5 py-1.5 rounded-md text-[10px] border border-border-subtle text-text-secondary hover:text-text-primary">Reindex</button>
                        <button onClick={() => deleteRepo(repo.repoRoot)} disabled={busy} className="px-2.5 py-1.5 rounded-md text-[10px] border border-red-500/20 text-red-400 hover:text-red-300">Delete</button>
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
              <h5 className="text-sm font-semibold text-text-primary">Document Assets</h5>
            </div>
            {documentAssets.length === 0 ? (
              <div className="text-[11px] text-text-secondary border border-dashed border-border-subtle rounded-lg px-3 py-3">No editable document assets attached yet.</div>
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
                      Delete
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
                    {assetSavingId === asset.id ? "Rebuilding..." : "Save Asset Text"}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {libraryState?.lastEvidenceHits?.length > 0 && (
        <div className="bg-bg-item-surface rounded-xl border border-border-subtle p-5">
          <div className="flex items-center gap-2 mb-3">
            <FileText size={14} className="text-text-secondary" />
            <h4 className="text-sm font-bold text-text-primary">Recent Evidence Hits</h4>
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
