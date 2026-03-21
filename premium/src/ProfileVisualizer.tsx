import React, { useEffect, useState } from "react";
import { CheckCircle2, Code2, FileText, FolderOpen, RefreshCw, Upload } from "lucide-react";

type VisualizerProps = {
  profileData?: any;
};

export const ProfileVisualizer: React.FC<VisualizerProps> = ({ profileData }) => {
  const [projects, setProjects] = useState<any[]>([]);
  const [libraryState, setLibraryState] = useState<any>(profileData || null);
  const [loading, setLoading] = useState(false);
  const [savingProject, setSavingProject] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newSummary, setNewSummary] = useState("");

  const refresh = async () => {
    setLoading(true);
    try {
      const [nextProjects, nextState] = await Promise.all([
        window.electronAPI?.projectLibraryListProjects?.(),
        window.electronAPI?.profileGetProfile?.(),
      ]);
      setProjects(nextProjects || []);
      setLibraryState(nextState || null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLibraryState(profileData || null);
  }, [profileData]);

  useEffect(() => {
    refresh().catch(() => {});
  }, []);

  const activeProjectIds: string[] = libraryState?.activeProjectIds || [];

  const toggleProjectActive = async (projectId: string) => {
    const next = activeProjectIds.includes(projectId)
      ? activeProjectIds.filter((id) => id !== projectId)
      : [...activeProjectIds, projectId];

    await window.electronAPI?.projectLibrarySetActiveProjects?.(next);
    await refresh();
  };

  const attachAssets = async (projectId: string) => {
    const selected = await window.electronAPI?.projectLibrarySelectAssets?.();
    if (selected?.cancelled || !selected?.filePaths?.length) return;
    await window.electronAPI?.projectLibraryAttachAssets?.({ projectId, filePaths: selected.filePaths });
    await refresh();
  };

  const attachRepo = async (projectId: string) => {
    const selected = await window.electronAPI?.projectLibrarySelectRepo?.();
    if (selected?.cancelled || !selected?.repoPath) return;
    await window.electronAPI?.projectLibraryAttachRepo?.({ projectId, repoPath: selected.repoPath });
    await refresh();
  };

  const saveProject = async () => {
    if (!newTitle.trim()) return;
    setSavingProject(true);
    try {
      await window.electronAPI?.projectLibraryUpsertProject?.({
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
      await refresh();
    } finally {
      setSavingProject(false);
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
              Every asset is attached to a specific resume project. Strict mode stays evidence-bound. Polished mode keeps the same facts and improves delivery.
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
              await refresh();
            }}
            className={`rounded-xl border px-4 py-3 text-left transition-colors ${
              libraryState?.profileMode ? "border-emerald-500/30 bg-emerald-500/5" : "border-border-subtle bg-bg-input"
            }`}
          >
            <div className="text-[10px] uppercase tracking-wide text-text-tertiary">Knowledge Mode</div>
            <div className="text-sm font-semibold text-text-primary mt-1">
              {libraryState?.profileMode ? "Enabled" : "Disabled"}
            </div>
          </button>

          <div className="rounded-xl border border-border-subtle bg-bg-input px-4 py-3">
            <div className="text-[10px] uppercase tracking-wide text-text-tertiary mb-2">Answer Mode</div>
            <div className="flex gap-2">
              {(["strict", "polished"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={async () => {
                    await window.electronAPI?.projectLibrarySetAnswerMode?.(mode);
                    await refresh();
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
              await refresh();
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
            <p className="text-[11px] text-text-secondary mt-1">Use this when you want to create or rename a project card manually.</p>
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
            onClick={saveProject}
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
        {(projects.length ? projects : libraryState?.projects || []).map((project: any) => {
          const isActive = activeProjectIds.includes(project.id);
          const factCard = project.factCard || {};
          const tags = factCard.techStack || [];

          return (
            <div key={project.id} className="bg-bg-item-surface rounded-xl border border-border-subtle p-5">
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

              <div className="grid md:grid-cols-3 gap-3 mt-4">
                <div className="rounded-lg bg-bg-input border border-border-subtle px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-text-tertiary">Assets</div>
                  <div className="text-sm font-semibold text-text-primary mt-1">{project.assetCount || 0}</div>
                </div>
                <div className="rounded-lg bg-bg-input border border-border-subtle px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-text-tertiary">Chunks</div>
                  <div className="text-sm font-semibold text-text-primary mt-1">{project.chunkCount || 0}</div>
                </div>
                <div className="rounded-lg bg-bg-input border border-border-subtle px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-text-tertiary">Role</div>
                  <div className="text-sm font-semibold text-text-primary mt-1">{factCard.role || "Not set"}</div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mt-4">
                <button
                  onClick={() => attachAssets(project.id)}
                  className="px-3 py-2 rounded-lg text-[11px] font-medium border border-border-subtle bg-bg-input text-text-secondary hover:text-text-primary transition-colors flex items-center gap-2"
                >
                  <Upload size={12} />
                  Attach Assets
                </button>
                <button
                  onClick={() => attachRepo(project.id)}
                  className="px-3 py-2 rounded-lg text-[11px] font-medium border border-border-subtle bg-bg-input text-text-secondary hover:text-text-primary transition-colors flex items-center gap-2"
                >
                  <FolderOpen size={12} />
                  Attach Repo
                </button>
              </div>
            </div>
          );
        })}
      </div>

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
                  <span>·</span>
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
