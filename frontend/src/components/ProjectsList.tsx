// frontend/src/components/ProjectsList.tsx

import React from "react";
import type { Project } from "../types";

interface ProjectsListProps {
  projects: Project[];
  selectedId: number | null;
  loading: boolean;
  error: string | null;
  reindexingId: number | null;
  onSelect: (id: number) => void;
  onEdit: (project: Project) => void;
  onReindex: (id: number) => void;
  onDelete: (id: number) => void;
}

export const ProjectsList: React.FC<ProjectsListProps> = ({
  projects,
  selectedId,
  loading,
  error,
  reindexingId,
  onSelect,
  onEdit,
  onReindex,
  onDelete,
}) => {
  if (loading) {
    return <div className="projects-info">BetÃ¶ltÃ©s…</div>;
  }

  if (error) {
    return <div className="projects-error">{error}</div>;
  }

  if (projects.length === 0) {
    return (
      <div className="projects-info">
        MÃ©g nincs projekt. Kattints a + gombra egy Ãºjhoz.
      </div>
    );
  }

  return (
    <>
      {projects.map((p) => (
        <div
          key={p.id}
          className={`project-item${p.id === selectedId ? " selected" : ""}`}
          onClick={() => onSelect(p.id)}
          title={p.description || p.root_path || "Projekt rÃ©szletek…"}
        >
          <div className="project-name">{p.name}</div>
          {p.description && (
            <div className="project-description">{p.description}</div>
          )}

          <div className="project-actions">
            <button
              type="button"
              className="primary-button"
              style={{
                marginTop: "4px",
                fontSize: "0.75rem",
                padding: "2px 6px",
                marginRight: "4px",
              }}
              onClick={(e) => {
                e.stopPropagation();
                onReindex(p.id);
              }}
              disabled={reindexingId === p.id}
              title={
                p.root_path
                  ? "A projekt kÃ³dbÃ¡zisÃ¡nak ÃºjraindexelÃ©se"
                  : "Nincs root mappa beÃ¡llÃ­tva ehhez a projekthez"
              }
            >
              {reindexingId === p.id ? "Reindex…" : "Reindex"}
            </button>

            <button
              type="button"
              className="delete-button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(p.id);
              }}
              title="Projekt tÃ¶rlÃ©se"
            >
              &minus;
            </button>
          </div>
        </div>
      ))}
    </>
  );
};


