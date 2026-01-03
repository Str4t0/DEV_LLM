// frontend/src/utils/pliWasmHighlighter.ts
// WASM-alapú PL/I syntax highlighter - MŰKÖDŐ SYNC VERZIÓ

import init, { tokenize_flat, version } from '../pli-lexer-wasm/pkg/pli_lexer_wasm.js';

// Token interfész (kompatibilis a régi highlightPLI-vel)
export interface HighlightToken {
  text: string;
  type: 'keyword' | 'string' | 'comment' | 'number' | 'operator' | 'preprocessor' | 'builtin' | 'identifier' | 'punctuation' | 'whitespace' | 'newline' | 'normal';
}

// Token type mapping (Rust enum -> CSS class name)
const TOKEN_TYPE_MAP: Record<number, HighlightToken['type']> = {
  0: 'keyword',      // TokenType::Keyword
  1: 'string',       // TokenType::String
  2: 'comment',      // TokenType::Comment
  3: 'number',       // TokenType::Number
  4: 'operator',     // TokenType::Operator
  5: 'preprocessor', // TokenType::Preprocessor
  6: 'builtin',      // TokenType::Builtin
  7: 'normal',       // TokenType::Identifier
  8: 'normal',       // TokenType::Punctuation
  9: 'normal',       // TokenType::Whitespace
  10: 'normal',      // TokenType::Newline
  11: 'normal',      // TokenType::Unknown
};

// WASM inicializálás állapota
let wasmInitialized = false;
let wasmInitPromise: Promise<void> | null = null;

/**
 * WASM modul inicializálása (egyszer kell meghívni)
 */
export async function initWasm(): Promise<void> {
  if (wasmInitialized) return;
  
  if (wasmInitPromise) {
    return wasmInitPromise;
  }
  
  wasmInitPromise = (async () => {
    try {
      await init();
      wasmInitialized = true;
      console.log(`[WASM] PL/I Lexer initialized, version: ${version()}`);
    } catch (error) {
      console.error('[WASM] Failed to initialize:', error);
      throw error;
    }
  })();
  
  return wasmInitPromise;
}

/**
 * WASM-alapú PL/I highlighting - SYNC VERZIÓ
 * Ez a függvény TÉNYLEGESEN VISSZAADJA a tokeneket!
 */
export function highlightPLIWasm(code: string): HighlightToken[] {
  // Ha nincs inicializálva, üres tömb
  if (!wasmInitialized) {
    console.warn('[WASM] Not initialized yet, returning empty tokens');
    return [];
  }
  
  // Ha nincs kód, üres tömb
  if (!code || code.length === 0) {
    return [];
  }
  
  const startTime = performance.now();
  
  try {
    // WASM tokenizálás - flat array: [type, start, end, type, start, end, ...]
    const flat = tokenize_flat(code);
    
    // Konvertálás HighlightToken tömbbé
    const tokens: HighlightToken[] = [];
    for (let i = 0; i < flat.length; i += 3) {
      const typeNum = flat[i];
      const start = flat[i + 1];
      const end = flat[i + 2];
      const text = code.slice(start, end);
      
      tokens.push({
        text,
        type: TOKEN_TYPE_MAP[typeNum] || 'normal',
      });
    }
    
    const duration = performance.now() - startTime;
    if (duration > 1) {
      console.log(`[WASM] Tokenized ${code.split('\n').length} lines in ${duration.toFixed(2)}ms`);
    }
    
    return tokens;
    
  } catch (error) {
    console.error('[WASM] Tokenization error:', error);
    return [];
  }
}

/**
 * Ellenőrzi hogy a WASM inicializálva van-e
 */
export function isWasmReady(): boolean {
  return wasmInitialized;
}
