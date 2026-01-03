// React hook for PL/I WASM syntax highlighting
// Provides easy integration with debouncing and caching

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { PLILexer, Token, TokenType, TOKEN_CSS_CLASS } from './pli-lexer';

// Global lexer instance (shared across all components)
let globalLexer: PLILexer | null = null;
let initPromise: Promise<PLILexer> | null = null;

async function getLexer(): Promise<PLILexer> {
  if (globalLexer) return globalLexer;
  
  if (!initPromise) {
    initPromise = (async () => {
      globalLexer = new PLILexer();
      await globalLexer.init(true); // Use Web Worker
      return globalLexer;
    })();
  }
  
  return initPromise;
}

interface UsePLIHighlighterOptions {
  /** Debounce delay in ms (default: 16ms = 60fps) */
  debounceMs?: number;
  /** Only highlight visible range for large files */
  viewportStart?: number;
  /** Only highlight visible range for large files */
  viewportEnd?: number;
  /** Enable/disable highlighting */
  enabled?: boolean;
}

interface UsePLIHighlighterResult {
  /** Array of tokens */
  tokens: Token[];
  /** Whether tokenization is in progress */
  isLoading: boolean;
  /** Any error that occurred */
  error: Error | null;
  /** Time taken for last tokenization (ms) */
  tokenizeTime: number;
  /** Force re-tokenization */
  refresh: () => void;
}

/**
 * React hook for PL/I syntax highlighting
 * Uses WASM + Web Worker for maximum performance
 */
export function usePLIHighlighter(
  code: string,
  options: UsePLIHighlighterOptions = {}
): UsePLIHighlighterResult {
  const {
    debounceMs = 16,
    viewportStart,
    viewportEnd,
    enabled = true,
  } = options;

  const [tokens, setTokens] = useState<Token[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [tokenizeTime, setTokenizeTime] = useState(0);
  
  const debounceRef = useRef<number | null>(null);
  const versionRef = useRef(0);
  
  const tokenize = useCallback(async (codeToTokenize: string, version: number) => {
    if (!enabled) return;
    
    try {
      setIsLoading(true);
      const lexer = await getLexer();
      
      // Check if this is still the latest request
      if (version !== versionRef.current) return;
      
      const startTime = performance.now();
      
      let result: Token[];
      if (viewportStart !== undefined && viewportEnd !== undefined) {
        // Incremental tokenization for visible range
        const lineStarts = [0];
        for (let i = 0; i < codeToTokenize.length; i++) {
          if (codeToTokenize[i] === '\n') {
            lineStarts.push(i + 1);
          }
        }
        
        const startByte = lineStarts[Math.min(viewportStart, lineStarts.length - 1)] ?? 0;
        const endByte = lineStarts[Math.min(viewportEnd + 1, lineStarts.length - 1)] ?? codeToTokenize.length;
        
        result = await lexer.tokenizeRange(codeToTokenize, startByte, endByte);
      } else {
        result = await lexer.tokenize(codeToTokenize);
      }
      
      const endTime = performance.now();
      
      // Check again if this is still the latest request
      if (version !== versionRef.current) return;
      
      setTokens(result);
      setTokenizeTime(endTime - startTime);
      setError(null);
    } catch (err) {
      if (version === versionRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      if (version === versionRef.current) {
        setIsLoading(false);
      }
    }
  }, [enabled, viewportStart, viewportEnd]);

  useEffect(() => {
    if (!enabled) {
      setTokens([]);
      return;
    }

    // Increment version to cancel any pending requests
    versionRef.current++;
    const currentVersion = versionRef.current;
    
    // Clear previous debounce
    if (debounceRef.current !== null) {
      cancelAnimationFrame(debounceRef.current);
    }
    
    // Debounce using requestAnimationFrame for smooth 60fps
    if (debounceMs <= 16) {
      debounceRef.current = requestAnimationFrame(() => {
        tokenize(code, currentVersion);
      });
    } else {
      // Use setTimeout for longer debounce
      const timeoutId = setTimeout(() => {
        tokenize(code, currentVersion);
      }, debounceMs);
      
      return () => clearTimeout(timeoutId);
    }
    
    return () => {
      if (debounceRef.current !== null) {
        cancelAnimationFrame(debounceRef.current);
      }
    };
  }, [code, debounceMs, enabled, tokenize]);

  const refresh = useCallback(() => {
    versionRef.current++;
    tokenize(code, versionRef.current);
  }, [code, tokenize]);

  return { tokens, isLoading, error, tokenizeTime, refresh };
}

/**
 * Convert tokens to React elements for rendering
 */
export function useTokensToElements(
  tokens: Token[],
  code: string
): React.ReactNode[] {
  return useMemo(() => {
    if (tokens.length === 0) {
      // Return plain text if no tokens
      return [code];
    }
    
    const elements: React.ReactNode[] = [];
    let lastEnd = 0;
    
    tokens.forEach((token, index) => {
      // Add any gap between tokens (shouldn't happen with proper lexer)
      if (token.start > lastEnd) {
        elements.push(code.slice(lastEnd, token.start));
      }
      
      // Add the token
      const className = TOKEN_CSS_CLASS[token.type];
      elements.push(
        <span key={index} className={className}>
          {token.text}
        </span>
      );
      
      lastEnd = token.end;
    });
    
    // Add any remaining text
    if (lastEnd < code.length) {
      elements.push(code.slice(lastEnd));
    }
    
    return elements;
  }, [tokens, code]);
}

/**
 * Simple component for highlighted PL/I code
 */
interface PLICodeProps {
  code: string;
  className?: string;
  style?: React.CSSProperties;
}

export function PLICode({ code, className, style }: PLICodeProps) {
  const { tokens, isLoading } = usePLIHighlighter(code);
  const elements = useTokensToElements(tokens, code);
  
  return (
    <pre className={className} style={style}>
      <code>{elements}</code>
      {isLoading && <span className="pli-loading" />}
    </pre>
  );
}

// Re-export types for convenience
export { Token, TokenType, TOKEN_CSS_CLASS };
