import React from "react";
import "./App.css";
import { BACKEND_URL } from "./config";

type Status = "online" | "offline" | "connecting";

type DragState =
  | { type: "projects"; startX: number; startWidth: number }
  | { type: "options"; startX: number; startWidth: number }
  | { type: "source"; startX: number; startRatio: number }
  | { type: "top"; startY: number; startRatio: number };

// Backend project típus
interface Project {
  id: number;
  name: string;
  description: string | null;
  root_path: string | null;
  created_at: string;
}

// Támogatott kódolások
const ENCODINGS = [
  { value: "utf-8", label: "UTF-8" },
  { value: "cp1250", label: "Windows-1250" },
  { value: "iso-8859-2", label: "ISO-8859-2" },
] as const;

type Encoding = (typeof ENCODINGS)[number]["value"];

const encodingLabel = (enc: Encoding) =>
  ENCODINGS.find((e) => e.value === enc)?.label ?? enc;

type WrapMode = "truncate" | "wrap";

interface EditorSettings {
  maxLines: number | null;
  maxColumns: number | null;
  mode: WrapMode; // truncate = levág, wrap = sortörés
}

const defaultEditorSettings: EditorSettings = {
  maxLines: null,
  maxColumns: null,
  mode: "truncate",
};

interface ProjectEditorSettings {
  source: EditorSettings;
  projected: EditorSettings;
}

// A tényleges kódformázás a beállítások alapján
function applyEditorSettings(text: string, settings: EditorSettings): string {
  let lines = text.split("\n");
  const { maxLines, maxColumns, mode } = settings;

  // Max oszlop – truncate vagy wrap
  if (maxColumns != null && maxColumns > 0) {
    const newLines: string[] = [];

    for (const line of lines) {
      const lineLen = line.length;

      if (mode === "truncate") {
        // Levágjuk a sort, ha hosszabb
        newLines.push(lineLen > maxColumns ? line.slice(0, maxColumns) : line);
      } else {
        // wrap mód: daraboljuk maxColumns hosszú blokkokra
        if (lineLen === 0) {
          newLines.push("");
        } else {
          for (let i = 0; i < lineLen; i += maxColumns) {
            newLines.push(line.slice(i, i + maxColumns));
          }
        }
      }
    }

    lines = newLines;
  }

  // Max sor – a feldolgozott sorokra alkalmazzuk
  if (maxLines != null && maxLines > 0 && lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
  }

  return lines.join("\n");
}

// --- Projekt specifikus beállítások (editor) ---

function loadProjectSettings(projectId: number): ProjectEditorSettings {
  const key = `projectSettings_${projectId}`;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return {
        source: { ...defaultEditorSettings },
        projected: { ...defaultEditorSettings },
      };
    }
    const parsed = JSON.parse(raw) as Partial<ProjectEditorSettings>;
    return {
      source: { ...defaultEditorSettings, ...(parsed.source || {}) },
      projected: { ...defaultEditorSettings, ...(parsed.projected || {}) },
    };
  } catch {
    return {
      source: { ...defaultEditorSettings },
      projected: { ...defaultEditorSettings },
    };
  }
}

function saveProjectSettings(projectId: number, settings: ProjectEditorSettings): void {
  const key = `projectSettings_${projectId}`;
  try {
    localStorage.setItem(key, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

// --- Projekt specifikus kód (forrás + módosított) ---

interface ProjectCode {
  source: string;
  projected: string;
}

function loadProjectCode(projectId: number): ProjectCode {
  const key = `projectCode_${projectId}`;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return { source: "", projected: "" };
    }
    const parsed = JSON.parse(raw) as Partial<ProjectCode>;
    return {
      source: parsed.source ?? "",
      projected: parsed.projected ?? "",
    };
  } catch {
    return { source: "", projected: "" };
  }
}

function saveProjectCode(projectId: number, code: ProjectCode): void {
  const key = `projectCode_${projectId}`;
  try {
    localStorage.setItem(key, JSON.stringify(code));
  } catch {
    // ignore
  }
}

// ===== KÓDSZERKESZTŐ + DIFF =====

interface CodeEditorProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  settings: EditorSettings;
}

