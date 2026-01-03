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
} from "./types/index";
import { detectCodeLanguage, extractFirstCodeBlock, extractAllCodeBlocks } from "./utils/codeUtils";
import { checkPLISyntax, type SyntaxError } from "./utils/pliSyntaxChecker";
import { 
  sanitizeRawPath, 
  normalizeFileName, 
  findPathInTreeByName, 
  resolveRelPathFromChat,
  sanitizeFileRef 
} from "./utils/fileUtils";
import { 
  applyEditorSettings, 
  defaultEditorSettings 
} from "./utils/editorUtils";
import { useWebSocketSync, setWebSocketEnabled } from "./utils/useWebSocketSync";
import { ProjectsList } from "./components/ProjectsList";
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
    return parsed;
  } catch {
    return [];
  }
}

function saveProjectChat(projectId: number, messages: ChatMessage[]): void {
  const key = `projectChat_${projectId}`;
  try {
    localStorage.setItem(key, JSON.stringify(messages));
  } catch {
    // ignore
  }
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

// ===== KÃ“DSZERKESZTŐ + DIFF =====

interface CodeEditorProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  settings: EditorSettings;
  scrollToLine?: number | null;
  filePath?: string | null; // Fájl útvonal a típus meghatározáshoz
}

const CodeEditor: React.FC<CodeEditorProps> = ({
  value,
  onChange,
  placeholder,
  settings,
  scrollToLine,
  filePath,
}) => {
  // MINDEN HOOK ELŐBB, UTÁNA A CONDITIONÁLIS RETURN!
  const gutterRef = React.useRef<HTMLDivElement | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const highlightRef = React.useRef<HTMLDivElement | null>(null);
  
  // Ellenőrizzük hogy színezhető fájl-e (kiterjesztés VAGY tartalom alapján)
  const shouldHighlight = React.useMemo(() => {
    // Mindig színezzük ha van tartalom
    if (value && value.trim().length > 0) {
      return true;
    }
    return false;
  }, [value]);

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

  // Syntax hibák
  const [syntaxErrors, setSyntaxErrors] = React.useState<SyntaxError[]>([]);
  
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

  // Megerősítő Modal (Normal módhoz)
  const [showConfirmModal, setShowConfirmModal] = React.useState(false);
  const [pendingChange, setPendingChange] = React.useState<{
    patches: SuggestedPatch[];
    explanation: string;
    terminalCommands?: string[];
  } | null>(null);

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

  // Syntax validálás
  const handleValidateSyntax = React.useCallback(() => {
    if (!code || code.trim().length === 0) {
      setSyntaxErrors([]);
      setValidatedCodeHash(null);
      addLogMessage("info", "Nincs kód a validáláshoz");
      return;
    }
    
    addLogMessage("info", "Szintaxis ellenőrzés indítása...");
    const errors = checkPLISyntax(code);
    setSyntaxErrors(errors);
    
    // Tároljuk a validált kód hash-ét
    const codeHash = getCodeHash(code);
    setValidatedCodeHash(codeHash);
    
    if (errors.length === 0) {
      addLogMessage("success", "✅ Nincs szintaxis hiba!");
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
        setCode(data.fixed_code);
        addLogMessage("success", `✅ Hiba javítva: ${error.line}. sor`);
        
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
      setCode(currentCode);
      addLogMessage("success", `✅ ${fixedCount} hiba javítva`);
      
      // Újravalidálás
      const newErrors = checkPLISyntax(currentCode);
      setSyntaxErrors(newErrors);
      
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
      const resp = await fetch(`${BACKEND_URL}/projects/${projectId}/file?path=${encodeURIComponent(filePath)}`);
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
        onClick: () => {
          if (hasSelection) {
            navigator.clipboard.writeText(selection);
            addLogMessage("success", "Kód másolva a vágólapra");
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
      
      // Frissítsük a kódot ha a visszaállított fájl az aktuálisan megnyitott
      const backupInfo = backupList.find(b => b.filename === selectedBackup);
      const restoredPath = data.restored_to; // A backend visszaadja hova lett visszaállítva
      
      // Ellenőrzés: a fájlnév megegyezik-e (a teljes útvonal végén)
      const selectedFileName = selectedFilePath ? selectedFilePath.split('/').pop() : '';
      const backupFileName = backupInfo?.original_name?.replace(' (agentic)', '') || '';
      
      if (selectedFilePath && (selectedFileName === backupFileName || selectedFilePath.endsWith(backupFileName))) {
        // Reload the file
        const fileRes = await fetch(
          `${BACKEND_URL}/projects/${selectedProjectId}/file?rel_path=${encodeURIComponent(selectedFilePath)}&encoding=${encoding}`
        );
        if (fileRes.ok) {
          const fileData = await fileRes.json();
          setCode(fileData.content);
          addLogMessage("success", `✅ Fájl újratöltve: ${selectedFilePath}`);
        }
      }
      
      // Fájl lista frissítése is
      loadProjectFiles();
      
      alert(`Backup sikeresen visszaállítva: ${restoredPath || data.restored_to}`);
      setShowBackupModal(false);
    } catch (err: any) {
      console.error("[RESTORE] Hiba:", err);
      alert(`Hiba a visszaállítás során: ${err.message}`);
    } finally {
      setRestoring(false);
    }
  }, [selectedProjectId, selectedBackup, encoding, backupList, selectedFilePath]);

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

  // Chat state - localStorage-ból töltjük be ha van
  const [chatMessages, setChatMessages] = React.useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('chat_history');
      if (saved) {
        const parsed = JSON.parse(saved);
        console.log(`[CHAT] ${parsed.length} üzenet betöltve localStorage-ból`);
        return parsed;
      }
    } catch (e) {
      console.error('[CHAT] localStorage hiba:', e);
    }
    return [];
  });
  // chatInput és setChatInput már korábban definiálva (context menük miatt)
  const [chatLoading, setChatLoading] = React.useState(false);
  const [chatError, setChatError] = React.useState<string | null>(null);

  // Chat history mentése localStorage-ba amikor változik
  React.useEffect(() => {
    if (chatMessages.length > 0) {
      try {
        // Max 100 üzenetet tárolunk
        const toSave = chatMessages.slice(-100);
        localStorage.setItem('chat_history', JSON.stringify(toSave));
      } catch (e) {
        console.error('[CHAT] localStorage mentési hiba:', e);
      }
    }
  }, [chatMessages]);

  // ===== WEBSOCKET SYNC - Real-time szinkronizáció PC és mobil között =====
  const {
    isConnected: wsConnected,
    connectedClients,
    sendChatMessage: wsSendChat,
    sendLogMessage: wsSendLog,
    sendFileChange: wsSendFileChange,
    joinProject: wsJoinProject,
  } = useWebSocketSync({
    enabled: true, // Mindig aktív
    onChatMessage: React.useCallback((msg: ChatMessage) => {
      // Távoli chat üzenet érkezett - hozzáadjuk ha nincs még
      console.log('[WS] Chat üzenet érkezett:', msg);
      setChatMessages(prev => {
        if (prev.some(m => m.id === msg.id)) {
          console.log('[WS] Chat üzenet már létezik, kihagyva:', msg.id);
          return prev;
        }
        console.log('[WS] Új chat üzenet hozzáadva:', msg.id);
        const updated = [...prev, msg];
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
          let newCount = 0;
          for (const msg of state.chat_messages) {
            if (!merged.some(m => m.id === msg.id)) {
              merged.push(msg);
              newCount++;
            }
          }
          console.log(`[WS] ${newCount} új üzenet összefésülve, összesen: ${merged.length}`);
          // Rendezés id (timestamp) szerint
          merged.sort((a, b) => a.id - b.id);
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

  // Projekt szobához csatlakozás amikor projektet váltunk
  React.useEffect(() => {
    if (selectedProjectId && wsConnected) {
      wsJoinProject(selectedProjectId);
    }
  }, [selectedProjectId, wsConnected, wsJoinProject]);

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

  // --- LLM kódból javaslat létrehozása ---

  // Segédfüggvény: egyetlen kódblokkból javaslat létrehozása
  function createSuggestionFromCodeBlock(suggestedCode: string, blockIndex: number, totalBlocks: number): CodeSuggestion | null {

    // DEBUG: Ellenőrizzük a code állapotot
    console.log(`[CREATE #${blockIndex + 1}/${totalBlocks}] code state hossza: ${code.length} karakter, ${code.split("\n").length} sor`);
    console.log(`[CREATE #${blockIndex + 1}/${totalBlocks}] selectedFilePath: ${selectedFilePath}`);
    
    // ELLENŐRZÃ‰S: A javasolt kód már benne van-e a fájlban?
    const normalizeForCompare = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
    const suggestedNorm = normalizeForCompare(suggestedCode);
    const codeNorm = normalizeForCompare(code);
    
    // Ha a teljes javasolt kód megtalálható a jelenlegi kódban, már alkalmazva van
    if (codeNorm.includes(suggestedNorm)) {
      console.log(`[CREATE #${blockIndex + 1}/${totalBlocks}] A javasolt kód már benne van a fájlban - kihagyva`);
      return null;
    }
    
    // További ellenőrzés: csak akkor tiltjuk le, ha a javasolt kód legalább 90%-a megtalálható
    // (Csak részleges egyezés esetén nem tiltjuk le - a felhasználó láthassa a javaslatot)
    const suggestedLines_check = suggestedCode.trim().split("\n").filter(l => l.trim().length > 0);
    if (suggestedLines_check.length >= 5) {
      const codeLines_check = code.split("\n").filter(l => l.trim().length > 0);
      
      // Keresünk egy olyan pozíciót a kódban, ahol a javasolt kód nagy része megtalálható
      let maxMatchCount = 0;
      for (let startIdx = 0; startIdx < codeLines_check.length; startIdx++) {
        let matchCount = 0;
        for (let j = 0; j < suggestedLines_check.length && startIdx + j < codeLines_check.length; j++) {
          if (normalizeForCompare(codeLines_check[startIdx + j]) === normalizeForCompare(suggestedLines_check[j])) {
            matchCount++;
          }
        }
        if (matchCount > maxMatchCount) {
          maxMatchCount = matchCount;
        }
      }
      
      // Ha a javasolt kód legalább 90%-a megtalálható, akkor már alkalmazva van
      const matchPercentage = (maxMatchCount / suggestedLines_check.length) * 100;
      if (matchPercentage >= 90) {
        console.log(`[CREATE #${blockIndex + 1}/${totalBlocks}] A javasolt kód ${Math.round(matchPercentage)}%-a megtalálható - kihagyva`);
        return null;
      }
    }

    // Intelligens snippet keresés - több sor összehasonlítással
    const suggestedLines = suggestedCode.trim().split("\n");
    const codeLines = code.split("\n");
    const MAX_MATCHES = 20; // Több találatot engedünk, a felhasználó választ
    
    // Normalizáló függvény - whitespace eltávolítása az összehasonlításhoz
    const normalize = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
    
    // Debug: mutassuk az első néhány sort
    console.log("[DEBUG] Keresett kód első 3 sora:");
    suggestedLines.slice(0, 3).forEach((line, i) => {
      console.log(`  ${i + 1}: "${normalize(line)}"`);
    });
    
    // Ha a javasolt kód legalább 70%-a az eredetinek, teljes cserét feltételezünk
    const isFullReplacement = suggestedLines.length >= codeLines.length * 0.7;
    
    let originalSnippet: string;
    let finalSuggestedSnippet: string;
    let matchPositions: number[] = [];
    
    if (isFullReplacement || code.trim() === "") {
      // Teljes fájl csere
      originalSnippet = code;
      finalSuggestedSnippet = suggestedCode;
      matchPositions = [0];
    } else {
      // Snippet mód - SZIGORÃš keresés több sor alapján
      
      // Számítsuk ki hány sornyi egyezést várunk el minimum
      const minMatchLines = Math.min(5, suggestedLines.length);
      
      // Stratégia 1: Több sor pontos egyezése (legalább 5 vagy az összes sor)
      if (suggestedLines.length >= 2) {
        const matchPattern = suggestedLines.slice(0, minMatchLines).map(l => normalize(l));
        
        // Debug: nézzük meg hol van hasonló az első sor
        const firstLineNorm = matchPattern[0];
        let similarCount = 0;
        for (let i = 0; i < codeLines.length; i++) {
          const codeLine = normalize(codeLines[i]);
          if (codeLine === firstLineNorm) {
            console.log(`[DEBUG] Első sor egyezés a ${i + 1}. sorban`);
            similarCount++;
          }
        }
        if (similarCount > 1) {
          console.log(`[DEBUG] Az első sor ${similarCount}x szerepel a fájlban!`);
        }
        
        for (let i = 0; i < codeLines.length - minMatchLines + 1 && matchPositions.length < MAX_MATCHES; i++) {
          let allMatch = true;
          let mismatchInfo = "";
          for (let j = 0; j < minMatchLines; j++) {
            if (normalize(codeLines[i + j]) !== matchPattern[j]) {
              allMatch = false;
              // Ha az első sor egyezik de a többi nem, logolja
              if (j > 0 && normalize(codeLines[i]) === matchPattern[0]) {
                mismatchInfo = `(első sor egyezik de ${j + 1}. sor nem: "${normalize(codeLines[i + j]).substring(0, 40)}..." vs "${matchPattern[j].substring(0, 40)}...")`;
              }
              break;
            }
          }
          if (allMatch) {
            matchPositions.push(i);
            console.log(`[MATCH] ${minMatchLines} soros egyezés a ${i + 1}. sortól`);
          } else if (mismatchInfo) {
            console.log(`[DEBUG] Részleges egyezés a ${i + 1}. sortól ${mismatchInfo}`);
          }
        }
      }
      
      // Stratégia 2: Ha nincs 5 soros egyezés, próbáljuk 3 sorral
      if (matchPositions.length === 0 && suggestedLines.length >= 3) {
        const matchPattern = suggestedLines.slice(0, 3).map(l => normalize(l));
        
        for (let i = 0; i < codeLines.length - 2 && matchPositions.length < MAX_MATCHES; i++) {
          if (normalize(codeLines[i]) === matchPattern[0] &&
              normalize(codeLines[i + 1]) === matchPattern[1] &&
              normalize(codeLines[i + 2]) === matchPattern[2]) {
            matchPositions.push(i);
            console.log(`[MATCH] 3 soros egyezés a ${i + 1}. sortól`);
          }
        }
      }
      
      // Stratégia 3: Pontos első + második sor (ha van egyedi tartalom)
      if (matchPositions.length === 0 && suggestedLines.length >= 2) {
        const first = normalize(suggestedLines[0]);
        const second = normalize(suggestedLines[1]);
        
        // Csak ha elég hosszú és egyedi a tartalom
        if (first.length > 20 && second.length > 10) {
          for (let i = 0; i < codeLines.length - 1 && matchPositions.length < MAX_MATCHES; i++) {
            if (normalize(codeLines[i]) === first && 
                normalize(codeLines[i + 1]) === second) {
              matchPositions.push(i);
              console.log(`[MATCH] 2 soros egyezés a ${i + 1}. sortól`);
            }
          }
        }
      }
      
      // Stratégia 4: Egyedi kulcsszó keresés (pl. változónév, speciális érték)
      if (matchPositions.length === 0) {
        // Keressünk egyedi mintákat a javasolt kódban
        const uniquePatterns: string[] = [];
        for (const line of suggestedLines) {
          // Egyedi értékek keresése (pl. 'BV003108', specifikus számok)
          const matches = line.match(/'[A-Z0-9_]{5,}'|0\.\d{4,}|\d{4,}/g);
          if (matches) {
            uniquePatterns.push(...matches);
          }
        }
        
        if (uniquePatterns.length > 0) {
          // Keressük ezeket a mintákat a kódban
          const firstUnique = uniquePatterns[0];
          for (let i = 0; i < codeLines.length && matchPositions.length < MAX_MATCHES; i++) {
            if (codeLines[i].includes(firstUnique)) {
              // Ellenőrizzük, hogy a környező sorok is egyeznek-e
              const first = normalize(suggestedLines[0]);
              if (normalize(codeLines[i]).includes(first.substring(0, 30))) {
                matchPositions.push(i);
                console.log(`[MATCH] Egyedi minta (${firstUnique}) a ${i + 1}. sorban`);
              }
            }
          }
        }
      }
      
      // Stratégia 5: Első sor pontos egyezés (fallback)
      if (matchPositions.length === 0) {
        const first = normalize(suggestedLines[0]);
        if (first.length > 30) {
          for (let i = 0; i < codeLines.length && matchPositions.length < MAX_MATCHES; i++) {
            if (normalize(codeLines[i]) === first) {
              matchPositions.push(i);
              console.log(`[MATCH] Első sor pontos egyezés a ${i + 1}. sorban`);
            }
          }
        }
      }
      
      // Stratégia 6: Részleges egyezés - az első sor 60%-a egyezik
      if (matchPositions.length === 0) {
        const first = normalize(suggestedLines[0]);
        if (first.length > 20) {
          const searchLen = Math.floor(first.length * 0.6);
          const searchPart = first.substring(0, searchLen);
          for (let i = 0; i < codeLines.length && matchPositions.length < MAX_MATCHES; i++) {
            if (normalize(codeLines[i]).startsWith(searchPart)) {
              matchPositions.push(i);
              console.log(`[MATCH] Részleges (60%) egyezés a ${i + 1}. sorban`);
            }
          }
        }
      }
      
      if (matchPositions.length > 0) {
        // Rendezzük a találatokat sorrend szerint
        matchPositions.sort((a, b) => a - b);
        
        // Találtunk pozíció(ka)t - az elsőt használjuk alapból
        const foundStart = matchPositions[0];
        const endIdx = Math.min(foundStart + suggestedLines.length, codeLines.length);
        originalSnippet = codeLines.slice(foundStart, endIdx).join("\n");
        finalSuggestedSnippet = suggestedCode;
        
        // Részletes log az összes találatról
        console.log(`[INFO] Javaslat pozíciója: ${foundStart + 1}. sor (${matchPositions.length} találat összesen)`);
        if (matchPositions.length > 1) {
          console.log(`[INFO] Ã–sszes találat sorrenben: ${matchPositions.map(p => p + 1).join(", ")}. sor`);
          console.log(`[INFO] ▶ Használd a "Következő" gombot a többi találat megtekintéséhez!`);
        }
      } else {
        // Nem találtuk - új kód beszúrás a végére
        console.log("[INFO] Nem található egyező kódrészlet, beszúrás a végére");
        
        let insertPoint = codeLines.length;
        // Próbáljuk megtalálni az utolsó END; előtti pozíciót
        for (let i = codeLines.length - 1; i >= 0; i--) {
          const trimmed = codeLines[i].trim().toUpperCase();
          if (trimmed === "END;" || trimmed === "END") {
            insertPoint = i;
            break;
          }
        }
        
        matchPositions = [insertPoint];
        
        if (insertPoint < codeLines.length) {
          originalSnippet = codeLines[insertPoint];
          finalSuggestedSnippet = suggestedCode + "\n" + codeLines[insertPoint];
        } else {
          originalSnippet = "/* --- Ãšj kód beszúrása --- */";
          finalSuggestedSnippet = suggestedCode;
        }
      }
    }
    
    // Ãšj javaslat létrehozása
    const newSuggestion: CodeSuggestion = {
      id: `suggestion_${Date.now()}_${blockIndex}`,
      filePath: selectedFilePath || "aktuális kód",
      fullCode: code,
      originalSnippet: originalSnippet,
      suggestedSnippet: finalSuggestedSnippet,
      description: isFullReplacement 
        ? `Teljes kód csere (${blockIndex + 1}/${totalBlocks})` 
        : matchPositions.length > 1 
          ? `Kódrészlet módosítás (${matchPositions.length} találat) (${blockIndex + 1}/${totalBlocks})`
          : `Kódrészlet módosítás (${blockIndex + 1}/${totalBlocks})`,
      applied: false,
      matchPositions: matchPositions,
      selectedPosition: 0,
    };

    return newSuggestion;
  }

  // Fő függvény: minden kódblokkot feldolgoz az LLM válaszából
  function createSuggestionFromLastAssistant() {
    // utolsó asszisztens üzenet keresése
    const lastAssistant = [...chatMessages]
      .reverse()
      .find((m) => m.role === "assistant");

    if (!lastAssistant) {
      alert("Nincs asszisztens válasz, amiből javaslatot lehetne létrehozni.");
      return;
    }

    // Ã–sszes kódblokk kinyerése
    const codeBlocks = extractAllCodeBlocks(lastAssistant.text);
    if (codeBlocks.length === 0) {
      alert(
        "Az utolsó asszisztens válaszban nem találtam kódot.\n\n" +
        "Kérd meg az LLM-et, hogy adjon konkrét kódot, például:\n" +
        "\"Írd meg a módosított kódot egy kódblokkban.\""
      );
      return;
    }

    console.log(`[CREATE] ${codeBlocks.length} kódblokk találva az LLM válaszában`);

    // Minden kódblokkból javaslat létrehozása
    const newSuggestions: CodeSuggestion[] = [];
    for (let i = 0; i < codeBlocks.length; i++) {
      const suggestion = createSuggestionFromCodeBlock(codeBlocks[i], i, codeBlocks.length);
      if (suggestion) {
        newSuggestions.push(suggestion);
      }
    }

    if (newSuggestions.length === 0) {
      alert("Az összes kódblokk már benne van a fájlban, vagy nem hozható létre javaslat belőlük.");
      return;
    }

    // Hozzáadás a javaslatok listájához
    setSuggestions(prev => [...prev, ...newSuggestions]);
    setCurrentSuggestionIndex(suggestions.length); // Az első új javaslatra ugrunk
    setActiveTab("code"); // ha mobilon vagy, ugorjon a Kód fülre

    // Tájékoztatás a felhasználónak
    if (newSuggestions.length > 1) {
      addLogMessage("info", `✅ ${newSuggestions.length} javaslat létrehozva. Használd a ◀ ▶ gombokat a navigációhoz.`);
    } else {
      addLogMessage("info", `✅ 1 javaslat létrehozva.`);
    }
  }

  // Legacy alias
  const applyLastAssistantCodeToProjected = createSuggestionFromLastAssistant;

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
      console.log(`[LOAD] Első sor: "${data.content.split("\n")[0]?.substring(0, 80)}..."`);

      setSelectedFilePath(data.path);

      // NE alkalmazzuk a maxLines-t a fő kódra - az eredeti tartalmat tároljuk!
      console.log(`[LOAD] maxLines beállítás: ${sourceSettings.maxLines} (ignorálva a fő kódnál)`);
      
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



	function renderAssistantMessage(text: string): React.ReactNode {
	  // Elfogad:
	  // [FILE: valami\útvonal | chunk #12]
	  // (FILE: valami/útvonal | chunk #0)
	  const regex = /[\[\(]FILE:\s*([^|\]\)]+)(?:[^\]\)]*)[\]\)]/g;

	  const nodes: React.ReactNode[] = [];
	  let lastIndex = 0;
	  let match: RegExpExecArray | null;

	  while ((match = regex.exec(text)) !== null) {
		if (match.index > lastIndex) {
		  nodes.push(text.slice(lastIndex, match.index));
		}

		const rawPath = match[1].trim();
		const filePath = rawPath.replace(/\\/g, "/");

		nodes.push(
		  <button
			key={`${filePath}-${match.index}`}
			className="chat-file-link"
			onClick={(e) => {
			  e.stopPropagation();
			  handleChatFileClick(filePath);
			}}
		  >
			{`[FILE: ${filePath}]`}
		  </button>
		);

		lastIndex = regex.lastIndex;
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
      id: Date.now(),
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
		const history = [...chatMessages, newUserMsg].map(m => ({ role: m.role, text: m.text }));

		const resp = await fetch(`${BACKEND_URL}/chat`, {
		  method: "POST",
		  headers: { "Content-Type": "application/json" },
		  body: JSON.stringify({
			message: text,
			project_id: selectedProjectId,
			source_code: sourceCode,
			projected_code: projectedCode,
			history,
			session_id: sessionId, // Session tracking for Smart Context
			auto_mode: autoMode, // Ha True, automatikus végrehajtás backup-pal
		  }),
		});

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
        had_errors?: boolean;
        retry_attempted?: boolean;
      } = await resp.json();
      const replyText = data.reply;

      const assistantMsg: ChatMessage = {
        id: Date.now() + 1,
        role: "assistant",
        text: replyText,
      };

      setChatMessages((prev) => [...prev, assistantMsg]);
      
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
        
        if (hasDestructiveChange && autoMode) {
          addLogMessage("error", "🛑 **Veszélyes módosítás blokkolva!** A javaslat túl nagy része a fájlnak. Ellenőrizd kézzel!");
          setSuggestedPatches((prev) => [...prev, ...newPatches]);
        } else if (autoMode) {
          // AUTO MÓD: AUTOMATIKUS alkalmazás MINDEN fájlra
          let appliedCount = 0;
          let failedCount = 0;
          let currentEditorCode = code;
          
          for (const patch of newPatches) {
            const patchFileName = patch.filePath.split('/').pop()?.toLowerCase();
            const currentFileName = selectedFilePath?.split('/').pop()?.toLowerCase();
            const isCurrentFile = patchFileName === currentFileName;
            
            try {
              // 1. Először betöltjük a cél fájlt a backend-ről
              const loadRes = await fetch(`${BACKEND_URL}/projects/${selectedProjectId}/file?path=${encodeURIComponent(patch.filePath)}`);
              
              if (!loadRes.ok) {
                addLogMessage("error", `❌ Nem található: ${patch.filePath}`);
                failedCount++;
                continue;
              }
              
              const loadData = await loadRes.json();
              let fileContent = loadData.content || "";
              
              // 2. Ellenőrizzük és alkalmazzuk a patch-et
              if (fileContent.includes(patch.original)) {
                const occurrences = fileContent.split(patch.original).length - 1;
                if (occurrences === 1) {
                  fileContent = fileContent.replace(patch.original, patch.modified);
                  
                  // 3. Mentés a backend-re
                  const saveRes = await fetch(`${BACKEND_URL}/projects/${selectedProjectId}/file/save`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      path: patch.filePath,
                      content: fileContent,
                      encoding: "utf-8",
                    }),
                  });
                  
                  if (saveRes.ok) {
                    appliedCount++;
                    addLogMessage("success", `✅ Alkalmazva: ${patch.filePath}`);
                    
                    // Ha a jelenleg megnyitott fájl, frissítsük az editort is
                    if (isCurrentFile) {
                      currentEditorCode = fileContent;
                    }
                  } else {
                    failedCount++;
                    addLogMessage("error", `❌ Mentési hiba: ${patch.filePath}`);
                  }
                } else {
                  addLogMessage("warning", `⚠️ Többszörös egyezés (${occurrences}x) - ${patch.filePath}`);
                  failedCount++;
                }
              } else if (fileContent.includes(patch.original.trim())) {
                // Whitespace-toleráns
                fileContent = fileContent.replace(patch.original.trim(), patch.modified.trim());
                
                const saveRes = await fetch(`${BACKEND_URL}/projects/${selectedProjectId}/file/save`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    path: patch.filePath,
                    content: fileContent,
                    encoding: "utf-8",
                  }),
                });
                
                if (saveRes.ok) {
                  appliedCount++;
                  addLogMessage("info", `✅ Alkalmazva (whitespace-toleráns): ${patch.filePath}`);
                  if (isCurrentFile) {
                    currentEditorCode = fileContent;
                  }
                } else {
                  failedCount++;
                }
              } else {
                failedCount++;
                addLogMessage("warning", `⚠️ Eredeti kód nem található: ${patch.filePath}`);
                console.log("[AUTO MODE] Keresett:", patch.original.substring(0, 100));
              }
            } catch (err) {
              console.error("[AUTO MODE] Hiba:", err);
              failedCount++;
              addLogMessage("error", `❌ Hiba: ${patch.filePath}`);
            }
          }
          
          // Frissítsük az editort ha változott
          if (currentEditorCode !== code) {
            setCode(currentEditorCode);
          }
          
          if (appliedCount > 0) {
            addLogMessage("success", `🎉 **${appliedCount}/${newPatches.length}** módosítás automatikusan alkalmazva!`);
          }
          
          if (failedCount > 0) {
            const failedPatches = newPatches.slice(appliedCount);
            if (failedPatches.length > 0) {
              setSuggestedPatches((prev) => [...prev, ...failedPatches]);
            }
          }
        } else {
          // MANUAL MÓD: Modal ablak megerősítésre
          setPendingChange({
            patches: newPatches,
            explanation: replyText.substring(0, 500), // Első 500 karakter magyarázatként
          });
          setShowConfirmModal(true);
          addLogMessage("info", `🔔 **${newPatches.length} módosítás** vár megerősítésre`);
        }
      }
      
      // Ha nincs patch, de az LLM engedélyt kér - figyelmeztetés + modal
      if (newPatches.length === 0) {
        const isAskingPermission = /engedély|engedélyez|szeretnéd|módosítsam|válaszolj.*igen|kérlek.*ok/i.test(replyText);
        const permissionMatch = replyText.match(/\[PERMISSION_REQUEST\]/i);
        
        if (isAskingPermission || permissionMatch) {
          // Modal megjelenítése figyelmeztetéssel
          setPendingChange({
            patches: [],
            explanation: `⚠️ Az LLM engedélyt kér konkrét kód helyett!\n\n${replyText.substring(0, 400)}...\n\n💡 Tipp: Küldj konkrétabb kérést a @fájlnév szintaxissal, pl:\n"@static/js/game.js javítsd a hiányzó változókat"`,
          });
          setShowConfirmModal(true);
          addLogMessage("warning", "⚠️ Az LLM engedélyt kér - használd a @fájlnév szintaxist!");
        }
      }
    } catch (err) {
      console.error(err);
      setChatError("Hiba történt a chat hívás közben.");
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

  function handleChatSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!chatLoading) {
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
            className="menu-button"
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
            onClick={() => setAutoMode(prev => !prev)}
            title={autoMode ? "Auto mód bekapcsolva - változások automatikusan alkalmazva és mentve" : "Auto mód kikapcsolva"}
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
                    {/* Validálás gomb */}
                      <button
                        type="button"
                        className={`secondary-button ${isValidated ? "validate" : "validate-pending"}`}
                        onClick={handleValidateSyntax}
                        title={isValidated ? "Kód validálva - nincs változtatás" : "PL/I szintaxis ellenőrzése"}
                      >
                        ✔ Validálás
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
                  </div>
                </div>

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
                  <button
                    type="button"
                    className="secondary-button suggestion"
                    onClick={createSuggestionFromLastAssistant}
                    disabled={
                      !chatMessages.some((m) => m.role === "assistant")
                    }
                    title="Az utolsó asszisztens-kódból új javaslat létrehozása"
                  >
                    ➕ Javaslat
                  </button>

                  {chatLoading && <span>Gondolkodom…</span>}
                  {chatError && (
                    <span className="projects-error">{chatError}</span>
                  )}
                </div>
              </div>

              {/* Javasolt módosítások listája */}
              {suggestedPatches.length > 0 && (
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
                    className="chat-message"
                    style={{
                      marginBottom: "6px",
                      textAlign: m.role === "user" ? "right" : "left",
                    }}
                    onContextMenu={(e) => handleChatMessageContextMenu(e, m)}
                  >
                    <div
                      style={{
                        display: "inline-block",
                        padding: "6px 10px",
                        borderRadius: 10,
                        background:
                          m.role === "user" ? "#e5e7eb" : "#dcfce7",
                        fontSize: "0.9rem",
                        maxWidth: "80%",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        overflowWrap: "break-word",
                      }}
                    >
                      {m.role === "assistant"
                        ? renderAssistantMessage(m.text)
                        : m.text}
                    </div>
                  </div>
                ))}
              </div>

              <form className="chat-input-row" onSubmit={handleChatSubmit}>
                <textarea
                  className="chat-input"
                  placeholder="Írj az LLM-nek… | @fájl.js betölti a fájlt | Alt+Enter: új sor"
                  autoComplete="off"
                  value={chatInput}
                  onChange={(e) => {
                    setChatInput(e.target.value);
                    // Auto-expand
                    e.target.style.height = 'auto';
                    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
                  }}
                  onKeyDown={(e) => {
                    // Alt+Enter vagy Ctrl+Enter: új sor beszúrása (alapértelmezett viselkedés)
                    if ((e.altKey || e.ctrlKey) && e.key === "Enter") {
                      return; // Engedjük az új sor beszúrását
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
                  rows={1}
                  style={{
                    resize: "none",
                    minHeight: "48px",
                    maxHeight: "200px",
                    overflow: "auto",
                  }}
                />
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
              <div className="backup-content" style={{ display: "flex", gap: "20px" }}>
                {/* Backup lista */}
                <div className="backup-list" style={{ flex: "1", maxHeight: "400px", overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "2px solid #ddd", textAlign: "left" }}>
                        <th style={{ padding: "8px" }}>Fájl</th>
                        <th style={{ padding: "8px" }}>Dátum/Idő</th>
                        <th style={{ padding: "8px" }}>Méret</th>
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
                          style={{
                            cursor: "pointer",
                            backgroundColor: selectedBackup === backup.filename ? "#e3f2fd" : "transparent",
                            borderBottom: "1px solid #eee",
                          }}
                        >
                          <td style={{ padding: "8px", fontFamily: "monospace", fontSize: "0.9em" }}>
                            {backup.original_name}
                          </td>
                          <td style={{ padding: "8px", whiteSpace: "nowrap" }}>
                            {backup.timestamp_formatted}
                          </td>
                          <td style={{ padding: "8px", whiteSpace: "nowrap" }}>
                            {(backup.size_bytes / 1024).toFixed(1)} KB
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                {/* Előnézet */}
                <div className="backup-preview" style={{ flex: "1", maxHeight: "400px", overflowY: "auto" }}>
                  <h4 style={{ margin: "0 0 10px 0" }}>Előnézet</h4>
                  {selectedBackup && backupPreview !== null ? (
                    <pre style={{
                      backgroundColor: "#f5f5f5",
                      padding: "10px",
                      borderRadius: "4px",
                      fontSize: "0.8em",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      maxHeight: "350px",
                      overflow: "auto",
                    }}>
                      {backupPreview}
                    </pre>
                  ) : (
                    <p style={{ color: "#666" }}>Válassz egy backupot az előnézethez.</p>
                  )}
                </div>
              </div>
            )}
            
            <div className="modal-buttons" style={{ marginTop: "20px" }}>
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

      {/* Megerősítő Modal - Normal módhoz */}
      {showConfirmModal && pendingChange && (
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
                  
                  // Alkalmazzuk a módosításokat
                  let appliedCount = 0;
                  for (const patch of pendingChange.patches) {
                    try {
                      const loadRes = await fetch(`${BACKEND_URL}/projects/${selectedProjectId}/file?path=${encodeURIComponent(patch.filePath)}`);
                      if (!loadRes.ok) {
                        addLogMessage("error", `❌ Nem található: ${patch.filePath}`);
                        continue;
                      }
                      const loadData = await loadRes.json();
                      let fileContent = loadData.content || "";
                      
                      if (fileContent.includes(patch.original) || fileContent.includes(patch.original.trim())) {
                        const searchStr = fileContent.includes(patch.original) ? patch.original : patch.original.trim();
                        const replaceStr = fileContent.includes(patch.original) ? patch.modified : patch.modified.trim();
                        fileContent = fileContent.replace(searchStr, replaceStr);
                        
                        const saveRes = await fetch(`${BACKEND_URL}/projects/${selectedProjectId}/file/save`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            path: patch.filePath,
                            content: fileContent,
                            encoding: "utf-8",
                          }),
                        });
                        
                        if (saveRes.ok) {
                          appliedCount++;
                          addLogMessage("success", `✅ Alkalmazva: ${patch.filePath}`);
                          
                          // Frissítsük az editort ha ez a megnyitott fájl
                          const patchFileName = patch.filePath.split('/').pop()?.toLowerCase();
                          const currentFileName = selectedFilePath?.split('/').pop()?.toLowerCase();
                          if (patchFileName === currentFileName) {
                            setCode(fileContent);
                          }
                        }
                      } else {
                        addLogMessage("warning", `⚠️ Eredeti kód nem található: ${patch.filePath}`);
                      }
                    } catch (err) {
                      addLogMessage("error", `❌ Hiba: ${patch.filePath}`);
                    }
                  }
                  
                  if (appliedCount > 0) {
                    addLogMessage("success", `🎉 ${appliedCount}/${pendingChange.patches.length} módosítás alkalmazva!`);
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
    </div>
  );
};

export default App;
