import React from "react";
import "./App.css";
import { BACKEND_URL } from "./config";
import { 
  PANEL_DEFAULTS, 
  PANEL_LIMITS, 
  ENCODINGS, 
  getEncodingLabel,
} from "./constants";
import type { Encoding } from "./constants";
import type {
  Project,
  FileNode,
  ChatMessage,
  CodeSnapshot,
  EditorSettings,
  ProjectEditorSettings,
  ProjectCode,
  SuggestedPatch,
  CodeSuggestion,
  DragState,
  Status,
  DiffLine,
  DiffKind,
  PendingPermission,
  FileModification,
} from "./types/index";
import { detectCodeLanguage, extractFirstCodeBlock } from "./utils/codeUtils";
import { checkPLISyntax, type SyntaxError } from "./utils/pliSyntaxChecker";
import { 
  sanitizeRawPath, 
  normalizeFileName, 
  findPathInTreeByName, 
  resolveRelPathFromChat,
  resolvePathFromTree,
  sanitizeFileRef 
} from "./utils/fileUtils";
import { 
  applyPatch, 
  formatPatchSummary, 
  formatPatchPreview,
  generateUniqueId,
  type PatchResult 
} from "./utils/patchUtils";
import { 
  applyEditorSettings, 
  defaultEditorSettings 
} from "./utils/editorUtils";
import { useWebSocketSync, setWebSocketEnabled } from "./utils/useWebSocketSync";
import { ProjectsList } from "./components/ProjectsList";