const CodeEditor: React.FC<CodeEditorProps> = ({
  value,
  onChange,
  placeholder,
  settings,
}) => {
  const gutterRef = React.useRef<HTMLPreElement | null>(null);

  // Sorok száma + egyetlen sztring a számokhoz (1\n2\n3...)
  const lineNumbersText = React.useMemo(() => {
    const lines = value.split("\n").length || 1;
    const arr = new Array(lines);
    for (let i = 0; i < lines; i++) {
      arr[i] = String(i + 1);
    }
    return arr.join("\n");
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const raw = e.target.value;
    const processed = applyEditorSettings(raw, settings);
    onChange(processed);
  };

  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (gutterRef.current) {
      gutterRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  return (
    <div className="code-editor-wrapper">
      <pre className="line-numbers" ref={gutterRef}>
        {lineNumbersText}
      </pre>
      <textarea
        className="code-textarea"
        value={value}
        onChange={handleChange}
        onScroll={handleScroll}
        spellCheck={false}
        placeholder={placeholder}
        wrap={settings.mode === "wrap" ? "soft" : "off"} // wrap = tördelés, off = vízszintes scroll
      />
    </div>
  );
};

// Egyszerű (index-alapú) diff – nem Git-szintű, de jól látható
type DiffKind = "common" | "added" | "removed";

interface DiffLine {
  type: DiffKind;
  text: string;
}

interface DiffViewProps {
  original: string;
  modified: string;
}

function computeSimpleDiff(original: string, modified: string): DiffLine[] {
  const a = original.split("\n");
  const b = modified.split("\n");
  const maxLen = Math.max(a.length, b.length);
  const result: DiffLine[] = [];

  for (let i = 0; i < maxLen; i++) {
    const aLine = a[i];
    const bLine = b[i];

    if (aLine === undefined && bLine !== undefined) {
      result.push({ type: "added", text: bLine });
    } else if (bLine === undefined && aLine !== undefined) {
      result.push({ type: "removed", text: aLine });
    } else if (aLine === bLine) {
      result.push({ type: "common", text: aLine ?? "" });
    } else if (aLine !== undefined && bLine !== undefined) {
      // mindkettő létezik, de különböznek → előbb törölt, aztán új sor
      result.push({ type: "removed", text: aLine });
      result.push({ type: "added", text: bLine });
    }
  }

  return result;
}

const DiffView: React.FC<DiffViewProps> = ({ original, modified }) => {
  const diffs = React.useMemo(
    () => computeSimpleDiff(original, modified),
    [original, modified]
  );

  return (
    <div className="diff-view">
      {diffs.map((d, idx) => (
        <div
          key={idx}
          className={`diff-line diff-line-${d.type}`}
        >
          <span className="diff-gutter">
            {d.type === "added" ? "+" : d.type === "removed" ? "-" : " "}
          </span>
          <span className="diff-text">
            {d.text === "" ? " " : d.text}
          </span>
        </div>
      ))}
    </div>
  );
};

// --- Undo / Redo snapshot típus ---

interface CodeSnapshot {
  source: string;
  projected: string;
}

const App: React.FC = () => {
  const [status, setStatus] = React.useState<Status>("connecting");

  // Méretek
  const [projectsWidth, setProjectsWidth] = React.useState(260); // px
  const [optionsWidth, setOptionsWidth] = React.useState(260); // px
  const [sourceWidthRatio, setSourceWidthRatio] = React.useState(0.5); // 0–1
  const [topHeightRatio, setTopHeightRatio] = React.useState(0.65); // 0–1

  const [drag, setDrag] = React.useState<DragState | null>(null);

  const rightAreaRef = React.useRef<HTMLDivElement | null>(null);

  // Kódszövegek (AKTÍV projekt, már feldolgozott formában)
  const [sourceCode, setSourceCode] = React.useState("");
  const [projectedCode, setProjectedCode] = React.useState("");

  // Undo/redo history az aktuális projektre
  const [history, setHistory] = React.useState<CodeSnapshot[]>([]);
  const [historyIndex, setHistoryIndex] = React.useState<number>(-1);
  const restoringRef = React.useRef(false);

  // Diff nézet toggle (csak Módosított kód panelre)
  const [showDiff, setShowDiff] = React.useState(false);

  // Kódolások panelenként
  const [sourceEncoding, setSourceEncoding] =
    React.useState<Encoding>("utf-8");
  const [projectedEncoding, setProjectedEncoding] =
    React.useState<Encoding>("utf-8");

  // Kódszerkesztő beállítások (projektenként, de az aktuális projektre betöltve)
  const [sourceSettings, setSourceSettings] = React.useState<EditorSettings>({
    ...defaultEditorSettings,
  });
  const [projectedSettings, setProjectedSettings] =
    React.useState<EditorSettings>({
      ...defaultEditorSettings,
    });

  // Projektek state
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = React.useState<
    number | null
  >(null);
  const [projectsLoading, setProjectsLoading] = React.useState(false);
  const [projectsError, setProjectsError] = React.useState<string | null>(null);

  // Új projekt modál state
  const [isProjectModalOpen, setIsProjectModalOpen] = React.useState(false);
  const [newProjectName, setNewProjectName] = React.useState("");
  const [newProjectDescription, setNewProjectDescription] =
    React.useState("");
  const [newProjectRootPath, setNewProjectRootPath] = React.useState("");
  const [projectModalError, setProjectModalError] =
    React.useState<string | null>(null);
  const [projectModalSaving, setProjectModalSaving] = React.useState(false);

  // --- Undo/Redo segédfüggvények (REDO fix) ---

  const pushHistory = React.useCallback(
    (nextSource: string, nextProjected: string) => {
      if (restoringRef.current) return;

      setHistory((prev) => {
        const currentIndex = historyIndex;

        // „aktuális” index: ha az index érvényes, azt használjuk,
        // különben az utolsó elemet tekintjük aktuálisnak
        const effectiveIndex =
          currentIndex >= 0 && currentIndex < prev.length
            ? currentIndex
            : prev.length - 1;

        const currentSnap =
          effectiveIndex >= 0 ? prev[effectiveIndex] : undefined;

        // Ha a mostani kód megegyezik a jelenlegi snapshot-tal,
        // akkor semmit nem csinálunk (nem vágunk és nem adunk hozzá új elemet).
        if (
          currentSnap &&
          currentSnap.source === nextSource &&
          currentSnap.projected === nextProjected
        ) {
          return prev;
        }

        // Ha változott a kód, akkor innen kezdve vágjuk le a „jövőt”
        let base = prev;
        if (effectiveIndex >= 0 && effectiveIndex < prev.length - 1) {
          base = prev.slice(0, effectiveIndex + 1);
        }

        let merged = [...base, { source: nextSource, projected: nextProjected }];

        if (merged.length > 100) {
          merged = merged.slice(merged.length - 100);
        }

        // mindig a legutóbbi snapshot az aktuális
        setHistoryIndex(merged.length - 1);
        return merged;
      });
    },
    [historyIndex]
  );

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex >= 0 && historyIndex < history.length - 1;

  const handleUndo = React.useCallback(() => {
    if (!canUndo) return;
    const newIdx = historyIndex - 1;
    const snap = history[newIdx];
    if (snap) {
      restoringRef.current = true;
      setSourceCode(snap.source);
      setProjectedCode(snap.projected);
      restoringRef.current = false;
      setHistoryIndex(newIdx);
    }
  }, [canUndo, historyIndex, history]);

  const handleRedo = React.useCallback(() => {
    if (!canRedo) return;
    const newIdx = historyIndex + 1;
    const snap = history[newIdx];
    if (snap) {
      restoringRef.current = true;
      setSourceCode(snap.source);
      setProjectedCode(snap.projected);
      restoringRef.current = false;
      setHistoryIndex(newIdx);
    }
  }, [canRedo, historyIndex, history]);

  // Backend health check az online/offline ponthoz
  React.useEffect(() => {
    async function checkHealth() {
      try {
        const res = await fetch(`${BACKEND_URL}/health`);
        if (res.ok) {
          const data = await res.json();
          if (data.status === "ok") {
            setStatus("online");
            return;
          }
        }
        setStatus("offline");
      } catch {
        setStatus("offline");
      }
    }

    checkHealth();
    const id = setInterval(checkHealth, 10000);
    return () => clearInterval(id);
  }, []);

  // Projektek betöltése induláskor
  React.useEffect(() => {
    async function loadProjects() {
      setProjectsLoading(true);
      setProjectsError(null);
      try {
        const res = await fetch(`${BACKEND_URL}/projects`);
        if (!res.ok) {
          throw new Error(`Hiba a projektek betöltésekor: ${res.status}`);
        }
        const data: Project[] = await res.json();
        setProjects(data);
        if (data.length > 0 && selectedProjectId === null) {
          setSelectedProjectId(data[0].id);
        }
      } catch (err: any) {
        console.error(err);
        setProjectsError("Nem sikerült betölteni a projekteket.");
      } finally {
        setProjectsLoading(false);
      }
    }

    loadProjects();
  }, [selectedProjectId]);

  // Projekt-specifikus beállítások betöltése
  React.useEffect(() => {
    if (!selectedProjectId) {
      setSourceSettings({ ...defaultEditorSettings });
      setProjectedSettings({ ...defaultEditorSettings });
      return;
    }
    const loaded = loadProjectSettings(selectedProjectId);
    setSourceSettings(loaded.source);
    setProjectedSettings(loaded.projected);
  }, [selectedProjectId]);

  // Projekt-specifikus kód betöltése + history inicializálása
  React.useEffect(() => {
    if (!selectedProjectId) {
      restoringRef.current = true;
      setSourceCode("");
      setProjectedCode("");
      restoringRef.current = false;
      setHistory([]);
      setHistoryIndex(-1);
      return;
    }
    const loaded = loadProjectCode(selectedProjectId);

    // betöltött kódra az aktuális beállítások szerint ráengedjük a limitet
    const processedSource = applyEditorSettings(loaded.source, sourceSettings);
    const processedProjected = applyEditorSettings(
      loaded.projected,
      projectedSettings
    );

    restoringRef.current = true;
    setSourceCode(processedSource);
    setProjectedCode(processedProjected);
    restoringRef.current = false;

    const snap: CodeSnapshot = {
      source: processedSource,
      projected: processedProjected,
    };
    setHistory([snap]);
    setHistoryIndex(0);
  }, [selectedProjectId, sourceSettings, projectedSettings]);

  // Ha változnak a beállítások, igazítsuk hozzá az aktuális kódot is
  React.useEffect(() => {
    if (!selectedProjectId) return;
    setSourceCode((prev) => applyEditorSettings(prev, sourceSettings));
  }, [sourceSettings, selectedProjectId]);

  React.useEffect(() => {
    if (!selectedProjectId) return;
    setProjectedCode((prev) => applyEditorSettings(prev, projectedSettings));
  }, [projectedSettings, selectedProjectId]);

  // Projekt-specifikus beállítások mentése
  React.useEffect(() => {
    if (!selectedProjectId) return;
    const toSave: ProjectEditorSettings = {
      source: sourceSettings,
      projected: projectedSettings,
    };
    saveProjectSettings(selectedProjectId, toSave);
  }, [selectedProjectId, sourceSettings, projectedSettings]);

  // Projekt-specifikus kód mentése + history frissítése
  React.useEffect(() => {
    if (!selectedProjectId) return;
    if (restoringRef.current) return;
    const toSave: ProjectCode = { source: sourceCode, projected: projectedCode };
    saveProjectCode(selectedProjectId, toSave);
    pushHistory(sourceCode, projectedCode);
  }, [selectedProjectId, sourceCode, projectedCode, pushHistory]);

  // Globális egérkezelés a resizerekhez
  React.useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!drag) return;

      if (drag.type === "projects") {
        const delta = e.clientX - drag.startX;
        let newWidth = drag.startWidth + delta;
        if (newWidth < 160) newWidth = 160;
        if (newWidth > 600) newWidth = 600;
        setProjectsWidth(newWidth);
      } else if (drag.type === "options") {
        const delta = e.clientX - drag.startX;
        let newWidth = drag.startWidth - delta; // balra húzva nő
        if (newWidth < 140) newWidth = 140;
        if (newWidth > 520) newWidth = 520;
        setOptionsWidth(newWidth);
      } else if (drag.type === "source") {
        if (!rightAreaRef.current) return;
        const rect = rightAreaRef.current.getBoundingClientRect();
        const delta = e.clientX - drag.startX;
        const effectiveWidth = rect.width - optionsWidth;
        if (effectiveWidth <= 0) return;

        let newRatio = drag.startRatio + delta / effectiveWidth;
        if (newRatio < 0.15) newRatio = 0.15;
        if (newRatio > 0.85) newRatio = 0.85;
        setSourceWidthRatio(newRatio);
      } else if (drag.type === "top") {
        if (!rightAreaRef.current) return;
        const rect = rightAreaRef.current.getBoundingClientRect();
        const delta = e.clientY - drag.startY;
        let newRatio = drag.startRatio + delta / rect.height;
        if (newRatio < 0.25) newRatio = 0.25;
        if (newRatio > 0.85) newRatio = 0.85;
        setTopHeightRatio(newRatio);
      }
    }

    function onMouseUp() {
      setDrag(null);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [drag, optionsWidth]);

  // Új projekt mentése
  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault();
    if (!newProjectName.trim()) {
      setProjectModalError("A név megadása kötelező.");
      return;
    }
    setProjectModalSaving(true);
    setProjectModalError(null);

    try {
      const res = await fetch(`${BACKEND_URL}/projects`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newProjectName.trim(),
          description: newProjectDescription.trim() || null,
          root_path: newProjectRootPath.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const msg =
          data?.detail ||
          `Nem sikerült létrehozni a projektet (HTTP ${res.status}).`;
        throw new Error(msg);
      }

      const created: Project = await res.json();
      // Új projekt felvétele a listába (legfelülre)
      setProjects((prev) => [created, ...prev]);
      setSelectedProjectId(created.id);

      // Modál ürítése + bezárás
      setNewProjectName("");
      setNewProjectDescription("");
      setNewProjectRootPath("");
      setIsProjectModalOpen(false);
    } catch (err: any) {
      console.error(err);
      setProjectModalError(err.message || "Ismeretlen hiba történt.");
    } finally {
      setProjectModalSaving(false);
    }
  }

  return (
    <div className="app-root">
      {/* Fejléc */}
      <header className="app-header">
        <div className="menu-area">
          MENÜ
          <span className="history-buttons">
            <button
              type="button"
              className="history-button"
              onClick={handleUndo}
              disabled={!canUndo}
              title="Visszavonás"
            >
              ←
            </button>
            <button
              type="button"
              className="history-button"
              onClick={handleRedo}
              disabled={!canRedo}
              title="Előre"
            >
              →
            </button>
          </span>
        </div>

        <div className="status-area">
          <span className={`status-dot status-${status}`} />
          <span className="status-label">
            {status === "online"
              ? "Online"
              : status === "connecting"
              ? "Kapcsolódás..."
              : "Offline"}
          </span>
        </div>

        <div className="header-right">LLM Dev Environment</div>
      </header>

      {/* Fő tartalom */}
      <div className="app-body">
        <div className="main-row">
          {/* Bal: Projektek */}
          <section
            className="panel projects-panel"
            style={{ width: projectsWidth }}
          >
            <div className="panel-header">
              <span>Projektek</span>
              <button
                className="icon-button"
                title="Új projekt"
                onClick={() => {
                  setProjectModalError(null);
                  setIsProjectModalOpen(true);
                }}
              >
                +
              </button>
            </div>

            <div className="projects-list">
              {projectsLoading && (
                <div className="projects-info">Betöltés…</div>
              )}
              {projectsError && !projectsLoading && (
                <div className="projects-error">{projectsError}</div>
              )}
              {!projectsLoading && projects.length === 0 && !projectsError && (
                <div className="projects-info">
                  Még nincs projekt. Kattints a + gombra egy újhoz.
                </div>
              )}
              {projects.map((p) => (
                <div
                  key={p.id}
                  className={
                    "project-item" +
                    (p.id === selectedProjectId ? " selected" : "")
                  }
                  onClick={() => setSelectedProjectId(p.id)}
                  title={
                    p.description || p.root_path || "Projekt részletek…"
                  }
                >
                  <div className="project-name">{p.name}</div>
                  {p.description && (
                    <div className="project-description">
                      {p.description}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Bal oldali elválasztó */}
            <div
              className="vertical-resizer edge-right"
              onMouseDown={(e) =>
                setDrag({
                  type: "projects",
                  startX: e.clientX,
                  startWidth: projectsWidth,
                })
              }
              onDoubleClick={() => setProjectsWidth(260)}
              title="Húzd a szélességhez, dupla katt az alapmérethez"
            />
          </section>

          {/* Jobb: kód + chat + opciók */}
          <div className="right-area" ref={rightAreaRef}>
            {/* Felső sor: Forráskód, Módosított kód, Opciók */}
            <div
              className="top-row"
              style={{ height: `${topHeightRatio * 100}%` }}
            >
              {/* Forráskód panel */}
              <section
                className="panel source-panel"
                style={{
                  width: `calc(${sourceWidthRatio * 100}% - 6px)`,
                }}
              >
                <div className="panel-header">
                  <span>Forráskód ({encodingLabel(sourceEncoding)})</span>
                  <select
                    className="encoding-select"
                    value={sourceEncoding}
                    onChange={(e) =>
                      setSourceEncoding(e.target.value as Encoding)
                    }
                    title="Forráskód kódolása"
                  >
                    {ENCODINGS.map((enc) => (
                      <option key={enc.value} value={enc.value}>
                        {enc.label}
                      </option>
                    ))}
                  </select>
                </div>

                <CodeEditor
                  value={sourceCode}
                  onChange={setSourceCode}
                  placeholder="Ide írd a forráskódot…"
                  settings={sourceSettings}
                />

                {/* Forrás vs Módosított elválasztó */}
                <div
                  className="vertical-resizer inner-right"
                  onMouseDown={(e) =>
                    setDrag({
                      type: "source",
                      startX: e.clientX,
                      startRatio: sourceWidthRatio,
                    })
                  }
                  onDoubleClick={() => setSourceWidthRatio(0.5)}
                  title="Húzd az oszloparányhoz, dupla katt az 50/50-hez"
                />
              </section>

              {/* Módosított kód panel */}
              <section className="panel projected-panel">
                <div className="panel-header">
                  <span>
                    Módosított kód ({encodingLabel(projectedEncoding)})
                  </span>
                  <div className="panel-header-right">
                    <div className="diff-toggle">
                      <button
                        type="button"
                        className={
                          "diff-toggle-btn" + (!showDiff ? " active" : "")
                        }
                        onClick={() => setShowDiff(false)}
                      >
                        Kód
                      </button>
                      <button
                        type="button"
                        className={
                          "diff-toggle-btn" + (showDiff ? " active" : "")
                        }
                        onClick={() => setShowDiff(true)}
                      >
                        Diff
                      </button>
                    </div>
                    <select
                      className="encoding-select"
                      value={projectedEncoding}
                      onChange={(e) =>
                        setProjectedEncoding(e.target.value as Encoding)
                      }
                      title="Módosított kód kódolása"
                    >
                      {ENCODINGS.map((enc) => (
                        <option key={enc.value} value={enc.value}>
                          {enc.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {showDiff ? (
                  <DiffView
                    original={sourceCode}
                    modified={projectedCode}
                  />
                ) : (
                  <CodeEditor
                    value={projectedCode}
                    onChange={setProjectedCode}
                    placeholder="Ide kerül az LLM által javasolt módosított kód…"
                    settings={projectedSettings}
                  />
                )}

                {/* Módosított vs Opciók elválasztó */}
                <div
                  className="vertical-resizer inner-right"
                  onMouseDown={(e) =>
                    setDrag({
                      type: "options",
                      startX: e.clientX,
                      startWidth: optionsWidth,
                    })
                  }
                  onDoubleClick={() => setOptionsWidth(260)}
                  title="Húzd az Opciók panel méretéhez, dupla katt az alaphoz"
                />
              </section>

              {/* Opciók panel – jobb szél */}
              <aside
                className="panel options-panel"
                style={{ width: optionsWidth }}
              >
                <div className="panel-header">Opciók</div>
                <div className="options-content">
                  {selectedProjectId && (
                    <div className="options-section">
                      Aktív projekt ID: <b>{selectedProjectId}</b>
                    </div>
                  )}

                  <div className="options-section">
                    <div className="options-section-title">
                      Forráskód beállítások
                    </div>
                    <div className="options-grid">
                      <label>
                        Max sor
                        <input
                          type="number"
                          min={1}
                          className="options-number-input"
                          value={sourceSettings.maxLines ?? ""}
                          onChange={(e) =>
                            setSourceSettings((prev) => ({
                              ...prev,
                              maxLines:
                                e.target.value === ""
                                  ? null
                                  : Math.max(1, Number(e.target.value)),
                            }))
                          }
                          placeholder="nincs"
                        />
                      </label>
                      <label>
                        Max oszlop
                        <input
                          type="number"
                          min={1}
                          className="options-number-input"
                          value={sourceSettings.maxColumns ?? ""}
                          onChange={(e) =>
                            setSourceSettings((prev) => ({
                              ...prev,
                              maxColumns:
                                e.target.value === ""
                                  ? null
                                  : Math.max(1, Number(e.target.value)),
                            }))
                          }
                          placeholder="nincs"
                        />
                      </label>
                    </div>
                    <label className="options-checkbox-row">
                      <input
                        type="checkbox"
                        checked={sourceSettings.mode === "wrap"}
                        onChange={(e) =>
                          setSourceSettings((prev) => ({
                            ...prev,
                            mode: e.target.checked ? "wrap" : "truncate",
                          }))
                        }
                      />
                      Tördelés vágás helyett (Forráskód)
                    </label>
                  </div>

                  <div className="options-section">
                    <div className="options-section-title">
                      Módosított kód beállítások
                    </div>
                    <div className="options-grid">
                      <label>
                        Max sor
                        <input
                          type="number"
                          min={1}
                          className="options-number-input"
                          value={projectedSettings.maxLines ?? ""}
                          onChange={(e) =>
                            setProjectedSettings((prev) => ({
                              ...prev,
                              maxLines:
                                e.target.value === ""
                                  ? null
                                  : Math.max(1, Number(e.target.value)),
                            }))
                          }
                          placeholder="nincs"
                        />
                      </label>
                      <label>
                        Max oszlop
                        <input
                          type="number"
                          min={1}
                          className="options-number-input"
                          value={projectedSettings.maxColumns ?? ""}
                          onChange={(e) =>
                            setProjectedSettings((prev) => ({
                              ...prev,
                              maxColumns:
                                e.target.value === ""
                                  ? null
                                  : Math.max(1, Number(e.target.value)),
                            }))
                          }
                          placeholder="nincs"
                        />
                      </label>
                    </div>
                    <label className="options-checkbox-row">
                      <input
                        type="checkbox"
                        checked={projectedSettings.mode === "wrap"}
                        onChange={(e) =>
                          setProjectedSettings((prev) => ({
                            ...prev,
                            mode: e.target.checked ? "wrap" : "truncate",
                          }))
                        }
                      />
                      Tördelés vágás helyett (Módosított kód)
                    </label>
                  </div>

                  <div className="options-hint">
                    A max sor / max oszlop beállítások ténylegesen korlátozzák a
                    kódot: „vágás” módban a sorok adott oszlopszámnál
                    levágódnak, „tördelés” módban új sorokra törnek. A sorok
                    száma és a sorszámozás mindig ehhez igazodik.
                  </div>
                </div>
              </aside>
            </div>

            {/* Vízszintes elválasztó: felső kód ↔ chat */}
            <div
              className="horizontal-resizer"
              onMouseDown={(e) =>
                setDrag({
                  type: "top",
                  startY: e.clientY,
                  startRatio: topHeightRatio,
                })
              }
              onDoubleClick={() => setTopHeightRatio(0.65)}
              title="Húzd a magassághoz, dupla katt az alap arányhoz"
            />

            {/* Alsó: LLM Chat */}
            <section className="panel chat-panel">
              <div className="panel-header">LLM Chat</div>
              <div className="chat-messages">
                {/* ide jönnek majd az üzenetek */}
              </div>
              <form className="chat-input-row">
                <input
                  className="chat-input"
                  placeholder="Írj az LLM-nek…"
                  autoComplete="off"
                />
                <button className="primary-button" type="submit">
                  Küldés
                </button>
              </form>
            </section>
          </div>
        </div>
      </div>

      {/* Új projekt modál */}
      {isProjectModalOpen && (
        <div
          className="modal-backdrop"
          onClick={() => setIsProjectModalOpen(false)}
        >
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()} // backdrop click zárjon, de a modál ne
          >
            <h2>Új projekt</h2>

            <form onSubmit={handleCreateProject} className="modal-form">
              <label>
                Projekt neve *
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  autoFocus
                />
              </label>

              <label>
                Leírás
                <textarea
                  value={newProjectDescription}
                  onChange={(e) =>
                    setNewProjectDescription(e.target.value)
                  }
                  rows={3}
                />
              </label>

              <label>
                Root mappa (opcionális)
                <input
                  type="text"
                  value={newProjectRootPath}
                  onChange={(e) =>
                    setNewProjectRootPath(e.target.value)
                  }
                  placeholder="pl. C:\\Projektek\\Valami"
                />
              </label>

              {projectModalError && (
                <div className="modal-error">{projectModalError}</div>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setIsProjectModalOpen(false)}
                  disabled={projectModalSaving}
                >
                  Mégse
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={projectModalSaving}
                >
                  {projectModalSaving ? "Mentés…" : "Létrehozás"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
