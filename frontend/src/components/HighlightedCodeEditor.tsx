// frontend/src/components/HighlightedCodeEditor.tsx

import React from "react";
import { highlightPLI, type HighlightToken } from "../utils/pliSyntaxHighlighter";

interface HighlightedCodeEditorProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  scrollToLine?: number | null;
  onScroll?: (scrollTop: number) => void;
}

export const HighlightedCodeEditor: React.FC<HighlightedCodeEditorProps> = ({
  value,
  onChange,
  placeholder,
  scrollToLine,
  onScroll,
}) => {
  const gutterRef = React.useRef<HTMLDivElement | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const highlightRef = React.useRef<HTMLDivElement | null>(null);
  
  React.useEffect(() => {
    console.log('[HighlightedCodeEditor] Komponens renderelődött');
  }, []);

  // Sorok tömb és sorszámok
  const lines = React.useMemo(() => value.split("\n"), [value]);
  const lineCount = lines.length;

  // Színezett kód generálása
  const highlightedCode = React.useMemo(() => {
    const tokens = highlightPLI(value);
    console.log(`[HighlightedCodeEditor] ${tokens.length} token generálva`);
    if (tokens.length > 0) {
      const keywordCount = tokens.filter(t => t.type === 'keyword').length;
      const commentCount = tokens.filter(t => t.type === 'comment').length;
      console.log(`[HighlightedCodeEditor] Kulcsszavak: ${keywordCount}, Kommentek: ${commentCount}`);
    }
    return tokens;
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    const { scrollTop, scrollLeft } = e.currentTarget;
    // requestAnimationFrame a smooth scroll szinkronizációhoz (fontos mobilon!)
    requestAnimationFrame(() => {
      if (gutterRef.current) {
        gutterRef.current.scrollTop = scrollTop;
      }
      if (highlightRef.current) {
        highlightRef.current.scrollTop = scrollTop;
        highlightRef.current.scrollLeft = scrollLeft;
      }
    });
    onScroll?.(scrollTop);
  };

  // Scroll adott sorra
  React.useEffect(() => {
    if (scrollToLine && scrollToLine > 0 && textareaRef.current) {
      if (scrollToLine <= lineCount) {
        const lineHeight = 21;
        const charOffset = lines.slice(0, scrollToLine - 1).reduce((sum, line) => sum + line.length + 1, 0);
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
  }, [scrollToLine, value, lineCount, lines]);

  // Sorszámok
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

  // Színezett kód renderelése
  const renderHighlighted = () => {
    if (highlightedCode.length === 0) {
      // Ha nincs token, jelenítsük meg a normál szöveget
      return <span className="pli-token pli-token-normal">{value}</span>;
    }
    
    return highlightedCode.map((token, idx) => {
      const className = `pli-token pli-token-${token.type}`;
      return (
        <span key={idx} className={className}>
          {token.text}
        </span>
      );
    });
  };

  return (
    <div className="code-editor-wrapper highlighted-editor">
      <div className="line-numbers-gutter" ref={gutterRef}>
        {lineNumbers}
      </div>
      <div className="code-editor-content">
        {/* Színezett háttér (csak olvasható) */}
        <div className="code-highlight-overlay" ref={highlightRef}>
          <pre className="code-highlight-pre">
            {renderHighlighted()}
          </pre>
        </div>
        {/* Textarea (átlátszó, csak szöveg) - ugyanaz a pozíció */}
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
    </div>
  );
};