// Dátum + idő formázás (YYYY.MM.DD HH:MM:SS)
const formatDateTime = (date: Date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}.${month}.${day} ${hours}:${minutes}:${seconds}`;
};
import { SyntaxErrorPanel } from "./components/SyntaxErrorPanel";
import { LogWindow, type LogMessage } from "./components/LogWindow";
import { ContextMenu, useContextMenu, type ContextMenuItem } from "./components/ContextMenu";
import { LLMSettings } from "./components/LLMSettings";
import { highlightPLIWasm, initWasm, isWasmReady } from "./utils/pliWasmHighlighter";
import { highlightCodeSync, detectLanguage, type SupportedLanguage } from "./utils/syntaxHighlighter";

function renderFileNode(
  node: FileNode,
  depth: number,
  selectedPath: string | null,
  expandedPaths: string[],
  onToggleDir: (path: string) => void,
  onFileClick: (path: string) => void,
  onContextMenu?: (e: React.MouseEvent, node: FileNode) => void,
  onTouchStart?: (e: React.TouchEvent, node: FileNode) => void,
  onTouchMove?: (e: React.TouchEvent) => void,
  onTouchEnd?: (e: React.TouchEvent) => void
): React.ReactNode {
  const isSelected = !node.is_dir && node.path === selectedPath;
  const isExpanded = node.is_dir && expandedPaths.includes(node.path);

  return (
    <React.Fragment key={node.path}>
      <div
        className={
          "file-item" +
          (node.is_dir ? " file-dir" : " file-file") +
          (isSelected ? " selected" : "")
        }
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => {
          if (node.is_dir) {
            onToggleDir(node.path);
          } else {
            onFileClick(node.path);
          }
        }}
        onContextMenu={(e) => onContextMenu?.(e, node)}
        onTouchStart={(e) => onTouchStart?.(e, node)}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        title={node.path}
      >
        <span className="file-icon">
          {node.is_dir ? (isExpanded ? "▾" : "▸") : "📄"}
        </span>
        <span className="file-name">{node.name}</span>
      </div>

      {isExpanded &&
        node.children &&
        node.children.map((child) =>
          renderFileNode(
            child,
            depth + 1,
            selectedPath,
            expandedPaths,
            onToggleDir,
            onFileClick,
            onContextMenu,
            onTouchStart,
            onTouchMove,
            onTouchEnd
          )
        )}
    </React.Fragment>
  );
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

function saveProjectSettings(
  projectId: number,
  settings: ProjectEditorSettings
): void {
  const key = `projectSettings_${projectId}`;
  try {
    localStorage.setItem(key, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

// --- Projekt-specifikus chat állapot ---

function loadProjectChat(projectId: number): ChatMessage[] {
  const key = `projectChat_${projectId}`;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatMessage[];
    if (!Array.isArray(parsed)) return [];
    
    // DUPLIKÁLT ID ELLENŐRZÉS - ha van, töröljük az egészet
    const allIds = parsed.map(m => m.id).filter(id => id != null);
    const uniqueIds = new Set(allIds);
    if (allIds.length !== uniqueIds.size) {
      console.warn(`[CHAT] ⚠️ Duplikált ID-k a ${key}-ban! TÖRÖLVE`);
      localStorage.removeItem(key);
      return [];
    }
    
    return parsed;
  } catch {
    return [];
  }
}

function saveProjectChat(projectId: number, messages: ChatMessage[]): void {
  const key = `projectChat_${projectId}`;
  try {
    // Mentés előtt is ellenőrizzük a duplikátumokat
    const uniqueMessages = messages.filter((msg, index, self) => 
      index === self.findIndex(m => m.id === msg.id)
    );
    localStorage.setItem(key, JSON.stringify(uniqueMessages));
  } catch {
    // ignore
  }
}

// EGYSZERI TISZTÍTÁS - Töröl minden hibás chat adatot
(function cleanupDuplicateChatData() {
  const cleanupKey = 'chat_cleanup_v3'; // Verzió frissítve!
  if (localStorage.getItem(cleanupKey)) return; // Már lefutott
  
  console.log('[CLEANUP] ⚠️ Chat adatok TELJES tisztítása v3...');
  let cleanedCount = 0;
  
  // AGRESSZÍV TISZTÍTÁS: Töröljük az ÖSSZES projekt chat-et
  const allKeys = Object.keys(localStorage);
  for (const key of allKeys) {
    if (key.startsWith('projectChat_')) {
      localStorage.removeItem(key);
      cleanedCount++;
      console.log(`[CLEANUP] Törölve: ${key}`);
    }
  }
  
  // És a globális chat history-t is
  if (localStorage.getItem('chat_history')) {
    localStorage.removeItem('chat_history');
    cleanedCount++;
    console.log('[CLEANUP] Törölve: chat_history');
  }
  
  // Mentjük a flaget
  localStorage.setItem(cleanupKey, 'done');
  
  // Ha volt törlés, újratöltünk
  if (cleanedCount > 0) {
    console.log(`[CLEANUP] ✅ ${cleanedCount} adat törölve. Újratöltés...`);
    window.location.reload();
  } else {
    console.log('[CLEANUP] ✅ Nincs törlendő adat');
  }
})();

function loadProjectCode(projectId: number): ProjectCode {
  const key = `projectCode_${projectId}`;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return { source: "", projected: "", filePath: undefined };
    }
    const parsed = JSON.parse(raw) as Partial<ProjectCode>;
    return {
      source: parsed.source ?? "",
      projected: parsed.projected ?? "",
      filePath: parsed.filePath,  // Fájl útvonal visszatöltése!
    };
  } catch {
    return { source: "", projected: "", filePath: undefined };
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

// ===== KÃ“DSZERKESZTŐ + DIFF =====

interface CodeEditorProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  settings: EditorSettings;
  scrollToLine?: number | null;
  filePath?: string | null; // Fájl útvonal a típus meghatározáshoz
  syntaxHighlightEnabled?: boolean; // Szintaxis színezés ki/be kapcsolása
}

const CodeEditor: React.FC<CodeEditorProps> = ({
  value,
  onChange,
  placeholder,
  settings,
  scrollToLine,
  filePath,
  syntaxHighlightEnabled = true, // Alapértelmezetten be
}) => {
  // MINDEN HOOK ELŐBB, UTÁNA A CONDITIONÁLIS RETURN!
  const gutterRef = React.useRef<HTMLDivElement | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const highlightRef = React.useRef<HTMLDivElement | null>(null);
  
  // Ellenőrizzük hogy színezhető fájl-e (kiterjesztés VAGY tartalom alapján)
  const shouldHighlight = React.useMemo(() => {
    // Ha ki van kapcsolva a szintaxis színezés, ne színezzünk
    if (!syntaxHighlightEnabled) {
      return false;
    }
    // Mindig színezzük ha van tartalom
    if (value && value.trim().length > 0) {
      return true;
    }
    return false;
  }, [value, syntaxHighlightEnabled]);

  // PL/I fájl detektálása (speciális kezeléshez)
  const isPLIFile = React.useMemo(() => {
    if (filePath) {
      const lower = filePath.toLowerCase();
      if (lower.endsWith('.pli') || lower.endsWith('.pl1') || lower.endsWith('.pl/i')) {
        return true;
      }
    }
    if (value && value.trim().length > 50) {
      const detected = detectCodeLanguage(filePath || '', value);
      return detected === 'pli';
    }
    return false;
  }, [filePath, value]);
  
  // Színezett kód generálása - csak PL/I esetén
  // Optimalizálva: debounce + viewport-based rendering (csak a látható részt színezi)
  const [debouncedValue, setDebouncedValue] = React.useState(value);
  const [viewportRange, setViewportRange] = React.useState<{ start: number; end: number } | null>(null);
  
  // Debounce: csak akkor színez, amikor a felhasználó abbahagyta a gépelést (300ms)
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, 300); // 300ms várakozás a gépelés után
    
    return () => clearTimeout(timer);
  }, [value]);

  // Viewport számítás: mely sorok láthatók?
  React.useEffect(() => {
    if (!textareaRef.current || !shouldHighlight) return;
    
    const updateViewport = () => {
      if (!textareaRef.current) return;
      
      const lineHeight = 21; // CSS-ben beállított line-height
      const scrollTop = textareaRef.current.scrollTop;
      const clientHeight = textareaRef.current.clientHeight;
      
      // Látható sorok számítása
      const startLine = Math.floor(scrollTop / lineHeight);
      const visibleLines = Math.ceil(clientHeight / lineHeight);
      const endLine = startLine + visibleLines;
      
      // Buffer: +50 sor fent és lent (preload)
      const buffer = 50;
      const bufferedStart = Math.max(0, startLine - buffer);
      const bufferedEnd = endLine + buffer;
      
      setViewportRange({ start: bufferedStart, end: bufferedEnd });
    };
    
    // Kezdeti számítás
    updateViewport();
    
    // Scroll eseményre frissítés
    const handleScroll = () => {
      updateViewport();
    };
    
    textareaRef.current.addEventListener('scroll', handleScroll, { passive: true });
    
    // Resize eseményre is frissítés
    const resizeObserver = new ResizeObserver(() => {
      updateViewport();
    });
    
    if (textareaRef.current) {
      resizeObserver.observe(textareaRef.current);
    }
    
    return () => {
      if (textareaRef.current) {
        textareaRef.current.removeEventListener('scroll', handleScroll);
      }
      resizeObserver.disconnect();
    };
  }, [shouldHighlight, debouncedValue]);
  
  const highlightedCode = React.useMemo(() => {
    if (!shouldHighlight) return [];
    
    const lines = debouncedValue.split('\n');
    const lineCount = lines.length;
    
    // Detektáljuk a nyelvet
    const detectedLang = filePath ? detectLanguage(filePath, debouncedValue) : detectLanguage(null, debouncedValue);
    
    // Viewport-based rendering: csak a látható részt színezzük
    if (viewportRange && lineCount > 100) {
      const start = Math.max(0, Math.min(viewportRange.start, lines.length));
      const end = Math.max(0, Math.min(viewportRange.end, lines.length));
      const visibleStart = Math.max(0, start);
      const visibleEnd = Math.min(lineCount, end);
      
      // Csak a látható sorokat színezzük
      const visibleLines = lines.slice(visibleStart, visibleEnd).join('\n');
      
      // Performance timing
      const startTime = performance.now();
      // Multi-language highlighter használata
      const visibleTokens = highlightCodeSync(visibleLines, detectedLang, filePath);
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Hozzáadjuk a sor offset-et a tokenekhez (hogy a helyes pozícióban jelenjenek meg)
      const tokensWithOffset = visibleTokens.map((token, idx) => {
        // Számoljuk meg, hogy hány karakter van a visibleStart előtt
        let charOffset = 0;
        for (let i = 0; i < visibleStart; i++) {
          charOffset += lines[i].length + 1; // +1 for newline
        }
        
        return {
          ...token,
          _offset: charOffset, // Belső használatra
        };
      });
      
      if (duration > 50) {
        console.log(`[CodeEditor] Viewport színezés: ${visibleEnd - visibleStart} sor (${lineCount} összesen), ${duration.toFixed(0)}ms, nyelv: ${detectedLang}`);
      }
      
      return tokensWithOffset;
    }
    
    // Kis fájloknál (100 sor alatt) az egészet színezzük
    if (lineCount <= 100) {
      const startTime = performance.now();
      // Multi-language highlighter használata
      const tokens = highlightCodeSync(debouncedValue, detectedLang, filePath);
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      if (duration > 100) {
        console.warn(`[CodeEditor] Színezés lassú: ${duration.toFixed(0)}ms, nyelv: ${detectedLang}`);
      }
      
      return tokens;
    }
    
    // Ha nincs viewport info, ne színezz (biztonsági fallback)
    return [];
  }, [debouncedValue, shouldHighlight, viewportRange, filePath]);
  
  // Scroll effect - MINDIG meg kell hívni
  React.useEffect(() => {
    if (scrollToLine && scrollToLine > 0 && textareaRef.current) {
      const lines = value.split("\n");
      if (scrollToLine <= lines.length) {
        const lineHeight = 21;
        let charOffset = 0;
        for (let i = 0; i < scrollToLine - 1; i++) {
          charOffset += lines[i].length + 1;
        }
        textareaRef.current.setSelectionRange(charOffset, charOffset);
        const scrollTop = (scrollToLine - 1) * lineHeight;
        textareaRef.current.scrollTop = Math.max(0, scrollTop - 50);
    if (gutterRef.current) {
          gutterRef.current.scrollTop = textareaRef.current.scrollTop;
        }
        if (highlightRef.current) {
          highlightRef.current.scrollTop = textareaRef.current.scrollTop;
        }
      }
    }
  }, [scrollToLine, value]);
  
  // Sorok tömb és sorszámok - MINDIG számoljuk, még ha nem is használjuk
  const lines = React.useMemo(() => value.split("\n"), [value]);
  const lineCount = lines.length;

  // Sorszámok - MINDIG generáljuk, még ha nem is használjuk
  const lineNumbers = React.useMemo(() => {
    const nums: React.ReactNode[] = [];
    for (let i = 1; i <= lineCount; i++) {
      nums.push(
        <div key={i} className="line-number-row">
          {i}
        </div>
      );
    }
    return nums;
  }, [lineCount]);

  // Handler függvények - MINDIG definiáljuk
  const handleChange = React.useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const raw = e.target.value;
    onChange(raw);
  }, [onChange]);

  const handleScroll = React.useCallback((e: React.UIEvent<HTMLTextAreaElement>) => {
    const { scrollTop, scrollLeft } = e.currentTarget;
    if (gutterRef.current) {
      gutterRef.current.scrollTop = scrollTop;
    }
    if (highlightRef.current) {
      highlightRef.current.scrollTop = scrollTop;
      highlightRef.current.scrollLeft = scrollLeft;
    }
  }, []);
  
  // Színezett kód renderelése - viewport-based
  const renderHighlighted = () => {
    if (highlightedCode.length === 0) {
      return null;
    }
    
    // Ha viewport-based rendering van, csak a látható rész tokenjeit rendereljük
    // A többi rész átlátszó lesz (nem színezett)
    if (viewportRange && lines.length > 100) {
      const start = Math.max(0, Math.min(viewportRange.start, lines.length));
      const end = Math.max(0, Math.min(viewportRange.end, lines.length));
      
      // Számoljuk meg, hogy hány karakter van a start előtt
      let charOffsetBefore = 0;
      for (let i = 0; i < start; i++) {
        charOffsetBefore += lines[i].length + 1; // +1 for newline
      }
      
      // Számoljuk meg, hogy hány karakter van az end után
      let charOffsetAfter = 0;
      for (let i = end; i < lines.length; i++) {
        charOffsetAfter += lines[i].length + 1;
      }
      
      // A látható rész karaktereinek száma
      let visibleChars = 0;
      for (let i = start; i < end; i++) {
        visibleChars += lines[i].length + 1;
      }
      
      // Rendereljük: átlátszó rész + színezett rész + átlátszó rész
      const beforeText = value.substring(0, charOffsetBefore);
      const afterText = value.substring(charOffsetBefore + visibleChars);
      
      return (
        <>
          {/* Előtte: átlátszó (nem színezett) */}
          {beforeText && (
            <span style={{ color: 'transparent' }}>{beforeText}</span>
          )}
          {/* Látható rész: színezett */}
          {highlightedCode.map((token, idx) => {
            const className = `pli-token pli-token-${token.type}`;
            return (
              <span key={idx} className={className}>
                {token.text}
              </span>
            );
          })}
          {/* Utána: átlátszó (nem színezett) */}
          {afterText && (
            <span style={{ color: 'transparent' }}>{afterText}</span>
          )}
        </>
      );
    }
    
    // Kis fájloknál: teljes színezés
    return highlightedCode.map((token, idx) => {
      const className = `pli-token pli-token-${token.type}`;
      return (
        <span key={idx} className={className}>
          {token.text}
        </span>
      );
    });
  };

  // Renderelés - színezéssel ha van tartalom
  return (
    <div className={`code-editor-wrapper ${shouldHighlight ? 'highlighted-editor' : ''}`}>
      <div className="line-numbers-gutter" ref={gutterRef}>
        {lineNumbers}
      </div>
      {shouldHighlight ? (
        <div className="code-editor-content">
          {/* Színezett háttér (csak olvasható) */}
          <div className="code-highlight-overlay" ref={highlightRef}>
            <pre className="code-highlight-pre">
              {renderHighlighted()}
      </pre>
          </div>
          {/* Textarea (átlátszó, csak szöveg) */}
      <textarea
            ref={textareaRef}
            className="code-textarea code-textarea-overlay"
            value={value}
            onChange={handleChange}
            onScroll={handleScroll}
            spellCheck={false}
            placeholder={placeholder}
            wrap="off"
          />
        </div>
      ) : (
        <textarea
          ref={textareaRef}
        className="code-textarea"
        value={value}
        onChange={handleChange}
        onScroll={handleScroll}
        spellCheck={false}
        placeholder={placeholder}
          wrap="off"
      />
      )}
    </div>
  );
};

interface DiffViewProps {
  original: string;
  modified: string;
}

// LCS (Longest Common Subsequence) alapú diff algoritmus
// Ez SOKKAL jobb, mint a pozíció-alapú összehasonlítás!
function computeSimpleDiff(original: string, modified: string): DiffLine[] {
  const a = original.split("\n");
  const b = modified.split("\n");
  
  // LCS matrix építése
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  
  // Backtrack: diff összeállítása
  const result: DiffLine[] = [];
  let i = m, j = n;
  const tempResult: DiffLine[] = [];
  
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      // Közös sor
      tempResult.push({ type: "common", text: a[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      // Hozzáadott sor (b-ben van, a-ban nincs)
      tempResult.push({ type: "added", text: b[j - 1] });
      j--;
    } else if (i > 0) {
      // Törölt sor (a-ban van, b-ben nincs)
      tempResult.push({ type: "removed", text: a[i - 1] });
      i--;
    }
  }
  
  // Megfordítjuk a sorrendet (backtrack visszafelé ment)
  for (let k = tempResult.length - 1; k >= 0; k--) {
    result.push(tempResult[k]);
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
        <div key={idx} className={`diff-line diff-line-${d.type}`}>
          <span className="diff-gutter">
            {d.type === "added" ? "+" : d.type === "removed" ? "-" : " "}
          </span>
          <span className="diff-text">{d.text === "" ? " " : d.text}</span>
        </div>
      ))}
    </div>
  );
};

// DiffViewer - nagyobb diff nézet navigációval
interface DiffViewerProps {
  before: string;
  after: string;
}

const DiffViewer: React.FC<DiffViewerProps> = ({ before, after }) => {
  const [currentChangeIndex, setCurrentChangeIndex] = React.useState(0);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  
  const diffs = React.useMemo(
    () => computeSimpleDiff(before, after),
    [before, after]
  );
  
  // Találjuk meg a változások indexeit
  const changeIndices = React.useMemo(() => {
    const indices: number[] = [];
    diffs.forEach((d, idx) => {
      if (d.type === 'added' || d.type === 'removed') {
        indices.push(idx);
      }
    });
    return indices;
  }, [diffs]);
  
  // Ugrás a következő változáshoz
  const goToNextChange = React.useCallback(() => {
    if (changeIndices.length === 0) return;
    const nextIndex = (currentChangeIndex + 1) % changeIndices.length;
    setCurrentChangeIndex(nextIndex);
    
    // Scroll a változáshoz
    const element = document.getElementById(`diff-line-${changeIndices[nextIndex]}`);
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [currentChangeIndex, changeIndices]);
  
  // Ugrás az előző változáshoz
  const goToPrevChange = React.useCallback(() => {
    if (changeIndices.length === 0) return;
    const prevIndex = currentChangeIndex === 0 ? changeIndices.length - 1 : currentChangeIndex - 1;
    setCurrentChangeIndex(prevIndex);
    
    const element = document.getElementById(`diff-line-${changeIndices[prevIndex]}`);
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [currentChangeIndex, changeIndices]);
  
  // Számláló: hány sor hozzáadva/törölve
  const stats = React.useMemo(() => {
    let added = 0, removed = 0;
    diffs.forEach(d => {
      if (d.type === 'added') added++;
      if (d.type === 'removed') removed++;
    });
    return { added, removed };
  }, [diffs]);
  
  // Csoportosított változások száma (egymás melletti változások = 1 csoport)
  const changeGroups = React.useMemo(() => {
    let groups = 0;
    let inChangeGroup = false;
    diffs.forEach(d => {
      if (d.type === 'added' || d.type === 'removed') {
        if (!inChangeGroup) {
          groups++;
          inChangeGroup = true;
        }
      } else {
        inChangeGroup = false;
      }
    });
    return groups;
  }, [diffs]);
  
  // Aktuális csoport indexe
  const [currentGroupIndex, setCurrentGroupIndex] = React.useState(0);
  
  // Csoport kezdő indexek (ahol új változás-blokk kezdődik)
  const groupStartIndices = React.useMemo(() => {
    const indices: number[] = [];
    let inChangeGroup = false;
    diffs.forEach((d, idx) => {
      if (d.type === 'added' || d.type === 'removed') {
        if (!inChangeGroup) {
          indices.push(idx);
          inChangeGroup = true;
        }
      } else {
        inChangeGroup = false;
      }
    });
    return indices;
  }, [diffs]);
  
  // Navigáció CSOPORTOK között (nem sorok!)
  const goToNextGroup = React.useCallback(() => {
    if (groupStartIndices.length === 0) return;
    const nextIdx = (currentGroupIndex + 1) % groupStartIndices.length;
    setCurrentGroupIndex(nextIdx);
    const element = document.getElementById(`diff-line-${groupStartIndices[nextIdx]}`);
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [currentGroupIndex, groupStartIndices]);
  
  const goToPrevGroup = React.useCallback(() => {
    if (groupStartIndices.length === 0) return;
    const prevIdx = currentGroupIndex === 0 ? groupStartIndices.length - 1 : currentGroupIndex - 1;
    setCurrentGroupIndex(prevIdx);
    const element = document.getElementById(`diff-line-${groupStartIndices[prevIdx]}`);
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [currentGroupIndex, groupStartIndices]);

  return (
    <div className="diff-viewer">
      <div className="diff-viewer-nav">
        <button 
          type="button"
          className="diff-nav-btn"
          onClick={goToPrevGroup}
          disabled={groupStartIndices.length === 0}
          title="Előző változás-blokk"
        >
          ⬆️ Előző
        </button>
        <span className="diff-nav-counter">
          {changeGroups > 0 
            ? `${currentGroupIndex + 1} / ${changeGroups} változás` 
            : 'Nincs változás'}
        </span>
        <button 
          type="button"
          className="diff-nav-btn"
          onClick={goToNextGroup}
          disabled={groupStartIndices.length === 0}
          title="Következő változás-blokk"
        >
          Következő ⬇️
        </button>
      </div>
      
      <div className="diff-viewer-code" ref={scrollRef}>
        {diffs.map((d, idx) => {
          const lineNum = idx + 1;
          // Ellenőrizzük, hogy ez a sor az aktuális csoportban van-e
          const currentGroupStart = groupStartIndices[currentGroupIndex] ?? -1;
          const nextGroupStart = groupStartIndices[currentGroupIndex + 1] ?? diffs.length;
          const isInCurrentGroup = (d.type === 'added' || d.type === 'removed') && 
                                   idx >= currentGroupStart && idx < nextGroupStart;
          
          return (
            <div 
              key={idx} 
              id={`diff-line-${idx}`}
              className={`diff-line diff-line-${d.type}${isInCurrentGroup ? ' current-change' : ''}`}
            >
              <span className="diff-line-num">{lineNum}</span>
              <span className="diff-gutter">
                {d.type === "added" ? "+" : d.type === "removed" ? "-" : " "}
              </span>
              <span className="diff-text">{d.text === "" ? " " : d.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Kontextusban megjelenített diff - mutatja a változást a megfelelő helyen
interface ContextDiffViewProps {
  fullCode: string;
  originalSnippet: string;
  suggestedSnippet: string;
  startLine: number; // 0-based, ahol a változás kezdődik a fullCode-ban
}

// Egy megjelenítendő sor típusa
type DisplayLine = {
  key: string;
  lineNumber: string | number;
  gutter: string;
  text: string;
  type: "context" | "removed" | "added" | "common";
};

const ContextDiffView: React.FC<ContextDiffViewProps> = ({
  fullCode,
  originalSnippet,
  suggestedSnippet,
  startLine,
}) => {
  // Előre kiszámoljuk az összes megjelenítendő sort
  const displayData = React.useMemo(() => {
    const CONTEXT_LINES = 5;
    const fullLines = fullCode.split("\n");
    const originalLines = originalSnippet.split("\n");
    const suggestedLines = suggestedSnippet.split("\n");
    const originalLineCount = originalLines.length;
    
    // Ã‰rvényes startLine meghatározása
    let effectiveStartLine = startLine;
    if (effectiveStartLine < 0 || effectiveStartLine >= fullLines.length) {
      const firstLine = originalLines[0]?.trim();
      effectiveStartLine = fullLines.findIndex(line => line.trim() === firstLine);
      if (effectiveStartLine === -1) effectiveStartLine = 0;
    }
    
    const isFullReplace = originalSnippet === fullCode;
    const isNewCode = originalSnippet.includes("Ãšj kód beszúrása");
    const noChange = originalSnippet === suggestedSnippet;
    
    // Kontextus határok
    const contextStart = Math.max(0, effectiveStartLine - CONTEXT_LINES);
    const changeEnd = effectiveStartLine + originalLineCount;
    const contextEnd = Math.min(fullLines.length, changeEnd + CONTEXT_LINES);
    
    // Ã–sszeállítjuk a megjelenítendő sorokat
    const lines: DisplayLine[] = [];
    let lineNum = contextStart + 1; // 1-based sorszám
    
    // Kontextus ELŐTTE (ha nem teljes csere)
    if (!isFullReplace) {
      for (let i = contextStart; i < effectiveStartLine; i++) {
        lines.push({
          key: `before-${i}`,
          lineNumber: lineNum++,
          gutter: " ",
          text: fullLines[i] || " ",
          type: "context",
        });
      }
    }
    
    // EREDETI KÃ“D (ami törlődik) - PIROS
    if (!noChange && !isNewCode) {
      for (let i = 0; i < originalLines.length; i++) {
        lines.push({
          key: `removed-${i}`,
          lineNumber: lineNum++,
          gutter: "-",
          text: originalLines[i] || " ",
          type: "removed",
        });
      }
    }
    
    // ÃšJ KÃ“D (ami hozzáadódik) - ZÃ–LD
    for (let i = 0; i < suggestedLines.length; i++) {
      lines.push({
        key: `added-${i}`,
        lineNumber: "+",
        gutter: "+",
        text: suggestedLines[i] || " ",
        type: "added",
      });
    }
    
    // Kontextus UTÁNA (ha nem teljes csere)
    // A sorszámot az eredeti kód végétől folytatjuk
    let afterLineNum = effectiveStartLine + originalLineCount + 1;
    if (!isFullReplace) {
      for (let i = changeEnd; i < contextEnd; i++) {
        lines.push({
          key: `after-${i}`,
          lineNumber: afterLineNum++,
          gutter: " ",
          text: fullLines[i] || " ",
          type: "context",
        });
      }
    }
    
    return {
      lines,
      contextStart,
      contextEnd,
      effectiveStartLine,
      changeEnd,
      isFullReplace,
      isNewCode,
      totalLines: fullLines.length,
    };
  }, [fullCode, originalSnippet, suggestedSnippet, startLine]);
  
  const { lines, contextStart, contextEnd, effectiveStartLine, isFullReplace, isNewCode, totalLines } = displayData;
  
  const beforeLines = lines.filter(l => l.key.startsWith("before-"));
  const removedLines = lines.filter(l => l.key.startsWith("removed-"));
  const addedLines = lines.filter(l => l.key.startsWith("added-"));
  const afterLines = lines.filter(l => l.key.startsWith("after-"));
  
  return (
    <div className="context-diff-view">
      {/* Jelzés, ha vannak elrejtett sorok előtte */}
      {contextStart > 0 && (
        <div className="diff-context-marker">
          ⋮ ... ({contextStart} sor elrejtve fent) ...
        </div>
      )}
      
      {/* ELŐTTE kontextus sorok */}
      {beforeLines.map(l => (
        <div key={l.key} className="diff-line diff-line-context">
          <span className="diff-line-number">{l.lineNumber}</span>
          <span className="diff-gutter">{l.gutter}</span>
          <span className="diff-text">{l.text}</span>
        </div>
      ))}
      
      {/* Változás marker */}
      <div className="diff-change-marker">
        ─── {isNewCode ? "Ãšj kód beszúrása" : isFullReplace ? "Teljes fájl módosítás" : `Változás (${effectiveStartLine + 1}. sortól)`} ───
      </div>
      
      {/* EREDETI KÃ“D - TÃ–RLENDŐ (piros) */}
      {removedLines.length > 0 && (
        <>
          <div className="diff-section-label diff-section-removed">⊖ Eredeti kód (törlődik):</div>
          {removedLines.map(l => (
            <div key={l.key} className="diff-line diff-line-removed">
              <span className="diff-line-number">{l.lineNumber}</span>
              <span className="diff-gutter">{l.gutter}</span>
              <span className="diff-text">{l.text}</span>
            </div>
          ))}
        </>
      )}
      
      {/* ÃšJ KÃ“D - HOZZÁADANDÃ“ (zöld) */}
      {addedLines.length > 0 && (
        <>
          <div className="diff-section-label diff-section-added">⊕ Javasolt kód (hozzáadódik):</div>
          {addedLines.map(l => (
            <div key={l.key} className="diff-line diff-line-added">
              <span className="diff-line-number">{l.lineNumber}</span>
              <span className="diff-gutter">{l.gutter}</span>
              <span className="diff-text">{l.text}</span>
            </div>
          ))}
        </>
      )}
      
      {/* Változás vége marker */}
      {afterLines.length > 0 && (
        <div className="diff-change-marker">
          ─── Változás vége ───
        </div>
      )}
      
      {/* UTÁNA kontextus sorok */}
      {afterLines.map(l => (
        <div key={l.key} className="diff-line diff-line-context">
          <span className="diff-line-number">{l.lineNumber}</span>
          <span className="diff-gutter">{l.gutter}</span>
          <span className="diff-text">{l.text}</span>
        </div>
      ))}
      
      {/* Jelzés, ha vannak elrejtett sorok utána */}
      {contextEnd < totalLines && (
        <div className="diff-context-marker">
          ⋮ ... ({totalLines - contextEnd} sor elrejtve lent) ...
        </div>
      )}
    </div>
  );
};


// Inline kód nézet javaslattal
interface InlineCodeWithSuggestionProps {
  code: string;
  setCode: (code: string) => void;
  suggestion: CodeSuggestion | null;
  onApply: () => void;
  onSkip: () => void;
  onNextPosition?: () => void;
  onPrevPosition?: () => void;
  onSetManualPosition?: (lineNumber: number) => void;
  settings: EditorSettings;
  diffViewRef: React.RefObject<HTMLDivElement | null>;
  scrollToLine?: number | null;
  filePath?: string | null;
  syntaxHighlightEnabled?: boolean; // Szintaxis színezés ki/be kapcsolása
}

const InlineCodeWithSuggestion: React.FC<InlineCodeWithSuggestionProps> = ({
  code,
  setCode,
  suggestion,
  onApply,
  onSkip,
  onNextPosition,
  onPrevPosition,
  onSetManualPosition,
  settings,
  diffViewRef,
  scrollToLine,
  filePath,
  syntaxHighlightEnabled = true,
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const suggestionRef = React.useRef<HTMLDivElement>(null);
  
  // Auto-scroll a javaslat helyére
  React.useEffect(() => {
    if (suggestion && suggestionRef.current) {
      suggestionRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [suggestion, suggestion?.selectedPosition]);
  
  // Ha nincs javaslat, normál szerkesztő
  if (!suggestion) {
    return (
      <CodeEditor
        value={code}
        onChange={setCode}
        placeholder="Ide írd a kódot, vagy válassz egy fájlt a projektből…"
        settings={settings}
        scrollToLine={scrollToLine}
        filePath={filePath}
        syntaxHighlightEnabled={syntaxHighlightEnabled}
      />
    );
  }
  
  // Javaslat megjelenítése inline
  // MINDIG a jelenlegi code-ot használjuk a megjelenítéshez!
  const lines = code.split("\n");
  
  // DEBUG
  console.log(`[InlineCodeWithSuggestion] code: ${code.length} karakter, ${lines.length} sor`);
  let startLine = suggestion.matchPositions[suggestion.selectedPosition] || 0;
  
  // FONTOS: A matchPositions a suggestion.fullCode alapján lett kiszámolva
  // Ha a code eltér, MINDIG újra kell keresni a helyes pozíciót!
  const needsResync = suggestion.fullCode !== code || startLine >= lines.length;
  
  if (needsResync) {
    // Keressük meg az EREDETI snippet első sorát a jelenlegi kódban
    const originalFirstLine = suggestion.originalSnippet.split("\n")[0]?.trim().toLowerCase();
    const originalSecondLine = suggestion.originalSnippet.split("\n")[1]?.trim().toLowerCase();
    
    let foundNewPos = false;
    
    // Első és második sor egyezés (legszigorúbb)
    if (originalFirstLine && originalSecondLine && originalFirstLine.length > 10) {
      for (let i = 0; i < lines.length - 1; i++) {
        if (lines[i].trim().toLowerCase() === originalFirstLine &&
            lines[i + 1].trim().toLowerCase() === originalSecondLine) {
          const oldStartLine = startLine;
          startLine = i;
          console.log(`[DISPLAY-SYNC] Pozíció újraszámolva (2 sor): ${oldStartLine + 1} → ${startLine + 1}. sor`);
          foundNewPos = true;
          break;
        }
      }
    }
    
    // Ha nem találtuk 2 sorral, próbáljuk csak az elsővel
    if (!foundNewPos && originalFirstLine && originalFirstLine.length > 15) {
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().toLowerCase() === originalFirstLine) {
          const oldStartLine = startLine;
          startLine = i;
          console.log(`[DISPLAY-SYNC] Pozíció újraszámolva (1 sor): ${oldStartLine + 1} → ${startLine + 1}. sor`);
          foundNewPos = true;
          break;
        }
      }
    }
    
    if (!foundNewPos) {
      console.log(`[DISPLAY-SYNC] Nem sikerült újraszámolni a pozíciót! Keresett: "${originalFirstLine?.substring(0, 50)}..."`);
    }
  }
  const originalLines = suggestion.originalSnippet.split("\n");
  const suggestedLines = suggestion.suggestedSnippet.split("\n");
  const endLine = startLine + originalLines.length;
  
  // Kontextus sorok (előtte/utána)
  const CONTEXT_BEFORE = 5;
  const CONTEXT_AFTER = 5;
  const viewStart = Math.max(0, startLine - CONTEXT_BEFORE);
  const viewEnd = Math.min(lines.length, endLine + CONTEXT_AFTER);
  
  return (
    <div className="inline-code-view" ref={containerRef}>
      {/* Előtte elrejtett sorok jelzése */}
      {viewStart > 0 && (
        <div className="inline-hidden-marker">
          ⋮ ... ({viewStart} sor elrejtve fent) ...
        </div>
      )}
      
      {/* Kontextus sorok ELŐTTE */}
      {lines.slice(viewStart, startLine).map((line, idx) => {
        const lineNum = viewStart + idx + 1;
        return (
          <div key={`before-${lineNum}`} className="inline-code-line">
            <span className="inline-line-number">{lineNum}</span>
            <span className="inline-line-text">{line || " "}</span>
          </div>
        );
      })}
      
      {/* JAVASLAT BLOKK */}
      <div className="inline-suggestion-block" ref={suggestionRef}>
        <div className="inline-suggestion-header">
          <span>🔍 Javaslat a {startLine + 1}. sortól ({originalLines.length} sor → {suggestedLines.length} sor)</span>
          <div className="inline-suggestion-buttons">
            <button className="inline-apply-btn" onClick={onApply}>
              ✔ Alkalmaz
            </button>
            <button className="inline-skip-btn" onClick={onSkip}>
              ✗ Kihagy
            </button>
          </div>
        </div>
        
        {/* Manuális sorszám beállítás */}
        <div className="inline-manual-position">
          <span>Sorszám: </span>
          <input 
            type="number" 
            min={1} 
            max={code.split("\n").length}
            value={startLine + 1}
            onChange={(e) => {
              const newLine = parseInt(e.target.value, 10) - 1;
              const codeLines = code.split("\n");
              if (newLine >= 0 && newLine < codeLines.length && onSetManualPosition) {
                onSetManualPosition(newLine);
              }
            }}
            style={{ width: "70px", marginLeft: "5px" }}
          />
          <button 
            onClick={() => {
              if (onSetManualPosition) {
                const codeLines = code.split("\n");
                const userInput = prompt(`Add meg a sorszámot (1-${codeLines.length}):`, String(startLine + 1));
                if (userInput) {
                  const newLine = parseInt(userInput, 10) - 1;
                  if (newLine >= 0 && newLine < codeLines.length) {
                    onSetManualPosition(newLine);
                  }
                }
              }
            }}
            style={{ marginLeft: "5px", padding: "2px 8px" }}
          >
            🔍 Ugrás
          </button>
        </div>
        
        {/* Pozíció navigáció ha több találat */}
        {suggestion.matchPositions.length > 1 && (
          <div className="inline-position-info">
            <span>
              ⚠️ {suggestion.matchPositions.length} helyen található. 
              Jelenleg: {suggestion.selectedPosition + 1}. találat ({startLine + 1}. sor)
            </span>
            <div className="inline-position-nav">
              <button 
                className="inline-pos-btn" 
                onClick={onPrevPosition}
                disabled={suggestion.selectedPosition === 0}
              >
                ◀ Előző
              </button>
              <button 
                className="inline-pos-btn" 
                onClick={onNextPosition}
                disabled={suggestion.selectedPosition >= suggestion.matchPositions.length - 1}
              >
                Következő ▶
              </button>
            </div>
          </div>
        )}
        
        {/* Eredeti kód A FÁJLBÃ“L (amit valóban lecserél) */}
        <div className="inline-removed-section">
          <div className="inline-section-label">⊖ Eredeti kód a fájlból ({startLine + 1}-{startLine + originalLines.length}. sor):</div>
          {lines.slice(startLine, startLine + originalLines.length).map((line, idx) => (
            <div key={`file-original-${idx}`} className="inline-code-line inline-removed">
              <span className="inline-line-number">{startLine + idx + 1}</span>
              <span className="inline-gutter">-</span>
              <span className="inline-line-text">{line || " "}</span>
            </div>
          ))}
        </div>
        
        {/* Ãšj kód (hozzáadódik) */}
        <div className="inline-added-section">
          <div className="inline-section-label">⊕ Javasolt új kód:</div>
          {suggestedLines.map((line, idx) => (
            <div key={`added-${idx}`} className="inline-code-line inline-added">
              <span className="inline-line-number">+</span>
              <span className="inline-gutter">+</span>
              <span className="inline-line-text">{line || " "}</span>
            </div>
          ))}
        </div>
      </div>
      
      {/* Kontextus sorok UTÁNA */}
      {lines.slice(endLine, viewEnd).map((line, idx) => {
        const lineNum = endLine + idx + 1;
        return (
          <div key={`after-${lineNum}`} className="inline-code-line">
            <span className="inline-line-number">{lineNum}</span>
            <span className="inline-line-text">{line || " "}</span>
          </div>
        );
      })}
      
      {/* Utána elrejtett sorok jelzése */}
      {viewEnd < lines.length && (
        <div className="inline-hidden-marker">
          ⋮ ... ({lines.length - viewEnd} sor elrejtve lent) ...
        </div>
      )}
    </div>
  );
};

const App: React.FC = () => {
  const [status, setStatus] = React.useState<Status>("connecting");
    // ═══════════════════════════════════════════════════════
  // WASM INICIALIZÁLÁS - ADD THIS BLOCK:
  // ═══════════════════════════════════════════════════════
  React.useEffect(() => {
    initWasm().catch(err => {
      console.error('WASM init failed:', err);
    });
  }, []);
  // ═══════════════════════════════════════════════════════
  // Mobil nézet: melyik tab aktív?
  const [activeTab, setActiveTab] = React.useState<
    "projects" | "code" | "chat" | "log"
  >("projects");

  // Session ID for context tracking (generated once per browser session)
  const [sessionId] = React.useState(() => {
    const stored = sessionStorage.getItem('llm_dev_session_id');
    if (stored) return stored;
    const newId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem('llm_dev_session_id', newId);
    return newId;
  });

  // Méretek
	const [projectsWidth, setProjectsWidth] = React.useState(PANEL_DEFAULTS.PROJECTS_WIDTH);
	const [optionsWidth, setOptionsWidth] = React.useState(PANEL_DEFAULTS.OPTIONS_WIDTH);
	const [sourceWidthRatio, setSourceWidthRatio] = React.useState(PANEL_DEFAULTS.SOURCE_WIDTH_RATIO);
	const [topHeightRatio, setTopHeightRatio] = React.useState(PANEL_DEFAULTS.TOP_HEIGHT_RATIO);
	const [projectsInnerRatio, setProjectsInnerRatio] = React.useState(PANEL_DEFAULTS.PROJECTS_INNER_RATIO);
	const [chatLogRatio, setChatLogRatio] = React.useState(PANEL_DEFAULTS.CHAT_LOG_RATIO);
	const [codeRightRatio, setCodeRightRatio] = React.useState(PANEL_DEFAULTS.CODE_RIGHT_RATIO);

  const [drag, setDrag] = React.useState<DragState | null>(null);

  const rightAreaRef = React.useRef<HTMLDivElement | null>(null);

  // Bal panelen belüli arány: projektek (felül) / fájlfa (alul)
  const projectsPanelRef = React.useRef<HTMLDivElement | null>(null);

  // Chat és log konténer ref (drag kezeléshez)
  const rightSidebarRef = React.useRef<HTMLDivElement | null>(null);

  // Kód (egyetlen panel)
  const [code, setCode] = React.useState("");
  // A kiválasztott fájl útvonalát a selectedFilePath tárolja (lentebb definiálva)

  // Chat input (korán definiálva mert a context menük használják)
  const [chatInput, setChatInput] = React.useState("");
  const chatInputRef = React.useRef<HTMLTextAreaElement>(null);

  // Auto-resize chat input when content changes
  React.useEffect(() => {
    const textarea = chatInputRef.current;
    if (!textarea) return;
    
    const minHeight = 44;
    const maxHeight = 200;
    
    // FONTOS: Először 'auto'-ra állítjuk hogy a scrollHeight pontos legyen
    textarea.style.height = 'auto';
    
    // Mérjük a tényleges tartalom magasságát
    const scrollHeight = textarea.scrollHeight;
    
    // Állítsuk be a magasságot (min és max között)
    const newHeight = Math.max(minHeight, Math.min(scrollHeight, maxHeight));
    textarea.style.height = newHeight + 'px';
    
    // Scrollbar csak ha meghaladja a max-ot
    textarea.style.overflowY = scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [chatInput]);

  // Kód keresés
  const [showCodeSearch, setShowCodeSearch] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<{line: number; column: number; text: string}[]>([]);
  const [currentSearchIndex, setCurrentSearchIndex] = React.useState(0);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  
  // @ mention autocomplete
  const [atMentionSuggestions, setAtMentionSuggestions] = React.useState<string[]>([]);
  const [atMentionActive, setAtMentionActive] = React.useState(false);
  const [atMentionIndex, setAtMentionIndex] = React.useState(0);

  // Syntax hibák
  const [syntaxErrors, setSyntaxErrors] = React.useState<SyntaxError[]>([]);
  
  // Diff nézet - fájl módosítások megtekintése
  const [diffViewData, setDiffViewData] = React.useState<{
    path: string;
    before: string;
    after: string;
    linesAdded: number;
    linesDeleted: number;
  } | null>(null);
  const [showDiffViewer, setShowDiffViewer] = React.useState(false);
  
  // Navigáció a módosítások között a diff nézetben
  const [allDiffModifications, setAllDiffModifications] = React.useState<FileModification[]>([]);
  const [currentDiffModIndex, setCurrentDiffModIndex] = React.useState(0);
  
  // Módosítás előzmények tárolása (localStorage-ban is)
  const [modificationsHistory, setModificationsHistory] = React.useState<FileModification[]>(() => {
    try {
      const saved = localStorage.getItem('modificationsHistory');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  
  // Mentés localStorage-ba
  React.useEffect(() => {
    try {
      // Max 100 módosítás tárolása
      const toSave = modificationsHistory.slice(-100);
      localStorage.setItem('modificationsHistory', JSON.stringify(toSave));
    } catch {
      // ignore
    }
  }, [modificationsHistory]);
  
  // Kód hash számítása
  const getCodeHash = React.useCallback((codeText: string): string => {
    if (!codeText) return '';
    return codeText.split('').reduce((acc, char) => {
      return ((acc << 5) - acc) + char.charCodeAt(0);
    }, 0).toString();
  }, []);

  // Validálás állapot követése
  const [validatedCodeHash, setValidatedCodeHash] = React.useState<string | null>(null);
  const isValidated = React.useMemo(() => {
    if (!validatedCodeHash || !code) return false;
    const currentHash = getCodeHash(code);
    return currentHash === validatedCodeHash;
  }, [code, validatedCodeHash, getCodeHash]);
  
  // Scroll target line (syntax error click-hez)
  const [scrollToLine, setScrollToLine] = React.useState<number | null>(null);

  // Log üzenetek
  const [logMessages, setLogMessages] = React.useState<LogMessage[]>([]);
  
  // Log üzenet hozzáadása
  const addLogMessage = React.useCallback((level: LogMessage["level"], message: string) => {
    const newMessage: LogMessage = {
      id: `log_${Date.now()}_${Math.random()}`,
      timestamp: new Date(),
      level,
      message,
    };
    
    setLogMessages((prev) => {
      const updated = [...prev, newMessage];
      // Maximum 100 üzenet tárolása (régi üzenetek törlése)
      return updated.slice(-100);
    });
    
    // Konzolra is írjuk
    console.log(`[LOG ${level.toUpperCase()}] ${message}`);
  }, []);

  // Javaslatok az LLM-től
  const [suggestions, setSuggestions] = React.useState<CodeSuggestion[]>([]);
  const [currentSuggestionIndex, setCurrentSuggestionIndex] = React.useState(0);

  // Undo/redo history az aktuális projektre
  const [history, setHistory] = React.useState<CodeSnapshot[]>([]);
  const [historyIndex, setHistoryIndex] = React.useState<number>(-1);
  const restoringRef = React.useRef(false);

  // Opciók panel láthatóság + dropdown menü
  const [showOptionsPanel, setShowOptionsPanel] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  // Kódolás
  const [encoding, setEncoding] = React.useState<Encoding>("utf-8");

  // Kódszerkesztő beállítások
  const [editorSettings, setEditorSettings] = React.useState<EditorSettings>({
      ...defaultEditorSettings,
    });

  // Kód zoom (mobilra és általános használatra)
  const [codeZoom, setCodeZoom] = React.useState(100); // százalék
  const handleZoomIn = React.useCallback(() => {
    setCodeZoom(prev => Math.min(prev + 20, 200));
  }, []);
  const handleZoomOut = React.useCallback(() => {
    setCodeZoom(prev => Math.max(prev - 20, 60));
  }, []);
  const handleZoomReset = React.useCallback(() => {
    setCodeZoom(100);
  }, []);

  // Szintaxis színezés ki/be kapcsoló (performancia optimalizáláshoz)
  const [syntaxHighlightEnabled, setSyntaxHighlightEnabled] = React.useState(true);
  const toggleSyntaxHighlight = React.useCallback(() => {
    setSyntaxHighlightEnabled(prev => !prev);
  }, []);

  // Legacy - kompatibilitáshoz (átmenetileg)
  const sourceCode = code;
  const setSourceCode = setCode;
  const projectedCode = "";
  const setProjectedCode = (_: string) => {};
  const sourceEncoding = encoding;
  const setSourceEncoding = setEncoding;
  const projectedEncoding = encoding;
  const setProjectedEncoding = setEncoding;
  const sourceSettings = editorSettings;
  const setSourceSettings = setEditorSettings;
  const projectedSettings = editorSettings;
  const setProjectedSettings = setEditorSettings;
  const showDiff = false;
  const setShowDiff = (_: boolean) => {};

  // Projektek state (fel kell hogy legyen a handleApplySuggestion előtt)
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = React.useState<
    number | null
  >(null);
  // Ref a selectedProjectId aktuális értékéhez (context menu callbacks miatt)
  const selectedProjectIdRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    selectedProjectIdRef.current = selectedProjectId;
  }, [selectedProjectId]);
  
  const [projectsLoading, setProjectsLoading] = React.useState(false);
  const [projectsError, setProjectsError] = React.useState<string | null>(
    null
  );
  const [reindexingProjectId, setReindexingProjectId] =
    React.useState<number | null>(null);
  
  // Reindex státusz (progress követéshez)
  const [reindexStatus, setReindexStatus] = React.useState<{
    project_id: number;
    status: string;
    progress: number;
    total_files: number;
    indexed_files: number;
    deleted_files: number;
    error_message?: string;
  } | null>(null);

  // Kiválasztott fájl (fel kell hogy legyen a handleApplySuggestion előtt)
  const [selectedFilePath, setSelectedFilePath] =
    React.useState<string | null>(null);

  // ═══════════════════════════════════════════════════════════════
  // MULTI-TAB SUPPORT - Több fájl megnyitása egyszerre
  // ═══════════════════════════════════════════════════════════════
  interface OpenTab {
    path: string;
    content: string;
    isDirty: boolean; // Ha módosult mentés nélkül
  }
  const [openTabs, setOpenTabs] = React.useState<OpenTab[]>([]);
  const [activeTabIndex, setActiveTabIndex] = React.useState<number>(0);

  // Tab megnyitása (vagy aktiválása ha már nyitva van)
  const openFileInTab = React.useCallback(async (filePath: string, content?: string) => {
    // Már nyitva van?
    const existingIndex = openTabs.findIndex(t => t.path === filePath);
    if (existingIndex >= 0) {
      setActiveTabIndex(existingIndex);
      setCode(openTabs[existingIndex].content);
      setSelectedFilePath(filePath);
      return;
    }
    
    // Új tab - tartalom betöltése ha nincs megadva
    let tabContent = content;
    if (!tabContent && selectedProjectId) {
      try {
        const resp = await fetch(
          `${BACKEND_URL}/projects/${selectedProjectId}/file?rel_path=${encodeURIComponent(filePath)}`
        );
        if (resp.ok) {
          const data = await resp.json();
          tabContent = (data.content || "").replace(/^\uFEFF/, '');
        }
      } catch (e) {
        console.error(`[TAB] Fájl betöltés hiba: ${filePath}`, e);
      }
    }
    
    const newTab: OpenTab = {
      path: filePath,
      content: tabContent || "",
      isDirty: false,
    };
    
    setOpenTabs(prev => [...prev, newTab]);
    setActiveTabIndex(openTabs.length); // Az új tab indexe
    setCode(newTab.content);
    setSelectedFilePath(filePath);
    
    console.log(`[TAB] Megnyitva: ${filePath} (${openTabs.length + 1} tab)`);
  }, [openTabs, selectedProjectId]);

  // Tab bezárása
  const closeTab = React.useCallback((index: number) => {
    if (openTabs.length <= 1) {
      // Utolsó tab - ne zárjuk be, csak ürítsük
      setOpenTabs([]);
      setCode("");
      setSelectedFilePath(null);
      setActiveTabIndex(0);
      return;
    }
    
    const newTabs = openTabs.filter((_, i) => i !== index);
    setOpenTabs(newTabs);
    
    // Aktív tab korrekció
    let newActiveIndex = activeTabIndex;
    if (index === activeTabIndex) {
      newActiveIndex = Math.min(index, newTabs.length - 1);
    } else if (index < activeTabIndex) {
      newActiveIndex = activeTabIndex - 1;
    }
    
    setActiveTabIndex(newActiveIndex);
    if (newTabs[newActiveIndex]) {
      setCode(newTabs[newActiveIndex].content);
      setSelectedFilePath(newTabs[newActiveIndex].path);
    }
  }, [openTabs, activeTabIndex]);

  // Tab váltás
  const switchToTab = React.useCallback((index: number) => {
    if (index >= 0 && index < openTabs.length) {
      // Mentjük a jelenlegi tab tartalmát
      if (activeTabIndex < openTabs.length) {
        setOpenTabs(prev => prev.map((t, i) => 
          i === activeTabIndex ? { ...t, content: code } : t
        ));
      }
      
      setActiveTabIndex(index);
      setCode(openTabs[index].content);
      setSelectedFilePath(openTabs[index].path);
    }
  }, [openTabs, activeTabIndex, code]);

  // Backup restore modal
  const [showBackupModal, setShowBackupModal] = React.useState(false);
  
  // LLM Settings modal
  const [showLLMSettings, setShowLLMSettings] = React.useState(false);
  const [backupList, setBackupList] = React.useState<{
    filename: string;
    original_name: string;
    timestamp: string;
    timestamp_formatted: string;
    size_bytes: number;
  }[]>([]);
  const [backupLoading, setBackupLoading] = React.useState(false);
  const [backupError, setBackupError] = React.useState<string | null>(null);
  const [selectedBackup, setSelectedBackup] = React.useState<string | null>(null);
  const [backupPreview, setBackupPreview] = React.useState<string | null>(null);
  const [restoring, setRestoring] = React.useState(false);

  // Auto mód - automatikus kód alkalmazás
  const [autoMode, setAutoMode] = React.useState<boolean>(() => {
    try {
      return localStorage.getItem('autoMode') === 'true';
    } catch {
      return false;
    }
  });

  // Téma mód - sötét/világos
  const [theme, setTheme] = React.useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('theme');
      if (saved === 'dark' || saved === 'light') return saved;
      // Rendszer preferencia alapján
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
      return 'light';
    } catch {
      return 'light';
    }
  });

  // Téma alkalmazása a document-re
  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Téma váltás
  const toggleTheme = React.useCallback(() => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  }, []);

  // Megerősítő - inline a chatben (nem modal!)
  const [showConfirmModal, setShowConfirmModal] = React.useState(false); // Legacy - már nem használjuk
  const [pendingChange, setPendingChange] = React.useState<{
    patches: SuggestedPatch[];
    explanation: string;
    terminalCommands?: string[];
  } | null>(null);
  // Pending confirmation - a chat üzenet id-ja ahol a gombok vannak
  const [pendingConfirmationId, setPendingConfirmationId] = React.useState<number | null>(null);
  
  // Jóváhagyásra váró tool műveletek (terminal parancsok, fájl törlések, stb.)
  const [pendingToolPermissions, setPendingToolPermissions] = React.useState<PendingPermission[]>([]);

  // Terminal
  const [showTerminal, setShowTerminal] = React.useState(false);
  const [terminalOutput, setTerminalOutput] = React.useState<string[]>([]);
  const [terminalInput, setTerminalInput] = React.useState('');
  const [terminalShellType, setTerminalShellType] = React.useState<'powershell' | 'cmd' | 'bash'>('powershell');
  const terminalOutputRef = React.useRef<HTMLDivElement>(null);

  // Terminal auto-scroll
  React.useEffect(() => {
    if (terminalOutputRef.current) {
      terminalOutputRef.current.scrollTop = terminalOutputRef.current.scrollHeight;
    }
  }, [terminalOutput]);

  // Kijelölt kód (AI javaslatokhoz)
  const [selectedCode, setSelectedCode] = React.useState<string>('');

  // Szintaxis hiba javítás állapot
  const [isFixingSyntax, setIsFixingSyntax] = React.useState(false);
  const [showSyntaxPanel, setShowSyntaxPanel] = React.useState(true);

  // Context menu
  const {
    menuState: contextMenuState,
    showContextMenu,
    hideContextMenu,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  } = useContextMenu();

  // Aktuális javaslat
  const currentSuggestion = suggestions.length > 0 
    ? suggestions[currentSuggestionIndex] 
    : null;
  const hasSuggestions = suggestions.length > 0;
  const pendingSuggestions = suggestions.filter(s => !s.applied);

  // === AGENTIC ANALYSIS STATE ===
  const [agenticAnalysisLoading, setAgenticAnalysisLoading] = React.useState(false);
  // Fájlok frissítése trigger (mivel loadProjectFiles később van definiálva)
  const [refreshFilesTrigger, setRefreshFilesTrigger] = React.useState(0);

  // Syntax validálás - kombinált: lokális PL/I checker + opcionális agentic elemzés
  const handleValidateSyntax = React.useCallback(() => {
    if (!code || code.trim().length === 0) {
      setSyntaxErrors([]);
      setValidatedCodeHash(null);
      addLogMessage("info", "Nincs kód a validáláshoz");
      return;
    }
    
    addLogMessage("info", "🔍 Szintaxis ellenőrzés indítása...");
    const errors = checkPLISyntax(code);
    setSyntaxErrors(errors);
    
    // Tároljuk a validált kód hash-ét
    const codeHash = getCodeHash(code);
    setValidatedCodeHash(codeHash);
    
    if (errors.length === 0) {
      addLogMessage("success", "✅ PL/I szintaxis OK!");
    } else {
      const errorCount = errors.filter(e => e.severity === "error").length;
      const warningCount = errors.filter(e => e.severity === "warning").length;
      
      if (errorCount > 0) {
        addLogMessage("error", `❌ ${errorCount} szintaxis hiba${errorCount > 1 ? 'k' : ''} találva`);
      }
      if (warningCount > 0) {
        addLogMessage("warning", `⚠️ ${warningCount} figyelmeztetés${warningCount > 1 ? 'ek' : ''} találva`);
      }
      
      // Részletes hibaüzenetek
      errors.slice(0, 5).forEach((err) => {
        const level = err.severity === "error" ? "error" : "warning";
        addLogMessage(level, `  ${level === "error" ? "❌" : "⚠️"} Sor ${err.line}: ${err.message}`);
      });
      
      if (errors.length > 5) {
        addLogMessage("info", `  ... és még ${errors.length - 5} hiba`);
      }
    }
    setShowSyntaxPanel(true);
  }, [code, addLogMessage, getCodeHash]);

  // PL/I fájl detektálás
  const isPLIFile = React.useCallback((filePath: string | null): boolean => {
    if (!filePath) return false;
    const ext = filePath.toLowerCase().split('.').pop();
    return ext === 'pli' || ext === 'pl1' || ext === 'pli1' || ext === 'inc';
  }, []);

  // AGENTIC Validálás - LLM tool-okkal elemzi az AKTUÁLIS FÁJLT
  const handleAgenticValidation = React.useCallback(async () => {
    console.log("[AI VALIDÁLÁS] Gomb kattintva!", { selectedProjectId, selectedFilePath });
    
    if (!selectedProjectId || !selectedFilePath) {
      addLogMessage("warning", "Válassz ki egy projektet és fájlt a validáláshoz!");
      console.log("[AI VALIDÁLÁS] Nincs projekt/fájl kiválasztva");
      return;
    }
    
    console.log("[AI VALIDÁLÁS] Indítás...");
    setAgenticAnalysisLoading(true);
    addLogMessage("info", `🔍 **AI VALIDÁLÁS** - ${selectedFilePath}`);
    
    // Csak PL/I fájloknál futtassuk a lokális PL/I checker-t
    const isPLI = isPLIFile(selectedFilePath);
    if (isPLI && code && code.trim().length > 0) {
      const localErrors = checkPLISyntax(code);
      if (localErrors.length > 0) {
        setSyntaxErrors(localErrors);
        addLogMessage("warning", `PL/I checker: ${localErrors.length} probléma találva`);
      }
    } else if (!isPLI) {
      // Nem PL/I fájl - töröljük az esetleges régi PL/I hibákat
      setSyntaxErrors([]);
    }
    
    try {
      const resp = await fetch(`${BACKEND_URL}/api/agentic/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: selectedProjectId,
          file_path: selectedFilePath,
          analysis_type: autoMode ? "validate_and_fix" : "validate",  // AUTO mód = automatikus javítás
          scope: "file",
          auto_mode: autoMode,  // Átadjuk az auto módot
          additional_context: syntaxErrors.length > 0 
            ? `PL/I checker hibák: ${syntaxErrors.map(e => `${e.line}: ${e.message}`).join(', ')}`
            : undefined
        }),
      });
      
      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(errText);
      }
      
      const data = await resp.json();
      
      if (data.success) {
        const modeLabel = autoMode ? "(AUTO)" : "(MANUAL)";
        addLogMessage("success", `✅ **AI VALIDÁLÁS** ${modeLabel} kész (${data.tool_calls_count} tool hívás)`);
        
        // Készítsük el az eredményt módosítás adatokkal
        let validationResult = `## 🔍 AI Validálás - ${selectedFilePath}\n\n${data.analysis}`;
        const valMsgId = generateUniqueId();
        let valModifications: FileModification[] = [];
        
        // Ha volt módosítás (AUTO módban), frissítsük a fájlt
        // ⚠️ Szűrjük ki a VALÓBAN módosított fájlokat (ahol történt változás)
        const actualMods = (data.modified_files || []).filter(
          (f: any) => (f.lines_added || 0) > 0 || (f.lines_deleted || 0) > 0
        );
        
        if (actualMods.length > 0) {
          const totalAdded = actualMods.reduce((sum: number, f: any) => sum + (f.lines_added || 0), 0);
          const totalDeleted = actualMods.reduce((sum: number, f: any) => sum + (f.lines_deleted || 0), 0);
          
          // Módosítás adatok mentése
          valModifications = actualMods.map((f: any) => ({
            path: f.path,
            action: f.action || 'edit',
            lines_added: f.lines_added || 0,
            lines_deleted: f.lines_deleted || 0,
            before_content: f.before_content,
            after_content: f.after_content,
            timestamp: new Date().toISOString(),
            messageId: valMsgId,
          }));
          
          // Módosítások összefoglalása
          validationResult += '\n\n---\n### ✅ Módosítások alkalmazva\n\n';
          for (const file of actualMods) {
            const linesInfo = ` **(+${file.lines_added || 0}/-${file.lines_deleted || 0})**`;
            const action = file.action === 'create' ? '🆕' : file.action === 'edit' ? '✏️' : '📝';
            validationResult += `${action} [[DIFF:${file.path}]]${linesInfo}\n`;
          }
          validationResult += `\n**Összesen:** ${actualMods.length} fájl (+${totalAdded}/-${totalDeleted} sor)\n`;
          validationResult += `\n*Kattints a fájlnévre a változások megtekintéséhez!*`;
          
          addLogMessage("info", `📝 ${actualMods.length} fájl módosítva (+${totalAdded}/-${totalDeleted} sor)`);
          setRefreshFilesTrigger(prev => prev + 1);
          
          // Módosítások mentése a history-ba
          if (valModifications.length > 0) {
            setModificationsHistory(prev => [...prev, ...valModifications]);
          }
          
          // Újratöltjük a fájl tartalmát
          if (selectedFilePath) {
            fetch(`${BACKEND_URL}/api/files/content/${selectedProjectId}?file_path=${encodeURIComponent(selectedFilePath)}`)
              .then(r => r.json())
              .then(fileData => {
                if (fileData.content) {
                  setCode(fileData.content.replace(/^\uFEFF/, ''));
                }
              })
              .catch(console.error);
          }
        }
        
        // Eredmény hozzáadása chat-hez
        setChatMessages(prev => [...prev, {
          id: valMsgId,
          role: "assistant",
          text: validationResult,
          modifications: valModifications.length > 0 ? valModifications : undefined,
        }]);
        
        // MANUAL módban - ha vannak függőben lévő jóváhagyások
        if (data.pending_permissions && data.pending_permissions.length > 0) {
          addLogMessage("warning", `⚠️ ${data.pending_permissions.length} javítás vár jóváhagyásra`);
          // Hozzáadjuk a globális pending permissions listához
          setPendingToolPermissions(prev => {
            const newPerms = data.pending_permissions.filter(
              (p: any) => !prev.some(existing => 
                existing.permission_type === p.permission_type && 
                existing.details?.path === p.details?.path &&
                JSON.stringify(existing.details) === JSON.stringify(p.details)
              )
            );
            return [...prev, ...newPerms];
          });
        }
      } else {
        addLogMessage("error", `❌ AI validálás hiba: ${data.errors?.join(', ')}`);
      }
    } catch (e: any) {
      console.error("[AI VALIDÁLÁS] Hiba:", e);
      addLogMessage("error", `❌ AI validálás hiba: ${e.message}`);
    } finally {
      console.log("[AI VALIDÁLÁS] Befejezve");
      setAgenticAnalysisLoading(false);
    }
  }, [selectedProjectId, selectedFilePath, code, syntaxErrors, addLogMessage, isPLIFile, autoMode]);

  // AGENTIC Javaslat - LLM tool-okkal elemzi és javítja a TELJES PROJEKTET
  const handleAgenticSuggestion = React.useCallback(async () => {
    if (!selectedProjectId) {
      addLogMessage("warning", "Válassz ki egy projektet a projekt elemzéshez!");
      return;
    }
    
    setAgenticAnalysisLoading(true);
    addLogMessage("info", "💡 **AI PROJEKT ELEMZÉS** indítása...");
    
    try {
      const resp = await fetch(`${BACKEND_URL}/api/agentic/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: selectedProjectId,
          file_path: selectedFilePath || undefined,  // Opcionális - ha van, azt is megnézi először
          analysis_type: "suggest",
          scope: "project",  // Teljes projekt elemzés
          additional_context: chatInput.trim() ? `User context: ${chatInput}` : undefined
        }),
      });
      
      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(errText);
      }
      
      const data = await resp.json();
      
      if (data.success) {
        addLogMessage("success", `✅ **AI PROJEKT ELEMZÉS** kész (${data.tool_calls_count} tool hívás)`);
        
        const projMsgId = generateUniqueId();
        let projModifications: FileModification[] = [];
        let projResult = `## 💡 AI Projekt Elemzés\n\n${data.analysis}`;
        
        // Ha volt módosítás, frissítsük a fájlokat ÉS mutassuk a részleteket
        // ⚠️ Szűrjük ki a VALÓBAN módosított fájlokat
        const actualProjMods = (data.modified_files || []).filter(
          (f: any) => (f.lines_added || 0) > 0 || (f.lines_deleted || 0) > 0
        );
        
        if (actualProjMods.length > 0) {
          const totalAdded = actualProjMods.reduce((sum: number, f: any) => sum + (f.lines_added || 0), 0);
          const totalDeleted = actualProjMods.reduce((sum: number, f: any) => sum + (f.lines_deleted || 0), 0);
          
          // Módosítások mentése
          projModifications = actualProjMods.map((f: any) => ({
            path: f.path,
            action: f.action || 'edit',
            lines_added: f.lines_added || 0,
            lines_deleted: f.lines_deleted || 0,
            before_content: f.before_content,
            after_content: f.after_content,
            timestamp: new Date().toISOString(),
            messageId: projMsgId,
          }));
          
          // Összefoglaló hozzáadása
          projResult += '\n\n---\n### ✅ Módosítások alkalmazva\n\n';
          for (const file of actualProjMods) {
            const linesInfo = ` **(+${file.lines_added || 0}/-${file.lines_deleted || 0})**`;
            const action = file.action === 'create' ? '🆕' : file.action === 'edit' ? '✏️' : '📝';
            projResult += `${action} [[DIFF:${file.path}]]${linesInfo}\n`;
          }
          projResult += `\n**Összesen:** ${actualProjMods.length} fájl (+${totalAdded}/-${totalDeleted} sor)\n`;
          projResult += `\n*Kattints a fájlnévre a változások megtekintéséhez!*`;
          
          addLogMessage("info", `📝 ${actualProjMods.length} fájl módosítva (+${totalAdded}/-${totalDeleted} sor)`);
          
          // Módosítások mentése a history-ba
          if (projModifications.length > 0) {
            setModificationsHistory(prev => [...prev, ...projModifications]);
          }
          
          setRefreshFilesTrigger(prev => prev + 1);
          
          // Ha van nyitott fájl és az módosult, frissítsük
          if (selectedFilePath) {
            const modifiedPaths = actualProjMods.map((f: any) => f.path);
            if (modifiedPaths.some((p: string) => selectedFilePath.includes(p) || p.includes(selectedFilePath))) {
              const fileResp = await fetch(
                `${BACKEND_URL}/projects/${selectedProjectId}/file?rel_path=${encodeURIComponent(selectedFilePath)}`
              );
              if (fileResp.ok) {
                const fileData = await fileResp.json();
                setCode((fileData.content || "").replace(/^\uFEFF/, ''));
              }
            }
          }
        } else {
          // Nincs módosítás
          projResult += '\n\n---\n### ℹ️ Megjegyzés\nNem történt fájl módosítás.';
        }
        
        // Eredmény hozzáadása chat-hez a módosítás adatokkal
        setChatMessages(prev => [...prev, {
          id: projMsgId,
          role: "assistant",
          text: projResult,
          modifications: projModifications.length > 0 ? projModifications : undefined,
        }]);
      } else {
        addLogMessage("error", `❌ AI projekt elemzés hiba: ${data.errors?.join(', ')}`);
      }
    } catch (e: any) {
      addLogMessage("error", `❌ AI projekt elemzés hiba: ${e.message}`);
    } finally {
      setAgenticAnalysisLoading(false);
    }
  }, [selectedProjectId, selectedFilePath, chatInput, addLogMessage]);

  // Szintaxis hiba javítás - egyedi hiba
  const handleFixSyntaxError = React.useCallback(async (error: SyntaxError) => {
    if (!selectedProjectId || !selectedFilePath || !code) {
      addLogMessage("error", "Nincs kiválasztott fájl a javításhoz");
      return;
    }

    setIsFixingSyntax(true);
    addLogMessage("info", `🔧 Hiba javítása: ${error.line}. sor - ${error.message}`);

    try {
      const resp = await fetch(`${BACKEND_URL}/api/fix-error`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: String(selectedProjectId),
          file_path: selectedFilePath,
          code: code,
          error_line: error.line,
          error_message: error.message,
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(errText || `HTTP ${resp.status}`);
      }

      const data = await resp.json();
      
      if (data.fixed_code) {
        const beforeCode = code;
        const afterCode = data.fixed_code;
        
        setCode(afterCode);
        addLogMessage("success", `✅ Hiba javítva: ${error.line}. sor`);
        
        // Diff számítás
        const beforeLines = beforeCode.split('\n').length;
        const afterLines = afterCode.split('\n').length;
        const linesAdded = Math.max(0, afterLines - beforeLines);
        const linesDeleted = Math.max(0, beforeLines - afterLines);
        
        // Módosítás mentése és chat üzenet
        const fixMsgId = generateUniqueId();
        const fixModification: FileModification = {
          path: selectedFilePath,
          action: "edit",
          lines_added: linesAdded,
          lines_deleted: linesDeleted,
          before_content: beforeCode,
          after_content: afterCode,
          timestamp: new Date().toISOString(),
          messageId: fixMsgId,
        };
        setModificationsHistory(prev => [...prev, fixModification]);
        
        // Chat üzenet
        setChatMessages(prev => [...prev, {
          id: fixMsgId,
          role: "system",
          text: `### 🔧 Szintaxis hiba javítva\n\n` +
                `📁 **Fájl:** \`${selectedFilePath}\`\n` +
                `📍 **Sor:** ${error.line}\n` +
                `❌ **Hiba:** ${error.message}\n` +
                `📊 **Változások:** +${linesAdded} / -${linesDeleted} sor\n\n` +
                `🔍 [[DIFF:${selectedFilePath}]] ← *Kattints a változások megtekintéséhez!*`,
          modifications: [fixModification],
        }]);
        
        // Újravalidálás
        const newErrors = checkPLISyntax(data.fixed_code);
        setSyntaxErrors(newErrors);
        
        // Auto mentés ha be van kapcsolva
        if (autoMode) {
          await handleSaveFile(data.fixed_code);
        }
      } else {
        addLogMessage("warning", "⚠️ Nem sikerült javítani a hibát");
      }
    } catch (err) {
      console.error("[FIX ERROR]", err);
      addLogMessage("error", `❌ Hiba a javítás során: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsFixingSyntax(false);
    }
  }, [selectedProjectId, selectedFilePath, code, addLogMessage, autoMode]);

  // Szintaxis hiba javítás - összes hiba
  const handleFixAllSyntaxErrors = React.useCallback(async () => {
    if (!selectedProjectId || !selectedFilePath || !code || syntaxErrors.length === 0) {
      addLogMessage("error", "Nincs mit javítani");
      return;
    }

    setIsFixingSyntax(true);
    addLogMessage("info", `🔧 ${syntaxErrors.length} hiba javítása...`);

    let currentCode = code;
    let fixedCount = 0;
    
    // Hibák sorba rendezése sor szerint csökkenő sorrendben (alulról felfelé javítunk)
    const sortedErrors = [...syntaxErrors].sort((a, b) => b.line - a.line);

    for (const error of sortedErrors) {
      try {
        const resp = await fetch(`${BACKEND_URL}/api/fix-error`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id: String(selectedProjectId),
            file_path: selectedFilePath,
            code: currentCode,
            error_line: error.line,
            error_message: error.message,
          }),
        });

        if (resp.ok) {
          const data = await resp.json();
          if (data.fixed_code && data.fixed_code !== currentCode) {
            currentCode = data.fixed_code;
            fixedCount++;
          }
        }
      } catch (err) {
        console.error(`[FIX ALL] Hiba a ${error.line}. sor javításánál:`, err);
      }
    }

    if (fixedCount > 0) {
      const beforeCode = code;
      const afterCode = currentCode;
      
      setCode(afterCode);
      addLogMessage("success", `✅ ${fixedCount} hiba javítva`);
      
      // Diff számítás
      const beforeLines = beforeCode.split('\n').length;
      const afterLines = afterCode.split('\n').length;
      const linesAdded = Math.max(0, afterLines - beforeLines);
      const linesDeleted = Math.max(0, beforeLines - afterLines);
      
      // Módosítás mentése és chat üzenet
      const fixAllMsgId = generateUniqueId();
      const fixAllModification: FileModification = {
        path: selectedFilePath,
        action: "edit",
        lines_added: linesAdded,
        lines_deleted: linesDeleted,
        before_content: beforeCode,
        after_content: afterCode,
        timestamp: new Date().toISOString(),
        messageId: fixAllMsgId,
      };
      setModificationsHistory(prev => [...prev, fixAllModification]);
      
      // Újravalidálás
      const newErrors = checkPLISyntax(currentCode);
      setSyntaxErrors(newErrors);
      
      // Chat üzenet
      setChatMessages(prev => [...prev, {
        id: fixAllMsgId,
        role: "system",
        text: `### 🔧 Összes szintaxis hiba javítása\n\n` +
              `📁 **Fájl:** \`${selectedFilePath}\`\n` +
              `✅ **Javított hibák:** ${fixedCount} db\n` +
              `${newErrors.length > 0 ? `⚠️ **Maradt:** ${newErrors.length} hiba\n` : ''}` +
              `📊 **Változások:** +${linesAdded} / -${linesDeleted} sor\n\n` +
              `🔍 [[DIFF:${selectedFilePath}]] ← *Kattints a változások megtekintéséhez!*`,
        modifications: [fixAllModification],
      }]);
      
      if (newErrors.length > 0) {
        addLogMessage("warning", `⚠️ Még ${newErrors.length} hiba maradt`);
      }
      
      // Auto mentés ha be van kapcsolva
      if (autoMode) {
        await handleSaveFile(currentCode);
      }
    } else {
      addLogMessage("warning", "⚠️ Nem sikerült hibát javítani");
    }

    setIsFixingSyntax(false);
  }, [selectedProjectId, selectedFilePath, code, syntaxErrors, addLogMessage, autoMode]);

  // Szintaxis panel bezárása
  const handleCloseSyntaxPanel = React.useCallback(() => {
    setShowSyntaxPanel(false);
    setSyntaxErrors([]);
  }, []);

  // Fájl mentése
  const handleSaveFile = React.useCallback(async (codeToSave?: string) => {
    if (!selectedProjectId || !selectedFilePath) {
      addLogMessage("error", "Nincs kiválasztott fájl a mentéshez");
      return;
    }

    const contentToSave = codeToSave ?? code;
    
    try {
      const resp = await fetch(`${BACKEND_URL}/projects/${selectedProjectId}/file/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rel_path: selectedFilePath,
          content: contentToSave,
          encoding: encoding === "auto" ? "utf-8" : encoding,
        }),
      });

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }

      addLogMessage("success", `💾 Fájl mentve: ${selectedFilePath}`);
    } catch (err) {
      console.error("[SAVE]", err);
      addLogMessage("error", `❌ Mentési hiba: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [selectedProjectId, selectedFilePath, code, encoding, addLogMessage]);

  // Auto mód változás mentése
  React.useEffect(() => {
    try {
      localStorage.setItem('autoMode', String(autoMode));
    } catch {}
  }, [autoMode]);

  // Ctrl+S mentés
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSaveFile();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSaveFile]);

  // === CONTEXT MENU KEZELŐK ===

  // Manuális backup készítése
  const handleManualBackup = React.useCallback(async (filePath: string) => {
    const projectId = selectedProjectIdRef.current;
    if (!projectId) {
      addLogMessage("error", "❌ Nincs kiválasztott projekt");
      return;
    }

    try {
      addLogMessage("info", `💾 Backup készítése: ${filePath}...`);
      
      const resp = await fetch(`${BACKEND_URL}/projects/${projectId}/backup/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rel_path: filePath }),
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      
      const data = await resp.json();
      addLogMessage("success", `✅ Backup kész: ${data.backup_path || filePath}`);
    } catch (err) {
      addLogMessage("error", `❌ Backup hiba: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [addLogMessage]);

  // Fájl context menu itemek generálása
  // FONTOS: Nem használunk useCallback-et itt, mert a handler függvények később vannak definiálva
  // Az onClick arrow function-ök a legfrissebb handler referenciákat használják meghíváskor
  const getFileContextMenuItems = (node: FileNode): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];

    if (node.is_dir) {
      // Mappa menü
      items.push(
        { id: 'new-file', label: 'Új fájl', icon: '📄', onClick: () => handleCreateNewFile(node.path) },
        { id: 'new-folder', label: 'Új mappa', icon: '📁', onClick: () => handleCreateNewFolder(node.path) },
        { id: 'divider-1', label: '', divider: true },
        { id: 'rename', label: 'Átnevezés', icon: '✏️', onClick: () => handleRenameFile(node.path) },
        { id: 'delete', label: 'Törlés', icon: '🗑️', danger: true, onClick: () => handleDeleteFile(node.path) },
      );
    } else {
      // Fájl menü
      items.push(
        { id: 'open', label: 'Megnyitás', icon: '📂', onClick: () => handleLoadFile(node.path) },
        { id: 'divider-1', label: '', divider: true },
        { id: 'rename', label: 'Átnevezés', icon: '✏️', onClick: () => handleRenameFile(node.path) },
        { id: 'duplicate', label: 'Duplikálás', icon: '📋', onClick: () => handleDuplicateFile(node.path) },
        { id: 'divider-2', label: '', divider: true },
        { id: 'create-backup', label: 'Backup készítés', icon: '💾', onClick: () => handleManualBackup(node.path) },
        { id: 'restore-backup', label: 'Backup visszaállítás', icon: '🔄', onClick: () => openBackupModalForFile(node.path) },
        { id: 'divider-3', label: '', divider: true },
        { id: 'delete', label: 'Törlés', icon: '🗑️', danger: true, onClick: () => handleDeleteFile(node.path) },
      );
    }

    return items;
  };

  // Fájl context menu megjelenítése
  const handleFileContextMenu = React.useCallback((e: React.MouseEvent, node: FileNode) => {
    e.preventDefault();
    e.stopPropagation();
    const items = getFileContextMenuItems(node);
    showContextMenu(e, items, node);
  }, [showContextMenu]);

  // Touch start handler fájlokhoz
  const handleFileTouchStart = React.useCallback((e: React.TouchEvent, node: FileNode) => {
    handleTouchStart(e, () => getFileContextMenuItems(node), node);
  }, [handleTouchStart]);

  // Új fájl létrehozása
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleCreateNewFile = React.useCallback(async (parentPath: string) => {
    const projectId = selectedProjectIdRef.current;
    const fileName = prompt('Új fájl neve:');
    if (!fileName || !projectId) return;

    try {
      const newPath = parentPath ? `${parentPath}/${fileName}` : fileName;
      const resp = await fetch(`${BACKEND_URL}/projects/${projectId}/file/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rel_path: newPath, content: '', encoding: 'utf-8' }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      addLogMessage('success', `✅ Fájl létrehozva: ${newPath}`);
      loadProjectFiles();
    } catch (err) {
      addLogMessage('error', `❌ Hiba: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [addLogMessage]);

  // Új mappa létrehozása
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleCreateNewFolder = React.useCallback(async (parentPath: string) => {
    const projectId = selectedProjectIdRef.current;
    const folderName = prompt('Új mappa neve:');
    if (!folderName || !projectId) return;

    try {
      const newPath = parentPath ? `${parentPath}/${folderName}/.gitkeep` : `${folderName}/.gitkeep`;
      const resp = await fetch(`${BACKEND_URL}/projects/${projectId}/file/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rel_path: newPath, content: '', encoding: 'utf-8' }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      addLogMessage('success', `✅ Mappa létrehozva: ${folderName}`);
      loadProjectFiles();
    } catch (err) {
      addLogMessage('error', `❌ Hiba: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [addLogMessage]);

  // Fájl átnevezése
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleRenameFile = React.useCallback(async (filePath: string) => {
    const projectId = selectedProjectIdRef.current;
    const currentName = filePath.split('/').pop() || filePath;
    const newName = prompt('Új név:', currentName);
    if (!newName || newName === currentName || !projectId) return;

    try {
      const parentPath = filePath.substring(0, filePath.lastIndexOf('/'));
      const newPath = parentPath ? `${parentPath}/${newName}` : newName;
      
      const resp = await fetch(`${BACKEND_URL}/projects/${projectId}/file/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ old_path: filePath, new_path: newPath }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      addLogMessage('success', `✅ Átnevezve: ${currentName} → ${newName}`);
      loadProjectFiles();
    } catch (err) {
      addLogMessage('error', `❌ Hiba: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [addLogMessage]);

  // Fájl duplikálása
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleDuplicateFile = React.useCallback(async (filePath: string) => {
    const projectId = selectedProjectIdRef.current;
    if (!projectId) return;

    try {
      const ext = filePath.lastIndexOf('.') > 0 ? filePath.substring(filePath.lastIndexOf('.')) : '';
      const baseName = filePath.substring(0, filePath.length - ext.length);
      const newPath = `${baseName}_copy${ext}`;

      // Először betöltjük a fájl tartalmát
      const resp = await fetch(`${BACKEND_URL}/projects/${projectId}/file?rel_path=${encodeURIComponent(filePath)}`);
      if (!resp.ok) throw new Error('Nem sikerült betölteni a fájlt');
      const data = await resp.json();

      // Majd létrehozzuk az új fájlt
      const saveResp = await fetch(`${BACKEND_URL}/projects/${projectId}/file/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rel_path: newPath, content: data.content, encoding: 'utf-8' }),
      });
      if (!saveResp.ok) throw new Error(`HTTP ${saveResp.status}`);
      addLogMessage('success', `✅ Fájl duplikálva: ${newPath}`);
      loadProjectFiles();
    } catch (err) {
      addLogMessage('error', `❌ Hiba: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [addLogMessage]);

  // Fájl törlése
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleDeleteFile = React.useCallback(async (filePath: string) => {
    const projectId = selectedProjectIdRef.current;
    if (!projectId) {
      addLogMessage('error', '❌ Nincs kiválasztott projekt');
      return;
    }
    
    const confirmed = confirm(`Biztosan törlöd? ${filePath}`);
    if (!confirmed) return;

    try {
      const resp = await fetch(`${BACKEND_URL}/projects/${projectId}/file/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath }),
      });
      
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.detail || `HTTP ${resp.status}`);
      }
      
      addLogMessage('success', `✅ Törölve: ${filePath}`);
      loadProjectFiles();
      
      // Ha a törölt fájl volt megnyitva, töröljük a kiválasztást
      if (selectedFilePath === filePath) {
        setSelectedFilePath(null);
        setCode('');
      }
    } catch (err) {
      addLogMessage('error', `❌ Törlés hiba: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [selectedFilePath, addLogMessage]);

  // Backup modal megnyitása egy adott fájlhoz
  const openBackupModalForFile = React.useCallback(async (filePath: string) => {
    const projectId = selectedProjectIdRef.current;
    if (!projectId) {
      addLogMessage('error', '❌ Nincs kiválasztott projekt');
      return;
    }
    
    setShowBackupModal(true);
    setBackupLoading(true);
    setBackupError(null);
    setSelectedBackup(null);
    setBackupPreview('');
    
    try {
      const resp = await fetch(`${BACKEND_URL}/projects/${projectId}/backups?file_filter=${encodeURIComponent(filePath)}`);
      if (!resp.ok) throw new Error('Nem sikerült betölteni a backupokat');
      const data = await resp.json();
      setBackupList(data.backups || []);
      
      if (data.backups?.length === 0) {
        setBackupError(`Nincs backup ehhez a fájlhoz: ${filePath}`);
      }
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : String(err));
    } finally {
      setBackupLoading(false);
    }
  }, [addLogMessage]);

  // Chat üzenet context menu
  const getChatMessageContextMenuItems = React.useCallback((message: ChatMessage): ContextMenuItem[] => {
    return [
      { 
        id: 'copy', 
        label: 'Szöveg másolása', 
        icon: '📋', 
        onClick: () => {
          navigator.clipboard.writeText(message.text);
          addLogMessage('info', '📋 Szöveg másolva');
        }
      },
      { 
        id: 'copy-to-llm', 
        label: 'Küldés az LLM-nek', 
        icon: '💬', 
        onClick: () => {
          setChatInput(prev => prev + (prev ? '\n\n' : '') + message.text);
        }
      },
      { id: 'divider-1', label: '', divider: true },
      { 
        id: 'delete', 
        label: 'Üzenet törlése', 
        icon: '🗑️', 
        danger: true,
        onClick: () => {
          setChatMessages(prev => prev.filter(m => m.id !== message.id));
        }
      },
    ];
  }, [addLogMessage]);

  // Chat üzenet context menu
  const handleChatMessageContextMenu = React.useCallback((e: React.MouseEvent, message: ChatMessage) => {
    e.preventDefault();
    e.stopPropagation();
    const items = getChatMessageContextMenuItems(message);
    showContextMenu(e, items, message);
  }, [getChatMessageContextMenuItems, showContextMenu]);

  // Kód context menu items
  // =====================================
  //   KÓD KERESÉS FUNKCIÓK
  // =====================================
  
  const handleSearchInCode = React.useCallback(() => {
    setShowCodeSearch(true);
    // Focus a keresőmezőre - több próbálkozás a biztosabb működésért
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    setTimeout(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }, 50);
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 150);
  }, []);

  const performSearch = React.useCallback((term: string) => {
    if (!term.trim() || !code) {
      setSearchResults([]);
      setCurrentSearchIndex(0);
      return;
    }
    
    const results: {line: number; column: number; text: string}[] = [];
    const lines = code.split('\n');
    const searchLower = term.toLowerCase();
    
    lines.forEach((line, lineIndex) => {
      let column = 0;
      let searchPos = 0;
      const lineLower = line.toLowerCase();
      
      while ((searchPos = lineLower.indexOf(searchLower, column)) !== -1) {
        // Kontextus kivágása a találat körül
        const start = Math.max(0, searchPos - 20);
        const end = Math.min(line.length, searchPos + term.length + 20);
        let contextText = line.substring(start, end);
        if (start > 0) contextText = '...' + contextText;
        if (end < line.length) contextText = contextText + '...';
        
        results.push({
          line: lineIndex + 1, // 1-based
          column: searchPos + 1, // 1-based
          text: contextText
        });
        column = searchPos + 1;
      }
    });
    
    setSearchResults(results);
    setCurrentSearchIndex(0);
    
    // Első találatra scrollozás
    if (results.length > 0) {
      scrollToSearchResult(results[0]);
    }
  }, [code]);

  const scrollToSearchResult = React.useCallback((result: {line: number; column: number}, focusTextarea: boolean = false) => {
    // ScrollToLine state-et használjuk ha van
    setScrollToLine(result.line);
    
    // Textarea-ba is scrollozunk
    const textarea = document.querySelector('.code-textarea') as HTMLTextAreaElement;
    if (textarea) {
      const lines = code.split('\n');
      let charIndex = 0;
      for (let i = 0; i < result.line - 1; i++) {
        charIndex += lines[i].length + 1;
      }
      charIndex += result.column - 1;
      
      // Scrollozás a megfelelő pozícióba (focus nélkül alapból!)
      const lineHeight = 21; // becsült sormagasság
      textarea.scrollTop = Math.max(0, (result.line - 5) * lineHeight);
      
      // Csak akkor fókuszáljuk ha expliciten kérjük
      if (focusTextarea) {
        textarea.focus();
        textarea.setSelectionRange(charIndex, charIndex + searchTerm.length);
      }
    }
  }, [code, searchTerm]);

  const goToNextSearchResult = React.useCallback(() => {
    if (searchResults.length === 0) return;
    const nextIndex = (currentSearchIndex + 1) % searchResults.length;
    setCurrentSearchIndex(nextIndex);
    scrollToSearchResult(searchResults[nextIndex]);
  }, [searchResults, currentSearchIndex, scrollToSearchResult]);

  const goToPrevSearchResult = React.useCallback(() => {
    if (searchResults.length === 0) return;
    const prevIndex = currentSearchIndex === 0 ? searchResults.length - 1 : currentSearchIndex - 1;
    setCurrentSearchIndex(prevIndex);
    scrollToSearchResult(searchResults[prevIndex]);
  }, [searchResults, currentSearchIndex, scrollToSearchResult]);

  const closeSearch = React.useCallback(() => {
    // Ha van találat, fókuszáljuk a textarea-t és válasszuk ki a szöveget
    if (searchResults.length > 0 && searchTerm) {
      const result = searchResults[currentSearchIndex];
      const textarea = document.querySelector('.code-textarea') as HTMLTextAreaElement;
      if (textarea && result) {
        const lines = code.split('\n');
        let charIndex = 0;
        for (let i = 0; i < result.line - 1; i++) {
          charIndex += lines[i].length + 1;
        }
        charIndex += result.column - 1;
        
        textarea.focus();
        textarea.setSelectionRange(charIndex, charIndex + searchTerm.length);
      }
    }
    
    setShowCodeSearch(false);
    setSearchTerm("");
    setSearchResults([]);
    setCurrentSearchIndex(0);
  }, [searchResults, currentSearchIndex, searchTerm, code]);

  // Ctrl+F kezelése
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement as HTMLElement;
      const isSearchInput = activeElement?.classList.contains('code-search-input');
      
      // Ha a keresőmezőben vagyunk, csak Escape-et kezeljük
      if (isSearchInput) {
        if (e.key === 'Escape') {
          closeSearch();
        }
        // Minden más billentyű maradjon az inputban!
        return;
      }
      
      // Ctrl+F vagy Cmd+F
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        // Csak ha a kód tab aktív és nem vagyunk a chat inputban
        if (activeTab === 'code' || window.innerWidth > 768) {
          const isChatInput = activeElement?.classList.contains('chat-input');
          
          if (!isChatInput) {
            e.preventDefault();
            handleSearchInCode();
          }
        }
      }
      // Escape a keresés bezárásához
      if (e.key === 'Escape' && showCodeSearch) {
        closeSearch();
      }
      // F3 vagy Ctrl+G a következő találathoz (ha nincs fókuszban a kereső)
      if (showCodeSearch && searchResults.length > 0) {
        if (e.key === 'F3' || ((e.ctrlKey || e.metaKey) && e.key === 'g')) {
          e.preventDefault();
          if (e.shiftKey) {
            goToPrevSearchResult();
          } else {
            goToNextSearchResult();
          }
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, showCodeSearch, searchResults, handleSearchInCode, closeSearch, goToNextSearchResult, goToPrevSearchResult]);

  const getCodeContextMenuItems = React.useCallback((selection: string): ContextMenuItem[] => {
    const hasSelection = selection.length > 0;
    
    // Segédfüggvény: chat fülre váltás mobilon
    const goToChatTab = () => {
      if (window.innerWidth <= 768) {
        setActiveTab("chat");
      }
    };

    return [
      {
        id: 'search',
        label: '🔍 Keresés a kódban (Ctrl+F)',
        onClick: handleSearchInCode
      },
      {
        id: 'search-selection',
        label: `🔎 "${selection.substring(0, 20)}${selection.length > 20 ? '...' : ''}" keresése`,
        disabled: !hasSelection,
        onClick: () => {
          if (hasSelection) {
            setShowCodeSearch(true);
            setSearchTerm(selection.substring(0, 100)); // Max 100 karakter
            setTimeout(() => {
              performSearch(selection.substring(0, 100));
              searchInputRef.current?.focus();
            }, 100);
          }
        }
      },
      { id: 'divider-search', label: '', divider: true },
      {
        id: 'ai-explain',
        label: '🤖 AI: Magyarázd el',
        disabled: !hasSelection,
        onClick: () => {
          if (hasSelection) {
            setChatInput(`Magyarázd el ezt a kódot:\n\`\`\`\n${selection}\n\`\`\``);
            goToChatTab();
          }
        }
      },
      {
        id: 'ai-improve',
        label: '✨ AI: Javíts rajta',
        disabled: !hasSelection,
        onClick: () => {
          if (hasSelection) {
            setChatInput(`Javíts ezen a kódon és tedd hatékonyabbá:\n\`\`\`\n${selection}\n\`\`\``);
            goToChatTab();
          }
        }
      },
      {
        id: 'ai-fix',
        label: '🔧 AI: Hibát keresek',
        disabled: !hasSelection,
        onClick: () => {
          if (hasSelection) {
            setChatInput(`Keress hibákat ebben a kódban és javítsd:\n\`\`\`\n${selection}\n\`\`\``);
            goToChatTab();
          }
        }
      },
      {
        id: 'ai-test',
        label: '🧪 AI: Generálj tesztet',
        disabled: !hasSelection,
        onClick: () => {
          if (hasSelection) {
            setChatInput(`Generálj unit teszteket ehhez a kódhoz:\n\`\`\`\n${selection}\n\`\`\``);
            goToChatTab();
          }
        }
      },
      { id: 'divider1', label: '', divider: true },
      {
        id: 'ai-full-code',
        label: '📄 AI: Teljes kód elemzés',
        onClick: () => {
          setChatInput(`Elemezd a teljes kódot és adj javaslatokat a javításra:\n\`\`\`\n${code.substring(0, 5000)}\n\`\`\``);
          goToChatTab();
        }
      },
      {
        id: 'ai-refactor',
        label: '🔄 AI: Refaktorálás',
        onClick: () => {
          setChatInput(`Refaktoráld ezt a kódot, tedd tisztábbá és karbantarthatóbbá:\n\`\`\`\n${hasSelection ? selection : code.substring(0, 5000)}\n\`\`\``);
          goToChatTab();
        }
      },
      { id: 'divider2', label: '', divider: true },
      {
        id: 'copy',
        label: '📋 Másolás',
        disabled: !hasSelection,
        onClick: async () => {
          if (hasSelection) {
            try {
              await navigator.clipboard.writeText(selection);
              addLogMessage("success", "✅ Kód másolva a vágólapra");
            } catch (err) {
              // Fallback: régi módszer
              const textarea = document.createElement('textarea');
              textarea.value = selection;
              textarea.style.position = 'fixed';
              textarea.style.opacity = '0';
              document.body.appendChild(textarea);
              textarea.select();
              document.execCommand('copy');
              document.body.removeChild(textarea);
              addLogMessage("success", "✅ Kód másolva a vágólapra");
            }
          }
        }
      },
      {
        id: 'copy-to-chat',
        label: '💬 Másolás a chatbe',
        disabled: !hasSelection,
        onClick: () => {
          if (hasSelection) {
            setChatInput(prev => {
              const codeBlock = `\`\`\`\n${selection}\n\`\`\``;
              return prev ? prev + '\n\n' + codeBlock : codeBlock;
            });
            addLogMessage("success", "✅ Kód beillesztve a chatbe");
            // Mobilon váltsunk chat fülre
            goToChatTab();
          }
        }
      },
    ];
  }, [code, setChatInput, addLogMessage, setActiveTab]);

  // Kód kontextus menü kezelő
  const handleCodeContextMenu = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Kijelölt szöveg lekérése
    const selection = window.getSelection()?.toString() || '';
    setSelectedCode(selection);
    
    const items = getCodeContextMenuItems(selection);
    showContextMenu(e, items);
  }, [getCodeContextMenuItems, showContextMenu]);

  // Projekt exportálás - mode: "light" vagy "full"
  const handleExportProject = React.useCallback(async (mode: "light" | "full" = "light") => {
    if (!selectedProjectId) {
      addLogMessage("error", "Nincs kiválasztott projekt");
      return;
    }

    try {
      const modeLabel = mode === "full" ? "teljes" : "könnyű";
      addLogMessage("info", `📤 Projekt exportálása (${modeLabel})...`);
      const resp = await fetch(`${BACKEND_URL}/projects/${selectedProjectId}/export?mode=${mode}`);
      
      if (!resp.ok) throw new Error("Export sikertelen");
      
      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const suffix = mode === "full" ? "_full" : "";
      a.download = `project_${selectedProjectId}${suffix}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      addLogMessage("success", "✅ Projekt exportálva!");
    } catch (err) {
      addLogMessage("error", `❌ Export hiba: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [selectedProjectId, addLogMessage]);

  // Export dialog state
  const [showExportDialog, setShowExportDialog] = React.useState(false);

  // Project context menu state
  const [projectContextMenu, setProjectContextMenu] = React.useState<{
    x: number;
    y: number;
    projectId: number;
  } | null>(null);
  const longPressTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  // Scroll buttons visibility
  const [showScrollButtons, setShowScrollButtons] = React.useState(false);

  // Scroll position tracking for scroll buttons
  React.useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const docHeight = document.documentElement.scrollHeight;
      const windowHeight = window.innerHeight;
      // Show buttons when scrolled more than 200px or when content is scrollable
      setShowScrollButtons(scrollY > 200 || docHeight > windowHeight + 400);
    };
    window.addEventListener('scroll', handleScroll);
    handleScroll(); // Initial check
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Scroll to top/bottom handlers
  const scrollToTop = React.useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const scrollToBottom = React.useCallback(() => {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
  }, []);

  // Project context menu handlers
  const handleProjectContextMenu = React.useCallback((e: React.MouseEvent, projectId: number) => {
    e.preventDefault();
    e.stopPropagation();
    setProjectContextMenu({
      x: e.clientX,
      y: e.clientY,
      projectId,
    });
  }, []);

  const handleProjectLongPressStart = React.useCallback((e: React.TouchEvent, projectId: number) => {
    const touch = e.touches[0];
    const startX = touch.clientX;
    const startY = touch.clientY;
    
    longPressTimerRef.current = setTimeout(() => {
      // Prevent default to stop text selection
      e.preventDefault();
      setProjectContextMenu({
        x: startX,
        y: startY,
        projectId,
      });
      // Vibrate if supported
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    }, 500); // 500ms long press
  }, []);

  const handleProjectLongPressEnd = React.useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  // Close project context menu when clicking outside
  const contextMenuRef = React.useRef<HTMLDivElement>(null);
  const menuOpenTimeRef = React.useRef<number>(0);
  
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      // Don't close if clicking inside the context menu
      if (contextMenuRef.current && contextMenuRef.current.contains(e.target as Node)) {
        return;
      }
      // Ignore events within 400ms of menu opening (prevents close on finger lift)
      if (Date.now() - menuOpenTimeRef.current < 400) {
        return;
      }
      setProjectContextMenu(null);
    };
    if (projectContextMenu) {
      menuOpenTimeRef.current = Date.now();
      // Small delay to prevent immediate close on mobile
      const timer = setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
        document.addEventListener('touchend', handleClickOutside);
      }, 50);
      return () => {
        clearTimeout(timer);
        document.removeEventListener('click', handleClickOutside);
        document.removeEventListener('touchend', handleClickOutside);
      };
    }
  }, [projectContextMenu]);

  // Terminal parancs végrehajtása
  const executeTerminalCommand = React.useCallback(async (command: string, shellOverride?: 'powershell' | 'cmd' | 'bash') => {
    if (!command.trim()) return;

    const selectedProject = projects.find(p => p.id === selectedProjectId);
    const workingDir = selectedProject?.root_path || undefined;
    const shellType = shellOverride || terminalShellType;

    setTerminalOutput(prev => [...prev, `[${shellType.toUpperCase()}] $ ${command}`]);

    try {
      const resp = await fetch(`${BACKEND_URL}/api/terminal/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command,
          working_dir: workingDir,
          timeout: 60,
          shell_type: shellType,
        }),
      });

      const data = await resp.json();
      
      if (data.stdout) {
        setTerminalOutput(prev => [...prev, data.stdout]);
      }
      if (data.stderr) {
        setTerminalOutput(prev => [...prev, `[ERROR] ${data.stderr}`]);
      }
      
      addLogMessage(data.success ? "success" : "error", 
        `Terminal [${shellType}]: ${command.substring(0, 50)}... (exit: ${data.return_code})`);
        
    } catch (err) {
      setTerminalOutput(prev => [...prev, `[ERROR] ${err}`]);
      addLogMessage("error", `Terminal hiba: ${err}`);
    }

    setTerminalInput('');
  }, [selectedProjectId, projects, addLogMessage, terminalShellType]);


  // Projekt importálás
  const handleImportProject = React.useCallback(async () => {
    // File input létrehozása
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip';
    
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const name = prompt("Projekt neve:", file.name.replace('.zip', ''));
      if (!name) return;

      const targetPath = prompt("Cél mappa útvonal:", `D:\\Projects\\${name}`);
      if (!targetPath) return;

      try {
        addLogMessage("info", "📥 Projekt importálása...");
        
        // ZIP fájl kicsomagolása a célmappába (egyszerűsített - a backend kezeli)
        const resp = await fetch(`${BACKEND_URL}/projects/import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, target_path: targetPath }),
        });

        if (!resp.ok) throw new Error("Import sikertelen");
        
        addLogMessage("success", `✅ Projekt importálva: ${name}`);
        
        // Projektek újratöltése
        loadProjects();
      } catch (err) {
        addLogMessage("error", `❌ Import hiba: ${err instanceof Error ? err.message : String(err)}`);
      }
    };

    input.click();
  }, [addLogMessage]);

  // Javaslat kezelő függvények
  const handleApplySuggestion = React.useCallback(async () => {
    if (!currentSuggestion) return;
    
    let newCode: string;
    // FONTOS: Mindig a JELENLEGI code-ot használjuk, nem a suggestion.fullCode-ot!
    // Ez biztosítja, hogy a megfelelő helyre kerül a módosítás
    const workingCode = code;
    const originalSnippet = currentSuggestion.originalSnippet;
    const suggestedSnippet = currentSuggestion.suggestedSnippet;
    
    console.log(`[APPLY] code hossza: ${code.split("\n").length} sor`);
    console.log(`[APPLY] fullCode hossza: ${currentSuggestion.fullCode.split("\n").length} sor`);
    console.log(`[APPLY] Eltérés: ${currentSuggestion.fullCode.split("\n").length - code.split("\n").length} sor`);
    
    // Ha a teljes kód egyezik az eredeti snippet-tel -> teljes csere
    if (originalSnippet === workingCode) {
      newCode = suggestedSnippet;
    } 
    // Ha az originalSnippet egy placeholder (új kód hozzáadás)
    else if (originalSnippet.includes("Ãšj kód beszúrása")) {
      // Ãšj kód hozzáfűzése a végéhez
      newCode = workingCode + "\n\n" + suggestedSnippet;
    }
    // Részleges csere
    else {
      // Próbáljuk megtalálni és lecserélni az eredeti snippet-et
      if (workingCode.includes(originalSnippet)) {
        newCode = workingCode.replace(originalSnippet, suggestedSnippet);
      } else if (workingCode.includes(originalSnippet.trim())) {
        newCode = workingCode.replace(originalSnippet.trim(), suggestedSnippet.trim());
      } else {
        // Soronkénti keresés a JAVASOLT kód első sora alapján (nem az originalSnippet)
        const workingLines = workingCode.split("\n");
        const suggestLines = suggestedSnippet.split("\n");
        const origLines = originalSnippet.split("\n");
        
        // Keressük a suggestedSnippet első sorát, ami valószínűleg egyezik az eredetivel
        let startIdx = -1;
        const firstSuggestLine = suggestLines[0]?.trim().toLowerCase();
        
        for (let i = 0; i < workingLines.length; i++) {
          if (workingLines[i].trim().toLowerCase() === firstSuggestLine) {
            startIdx = i;
            console.log(`[APPLY] Találat a jelenlegi kódban: ${i + 1}. sor`);
            break;
          }
        }
        
        // Ha nem találtuk, próbáljuk az originalSnippet első sorával
        if (startIdx === -1) {
          const firstOrigLine = origLines[0]?.trim().toLowerCase();
          for (let i = 0; i < workingLines.length; i++) {
            if (workingLines[i].trim().toLowerCase() === firstOrigLine) {
              startIdx = i;
              console.log(`[APPLY] Találat (orig alapján) a jelenlegi kódban: ${i + 1}. sor`);
              break;
            }
          }
        }
        
        if (startIdx !== -1) {
          const before = workingLines.slice(0, startIdx);
          const after = workingLines.slice(startIdx + origLines.length);
          newCode = [...before, ...suggestLines, ...after].join("\n");
        } else {
          console.log(`[APPLY] Nem található egyezés, hozzáfűzés a végéhez`);
          newCode = workingCode + "\n\n" + suggestedSnippet;
        }
      }
    }
    
    // Alkalmazzuk a javaslatot a UI-ban
    setCode(newCode);
    
    // Ha van kiválasztott projekt és fájl, mentsük a fájlba is (backup-pal)
    if (selectedProjectId && selectedFilePath) {
      console.log(`[SAVE] Mentés indítása: ${selectedFilePath}`);
      try {
        const res = await fetch(
          `${BACKEND_URL}/projects/${selectedProjectId}/file/save`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              rel_path: selectedFilePath,
              content: newCode,
              encoding: encoding,
            }),
          }
        );
        
        if (res.ok) {
          const data = await res.json();
          if (data.backup_path) {
            console.log(`[SAVE] Backup létrehozva: ${data.backup_path}`);
          }
          console.log(`[SAVE] Fájl mentve: ${selectedFilePath}`);
        } else {
          const err = await res.json().catch(() => ({}));
          console.error("[SAVE] Hiba:", err.detail || res.status);
          alert(`Hiba a fájl mentésekor: ${err.detail || res.status}`);
        }
      } catch (err) {
        console.error("[SAVE] Hálózati hiba:", err);
        alert("Hálózati hiba a fájl mentésekor.");
      }
    } else {
      console.log(`[SAVE] Nincs mentés - projectId: ${selectedProjectId}, filePath: ${selectedFilePath}`);
    }
    
    // Jelöljük meg alkalmazottként és távolítsuk el
    setSuggestions(prev => prev.filter(s => s.id !== currentSuggestion.id));
    
    // Index korrekció
    if (currentSuggestionIndex >= suggestions.length - 1) {
      setCurrentSuggestionIndex(Math.max(0, suggestions.length - 2));
    }
  }, [currentSuggestion, suggestions, currentSuggestionIndex, selectedProjectId, selectedFilePath, encoding]);

  const handleSkipSuggestion = React.useCallback(() => {
    if (!currentSuggestion) return;
    
    // Töröljük ezt a javaslatot
    const newSuggestions = suggestions.filter(s => s.id !== currentSuggestion.id);
    setSuggestions(newSuggestions);
    
    // Index korrigálása
    if (currentSuggestionIndex >= newSuggestions.length) {
      setCurrentSuggestionIndex(Math.max(0, newSuggestions.length - 1));
    }
  }, [currentSuggestion, suggestions, currentSuggestionIndex]);

  const handleNextSuggestion = React.useCallback(() => {
    if (currentSuggestionIndex < suggestions.length - 1) {
      setCurrentSuggestionIndex(prev => prev + 1);
    }
  }, [currentSuggestionIndex, suggestions.length]);

  const handlePrevSuggestion = React.useCallback(() => {
    if (currentSuggestionIndex > 0) {
      setCurrentSuggestionIndex(prev => prev - 1);
    }
  }, [currentSuggestionIndex]);

  const handleClearSuggestions = React.useCallback(() => {
    setSuggestions([]);
    setCurrentSuggestionIndex(0);
  }, []);

  // Backup kezelő függvények
  const loadBackups = React.useCallback(async () => {
    if (!selectedProjectId) return;
    
    setBackupLoading(true);
    setBackupError(null);
    setBackupList([]);
    setSelectedBackup(null);
    setBackupPreview(null);
    
    try {
      const res = await fetch(`${BACKEND_URL}/projects/${selectedProjectId}/backups`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      setBackupList(data.backups || []);
    } catch (err) {
      console.error("[BACKUP] Hiba a backupok betöltésekor:", err);
      setBackupError("Nem sikerült betölteni a backup listát.");
    } finally {
      setBackupLoading(false);
    }
  }, [selectedProjectId]);

  const loadBackupPreview = React.useCallback(async (filename: string) => {
    if (!selectedProjectId) return;
    
    try {
      const res = await fetch(
        `${BACKEND_URL}/projects/${selectedProjectId}/backups/${encodeURIComponent(filename)}/preview?encoding=${encoding}`
      );
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      setBackupPreview(data.content);
    } catch (err) {
      console.error("[BACKUP] Hiba az előnézet betöltésekor:", err);
      setBackupPreview("Hiba az előnézet betöltésekor.");
    }
  }, [selectedProjectId, encoding]);

  const handleRestoreBackup = React.useCallback(async () => {
    if (!selectedProjectId || !selectedBackup) return;
    
    setRestoring(true);
    
    try {
      const res = await fetch(
        `${BACKEND_URL}/projects/${selectedProjectId}/backups/restore`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            backup_filename: selectedBackup,
            encoding: encoding,
          }),
        }
      );
      
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      
      const data = await res.json();
      console.log("[RESTORE] Sikeres:", data);
      
      // A backend visszaadja hova lett visszaállítva
      const restoredPath = data.restored_to || '';
      const restoredFileName = restoredPath.split(/[/\\]/).pop() || '';
      
      console.log("[RESTORE] Visszaállított fájl:", restoredPath, "Fájlnév:", restoredFileName);
      console.log("[RESTORE] Aktuálisan nyitott:", selectedFilePath);
      
      // Keressük meg az összes nyitott tab-ot ami egyezhet
      const matchingTabs = openTabs.filter(tab => {
        const tabFileName = tab.path.split(/[/\\]/).pop() || '';
        return tabFileName === restoredFileName || tab.path.includes(restoredFileName);
      });
      
      console.log("[RESTORE] Egyező tab-ok:", matchingTabs.length);
      
      // MINDIG újratöltjük a fájlt ha a fájlnév egyezik
      const selectedFileName = selectedFilePath ? selectedFilePath.split(/[/\\]/).pop() : '';
      
      if (restoredFileName && (selectedFileName === restoredFileName || selectedFilePath?.includes(restoredFileName))) {
        console.log("[RESTORE] Aktuális fájl frissítése...");
        // Reload the file
        const fileRes = await fetch(
          `${BACKEND_URL}/projects/${selectedProjectId}/file?rel_path=${encodeURIComponent(selectedFilePath!)}&encoding=${encoding}`
        );
        if (fileRes.ok) {
          const fileData = await fileRes.json();
          const newContent = (fileData.content || '').replace(/^\uFEFF/, '');
          setCode(newContent);
          
          // Tab frissítése is
          setOpenTabs(prev => prev.map(tab => {
            const tabFileName = tab.path.split(/[/\\]/).pop() || '';
            if (tabFileName === restoredFileName || tab.path === selectedFilePath) {
              return { ...tab, content: newContent, isDirty: false };
            }
            return tab;
          }));
          
          addLogMessage("success", `✅ Fájl újratöltve: ${selectedFilePath}`);
          console.log("[RESTORE] Fájl sikeresen újratöltve, hossz:", newContent.length);
        }
      } else if (matchingTabs.length > 0) {
        // Ha van nyitott tab de nem az aktuális, frissítsük azokat is
        for (const tab of matchingTabs) {
          const fileRes = await fetch(
            `${BACKEND_URL}/projects/${selectedProjectId}/file?rel_path=${encodeURIComponent(tab.path)}&encoding=${encoding}`
          );
          if (fileRes.ok) {
            const fileData = await fileRes.json();
            const newContent = (fileData.content || '').replace(/^\uFEFF/, '');
            setOpenTabs(prev => prev.map(t => 
              t.path === tab.path ? { ...t, content: newContent, isDirty: false } : t
            ));
            addLogMessage("success", `✅ Tab frissítve: ${tab.path}`);
          }
        }
      }
      
      // Fájl lista frissítése is
      setRefreshFilesTrigger(prev => prev + 1);
      
      alert(`Backup sikeresen visszaállítva: ${restoredPath}`);
      setShowBackupModal(false);
    } catch (err: any) {
      console.error("[RESTORE] Hiba:", err);
      alert(`Hiba a visszaállítás során: ${err.message}`);
    } finally {
      setRestoring(false);
    }
  }, [selectedProjectId, selectedBackup, encoding, selectedFilePath, openTabs, addLogMessage]);

  const openBackupModal = React.useCallback(() => {
    setShowBackupModal(true);
    loadBackups();
  }, [loadBackups]);

  // Pozíciók közti navigáció (ha több találat van)
  const handleNextPosition = React.useCallback(() => {
    if (!currentSuggestion || currentSuggestion.matchPositions.length <= 1) return;
    
    const newPos = (currentSuggestion.selectedPosition + 1) % currentSuggestion.matchPositions.length;
    const lineNum = currentSuggestion.matchPositions[newPos];
    const codeLines = currentSuggestion.fullCode.split("\n");
    const endIdx = Math.min(lineNum + currentSuggestion.suggestedSnippet.split("\n").length, codeLines.length);
    const newOriginalSnippet = codeLines.slice(lineNum, endIdx).join("\n");
    
    setSuggestions(prev => prev.map(s => 
      s.id === currentSuggestion.id 
        ? { ...s, selectedPosition: newPos, originalSnippet: newOriginalSnippet }
        : s
    ));
  }, [currentSuggestion]);

  const handlePrevPosition = React.useCallback(() => {
    if (!currentSuggestion || currentSuggestion.matchPositions.length <= 1) return;
    
    const newPos = currentSuggestion.selectedPosition === 0 
      ? currentSuggestion.matchPositions.length - 1 
      : currentSuggestion.selectedPosition - 1;
    const lineNum = currentSuggestion.matchPositions[newPos];
    const codeLines = currentSuggestion.fullCode.split("\n");
    const endIdx = Math.min(lineNum + currentSuggestion.suggestedSnippet.split("\n").length, codeLines.length);
    const newOriginalSnippet = codeLines.slice(lineNum, endIdx).join("\n");
    
    setSuggestions(prev => prev.map(s => 
      s.id === currentSuggestion.id 
        ? { ...s, selectedPosition: newPos, originalSnippet: newOriginalSnippet }
        : s
    ));
  }, [currentSuggestion]);

  // Manuális pozíció beállítás - MINDIG a jelenlegi code-ot használjuk
  const handleSetManualPosition = React.useCallback((lineNumber: number) => {
    if (!currentSuggestion) return;
    
    const codeLines = code.split("\n");
    const suggestedLineCount = currentSuggestion.suggestedSnippet.split("\n").length;
    const endIdx = Math.min(lineNumber + suggestedLineCount, codeLines.length);
    const newOriginalSnippet = codeLines.slice(lineNumber, endIdx).join("\n");
    
    // Frissítjük a suggestion-t: 
    // - fullCode = jelenlegi code (erre lesznek a pozíciók értelmezve)
    // - matchPositions = csak az új manuális pozíció
    // - originalSnippet = a code-ból kivett rész az új pozíciótól
    setSuggestions(prev => prev.map(s => 
      s.id === currentSuggestion.id 
        ? { 
            ...s, 
            fullCode: code,  // FONTOS: frissítjük a fullCode-ot!
            matchPositions: [lineNumber],
            selectedPosition: 0, 
            originalSnippet: newOriginalSnippet,
          }
        : s
    ));
    
    console.log(`[MANUAL] Pozíció manuálisan beállítva: ${lineNumber + 1}. sor`);
    console.log(`[MANUAL] fullCode frissítve (${codeLines.length} sor)`);
  }, [currentSuggestion, code]);

  // Ref az auto-scrollhoz
  const diffViewRef = React.useRef<HTMLDivElement>(null);
  
  // Chat auto-scroll ref
  const chatMessagesRef = React.useRef<HTMLDivElement>(null);

  // Fájlfa + kiválasztott fájl
  const [filesTree, setFilesTree] = React.useState<FileNode[] | null>(null);
  const [filesLoading, setFilesLoading] = React.useState(false);
  const [filesError, setFilesError] = React.useState<string | null>(null);
  // selectedFilePath fentebb van definiálva
  // --- Mappák kinyitásához / bezárásához ---
  const [expandedPaths, setExpandedPaths] = React.useState<string[]>([]);

  const handleToggleDir = React.useCallback((path: string) => {
    setExpandedPaths((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]
    );
  }, []);

  // Gondoskodunk róla, hogy a fájl útvonalához vezető mappák ki legyenek nyitva
	const ensureFilePathExpanded = React.useCallback((filePath: string) => {
	  const parts = filePath.split("/");
	  const dirs: string[] = [];

	  // pl. "src/app/main.ts" -> "src", "src/app"
	  for (let i = 0; i < parts.length - 1; i++) {
		const sub = parts.slice(0, i + 1).join("/");
		dirs.push(sub);
	  }

	  setExpandedPaths((prev) => {
		const s = new Set(prev);
		for (const d of dirs) s.add(d);
		return Array.from(s);
	  });
	}, []);

  // Ãšj projekt modál state
  const [isProjectModalOpen, setIsProjectModalOpen] =
    React.useState(false);
  const [projectModalMode, setProjectModalMode] = React.useState<
    "create" | "edit"
  >("create");
  const [editingProjectId, setEditingProjectId] =
    React.useState<number | null>(null);
  const [newProjectName, setNewProjectName] = React.useState("");
  const [newProjectDescription, setNewProjectDescription] =
    React.useState("");
  const [newProjectRootPath, setNewProjectRootPath] = React.useState("");
  const [projectModalError, setProjectModalError] =
    React.useState<string | null>(null);
  const [projectModalSaving, setProjectModalSaving] =
    React.useState(false);
  
  // Mappaböngésző modál
  const [showBrowseModal, setShowBrowseModal] = React.useState(false);
  const [browseCurrentPath, setBrowseCurrentPath] = React.useState<string | null>(null);
  const [browseItems, setBrowseItems] = React.useState<Array<{ name: string; path: string; is_directory: boolean }>>([]);
  const [browseParentPath, setBrowseParentPath] = React.useState<string | null>(null);
  const [browseLoading, setBrowseLoading] = React.useState(false);

  // Chat state - BACKEND API-ból töltjük be először, fallback localStorage-ra
  const [chatMessages, setChatMessages] = React.useState<ChatMessage[]>([]);
  const [chatHistoryLoaded, setChatHistoryLoaded] = React.useState(false);
  
  // Chat history betöltése a backend API-ból
  React.useEffect(() => {
    async function loadChatFromBackend() {
      try {
        const response = await fetch(`${BACKEND_URL}/api/sync/chat?limit=100`);
        if (response.ok) {
          const data = await response.json();
          if (data.messages && data.messages.length > 0) {
            console.log(`[CHAT] ${data.messages.length} üzenet betöltve BACKEND-ből`);
            setChatMessages(data.messages.map((m: any) => ({
              id: m.id,
              role: m.role,
              text: m.text,
            })));
            setChatHistoryLoaded(true);
            return;
          }
        }
      } catch (e) {
        console.warn('[CHAT] Backend chat betöltési hiba, localStorage fallback:', e);
      }
      
      // Fallback: localStorage
      try {
        const saved = localStorage.getItem('chat_history');
        if (saved) {
          const parsed = JSON.parse(saved);
          
          // EGYSZERI TISZTÍTÁS: Ha duplikált ID-k vannak, töröljük az egészet
          const allIds = parsed.map((m: any) => m.id).filter((id: any) => id != null);
          const uniqueIds = new Set(allIds);
          if (allIds.length !== uniqueIds.size) {
            console.warn('[CHAT] ⚠️ Duplikált ID-k találhatók! localStorage TÖRÖLVE');
            localStorage.removeItem('chat_history');
            setChatHistoryLoaded(true);
            return;
          }
          
          const seenIds = new Set<number>();
          const uniqueMessages: any[] = [];
          let idCounter = 0;
          
          for (const m of parsed) {
            let newId = m.id ?? (Date.now() * 1000 + idCounter++);
            while (seenIds.has(newId)) {
              newId = Date.now() * 1000 + idCounter++;
            }
            seenIds.add(newId);
            uniqueMessages.push({ ...m, id: newId });
          }
          
          console.log(`[CHAT] ${uniqueMessages.length} üzenet betöltve localStorage-ból`);
          setChatMessages(uniqueMessages);
          
          // Szinkronizáljuk a backend-re
          if (uniqueMessages.length > 0) {
            fetch(`${BACKEND_URL}/api/sync/chat/bulk`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(uniqueMessages.map(m => ({
                id: m.id,
                role: m.role,
                text: m.text,
                project_id: null
              })))
            }).then(r => {
              if (r.ok) console.log('[CHAT] localStorage szinkronizálva a backend-re');
            }).catch(() => {});
          }
        }
      } catch (e) {
        console.error('[CHAT] localStorage hiba:', e);
        localStorage.removeItem('chat_history');
      }
      setChatHistoryLoaded(true);
    }
    
    loadChatFromBackend();
  }, []);
  // chatInput és setChatInput már korábban definiálva (context menük miatt)
  const [chatLoading, setChatLoading] = React.useState(false);
  const [chatError, setChatError] = React.useState<string | null>(null);

  // Chat history mentése backend-re és localStorage-ba amikor változik
  const lastSavedMessageIdRef = React.useRef<number>(0);
  
  React.useEffect(() => {
    if (chatMessages.length > 0 && chatHistoryLoaded) {
      try {
        // localStorage fallback
        const toSave = chatMessages.slice(-100);
        localStorage.setItem('chat_history', JSON.stringify(toSave));
        
        // Backend szinkronizáció - csak az újakat küldjük
        const lastMsg = chatMessages[chatMessages.length - 1];
        if (lastMsg && lastMsg.id && lastMsg.id > lastSavedMessageIdRef.current) {
          // Csak az utolsó üzenetet küldjük (valós időben)
          fetch(`${BACKEND_URL}/api/sync/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: lastMsg.id,
              role: lastMsg.role,
              text: lastMsg.text,
              project_id: selectedProjectId
            })
          }).then(() => {
            lastSavedMessageIdRef.current = lastMsg.id!;
          }).catch(() => {});
        }
      } catch (e) {
        console.error('[CHAT] localStorage mentési hiba:', e);
      }
    }
  }, [chatMessages, chatHistoryLoaded, selectedProjectId]);

  // ===== WEBSOCKET SYNC - Real-time szinkronizáció PC és mobil között =====
  const {
    isConnected: wsConnected,
    connectedClients,
    sendChatMessage: wsSendChat,
    sendLogMessage: wsSendLog,
    sendFileChange: wsSendFileChange,
    joinProject: wsJoinProject,
    selectProject: wsSelectProject,
  } = useWebSocketSync({
    enabled: true, // Mindig aktív
    onChatMessage: React.useCallback((msg: ChatMessage) => {
      // Távoli chat üzenet érkezett - hozzáadjuk ha nincs még
      console.log('[WS] Chat üzenet érkezett:', msg);
      setChatMessages(prev => {
        // Egyedi ID biztosítása
        const existingIds = new Set(prev.map(m => m.id));
        let newId = msg.id ?? generateUniqueId();
        while (existingIds.has(newId)) {
          newId = generateUniqueId();
        }
        
        const msgWithId = { ...msg, id: newId };
        
        // Szöveg alapú duplikáció ellenőrzés
        const isDuplicate = prev.some(m => 
          m.role === msgWithId.role && 
          m.text === msgWithId.text &&
          Math.abs((m.id || 0) - (msgWithId.id || 0)) < 60000
        );
        
        if (isDuplicate) {
          console.log('[WS] Chat üzenet duplikált, kihagyva');
          return prev;
        }
        
        console.log('[WS] Új chat üzenet hozzáadva:', msgWithId.id);
        const updated = [...prev, msgWithId];
        // Mentjük localStorage-ba is
        try {
          localStorage.setItem('chat_history', JSON.stringify(updated.slice(-100)));
        } catch (e) { /* ignore */ }
        return updated;
      });
    }, []),
    onLogMessage: React.useCallback((log: { level: string; message: string }) => {
      // Távoli log üzenet - hozzáadjuk a log listához
      addLogMessage(log.level as 'info' | 'success' | 'warning' | 'error', log.message);
    }, [addLogMessage]),
    onStateSync: React.useCallback((state: any) => {
      // Teljes állapot szinkronizáció (új kliens csatlakozáskor)
      console.log('[WS] State sync érkezett:', state);
      if (state.chat_messages && state.chat_messages.length > 0) {
        console.log(`[WS] ${state.chat_messages.length} chat üzenet a szerverről`);
        setChatMessages(prev => {
          // Összefésüljük a helyi és távoli üzeneteket
          const merged = [...prev];
          const seenIds = new Set(merged.map(m => m.id));
          let newCount = 0;
          let idCounter = 0;
          
          for (const msg of state.chat_messages) {
            // Generálunk egyedi ID-t ha nincs vagy duplikált
            let newId = msg.id ?? generateUniqueId();
            while (seenIds.has(newId)) {
              newId = generateUniqueId();
              idCounter++;
            }
            
            const msgWithId = { ...msg, id: newId };
            seenIds.add(newId);
            
            // Szöveg alapú duplikáció ellenőrzés (azonos üzenet ne legyen kétszer)
            const isDuplicate = merged.some(m => 
              m.role === msgWithId.role && 
              m.text === msgWithId.text &&
              Math.abs((m.id || 0) - (msgWithId.id || 0)) < 60000 // 1 percen belül
            );
            
            if (!isDuplicate) {
              merged.push(msgWithId);
              newCount++;
            }
          }
          
          console.log(`[WS] ${newCount} új üzenet összefésülve, összesen: ${merged.length}`);
          // Rendezés id (timestamp) szerint
          merged.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
          const final = merged.slice(-100); // Max 100 üzenet
          // Mentjük localStorage-ba
          try {
            localStorage.setItem('chat_history', JSON.stringify(final));
          } catch (e) { /* ignore */ }
          return final;
        });
      }
    }, []),
    onFileChange: React.useCallback((projectId: number, filePath: string) => {
      // Távoli fájl változás - megnyitjuk a fájlt ha ugyanaz a projekt
      if (selectedProjectId === projectId && selectedFilePath !== filePath) {
        console.log(`[WS] Távoli fájlváltás: ${filePath}`);
        // Opcionális: automatikus fájl betöltés
        // handleLoadFile(filePath);
      }
    }, [selectedProjectId, selectedFilePath]),
  });

  // Projekt szobához csatlakozás és selectProject értesítés amikor projektet váltunk
  React.useEffect(() => {
    if (wsConnected) {
      // Értesítjük a servert a projekt váltásról - per-client projekt kezelés
      wsSelectProject(selectedProjectId);
      if (selectedProjectId) {
        wsJoinProject(selectedProjectId);
      }
    }
  }, [selectedProjectId, wsConnected, wsJoinProject, wsSelectProject]);

  // Auto-scroll chat üzeneteknél - robusztus megoldás
  const scrollChatToBottom = React.useCallback(() => {
    if (chatMessagesRef.current) {
      const el = chatMessagesRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  React.useEffect(() => {
    // Azonnal scroll
    scrollChatToBottom();
    
    // Kis késleltetéssel is (DOM frissülés után)
    const t1 = setTimeout(scrollChatToBottom, 50);
    const t2 = setTimeout(scrollChatToBottom, 150);
    const t3 = setTimeout(scrollChatToBottom, 300);
    
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [chatMessages, chatLoading, scrollChatToBottom]);

  // Chat tab váltáskor is scroll
  React.useEffect(() => {
    if (activeTab === "chat") {
      setTimeout(scrollChatToBottom, 100);
    }
  }, [activeTab, scrollChatToBottom]);

  // LLM által javasolt módosítások (patch lista)
  const [suggestedPatches, setSuggestedPatches] =
    React.useState<SuggestedPatch[]>([]);
  const [activePatch, setActivePatch] =
    React.useState<SuggestedPatch | null>(null);

  // 1) Fájl megnyitása a patch alapján (fuzzy névfeloldással)
  async function handlePatchOpenFile(patch: SuggestedPatch) {
    if (!selectedProjectId) {
      alert("Először válassz egy projektet.");
      return;
    }

    if (!filesTree) {
      alert("Még nem töltődött be a fájlfa ehhez a projekthez.");
      return;
    }

    const rel = resolveRelPathFromChat(patch.filePath, filesTree);
    if (!rel) {
      alert(`A fájlt nem találtam: ${patch.filePath}`);
      return;
    }

    if (selectedFilePath !== rel) {
      await handleLoadFile(rel);
    }

    ensureFilePathExpanded(rel);
    setActiveTab("code");
  }

  // 2) Automatikus csere: először exact, majd whitespace-ignoráló
  function handlePatchApply(patch: SuggestedPatch) {
    const full = sourceCode;
    const original = patch.original;
    const modified = patch.modified;

    if (!full) {
      alert("Nincs betöltött forráskód ehhez a patch-hez.");
      return;
    }

    // 2.1) egyszerű, szó szerinti csere
    if (full.includes(original)) {
      const updated = full.replace(original, modified);
      setProjectedCode(updated);
      setShowDiff(true);
      setActiveTab("code");
      return;
    }

    // 2.2) whitespace-ignoráló csere (indent/space nem számít)
    const normalize = (s: string) => s.replace(/\s+/g, "");
    if (normalize(full).includes(normalize(original))) {
      const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = escaped.replace(/\s+/g, "\\s+");
      const re = new RegExp(pattern, "m");
      const updated = full.replace(re, modified);
      setProjectedCode(updated);
      setShowDiff(true);
      setActiveTab("code");
      return;
    }

    alert(
      "Nem sikerült automatikusan azonosítani az eredeti kódrészletet a forráskódban. " +
        "Lehet, hogy közben módosítottad a fájlt vagy a patch nem pontos."
    );
  }

  // 3) Csak vágólapra másolás
  function handlePatchCopy(patch: SuggestedPatch) {
    if (!navigator.clipboard) {
      alert("A böngésző nem támogatja a vágólapot, másold kézzel a kódot.");
      return;
    }
    navigator.clipboard.writeText(patch.modified).catch(() => {
      alert("Nem sikerült a vágólapra másolni.");
    });
  }

  // 4) Patch kiválasztása a listából — itt állítjuk be az aktívat
  function handleSelectPatch(patch: SuggestedPatch) {
    setActivePatch(patch);
    // megpróbáljuk a fájlt is megnyitni, de nem várjuk meg
    handlePatchOpenFile(patch);
  }

  // ═══════════════════════════════════════════════════════════════
  // TOOL PERMISSION KEZELÉS - Jóváhagyott műveletek végrehajtása
  // ═══════════════════════════════════════════════════════════════
  
  async function executeApprovedTool(permission: PendingPermission) {
    if (!selectedProjectId) {
      addLogMessage("error", "❌ Nincs kiválasztott projekt!");
      return;
    }
    
    try {
      addLogMessage("info", `⏳ Művelet végrehajtása: ${permission.permission_type}...`);
      
      const resp = await fetch(`${BACKEND_URL}/api/agentic/execute-approved`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: selectedProjectId,
          tool_name: permission.tool_name,
          permission_type: permission.permission_type,
          arguments: permission.arguments,
        }),
      });
      
      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        throw new Error(errText || `HTTP ${resp.status}`);
      }
      
      const result = await resp.json();
      const msgId = generateUniqueId();
      const timestamp = new Date().toISOString();
      
      if (result.success) {
        addLogMessage("success", `✅ **Művelet sikeres!**`);
        
        // Terminal eredmény megjelenítése
        if (permission.permission_type === "terminal" && result.result) {
          const terminalResultMsg: ChatMessage = {
            id: msgId,
            role: "system",
            text: `### ✅ JÓVÁHAGYVA - Terminal parancs\n\n**Parancs:** \`${permission.details.command}\`\n\n**Eredmény:**\n\`\`\`\n${result.result}\n\`\`\``,
          };
          setChatMessages(prev => [...prev, terminalResultMsg]);
        }
        
        // Fájl módosítás eredmény megjelenítése a chatben
        if (["write", "edit"].includes(permission.permission_type)) {
          const filePath = permission.details.path || "";
          let linesAdded = 0;
          let linesDeleted = 0;
          let beforeContent = permission.details.old_text || "";
          let afterContent = permission.details.new_text || "";
          
          // Ha a backend visszaadott részletes infót, használjuk azt
          if (result.file_modification) {
            const mod = result.file_modification;
            linesAdded = mod.lines_added || 0;
            linesDeleted = mod.lines_deleted || 0;
            if (mod.before_content) beforeContent = mod.before_content;
            if (mod.after_content) afterContent = mod.after_content;
          } else {
            // Becsüljük a változásokat
            const oldLines = beforeContent.split('\n').length;
            const newLines = afterContent.split('\n').length;
            linesAdded = Math.max(0, newLines - oldLines);
            linesDeleted = Math.max(0, oldLines - newLines);
          }
          
          // Mentés a modifications history-ba
          const modification: FileModification = {
            path: filePath,
            action: permission.permission_type === "write" ? "write" : "edit",
            lines_added: linesAdded,
            lines_deleted: linesDeleted,
            before_content: beforeContent,
            after_content: afterContent,
            timestamp: timestamp,
            messageId: msgId,
          };
          setModificationsHistory(prev => [...prev, modification]);
          
          // Chat üzenet a változásokkal - MINDIG LÁTSZÓDJON!
          const modResultMsg: ChatMessage = {
            id: msgId,
            role: "system",
            text: `### ✅ JÓVÁHAGYVA - Fájl módosítás\n\n` +
                  `📁 **Fájl:** \`${filePath}\`\n` +
                  `📊 **Változások:** +${linesAdded} sor / -${linesDeleted} sor\n\n` +
                  `🔍 [[DIFF:${filePath}]] ← *Kattints a részletek megtekintéséhez!*\n\n` +
                  `---\n` +
                  `⏱️ ${formatDateTime()}`,
            modifications: [modification],
          };
          setChatMessages(prev => [...prev, modResultMsg]);
        }
        
        // Törlés jóváhagyása
        if (permission.permission_type === "delete") {
          const deletePath = permission.details.path || "";
          const deleteMsg: ChatMessage = {
            id: msgId,
            role: "system",
            text: `### ✅ JÓVÁHAGYVA - Fájl törlés\n\n` +
                  `🗑️ **Törölve:** \`${deletePath}\`\n\n` +
                  `⏱️ ${formatDateTime()}`,
          };
          setChatMessages(prev => [...prev, deleteMsg]);
        }
        
        // Könyvtár létrehozás
        if (permission.permission_type === "create_directory") {
          const dirPath = permission.details.path || "";
          const dirMsg: ChatMessage = {
            id: msgId,
            role: "system",
            text: `### ✅ JÓVÁHAGYVA - Könyvtár létrehozás\n\n` +
                  `📁 **Létrehozva:** \`${dirPath}\`\n\n` +
                  `⏱️ ${formatDateTime()}`,
          };
          setChatMessages(prev => [...prev, dirMsg]);
        }
        
        // Fájl műveletek esetén frissítsük a fájlfát és az editort
        if (["delete", "write", "edit", "create_directory"].includes(permission.permission_type)) {
          loadProjectFiles();
          
          // Ha a szerkesztett fájl éppen nyitva van, frissítsük
          const modifiedPath = permission.details.path;
          if (modifiedPath && (permission.permission_type === "write" || permission.permission_type === "edit")) {
            try {
              const fileResp = await fetch(
                `${BACKEND_URL}/projects/${selectedProjectId}/file?rel_path=${encodeURIComponent(modifiedPath)}`
              );
              if (fileResp.ok) {
                const fileData = await fileResp.json();
                const newContent = (fileData.content || "").replace(/^\uFEFF/, '');
                
                setOpenTabs(prev => {
                  const existingIdx = prev.findIndex(t => t.path === modifiedPath);
                  if (existingIdx >= 0) {
                    const updated = [...prev];
                    updated[existingIdx] = { ...updated[existingIdx], content: newContent, isDirty: false };
                    return updated;
                  }
                  return prev;
                });
                
                if (selectedFilePath === modifiedPath) {
                  setCode(newContent);
                }
              }
            } catch (e) {
              console.error("[TOOL EXEC] Fájl frissítés hiba:", e);
            }
          }
        }
      } else {
        // Sikertelen művelet - de még mindig mentsük el a chatbe!
        addLogMessage("error", `❌ **Hiba:** ${result.error || "Ismeretlen hiba"}`);
        
        const errorMsg: ChatMessage = {
          id: msgId,
          role: "system",
          text: `### ⚠️ SIKERTELEN - ${permission.permission_type}\n\n` +
                `📁 **Fájl:** \`${permission.details.path || 'N/A'}\`\n` +
                `❌ **Hiba:** ${result.error || "Ismeretlen hiba"}\n\n` +
                `⏱️ ${formatDateTime()}`,
        };
        setChatMessages(prev => [...prev, errorMsg]);
      }
      
      // Eltávolítjuk a pending permission-t
      setPendingToolPermissions(prev => 
        prev.filter(p => p.tool_call_id !== permission.tool_call_id)
      );
      
    } catch (err) {
      console.error("[TOOL EXEC] Hiba:", err);
      addLogMessage("error", `❌ **Végrehajtási hiba:** ${err instanceof Error ? err.message : "Ismeretlen hiba"}`);
    }
  }
  
  function rejectToolPermission(permission: PendingPermission) {
    const msgId = generateUniqueId();
    const timestamp = new Date().toISOString();
    
    addLogMessage("info", `🚫 Művelet elutasítva: ${permission.permission_type}`);
    
    // FONTOS: Elutasításnál is mentsük el a chatbe, hogy mit utasítottunk el!
    if (["write", "edit"].includes(permission.permission_type)) {
      const filePath = permission.details.path || "";
      const beforeContent = permission.details.old_text || "";
      const afterContent = permission.details.new_text || "";
      
      // Becsüljük a változásokat
      const oldLines = beforeContent.split('\n').length;
      const newLines = afterContent.split('\n').length;
      const linesAdded = Math.max(0, newLines - oldLines);
      const linesDeleted = Math.max(0, oldLines - newLines);
      
      // Mentés a history-ba (elutasított módosításként)
      const modification: FileModification = {
        path: filePath,
        action: "edit",
        lines_added: linesAdded,
        lines_deleted: linesDeleted,
        before_content: beforeContent,
        after_content: afterContent,
        timestamp: timestamp,
        messageId: msgId,
      };
      setModificationsHistory(prev => [...prev, modification]);
      
      const rejectMsg: ChatMessage = {
        id: msgId,
        role: "system",
        text: `### ❌ ELUTASÍTVA - Fájl módosítás\n\n` +
              `📁 **Fájl:** \`${filePath}\`\n` +
              `📊 **Javasolt változások:** +${linesAdded} sor / -${linesDeleted} sor\n\n` +
              `🔍 [[DIFF:${filePath}]] ← *Kattints a javasolt változások megtekintéséhez!*\n\n` +
              `---\n` +
              `⏱️ ${formatDateTime()} - *A módosítás NEM lett alkalmazva*`,
        modifications: [modification],
      };
      setChatMessages(prev => [...prev, rejectMsg]);
    } else if (permission.permission_type === "terminal") {
      const rejectMsg: ChatMessage = {
        id: msgId,
        role: "system",
        text: `### ❌ ELUTASÍTVA - Terminal parancs\n\n` +
              `🖥️ **Parancs:** \`${permission.details.command}\`\n\n` +
              `⏱️ ${formatDateTime()} - *A parancs NEM lett végrehajtva*`,
      };
      setChatMessages(prev => [...prev, rejectMsg]);
    } else if (permission.permission_type === "delete") {
      const rejectMsg: ChatMessage = {
        id: msgId,
        role: "system",
        text: `### ❌ ELUTASÍTVA - Fájl törlés\n\n` +
              `🗑️ **Fájl:** \`${permission.details.path}\`\n\n` +
              `⏱️ ${formatDateTime()} - *A fájl NEM lett törölve*`,
      };
      setChatMessages(prev => [...prev, rejectMsg]);
    } else if (permission.permission_type === "create_directory") {
      const rejectMsg: ChatMessage = {
        id: msgId,
        role: "system",
        text: `### ❌ ELUTASÍTVA - Könyvtár létrehozás\n\n` +
              `📁 **Könyvtár:** \`${permission.details.path}\`\n\n` +
              `⏱️ ${formatDateTime()} - *A könyvtár NEM lett létrehozva*`,
      };
      setChatMessages(prev => [...prev, rejectMsg]);
    }
    
    setPendingToolPermissions(prev => 
      prev.filter(p => p.tool_call_id !== permission.tool_call_id)
    );
  }

  // --- Undo/Redo segédfüggvények (REDO fix) ---

  const pushHistory = React.useCallback(
    (nextSource: string, nextProjected: string) => {
      if (restoringRef.current) return;

      setHistory((prev) => {
        const currentIndex = historyIndex;

        const effectiveIndex =
          currentIndex >= 0 && currentIndex < prev.length
            ? currentIndex
            : prev.length - 1;

        const currentSnap =
          effectiveIndex >= 0 ? prev[effectiveIndex] : undefined;

        if (
          currentSnap &&
          currentSnap.source === nextSource &&
          currentSnap.projected === nextProjected
        ) {
          return prev;
        }

        let base = prev;
        if (effectiveIndex >= 0 && effectiveIndex < prev.length - 1) {
          base = prev.slice(0, effectiveIndex + 1);
        }

        let merged = [...base, { source: nextSource, projected: nextProjected }];

        if (merged.length > 100) {
          merged = merged.slice(merged.length - 100);
        }

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
    // Health check 30 másodpercenként (teljesítmény optimalizálás)
    const id = setInterval(checkHealth, 30000);
    return () => clearInterval(id);
  }, []);

  // Menü bezárása kattintásra kívül
  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  // Auto-scroll a változásokhoz amikor javaslat jelenik meg
  React.useEffect(() => {
    if (currentSuggestion && diffViewRef.current) {
      // Kis késleltetés hogy a DOM renderelődjön
      setTimeout(() => {
        const changeMarker = diffViewRef.current?.querySelector('.diff-change-marker');
        if (changeMarker) {
          changeMarker.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          // Ha nincs marker, az első added/removed sorra ugorjunk
          const firstChange = diffViewRef.current?.querySelector('.diff-line-added, .diff-line-removed');
          if (firstChange) {
            firstChange.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      }, 100);
    }
  }, [currentSuggestion?.id, currentSuggestion?.selectedPosition]);

  // Fájlfa betöltése, ha változik az aktív projekt
  React.useEffect(() => {
    if (!selectedProjectId) {
      setFilesTree(null);
      setSelectedFilePath(null);
      setFilesError(null);
      setExpandedPaths([]);
      return;
    }

    loadProjectFiles();
  }, [selectedProjectId, projects]);

  // Fájlok betöltése - külön függvény, hogy a refresh gomb is hívhassa
  const loadProjectFiles = React.useCallback(async () => {
    if (!selectedProjectId) {
      setFilesTree(null);
      setFilesLoading(false);
      setFilesError(null);
      return;
    }

      setFilesLoading(true);
      setFilesError(null);
      try {
        const res = await fetch(
          `${BACKEND_URL}/projects/${selectedProjectId}/files?max_depth=3`
        );
        if (!res.ok) {
          throw new Error(`Hiba a fájllista betöltésekor: ${res.status}`);
        }
        const data: FileNode[] = await res.json();
        setFilesTree(data);
      console.log(`[FILES] Fájlok betöltve: ${data.length} elem a fálfában`);
      } catch (err: any) {
        console.error(err);
        setFilesError(
          err.message || "Nem sikerült betölteni a fájlokat a projekthez."
        );
        setFilesTree(null);
      } finally {
        setFilesLoading(false);
      }
  }, [selectedProjectId]);

  // Fájlok frissítése trigger alapján (agentic módosítások után)
  React.useEffect(() => {
    if (refreshFilesTrigger > 0) {
      loadProjectFiles();
    }
  }, [refreshFilesTrigger, loadProjectFiles]);

  // Automatikus fájllista frissítés (polling) - csak ha az ablak aktív
  // KAPCSOLVA KI a teljesítmény javítása érdekében - használd a manuális Refresh gombot!
  /*
  React.useEffect(() => {
    if (!selectedProjectId) {
      return;
    }

    let intervalId: NodeJS.Timeout | null = null;
    let timeoutId: NodeJS.Timeout | null = null;

    // Csak akkor poll-olunk, ha az ablak aktív
    const handleFocus = () => {
      if (intervalId) return; // Már fut
      
      // 30 másodpercenként frissítés
      intervalId = setInterval(() => {
        console.log('[FILES] Automatikus frissítés (polling, ablak aktív)');
        loadProjectFiles();
      }, 30000); // 30 másodperc
    };

    const handleBlur = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    // Kezdetben egy frissítés, ha aktív az ablak
    if (document.hasFocus()) {
      timeoutId = setTimeout(handleFocus, 5000); // 5 másodperc után kezd
    }

    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    // Cleanup
    return () => {
      if (intervalId) clearInterval(intervalId);
      if (timeoutId) clearTimeout(timeoutId);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, [selectedProjectId, loadProjectFiles]);
  */

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
  // MÃ“DOSÍTVA: NEM alkalmazzuk az applyEditorSettings-et - az levágja a sorokat!
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

    // NEM alkalmazunk editor settings-et - csak a nyers kódot használjuk
    const processedSource = loaded.source;
    const processedProjected = loaded.projected;

    console.log(`[PROJECT LOAD] localStorage-ból: ${processedSource.split("\n").length} sor`);
    console.log(`[PROJECT LOAD] filePath: ${loaded.filePath || 'nincs'}`);

    restoringRef.current = true;
    setSourceCode(processedSource);
    setProjectedCode(processedProjected);
    // FONTOS: Fájl útvonal visszaállítása!
    if (loaded.filePath) {
      setSelectedFilePath(loaded.filePath);
    }
    restoringRef.current = false;

    const snap: CodeSnapshot = {
      source: processedSource,
      projected: processedProjected,
    };
    setHistory([snap]);
    setHistoryIndex(0);
  }, [selectedProjectId]);

// Chat üzenetek betöltése projektváltáskor
React.useEffect(() => {
  if (!selectedProjectId) {
    setChatMessages([]);
    return;
  }
  const loaded = loadProjectChat(selectedProjectId);
  setChatMessages(loaded);
}, [selectedProjectId]);

// Chat üzenetek mentése localStorage-be, ha változnak
React.useEffect(() => {
  if (!selectedProjectId) return;
  saveProjectChat(selectedProjectId, chatMessages);
}, [selectedProjectId, chatMessages]);


  // KIKAPCSOLVA: Ez a kód levágta a sorokat maxLines alapján!
  // A szerkesztő beállítások NEM módosíthatják a fő kódot - csak megjelenítésre szolgálnak
  // React.useEffect(() => {
  //   if (!selectedProjectId) return;
  //   setSourceCode((prev) => applyEditorSettings(prev, sourceSettings));
  // }, [sourceSettings, selectedProjectId]);

  React.useEffect(() => {
    if (!selectedProjectId) return;
    setProjectedCode((prev) =>
      applyEditorSettings(prev, projectedSettings)
    );
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
    const toSave: ProjectCode = { source: sourceCode, projected: projectedCode, filePath: selectedFilePath || undefined };
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
      if (newWidth < PANEL_LIMITS.PROJECTS_MIN_WIDTH) {
        newWidth = PANEL_LIMITS.PROJECTS_MIN_WIDTH;
      }
      if (newWidth > PANEL_LIMITS.PROJECTS_MAX_WIDTH) {
        newWidth = PANEL_LIMITS.PROJECTS_MAX_WIDTH;
      }
      setProjectsWidth(newWidth);
    } else if (drag.type === "options") {
      const delta = e.clientX - drag.startX;
      let newWidth = drag.startWidth - delta; // balra húzva nő
      if (newWidth < PANEL_LIMITS.OPTIONS_MIN_WIDTH) {
        newWidth = PANEL_LIMITS.OPTIONS_MIN_WIDTH;
      }
      if (newWidth > PANEL_LIMITS.OPTIONS_MAX_WIDTH) {
        newWidth = PANEL_LIMITS.OPTIONS_MAX_WIDTH;
      }
      setOptionsWidth(newWidth);
    } else if (drag.type === "source") {
      if (!rightAreaRef.current) return;
      const rect = rightAreaRef.current.getBoundingClientRect();
      const delta = e.clientX - drag.startX;
      const effectiveWidth = rect.width - optionsWidth;
      if (effectiveWidth <= 0) return;

      let newRatio = drag.startRatio + delta / effectiveWidth;
      if (newRatio < PANEL_LIMITS.WIDTH_RATIO_MIN) {
        newRatio = PANEL_LIMITS.WIDTH_RATIO_MIN;
      }
      if (newRatio > PANEL_LIMITS.WIDTH_RATIO_MAX) {
        newRatio = PANEL_LIMITS.WIDTH_RATIO_MAX;
      }
      setSourceWidthRatio(newRatio);
    } else if (drag.type === "top") {
      if (!rightAreaRef.current) return;
      const rect = rightAreaRef.current.getBoundingClientRect();
      const delta = e.clientY - drag.startY;
      let newRatio = drag.startRatio + delta / rect.height;
      if (newRatio < PANEL_LIMITS.HEIGHT_RATIO_MIN) {
        newRatio = PANEL_LIMITS.HEIGHT_RATIO_MIN;
      }
      if (newRatio > PANEL_LIMITS.HEIGHT_RATIO_MAX) {
        newRatio = PANEL_LIMITS.HEIGHT_RATIO_MAX;
      }
      setTopHeightRatio(newRatio);
    } else if (drag.type === "projects-inner") {
      if (!projectsPanelRef.current) return;
      const rect = projectsPanelRef.current.getBoundingClientRect();
      const totalHeight = rect.height;
      if (totalHeight <= 0) return;

      const delta = e.clientY - drag.startY;
      let nextRatio = drag.startRatio + delta / totalHeight;
      if (nextRatio < PANEL_LIMITS.WIDTH_RATIO_MIN) {
        nextRatio = PANEL_LIMITS.WIDTH_RATIO_MIN;
      }
      if (nextRatio > PANEL_LIMITS.WIDTH_RATIO_MAX) {
        nextRatio = PANEL_LIMITS.WIDTH_RATIO_MAX;
      }
      setProjectsInnerRatio(nextRatio);
    } else if (drag.type === "chat-log") {
      if (!rightSidebarRef.current) return;
      const rect = rightSidebarRef.current.getBoundingClientRect();
      const totalHeight = rect.height;
      if (totalHeight <= 0) return;

      const delta = e.clientY - drag.startY;
      let newRatio = drag.startRatio + delta / totalHeight;
      if (newRatio < PANEL_LIMITS.WIDTH_RATIO_MIN) {
        newRatio = PANEL_LIMITS.WIDTH_RATIO_MIN;
      }
      if (newRatio > PANEL_LIMITS.WIDTH_RATIO_MAX) {
        newRatio = PANEL_LIMITS.WIDTH_RATIO_MAX;
      }
      setChatLogRatio(newRatio);
    } else if (drag.type === "code-right") {
      if (!rightAreaRef.current) return;
      const rect = rightAreaRef.current.getBoundingClientRect();
      const delta = e.clientX - drag.startX;
      let newRatio = drag.startRatio + delta / rect.width;
      if (newRatio < PANEL_LIMITS.WIDTH_RATIO_MIN) {
        newRatio = PANEL_LIMITS.WIDTH_RATIO_MIN;
      }
      if (newRatio > PANEL_LIMITS.WIDTH_RATIO_MAX) {
        newRatio = PANEL_LIMITS.WIDTH_RATIO_MAX;
      }
      setCodeRightRatio(newRatio);
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
}, [drag, optionsWidth, chatLogRatio, codeRightRatio]);

  // Ãšj projekt mentése
  async function handleProjectModalSubmit(e: React.FormEvent) {
    e.preventDefault();
    setProjectModalError(null);

    const name = newProjectName.trim();
    if (!name) {
      setProjectModalError("A név kötelező.");
      return;
    }

    setProjectModalSaving(true);

    try {
      let res: Response;
      if (projectModalMode === "create") {
        res = await fetch(`${BACKEND_URL}/projects`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            description: newProjectDescription || null,
            root_path: newProjectRootPath || null,
          }),
        });
      } else {
        if (editingProjectId == null) {
          throw new Error("Nincs kiválasztott projekt a szerkesztéshez.");
        }
        res = await fetch(`${BACKEND_URL}/projects/${editingProjectId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            description: newProjectDescription || null,
            root_path: newProjectRootPath || null,
          }),
        });
      }

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.detail || `Hiba: ${res.status}`);
      }

      const saved: Project = await res.json();

      setProjects((prev) => {
        if (projectModalMode === "create") {
          return [saved, ...prev];
        } else {
          return prev.map((p) => (p.id === saved.id ? saved : p));
        }
      });

      setSelectedProjectId((prev) =>
        prev == null ? saved.id : prev === saved.id ? saved.id : prev
      );

      setIsProjectModalOpen(false);
    } catch (err: any) {
      console.error(err);
      setProjectModalError(
        err.message || "Nem sikerült menteni a projektet."
      );
    } finally {
      setProjectModalSaving(false);
    }
  }

  // Mappaböngészés függvények
  const loadBrowseDirectory = React.useCallback(async (path: string | null = null) => {
    setBrowseLoading(true);
    try {
      const url = path 
        ? `${BACKEND_URL}/api/browse?path=${encodeURIComponent(path)}`
        : `${BACKEND_URL}/api/browse`;
      
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Hiba: ${res.status}`);
      }
      
      const data = await res.json();
      setBrowseCurrentPath(data.current_path);
      setBrowseParentPath(data.parent_path || null);
      setBrowseItems(data.items || []);
    } catch (err: any) {
      console.error("[BROWSE] Hiba:", err);
      alert(err.message || "Hiba a mappák betöltésekor");
    } finally {
      setBrowseLoading(false);
    }
  }, []);

  const handleOpenBrowseModal = React.useCallback(() => {
    setShowBrowseModal(true);
    loadBrowseDirectory(newProjectRootPath || null);
  }, [newProjectRootPath, loadBrowseDirectory]);

  const handleBrowseSelectFolder = React.useCallback((path: string) => {
    setNewProjectRootPath(path);
    setShowBrowseModal(false);
  }, []);

  const handleBrowseNavigate = React.useCallback((path: string) => {
    loadBrowseDirectory(path);
  }, [loadBrowseDirectory]);

  async function handleReindexProject(projectId: number) {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;

    if (!project.root_path) {
      alert(
        "Ehhez a projekthez nincs root mappa beállítva, ezért nem lehet reindexelni."
      );
      return;
    }

    const confirmed = window.confirm(
      `Biztosan újraindexeled a(z) "${project.name}" projektet?`
    );
    if (!confirmed) return;

    try {
      setReindexingProjectId(projectId);
      setReindexStatus(null);

      const res = await fetch(
        `${BACKEND_URL}/projects/${projectId}/reindex`,
        {
          method: "POST",
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.detail || `Hiba: ${res.status}`);
      }

      const data = await res.json();
      
      if (data.status === "already_running") {
        alert("A reindexelés már fut erre a projektre!");
        return;
      }

      // Indítsuk el a státusz polling-ot
      pollReindexStatus(projectId);
      
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Hiba történt a reindexelés indításakor.");
      setReindexingProjectId(null);
    }
  }

  // Reindex státusz polling
  async function pollReindexStatus(projectId: number) {
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(
          `${BACKEND_URL}/projects/${projectId}/reindex/status`
        );
        
        if (!res.ok) {
          clearInterval(pollInterval);
          setReindexingProjectId(null);
          return;
        }
        
        const status = await res.json();
        setReindexStatus(status);
        
        if (status.status === "completed") {
          clearInterval(pollInterval);
          setReindexingProjectId(null);
          
          // Sikeres üzenet
          alert(
            `✅ Reindexelés kész!\n\n` +
            `📁 Ã–sszes fájl: ${status.total_files}\n` +
            `✏️ Indexelt (új/változott): ${status.indexed_files}\n` +
            `⏭️ Változatlan: ${status.skipped_unchanged}\n` +
            `🗑️ Törölt: ${status.deleted_files}\n` +
            `📦 Chunk-ok: ${status.total_chunks}`
          );
          
          setReindexStatus(null);
        } else if (status.status === "error") {
          clearInterval(pollInterval);
          setReindexingProjectId(null);
          alert(`❌ Reindexelés hiba: ${status.error_message}`);
          setReindexStatus(null);
        }
      } catch (err) {
        console.error("Reindex status poll error:", err);
        clearInterval(pollInterval);
        setReindexingProjectId(null);
        setReindexStatus(null);
      }
    }, 1000); // 1 másodpercenként pollozunk
  }

  // 🔴 Projekt törlése (— gomb)
  async function handleDeleteProject(projectId: number) {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;

    const confirmed = window.confirm(
      `Biztosan törlöd a(z) "${project.name}" projektet?`
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`${BACKEND_URL}/projects/${projectId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.detail || `HTTP ${res.status}`);
      }

      setProjects((prev) => prev.filter((p) => p.id !== projectId));

      if (selectedProjectId === projectId) {
        setSelectedProjectId(null);
      }

      alert("✅ Projekt törölve.");
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Hiba történt a törlés során.");
    }
  }

  async function handleLoadFile(relPath: string) {
    const projectId = selectedProjectIdRef.current;
    if (!projectId) return;

    try {
      const params = new URLSearchParams({
        rel_path: relPath,
        encoding: sourceEncoding,
      });

      const res = await fetch(
        `${BACKEND_URL}/projects/${projectId}/file?` +
          params.toString()
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const msg =
          data?.detail ||
          `Nem sikerült beolvasni a fájlt (HTTP ${res.status}).`;
        throw new Error(msg);
      }

      const data: { path: string; encoding: string; content: string } =
        await res.json();

      // DEBUG: Fájl betöltés info
      const rawLines = data.content.split("\n").length;
      console.log(`[LOAD] Fájl: ${data.path}`);
      console.log(`[LOAD] Backend-ről érkezett: ${data.content.length} karakter, ${rawLines} sor`);

      // ═══════════════════════════════════════════════════════════════
      // TAB RENDSZER: Nyissuk meg új tab-ban (vagy aktiváljuk ha már nyitva)
      // ═══════════════════════════════════════════════════════════════
      const existingTabIndex = openTabs.findIndex(t => t.path === data.path);
      if (existingTabIndex >= 0) {
        // Már nyitva van - frissítsük a tartalmát és aktiváljuk
        setOpenTabs(prev => prev.map((t, i) => 
          i === existingTabIndex ? { ...t, content: data.content } : t
        ));
        setActiveTabIndex(existingTabIndex);
      } else {
        // Új tab
        const newTab = { path: data.path, content: data.content, isDirty: false };
        setOpenTabs(prev => [...prev, newTab]);
        setActiveTabIndex(openTabs.length);
      }

      setSelectedFilePath(data.path);
      setCode(data.content);
      setHistory([{ source: data.content, projected: "" }]);
      setHistoryIndex(0);
    } catch (err: any) {
      alert(err.message || "Ismeretlen hiba történt a fájl beolvasásakor.");
    }
  }
  
	const handleChatFileClick = React.useCallback(
	  async (rawPath: string) => {
		if (!selectedProjectId) {
		  alert("Először válassz egy projektet.");
		  return;
		}

		let relPath: string | null = resolveRelPathFromChat(rawPath, filesTree);

		if (!relPath) {
		  alert(`A fájlt nem találtam: ${rawPath}`);
		  return;
		}

		ensureFilePathExpanded(relPath);
		await handleLoadFile(relPath);
		setActiveTab("code");
	  },
	  [selectedProjectId, filesTree, ensureFilePathExpanded]
	);



	function renderAssistantMessage(text: string, modifications?: FileModification[]): React.ReactNode {
	  // Elfogad:
	  // [FILE: valami\útvonal | chunk #12]
	  // (FILE: valami/útvonal | chunk #0)
	  // [[DIFF:path]] - diff nézet link

	  const nodes: React.ReactNode[] = [];
	  let lastIndex = 0;
	  
	  // Kombinált regex a FILE és DIFF linkekhez
	  const combinedRegex = /(?:[\[\(]FILE:\s*([^|\]\)]+)(?:[^\]\)]*)[\]\)])|(?:\[\[DIFF:([^\]]+)\]\])/g;
	  let match: RegExpExecArray | null;

	  while ((match = combinedRegex.exec(text)) !== null) {
		if (match.index > lastIndex) {
		  nodes.push(text.slice(lastIndex, match.index));
		}

		if (match[1]) {
		  // FILE link
		  const rawPath = match[1].trim();
		  const filePath = rawPath.replace(/\\/g, "/");

		  nodes.push(
			<button
			  key={`file-${filePath}-${match.index}`}
			  className="chat-file-link"
			  onClick={(e) => {
				e.stopPropagation();
				handleChatFileClick(filePath);
			  }}
			>
			  {`[FILE: ${filePath}]`}
			</button>
		  );
		} else if (match[2]) {
		  // DIFF link - kattintható gomb a diff megtekintéséhez
		  const diffPath = match[2].trim();
		  
		  // Keressük meg a módosítás adatait
		  const mod = modifications?.find(m => m.path === diffPath);
		  const historyMod = !mod ? modificationsHistory.find(m => m.path === diffPath) : null;
		  const foundMod = mod || historyMod;
		  
		  nodes.push(
			<button
			  key={`diff-${diffPath}-${match.index}`}
			  className="chat-diff-link"
			  onClick={(e) => {
				e.stopPropagation();
				
				// ⚠️ FONTOS: Csak az AKTUÁLIS ÜZENET módosításait használjuk!
				// NE keverjük a history-val, mert az összekeveri a before/after-t!
				const currentMsgMods = (modifications || []).filter(
				  m => m.path === diffPath && m.before_content && m.after_content
				);
				
				// Ha nincs az üzenetben, keressük a history-ban (de csak EGYETLEN bejegyzést!)
				let modToShow: FileModification | null = null;
				if (currentMsgMods.length > 0) {
				  // Ha több módosítás volt ugyanarra a fájlra EGY üzenetben
				  modToShow = currentMsgMods[currentMsgMods.length - 1]; // Utolsó állapot
				} else {
				  // Keressük a history-ban a LEGUTOLSÓ módosítást erre a fájlra
				  const historyMods = modificationsHistory
				    .filter(m => m.path === diffPath && m.before_content && m.after_content)
				    .slice(-1); // Csak a legutolsó
				  modToShow = historyMods[0] || null;
				}
				
				if (modToShow) {
				  // Csak az aktuális üzenet egyedi fájljait mutassuk navigációban
				  const uniqueFilesInMsg = (modifications || []).filter(m => m.before_content && m.after_content);
				  const seenPaths = new Set<string>();
				  const uniqueMods: FileModification[] = [];
				  for (const m of uniqueFilesInMsg) {
				    if (!seenPaths.has(m.path)) {
				      seenPaths.add(m.path);
				      uniqueMods.push(m);
				    }
				  }
				  
				  const clickedIndex = uniqueMods.findIndex(m => m.path === diffPath);
				  
				  setAllDiffModifications(uniqueMods.length > 0 ? uniqueMods : [modToShow]);
				  setCurrentDiffModIndex(clickedIndex >= 0 ? clickedIndex : 0);
				  setDiffViewData({
					path: diffPath,
					before: modToShow.before_content || '',
					after: modToShow.after_content || '',
					linesAdded: modToShow.lines_added || 0,
					linesDeleted: modToShow.lines_deleted || 0,
				  });
				  setShowDiffViewer(true);
				} else {
				  alert(`Nincs elérhető diff adat a "${diffPath}" fájlhoz.\nA diff adatok elvesztek a frissítés után.`);
				}
			  }}
			  title="Kattints a változások megtekintéséhez"
			>
			  <span className="diff-link-icon">📄</span>
			  <span className="diff-link-path">{diffPath}</span>
			</button>
		  );
		}

		lastIndex = combinedRegex.lastIndex;
	  }

	  if (lastIndex < text.length) {
		nodes.push(text.slice(lastIndex));
	  }

	  return nodes;
	}


  // --- Chat küldése az LLM-nek ---
  async function sendChat() {
    const text = chatInput.trim();
    if (!text) return;

    const newUserMsg: ChatMessage = {
      id: generateUniqueId(),
      role: "user",
      text,
    };

    setChatMessages((prev) => [...prev, newUserMsg]);
    setChatInput("");
    setChatError(null);
    setChatLoading(true);
    
    // WebSocket broadcast - szinkronizálás más eszközökre
    wsSendChat(newUserMsg, selectedProjectId ?? undefined);

    try {
      // FONTOS: A 'system' üzeneteket ki kell szűrni - a backend csak 'user' és 'assistant' role-t fogad!
      const history = [...chatMessages, newUserMsg]
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role, text: m.text }));

      // ═══════════════════════════════════════════════════════════════
      // FRISS FÁJL TARTALOM BETÖLTÉSE - hogy az LLM a legújabb verziót lássa!
      // MINDIG a friss tartalommal dolgozunk, függetlenül attól mi van az editorban!
      // ═══════════════════════════════════════════════════════════════
      let freshSourceCode = sourceCode;
      let targetFilePath = selectedFilePath;
      
      console.log(`[CHAT] 🔍 Fájl keresés indítása...`);
      console.log(`[CHAT] 🔍 selectedFilePath: ${selectedFilePath}`);
      console.log(`[CHAT] 🔍 filesTree: ${filesTree ? filesTree.length + ' elem' : 'NULL!'}`);
      console.log(`[CHAT] 🔍 chatMessages: ${chatMessages.length} db`);
      
      // 1. Ha van kiválasztott fájl, azt használjuk
      // 2. Ha nincs, keressük @mention-ban
      // 3. Ha nincs, keressük a chat history-ban (korábbi CODE_CHANGE-ek)
      // 4. Ha nincs, keressük a suggestedPatches-ben
      
      if (!targetFilePath) {
        // @mention keresése az aktuális üzenetben
        if (text.includes('@')) {
          const atMatch = text.match(/@([\w\-./]+\.\w+)/);
          if (atMatch && filesTree) {
            const resolved = resolvePathFromTree(atMatch[1], filesTree);
            if (resolved) {
              targetFilePath = resolved;
              console.log(`[CHAT] ✓ @mention feloldva: ${resolved}`);
            }
          }
        }
      }
      
      if (!targetFilePath && chatMessages.length > 0) {
        // Chat history-ban keresés - korábbi CODE_CHANGE file path-ok
        console.log(`[CHAT] 🔍 Chat history keresés...`);
        const recentAssistant = [...chatMessages].reverse().find(m => m.role === 'assistant');
        if (recentAssistant) {
          console.log(`[CHAT] 🔍 Utolsó assistant üzenet (első 200 kar): ${recentAssistant.text.substring(0, 200)}`);
          const fileMatch = recentAssistant.text.match(/FILE:\s*([\w\-./]+\.\w+)/i);
          console.log(`[CHAT] 🔍 FILE match: ${fileMatch ? fileMatch[1] : 'nincs'}`);
          if (fileMatch) {
            if (filesTree) {
              const resolved = resolvePathFromTree(fileMatch[1], filesTree);
              console.log(`[CHAT] 🔍 Resolved: ${resolved}`);
              if (resolved) {
                targetFilePath = resolved;
                console.log(`[CHAT] ✓ Chat history-ból: ${resolved}`);
              }
            } else {
              // Ha nincs filesTree, használjuk közvetlenül
              targetFilePath = fileMatch[1];
              console.log(`[CHAT] ✓ Chat history-ból (direct): ${targetFilePath}`);
            }
          }
        } else {
          console.log(`[CHAT] ⚠️ Nincs assistant üzenet a history-ban`);
        }
      }
      
      if (!targetFilePath && suggestedPatches.length > 0) {
        // SuggestedPatches-ből (legutóbbi sikertelen patch-ek)
        const patchPath = suggestedPatches[0].filePath;
        console.log(`[CHAT] 🔍 SuggestedPatches keresés: ${patchPath}`);
        if (filesTree) {
          const resolved = resolvePathFromTree(patchPath, filesTree);
          if (resolved) {
            targetFilePath = resolved;
            console.log(`[CHAT] ✓ Korábbi patch-ből: ${resolved}`);
          }
        } else {
          targetFilePath = patchPath;
          console.log(`[CHAT] ✓ Korábbi patch-ből (direct): ${targetFilePath}`);
        }
      }
      
      // MINDIG frissítünk lemezről ha van target fájl!
      console.log(`[CHAT] 🔍 Target fájl: ${targetFilePath || 'NINCS!'}`);
      console.log(`[CHAT] 🔍 selectedProjectId: ${selectedProjectId}`);
      
      if (selectedProjectId && targetFilePath) {
        try {
          console.log(`[CHAT] 🔄 Fájl FRISSÍTÉSE lemezről: ${targetFilePath}`);
          const fileResp = await fetch(
            `${BACKEND_URL}/projects/${selectedProjectId}/file?rel_path=${encodeURIComponent(targetFilePath)}`
          );
          if (fileResp.ok) {
            const fileData = await fileResp.json();
            freshSourceCode = (fileData.content || "").replace(/^\uFEFF/, '');
            console.log(`[CHAT] ✅ FRISS tartalom betöltve: ${freshSourceCode.length} byte`);
            console.log(`[CHAT] ✅ Fájl első 100 kar: ${freshSourceCode.substring(0, 100)}`);
            
            // Frissítsük az editort és a selectedFilePath-ot is!
            setCode(freshSourceCode);
            setSelectedFilePath(targetFilePath);
          } else {
            console.error(`[CHAT] ❌ Fájl betöltés HTTP hiba: ${fileResp.status}`);
          }
        } catch (e) {
          console.error(`[CHAT] ❌ Fájl frissítés hiba:`, e);
        }
      } else {
        console.warn(`[CHAT] ⚠️ Nem sikerült target fájlt találni!`);
        console.warn(`[CHAT] ⚠️ source_code: ${sourceCode.length} byte (lehet ELAVULT!)`);
      }

      // 5 perces timeout az agentic műveletek miatt
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
        addLogMessage("error", "⏱️ Chat timeout (5 perc) - az LLM válasz túl sokáig tartott");
      }, 5 * 60 * 1000); // 5 perc

      const resp = await fetch(`${BACKEND_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          message: text,
          project_id: selectedProjectId,
          source_code: freshSourceCode,
          projected_code: projectedCode,
          history,
          session_id: sessionId, // Session tracking for Smart Context
          auto_mode: autoMode, // Ha True, automatikus végrehajtás backup-pal
        }),
      });
      
      clearTimeout(timeoutId);

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(errText || `HTTP ${resp.status}`);
      }

      const data: { 
        reply: string;
        terminal_results?: Array<{
          command: string;
          description: string;
          success: boolean;
          output?: string;
          error?: string;
        }>;
        code_changes?: Array<{
          file_path: string;
          action: string;
          original_code?: string;
          new_code?: string;
          anchor_code?: string;
          explanation: string;
          is_valid: boolean;
          validation_error?: string;
        }>;
        modified_files?: Array<{
          path: string;
          action: string;
          lines_added?: number;
          lines_deleted?: number;
          before_content?: string;
          after_content?: string;
        }>;
        had_errors?: boolean;
        retry_attempted?: boolean;
        tool_calls_count?: number;
        agentic_mode_used?: boolean;
        pending_permissions?: PendingPermission[];
      } = await resp.json();
      const replyText = data.reply;

      // Ha voltak fájl módosítások, készítsünk összefoglalót és tároljuk
      let enhancedReply = replyText;
      let messageModifications: FileModification[] = [];
      const msgId = generateUniqueId() + 1;
      
      if (data.agentic_mode_used && data.modified_files && data.modified_files.length > 0) {
        // ⚠️ Szűrjük ki a VALÓBAN módosított fájlokat (ahol tényleg történt változás)
        const actualChatMods = data.modified_files.filter((f: any) => 
          (f.lines_added > 0 || f.lines_deleted > 0)
        );
        
        // ⚠️ FONTOS: Csoportosítsuk a módosításokat FÁJLNÉV szerint!
        // Ha ugyanarra a fájlra több apply_edit hívás volt, egyesítsük őket!
        const groupedByPath = new Map<string, any>();
        for (const mod of actualChatMods) {
          const existing = groupedByPath.get(mod.path);
          if (existing) {
            // Összevonjuk: első before, utolsó after, összegzett sorok
            existing.lines_added += mod.lines_added || 0;
            existing.lines_deleted += mod.lines_deleted || 0;
            existing.after_content = mod.after_content; // Utolsó állapot
          } else {
            groupedByPath.set(mod.path, { ...mod });
          }
        }
        const uniqueFileMods = Array.from(groupedByPath.values());
        
        const hasActualChanges = uniqueFileMods.length > 0;
        
        const totalAdded = uniqueFileMods.reduce((sum: number, f: any) => sum + (f.lines_added || 0), 0);
        const totalDeleted = uniqueFileMods.reduce((sum: number, f: any) => sum + (f.lines_deleted || 0), 0);
        
        // Módosítások mentése - csoportosított, egyedi fájlok
        messageModifications = uniqueFileMods.map((f: any) => ({
          path: f.path,
          action: f.action || 'edit',
          lines_added: f.lines_added || 0,
          lines_deleted: f.lines_deleted || 0,
          before_content: f.before_content,
          after_content: f.after_content,
          timestamp: new Date().toISOString(),
          messageId: msgId,
        }));
        
        if (hasActualChanges) {
          let filesSummary = '\n\n---\n### ✅ Fájlok sikeresen módosítva\n\n';
          for (const file of uniqueFileMods) {
            const linesInfo = ` **(+${file.lines_added || 0}/-${file.lines_deleted || 0})**`;
            const action = file.action === 'create' ? '🆕' : file.action === 'edit' ? '✏️' : '📝';
            // Kattintható link formátum: [[DIFF:path]]
            filesSummary += `${action} [[DIFF:${file.path}]]${linesInfo}\n`;
          }
          filesSummary += `\n**Összesen:** ${uniqueFileMods.length} fájl (+${totalAdded}/-${totalDeleted} sor)\n`;
          filesSummary += `\n*Kattints a fájlnévre a változások megtekintéséhez!*`;
          enhancedReply = replyText + filesSummary;
        } else {
          // Nem történt tényleges módosítás
          enhancedReply = replyText + '\n\n---\n### ℹ️ Megjegyzés\nA fájlok nem lettek módosítva (a kért változások már alkalmazva voltak, vagy nem találtam módosítanivalót).';
        }
      }

      const assistantMsg: ChatMessage = {
        id: msgId,
        role: "assistant",
        text: enhancedReply,
        modifications: messageModifications.length > 0 ? messageModifications : undefined,
      };

      setChatMessages((prev) => [...prev, assistantMsg]);
      
      // Módosítások mentése a történetbe
      if (messageModifications.length > 0) {
        setModificationsHistory(prev => [...prev, ...messageModifications]);
      }
      
      // WebSocket broadcast - asszisztens válasz szinkronizálása
      wsSendChat(assistantMsg, selectedProjectId ?? undefined);
      
      // Terminal eredmények logolása
      if (data.terminal_results && data.terminal_results.length > 0) {
        for (const result of data.terminal_results) {
          if (result.success) {
            addLogMessage("success", `✅ Terminal: ${result.description}`);
          } else {
            addLogMessage("error", `❌ Terminal hiba: ${result.description} - ${result.error?.substring(0, 100)}`);
          }
        }
        
        if (data.had_errors && data.retry_attempted) {
          addLogMessage("info", "🔄 Automatikus újrapróbálkozás megtörtént");
        }
      }

      // ═══════════════════════════════════════════════════════════════
      // JÓVÁHAGYÁSRA VÁRÓ MŰVELETEK KEZELÉSE (MINDEN MÓDBAN!)
      // Terminal parancsok, fájl törlések, stb. - mindig user jóváhagyás kell
      // ═══════════════════════════════════════════════════════════════
      if (data.pending_permissions && data.pending_permissions.length > 0) {
        console.log(`[PERMISSIONS] 🔐 ${data.pending_permissions.length} jóváhagyásra váró művelet`);
        
        // Deduplikált hozzáadás - ne legyenek duplikátumok
        setPendingToolPermissions(prev => {
          const newPerms = data.pending_permissions!.filter(newPerm => 
            !prev.some(existing => 
              existing.tool_name === newPerm.tool_name &&
              existing.permission_type === newPerm.permission_type &&
              JSON.stringify(existing.arguments) === JSON.stringify(newPerm.arguments)
            )
          );
          return [...prev, ...newPerms];
        });
        
        // Logoljuk a felhasználónak
        for (const perm of data.pending_permissions) {
          if (perm.permission_type === "terminal") {
            addLogMessage("warning", `⚠️ **JÓVÁHAGYÁS SZÜKSÉGES** - Terminal parancs: \`${perm.details.command}\``);
          } else if (perm.permission_type === "delete") {
            addLogMessage("warning", `⚠️ **JÓVÁHAGYÁS SZÜKSÉGES** - Fájl törlés: \`${perm.details.path}\``);
          } else if (perm.permission_type === "write") {
            addLogMessage("warning", `⚠️ **JÓVÁHAGYÁS SZÜKSÉGES** - Fájl írás: \`${perm.details.path}\``);
          } else if (perm.permission_type === "edit") {
            addLogMessage("warning", `⚠️ **JÓVÁHAGYÁS SZÜKSÉGES** - Fájl szerkesztés: \`${perm.details.path}\``);
          } else if (perm.permission_type === "create_directory") {
            addLogMessage("warning", `⚠️ **JÓVÁHAGYÁS SZÜKSÉGES** - Könyvtár létrehozás: \`${perm.details.path}\``);
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════
      // AGENTIC MODE: Az LLM már közvetlenül módosította a fájlokat!
      // ═══════════════════════════════════════════════════════════════
      if (data.agentic_mode_used && data.modified_files) {
        // Szűrjük ki a VALÓBAN módosított fájlokat (ahol történt változás)
        const actuallyModifiedFiles = data.modified_files.filter(
          (f: any) => (f.lines_added || 0) > 0 || (f.lines_deleted || 0) > 0
        );
        
        console.log(`[AGENTIC] ✅ Agentic mode - ${actuallyModifiedFiles.length} fájl ténylegesen módosítva (${data.modified_files.length} érintett), ${data.tool_calls_count || 0} tool hívás`);
        
        // Logoljuk a módosított fájlokat RÉSZLETESEN
        if (actuallyModifiedFiles.length > 0) {
          // Részletes log minden fájlról
          for (const file of actuallyModifiedFiles) {
            const linesInfo = ` (+${file.lines_added || 0}/-${file.lines_deleted || 0} sor)`;
            addLogMessage("success", `📝 **${file.action?.toUpperCase() || 'MÓDOSÍTVA'}**: \`${file.path}\`${linesInfo}`);
          }
          
          // Összefoglaló
          const totalAdded = actuallyModifiedFiles.reduce((sum: number, f: any) => sum + (f.lines_added || 0), 0);
          const totalDeleted = actuallyModifiedFiles.reduce((sum: number, f: any) => sum + (f.lines_deleted || 0), 0);
          addLogMessage("success", `🎉 **ÖSSZESEN**: ${actuallyModifiedFiles.length} fájl módosítva (+${totalAdded}/-${totalDeleted} sor)`);
          
          // Minden módosított fájlt nyissunk meg tab-ban és frissítsük
          for (const file of actuallyModifiedFiles) {
            try {
              // Frissítsük a fájl tartalmát a lemezről
              if (selectedProjectId) {
                const fileResp = await fetch(
                  `${BACKEND_URL}/projects/${selectedProjectId}/file?rel_path=${encodeURIComponent(file.path)}`
                );
                if (fileResp.ok) {
                  const fileData = await fileResp.json();
                  const newContent = (fileData.content || "").replace(/^\uFEFF/, '');
                  
                  // Tab megnyitása/frissítése - openTabs használata!
                  setOpenTabs(prev => {
                    const existingIdx = prev.findIndex(t => t.path === file.path);
                    if (existingIdx >= 0) {
                      const updated = [...prev];
                      updated[existingIdx] = { ...updated[existingIdx], content: newContent, isDirty: false };
                      return updated;
                    } else {
                      return [...prev, { path: file.path, content: newContent, isDirty: false }].slice(-10);
                    }
                  });
                  
                  // Ha ez az aktív fájl, frissítsük az editort is
                  if (selectedFilePath === file.path) {
                    setCode(newContent);
                  }
                  
                  console.log(`[AGENTIC] ✅ Tab frissítve: ${file.path}`);
                }
              }
            } catch (e) {
              console.error(`[AGENTIC] ❌ Fájl frissítés hiba: ${file.path}`, e);
            }
          }
          
          // Első módosított fájl aktiválása ha nincs aktív fájl
          if (!selectedFilePath && actuallyModifiedFiles.length > 0) {
            const firstFile = actuallyModifiedFiles[0].path;
            // Használjuk az openFileInTab függvényt a megfelelő betöltéshez
            try {
              const fileResp = await fetch(
                `${BACKEND_URL}/projects/${selectedProjectId}/file?rel_path=${encodeURIComponent(firstFile)}`
              );
              if (fileResp.ok) {
                const fileData = await fileResp.json();
                const content = (fileData.content || "").replace(/^\uFEFF/, '');
                setCode(content);
                setSelectedFilePath(firstFile);
                setActiveTab("code");
              }
            } catch (e) {
              console.error(`[AGENTIC] ❌ Első fájl betöltés hiba:`, e);
            }
          }
        } else {
          addLogMessage("info", "🤖 **AGENTIC MÓD** - Nincs fájl módosítás (csak olvasás/keresés történt)");
        }
        
        // Fájlfa frissítése
        if (selectedProjectId) {
          loadProjectFiles();
        }
        
        // Agentic módban nincs szükség patch matching-re - KÉSZ!
        setChatLoading(false);
        return;
      }

      // ═══════════════════════════════════════════════════════════════
      // LEGACY MODE: [CODE_CHANGE] blokkok feldolgozása
      // ═══════════════════════════════════════════════════════════════
      
      // 1. ELŐSZÖR: Strukturált code_changes a backend response-ból (megbízhatóbb)
      let newPatches: SuggestedPatch[] = [];
      
      if (data.code_changes && data.code_changes.length > 0) {
        console.log(`[Code Changes] Backend: ${data.code_changes.length} strukturált változás`);
        
        for (const change of data.code_changes) {
          if (!change.is_valid) {
            addLogMessage("warning", `⚠️ Érvénytelen módosítás: ${change.validation_error}`);
            continue;
          }
          
          // SAFETY CHECK: Ne engedjünk túl nagy módosításokat auto módban
          const originalLen = change.original_code?.length || 0;
          const newLen = change.new_code?.length || 0;
          const codeLen = code.length;
          
          // Ha az original a fájl >50%-a, vagy ha az új kód >2x az eredeti, figyelmeztetés
          if (originalLen > codeLen * 0.5) {
            addLogMessage("warning", `⚠️ A módosítás túl nagy része a fájlnak (${Math.round(originalLen/codeLen*100)}%) - kézi ellenőrzés ajánlott`);
          }
          
          if (newLen > originalLen * 3 && originalLen > 100) {
            addLogMessage("warning", `⚠️ Az új kód jóval hosszabb az eredetinél (${originalLen} → ${newLen} kar.)`);
          }
          
          if (change.action === "replace" && change.original_code && change.new_code) {
            newPatches.push({
              id: `patch_${Date.now()}_${newPatches.length}`,
              filePath: change.file_path,
              original: change.original_code,
              modified: change.new_code,
            });
          } else if (change.action === "insert_after" && change.anchor_code && change.new_code) {
            // Insert után az anchor után szúrjuk be
            newPatches.push({
              id: `patch_${Date.now()}_${newPatches.length}`,
              filePath: change.file_path,
              original: change.anchor_code,
              modified: change.anchor_code + "\n" + change.new_code,
            });
          }
        }
      }
      
      // 2. FALLBACK: Ha nincs strukturált változás, próbáljuk kinyerni a szövegből
      if (newPatches.length === 0) {
        newPatches = parseSuggestedPatches(replyText);
      }
      
      // 3. Patch-ek alkalmazása
      if (newPatches.length > 0) {
        // SAFETY: Ellenőrizzük hogy nincs-e destruktív módosítás
        const hasDestructiveChange = newPatches.some(p => {
          const originalLen = p.original.length;
          const codeLen = code.length;
          // Destruktív ha: >60% a fájlból, vagy túl sok sor törlődik
          const originalLines = p.original.split('\n').length;
          const modifiedLines = p.modified.split('\n').length;
          return (originalLen > codeLen * 0.6) || (originalLines > 50 && modifiedLines < originalLines * 0.3);
        });
        
        // DEBUG: Mode állapot kiírása
        console.log(`[MODE] autoMode = ${autoMode}, patches = ${newPatches.length}`);
        
        if (hasDestructiveChange && autoMode) {
          addLogMessage("error", "🛑 **Veszélyes módosítás blokkolva!** A javaslat túl nagy része a fájlnak. Ellenőrizd kézzel!");
          setSuggestedPatches((prev) => [...prev, ...newPatches]);
        } else if (autoMode) {
          // ═══════════════════════════════════════════════════════
          // AUTO MÓD: Automatikus alkalmazás + chat összefoglaló
          // ═══════════════════════════════════════════════════════
          addLogMessage("info", `🤖 **AUTO MÓD** - ${newPatches.length} módosítás automatikus alkalmazása...`);
          
          // Közös applyPatch függvény használata
          // MINDIG lemezről töltjük!
          const results: PatchResult[] = [];
          const modifiedFiles = new Set<string>();
          
          for (const patch of newPatches) {
            const result = await applyPatch(
              patch, 
              selectedProjectId, 
              filesTree, 
              BACKEND_URL
            );
            results.push(result);
            
            // Track módosított fájlok
            if (result.success && result.resolvedPath) {
              modifiedFiles.add(result.resolvedPath);
            }
          }
          
          // ═══════════════════════════════════════════════════════════════
          // TÖBB FÁJL MÓDOSÍTÁS: Minden módosított fájlt nyissunk meg tab-ban!
          // ═══════════════════════════════════════════════════════════════
          for (const filePath of modifiedFiles) {
            try {
              const refreshResp = await fetch(
                `${BACKEND_URL}/projects/${selectedProjectId}/file?rel_path=${encodeURIComponent(filePath)}`
              );
              if (refreshResp.ok) {
                const refreshData = await refreshResp.json();
                const content = (refreshData.content || "").replace(/^\uFEFF/, '');
                
                // Nyissuk meg tab-ban (vagy frissítsük ha már nyitva van)
                const existingTabIndex = openTabs.findIndex(t => t.path === filePath);
                if (existingTabIndex >= 0) {
                  setOpenTabs(prev => prev.map((t, i) => 
                    i === existingTabIndex ? { ...t, content } : t
                  ));
                } else {
                  setOpenTabs(prev => [...prev, { path: filePath, content, isDirty: false }]);
                }
                
                console.log(`[PATCH] ✅ Tab megnyitva/frissítve: ${filePath}`);
              }
            } catch (e) {
              console.warn(`[PATCH] ⚠️ Fájl frissítés hiba: ${filePath}`, e);
            }
          }
          
          // Ha volt módosított fájl, az elsőt aktiváljuk
          if (modifiedFiles.size > 0) {
            const firstModified = Array.from(modifiedFiles)[0];
            const tabIndex = openTabs.findIndex(t => t.path === firstModified);
            if (tabIndex >= 0) {
              switchToTab(tabIndex);
            } else {
              // Ha még nincs a tabs-ban, az új tab lesz az utolsó
              setActiveTabIndex(openTabs.length - 1);
              setSelectedFilePath(firstModified);
              // Frissítsük a code-ot is
              const tab = openTabs[openTabs.length - 1];
              if (tab) setCode(tab.content);
            }
          }
          
          // Összefoglaló chat üzenet hozzáadása
          const summaryText = formatPatchSummary(results, newPatches, true);
          setChatMessages((prev) => [
            ...prev,
            {
              id: generateUniqueId(),
              role: "system",
              text: summaryText,
            },
          ]);
          
          // Log üzenetek
          const successCount = results.filter(r => r.success).length;
          const failedCount = results.filter(r => !r.success).length;
          
          if (successCount > 0) {
            addLogMessage("success", `🎉 **${successCount}/${newPatches.length}** módosítás automatikusan alkalmazva!`);
          }
          
          if (failedCount > 0) {
            // Ha MINDEN patch sikertelen, valószínűleg az LLM rossz kódot kapott
            if (failedCount === newPatches.length) {
              addLogMessage("error", `❌ **MINDEN módosítás sikertelen!** Az LLM valószínűleg elavult fájltartalmat látott.`);
              addLogMessage("info", `💡 Nyisd meg a fájlt az editorban és próbáld újra - így az LLM friss tartalmat kap.`);
            } else {
              results.forEach((result, i) => {
                if (!result.success) {
                  addLogMessage("warning", `⚠️ ${result.error}: ${result.resolvedPath || newPatches[i].filePath}`);
                }
              });
            }
            // Sikertelen patch-eket NEM tároljuk AUTO módban - csak zavarná a felhasználót
            // (A hibaüzenetek már megjelentek a log-ban)
          }
        } else {
          // ═══════════════════════════════════════════════════════
          // MANUAL MÓD: Inline megerősítés a chatben (NEM modal!)
          // ═══════════════════════════════════════════════════════
          console.log("[MODE] Manual mode - inline confirmation in chat");
          
          // Preview hozzáadása a chat-hez - ez lesz a megerősítő üzenet
          let previewText = `🔔 **MEGERŐSÍTÉS SZÜKSÉGES** - ${newPatches.length} módosítás:\n\n`;
          newPatches.forEach((patch, i) => {
            previewText += formatPatchPreview(patch) + (i < newPatches.length - 1 ? '\n\n---\n\n' : '');
          });
          
          // Egyedi ID a confirmation üzenethez
          const confirmMsgId = generateUniqueId();
          
          setChatMessages((prev) => [
            ...prev,
            {
              id: confirmMsgId,
              role: "system",
              text: previewText,
            },
          ]);
          
          // Mentjük a pending change-t és az üzenet ID-t
          setPendingChange({
            patches: newPatches,
            explanation: replyText.substring(0, 500),
          });
          setPendingConfirmationId(confirmMsgId);
          // NEM showConfirmModal - inline lesz!
          addLogMessage("info", `👆 **MANUAL MÓD** - ${newPatches.length} módosítás vár MEGERŐSÍTÉSRE!`);
        }
      }
      
      // Ha nincs patch, de az LLM explicit engedélyt kér - csak logolás (NEM modal!)
      // A modal zavarná a felhasználót, elég ha a chatben látja a választ
      if (newPatches.length === 0) {
        // Csak explicit [PERMISSION_REQUEST] tag esetén figyelmeztetés
        const permissionMatch = replyText.match(/\[PERMISSION_REQUEST\]/i);
        
        if (permissionMatch) {
          // Csak log üzenet - NEM modal!
          addLogMessage("warning", "⚠️ Az LLM engedélyt kér - használd a @fájlnév szintaxist!");
        }
      }
    } catch (err) {
      console.error(err);
      if (err instanceof Error && err.name === 'AbortError') {
        setChatError("⏱️ A kérés időtúllépés miatt megszakadt. Az LLM válasz túl sokáig tartott.");
        addLogMessage("error", "⏱️ Chat timeout - próbáld újra rövidebb kéréssel");
      } else {
        setChatError("Hiba történt a chat hívás közben.");
      }
    } finally {
      setChatLoading(false);
    }
  }

/**
 * LLM válaszából patch-ek kinyerése
 * Kezeli az új [CODE_CHANGE] és a régi [JAVASOLT_MÓDOSÍTÁS] formátumot is
 */
function parseSuggestedPatches(reply: string): SuggestedPatch[] {
  const patches: SuggestedPatch[] = [];
  
  // 1. ÚJ FORMÁTUM: [CODE_CHANGE] blokkok
  const newFormatRegex = /\[CODE_CHANGE\]([\s\S]*?)\[\/CODE_CHANGE\]/gi;
  let m: RegExpExecArray | null;

  while ((m = newFormatRegex.exec(reply)) !== null) {
    const block = m[1];

    const fileMatch = block.match(/FILE:\s*(.+?)(?:\r?\n|$)/);
    const actionMatch = block.match(/ACTION:\s*(\w+)/i);
    const action = actionMatch ? actionMatch[1].toLowerCase() : "replace";
    
    // ORIGINAL vagy ANCHOR kód
    const originalMatch = block.match(
      /(?:ORIGINAL|ANCHOR):\s*```[\w]*\s*\r?\n([\s\S]*?)```/i
    );
    
    // MODIFIED vagy NEW_CODE
    const modifiedMatch = block.match(
      /(?:MODIFIED|NEW_CODE):\s*```[\w]*\s*\r?\n([\s\S]*?)```/i
    );

    if (!fileMatch) {
      console.warn("[Patch Parser] Hiányzó FILE mező a CODE_CHANGE blokkban");
      continue;
    }

    // Replace esetén kell original és modified
    if (action === "replace" && (!originalMatch || !modifiedMatch)) {
      console.warn("[Patch Parser] Hiányzó ORIGINAL vagy MODIFIED a replace művelethez");
      continue;
    }

    patches.push({
      id: `patch_${Date.now()}_${patches.length}`,
      filePath: fileMatch[1].trim(),
      original: originalMatch ? originalMatch[1].trim() : "",
      modified: modifiedMatch ? modifiedMatch[1].trim() : "",
    });
  }

  // 2. RÉGI FORMÁTUM: [JAVASOLT_MÓDOSÍTÁS] blokkok (backward compatibility)
  // Több encoding variánst is kezelünk
  const oldFormatPatterns = [
    /\[JAVASOLT_MÓDOSÍTÁS\]([\s\S]*?)\[\/JAVASOLT_MÓDOSÍTÁS\]/g,
    /\[JAVASOLT_MÃ"DOSÍTÁS\]([\s\S]*?)\[\/JAVASOLT_MÃ"DOSÍTÁS\]/g,
    /\[JAVASOLT_MODOSITAS\]([\s\S]*?)\[\/JAVASOLT_MODOSITAS\]/gi,
  ];

  for (const oldRegex of oldFormatPatterns) {
    while ((m = oldRegex.exec(reply)) !== null) {
      const block = m[1];

      const codeTypeMatch = block.match(/KODTIPUS:\s*(\w+)/i);
      const codeType = codeTypeMatch 
        ? (codeTypeMatch[1].toLowerCase() as "pli" | "sas" | "txt")
        : undefined;

      const fileMatch = block.match(/FILE:\s*(.+?)(?:\r?\n|$)/);
      
      // Több encoding variáns az EREDETI-hez
      const originalMatch = block.match(
        /(?:EREDETI|ORIGINAL):\s*(?:KODTIPUS:\s*\w+\s*)?\r?\n?```[\w]*\s*\r?\n([\s\S]*?)```/i
      );
      
      // Több encoding variáns a MÓDOSÍTOTT-hoz
      const modifiedMatch = block.match(
        /(?:MÓDOSÍTOTT|MÃ"DOSÍTOTT|MODIFIED|JAVÍTOTT|JAVITOTT):\s*(?:KODTIPUS:\s*\w+\s*)?\r?\n?```[\w]*\s*\r?\n([\s\S]*?)```/i
      );

      if (!fileMatch || !originalMatch || !modifiedMatch) {
        console.warn("[Patch Parser] Hiányos régi formátumú patch blokk");
        continue;
      }

      // Ellenőrizzük, hogy nincs-e már ilyen patch (duplikáció elkerülése)
      const newPatch = {
        id: `patch_${Date.now()}_${patches.length}`,
        filePath: fileMatch[1].trim(),
        original: originalMatch[1].trim(),
        modified: modifiedMatch[1].trim(),
        codeType,
      };
      
      const isDuplicate = patches.some(
        p => p.filePath === newPatch.filePath && 
             p.original === newPatch.original && 
             p.modified === newPatch.modified
      );
      
      if (!isDuplicate) {
        patches.push(newPatch);
      }
    }
  }

  console.log(`[Patch Parser] ${patches.length} patch kinyerve`);
  return patches;
}

  // @ mention kezelő - autocomplete a fájlnevekhez
  const handleAtMention = React.useCallback((inputValue: string) => {
    // Keressük az utolsó @ jelet
    const lastAtIndex = inputValue.lastIndexOf('@');
    if (lastAtIndex === -1) {
      setAtMentionActive(false);
      setAtMentionSuggestions([]);
      return;
    }
    
    // A @ utáni szöveg (amit a user beírt)
    const afterAt = inputValue.slice(lastAtIndex + 1);
    
    // Ha van szóköz az @ után, akkor már nem autocomplete
    if (afterAt.includes(' ') || afterAt.includes('\n')) {
      setAtMentionActive(false);
      setAtMentionSuggestions([]);
      return;
    }
    
    // Fájlok keresése a filesTree-ben
    if (filesTree && filesTree.length > 0) {
      const searchTerm = afterAt.toLowerCase();
      const allFiles: string[] = [];
      
      // Rekurzívan összegyűjtjük a fájlokat
      const collectFiles = (nodes: FileNode[], prefix: string = '') => {
        for (const node of nodes) {
          const fullPath = prefix ? `${prefix}/${node.name}` : node.name;
          if (!node.isDirectory) {
            allFiles.push(fullPath);
          }
          if (node.children) {
            collectFiles(node.children, fullPath);
          }
        }
      };
      collectFiles(filesTree);
      
      // Szűrés a keresett szöveg alapján
      const matches = allFiles
        .filter(f => f.toLowerCase().includes(searchTerm))
        .slice(0, 8);  // Max 8 találat
      
      if (matches.length > 0) {
        setAtMentionSuggestions(matches);
        setAtMentionActive(true);
        setAtMentionIndex(0);
      } else {
        setAtMentionActive(false);
        setAtMentionSuggestions([]);
      }
    }
  }, [filesTree]);
  
  // @ mention kiválasztása
  const selectAtMention = React.useCallback((filePath: string) => {
    const lastAtIndex = chatInput.lastIndexOf('@');
    if (lastAtIndex !== -1) {
      const newInput = chatInput.slice(0, lastAtIndex) + '@' + filePath + ' ';
      setChatInput(newInput);
    }
    setAtMentionActive(false);
    setAtMentionSuggestions([]);
  }, [chatInput]);

  function handleChatSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!chatLoading) {
      setAtMentionActive(false);  // Autocomplete bezárása
      sendChat();
    }
  }

  return (
    <div className="app-root">
      {/* Fejléc */}
      <header className="app-header">
        <div className="menu-area" ref={menuRef}>
          <button
            type="button"
            className={`menu-button ${menuOpen ? 'active' : ''}`}
            onClick={() => setMenuOpen((prev) => !prev)}
          >
            MENÜ ▾
          </button>
          {menuOpen && (
            <div className="menu-dropdown">
              <button
                type="button"
                className="menu-dropdown-item"
                onClick={() => {
                  setShowOptionsPanel((prev) => !prev);
                  setMenuOpen(false);
                }}
              >
                {showOptionsPanel ? "✔ " : ""}Opciók panel
              </button>
              <button
                type="button"
                className="menu-dropdown-item"
                onClick={() => {
                  openBackupModal();
                  setMenuOpen(false);
                }}
                disabled={!selectedProjectId}
              >
                📁 Backup visszaállítás
              </button>
              <button
                type="button"
                className="menu-dropdown-item"
                onClick={() => {
                  setShowLLMSettings(true);
                  setMenuOpen(false);
                }}
              >
                🤖 LLM Beállítások
              </button>
              <button
                type="button"
                className="menu-dropdown-item"
                onClick={() => {
                  setShowExportDialog(true);
                  setMenuOpen(false);
                }}
                disabled={!selectedProjectId}
              >
                📤 Projekt exportálás
              </button>
              <button
                type="button"
                className="menu-dropdown-item"
                onClick={() => {
                  handleImportProject();
                  setMenuOpen(false);
                }}
              >
                📥 Projekt importálás
              </button>
            </div>
          )}
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
          {/* Auto mód kapcsoló */}
          <button
            type="button"
            className={`auto-mode-toggle ${autoMode ? 'active' : ''}`}
            onClick={() => {
              const newValue = !autoMode;
              setAutoMode(newValue);
              addLogMessage("info", newValue 
                ? "🤖 **AUTO MÓD BEKAPCSOLVA** - módosítások automatikusan alkalmazva" 
                : "👆 **MANUAL MÓD BEKAPCSOLVA** - minden módosítás megerősítést igényel"
              );
            }}
            title={autoMode ? "🤖 AUTO MÓD - módosítások automatikusan alkalmazva" : "👆 MANUAL MÓD - megerősítés szükséges"}
          >
            <span className="toggle-switch" />
            <span>⚡ Auto</span>
          </button>
          {/* Terminal gomb */}
          <button
            type="button"
            className={`auto-mode-toggle ${showTerminal ? 'active' : ''}`}
            onClick={() => setShowTerminal(prev => !prev)}
            title="Terminal megjelenítése"
            style={{ marginLeft: '8px' }}
          >
            <span>💻 Term</span>
          </button>
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
        
        {/* WebSocket sync indikátor - kattintással be/ki kapcsolható */}
        <div 
          className="sync-indicator" 
          title={wsConnected ? `${connectedClients} eszköz csatlakozva - Kattints a kikapcsoláshoz` : 'Szinkronizálás kikapcsolva - Kattints a bekapcsoláshoz'}
          onClick={() => {
            const newState = !wsConnected;
            setWebSocketEnabled(newState);
            if (newState) {
              window.location.reload(); // Újratöltés az új beállítással
            }
          }}
          style={{ cursor: 'pointer' }}
        >
          <span className={`sync-dot ${wsConnected ? 'sync-connected' : 'sync-disconnected'}`} />
          <span className="sync-label">
            {wsConnected ? `🔗 ${connectedClients > 1 ? connectedClients : ''}` : '🔌'}
          </span>
        </div>

        {/* Téma váltó gomb */}
        <button
          type="button"
          className="theme-toggle"
          onClick={toggleTheme}
          title={theme === 'light' ? 'Sötét téma bekapcsolása' : 'Világos téma bekapcsolása'}
        >
          <span className="theme-icon">{theme === 'light' ? '🌙' : '☀️'}</span>
          <span className="theme-label">{theme === 'light' ? 'Sötét' : 'Világos'}</span>
        </button>

        <div className="header-right">LLM Dev Environment</div>
      </header>

      {/* Fő tartalom */}
      <div className="app-body">
        {/* Mobil tab sáv — desktopon a CSS elrejti */}
        <div className="mobile-tabs">
          <button
            type="button"
            className={
              "mobile-tab" + (activeTab === "projects" ? " active" : "")
            }
            onClick={() => setActiveTab("projects")}
          >
            📁 Projektek
          </button>
          <button
            type="button"
            className={
              "mobile-tab" + (activeTab === "code" ? " active" : "")
            }
            onClick={() => setActiveTab("code")}
          >
            💻 Kód
          </button>
          <button
            type="button"
            className={
              "mobile-tab" + (activeTab === "chat" ? " active" : "")
            }
            onClick={() => setActiveTab("chat")}
          >
            💬 Chat
          </button>
          <button
            type="button"
            className={
              "mobile-tab" + (activeTab === "log" ? " active" : "")
            }
            onClick={() => setActiveTab("log")}
          >
            📋 Log
          </button>
        </div>

        <div className="main-row">
          {/* Bal: Projektek */}
          <section
            className={
              "panel projects-panel" +
              (activeTab === "projects" ? " mobile-show" : " mobile-hide")
            }
            style={{ width: projectsWidth }}
            ref={projectsPanelRef}
          >
            <div className="panel-header">
              <span>Projektek</span>
              <div className="panel-header-right">
                <button
                  className="icon-button edit"
                  disabled={selectedProjectId == null}
                  onClick={() => {
                    if (selectedProjectId == null) return;
                    const p = projects.find(
                      (pr) => pr.id === selectedProjectId
                    );
                    if (!p) return;
                    setProjectModalMode("edit");
                    setEditingProjectId(p.id);
                    setNewProjectName(p.name);
                    setNewProjectDescription(p.description ?? "");
                    setNewProjectRootPath(p.root_path ?? "");
                    setProjectModalError(null);
                    setIsProjectModalOpen(true);
                  }}
                  title="Projekt szerkesztése"
                >
                  ✏️
                </button>

                <button
                  className="icon-button add"
                  onClick={() => {
                    setProjectModalMode("create");
                    setEditingProjectId(null);
                    setNewProjectName("");
                    setNewProjectDescription("");
                    setNewProjectRootPath("");
                    setProjectModalError(null);
                    setIsProjectModalOpen(true);
                  }}
                  title="Ãšj projekt"
                >
                  +
                </button>
              </div>
            </div>

            {/* Projektek ←↓ Fájlfa — belső osztás */}
            <div className="projects-inner">
              {/* Projektek lista (felső rész) */}
              <div
                className="projects-list projects-list-wrapper"
                style={{ flexBasis: `${projectsInnerRatio * 100}%` }}
              >
                {projectsLoading && (
                  <div className="projects-info">Betöltés…</div>
                )}
                {projectsError && !projectsLoading && (
                  <div className="projects-error">{projectsError}</div>
                )}
                {!projectsLoading &&
                  projects.length === 0 &&
                  !projectsError && (
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
                    onClick={() => {
                      // Don't select if context menu just opened
                      if (Date.now() - menuOpenTimeRef.current < 500) return;
                      setSelectedProjectId(p.id);
                    }}
                    onContextMenu={(e) => handleProjectContextMenu(e, p.id)}
                    onTouchStart={(e) => handleProjectLongPressStart(e, p.id)}
                    onTouchEnd={handleProjectLongPressEnd}
                    onTouchCancel={handleProjectLongPressEnd}
                    onTouchMove={handleProjectLongPressEnd}
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

                    <div className="project-actions">
                      {/* Reindex gomb */}
                      <button
                        type="button"
                        className={`icon-button refresh ${reindexingProjectId === p.id ? "reindexing" : ""}`}
                        style={{
                          marginTop: "4px",
                          marginRight: "4px",
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReindexProject(p.id);
                        }}
                        disabled={reindexingProjectId === p.id}
                        title={
                          reindexingProjectId === p.id && reindexStatus
                            ? `Indexelés: ${reindexStatus.indexed_files}/${reindexStatus.total_files} fájl`
                            : p.root_path
                            ? "A projekt kódbázisának újraindexelése"
                            : "Nincs root mappa beállítva ehhez a projekthez"
                        }
                      >
                        {reindexingProjectId === p.id
                          ? reindexStatus
                            ? `${reindexStatus.indexed_files}/${reindexStatus.total_files || "?"}`
                            : "⏳"
                          : "📄"}
                      </button>

                      {/* Törlés gomb */}
                      <button
                        type="button"
                        className="icon-button delete"
                        style={{ marginTop: "4px" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteProject(p.id);
                        }}
                        title="Projekt törlése"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Belső vízszintes resizer a projektek és fájlfa között */}
              <div
                className="horizontal-resizer inner"
                onMouseDown={(e) =>
                  setDrag({
                    type: "projects-inner",
                    startY: e.clientY,
                    startRatio: projectsInnerRatio,
                  })
                }
                title="Húzd a projektek és fájlok közti arányhoz"
              />

              {/* Fájlok a projekt root_path alól (alsó rész) */}
              <div
                className="files-panel files-list-wrapper"
                style={{
                  flexBasis: `${(1 - projectsInnerRatio) * 100}%`,
                }}
              >
                <div className="files-header">
                  <span>
                  Fájlok
                  {selectedProjectId && (
                    <span className="files-subtitle">
                      (projekt #{selectedProjectId})
                    </span>
                    )}
                  </span>
                  {selectedProjectId && (
                    <button
                      type="button"
                      className="icon-button refresh"
                      onClick={() => {
                        console.log('[FILES] Refresh gomb kattintva');
                        loadProjectFiles();
                      }}
                      disabled={filesLoading}
                      title="Fájllista frissítése"
                      style={{
                        marginLeft: "8px",
                      }}
                    >
                      {filesLoading ? "⏳" : "📄"}
                    </button>
                  )}
                </div>

                <div className="files-list">
                  {!selectedProjectId && (
                    <div className="files-info">
                      Válassz egy projektet a fájlokhoz.
                    </div>
                  )}

                  {selectedProjectId && filesLoading && (
                    <div className="files-info">Fájlok betöltése…</div>
                  )}

                  {selectedProjectId &&
                    filesError &&
                    !filesLoading && (
                      <div className="files-error">{filesError}</div>
                    )}

                  {selectedProjectId &&
                    !filesLoading &&
                    !filesError &&
                    filesTree &&
                    filesTree.length === 0 && (
                      <div className="files-info">
                        Nincs megjeleníthető fájl ebben a projekt root
                        mappában.
                      </div>
                    )}

                  {selectedProjectId &&
                    !filesLoading &&
                    !filesError &&
                    filesTree &&
                    filesTree.length > 0 &&
                    filesTree.map((node) =>
                      renderFileNode(
                        node,
                        0,
                        selectedFilePath,
                        expandedPaths,
                        handleToggleDir,
                        handleLoadFile,
                        handleFileContextMenu,
                        handleFileTouchStart,
                        handleTouchMove,
                        handleTouchEnd
                      )
                    )}
                </div>
              </div>
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
          <div className="right-area" ref={rightAreaRef} style={{ display: "flex", flexDirection: "row" }}>
            {/* Bal oldal: Kód panel */}
            <div
              className={
                "code-area" +
                (activeTab === "code" ? " mobile-show" : " mobile-hide")
              }
                style={{
                flexBasis: `${codeRightRatio * 100}%`,
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Egyesített kód panel */}
              <section
                className="panel unified-code-panel"
                style={{ flex: 1 }}
              >
                {/* ═══════════ TAB BAR - Több fájl kezelése ═══════════ */}
                {openTabs.length > 0 && (
                  <div className="tab-bar" style={{
                    display: 'flex',
                    backgroundColor: '#1e1e1e',
                    borderBottom: '1px solid #333',
                    overflowX: 'auto',
                    minHeight: 32,
                  }}>
                    {openTabs.map((tab, index) => (
                      <div
                        key={tab.path}
                        className={`tab-item ${index === activeTabIndex ? 'active' : ''}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '4px 8px',
                          cursor: 'pointer',
                          backgroundColor: index === activeTabIndex ? '#2d2d2d' : 'transparent',
                          borderRight: '1px solid #333',
                          color: index === activeTabIndex ? '#fff' : '#888',
                          fontSize: '0.85rem',
                          whiteSpace: 'nowrap',
                        }}
                        onClick={() => switchToTab(index)}
                      >
                        <span style={{ marginRight: 8 }}>
                          {tab.path.split('/').pop()}
                          {tab.isDirty && ' •'}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            closeTab(index);
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#888',
                            cursor: 'pointer',
                            padding: '0 4px',
                            fontSize: '14px',
                          }}
                          title="Bezárás"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                
                <div className="panel-header">
                  <span>
                    Kód {selectedFilePath && `- ${selectedFilePath}`} ({getEncodingLabel(encoding)})
                  </span>
                  <div className="panel-header-right">
                    {/* Mentés gomb */}
                    <button
                      type="button"
                      className="secondary-button save-btn"
                      onClick={() => handleSaveFile()}
                      disabled={!selectedFilePath}
                      title="Mentés (Ctrl+S)"
                    >
                      💾 Mentés
                    </button>
                    {/* AI Validálás gomb - aktuális fájlra */}
                      <button
                        type="button"
                        className={`secondary-button agentic ${agenticAnalysisLoading ? 'loading' : ''} ${!selectedFilePath ? 'needs-file' : ''}`}
                        onClick={handleAgenticValidation}
                        disabled={agenticAnalysisLoading || !selectedFilePath}
                        title={!selectedFilePath ? "⚠️ Először válassz ki egy fájlt a bal oldali listából!" : "🔍 AI Validálás - Elemzi az aktuális fájlt hibákért"}
                      >
                        {agenticAnalysisLoading ? "⏳ Elemzés..." : !selectedFilePath ? "📁 Válassz fájlt!" : "🔍 Fájl Validálás"}
                      </button>
                    {/* Javaslat navigáció */}
                    {hasSuggestions && (
                      <div className="suggestion-nav">
                        <span className="suggestion-counter">
                          {currentSuggestionIndex + 1} / {suggestions.length}
                        </span>
                      <button
                        type="button"
                          className="nav-btn"
                          onClick={handlePrevSuggestion}
                          disabled={currentSuggestionIndex === 0}
                          title="Előző javaslat"
                        >
                          ◀
                        </button>
                        <button
                          type="button"
                          className="nav-btn"
                          onClick={handleNextSuggestion}
                          disabled={currentSuggestionIndex >= suggestions.length - 1}
                          title="Következő javaslat"
                        >
                          ▶
                      </button>
                    </div>
                    )}
                    <select
                      className="encoding-select"
                      value={encoding}
                      onChange={(e) => setEncoding(e.target.value as Encoding)}
                      title="Kódolás"
                    >
                      {ENCODINGS.map((enc) => (
                        <option key={enc.value} value={enc.value}>
                          {enc.label}
                        </option>
                      ))}
                    </select>
                    {/* Zoom controls */}
                    <div className="zoom-controls">
                      <button
                        type="button"
                        className="zoom-btn"
                        onClick={handleZoomOut}
                        disabled={codeZoom <= 60}
                        title="Kicsinyítés"
                      >
                        ➖
                      </button>
                      <span 
                        className="zoom-level" 
                        onClick={handleZoomReset}
                        title="Alapértelmezett nagyítás (kattints a visszaállításhoz)"
                      >
                        {codeZoom}%
                      </span>
                      <button
                        type="button"
                        className="zoom-btn"
                        onClick={handleZoomIn}
                        disabled={codeZoom >= 200}
                        title="Nagyítás"
                      >
                        ➕
                      </button>
                    </div>
                    {/* Szintaxis színezés kapcsoló */}
                    <button
                      type="button"
                      className={`syntax-toggle-btn ${syntaxHighlightEnabled ? 'active' : ''}`}
                      onClick={toggleSyntaxHighlight}
                      title={syntaxHighlightEnabled ? "Szintaxis színezés kikapcsolása (gyorsabb)" : "Szintaxis színezés bekapcsolása"}
                    >
                      {syntaxHighlightEnabled ? '🎨' : '📝'}
                    </button>
                  </div>
                </div>

                {/* Kód keresés panel */}
                {showCodeSearch && (
                  <div 
                    className="code-search-panel"
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <div className="code-search-input-container">
                      <span className="code-search-icon">🔍</span>
                      <input
                        ref={searchInputRef}
                        type="text"
                        className="code-search-input"
                        placeholder="Keresés a kódban..."
                        value={searchTerm}
                        autoFocus
                        autoComplete="off"
                        onChange={(e) => {
                          e.stopPropagation();
                          setSearchTerm(e.target.value);
                          performSearch(e.target.value);
                        }}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (e.shiftKey) {
                              goToPrevSearchResult();
                            } else {
                              goToNextSearchResult();
                            }
                          }
                        }}
                        onFocus={(e) => e.stopPropagation()}
                        onBlur={(e) => {
                          // Ne veszítse el a fókuszt ha a panelen belül kattintunk
                          const relatedTarget = e.relatedTarget as HTMLElement;
                          if (relatedTarget?.closest('.code-search-panel')) {
                            e.preventDefault();
                            setTimeout(() => searchInputRef.current?.focus(), 0);
                          }
                        }}
                      />
                      {searchResults.length > 0 && (
                        <span className="code-search-count">
                          {currentSearchIndex + 1}/{searchResults.length}
                        </span>
                      )}
                      <button 
                        className="code-search-nav-btn"
                        onClick={goToPrevSearchResult}
                        disabled={searchResults.length === 0}
                        title="Előző (Shift+Enter)"
                      >
                        ▲
                      </button>
                      <button 
                        className="code-search-nav-btn"
                        onClick={goToNextSearchResult}
                        disabled={searchResults.length === 0}
                        title="Következő (Enter)"
                      >
                        ▼
                      </button>
                      <button 
                        className="code-search-close-btn"
                        onClick={closeSearch}
                        title="Bezárás (Esc)"
                      >
                        ✕
                      </button>
                    </div>
                    {searchResults.length > 0 && searchResults.length <= 50 && (
                      <div className="code-search-results">
                        {searchResults.map((result, idx) => (
                          <div
                            key={`${result.line}-${result.column}-${idx}`}
                            className={`code-search-result-item ${idx === currentSearchIndex ? 'active' : ''}`}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setCurrentSearchIndex(idx);
                              scrollToSearchResult(result);
                              // Fókusz vissza a keresőmezőre
                              setTimeout(() => searchInputRef.current?.focus(), 10);
                            }}
                          >
                            <span className="code-search-result-line">Sor {result.line}:</span>
                            <span className="code-search-result-text">{result.text}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {searchResults.length > 50 && (
                      <div className="code-search-too-many">
                        {searchResults.length} találat - használd az ▲▼ gombokat a navigáláshoz
                      </div>
                    )}
                    {searchTerm && searchResults.length === 0 && (
                      <div className="code-search-no-results">
                        Nincs találat: "{searchTerm}"
                      </div>
                    )}
                  </div>
                )}

                {/* Kód nézet - inline javaslat megjelenítéssel */}
                <div 
                  onContextMenu={handleCodeContextMenu}
                  className="code-view-container"
                  style={{ 
                    flex: 1, 
                    display: 'flex', 
                    flexDirection: 'column',
                    overflow: 'auto',
                    minHeight: 0,
                    '--code-zoom': codeZoom / 100,
                  } as React.CSSProperties}
                >
                  <InlineCodeWithSuggestion
                    code={code}
                    setCode={setCode}
                    suggestion={currentSuggestion}
                    onApply={handleApplySuggestion}
                    onSkip={handleSkipSuggestion}
                    onNextPosition={handleNextPosition}
                    onPrevPosition={handlePrevPosition}
                    onSetManualPosition={handleSetManualPosition}
                    settings={editorSettings}
                    diffViewRef={diffViewRef}
                    scrollToLine={scrollToLine}
                    filePath={selectedFilePath}
                    syntaxHighlightEnabled={syntaxHighlightEnabled}
                  />
                </div>

                {/* Syntax error panel */}
                {showSyntaxPanel && (
                  <SyntaxErrorPanel
                    errors={syntaxErrors}
                    onErrorClick={(line) => {
                      console.log(`[SYNTAX] Ugrás a ${line}. sorra`);
                      setScrollToLine(line);
                      setTimeout(() => setScrollToLine(null), 100);
                    }}
                    onFixError={handleFixSyntaxError}
                    onFixAllErrors={handleFixAllSyntaxErrors}
                    onClose={handleCloseSyntaxPanel}
                    isFixing={isFixingSyntax}
                  />
                )}

                </section>
            </div>

            {/* Vertical resizer: kód és jobb oldal között */}
            <div
              className={
                "vertical-resizer" +
                (activeTab === "code" ? " mobile-show" : " mobile-hide")
              }
              onMouseDown={(e) =>
                setDrag({
                  type: "code-right",
                  startX: e.clientX,
                  startRatio: codeRightRatio,
                })
              }
              onDoubleClick={() => setCodeRightRatio(PANEL_DEFAULTS.CODE_RIGHT_RATIO)}
              title="Húzd a kód és jobb oldal közötti arányhoz, dupla katt az alap arányhoz"
            />

            {/* Jobb oldali sáv: Chat + Log + Opciók */}
            <div
              ref={rightSidebarRef}
              className={
                "right-sidebar" +
                (activeTab === "chat" ? " mobile-show mobile-chat-fullscreen" : 
                 activeTab === "log" ? " mobile-show mobile-log-fullscreen" :
                 " mobile-hide-sidebar")
              }
              style={{
                flexBasis: `${(1 - codeRightRatio) * 100}%`,
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* LLM Chat */}
              <section
                className={
                  "panel chat-panel" +
                  (activeTab === "chat" ? " mobile-chat-visible" : "")
                }
                style={{
                  flexBasis: `${chatLogRatio * 100}%`,
                  minHeight: 0,
                }}
            >
              <div className="panel-header">
                <span>LLM Chat</span>
                <div className="panel-header-right">
                  {/* AI Projekt Elemzés gomb - teljes projektre */}
                  <button
                    type="button"
                    className={`secondary-button agentic ${agenticAnalysisLoading ? 'loading' : ''}`}
                    onClick={handleAgenticSuggestion}
                    disabled={agenticAnalysisLoading || !selectedProjectId}
                    title={!selectedProjectId ? "Először válassz ki egy projektet!" : "💡 AI Projekt Elemzés - Elemzi és javítja a teljes projektet"}
                  >
                    {agenticAnalysisLoading ? "⏳ Elemzés..." : "💡 Projekt Elemzés"}
                  </button>
                  
                  {chatLoading && <span>Gondolkodom…</span>}
                  {chatError && (
                    <span className="projects-error">{chatError}</span>
                  )}
                </div>
              </div>

              {/* Javasolt módosítások listája - csak MANUAL módban */}
              {!autoMode && suggestedPatches.length > 0 && (
                <div
                  style={{
                    padding: "6px 10px",
                    borderBottom: "1px solid #eee",
                    fontSize: "0.8rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 4,
                    }}
                  >
                    <span>
                      Javasolt módosítások:{" "}
                      <strong>{suggestedPatches.length}</strong>
                    </span>
                    <button
                      type="button"
                      className="secondary-button"
                      style={{ fontSize: "0.7rem", padding: "2px 6px" }}
                      onClick={() => {
                        setSuggestedPatches([]);
                        setActivePatch(null);
                      }}
                    >
                      Lista törlése
                    </button>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {suggestedPatches.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          className="chat-file-link"
                          onClick={() => handleSelectPatch(p)}
                        >
                          {p.filePath}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Aktív patch előnézet — 3 gombos panel */}
              {activePatch && (
                <div className="patch-box">
                  <div className="patch-box-title">
                    <strong>Módosítandó fájl:</strong>{" "}
                    <code>{activePatch.filePath}</code>
                  </div>

                  <div className="patch-columns">
                    <div className="patch-column">
                      <div className="patch-label">Eredeti részlet</div>
                      <pre className="patch-pre">
                        {activePatch.original}
                      </pre>
                    </div>

                    <div className="patch-column">
                      <div className="patch-label">Módosított részlet</div>
                      <pre className="patch-pre modified">
                        {activePatch.modified}
                      </pre>
                    </div>
                  </div>

                  <div className="patch-buttons">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => handlePatchOpenFile(activePatch)}
                    >
                      Fájl megnyitása
                    </button>
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => handlePatchApply(activePatch)}
                    >
                      Automatikus csere
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => handlePatchCopy(activePatch)}
                    >
                      Módosított kód másolása
                    </button>
                  </div>
                </div>
              )}

              <div className="chat-messages" ref={chatMessagesRef}>
                {chatMessages.length === 0 && (
                  <div className="projects-info">
                    <p>Írj egy kérdést az LLM-nek a kóddal kapcsolatban…</p>
                    <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '8px' }}>
                      💡 <strong>Tipp:</strong> Használd az <code style={{ background: '#e5e7eb', padding: '2px 4px', borderRadius: '3px' }}>@fájlnév</code> szintaxist, 
                      hogy explicit betölts egy fájlt!<br/>
                      Példa: <code style={{ background: '#e5e7eb', padding: '2px 4px', borderRadius: '3px' }}>@static/js/game.js mi okozza az ütközés problémát?</code>
                    </p>
                  </div>
                )}

                {chatMessages.map((m) => (
                  <div
                    key={m.id}
                    className={`chat-message ${m.role}`}
                    style={{
                      marginBottom: "6px",
                      textAlign: m.role === "user" ? "right" : "left",
                    }}
                    onContextMenu={(e) => handleChatMessageContextMenu(e, m)}
                  >
                    {m.role === "system" ? (
                      // System üzenet (patch summary / confirmation) - speciális megjelenítés
                      <div
                        style={{
                          display: "block",
                          padding: "10px 14px",
                          borderRadius: 8,
                          fontSize: "0.9rem",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          overflowWrap: "break-word",
                          textAlign: "left",
                        }}
                      >
                        {renderAssistantMessage(m.text, m.modifications)}
                        
                        {/* Inline megerősítő gombok ha ez a pending confirmation üzenet */}
                        {pendingConfirmationId === m.id && pendingChange && pendingChange.patches.length > 0 && (
                          <div style={{ 
                            marginTop: 12, 
                            display: 'flex', 
                            gap: 10,
                            borderTop: '1px solid rgba(255,255,255,0.2)',
                            paddingTop: 12
                          }}>
                            <button
                              onClick={async () => {
                                // Megerősítés - alkalmazzuk a patch-eket
                                // FONTOS: Átadjuk az editor tartalmát!
                                const results: PatchResult[] = [];
                                // MINDIG lemezről töltjük!
                                for (const patch of pendingChange.patches) {
                                  const result = await applyPatch(
                                    patch, 
                                    selectedProjectId!, 
                                    filesTree, 
                                    BACKEND_URL
                                  );
                                  results.push(result);
                                  if (result.success && result.newContent) {
                                    const isCurrentFile = result.resolvedPath?.toLowerCase() === selectedFilePath?.toLowerCase();
                                    if (isCurrentFile) {
                                      setCode(result.newContent);
                                    }
                                  }
                                }
                                
                                // Összefoglaló
                                const summaryText = formatPatchSummary(results, pendingChange.patches, false);
                                const successCount = results.filter(r => r.success).length;
                                
                                // Frissítjük az üzenetet az eredménnyel
                                setChatMessages(prev => prev.map(msg => 
                                  msg.id === m.id 
                                    ? { ...msg, text: msg.text + `\n\n---\n\n${summaryText}` }
                                    : msg
                                ));
                                
                                if (successCount > 0) {
                                  addLogMessage("success", `🎉 ${successCount}/${pendingChange.patches.length} módosítás alkalmazva!`);
                                }
                                
                                // Töröljük a pending státuszt
                                setPendingChange(null);
                                setPendingConfirmationId(null);
                              }}
                              style={{
                                padding: '8px 16px',
                                background: '#22c55e',
                                color: 'white',
                                border: 'none',
                                borderRadius: 6,
                                cursor: 'pointer',
                                fontWeight: 'bold',
                              }}
                            >
                              ✅ Megerősítés
                            </button>
                            <button
                              onClick={() => {
                                // Elutasítás
                                setChatMessages(prev => prev.map(msg => 
                                  msg.id === m.id 
                                    ? { ...msg, text: msg.text + '\n\n---\n\n❌ **Elutasítva**' }
                                    : msg
                                ));
                                addLogMessage("info", "❌ Módosítás elutasítva");
                                setPendingChange(null);
                                setPendingConfirmationId(null);
                              }}
                              style={{
                                padding: '8px 16px',
                                background: '#ef4444',
                                color: 'white',
                                border: 'none',
                                borderRadius: 6,
                                cursor: 'pointer',
                                fontWeight: 'bold',
                              }}
                            >
                              ❌ Elutasítás
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div
                        className={`chat-bubble chat-bubble-${m.role}`}
                      >
                        {m.role === "assistant"
                          ? renderAssistantMessage(m.text, m.modifications)
                          : m.text}
                      </div>
                    )}
                  </div>
                ))}
                
                {/* ═══════════════════════════════════════════════════════════════
                    JÓVÁHAGYÁSRA VÁRÓ TOOL MŰVELETEK (terminal, fájl törlés, stb.)
                    ═══════════════════════════════════════════════════════════════ */}
                {pendingToolPermissions.length > 0 && (
                  <div className="pending-permissions-panel">
                    <div className="panel-title">
                      ⚠️ Jóváhagyásra váró műveletek ({pendingToolPermissions.length})
                    </div>
                    
                    {pendingToolPermissions.map((perm, idx) => (
                      <div key={perm.tool_call_id || idx} className="permission-card">
                        {/* Terminal parancs */}
                        {perm.permission_type === "terminal" && (
                          <div>
                            <div className="permission-type terminal">
                              🖥️ Terminal parancs
                            </div>
                            <div className="permission-description">
                              {perm.details.description}
                            </div>
                            <div className="permission-path terminal">
                              {perm.details.command}
                            </div>
                          </div>
                        )}
                        
                        {/* Fájl törlés */}
                        {perm.permission_type === "delete" && (
                          <div>
                            <div className="permission-type delete">
                              🗑️ Fájl törlés
                            </div>
                            <div className="permission-path delete">
                              {perm.details.path}
                            </div>
                          </div>
                        )}
                        
                        {/* Fájl írás (write) */}
                        {perm.permission_type === "write" && (
                          <div>
                            <div className="permission-type write">
                              📝 Fájl létrehozás/írás
                            </div>
                            <div className="permission-path write">
                              {perm.details.path} ({perm.details.content_length} karakter)
                            </div>
                            {perm.details.content_preview && (
                              <div className="content-preview">
                                {perm.details.content_preview}
                              </div>
                            )}
                          </div>
                        )}
                        
                        {/* Fájl szerkesztés (edit) */}
                        {perm.permission_type === "edit" && (
                          <div>
                            <div className="permission-type edit">
                              ✏️ Fájl szerkesztés
                            </div>
                            <div className="permission-path edit">
                              {perm.details.path}
                            </div>
                            <div className="diff-container">
                              <div className="diff-box">
                                <div className="diff-label original">❌ Eredeti:</div>
                                <div className="diff-content original">
                                  {perm.details.old_preview || perm.details.old_text?.substring(0, 200)}
                                </div>
                              </div>
                              <div className="diff-box">
                                <div className="diff-label new">✅ Új:</div>
                                <div className="diff-content new">
                                  {perm.details.new_preview || perm.details.new_text?.substring(0, 200)}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {/* Könyvtár létrehozás */}
                        {perm.permission_type === "create_directory" && (
                          <div>
                            <div className="permission-type directory">
                              📁 Könyvtár létrehozás
                            </div>
                            <div className="permission-path directory">
                              {perm.details.path}
                            </div>
                          </div>
                        )}
                        
                        {/* Jóváhagyás / Elutasítás gombok */}
                        <div className="action-buttons">
                          <button
                            onClick={() => executeApprovedTool(perm)}
                            className="btn-approve"
                          >
                            ✅ Jóváhagyás
                          </button>
                          <button
                            onClick={() => rejectToolPermission(perm)}
                            className="btn-reject"
                          >
                            ❌ Elutasítás
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <form className="chat-input-row" onSubmit={handleChatSubmit}>
                <div className="chat-input-wrapper">
                  <textarea
                    ref={chatInputRef}
                    className="chat-input"
                    placeholder="Írj az LLM-nek… | @fájl | Alt+Enter: új sor"
                    autoComplete="off"
                    value={chatInput}
                    onChange={(e) => {
                      const value = e.target.value;
                      setChatInput(value);
                      handleAtMention(value);  // @ autocomplete
                      // Auto-expand most useEffect-ben van
                    }}
                    onKeyDown={(e) => {
                      // @ autocomplete navigáció
                      if (atMentionActive && atMentionSuggestions.length > 0) {
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          setAtMentionIndex(prev => Math.min(prev + 1, atMentionSuggestions.length - 1));
                          return;
                        }
                        if (e.key === "ArrowUp") {
                          e.preventDefault();
                          setAtMentionIndex(prev => Math.max(prev - 1, 0));
                          return;
                        }
                        if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
                          e.preventDefault();
                          selectAtMention(atMentionSuggestions[atMentionIndex]);
                          return;
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          setAtMentionActive(false);
                          return;
                        }
                      }
                      // Alt+Enter vagy Ctrl+Enter: új sor beszúrása
                      if ((e.altKey || e.ctrlKey) && e.key === "Enter") {
                        e.preventDefault();
                        const textarea = e.currentTarget;
                        const start = textarea.selectionStart;
                        const end = textarea.selectionEnd;
                        const newValue = chatInput.substring(0, start) + "\n" + chatInput.substring(end);
                        setChatInput(newValue);
                        // Kurzor pozíció beállítása és görgetés
                        requestAnimationFrame(() => {
                          textarea.selectionStart = textarea.selectionEnd = start + 1;
                          // Görgetés a kurzorhoz - scrollTop = scrollHeight görget a végére
                          textarea.scrollTop = textarea.scrollHeight;
                        });
                        return;
                      }
                      // Enter: üzenet küldése (Shift nélkül)
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (!chatLoading && chatInput.trim()) {
                          handleChatSubmit(e);
                        }
                      }
                      // Escape: mező ürítése
                      if (e.key === "Escape") {
                        e.preventDefault();
                        setChatInput("");
                      }
                    }}
                    onBlur={() => {
                      // Kis késleltetés, hogy a kattintás működjön
                      setTimeout(() => setAtMentionActive(false), 150);
                    }}
                    rows={1}
                    style={{
                      resize: "none",
                      minHeight: "48px",
                      maxHeight: "200px",
                      overflow: "auto",
                    }}
                  />
                  {/* @ mention autocomplete dropdown */}
                  {atMentionActive && atMentionSuggestions.length > 0 && (
                    <div className="at-mention-dropdown" style={{
                      position: 'absolute',
                      bottom: '100%',
                      left: 0,
                      right: 0,
                      background: 'var(--bg-tertiary, #2d2d2d)',
                      border: '1px solid var(--border-color, #444)',
                      borderRadius: '4px',
                      maxHeight: '200px',
                      overflowY: 'auto',
                      zIndex: 1000,
                      boxShadow: '0 -2px 10px rgba(0,0,0,0.3)',
                    }}>
                      {atMentionSuggestions.map((file, idx) => (
                        <div
                          key={file}
                          onClick={() => selectAtMention(file)}
                          style={{
                            padding: '8px 12px',
                            cursor: 'pointer',
                            background: idx === atMentionIndex ? 'var(--accent-color, #007acc)' : 'transparent',
                            color: idx === atMentionIndex ? 'white' : 'inherit',
                            fontSize: '13px',
                            fontFamily: 'monospace',
                          }}
                          onMouseEnter={() => setAtMentionIndex(idx)}
                        >
                          📄 {file}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  className="primary-button"
                  type="submit"
                  disabled={chatLoading || !chatInput.trim()}
                >
                  {chatLoading ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className="loading-spinner">⏳</span> Küldés...
                    </span>
                  ) : (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      Küldés <span>➤</span>
                    </span>
                  )}
                </button>
              </form>
            </section>

              {/* Resizer: Chat és Log között */}
              <div
                className="horizontal-resizer"
                onMouseDown={(e) =>
                  setDrag({
                    type: "chat-log",
                    startY: e.clientY,
                    startRatio: chatLogRatio,
                  })
                }
                onDoubleClick={() => setChatLogRatio(PANEL_DEFAULTS.CHAT_LOG_RATIO)}
                title="Húzd a chat és log közötti arányhoz, dupla katt az alap arányhoz"
              />

              {/* Log Panel */}
              <section 
                className={
                  "panel log-panel" +
                  (activeTab === "log" ? " mobile-log-visible" : "")
                }
                style={{
                  flexBasis: `${(1 - chatLogRatio) * 100}%`,
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div className="panel-header">
                  <span>📋</span>
                  <div className="panel-header-right">
                    <button
                      type="button"
                      className="icon-button delete"
                      onClick={() => setLogMessages([])}
                      title="Log üzenetek törlése"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
                <LogWindow
                  messages={logMessages}
                />
              </section>

              {/* Opciók panel — alul */}
              {showOptionsPanel && (
                <>
                  {/* Resizer: Log és Opciók között */}
                  <div
                    className="horizontal-resizer"
                    title="Opciók panel elválasztó"
                  />
                  <aside
                    className="panel options-panel"
                    style={{ flexShrink: 0, maxHeight: "300px", overflowY: "auto" }}
                  >
                    <div className="panel-header">Opciók</div>
                    <div className="options-content">
                      {selectedProjectId && (
                        <div className="options-section">
                          Aktív projekt ID: <b>{selectedProjectId}</b>
                        </div>
                      )}

                      {hasSuggestions && (
                        <div className="options-section">
                          <div className="options-section-title">
                            Aktív javaslatok
                          </div>
                          <div style={{ fontSize: "0.85rem", color: "#9ab" }}>
                            {pendingSuggestions.length} függőben
                          </div>
                        </div>
                      )}

                      <div className="options-section">
                        <div className="options-section-title">
                          Szerkesztő beállítások
                        </div>
                        <div className="options-grid">
                          <label>
                            Max sor
                            <input
                              type="number"
                              min={1}
                              className="options-number-input"
                              value={editorSettings.maxLines ?? ""}
                              onChange={(e) =>
                                setEditorSettings((prev) => ({
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
                              value={editorSettings.maxColumns ?? ""}
                              onChange={(e) =>
                                setEditorSettings((prev) => ({
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
                            checked={editorSettings.mode === "wrap"}
                            onChange={(e) =>
                              setEditorSettings((prev) => ({
                                ...prev,
                                mode: e.target.checked ? "wrap" : "truncate",
                              }))
                            }
                          />
                          Tördelés vágás helyett
                        </label>
                      </div>

                      <div className="options-hint">
                        A max sor / max oszlop beállítások ténylegesen
                        korlátozzák a kódot: "vágás" módban a sorok adott
                        oszlopszámnál levágódnak, "tördelés" módban új
                        sorokra törnek. A sorok száma és a sorszámozás
                        mindig ehhez igazodik.
                      </div>
                    </div>
                  </aside>
                </>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* Ãšj projekt modál */}
      {isProjectModalOpen && (
        <div
          className="modal-backdrop"
          onClick={() => setIsProjectModalOpen(false)}
        >
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>
              {projectModalMode === "create"
                ? "Ãšj projekt"
                : "Projekt szerkesztése"}
            </h2>

            <form
              onSubmit={handleProjectModalSubmit}
              className="modal-form"
            >
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
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <input
                    type="text"
                    value={newProjectRootPath}
                    onChange={(e) =>
                      setNewProjectRootPath(e.target.value)
                    }
                    placeholder="pl. C:\\Projektek\\Valami"
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={handleOpenBrowseModal}
                    title="Mappák böngészése"
                  >
                    📁 Tallózás
                  </button>
                </div>
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
                  {projectModalSaving
                    ? "Mentés…"
                    : projectModalMode === "create"
                    ? "Létrehozás"
                    : "Mentés"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mappaböngésző modál */}
      {showBrowseModal && (
        <div
          className="modal-backdrop"
          onClick={() => setShowBrowseModal(false)}
        >
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "600px", width: "90%" }}
          >
            <h2>📁 Mappa kiválasztása</h2>
            
            {browseLoading && <p>Betöltés...</p>}
            
            {!browseLoading && (
              <>
                {/* Navigáció */}
                <div style={{ 
                  display: "flex", 
                  gap: "8px", 
                  marginBottom: "16px",
                  alignItems: "center",
                  flexWrap: "wrap"
                }}>
                  {browseParentPath && (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => handleBrowseNavigate(browseParentPath)}
                      title="Feljebb"
                    >
                      ⬆️ Feljebb
                    </button>
                  )}
                  <div style={{ 
                    flex: 1, 
                    padding: "4px 8px", 
                    background: "#f3f4f6", 
                    borderRadius: "4px",
                    fontSize: "0.85rem",
                    wordBreak: "break-all"
                  }}>
                    {browseCurrentPath}
                  </div>
                </div>

                {/* Mappák listája */}
                <div style={{ 
                  maxHeight: "400px", 
                  overflowY: "auto",
                  border: "1px solid #e5e7eb",
                  borderRadius: "6px",
                  padding: "8px"
                }}>
                  {browseItems.length === 0 ? (
                    <div style={{ padding: "16px", textAlign: "center", color: "#6b7280" }}>
                      Nincs mappa ebben a könyvtárban
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      {browseItems.map((item) => (
                        <div
                          key={item.path}
                          style={{
                            padding: "8px 12px",
                            borderRadius: "4px",
                            cursor: "pointer",
                            transition: "background 0.15s",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px"
                          }}
                          onClick={() => {
                            if (item.is_directory) {
                              handleBrowseNavigate(item.path);
                            }
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "#f3f4f6";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "transparent";
                          }}
                        >
                          <span style={{ fontSize: "1.2rem" }}>
                            {item.is_directory ? "📁" : "📄"}
                          </span>
                          <span style={{ flex: 1 }}>{item.name}</span>
                          {item.is_directory && (
                            <button
                              type="button"
                              className="primary-button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleBrowseSelectFolder(item.path);
                              }}
                              style={{ 
                                padding: "4px 12px", 
                                fontSize: "0.85rem" 
                              }}
                            >
                              Kiválasztás
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Aktuális mappa kiválasztása */}
                {browseCurrentPath && (
                  <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid #e5e7eb" }}>
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => handleBrowseSelectFolder(browseCurrentPath)}
                      style={{ width: "100%" }}
                    >
                      ✔ Jelenlegi mappa kiválasztása
                    </button>
                  </div>
                )}
              </>
            )}

            <div className="modal-actions" style={{ marginTop: "16px" }}>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setShowBrowseModal(false)}
              >
                Mégse
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Backup visszaállítás modál */}
      {showBackupModal && (
        <div
          className="modal-backdrop"
          onClick={() => setShowBackupModal(false)}
        >
          <div
            className="modal backup-modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "900px", width: "90%" }}
          >
            <h2>📁 Backup visszaállítás</h2>
            
            {backupLoading && <p>Backupok betöltése...</p>}
            {backupError && <p className="error-text">{backupError}</p>}
            
            {!backupLoading && !backupError && backupList.length === 0 && (
              <p>Nincs elérhető backup ehhez a projekthez.</p>
            )}
            
            {!backupLoading && backupList.length > 0 && (
              <div className="backup-content">
                {/* Backup lista */}
                <div className="backup-list">
                  <table>
                    <thead>
                      <tr>
                        <th>Fájl</th>
                        <th>Dátum/Idő</th>
                        <th>Méret</th>
                      </tr>
                    </thead>
                    <tbody>
                      {backupList.map((backup) => (
                        <tr
                          key={backup.filename}
                          onClick={() => {
                            setSelectedBackup(backup.filename);
                            loadBackupPreview(backup.filename);
                          }}
                          className={selectedBackup === backup.filename ? "selected" : ""}
                        >
                          <td>{backup.original_name}</td>
                          <td>{backup.timestamp_formatted}</td>
                          <td>{(backup.size_bytes / 1024).toFixed(1)} KB</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                {/* Előnézet */}
                <div className="backup-preview">
                  <h4>Előnézet</h4>
                  {selectedBackup && backupPreview !== null ? (
                    <pre>{backupPreview}</pre>
                  ) : (
                    <p className="no-preview">Válassz egy backupot az előnézethez.</p>
                  )}
                </div>
              </div>
            )}
            
            <div className="modal-buttons">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setShowBackupModal(false)}
              >
                Bezárás
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={handleRestoreBackup}
                disabled={!selectedBackup || restoring}
              >
                {restoring ? "Visszaállítás..." : "Visszaállítás"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LLM Settings Modal */}
      {showLLMSettings && (
        <LLMSettings onClose={() => setShowLLMSettings(false)} />
      )}

      {/* Export Dialog Modal */}
      {showExportDialog && (
        <div
          className="modal-overlay"
          onClick={() => setShowExportDialog(false)}
        >
          <div
            className="modal-content export-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>📤 Projekt exportálás</h2>
            <p style={{ color: '#9ca3af', marginBottom: '20px' }}>
              Válaszd ki az export típusát:
            </p>
            
            <div className="export-options">
              <button
                type="button"
                className="export-option-button light"
                onClick={() => {
                  setShowExportDialog(false);
                  handleExportProject("light");
                }}
              >
                <span className="export-icon">⚡</span>
                <span className="export-title">Könnyű export</span>
                <span className="export-desc">Csak forrásfájlok, ~2 MB</span>
                <span className="export-details">Build, DB, binary fájlok nélkül</span>
              </button>
              
              <button
                type="button"
                className="export-option-button full"
                onClick={() => {
                  setShowExportDialog(false);
                  handleExportProject("full");
                }}
              >
                <span className="export-icon">📦</span>
                <span className="export-title">Teljes export</span>
                <span className="export-desc">Minden fájl, ~500+ MB</span>
                <span className="export-details">DB, build fájlok is (lassú)</span>
              </button>
            </div>
            
            <button
              type="button"
              className="secondary-button"
              onClick={() => setShowExportDialog(false)}
              style={{ marginTop: '20px' }}
            >
              Mégse
            </button>
          </div>
        </div>
      )}

      {/* Project Context Menu */}
      {projectContextMenu && (
        <div
          ref={contextMenuRef}
          className="project-context-menu"
          style={{
            left: Math.min(projectContextMenu.x, window.innerWidth - 200),
            top: Math.min(projectContextMenu.y, window.innerHeight - 280),
          }}
          onClick={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="project-context-menu-item"
            onClick={() => {
              setSelectedProjectId(projectContextMenu.projectId);
              setProjectContextMenu(null);
            }}
          >
            📂 Megnyitás
          </button>
          <button
            type="button"
            className="project-context-menu-item"
            onClick={() => {
              const p = projects.find((proj) => proj.id === projectContextMenu.projectId);
              if (p) {
                setProjectModalMode("edit");
                setEditingProjectId(p.id);
                setNewProjectName(p.name);
                setNewProjectDescription(p.description ?? "");
                setNewProjectRootPath(p.root_path ?? "");
                setProjectModalError(null);
                setIsProjectModalOpen(true);
              }
              setProjectContextMenu(null);
            }}
          >
            ✏️ Szerkesztés
          </button>
          <button
            type="button"
            className="project-context-menu-item"
            onClick={() => {
              handleReindexProject(projectContextMenu.projectId);
              setProjectContextMenu(null);
            }}
          >
            🔄 Újraindexelés
          </button>
          <div className="project-context-menu-divider" />
          <button
            type="button"
            className="project-context-menu-item"
            onClick={() => {
              setSelectedProjectId(projectContextMenu.projectId);
              setShowExportDialog(true);
              setProjectContextMenu(null);
            }}
          >
            📤 Exportálás
          </button>
          <button
            type="button"
            className="project-context-menu-item"
            onClick={() => {
              handleImportProject();
              setProjectContextMenu(null);
            }}
          >
            📥 Importálás
          </button>
          <div className="project-context-menu-divider" />
          <button
            type="button"
            className="project-context-menu-item"
            onClick={() => {
              setProjectModalMode("create");
              setEditingProjectId(null);
              setNewProjectName("");
              setNewProjectDescription("");
              setNewProjectRootPath("");
              setProjectModalError(null);
              setIsProjectModalOpen(true);
              setProjectContextMenu(null);
            }}
          >
            ➕ Új projekt
          </button>
          <button
            type="button"
            className="project-context-menu-item danger"
            onClick={() => {
              handleDeleteProject(projectContextMenu.projectId);
              setProjectContextMenu(null);
            }}
          >
            🗑️ Törlés
          </button>
        </div>
      )}

      {/* Scroll to Top/Bottom Buttons */}
      <div className={`scroll-buttons ${showScrollButtons ? 'visible' : ''}`}>
        <button
          type="button"
          className="scroll-button"
          onClick={scrollToTop}
          title="Ugrás a tetejére"
        >
          ⬆️
        </button>
        <button
          type="button"
          className="scroll-button"
          onClick={scrollToBottom}
          title="Ugrás az aljára"
        >
          ⬇️
        </button>
      </div>

      {/* Terminal Panel - Fixed at bottom */}
      {showTerminal && (
        <div className="terminal-panel">
          <div className="terminal-header">
            <span>💻 Terminal</span>
            <span className="terminal-cwd" title="Munkakönyvtár">
              📁 {projects.find(p => p.id === selectedProjectId)?.root_path || 'Nincs projekt'}
            </span>
            <div style={{ flex: 1 }} />
            <button
              type="button"
              className="icon-button"
              onClick={() => setTerminalOutput([])}
              title="Törlés"
            >
              🗑️
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => setShowTerminal(false)}
              title="Bezárás"
            >
              ✕
            </button>
          </div>
          <div className="terminal-output" ref={terminalOutputRef}>
            {terminalOutput.length === 0 && (
              <div className="terminal-hint">
                Írd be a parancsot és nyomj Enter-t...
              </div>
            )}
            {terminalOutput.map((line, i) => (
              <div key={i} className={line.startsWith('[ERROR]') ? 'error' : ''}>
                {line}
              </div>
            ))}
          </div>
          <form 
            className="terminal-input-row"
            onSubmit={(e) => {
              e.preventDefault();
              executeTerminalCommand(terminalInput);
            }}
          >
            <select 
              className="terminal-shell-select"
              value={terminalShellType}
              onChange={(e) => setTerminalShellType(e.target.value as 'powershell' | 'cmd' | 'bash')}
              title="Shell típus"
            >
              <option value="powershell">PowerShell</option>
              <option value="cmd">CMD</option>
              <option value="bash">Bash</option>
            </select>
            <span className="terminal-prompt">{terminalShellType === 'powershell' ? 'PS>' : '$'}</span>
            <input
              type="text"
              value={terminalInput}
              onChange={(e) => setTerminalInput(e.target.value)}
              placeholder="Parancs..."
              className="terminal-input"
              autoFocus
            />
            <button type="submit" className="terminal-run-btn">▶</button>
          </form>
        </div>
      )}

      {/* Context Menu */}
      {contextMenuState.visible && (
        <ContextMenu
          x={contextMenuState.x}
          y={contextMenuState.y}
          items={contextMenuState.items}
          onClose={hideContextMenu}
        />
      )}

      {/* Megerősítő Modal - DEPRECATED - most inline a chatben van! */}
      {false && showConfirmModal && pendingChange && (
        <div className="confirm-modal-overlay" onClick={() => setShowConfirmModal(false)}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{pendingChange.patches.length > 0 ? '🔔 Módosítás megerősítése' : '⚠️ Figyelmeztetés'}</h3>
            <p className="confirm-modal-explanation" style={{ whiteSpace: 'pre-wrap' }}>
              {pendingChange.explanation.length > 500 
                ? pendingChange.explanation.substring(0, 500) + '...' 
                : pendingChange.explanation}
            </p>
            {pendingChange.patches.length > 0 && (
              <div className="confirm-modal-changes">
                <strong>{pendingChange.patches.length} fájl módosítása:</strong>
                <ul>
                  {pendingChange.patches.map((p, i) => (
                    <li key={i}>📄 {p.filePath}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="confirm-modal-buttons">
              <button 
                className="confirm-btn reject"
                onClick={() => {
                  setShowConfirmModal(false);
                  setPendingChange(null);
                  if (pendingChange.patches.length > 0) {
                    addLogMessage("info", "❌ Módosítás elutasítva");
                  }
                }}
              >
                {pendingChange.patches.length > 0 ? '❌ Elutasítás' : '✖ Bezárás'}
              </button>
              {pendingChange.patches.length > 0 && (
                <button 
                  className="confirm-btn accept"
                  onClick={async () => {
                    if (!pendingChange) return;
                    setShowConfirmModal(false);
                    
                    // UGYANAZ a közös applyPatch függvény mint AUTO módban!
                    // MINDIG lemezről töltjük!
                    const results: PatchResult[] = [];
                    for (const patch of pendingChange.patches) {
                      const result = await applyPatch(
                        patch, 
                        selectedProjectId!, 
                        filesTree, 
                        BACKEND_URL
                      );
                      results.push(result);
                      
                      // Ha sikeres és ez az aktuális fájl, frissítsük az editort
                      if (result.success && result.newContent) {
                        const isCurrentFile = result.resolvedPath?.toLowerCase() === selectedFilePath?.toLowerCase();
                        if (isCurrentFile) {
                          setCode(result.newContent);
                        }
                      }
                    }
                    
                    // Összefoglaló chat üzenet hozzáadása
                    const summaryText = formatPatchSummary(results, pendingChange.patches, false);
                    setChatMessages((prev) => [
                      ...prev,
                      {
                        id: generateUniqueId(),
                        role: "system",
                        text: summaryText,
                      },
                    ]);
                    
                    // Log üzenetek
                    const successCount = results.filter(r => r.success).length;
                    const failedCount = results.filter(r => !r.success).length;
                    
                    if (successCount > 0) {
                      addLogMessage("success", `🎉 ${successCount}/${pendingChange.patches.length} módosítás alkalmazva!`);
                    }
                    
                    if (failedCount > 0) {
                      results.forEach((result, i) => {
                        if (!result.success) {
                          addLogMessage("warning", `⚠️ ${result.error}: ${result.resolvedPath || pendingChange.patches[i].filePath}`);
                        }
                      });
                    }
                    
                    setPendingChange(null);
                  }}
                >
                  ✅ Megerősítés
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Diff Viewer Modal - Fájl módosítások megtekintése */}
      {showDiffViewer && diffViewData && (
        <div 
          className="modal-backdrop"
          onClick={() => setShowDiffViewer(false)}
        >
          <div 
            className="diff-viewer-modal"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sticky fejléc: navigáció + címsor */}
            <div className="diff-viewer-sticky-header">
              {/* Fájl navigáció - ha több módosítás van */}
              {allDiffModifications.length > 1 && (
                <div className="diff-file-nav">
                  <button
                    type="button"
                    className="diff-file-nav-btn"
                    onClick={() => {
                      const prevIndex = currentDiffModIndex === 0 
                        ? allDiffModifications.length - 1 
                        : currentDiffModIndex - 1;
                      const prevMod = allDiffModifications[prevIndex];
                      setCurrentDiffModIndex(prevIndex);
                      setDiffViewData({
                        path: prevMod.path,
                        before: prevMod.before_content || '',
                        after: prevMod.after_content || '',
                        linesAdded: prevMod.lines_added,
                        linesDeleted: prevMod.lines_deleted,
                      });
                    }}
                    title="Előző változtatás"
                  >
                    ⬆️ Előző
                  </button>
                  <span className="diff-file-nav-counter">
                    {currentDiffModIndex + 1} / {allDiffModifications.length} változás
                  </span>
                  <button
                    type="button"
                    className="diff-file-nav-btn"
                    onClick={() => {
                      const nextIndex = (currentDiffModIndex + 1) % allDiffModifications.length;
                      const nextMod = allDiffModifications[nextIndex];
                      setCurrentDiffModIndex(nextIndex);
                      setDiffViewData({
                        path: nextMod.path,
                        before: nextMod.before_content || '',
                        after: nextMod.after_content || '',
                        linesAdded: nextMod.lines_added,
                        linesDeleted: nextMod.lines_deleted,
                      });
                    }}
                    title="Következő változtatás"
                  >
                    Következő ⬇️
                  </button>
                </div>
              )}
              
              {/* Fájl címsor és statisztikák */}
              <div className="diff-viewer-header">
                <h3>📊 Változások: {diffViewData.path}</h3>
                <div className="diff-stats">
                  <span className="diff-stat added">+{diffViewData.linesAdded} sor hozzáadva</span>
                  <span className="diff-stat deleted">-{diffViewData.linesDeleted} sor törölve</span>
                </div>
                <button 
                  type="button"
                  className="modal-close"
                  onClick={() => setShowDiffViewer(false)}
                >
                  ✕
                </button>
              </div>
            </div>
            
            <div className="diff-viewer-content">
              <DiffViewer 
                before={diffViewData.before} 
                after={diffViewData.after}
              />
            </div>
            <div className="diff-viewer-footer">
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  handleChatFileClick(diffViewData.path);
                  setShowDiffViewer(false);
                }}
              >
                📄 Fájl megnyitása
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setShowDiffViewer(false)}
              >
                Bezárás
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
